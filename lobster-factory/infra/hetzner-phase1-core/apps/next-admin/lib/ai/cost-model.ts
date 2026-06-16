/**
 * Cost model SSOT — machine-readable unit prices for every paid AI/tool surface the app calls,
 * plus the recurring infrastructure baseline. Powers the /ops/costs accounting page and the
 * report-app-costs script.
 *
 * Why this file exists: prices were previously only human-readable strings in model-comparison.ts
 * (text) and a numeric costUsd in tarot/model-comparison.ts (image). Neither is summable. This is
 * the single numeric source — change a rate here and both the live page and the report follow.
 *
 * Sources (USD): Anthropic pricing (claude-api guide, 2026-05); Replicate per-image costUsd from
 * lib/tarot/model-comparison.ts; OpenAI image API; Perplexity Sonar; Gemini Flash-Lite. Currency:
 * NT$ via TWD_RATE (single source — mirrors app/tools/ai-models/page.tsx, keep in sync).
 *
 * ⚠️ INFRA numbers are ESTIMATES — no recurring cost is documented anywhere in the repo (Explore
 * 2026-06-16: all infra is self-hosted on 2 Hetzner VPS, plan/price not recorded). Replace each
 * `estimate: true` line with the real bill figure from the Hetzner / Cloudflare / registrar console.
 */

/** USD → NT$ reference rate. Mirrors app/tools/ai-models/page.tsx:12 — update both together. */
export const TWD_RATE = 32;

/** Per-1M-token prices in USD. input/output billed separately; cache read ≈0.1×, write ≈1.25×. */
export interface TextRate {
  inputPerM: number;
  outputPerM: number;
  /** Cache-read multiplier vs input (Anthropic ≈ 0.1). */
  cacheReadMult: number;
  /** Cache-write multiplier vs input (Anthropic 5-min ≈ 1.25). */
  cacheWriteMult: number;
  label: string;
  vendor: "Anthropic" | "OpenAI" | "Google" | "Perplexity";
}

/**
 * Keyed by the EXACT model id the code sends (so logAiCall can look it up by response model).
 * Anthropic ids per generate-core.ts ALLOWED_MODELS; OpenAI per OPENAI_MODELS; Gemini per ops-inbox;
 * Perplexity sonar per generate-core.ts fetchRealSources.
 */
export const TEXT_RATES: Record<string, TextRate> = {
  "claude-haiku-4-5-20251001": { inputPerM: 1, outputPerM: 5, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Haiku 4.5", vendor: "Anthropic" },
  "claude-haiku-4-5":          { inputPerM: 1, outputPerM: 5, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Haiku 4.5", vendor: "Anthropic" },
  "claude-sonnet-4-6":         { inputPerM: 3, outputPerM: 15, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Sonnet 4.6", vendor: "Anthropic" },
  "claude-opus-4-8":           { inputPerM: 5, outputPerM: 25, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Opus 4.8", vendor: "Anthropic" },
  "claude-fable-5":            { inputPerM: 10, outputPerM: 50, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Fable 5", vendor: "Anthropic" },
  "gpt-5.5":                   { inputPerM: 5, outputPerM: 30, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.5", vendor: "OpenAI" },
  "gpt-5.4":                   { inputPerM: 2.5, outputPerM: 15, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.4", vendor: "OpenAI" },
  "gpt-5.4-mini":              { inputPerM: 0.75, outputPerM: 4.5, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.4 mini", vendor: "OpenAI" },
  "gpt-4o":                    { inputPerM: 2.5, outputPerM: 10, cacheReadMult: 0.5, cacheWriteMult: 1, label: "GPT-4o", vendor: "OpenAI" },
  // Perplexity Sonar: token price + per-request search fee (~$5/1000 req). Token side only here;
  // the search fee is small and folded into the estimate's per-article assumption (TEXT_FEATURES.extraUsd).
  "sonar":                     { inputPerM: 1, outputPerM: 1, cacheReadMult: 1, cacheWriteMult: 1, label: "Perplexity Sonar", vendor: "Perplexity" },
  // Gemini Flash-Lite (ops-inbox diagnostics only).
  "gemini-2.0-flash-lite":     { inputPerM: 0.1, outputPerM: 0.4, cacheReadMult: 0.25, cacheWriteMult: 1, label: "Gemini 2.0 Flash-Lite", vendor: "Google" },
};

/** Fallback when an unknown text model id is logged — Sonnet rate (the app default). */
export const FALLBACK_TEXT_MODEL = "claude-sonnet-4-6";

/** Per-image price in USD. Keys = the app's image model ids (lib/tarot/image-gen.ts TAROT_MODELS). */
export const IMAGE_RATES: Record<string, { usd: number; label: string; vendor: string }> = {
  "flux-schnell":        { usd: 0.003, label: "FLUX schnell", vendor: "BFL/Replicate" },
  "flux-dev":            { usd: 0.025, label: "FLUX dev", vendor: "BFL/Replicate" },
  "flux-kontext-dev":    { usd: 0.045, label: "FLUX Kontext Dev", vendor: "BFL/Replicate" },
  "flux-kontext-pro":    { usd: 0.10, label: "FLUX Kontext Pro", vendor: "BFL/Replicate" },
  "flux-2-max":          { usd: 0.07, label: "FLUX 2 Max", vendor: "BFL/Replicate" },
  "ideogram-v2a-turbo":  { usd: 0.025, label: "Ideogram v2a Turbo", vendor: "Ideogram/Replicate" },
  "ideogram-v3-balanced":{ usd: 0.06, label: "Ideogram v3 Balanced", vendor: "Ideogram/Replicate" },
  "ideogram-v4-turbo":   { usd: 0.03, label: "Ideogram v4 Turbo", vendor: "Ideogram/Replicate" },
  "ideogram-v4-quality": { usd: 0.10, label: "Ideogram v4 Quality", vendor: "Ideogram/Replicate" },
  "ideogram-character":  { usd: 0.15, label: "Ideogram Character", vendor: "Ideogram/Replicate" },
  "seedream-4.5":        { usd: 0.04, label: "Seedream 4.5", vendor: "ByteDance/Replicate" },
  "nano-banana-2":       { usd: 0.067, label: "Nano Banana 2", vendor: "Google/Replicate" },
  "nano-banana-pro":     { usd: 0.15, label: "Nano Banana Pro", vendor: "Google/Replicate" },
  "imagen-4":            { usd: 0.04, label: "Imagen 4", vendor: "Google/Replicate" },
  "openai-low":          { usd: 0.02, label: "GPT-Image-1 low", vendor: "OpenAI" },
  "openai-medium":       { usd: 0.07, label: "GPT-Image-1 medium", vendor: "OpenAI" },
  "openai-high":         { usd: 0.19, label: "GPT-Image-1 high", vendor: "OpenAI" },
};

/** Default image model the app uses for cheap drafts (lib/tarot/image-gen.ts default). */
export const DEFAULT_IMAGE_MODEL = "flux-schnell";

/**
 * Per-run prices for the studio editing tools (Replicate compute-billed; values are typical-run
 * estimates — Replicate bills by GPU-seconds so actual varies). upscale runs up to 2 passes.
 */
export const TOOL_RATES: Record<string, { usd: number; label: string; vendor: string; estimate: boolean }> = {
  "bg-remove":   { usd: 0.011, label: "去背 (851-labs)", vendor: "Replicate", estimate: true },
  "upscale":     { usd: 0.005, label: "升頻 (real-esrgan, 每 pass)", vendor: "Replicate", estimate: true },
  "inpaint":     { usd: 0.04, label: "去物件 (bria/eraser)", vendor: "Replicate", estimate: true },
  // Printful mockup generator + product create are free; only fulfillment (per order) costs money,
  // and that is pass-through to the customer, not an app operating cost.
  "printful-mockup": { usd: 0, label: "Printful mockup", vendor: "Printful", estimate: false },
};

/**
 * Typical token usage per text feature — used by the slider estimator when NO real logged data
 * exists yet (ai_call_logs empty). Once logs accumulate, the page prefers real averages over these.
 * inputTok/outputTok are rough per-call medians; model is the id the route actually sends.
 */
export interface FeatureProfile {
  key: string;
  label: string;
  route: string;
  model: string;
  inputTok: number;
  outputTok: number;
  /** Perplexity Sonar search fired alongside (article gen) — extra flat USD per call. */
  extraUsd?: number;
}

export const TEXT_FEATURES: FeatureProfile[] = [
  { key: "article",     label: "文章生成 (Content Studio)", route: "/api/content/generate", model: "claude-sonnet-4-6", inputTok: 3500, outputTok: 8000, extraUsd: 0.006 },
  { key: "humanize",    label: "AI 去味 / 人性化",          route: "/api/content/humanize", model: "claude-sonnet-4-6", inputTok: 4000, outputTok: 6000 },
  { key: "seo-fix",     label: "SEO 修正 (RankMath)",        route: "/api/content/seo-fix",  model: "claude-sonnet-4-6", inputTok: 4500, outputTok: 6000 },
  { key: "brand-voice", label: "品牌語氣擷取",               route: "/api/content/brand-voice", model: "claude-sonnet-4-6", inputTok: 3000, outputTok: 1500 },
  { key: "outline",     label: "大綱生成",                   route: "/api/content/outline",  model: "claude-haiku-4-5-20251001", inputTok: 400, outputTok: 700 },
  { key: "title",       label: "標題建議 (5 個)",            route: "/api/content/title",    model: "claude-haiku-4-5-20251001", inputTok: 400, outputTok: 500 },
  { key: "keywords",    label: "LSI/NLP 關鍵字 (20)",        route: "/api/content/keywords", model: "claude-haiku-4-5-20251001", inputTok: 300, outputTok: 600 },
  { key: "syndicate",   label: "社群多平台改寫",             route: "/api/content/syndicate", model: "claude-haiku-4-5-20251001", inputTok: 1500, outputTok: 2000 },
  { key: "tarot-prompt",label: "塔羅 prompt 建議",           route: "/api/tools/tarot/suggest-prompt", model: "claude-haiku-4-5-20251001", inputTok: 500, outputTok: 400 },
  { key: "product-copy",label: "POD 商品文案 (SEO)",         route: "lib/studio/product-copy", model: "claude-sonnet-4-6", inputTok: 600, outputTok: 1000 },
];

/**
 * Recurring monthly infrastructure / SaaS baseline, in USD/month.
 * ⚠️ EVERY `estimate: true` row is a guess — the repo documents NO costs (all self-hosted on 2
 * Hetzner VPS). Replace with the real figure from each provider's console; flip estimate→false once
 * verified. The page shows an "估算" badge on estimated rows so the number is never mistaken for real.
 */
export interface InfraCost {
  key: string;
  label: string;
  usdPerMonth: number;
  estimate: boolean;
  note: string;
}

export const INFRA_MONTHLY: InfraCost[] = [
  { key: "hetzner-sg", label: "Hetzner SG VPS (5.223.93.113, ~4GB)", usdPerMonth: 9, estimate: true, note: "未記錄於 repo；查 Hetzner console 實際方案" },
  { key: "hetzner-eu", label: "Hetzner EU VPS (204.168.175.41, cpx32)", usdPerMonth: 15, estimate: true, note: "未記錄；Supabase/n8n/Postiz/Trigger 全自託管於此" },
  { key: "cloudflare", label: "Cloudflare (DNS/WAF/R2)", usdPerMonth: 0, estimate: true, note: "推測 Free plan；R2 儲存依用量另計，確認後改" },
  { key: "domains", label: "網域續約攤提 (aware-wave + soulful)", usdPerMonth: 8, estimate: true, note: "soulful ~$80/年 待確認 line items；攤成月" },
  { key: "saas-other", label: "其他 SaaS (Sentry/PostHog 等，若付費)", usdPerMonth: 0, estimate: true, note: "目前推測免費/自託管；有付費方案再加" },
];
