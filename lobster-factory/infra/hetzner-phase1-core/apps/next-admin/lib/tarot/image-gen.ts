// Server-side image generation for the tarot print-file tool.
// Models (both provider keys already in app env), cheapest → priciest:
//   - flux-schnell  → Replicate flux-schnell (text2img only, no img2img) — ~10× cheaper than dev
//   - flux-dev      → Replicate flux-dev (text2img + img2img/style ref via `image`)
//   - openai-low/medium/high → OpenAI gpt-image-1 at that quality (generations, or edits w/ ref image)
// Returns a uniform `data:image/png;base64,...` URL so the client treats them the same.
// No Claude/Anthropic call here — prompts go straight to the image model (no extra API cost,
// no translation step that could stall generation). Write prompts in English for best FLUX results.

const GEN_TIMEOUT_MS = 58_000; // stay under the 60s nginx/route ceiling
const REPLICATE_POLL_MS = 2_500;

// CJK / Japanese kana — FLUX & most image models follow English far better than Chinese,
// so we translate the prompt to English once before generation (fail-open on any error).
const CJK_RE = /[㐀-鿿豈-﫿぀-ヿ]/;
async function toEnglishPrompt(prompt: string, signal: AbortSignal): Promise<string> {
  if (!CJK_RE.test(prompt)) return prompt;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return prompt;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        messages: [
          {
            role: "user",
            content: `Translate this AI image-generation prompt into natural English, preserving all structure, art-direction terms, and intent. Output ONLY the translated prompt with no preamble:\n\n${prompt}`,
          },
        ],
      },
      { signal },
    );
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" && block.text.trim() ? block.text.trim() : prompt;
  } catch {
    return prompt; // never fail image generation because translation hiccupped
  }
}

export type TarotModel = "flux-schnell" | "flux-dev" | "openai-low" | "openai-medium" | "openai-high";

interface ModelConfig {
  provider: "flux" | "openai";
  /** Replicate model slug (flux models only). */
  fluxModel?: string;
  /** Whether the model can consume a reference image for img2img / style transfer. */
  supportsImg2img: boolean;
  /** gpt-image-1 quality (openai models only). */
  quality?: "low" | "medium" | "high";
}

export const TAROT_MODELS: Record<TarotModel, ModelConfig> = {
  "flux-schnell": { provider: "flux", fluxModel: "black-forest-labs/flux-schnell", supportsImg2img: false },
  "flux-dev": { provider: "flux", fluxModel: "black-forest-labs/flux-dev", supportsImg2img: true },
  "openai-low": { provider: "openai", supportsImg2img: true, quality: "low" },
  "openai-medium": { provider: "openai", supportsImg2img: true, quality: "medium" },
  "openai-high": { provider: "openai", supportsImg2img: true, quality: "high" },
};

export function isTarotModel(v: unknown): v is TarotModel {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TAROT_MODELS, v);
}

export interface TarotGenParams {
  model: TarotModel;
  prompt: string;
  /**
   * data: URLs of reference images for style transfer (where the model supports it).
   * FLUX uses only the first; gpt-image-1 can consume several.
   */
  referenceImages?: string[];
  /** Reproducibility seed (FLUX only; ignored by gpt-image-1). */
  seed?: number | null;
}

export type TarotGenResult =
  | { ok: true; image: string; seed: number | null }
  | { ok: false; error: string };

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024; // 20 MB ceiling on a single generated image

// Only fetch generated images from Replicate's own delivery hosts — prevents the
// upstream JSON from steering a server-side fetch at an arbitrary/internal URL (SSRF).
function isAllowedOutputUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

async function urlToDataUrl(url: string, signal: AbortSignal): Promise<string> {
  if (!isAllowedOutputUrl(url)) throw new Error("output_url_not_allowed");
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch_output_failed_${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_OUTPUT_BYTES) throw new Error("output_too_large");
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_OUTPUT_BYTES) throw new Error("output_too_large");
  const mime = res.headers.get("content-type") ?? "image/png";
  return `data:${mime};base64,${Buffer.from(ab).toString("base64")}`;
}

// ── FLUX (Replicate) ──────────────────────────────────────────────────────────
async function generateFlux(params: TarotGenParams, config: ModelConfig, signal: AbortSignal): Promise<TarotGenResult> {
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
  // schnell has no `image` input — style consistency there relies on seed + prompt only.
  // flux-dev img2img takes a single image, so we use the first reference.
  const fluxRef = params.referenceImages?.[0];
  if (config.supportsImg2img && fluxRef) {
    input.image = fluxRef; // img2img / style reference
    input.prompt_strength = 0.82; // keep some of the reference, follow the prompt
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "wait", // block up to ~60s for the result instead of returning immediately
  };

  const createRes = await fetch(`https://api.replicate.com/v1/models/${config.fluxModel}/predictions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    signal,
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    console.error("[tarot] replicate create failed", createRes.status, detail.slice(0, 500));
    return { ok: false, error: `replicate_${createRes.status}` };
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
    console.error("[tarot] replicate prediction not succeeded", prediction.status, prediction.error ?? "");
    return { ok: false, error: `replicate_${prediction.status}` };
  }

  const outUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outUrl) return { ok: false, error: "replicate_empty_output" };

  const image = await urlToDataUrl(outUrl, signal);
  return { ok: true, image, seed };
}

// ── OpenAI gpt-image-1 ─────────────────────────────────────────────────────────
async function generateOpenai(params: TarotGenParams, config: ModelConfig, signal: AbortSignal): Promise<TarotGenResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_openai_api_key" };

  const SIZE = "1024x1536"; // 2:3 portrait
  const quality = config.quality ?? "medium";
  let res: Response;

  const refs = params.referenceImages ?? [];
  if (refs.length > 0) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", params.prompt);
    form.append("size", SIZE);
    form.append("quality", quality);
    // gpt-image-1 edits accepts multiple reference images via repeated image[] fields.
    for (let i = 0; i < refs.length; i++) {
      const parsed = parseDataUrl(refs[i]);
      if (!parsed) return { ok: false, error: "invalid_reference_image" };
      form.append("image[]", new Blob([new Uint8Array(parsed.buffer)], { type: parsed.mime }), `reference-${i}.png`);
    }
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
      body: JSON.stringify({ model: "gpt-image-1", prompt: params.prompt, size: SIZE, quality, n: 1 }),
      signal,
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[tarot] openai image failed", res.status, detail.slice(0, 500));
    let code = "";
    try {
      code = ((JSON.parse(detail) as { error?: { code?: string } })?.error?.code) ?? "";
    } catch {
      /* non-JSON error body */
    }
    return { ok: false, error: code ? `openai_${code}` : `openai_${res.status}` };
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "openai_empty_output" };
  return { ok: true, image: `data:image/png;base64,${b64}`, seed: null };
}

export async function generateTarotImage(params: TarotGenParams): Promise<TarotGenResult> {
  const config = TAROT_MODELS[params.model];
  if (!config) return { ok: false, error: "unknown_model" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
  try {
    const prompt = await toEnglishPrompt(params.prompt, controller.signal);
    const p: TarotGenParams = { ...params, prompt };
    if (config.provider === "flux") return await generateFlux(p, config, controller.signal);
    return await generateOpenai(p, config, controller.signal);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg === "The operation was aborted." ? "generation_timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}
