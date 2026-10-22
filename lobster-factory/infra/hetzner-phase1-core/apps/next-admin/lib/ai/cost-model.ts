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
 * INFRA: Hetzner figures are the ACTUAL billed price from the Hetzner console PRICE field
 * (screenshots 2026-06-17), NOT the Hetzner API /v1/pricing list price — the API returns the
 * current catalog rate ($30.99/$41.99), which is higher than this account's locked-in rate
 * ($18.49/$16.49 in console). Always trust the console PRICE field for actual spend. Cloudflare
 * real from /zones API. Domains + other SaaS remain `estimate: true` (not in any API).
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
  vendor: "Anthropic" | "OpenAI" | "Google" | "Perplexity" | "Serper";
}

/**
 * Keyed by the EXACT model id the code sends (so logAiCall can look it up by response model).
 * Anthropic ids per generate-core.ts ALLOWED_MODELS; OpenAI per OPENAI_MODELS; Gemini per ops-inbox.
 */
export const TEXT_RATES: Record<string, TextRate> = {
  "claude-haiku-5-5":          { inputPerM: 0.1, outputPerM: 0.5, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Haiku 5.5", vendor: "Anthropic" },
  "claude-haiku-4-5-20251001": { inputPerM: 1, outputPerM: 5, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Haiku 4.5", vendor: "Anthropic" },
  "claude-haiku-4-5":          { inputPerM: 1, outputPerM: 5, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Haiku 4.5", vendor: "Anthropic" },
  "claude-sonnet-4-6":         { inputPerM: 3, outputPerM: 15, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Sonnet 4.6", vendor: "Anthropic" },
  "claude-opus-5-5":           { inputPerM: 4, outputPerM: 20, cacheReadMult: 0.05, cacheWriteMult: 1.25, label: "Claude Opus 5.5", vendor: "Anthropic" },
  // Opus 5 = a classifier-fallback target of Opus 5.5 (lib/ai/gateway.ts); priced so a rescued call is not mispriced.
  "claude-opus-5":             { inputPerM: 5, outputPerM: 25, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Opus 5", vendor: "Anthropic" },
  "claude-opus-4-8":           { inputPerM: 5, outputPerM: 25, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Opus 4.8", vendor: "Anthropic" },
  "claude-fable-5":            { inputPerM: 10, outputPerM: 50, cacheReadMult: 0.1, cacheWriteMult: 1.25, label: "Claude Fable 5", vendor: "Anthropic" },
  "gpt-5.5":                   { inputPerM: 5, outputPerM: 30, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.5", vendor: "OpenAI" },
  "gpt-5.4":                   { inputPerM: 2.5, outputPerM: 15, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.4", vendor: "OpenAI" },
  "gpt-5.4-mini":              { inputPerM: 0.75, outputPerM: 4.5, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.4 mini", vendor: "OpenAI" },
  "gpt-5.4-nano":              { inputPerM: 0.2, outputPerM: 1.25, cacheReadMult: 0.1, cacheWriteMult: 1, label: "GPT-5.4 nano", vendor: "OpenAI" },
  "gpt-4o":                    { inputPerM: 2.5, outputPerM: 10, cacheReadMult: 0.5, cacheWriteMult: 1, label: "GPT-4o", vendor: "OpenAI" },
  // Legacy Perplexity Sonar — kept for historical cost-log lookup; no longer called (replaced by Serper).
  "sonar":                     { inputPerM: 1, outputPerM: 1, cacheReadMult: 1, cacheWriteMult: 1, label: "Perplexity Sonar (legacy)", vendor: "Perplexity" },
  // Gemini Flash-Lite (ops-inbox diagnostics only).
  "gemini-2.0-flash-lite":     { inputPerM: 0.1, outputPerM: 0.4, cacheReadMult: 0.25, cacheWriteMult: 1, label: "Gemini 2.0 Flash-Lite", vendor: "Google" },
};

/** Fallback when an unknown text model id is logged — the app default model's rate. */
export const FALLBACK_TEXT_MODEL = "claude-opus-5-5";

/** Per-image price in USD. Keys = the app's image model ids (lib/tarot/image-gen.ts TAROT_MODELS). */
export const IMAGE_RATES: Record<string, { usd: number; label: string; vendor: string }> = {
  "pexels-video":        { usd: 0,     label: "Pexels 真實影片 $0", vendor: "Pexels (免費)" },
  "pexels-all":          { usd: 0,     label: "Pexels 免費照片 $0", vendor: "Pexels (免費)" },
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
 * AI 影片動態（image-to-video）每秒 USD 價格。keys = lib/tarot/video-motion-gen.ts VIDEO_MOTION_MODELS。
 * 價格來源：2026-09-12 直接讀 replicate.com/<slug> 頁面內嵌 JSON 的 "or N seconds for $X" 換算，
 * 非猜測（Runway/Luma/Google 官方直連 API 定價與 Replicate 轉售價不同，此表只適用走 Replicate）。
 */
// Record 鍵型別釘死 VideoMotionModel（非 string）：新增動態模型時，忘記在這裡補對應費率會直接
// TS 編譯失敗，而不是靜默漏記那個模型的真實花費（IMAGE_RATES/TOOL_RATES 用 string 鍵的舊模式
// 沒有這層保護，critic 2026-09-12 建議這張新的、金額較大的表從一開始就收緊）。
export const VIDEO_MOTION_RATES: Record<import("../tarot/video-motion-gen").VideoMotionModel, { usdPerSec: number; label: string; vendor: string; defaultDurationSec: number }> = {
  "runway-gen4-turbo":  { usdPerSec: 0.05, label: "Runway Gen-4 Turbo", vendor: "Runway/Replicate", defaultDurationSec: 5 },
  "luma-ray-flash-2":   { usdPerSec: 0.06, label: "Luma Ray Flash 2",   vendor: "Luma/Replicate",   defaultDurationSec: 5 },
  "luma-ray-2":         { usdPerSec: 0.18, label: "Luma Ray 2",         vendor: "Luma/Replicate",   defaultDurationSec: 5 },
  "veo-3-1-fast":       { usdPerSec: 0.10, label: "Google Veo 3.1 Fast",vendor: "Google/Replicate", defaultDurationSec: 8 },
  "veo-3-1":            { usdPerSec: 0.20, label: "Google Veo 3.1",     vendor: "Google/Replicate", defaultDurationSec: 8 },
};

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
  /** Extra flat USD per call (e.g. paid search API alongside article gen). */
  extraUsd?: number;
}

export const TEXT_FEATURES: FeatureProfile[] = [
  { key: "article",     label: "文章生成 (Content Studio)", route: "/api/content/generate", model: "claude-opus-5-5", inputTok: 3500, outputTok: 8000, extraUsd: 0.006 },
  { key: "humanize",    label: "AI 去味 / 人性化",          route: "/api/content/humanize", model: "claude-opus-5-5", inputTok: 4000, outputTok: 6000 },
  { key: "seo-fix",     label: "SEO 修正 (RankMath)",        route: "/api/content/seo-fix",  model: "claude-sonnet-4-6", inputTok: 4500, outputTok: 6000 },
  { key: "brand-voice", label: "品牌語氣擷取",               route: "/api/content/brand-voice", model: "claude-sonnet-4-6", inputTok: 3000, outputTok: 1500 },
  { key: "outline",     label: "大綱生成",                   route: "/api/content/outline",  model: "claude-haiku-5-5", inputTok: 400, outputTok: 700 },
  { key: "title",       label: "標題建議 (5 個)",            route: "/api/content/title",    model: "claude-haiku-5-5", inputTok: 400, outputTok: 500 },
  { key: "keywords",    label: "LSI/NLP 關鍵字 (20)",        route: "/api/content/keywords", model: "claude-haiku-5-5", inputTok: 300, outputTok: 600 },
  { key: "hook-brief",  label: "Hook Brief 草稿（批次）",     route: "/api/content/hook-brief", model: "claude-haiku-5-5", inputTok: 600, outputTok: 500 },
  { key: "syndicate",   label: "社群多平台改寫",             route: "/api/content/syndicate", model: "claude-haiku-5-5", inputTok: 1500, outputTok: 2000 },
  { key: "tarot-prompt",label: "塔羅 prompt 建議",           route: "/api/tools/tarot/suggest-prompt", model: "claude-haiku-5-5", inputTok: 500, outputTok: 400 },
  { key: "product-copy",label: "POD 商品文案 (SEO)",         route: "lib/studio/product-copy", model: "claude-opus-5-5", inputTok: 600, outputTok: 1000 },
  { key: "video-script",label: "影片腳本生成 (6 場景)",       route: "lib/content/video/video-script-core", model: "claude-opus-5-5", inputTok: 1200, outputTok: 2200 },
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
  // 2026-08-28 consolidation: the two Hetzner Cloud VPS below (SG 5.223.93.113 / EU
  // 204.168.175.41) were merged into one OVH dedicated box and deleted at Hetzner console
  // 2026-08-30 -- kept here commented out as a historical price reference, not billed any more.
  // { key: "hetzner-sg", label: "Hetzner SG VPS (5.223.93.113, CPX22 2c/4GB, sin)", usdPerMonth: 18.49, estimate: false, note: "真實 $18.49/月 (Hetzner console PRICE；含新加坡加價)" },
  // { key: "hetzner-eu", label: "Hetzner EU VPS (204.168.175.41, CPX32 4c/8GB, hel1)", usdPerMonth: 16.49, estimate: false, note: "真實 $16.49/月 (Hetzner console PRICE)；Supabase/n8n/Postiz/Trigger 全自託管於此" },
  { key: "ovh-ks-aw-01", label: "OVH KS-6 (145.239.195.47, EPYC 7351P 16c/32t / 128GB ECC / 2x1TB NVMe RAID1, Gravelines FR)", usdPerMonth: 59.8, estimate: false, note: "真實 $59.80/月；KS-6 host switch completed 2026-08-31. It replaces the prior SYS-GAME-2 while retaining the consolidated soulful+Chatwoot+SG+EU workload." },
  { key: "cloudflare", label: "Cloudflare (DNS/WAF/R2)", usdPerMonth: 0, estimate: false, note: "真實: 2 zones (aware-wave.com / weartheworld.org) 皆 Free plan $0，CF API；R2 在免費額度內(10GB)，量大再加" },
  // aware-wave.com + weartheworld.org = Cloudflare Registrar (at-cost: .com/.org ~$10.44/yr each,
  // CF doesn't mark up). soulfulexpression.org migrated Hostinger -> ks-aw-01 (OVH) 2026-08-28,
  // ahead of the originally-planned Oct 2026 date; Hostinger kept frozen as rollback through the
  // observation window, not billed for new usage after cutover.
  // CF Registrar API needs #account.registrar scope (token 403'd); read exact in CF dash.
  { key: "domains", label: "網域續約攤提 (aware-wave + weartheworld @CF; soulful @Hostinger，已於 8/28 切至 ks-aw-01)", usdPerMonth: 2.9, estimate: true, note: "2 CF 網域 at-cost ~$10.44/年×2=$20.88(可信)；soulful 舊 Hostinger 主機凍結當回滾，觀察期滿解約，估算沿用 ~$14/年直到正式退租" },
  { key: "saas-other", label: "其他 SaaS (Sentry/PostHog 等，若付費)", usdPerMonth: 0, estimate: true, note: "推測免費額度；有付費方案再加" },
];
