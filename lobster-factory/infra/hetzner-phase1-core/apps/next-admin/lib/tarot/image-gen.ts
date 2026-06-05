// Server-side image generation for the tarot print-file tool.
// Two providers (both keys already in app env):
//   - flux   → Replicate black-forest-labs/flux-dev (text2img + img2img/style ref via `image`)
//   - openai → OpenAI gpt-image-1 (generations, or edits when a reference image is supplied)
// Returns a uniform `data:image/png;base64,...` URL so the client treats both the same.
// Mirrors the AbortController + timeout + key-check discipline of lib/onboarding/spec-generator.ts.

const GEN_TIMEOUT_MS = 58_000; // stay under the 60s nginx/route ceiling
const FLUX_MODEL = "black-forest-labs/flux-dev";
const REPLICATE_POLL_MS = 2_500;

export type TarotProvider = "flux" | "openai";

export interface TarotGenParams {
  provider: TarotProvider;
  prompt: string;
  /** data: URL of a reference image (enables img2img / style transfer). */
  referenceImage?: string | null;
  /** Reproducibility seed (FLUX only; ignored by gpt-image-1). */
  seed?: number | null;
}

export type TarotGenResult =
  | { ok: true; image: string; seed: number | null }
  | { ok: false; error: string };

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(.+?);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

async function urlToDataUrl(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch_output_failed_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ── FLUX (Replicate) ──────────────────────────────────────────────────────────
async function generateFlux(params: TarotGenParams, signal: AbortSignal): Promise<TarotGenResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate_api_token" };

  const seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: "2:3",
    output_format: "png",
    num_outputs: 1,
    seed,
  };
  if (params.referenceImage) {
    input.image = params.referenceImage; // img2img / style reference
    input.prompt_strength = 0.82; // keep some of the reference, follow the prompt
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "wait", // block up to ~60s for the result instead of returning immediately
  };

  const createRes = await fetch(`https://api.replicate.com/v1/models/${FLUX_MODEL}/predictions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    signal,
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    return { ok: false, error: `replicate_${createRes.status}: ${detail.slice(0, 300)}` };
  }

  let prediction = (await createRes.json()) as {
    status: string;
    output?: string[] | string;
    error?: string;
    urls?: { get?: string };
  };

  // Prefer:wait usually returns succeeded; poll the get URL if it is still running.
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (!prediction.urls?.get) break;
    await new Promise((r) => setTimeout(r, REPLICATE_POLL_MS));
    const pollRes = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!pollRes.ok) return { ok: false, error: `replicate_poll_${pollRes.status}` };
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    return { ok: false, error: `replicate_${prediction.status}: ${prediction.error ?? "no_output"}` };
  }

  const outUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outUrl) return { ok: false, error: "replicate_empty_output" };

  const image = await urlToDataUrl(outUrl, signal);
  return { ok: true, image, seed };
}

// ── OpenAI gpt-image-1 ─────────────────────────────────────────────────────────
async function generateOpenai(params: TarotGenParams, signal: AbortSignal): Promise<TarotGenResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_openai_api_key" };

  const SIZE = "1024x1536"; // 2:3 portrait
  let res: Response;

  if (params.referenceImage) {
    const parsed = parseDataUrl(params.referenceImage);
    if (!parsed) return { ok: false, error: "invalid_reference_image" };
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", params.prompt);
    form.append("size", SIZE);
    form.append("quality", "medium");
    form.append("image", new Blob([parsed.buffer], { type: parsed.mime }), "reference.png");
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt: params.prompt, size: SIZE, quality: "medium", n: 1 }),
      signal,
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `openai_${res.status}: ${detail.slice(0, 300)}` };
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "openai_empty_output" };
  return { ok: true, image: `data:image/png;base64,${b64}`, seed: null };
}

export async function generateTarotImage(params: TarotGenParams): Promise<TarotGenResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
  try {
    if (params.provider === "flux") return await generateFlux(params, controller.signal);
    if (params.provider === "openai") return await generateOpenai(params, controller.signal);
    return { ok: false, error: "unknown_provider" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg === "The operation was aborted." ? "generation_timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}
