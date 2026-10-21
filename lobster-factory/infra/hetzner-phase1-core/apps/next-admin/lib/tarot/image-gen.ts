// Server-side image generation for the tarot print-file tool.
// Models (provider keys in app env), cheapest → priciest:
//   flux-schnell/dev  → Replicate BFL (text2img; dev adds img2img)
//   openai-low/med/hi → OpenAI gpt-image-1
//   ideogram-*        → Ideogram via Replicate (v2a-turbo/v3-balanced/v4-turbo/v4-quality/character)
//   nano-banana-2/pro → Google Gemini Image via Replicate
//   imagen-4          → Google Imagen 4 via Replicate
//   flux-2-max        → BFL Flux.2 Max via Replicate
// Returns uniform `data:image/png;base64,...` so the client treats all models the same.
// Prompts arrive in English: the studio translates non-English subject/style once per deck (lib/tarot/translate.ts), never here.

import { getDesignsPublicBase } from "../storage/r2";
import { providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";

const GEN_TIMEOUT_MS = 58_000; // stay under the 60s nginx/route ceiling
export const REPLICATE_POLL_MS = 2_500;
// flux-dev guidance scale. BFL recommends 1.5–5; >5 oversaturates. Higher = closer prompt adherence
// which pushes art style onto figures. flux-schnell dropped guidance entirely (sending it may 422).
const FLUX_DEV_GUIDANCE = 5;

export type TarotModel =
  | "flux-schnell"
  | "flux-dev"
  | "flux-kontext-dev"
  | "flux-kontext-pro"
  | "openai-low"
  | "openai-medium"
  | "openai-high"
  | "ideogram-v2a-turbo"
  | "ideogram-v3-balanced"
  | "ideogram-v4-turbo"
  | "ideogram-v4-quality"
  | "ideogram-character"
  | "nano-banana-2"
  | "nano-banana-pro"
  | "imagen-4"
  | "flux-2-max";

/** Canonical aspect ratio options. "2:3" is the traditional tarot portrait format. */
export type AspectRatio = "2:3" | "3:2" | "4:5" | "1:1" | "9:16" | "4:3" | "3:4" | "16:9";

/** Input to a model's buildInput function — shared across all apps using this combo-pack. */
export interface BuildInputParams {
  prompt: string;
  aspectRatio: AspectRatio;
  seed: number;
  referenceImages: string[]; // base64 data URLs or HTTPS URLs
}

interface ModelConfig {
  provider: "flux" | "openai" | "replicate";
  /** Replicate slug for legacy flux models (owner/name). */
  fluxModel?: string;
  /** Replicate slug for generic replicate models (owner/name). */
  slug?: string;
  supportsImg2img: boolean;
  quality?: "low" | "medium" | "high";
  /**
   * Per-model input builder. Returns the full `input` object sent to the Replicate prediction API.
   * This is the flexible combo-pack abstraction reusable across apps beyond Tarot Studio.
   */
  buildInput?: (p: BuildInputParams) => Record<string, unknown>;
}


// ── Aspect ratio mapping helpers (verified against live Replicate schemas 2026-06-11) ──

// Ideogram v4 has NO aspect_ratio — resolution enum (WxH strings) only. NO seed either.
// All five values below confirmed present in the live v4 resolution enum; 1792x2240 = 4:5 exact.
// 4:3/3:4/16:9 entries are approximate ~3-4MP values (unverified against live enum; may 422 on v4).
const IDEOGRAM_V4_RES: Record<AspectRatio, string> = {
  "2:3": "1664x2496",
  "3:2": "2496x1664",
  "4:5": "1792x2240",
  "1:1": "2048x2048",
  "9:16": "1440x2560",
  "4:3": "2048x1536",
  "3:4": "1536x2048",
  "16:9": "2560x1440",
};

// Imagen 4 natively exposes [1:1|9:16|16:9|3:4|4:3] — unsupported ones map to nearest.
const IMAGEN4_AR: Record<AspectRatio, string> = {
  "2:3": "3:4", // nearest portrait
  "3:2": "4:3", // nearest landscape
  "4:5": "3:4", // nearest portrait
  "1:1": "1:1",
  "9:16": "9:16",
  "4:3": "4:3", // native
  "3:4": "3:4", // native
  "16:9": "16:9", // native
};

export const TAROT_MODELS: Record<TarotModel, ModelConfig> = {
  // ── Existing Flux (via Replicate) ──────────────────────────────────────────
  "flux-schnell": {
    provider: "flux",
    fluxModel: "black-forest-labs/flux-schnell",
    supportsImg2img: false,
  },
  "flux-dev": {
    provider: "flux",
    fluxModel: "black-forest-labs/flux-dev",
    supportsImg2img: true,
  },
  // ── BFL FLUX Kontext (in-context image editing via Replicate) ─────────────
  // input_image accepts a single reference URL/base64; aspect_ratio passes through as BFL string.
  // Kontext is designed to incorporate a reference image contextually into a new generation,
  // making it well-suited for mockup (design → garment) use cases.
  "flux-kontext-dev": {
    provider: "replicate",
    slug: "black-forest-labs/flux-kontext-dev",
    supportsImg2img: true,
    buildInput: ({ prompt, aspectRatio, referenceImages }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: "png",
      };
      if (referenceImages.length > 0) input.input_image = referenceImages[0];
      return input;
    },
  },
  "flux-kontext-pro": {
    provider: "replicate",
    slug: "black-forest-labs/flux-kontext-pro",
    supportsImg2img: true,
    buildInput: ({ prompt, aspectRatio, referenceImages }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: "png",
      };
      if (referenceImages.length > 0) input.input_image = referenceImages[0];
      return input;
    },
  },
  // ── OpenAI gpt-image-1 ────────────────────────────────────────────────────
  "openai-low": { provider: "openai", supportsImg2img: true, quality: "low" },
  "openai-medium": { provider: "openai", supportsImg2img: true, quality: "medium" },
  "openai-high": { provider: "openai", supportsImg2img: true, quality: "high" },
  // ── Ideogram via Replicate ────────────────────────────────────────────────
  // v2a/v3 keep seed support; v4 dropped seed entirely (live schema 2026-06-11).
  // Optional enum params (style_type/magic_prompt_option) omitted — defaults are fine and the
  // live enum casing is "Auto"/"None" (sending "AUTO" would 422).
  // v2a enum lacks 4:5 (live 422 verified 2026-06-11) — map to nearest 3:4.
  "ideogram-v2a-turbo": {
    provider: "replicate",
    slug: "ideogram-ai/ideogram-v2a-turbo",
    supportsImg2img: false,
    buildInput: ({ prompt, aspectRatio, seed }) => ({
      prompt,
      aspect_ratio: aspectRatio === "4:5" ? "3:4" : aspectRatio,
      seed,
    }),
  },
  "ideogram-v3-balanced": {
    provider: "replicate",
    slug: "ideogram-ai/ideogram-v3-balanced",
    supportsImg2img: false,
    buildInput: ({ prompt, aspectRatio, seed }) => ({
      prompt,
      aspect_ratio: aspectRatio,
      seed,
    }),
  },
  "ideogram-v4-turbo": {
    provider: "replicate",
    slug: "ideogram-ai/ideogram-v4-turbo",
    supportsImg2img: false,
    buildInput: ({ prompt, aspectRatio }) => ({
      prompt,
      resolution: IDEOGRAM_V4_RES[aspectRatio],
    }),
  },
  "ideogram-v4-quality": {
    provider: "replicate",
    slug: "ideogram-ai/ideogram-v4-quality",
    supportsImg2img: false,
    buildInput: ({ prompt, aspectRatio }) => ({
      prompt,
      resolution: IDEOGRAM_V4_RES[aspectRatio],
    }),
  },
  // character_reference_image is a SINGULAR string and REQUIRED (live schema).
  "ideogram-character": {
    provider: "replicate",
    slug: "ideogram-ai/ideogram-character",
    supportsImg2img: true,
    buildInput: ({ prompt, aspectRatio, seed, referenceImages }) => {
      if (referenceImages.length === 0) throw new Error("character_reference_required");
      return {
        prompt,
        aspect_ratio: aspectRatio,
        seed,
        rendering_speed: "Default",
        character_reference_image: referenceImages[0],
      };
    },
  },
  // ── Google models via Replicate (no seed param on any of them) ────────────
  "nano-banana-2": {
    provider: "replicate",
    slug: "google/nano-banana-2",
    supportsImg2img: true,
    buildInput: ({ prompt, aspectRatio, referenceImages }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution: "2K",
        output_format: "png",
      };
      if (referenceImages.length > 0) {
        input.image_input = referenceImages;
      }
      return input;
    },
  },
  "nano-banana-pro": {
    provider: "replicate",
    slug: "google/nano-banana-pro",
    supportsImg2img: true,
    buildInput: ({ prompt, aspectRatio, referenceImages }) => {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution: "2K",
        output_format: "png",
        allow_fallback_model: true,
      };
      if (referenceImages.length > 0) {
        input.image_input = referenceImages;
      }
      return input;
    },
  },
  "imagen-4": {
    provider: "replicate",
    slug: "google/imagen-4",
    supportsImg2img: false,
    buildInput: ({ prompt, aspectRatio }) => ({
      prompt,
      aspect_ratio: IMAGEN4_AR[aspectRatio], // only 5 native ratios
      image_size: "2K",
      output_format: "png",
    }),
  },
  // ── BFL Flux.2 Max via Replicate ──────────────────────────────────────────
  // Live schema has a native aspect_ratio enum covering all five ratios — simpler than w×h.
  "flux-2-max": {
    provider: "replicate",
    slug: "black-forest-labs/flux-2-max",
    supportsImg2img: false,
    buildInput: ({ prompt, aspectRatio, seed }) => ({
      prompt,
      aspect_ratio: aspectRatio,
      resolution: "1 MP",
      seed,
      output_format: "png",
    }),
  },
};

export function isTarotModel(v: unknown): v is TarotModel {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TAROT_MODELS, v);
}

export const VALID_ASPECT_RATIOS: readonly AspectRatio[] = ["2:3", "3:2", "4:5", "1:1", "9:16", "4:3", "3:4", "16:9"];
export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (VALID_ASPECT_RATIOS as string[]).includes(v);
}

export interface TarotGenParams {
  model: TarotModel;
  prompt: string;
  /**
   * data: URLs of reference images for style transfer (where the model supports it).
   * FLUX uses only the first; gpt-image-1 can consume several; nano-banana accepts up to 14.
   */
  referenceImages?: string[];
  /** Reproducibility seed (most Replicate models; gpt-image-1 ignores it). */
  seed?: number | null;
  /** Output aspect ratio. Defaults to "2:3" (traditional tarot portrait). */
  aspectRatio?: AspectRatio;
  /** When true, FLUX models use explicit print-quality pixel dims instead of megapixels:"1".
   *  Tarot cards: 300 DPI @ 7.6×12.6 cm = 896×1488 px. Studio/Mockup: omit (stays 1 MP). */
  printQuality?: boolean;
}

export type TarotGenResult =
  | { ok: true; image: string; seed: number | null }
  | { ok: false; error: string };

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

// Only fetch generated images from Replicate's own delivery hosts (SSRF guard).
export function isAllowedOutputUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

// Inbound reference images may arrive as our own My Designs picks — public R2 URLs
// (Replicate models fetch those directly; gpt-image-1 needs raw bytes). Only the
// designs bucket's own public origin is fetchable here (SSRF guard, same allowlist
// the studio route validates against via getDesignsPublicBase).
function isAllowedInputUrl(raw: string): boolean {
  const base = getDesignsPublicBase();
  if (!raw.startsWith(base + "/")) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.host === new URL(base).host;
  } catch {
    return false;
  }
}

// gpt-image-1 /images/edits only accepts these three; map to the filename extension
// OpenAI expects. Anything else is rejected here with a clear cause rather than letting
// OpenAI bounce the whole request with an opaque error.
const OPENAI_REF_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function ownDesignUrlToBlob(
  url: string,
  signal: AbortSignal,
): Promise<{ blob: Blob; ext: string } | null> {
  // redirect:"manual" fails closed (opaque status 0 → !res.ok) so a 3xx cannot bounce
  // off the allowlisted origin and defeat isAllowedInputUrl's SSRF guard.
  const res = await fetch(url, { signal, redirect: "manual" });
  if (!res.ok) return null;
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = OPENAI_REF_MIME[mime];
  if (!ext) return null;
  if (Number(res.headers.get("content-length") ?? "0") > MAX_OUTPUT_BYTES) return null;
  // Stream with a hard ceiling: content-length can be absent on chunked responses, so we
  // must bound the read itself — never buffer the whole body before checking its size
  // (an oversized object would OOM the box, which is already memory-constrained).
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: BlobPart[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_OUTPUT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return { blob: new Blob(chunks, { type: mime }), ext };
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

// Retry once on Replicate 429 after honouring the retry_after window.
// Account balance < $5 → burst=1, 6 req/min; retry_after is typically 3–12s.
export async function fetchWithRetry429(url: string, options: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status !== 429) return res;
  const bodyText = await res.text().catch(() => "");
  let waitMs = 12_000; // safe default above the max observed retry_after
  try {
    const b = JSON.parse(bodyText) as { retry_after?: number };
    if (typeof b.retry_after === "number" && b.retry_after > 0)
      waitMs = Math.min(15_000, Math.ceil(b.retry_after) * 1000 + 1_000); // cap at 15s; +1s cushion
  } catch {}
  console.info(`[tarot] 429 rate-limited — waiting ${waitMs}ms before retry`);
  // Wire wait to the AbortSignal so the 58s route timeout can short-circuit before the 60s hard kill.
  await new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error("The operation was aborted."));
    const t = setTimeout(resolve, waitMs);
    options.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("The operation was aborted.")); }, { once: true });
  });
  return fetch(url, options);
}

// ── FLUX (Replicate) — legacy path kept for backward compatibility ─────────────
async function generateFlux(params: TarotGenParams, config: ModelConfig, signal: AbortSignal, grant: Grant): Promise<TarotGenResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate_api_token" };

  const seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const ar = (params.aspectRatio ?? "2:3") as AspectRatio;
  // FLUX schnell/dev only accept aspect_ratio from a named enum — no width/height params in schema.
  // printQuality is a no-op for FLUX; use aspect_ratio for all requests.
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: ar,
    output_format: "png",
    output_quality: 100,
    num_outputs: 1,
    megapixels: "1",
    // go_fast=true uses fp8-quantized weights: faster but NON-deterministic even with fixed seed.
    // Force bf16 for reproducible deck generation.
    go_fast: false,
    seed,
  };
  if (config.fluxModel === "black-forest-labs/flux-dev") {
    input.guidance = FLUX_DEV_GUIDANCE;
  }
  const fluxRef = params.referenceImages?.[0];
  if (config.supportsImg2img && fluxRef) {
    input.image = fluxRef;
    input.prompt_strength = 0.82;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "wait",
  };

  const createRes = await fetchWithRetry429(providerUrl(grant, "replicate", `/v1/models/${config.fluxModel}/predictions`), {
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

  while (prediction.status === "starting" || prediction.status === "processing") {
    if (!prediction.urls?.get) break;
    await new Promise((r) => setTimeout(r, REPLICATE_POLL_MS));
    const pollRes = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!pollRes.ok) return { ok: false, error: `replicate_poll_${pollRes.status}` };
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    console.error("[tarot] replicate not succeeded", prediction.status, prediction.error ?? "");
    return { ok: false, error: `replicate_${prediction.status}` };
  }

  const outUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outUrl) return { ok: false, error: "replicate_empty_output" };
  const image = await urlToDataUrl(outUrl as string, signal);
  return { ok: true, image, seed };
}

// ── Generic Replicate — new models via per-model buildInput abstraction ─────────
async function generateReplicate(params: TarotGenParams, config: ModelConfig, signal: AbortSignal, grant: Grant): Promise<TarotGenResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate_api_token" };
  if (!config.slug || !config.buildInput) return { ok: false, error: "model_config_incomplete" };

  const seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const input = config.buildInput({
    prompt: params.prompt,
    aspectRatio: params.aspectRatio ?? "2:3",
    seed,
    referenceImages: params.referenceImages ?? [],
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "wait",
  };

  const createRes = await fetchWithRetry429(providerUrl(grant, "replicate", `/v1/models/${config.slug}/predictions`), {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    signal,
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    console.error(`[tarot] ${config.slug} create failed`, createRes.status, detail.slice(0, 500));
    return { ok: false, error: `replicate_${createRes.status}` };
  }

  let prediction = (await createRes.json()) as {
    status: string;
    output?: string[] | string;
    error?: string;
    urls?: { get?: string };
  };

  while (prediction.status === "starting" || prediction.status === "processing") {
    if (!prediction.urls?.get) break;
    await new Promise((r) => setTimeout(r, REPLICATE_POLL_MS));
    const pollRes = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!pollRes.ok) return { ok: false, error: `replicate_poll_${pollRes.status}` };
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    console.error(`[tarot] ${config.slug} not succeeded`, prediction.status, prediction.error ?? "");
    return { ok: false, error: `replicate_${prediction.status}` };
  }

  const outUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outUrl) return { ok: false, error: "replicate_empty_output" };
  const image = await urlToDataUrl(outUrl as string, signal);
  return { ok: true, image, seed };
}

// ── OpenAI gpt-image-1 ──────────────────────────────────────────────────────────
async function generateOpenai(params: TarotGenParams, config: ModelConfig, signal: AbortSignal, grant: Grant): Promise<TarotGenResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_openai_api_key" };

  // gpt-image-1 only supports three sizes; map unsupported ratios to nearest.
  const sizeMap: Record<AspectRatio, string> = {
    "2:3": "1024x1536",
    "3:2": "1536x1024",
    "4:5": "1024x1536", // no 4:5 — use portrait
    "1:1": "1024x1024",
    "9:16": "1024x1536", // no 9:16 — use portrait
    "4:3": "1536x1024", // landscape → nearest (3:2)
    "3:4": "1024x1536", // portrait → nearest (2:3)
    "16:9": "1536x1024", // widescreen → nearest landscape
  };
  const SIZE = sizeMap[params.aspectRatio ?? "2:3"];
  const quality = config.quality ?? "medium";
  let res: Response;

  const refs = params.referenceImages ?? [];
  if (refs.length > 0) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", params.prompt);
    form.append("size", SIZE);
    form.append("quality", quality);
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const parsed = parseDataUrl(ref);
      if (parsed) {
        form.append("image[]", new Blob([new Uint8Array(parsed.buffer)], { type: parsed.mime }), `reference-${i}.png`);
        continue;
      }
      const fetched = isAllowedInputUrl(ref) ? await ownDesignUrlToBlob(ref, signal) : null;
      if (!fetched) return { ok: false, error: "invalid_reference_image" };
      form.append("image[]", fetched.blob, `reference-${i}.${fetched.ext}`);
    }
    res = await fetch(providerUrl(grant, "openai", "/v1/images/edits"), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    });
  } else {
    res = await fetch(providerUrl(grant, "openai", "/v1/images/generations"), {
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
    try { code = ((JSON.parse(detail) as { error?: { code?: string } })?.error?.code) ?? ""; } catch { /* non-JSON */ }
    return { ok: false, error: code ? `openai_${code}` : `openai_${res.status}` };
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "openai_empty_output" };
  return { ok: true, image: `data:image/png;base64,${b64}`, seed: null };
}

/** Shared by tarot, studio, content and video: the caller asks for its own product's feature (e.g. grantFor("studio.image")). */
export async function generateTarotImage(params: TarotGenParams, grant: Grant): Promise<TarotGenResult> {
  const config = TAROT_MODELS[params.model];
  if (!config) return { ok: false, error: "unknown_model" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
  try {
    if (config.provider === "flux") return await generateFlux(params, config, controller.signal, grant);
    if (config.provider === "replicate") return await generateReplicate(params, config, controller.signal, grant);
    return await generateOpenai(params, config, controller.signal, grant);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg === "The operation was aborted." ? "generation_timeout" : msg };
  } finally {
    clearTimeout(timer);
  }
}
