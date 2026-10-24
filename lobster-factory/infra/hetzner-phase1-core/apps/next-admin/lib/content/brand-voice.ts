// One brand voice for every content generator (AUTO_CONTENT_EXECUTION_PLAN.md I1). The stored copy is
// wp_sites.content_defaults (read on the server by brand-voice-store.ts); this file is the shape and the one
// renderer, with no server imports, so the browser tools and the server render the same prompt text.

export interface MarketingBrief {
  audience?: string;
  positioning?: string;
  usp?: string;
  primaryCta?: string;
  funnelStage?: string;
  pricePositioning?: string;
  emotionalTriggers?: string;
  objections?: string;
  forbiddenClaims?: string;
}

export interface SiteContentDefaults {
  language?: string;
  targetCountry?: string;
  imageModel?: string;
  tone?: string;
  articleType?: string;
  readability?: string;
  pointOfView?: string;
  featuredImageFont?: string;
  featuredImageTitlePosition?: string;
  brandVoiceInstructions?: string;
  marketing?: MarketingBrief;
  audienceProfile?: {
    contentGoal?: string;
    contentTone?: string;
    audienceAction?: string;
    age?: string[];
    gender?: string[];
    job?: string[];
    jobCustom?: string;
    emotion?: string[];
    emotionCustom?: string;
    awareness?: string[];
    spending?: string[];
  };
}

export const FUNNEL_STAGES = [
  { value: "",              label: "不指定" },
  { value: "awareness",     label: "認知（剛發現問題，建立信任）" },
  { value: "interest",      label: "興趣（在比較方案、找資訊）" },
  { value: "consideration", label: "考慮（評估是否適合自己）" },
  { value: "decision",      label: "決策（準備行動／購買）" },
  { value: "retention",     label: "留存（既有客戶深化關係）" },
];

export const PRICE_POSITIONS = [
  { value: "",        label: "不指定" },
  { value: "premium", label: "高端精品（強調價值與稀缺）" },
  { value: "midhigh", label: "中高端（品質與專業）" },
  { value: "mid",     label: "中端（性價比）" },
  { value: "value",   label: "平價親民（可近性）" },
];

const t = (v: string | undefined) => (v ?? "").trim();

/** The marketing brief as the prompt block every generator puts first; "" when nothing is filled in. */
export function renderMarketingBrief(m: MarketingBrief | undefined): string {
  if (!m) return "";
  const stageLabel = FUNNEL_STAGES.find(s => s.value === m.funnelStage)?.label ?? "";
  const priceLabel = PRICE_POSITIONS.find(p => p.value === m.pricePositioning)?.label ?? "";
  const rows: string[] = [];
  if (t(m.audience))          rows.push(`目標受眾: ${t(m.audience)}`);
  if (t(m.positioning))       rows.push(`品牌定位: ${t(m.positioning)}`);
  if (t(m.usp))               rows.push(`獨特賣點/差異化: ${t(m.usp)}`);
  if (m.funnelStage)          rows.push(`漏斗階段: ${stageLabel}（請對齊此階段的讀者心態與行動呼籲）`);
  if (t(m.primaryCta))        rows.push(`主要行動呼籲 (CTA): ${t(m.primaryCta)}`);
  if (t(m.emotionalTriggers)) rows.push(`情緒觸發點/讀者渴望: ${t(m.emotionalTriggers)}`);
  if (t(m.objections))        rows.push(`需化解的疑慮/抗拒點: ${t(m.objections)}`);
  if (m.pricePositioning)     rows.push(`價格定位: ${priceLabel}`);
  if (t(m.forbiddenClaims))   rows.push(`避免使用/禁用聲明: ${t(m.forbiddenClaims)}`);
  if (rows.length === 0) return "";
  return ["=== 行銷簡報 (Marketing Brief) — 依此精準打中目標、提高轉換 ===", ...rows, "=== END 行銷簡報 ==="].join("\n");
}

/** Brief first, then the free-text instructions: what the article tool sends as `details`. */
export function renderBrandVoice(marketing: MarketingBrief | undefined, instructions: string | undefined): string {
  const brief = renderMarketingBrief(marketing);
  const raw = t(instructions);
  return brief ? (raw ? `${brief}\n\n${raw}` : brief) : raw;
}

/** A site's whole voice for tools that take one text block (social copy, scripts): brief, instructions, tone. */
export function renderSiteVoice(d: SiteContentDefaults | undefined): string {
  const tone = t(d?.tone);
  return [renderBrandVoice(d?.marketing, d?.brandVoiceInstructions), tone ? `語氣: ${tone}` : ""].filter(Boolean).join("\n\n");
}

/** The forbidden claims as separate terms, for the rule check that runs before anything is published. */
export function forbiddenTerms(d: SiteContentDefaults | undefined): string[] {
  return t(d?.marketing?.forbiddenClaims).split(/[,，、;；\n]/).map(s => s.trim()).filter(Boolean);
}
