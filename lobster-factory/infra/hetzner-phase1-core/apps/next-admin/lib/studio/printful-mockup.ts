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
} as const;

type ProductType = keyof typeof PRODUCT_CONFIG;

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

/** Generate a product mockup using the Printful Mockup Generator. */
export async function generateMockup(
  imageDataUrl: string,
  productType: string = "tshirt",
): Promise<MockupResult> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!apiKey) return { ok: false, error: "missing_printful_key" };
  if (!storeId) return { ok: false, error: "missing_printful_store_id" };

  if (!(productType in PRODUCT_CONFIG)) {
    return { ok: false, error: `unsupported_product_type_${productType}` };
  }
  const cfg = PRODUCT_CONFIG[productType as ProductType];

  // ── Step 1: parse base64 and upload to R2 ──────────────────────────────────
  const parsed = parseImageDataUrl(imageDataUrl);
  if (!parsed) return { ok: false, error: "image_parse_failed" };

  const objectKey = buildDesignKey(parsed.mime);
  if (!objectKey) return { ok: false, error: "unsupported_image_mime" };

  const r2 = await putDesignObject(objectKey, parsed.buffer, parsed.mime);
  if (!r2.ok) return { ok: false, error: `r2_upload_failed: ${(r2 as { ok: false; error: string }).error}` };
  const imageUrl = r2.publicUrl;

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
            position: {
              area_width: cfg.area_width,
              area_height: cfg.area_height,
              width: cfg.design_width,
              height: cfg.design_height,
              top: cfg.top,
              left: cfg.left,
            },
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
        `${PRINTFUL_API}/mockup-generator/task?task_key=${taskKey}`,
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
        // The primary url is the default front view; the labelled variants live in extra[].
        const extra = (m.extra as Array<Record<string, unknown>> | undefined) ?? [];
        const candidates: { url?: string; group: string; view: string }[] = [
          ...(primary ? [{ url: primary, group: "Flat", view: "Front" }] : []),
          ...extra.map((e) => ({
            url: e.url as string | undefined,
            group: (e.option_group as string | undefined) ?? "Flat",
            view: (e.option as string | undefined) ?? (e.title as string | undefined) ?? "",
          })),
        ];
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
