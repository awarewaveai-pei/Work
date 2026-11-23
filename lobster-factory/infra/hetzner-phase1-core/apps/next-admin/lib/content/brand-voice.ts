// One brand voice for every content generator (AUTO_CONTENT_EXECUTION_PLAN.md I1). The stored copy is
// wp_sites.content_defaults (read on the server by brand-voice-store.ts); this file is the shape and the one
// renderer, with no server imports, so the browser tools and the server render the same prompt text.
import { autoIntroStyles } from "../../public/editor-shared/intro-styles.js";
import Transitions from "../../public/editor-shared/transitions.js";
import { ALLOWED_TEXT_MODELS, DEFAULT_TEXT_CHAIN, SUB_CLAUDE_MODEL_IDS, SUB_CODEX_MODEL_IDS, TEXT_CHAINS, isTextChain, type TextChain } from "../ai/text-model-options";

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

/** How the content pipeline ends for a site (plan D1, I5): human_review = everything stays a draft for a person;
 *  ai_review_auto = a topic whose review passed goes out by itself. Changed only by its own field of PATCH
 *  /api/content/sites/[id] (a whole-defaults save keeps the stored value). */
export const PUBLISH_MODES = ["human_review", "ai_review_auto"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

/** Who picks the month's topics (AUTO_CONTENT P9.2, B4): human_pick = a person approves; ai_pick = the schedule approves
 *  what it just proposed. Independent of PublishMode (that one only governs publishing). Set the same way: its own PATCH field. */
export const TOPIC_MODES = ["human_pick", "ai_pick"] as const;
export type TopicMode = (typeof TOPIC_MODES)[number];

/** Who sees the site's auto-made YouTube videos (N5a, plan O7): public by default, unlisted = only people with the link.
 *  Set the same way as the two modes above: its own PATCH field, staff only. */
export const YOUTUBE_PRIVACIES = ["public", "unlisted"] as const;
export type YoutubePrivacy = (typeof YOUTUBE_PRIVACIES)[number];

/** The brand's own industry RSS feeds (AUTO_CONTENT P9.4): https URLs, read at planning time into that brand's prompt only. */
export const MAX_TREND_FEEDS = 10;

/** Sentences every article of the site must carry word for word (N1b: a disclaimer, a crisis line). Plain text, one
 *  paragraph each; the route rejects more or longer, requiredBlocks() reads them. */
export const MAX_REQUIRED_BLOCKS = 10;
export const MAX_REQUIRED_BLOCK_CHARS = 500;

/** Card K7 (訂閱通道 PLAN §3): the site's text road for the schedule's articles -- each its own PATCH field like the modes
 *  above. textApiModel = the chain's last (API) segment, an API catalogue id only; textClaudeModel / textCodexModel = the claude / codex
 *  segment's subscription model. All of them missing (every site before K7) = API only on the default model, as before. */
export const TEXT_ROAD_CHAINS = TEXT_CHAINS;
export const TEXT_ROAD_API_MODELS = ALLOWED_TEXT_MODELS;
export const TEXT_ROAD_CLAUDE_MODELS = SUB_CLAUDE_MODEL_IDS;
export const TEXT_ROAD_CODEX_MODELS = SUB_CODEX_MODEL_IDS;
/** The four fields "套用到所有網站" copies, and nothing else. */
export const TEXT_ROAD_FIELDS = ["textChain", "textApiModel", "textClaudeModel", "textCodexModel"] as const;

export interface SiteContentDefaults {
  publishMode?: PublishMode;
  textChain?: TextChain;
  textApiModel?: string;
  textClaudeModel?: string;
  textCodexModel?: string;
  topicMode?: TopicMode;
  /** N8: each brand day, up to 3 trend topics scored for the brand (lib/content/topics/daily.ts). Off unless exactly true. */
  dailyTrendTopics?: boolean;
  youtubePrivacy?: YoutubePrivacy;
  /** Card R2: the intro styles the site's automatic videos take in turn (public/editor-shared/intro-styles.js ids, the
   *  automatic ones only); missing or [] = no intro. Set by its own PATCH field, like youtubePrivacy. */
  introStyles?: string[];
  /** Card R2: the transition from that intro into the video (public/editor-shared/transitions.js name, one video-service
   *  can join); missing = 溶解 0.5 s. Its own PATCH field. */
  introTransition?: string;
  /** Card R3: the saved designs (media_assets ids of this site's organization) the banner-card intro takes in turn. Its
   *  own PATCH field; missing = none. */
  introCards?: string[];
  trendFeeds?: string[];
  requiredBlocks?: string[];
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

/** Only the exact stored value turns auto publish on: missing, misspelt or any other value = human review. */
export function autoPublishes(d: SiteContentDefaults | undefined): boolean {
  return d?.publishMode === "ai_review_auto";
}

/** The site's content language: topics, article and video all read it here, so an unset site cannot mix languages. */
export function siteLanguage(d: SiteContentDefaults | undefined): string {
  return t(d?.language) || "繁體中文";
}

/** Only the exact stored value makes the site's videos unlisted: missing or any other value = public (plan O7). */
export function youtubePrivacy(d: SiteContentDefaults | undefined): YoutubePrivacy {
  return d?.youtubePrivacy === "unlisted" ? "unlisted" : "public";
}

/** The YouTube target's format, which carries its privacy to the sender (lib/social/compose.ts: "unlisted" -> unlisted,
 *  anything else -> public; "post" is every platform's plain format). */
export const youtubeFormat = (d: SiteContentDefaults | undefined) => (youtubePrivacy(d) === "unlisted" ? "unlisted" : "post");

/** Card R2: the site's automatic-video intro styles as they are used (known, automatic, each once); old data = [] = none. */
export function siteIntroStyles(d: SiteContentDefaults | undefined): string[] {
  return autoIntroStyles(d?.introStyles);
}

/** Card R3: the site's chosen banner-card designs as stored (ids, each once); old data = []. */
export function siteIntroCards(d: SiteContentDefaults | undefined): string[] {
  return Array.isArray(d?.introCards) ? [...new Set(d.introCards.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 20) : [];
}

/** Card R2: the site's intro transition as used: one of the transitions module's choices (old names read), else 溶解. */
export function siteIntroTransition(d: SiteContentDefaults | undefined): string {
  const name = Transitions.name(d?.introTransition);
  return d?.introTransition !== undefined && name !== null ? name : Transitions.AUTO.id;
}

/** The site's text road as the schedule reads it: a stored chain that is not one of the four (or none) = API only. */
export function siteTextChain(d: SiteContentDefaults | undefined): TextChain {
  return isTextChain(d?.textChain) ? d.textChain : DEFAULT_TEXT_CHAIN;
}

/** Only the exact stored value lets the schedule approve its own proposals: missing, misspelt or any other value = a person picks. */
export function aiPicksTopics(d: SiteContentDefaults | undefined): boolean {
  return d?.topicMode === "ai_pick";
}

/** Most daily trend topics a site gets per day, and the least relevance score one needs (operator O6, 2026-11-19). */
export const DAILY_TOPICS = 3;
export const DAILY_MIN_SCORE = 70;

/** Only the exact stored true turns the daily trend topics on (N8): missing (every site before it), false or any other value = off. */
export function dailyTrendTopicsOn(d: SiteContentDefaults | undefined): boolean {
  return d?.dailyTrendTopics === true;
}

/** The site's must-carry paragraphs, trimmed, blanks and repeats dropped; [] for a site that never set any (old data). */
export function requiredBlocks(d: SiteContentDefaults | undefined): string[] {
  const raw = d?.requiredBlocks;
  if (!Array.isArray(raw)) return [];
  const out = [...new Set(raw.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean))];
  return out.slice(0, MAX_REQUIRED_BLOCKS).map((s) => s.slice(0, MAX_REQUIRED_BLOCK_CHARS));
}
