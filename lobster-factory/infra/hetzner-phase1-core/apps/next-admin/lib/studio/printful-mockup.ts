/**
 * Printful Mockup Generator — uploads design to R2, then composites it onto
 * product photos via the Printful Mockup Generator API.
 *
 * Flow: base64 dataURL → R2 upload (public URL) → Printful mockup-generator
 *       → poll until completed → return ALL mockup styles (Printful CDN JPEGs).
 *
 * Every mockup is FAITHFUL: Printful places the artist's real uploaded file onto a
 * real garment photo — it never reinterprets the design (unlike AI redraw). The DEFAULT
 * front view (with the design) comes back as `mockup_url`; additional requested option_groups
 * come back in `extra[]`. Live-probed 2026-06-21 (Gildan 2400 / product 57): `mockup_url` = the
 * FRONT with the design; requesting group "Men's" adds real-model shots (Left / Right / Left Front /
 * Right Front / Back); the misnamed "Men's Lifestyle" returns nothing. The one-click flow uses the
 * clean straight FRONT as each colour's variation image (see rankView); the model shots are available
 * in mockups[] for the manual Studio picker.
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

// Mockup style groups to request. Printful returns whatever's valid for the product and silently ignores
// the rest. CORRECTED 2026-06-21 (live probe, product 57): the real model-shot group is "Men's"/"Women's"
// — the previously-used "Men's Lifestyle"/"…Lifestyle" names are IGNORED by Printful (they returned NO
// model shots). With "Men's", product 57 returns Left/Right/Left Front/Right Front/Back model views.
// rankView keeps a clean straight FRONT as each colour's variation image; the model shots populate
// mockups[] for the manual Studio picker. Requesting an unsupported group is harmless.
const MOCKUP_OPTION_GROUPS = [
  "Flat",      // clean flat-lay front (+ blank back); the straight front is the per-colour variation image
  "Men's",     // real-model shots — live-verified group name 2026-06-21 (NOT "Men's Lifestyle")
  "Women's",
  "Ghost",
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

const LIFESTYLE_GROUP_RE = /\b(lifestyle|couple|kids|women|men)\b/i;

/** Order: real-model lifestyle first (hero shots), then flat, then ghost. */
function rankGroup(group: string): number {
  if (LIFESTYLE_GROUP_RE.test(group)) return 0;
  if (/flat/i.test(group)) return 1;
  return 2;
}

const BACK_VIEW_RE = /back/i;
const SIDE_VIEW_RE = /^(left|right)$/i;
const FRONT_VIEW_RE = /^front$/i;
/** Sort key for the MAIN / per-colour variation image. A front-only print shows the design best
 *  STRAIGHT-ON, so a plain "Front" wins; angled fronts (Left/Right Front — incl. real-model shots,
 *  group "Men's") come next, lifestyle preferred over flat there; pure side views (design edge-on)
 *  after; and a BACK view (blank for a front print) ALWAYS last. The back rule is the 2026-06-21
 *  blank-shirt fix: a "Flat / Back" must never be picked as the main/variation image. (Live-probed:
 *  product 57 + "Men's" yields Left/Right/Left Front/Right Front/Back — none is a straight front, so
 *  the clean Flat/Front correctly wins as each colour's variation image.) */
function rankView(v: { group: string; view: string }): number {
  if (BACK_VIEW_RE.test(v.view)) return 300;                  // blank back → always last
  if (SIDE_VIEW_RE.test(v.view)) return 200;                  // pure side → design edge-on
  if (FRONT_VIEW_RE.test(v.view)) return 0;                   // straight front → clearest design
  return 100 + rankGroup(v.group);                            // angled front: real-model over flat
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
  designSizePct?: number,
): { area_width: number; area_height: number; width: number; height: number; top: number; left: number } {
  const aw = cfg.area_width;
  const ah = cfg.area_height;
  // Fit the design into the print area preserving its TRUE aspect ratio, then centre it.
  // designSizePct=1.0 → full-bleed (fills entire printable area); default 0.9 → 90% with small margin.
  const FILL = Math.min(1, Math.max(0.3, designSizePct ?? 0.9));
  const maxW = aw * FILL;
  const maxH = ah * FILL;
  const imgW = imageDims && imageDims.width > 0 ? imageDims.width : cfg.design_width;
  const imgH = imageDims && imageDims.height > 0 ? imageDims.height : cfg.design_height;
  let designW = maxW;
  let designH = (maxW * imgH) / imgW;
  if (designH > maxH) {
    designH = maxH;
    designW = (maxH * imgW) / imgH;
  }
  designW = Math.max(1, Math.round(designW));
  designH = Math.max(1, Math.round(designH));
  const top = Math.round((ah - designH) / 2);
  const left = Math.round((aw - designW) / 2);
  return { area_width: aw, area_height: ah, width: designW, height: designH, top, left };
}

/** Compute print-position for a dynamic (catalog) product spec. */
function computeDynamicPosition(
  spec: DynamicProductSpec,
  imageDims?: { width: number; height: number },
): { area_width: number; area_height: number; width: number; height: number; top: number; left: number } {
  const aw = spec.areaWidth;
  const ah = spec.areaHeight;
  // designSizePct = fraction of the print area the design fills (default 0.85). Fit preserving the
  // true aspect ratio, then centre — same fix as computePosition (no fixed top margin shrinking
  // tall art, no square fallback squish when dims are present) — 2026-06-20.
  const fill = Math.min(1, Math.max(0.3, spec.designSizePct ?? 0.85));
  const maxW = aw * fill;
  const maxH = ah * fill;
  let designW: number;
  let designH: number;
  if (imageDims && imageDims.width > 0 && imageDims.height > 0) {
    designW = maxW;
    designH = (maxW * imageDims.height) / imageDims.width;
    if (designH > maxH) {
      designH = maxH;
      designW = (maxH * imageDims.width) / imageDims.height;
    }
  } else {
    const side = Math.min(maxW, maxH);
    designW = side;
    designH = side; // square fallback only when dims unknown
  }
  designW = Math.max(1, Math.round(designW));
  designH = Math.max(1, Math.round(designH));
  const top = Math.round((ah - designH) / 2);
  const left = Math.round((aw - designW) / 2);
  return { area_width: aw, area_height: ah, width: designW, height: designH, top, left };
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
  designSizePct?: number,
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
        // `mockup_url` is Printful's DEFAULT view = the FRONT, with the design on it. `extra[]` holds
        // the additional requested option_groups — which (live-probed 2026-06-21, product 57) can be
        // JUST a blank "Flat / Back". PRIOR BUG: a non-empty extra[] DROPPED the primary front, leaving
        // the blank back as the only candidate → it became mockup_url (the "blank shirt"). Fix: ALWAYS
        // include the primary front, add the labelled extras, then rank BACK views last (see rankView)
        // so the design-bearing front — or a real-model lifestyle shot — always wins as the main image.
        // ASSUMES front-placement print (all current pod-catalog-config products). The primary's group/
        // lifestyle flag here are SYNTHETIC ("Flat"/"Front") — correct for these flat-front products, but a
        // back-placement or lifestyle-primary product would mislabel it and could bury the real design.
        // TODO(back-placement): make rankView placement-aware before adding a back/all-over product.
        const primary = m.mockup_url as string | undefined;
        const extra = (m.extra as Array<Record<string, unknown>> | undefined) ?? [];
        const candidates: { url?: string; group: string; view: string }[] = [];
        if (primary) candidates.push({ url: primary, group: "Flat", view: "Front" });
        for (const e of extra) {
          candidates.push({
            url: e.url as string | undefined,
            group: (e.option_group as string | undefined) ?? "Flat",
            view: (e.option as string | undefined) ?? (e.title as string | undefined) ?? "",
          });
        }
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
      // Explicit insertion-order tie-break (do NOT lean on sort stability): the primary front is pushed
      // FIRST, so among equal-rank "Front" views it always wins → mockup_url = the canonical design-bearing
      // front, independent of the JS engine's sort implementation.
      const order = new Map(views.map((v, i) => [v, i] as const));
      views.sort((a, b) => rankView(a) - rankView(b) || (order.get(a)! - order.get(b)!));
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
        // See generateMockup: include the primary FRONT (design-bearing), add labelled extras, rank
        // BACK views last — a blank "Flat / Back" must never become mockup_url (2026-06-21 blank-shirt fix).
        const primary = m.mockup_url as string | undefined;
        const extra = (m.extra as Array<Record<string, unknown>> | undefined) ?? [];
        const candidates: { url?: string; group: string; view: string }[] = [];
        if (primary) candidates.push({ url: primary, group: "Flat", view: "Front" });
        for (const e of extra) {
          candidates.push({
            url: e.url as string | undefined,
            group: (e.option_group as string | undefined) ?? "Flat",
            view: (e.option as string | undefined) ?? (e.title as string | undefined) ?? "",
          });
        }
        for (const c of candidates) {
          if (!c.url || seen.has(c.url)) continue;
          seen.add(c.url);
          views.push({ url: c.url, group: c.group, view: c.view, label: c.view ? `${c.group} · ${c.view}` : c.group, lifestyle: LIFESTYLE_GROUP_RE.test(c.group) });
        }
      }
      if (views.length === 0) return { ok: false, error: "printful_no_mockup_url" };
      // Explicit insertion-order tie-break (do NOT lean on sort stability): the primary front is pushed
      // FIRST, so among equal-rank "Front" views it always wins → mockup_url = the canonical design-bearing
      // front, independent of the JS engine's sort implementation.
      const order = new Map(views.map((v, i) => [v, i] as const));
      views.sort((a, b) => rankView(a) - rankView(b) || (order.get(a)! - order.get(b)!));
      return { ok: true, mockup_url: views[0].url, mockups: views };
    }
    if (status === "failed") return { ok: false, error: "printful_mockup_failed" };
  }
  return { ok: false, error: "printful_mockup_timeout" };
}
