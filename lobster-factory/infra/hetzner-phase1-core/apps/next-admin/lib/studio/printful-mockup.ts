/**
 * Printful Mockup Generator — uploads design to Printful file library then
 * calls the mockup generator to composite it onto a product photo.
 *
 * Flow: base64 dataURL → Printful /files upload → Printful /mockup-generator
 *       → poll until completed → return mockup_url (CDN JPEG)
 *
 * Only PRINTFUL_API_KEY + PRINTFUL_STORE_ID needed (same token for both calls).
 */

const PRINTFUL_API = "https://api.printful.com";
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;

// Per-product Printful config. Extend as new products are supported.
const PRODUCT_CONFIG = {
  tshirt: {
    product_id: 71,    // Bella + Canvas 3001 Unisex Staple T-Shirt
    variant_id: 4012,  // White / M
    placement: "front" as const,
    // Printfile 1 = 1800×2400 @ 150DPI (the standard front print area)
    area_width: 1800,
    area_height: 2400,
    design_width: 1440,
    design_height: 1440,
    top: 480,          // vertical center of printable chest area
    left: 180,         // horizontal center: (1800 - 1440) / 2
  },
} as const;

type ProductType = keyof typeof PRODUCT_CONFIG;

export type MockupResult =
  | { ok: true; mockup_url: string }
  | { ok: false; error: string };

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Upload a base64 data URL to Printful file library and return the CDN URL. */
async function uploadFileToPrintful(
  imageDataUrl: string,
  apiKey: string,
  storeId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${PRINTFUL_API}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-PF-Store-Id": storeId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "default",
        data_url: imageDataUrl,
        filename: "design.png",
      }),
    });
  } catch {
    return { ok: false, error: "printful_upload_network_error" };
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "printful_upload_bad_json" };
  }

  if (!res.ok || (json.code as number) >= 400) {
    const msg = (json.result as string) ?? (json.error as { message?: string })?.message ?? "upload_failed";
    return { ok: false, error: `printful_upload_${res.status}: ${msg}`.slice(0, 200) };
  }

  const url = (json.result as Record<string, unknown>)?.url as string | undefined;
  if (!url) return { ok: false, error: "printful_upload_no_url" };
  return { ok: true, url };
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

  // ── Step 1: upload design to Printful file library ─────────────────────────
  const upload = await uploadFileToPrintful(imageDataUrl, apiKey, storeId);
  if (!upload.ok) return { ok: false as const, error: (upload as { ok: false; error: string }).error };
  const fileUrl = upload.url;

  // ── Step 2: create mockup task ─────────────────────────────────────────────
  let taskRes: Response;
  try {
    taskRes = await fetch(`${PRINTFUL_API}/mockup-generator/create-task/${cfg.product_id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-PF-Store-Id": storeId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variant_ids: [cfg.variant_id],
        files: [
          {
            placement: cfg.placement,
            image_url: fileUrl,
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
  } catch {
    return { ok: false, error: "printful_task_network_error" };
  }

  let taskJson: Record<string, unknown>;
  try {
    taskJson = (await taskRes.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "printful_task_bad_json" };
  }

  if (!taskRes.ok || (taskJson.code as number) >= 400) {
    const msg = (taskJson.result as string) ?? "task_create_failed";
    return { ok: false, error: `printful_task_${taskRes.status}: ${msg}`.slice(0, 200) };
  }

  const taskKey = (taskJson.result as Record<string, unknown>)?.task_key as string | undefined;
  if (!taskKey) return { ok: false, error: "printful_task_no_key" };

  // ── Step 3: poll until completed ───────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let pollRes: Response;
    try {
      pollRes = await fetch(
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
      const mockups = result?.mockups as Array<Record<string, unknown>> | undefined;
      const mockupUrl = mockups?.[0]?.mockup_url as string | undefined;
      if (!mockupUrl) return { ok: false, error: "printful_no_mockup_url" };
      return { ok: true, mockup_url: mockupUrl };
    }

    if (status === "failed") {
      return { ok: false, error: "printful_mockup_failed" };
    }
    // status === "pending" | "processing" → keep polling
  }

  return { ok: false, error: "printful_mockup_timeout" };
}
