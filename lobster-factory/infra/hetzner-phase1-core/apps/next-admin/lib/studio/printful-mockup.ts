/**
 * Printful Mockup Generator — uploads design to R2, then composites it onto
 * product photos via the Printful Mockup Generator API.
 *
 * Flow: base64 dataURL → R2 upload (public URL) → Printful mockup-generator
 *       → poll until completed → return ALL mockup styles (Printful CDN JPEGs).
 *
 * Every mockup is FAITHFUL: Printful places the artist's real uploaded file onto a
 * real garment photo — it never reinterprets the design (unlike AI redraw). The
 * styles come back via the task's `extra[]` array. We request the lifestyle/model
 * groups explicitly so real-model shots are included (live-verified 2026-06-15:
 * option_groups ["Men's Lifestyle", …] → extra[] gains "Men's Lifestyle / Front|Back").
 *
 * Requires: PRINTFUL_API_KEY, PRINTFUL_STORE_ID, R2_* (existing designs bucket).
 * The Printful Mockup API needs a publicly reachable URL; R2 is the same bucket
 * used by `saveToDesigns` — no new infrastructure needed.
 */

import {
  parseImageDataUrl,
  buildDesignKey,
  putDesignObject,
} from "../storage/r2";

const PRINTFUL_API = "https://api.printful.com";
const FETCH_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;

// Per-product Printful config. Extend as new products are supported.
const PRODUCT_CONFIG = {
  tshirt: {
    product_id: 71,    // Bella + Canvas 3001 Unisex Staple T-Shirt
    variant_id: 4012,  // White / M
    placement: "front" as const,
    // Printfile 1 = 1800×2400 @ 150DPI (standard front print area)
    area_width: 1800,
    area_height: 2400,
    design_width: 1440,
    design_height: 1440,
    top: 480,          // vertical center of printable chest area
    left: 180,         // horizontal center: (1800 - 1440) / 2
  },
  hoodie: {
    product_id: 2,       // Gildan 18500 Heavy Blend Hoodie
    variant_id: 1534,    // White / S
    placement: "front" as const,
    area_width: 1800,
    area_height: 2400,
    design_width: 1440,
    design_height: 1440,
    top: 480,
    left: 180,
  },
  mug: {
    product_id: 19,      // 11oz Mug (Orca Coating)
    variant_id: 1321,    // White
    placement: "default" as const,
    area_width: 3600,
    area_height: 1350,
    design_width: 2880,
    design_height: 1080,
    top: 135,
    left: 360,
  },
  tote: {
    product_id: 6,       // Tote Bag
    variant_id: 225,     // Natural
    placement: "front" as const,
    area_width: 1800,
    area_height: 1800,
    design_width: 1440,
    design_height: 1440,
    top: 180,
    left: 180,
  },
} as const;

export type ProductType = keyof typeof PRODUCT_CONFIG;
/** Single source of truth for supported product keys — consumed by the mockup API route. */
export const SUPPORTED_PRODUCT_TYPES = Object.keys(PRODUCT_CONFIG) as ProductType[];

/** Dynamic product spec from catalog (not in PRODUCT_CONFIG). */
export interface DynamicProductSpec {
  productId: number;
  variantId: number;
  placement: string;
  areaWidth: number;
  areaHeight: number;
  /** Design width as fraction of area (default 0.8). */
  designSizePct?: number;
}

// Mockup style groups to request. Printful returns whatever's valid for the product
// and silently ignores unknown groups (live-verified 2026-06-15). "Flat"/"Ghost" are
// clean product shots; the "*Lifestyle"/"Couple's"/"Kids" groups are real-model photos.
const MOCKUP_OPTION_GROUPS = [
  "Flat",
  "Ghost",
  "Men's Lifestyle",
  "Women's Lifestyle",
  "Couple's",
  "Kids",
  "Lifestyle",
];

/** One generated mockup view. `url` is a Printful CDN JPEG; every one is faithful. */
export interface MockupView {
  url: string;
  /** e.g. "Men's Lifestyle · Front" — group + view for the picker. */
  label: string;
  group: string;
  view: string;
  /** true when this is a real-model lifestyle shot (vs flat/ghost product shot). */
  lifestyle: boolean;
}

export type MockupResult =
  // mockup_url kept for backward-compat (= the first/primary view).
  | { ok: true; mockup_url: string; mockups: MockupView[] }
  | { ok: false; error: string };

const LIFESTYLE_GROUP_RE = /lifestyle|couple|kids|women|men/i;

/** Order: real-model lifestyle first (hero shots), then flat, then ghost. */
function rankGroup(group: string): number {
  if (LIFESTYLE_GROUP_RE.test(group)) return 0;
  if (/flat/i.test(group)) return 1;
  return 2;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// R2 public origins we trust as already-uploaded design URLs.
// Printful can fetch these directly — no re-upload needed.
const R2_PUBLIC_HOSTS = new Set([
  "pub-a88b06f569bd41a3b9e27e29644d520e.r2.dev",
]);
function isKnownR2Url(s: string): boolean {
  try { return R2_PUBLIC_HOSTS.has(new URL(s).hostname); } catch { return false; }
}

/** Compute print-position preserving the image's true aspect ratio within the product's printable area. */
function computePosition(
  cfg: (typeof PRODUCT_CONFIG)[ProductType],
  imageDims?: { width: number; height: number },
): { area_width: number; area_height: number; width: number; height: number; top: number; left: number } {
  if (!imageDims || imageDims.width <= 0 || imageDims.height <= 0) {
    return { area_width: cfg.area_width, area_height: cfg.area_height, width: cfg.design_width, height: cfg.design_height, top: cfg.top, left: cfg.left };
  }
  const { width: imgW, height: imgH } = imageDims;
  const maxW: number = cfg.design_width;
  let designW: number = maxW;
  let designH: number = Math.round((maxW * imgH) / imgW);
  const availableH: number = cfg.area_height - cfg.top * 2;
  if (designH > availableH) {
    designH = availableH;
    designW = Math.round((availableH * imgW) / imgH);
  }
  const left = Math.round((cfg.area_width - designW) / 2);
  return { area_width: cfg.area_width, area_height: cfg.area_height, width: designW, height: designH, top: cfg.top, left };
}

/** Compute print-position for a dynamic (catalog) product spec. */
function computeDynamicPosition(
  spec: DynamicProductSpec,
  imageDims?: { width: number; height: number },
): { area_width: number; area_height: number; width: number; height: number; top: number; left: number } {
  const sizePct = Math.min(1, Math.max(0.3, spec.designSizePct ?? 0.8));
  const maxW = Math.round(spec.areaWidth * sizePct);
  const topMargin = Math.round(spec.areaHeight * 0.15);
  const availH = spec.areaHeight - topMargin * 2;

  let designW: number;
  let designH: number;
  if (imageDims && imageDims.width > 0 && imageDims.height > 0) {
    designW = maxW;
    designH = Math.round((maxW * imageDims.height) / imageDims.width);
    if (designH > availH) {
      designH = availH;
      designW = Math.round((availH * imageDims.width) / imageDims.height);
    }
  } else {
    designW = maxW;
    designH = maxW; // square fallback
  }

  const left = Math.round((spec.areaWidth - designW) / 2);
  return { area_width: spec.areaWidth, area_height: spec.areaHeight, width: designW, height: designH, top: topMargin, left };
}

/**
 * Generate a product mockup using the Printful Mockup Generator.
 *
 * `imageInput` accepts:
 *  - base64 data URL  → parsed and re-uploaded to R2 (original behaviour)
 *  - https:// R2 URL  → used directly; skips re-upload (avoids browser CORS round-trip)
 *
 * `imageDims` — caller-supplied natural dimensions so Printful receives the correct
 *  aspect-ratio position rather than the default hardcoded square.
 */
export async function generateMockup(
  imageInput: string,
  productType: string = "tshirt",
  imageDims?: { width: number; height: number },
): Promise<MockupResult> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!apiKey) return { ok: false, error: "missing_printful_key" };
  if (!storeId) return { ok: false, error: "missing_printful_store_id" };

  if (!(productType in PRODUCT_CONFIG)) {
    return { ok: false, error: `unsupported_product_type_${productType}` };
  }
  const cfg = PRODUCT_CONFIG[productType as ProductType];

  // ── Step 1: resolve image URL for Printful ────────────────────────────────
  // If the caller already has a publicly reachable R2 URL, skip re-upload.
  let imageUrl: string;
  if (isKnownR2Url(imageInput)) {
    imageUrl = imageInput;
  } else {
    // base64 data URL → parse → upload to R2
    const parsed = parseImageDataUrl(imageInput);
    if (!parsed) return { ok: false, error: "image_parse_failed" };

    const objectKey = buildDesignKey(parsed.mime);
    if (!objectKey) return { ok: false, error: "unsupported_image_mime" };

    const r2 = await putDesignObject(objectKey, parsed.buffer, parsed.mime);
    if (!r2.ok) return { ok: false, error: `r2_upload_failed: ${(r2 as { ok: false; error: string }).error}` };
    imageUrl = r2.publicUrl;
  }

  // ── Step 2: create mockup task ─────────────────────────────────────────────
  let taskRes: Response;
  try {
    taskRes = await timedFetch(`${PRINTFUL_API}/mockup-generator/create-task/${cfg.product_id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-PF-Store-Id": storeId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variant_ids: [cfg.variant_id],
        option_groups: MOCKUP_OPTION_GROUPS,
        files: [
          {
            placement: cfg.placement,
            image_url: imageUrl,
            position: computePosition(cfg, imageDims),
          },
        ],
        format: "jpg",
      }),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "printful_task_timeout" : "printful_task_network_error" };
  }

  let taskJson: Record<string, unknown>;
  try {
    taskJson = (await taskRes.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "printful_task_bad_json" };
  }

  const taskCode = taskJson.code as number | undefined;
  if (!taskRes.ok || (taskCode !== undefined && taskCode >= 400)) {
    const msg = (taskJson.error as { message?: string } | undefined)?.message ?? `task_create_${taskRes.status}`;
    return { ok: false, error: msg.slice(0, 200) };
  }

  const taskKey = (taskJson.result as Record<string, unknown> | undefined)?.task_key as string | undefined;
  if (!taskKey) return { ok: false, error: "printful_task_no_key" };

  // ── Step 3: poll until completed ───────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let pollRes: Response;
    try {
      pollRes = await timedFetch(
        `${PRINTFUL_API}/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-PF-Store-Id": storeId,
          },
        },
      );
    } catch {
      return { ok: false, error: "printful_poll_network_error" };
    }

    let pollJson: Record<string, unknown>;
    try {
      pollJson = (await pollRes.json()) as Record<string, unknown>;
    } catch {
      continue;
    }

    const result = pollJson.result as Record<string, unknown> | undefined;
    const status = result?.status as string | undefined;

    if (status === "completed") {
      const rawMockups = (result?.mockups as Array<Record<string, unknown>> | undefined) ?? [];
      const views: MockupView[] = [];
      const seen = new Set<string>();
      for (const m of rawMockups) {
        const primary = m.mockup_url as string | undefined;
        // The labelled variants (incl. their true group: Flat/Ghost/Lifestyle) live in extra[].
        // Prefer those — never assume the primary's group (it could be a lifestyle render).
        // Fall back to the primary only when extra[] is absent (defensive — every observed
        // response includes the front view in extra, so the primary is normally a dup of it).
        const extra = (m.extra as Array<Record<string, unknown>> | undefined) ?? [];
        const labeled = extra.map((e) => ({
          url: e.url as string | undefined,
          group: (e.option_group as string | undefined) ?? "Flat",
          view: (e.option as string | undefined) ?? (e.title as string | undefined) ?? "",
        }));
        const candidates: { url?: string; group: string; view: string }[] =
          labeled.length > 0 ? labeled : primary ? [{ url: primary, group: "Product", view: "Front" }] : [];
        for (const c of candidates) {
          if (!c.url || seen.has(c.url)) continue;
          seen.add(c.url);
          views.push({
            url: c.url,
            group: c.group,
            view: c.view,
            label: c.view ? `${c.group} · ${c.view}` : c.group,
            lifestyle: LIFESTYLE_GROUP_RE.test(c.group),
          });
        }
      }
      if (views.length === 0) return { ok: false, error: "printful_no_mockup_url" };
      views.sort((a, b) => rankGroup(a.group) - rankGroup(b.group));
      return { ok: true, mockup_url: views[0].url, mockups: views };
    }

    if (status === "failed") {
      return { ok: false, error: "printful_mockup_failed" };
    }
    // status === "pending" | "processing" → keep polling
  }

  return { ok: false, error: "printful_mockup_timeout" };
}

/**
 * Same as generateMockup but accepts a dynamic product spec from the Printful catalog
 * instead of a hardcoded PRODUCT_CONFIG key. Used when the user picks any catalog product.
 */
export async function generateMockupBySpec(
  imageInput: string,
  spec: DynamicProductSpec,
  imageDims?: { width: number; height: number },
): Promise<MockupResult> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!apiKey) return { ok: false, error: "missing_printful_key" };
  if (!storeId) return { ok: false, error: "missing_printful_store_id" };

  let imageUrl: string;
  if (isKnownR2Url(imageInput)) {
    imageUrl = imageInput;
  } else {
    const parsed = parseImageDataUrl(imageInput);
    if (!parsed) return { ok: false, error: "image_parse_failed" };
    const objectKey = buildDesignKey(parsed.mime);
    if (!objectKey) return { ok: false, error: "unsupported_image_mime" };
    const r2 = await putDesignObject(objectKey, parsed.buffer, parsed.mime);
    if (!r2.ok) return { ok: false, error: `r2_upload_failed: ${(r2 as { ok: false; error: string }).error}` };
    imageUrl = r2.publicUrl;
  }

  let taskRes: Response;
  try {
    taskRes = await timedFetch(`${PRINTFUL_API}/mockup-generator/create-task/${spec.productId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-PF-Store-Id": storeId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variant_ids: [spec.variantId],
        option_groups: MOCKUP_OPTION_GROUPS,
        files: [
          {
            placement: spec.placement,
            image_url: imageUrl,
            position: computeDynamicPosition(spec, imageDims),
          },
        ],
        format: "jpg",
      }),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "printful_task_timeout" : "printful_task_network_error" };
  }

  let taskJson: Record<string, unknown>;
  try {
    taskJson = (await taskRes.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "printful_task_bad_json" };
  }

  const taskCode = taskJson.code as number | undefined;
  if (!taskRes.ok || (taskCode !== undefined && taskCode >= 400)) {
    const msg = (taskJson.error as { message?: string } | undefined)?.message ?? `task_create_${taskRes.status}`;
    return { ok: false, error: msg.slice(0, 200) };
  }

  const taskKey = (taskJson.result as Record<string, unknown> | undefined)?.task_key as string | undefined;
  if (!taskKey) return { ok: false, error: "printful_task_no_key" };

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let pollRes: Response;
    try {
      pollRes = await timedFetch(
        `${PRINTFUL_API}/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`,
        { headers: { Authorization: `Bearer ${apiKey}`, "X-PF-Store-Id": storeId } },
      );
    } catch {
      return { ok: false, error: "printful_poll_network_error" };
    }
    let pollJson: Record<string, unknown>;
    try { pollJson = (await pollRes.json()) as Record<string, unknown>; } catch { continue; }

    const result = pollJson.result as Record<string, unknown> | undefined;
    const status = result?.status as string | undefined;

    if (status === "completed") {
      const rawMockups = (result?.mockups as Array<Record<string, unknown>> | undefined) ?? [];
      const views: MockupView[] = [];
      const seen = new Set<string>();
      for (const m of rawMockups) {
        const primary = m.mockup_url as string | undefined;
        const extra = (m.extra as Array<Record<string, unknown>> | undefined) ?? [];
        const labeled = extra.map((e) => ({
          url: e.url as string | undefined,
          group: (e.option_group as string | undefined) ?? "Flat",
          view: (e.option as string | undefined) ?? (e.title as string | undefined) ?? "",
        }));
        const candidates = labeled.length > 0 ? labeled : primary ? [{ url: primary, group: "Product", view: "Front" }] : [];
        for (const c of candidates) {
          if (!c.url || seen.has(c.url)) continue;
          seen.add(c.url);
          views.push({ url: c.url, group: c.group, view: c.view, label: c.view ? `${c.group} · ${c.view}` : c.group, lifestyle: LIFESTYLE_GROUP_RE.test(c.group) });
        }
      }
      if (views.length === 0) return { ok: false, error: "printful_no_mockup_url" };
      views.sort((a, b) => rankGroup(a.group) - rankGroup(b.group));
      return { ok: true, mockup_url: views[0].url, mockups: views };
    }
    if (status === "failed") return { ok: false, error: "printful_mockup_failed" };
  }
  return { ok: false, error: "printful_mockup_timeout" };
}
