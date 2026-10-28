"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { WpSite } from "@/lib/content/wp-sites";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { FUNNEL_STAGES, PRICE_POSITIONS, renderMarketingBrief } from "@/lib/content/brand-voice";
import { pickInitialSite } from "@/lib/content/pick-initial-site";
import type { BrandVoiceProfile } from "@/app/api/content/brand-voice/route";
import type { RankMathReport } from "@/lib/seo/rankmath-checker";
import { SeoCheckPanel } from "./SeoCheckPanel";
import { CostChip } from "./CostChip";
import { markdownPreview } from "@/lib/content/client-markdown";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";
import { resolveStylePrompt } from "@/app/(shell)/tools/tarot/cards";
import { DEFAULT_IMAGE_MODEL, IMAGE_RATES } from "@/lib/ai/cost-model";
import { AI_TEXT_MODEL_GROUPS as AI_MODEL_GROUPS, AI_TEXT_MODELS as AI_MODELS, DEFAULT_AI_TEXT_MODEL } from "@/lib/ai/text-model-options";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import { useDoorHref, useOnDoor } from "@/app/DoorContext";
import { ARTICLE_VIDEO_DEFAULTS, parseVoiceModel } from "@/lib/content/video/defaults";

// ─── Video config constants (mirrors VideoStudio) ────────────────────────────

const VIDEO_STYLE_PRESETS: { zh: string; group: string; prompt: string }[] = [
  { zh: "電影感", group: "📹 影片風格", prompt: "Cinematic wide-angle 16:9, dramatic lighting, rich color grade" },
  { zh: "紀錄片", group: "📹 影片風格", prompt: "Documentary photography, natural light, authentic moment" },
  { zh: "商業攝影", group: "📹 影片風格", prompt: "Clean commercial photography, studio lighting, professional" },
];
const VIDEO_PRESET_BY_LABEL = new Map(VIDEO_STYLE_PRESETS.map((p) => [p.zh, p.prompt]));
const VIDEO_STYLE_CATALOG = [...VIDEO_STYLE_PRESETS, ...STYLE_CATALOG];
const VIDEO_STYLE_GROUPS = Array.from(new Set(VIDEO_STYLE_CATALOG.map((s) => s.group)));
function resolveVideoStyle(label: string): string {
  return VIDEO_PRESET_BY_LABEL.get(label) ?? resolveStylePrompt(label);
}
// 輸出比例（mirror VideoStudio）。每比例各自原生生成，非裁同一張。
const VIDEO_FORMAT_CHOICES = ["16x9", "9x16", "4x5"] as const;
const VIDEO_FORMAT_LABELS: Record<string, { ratio: string; label: string; icon: string }> = {
  "16x9": { ratio: "16:9", label: "YouTube/文章",  icon: "▶" },
  "9x16": { ratio: "9:16", label: "TikTok/Reels",  icon: "📱" },
  "4x5":  { ratio: "4:5",  label: "IG Feed/FB",    icon: "📷" },
};
const VOICE_MODELS_VIDEO = [
  { id: "edge:zh-TW-HsiaoChenNeural", label: "Edge TTS 繁中女聲", lang: "繁中", badge: "$0 免費" },
  { id: "edge:zh-TW-YunJheNeural",    label: "Edge TTS 繁中男聲", lang: "繁中", badge: "$0 免費" },
  { id: "edge:en-US-JennyNeural",     label: "Edge TTS English F", lang: "EN",  badge: "$0 免費" },
  { id: "edge:en-US-GuyNeural",       label: "Edge TTS English M", lang: "EN",  badge: "$0 免費" },
  { id: "openai:tts-1:nova",          label: "OpenAI nova",        lang: "多語", badge: "$0.015/1M" },
  { id: "openai:tts-1:shimmer",       label: "OpenAI shimmer",     lang: "多語", badge: "$0.015/1M" },
  { id: "openai:tts-1:alloy",         label: "OpenAI alloy",       lang: "多語", badge: "$0.015/1M" },
  { id: "openai:tts-1:onyx",          label: "OpenAI onyx",        lang: "多語", badge: "$0.015/1M" },
  { id: "openai:tts-1-hd:nova",       label: "OpenAI nova HD",     lang: "多語", badge: "$0.030/1M" },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "繁體中文", "簡體中文", "日文", "西班牙文", "法文", "德文", "葡萄牙文"];

const COUNTRIES = [
  "全球（不指定）", "台灣", "香港", "新加坡", "馬來西亞",
  "美國", "英國", "加拿大", "澳洲", "日本",
  "德國", "法國", "印度", "巴西",
];

const ARTICLE_TYPES = [
  { value: "Pillar Article",  label: "支柱文章" },
  { value: "How-to Guide",    label: "操作指南" },
  { value: "Opinion Piece",   label: "觀點文章" },
  { value: "Comparison",      label: "比較評測" },
  { value: "Tutorial",        label: "教學教程" },
  { value: "Q&A Page",        label: "Q&A 問答頁" },
  { value: "Listicle",        label: "列表文章" },
  { value: "Case Study",      label: "案例研究" },
];

const SIZES = [
  { value: "short",  label: "短篇（約 1200 字）" },
  { value: "medium", label: "中篇（約 2500 字）"  },
  { value: "long",   label: "長篇（約 4000 字）"  },
];

const TONES = [
  { value: "Friendly",        label: "親切友善" },
  { value: "Professional",    label: "專業正式" },
  { value: "Educational",     label: "教育啟發" },
  { value: "Inspirational",   label: "鼓舞人心" },
  { value: "Warm & Credible", label: "溫暖可信" },
];

const POVS = [
  { value: "none",          label: "不指定" },
  { value: "First person",  label: "第一人稱（我）" },
  { value: "Second person", label: "第二人稱（你）" },
  { value: "Third person",  label: "第三人稱（他／她）" },
];

const READABILITIES = [
  { value: "6th grade (very easy)",   label: "簡單（6 年級）" },
  { value: "8th grade (recommended)", label: "推薦（8 年級）" },
  { value: "10th grade",              label: "一般（10 年級）" },
  { value: "College",                 label: "大學程度" },
  { value: "Professional",            label: "專業級" },
];

// Audience profile chip constants (mirrors ClientHubTabs — edit both places if changing)
const CONTENT_GOALS = ["吸粉增長", "教育受眾", "銷售產品", "引流導網", "品牌曝光", "建立信任"];
const CONTENT_TONES_CHIPS = ["專業權威", "溫柔親切", "幽默搞笑", "犀利直接", "高級質感", "情緒共鳴"];
const CONTENT_CTAS = ["留言互動", "追蹤頻道", "購買產品", "預約服務", "下載資源", "私訊詢問"];
const AUDIENCE_CATS = [
  { key: "age",       label: "年齡層",          opts: ["18–24", "25–34", "35–44", "45–54", "55+"],              multi: true,  custom: false },
  { key: "gender",    label: "性別",             opts: ["女性", "男性", "不限"],                                   multi: false, custom: false },
  { key: "job",       label: "職業 / 身分",      opts: ["上班族", "學生", "創業/自雇", "家長", "退休族", "創作者"], multi: true,  custom: true  },
  { key: "emotion",   label: "情緒 / 心理狀態",  opts: ["焦慮壓力", "想自我成長", "尋找療癒", "缺乏自信", "想被理解"], multi: true, custom: true },
  { key: "awareness", label: "對主題的熟悉度",   opts: ["完全新手", "在比較方案", "進階老手"],                      multi: false, custom: false },
  { key: "spending",  label: "消費力",           opts: ["平價親民", "中等", "高端精品"],                           multi: false, custom: false },
] as const;
const AUDIENCE_PRESETS = [
  { label: "想成長的年輕上班族", sel: { age: ["25–34"],         gender: ["不限"],  job: ["上班族"],          emotion: ["想自我成長"],           awareness: ["在比較方案"], spending: ["中等"]    } },
  { label: "尋求療癒的家長",     sel: { age: ["35–44"],         gender: ["女性"],  job: ["家長"],            emotion: ["尋找療癒"],             awareness: ["完全新手"],   spending: ["中等"]    } },
  { label: "想學創作的新手",     sel: { age: ["25–34","35–44"], gender: ["不限"],  job: ["創作者","上班族"], emotion: ["缺乏自信","想自我成長"], awareness: ["完全新手"],   spending: ["平價親民"] } },
];
type AP = {
  contentGoal?: string; contentTone?: string; audienceAction?: string;
  age?: string[]; gender?: string[]; job?: string[]; jobCustom?: string;
  emotion?: string[]; emotionCustom?: string; awareness?: string[]; spending?: string[];
};
const DEFAULT_AP: AP = {};

// #4 — Marketing brief preset chips (click to fill/append each field)
const MKT_PRESETS: Record<string, string[]> = {
  audience: ["台灣 30-45 歲女性", "有焦慮/壓力的上班族", "正在尋找自我療癒的成人", "對心理健康有興趣的父母", "藝術愛好者（非專業）", "身心科/諮商後進階探索者"],
  primaryCta: ["預約免費體驗課", "立即報名工作坊", "加入候補名單", "下載免費指南", "訂閱電子報", "聯絡我們了解更多"],
  emotionalTriggers: ["渴望被理解與接納", "想找回創造力與自信", "希望減輕焦慮與壓力", "尋找內心平靜與自我探索", "渴望與人真實連結", "想為孩子找到非藥物支持"],
  objections: ["我沒有繪畫天份", "會不會很貴？值得嗎？", "我不確定這對我有效", "我沒有時間", "這跟一般心理諮商有什麼不同？", "我的孩子適合嗎？"],
};

const SYN_PLATFORMS = [
  { key: "twitter",   label: "Twitter / X",  hasThread: true  },
  { key: "instagram", label: "Instagram",     hasThread: false },
  { key: "threads",   label: "Threads",       hasThread: false },
  { key: "facebook",  label: "Facebook",      hasThread: false },
  { key: "linkedin",  label: "LinkedIn",      hasThread: false },
  { key: "tiktok",    label: "TikTok",        hasThread: false },
  { key: "pinterest", label: "Pinterest",     hasThread: false },
  { key: "whatsapp",  label: "WhatsApp",      hasThread: false },
  { key: "reddit",    label: "Reddit",        hasThread: false },
  { key: "email",     label: "Email 電子報",  hasThread: false },
];

// Platform image specs (dimensions for social media)
const PLATFORM_IMG_PRESETS: Array<{ platform: string; label: string; w: number; h: number; note: string }> = [
  { platform: "instagram_square",   label: "IG 方形",      w: 1080, h: 1080, note: "1:1 貼文" },
  { platform: "instagram_portrait", label: "IG 直式",      w: 1080, h: 1350, note: "4:5 貼文" },
  { platform: "instagram_story",    label: "IG 限時",      w: 1080, h: 1920, note: "9:16 Story/Reels" },
  { platform: "facebook_link",      label: "FB 連結",      w: 1200, h: 630,  note: "1.91:1" },
  { platform: "twitter_post",       label: "X 貼文",       w: 1200, h: 675,  note: "16:9" },
  { platform: "threads_square",     label: "Threads",      w: 1080, h: 1080, note: "1:1" },
  { platform: "linkedin_post",      label: "LinkedIn",     w: 1200, h: 627,  note: "1.91:1" },
  { platform: "pinterest_pin",      label: "Pinterest",    w: 1000, h: 1500, note: "2:3 Pin" },
  { platform: "reddit_post",        label: "Reddit",       w: 1200, h: 628,  note: "1.91:1" },
  { platform: "tiktok_thumbnail",   label: "TikTok 封面",  w: 1080, h: 1920, note: "9:16" },
];

const HOOK_TYPES = [
  "Question",
  "Statistical or Fact",
  "Quotation",
  "Anecdotal or Story",
  "Personal or Emotional",
] as const;

// Display labels for hook types (API keys stay English; only UI labels are Chinese)
const HOOK_TYPE_LABELS: Record<typeof HOOK_TYPES[number], string> = {
  "Question":              "提問式",
  "Statistical or Fact":   "數據／事實",
  "Quotation":             "名人引言",
  "Anecdotal or Story":    "故事／案例",
  "Personal or Emotional": "情感共鳴",
};

// Curated subset of the 15-model image-gen toolkit (lib/tarot/image-gen.ts, the same combo-pack the
// Tarot tool uses). value = TarotModel id → sent straight to /api/content/image, which delegates to
// generateTarotImage. `seed`/`img2img` mirror each model's live capability (image-gen.ts TAROT_MODELS):
// they drive the enable/disable of the Seed + 參考圖(img2img) controls so the UI never offers a knob the
// model ignores. "none" = 不生成 AI 圖片 — short-circuits autoReplaceImages + generateHeroImage as before.
const AI_IMAGE_PROVIDERS: { value: string; label: string; seed: boolean; img2img: boolean }[] = [
  { value: "none",                 label: "None（不生成）",                       seed: false, img2img: false },
  { value: "flux-schnell",         label: "Flux Schnell（快速 · 預設）",          seed: true,  img2img: false },
  { value: "flux-dev",             label: "Flux Dev（高品質 · 支援參考圖）",      seed: true,  img2img: true  },
  { value: "ideogram-v3-balanced", label: "Ideogram v3（文字/排版精準）",          seed: true,  img2img: false },
  { value: "nano-banana-pro",      label: "Nano Banana Pro（Google · 支援參考圖）", seed: false, img2img: true  },
  { value: "flux-2-max",           label: "Flux.2 Max（旗艦畫質）",                seed: true,  img2img: false },
];

// <optgroup> sections for the IMAGE STYLE picker, in catalog order (西方畫家 / 亞洲畫家 / 媒材 / 風格).
const STYLE_GROUPS = [...new Set(STYLE_CATALOG.map(s => s.group))];

// Media ratios = flux-schnell aspect_ratio enum values (these are sent through verbatim and actually
// take effect; the old "1344x768"-style size strings were ignored by the model — every image came out
// 1:1). 16:9 / 3:2 / 4:3 are the article-body friendly horizontals; 1:1 / 9:16 kept for social reuse.
const IMAGE_SIZES = [
  { value: "16:9", label: "16:9（橫式 · Google Discover 最佳）" },
  { value: "3:2",  label: "3:2（橫式 · 攝影比例）" },
  { value: "4:3",  label: "4:3（橫式 · 經典）" },
  { value: "1:1",  label: "1:1（方形）" },
  { value: "9:16", label: "9:16（直式）" },
];

const LAYOUT_OPTIONS = [
  { value: "distribute",  label: "Distribute evenly" },
  { value: "after_intro", label: "After introduction" },
  { value: "after_h2",    label: "After each H2" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab       = "generate" | "humanize" | "drafts";
type GenStatus = "idle" | "streaming" | "done" | "error";
type PubStatus = "idle" | "publishing" | "done" | "error";
type SynStatus = "idle" | "generating" | "done" | "error";
type HumStatus = "idle" | "streaming" | "done" | "error";
type RemoveAI  = "none" | "basic" | "extended";
type HumMode   = "humanize" | "rewrite";

interface ArticleStructure {
  quickAnswer: boolean;
  keyTakeaways: boolean;
  comparisonTable: boolean;
  faq: boolean;
  conclusion: boolean;
  tables: boolean;
  h3: boolean;
  lists: boolean;
  italics: boolean;
  quotes: boolean;
  bold: boolean;
  // Extended
  expertQuote: boolean;
  prosCons: boolean;
  stepByStep: boolean;
  calloutBox: boolean;
  caseStudy: boolean;
  statCallout: boolean;
}

interface MediaHub {
  aiImages: string;
  imageCount: number;
  imageSize: string;
  imageStyle: string;     // STYLE_CATALOG `zh` key ("" = 不套用風格); resolved to its English .prompt at gen time
  imageSeed: string;      // numeric seed string ("" = 隨機); only honoured when the model supports seed
  imageRefData: string;   // single reference-image data: URL for img2img ("" = none); model-gated
  imageInstructions: string;
  brandName: string;
  includeKeywordAlt: boolean;
  autoAltText: boolean;
  youtubeSource: string;
  youtubeCount: number;
  youtubeLayout: string;
  strictUnderHeadings: boolean;
}

// #4 — structured marketing brief. Compiled into a YAML-ish block prepended to `details` at generate
// time (renderMarketingBrief, lib/content/brand-voice.ts), so the backend contract is unchanged (it still reads only `details`).
interface MarketingBrief {
  audience: string;          // 目標受眾
  forbiddenClaims: string;   // 避免使用／禁用聲明（逗號分隔）
  positioning: string;       // 品牌定位一句話
  usp: string;               // 獨特賣點／差異化
  primaryCta: string;        // 主要行動呼籲目標
  funnelStage: string;       // 漏斗階段 (FUNNEL_STAGES value)
  pricePositioning: string;  // 價格定位 (PRICE_POSITIONS value)
  objections: string;        // 客戶常見疑慮／抗拒點
  emotionalTriggers: string; // 情緒觸發點／渴望
}

interface GenerateForm {
  keyword: string;
  title: string;
  language: string;
  targetCountry: string;
  articleType: string;
  articleSize: string;
  tone: string;
  pointOfView: string;
  readability: string;
  removeAiWords: RemoveAI;
  model: string;
  details: string;
  nlpKeywords: string;
  outline: string;
  externalLinks: string;
  internalLinks: string;
  referenceUrls: string;
  structure: ArticleStructure;
  introHookBrief: string;
  introHookType: string;
  media: MediaHub;
  marketing: MarketingBrief;
  generateMeta: boolean;
  scheduleDate: string;
  wpCategories: string;
  wpTags: string;
  patternCount: number;   // #6 — how many Kadence funnel patterns to weave in (0 = off)
}

interface MetaData { seoTitle: string; metaDesc: string; focusKeyword?: string; categories?: string[]; tags?: string[]; }

// #5 — shape returned by /api/content/market-analysis (mirrors its MarketAnalysis interface).
interface MarketAnalysisResult {
  competitors: string[];
  painPoints: string[];
  searchIntent: string[];
  objections: string[];
  differentiators: string[];
}

// Light row from GET /api/content/drafts (list). Full draft (markdown + form snapshot) is fetched
// on-demand via GET ?id=. See migration 0041_content_drafts.sql + app/api/content/drafts/route.ts.
interface DraftListItem {
  id: string;
  keyword: string;
  title: string | null;
  language: string | null;
  articleType: string | null;
  slugHint: string | null;
  seoScore: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

function extractMeta(text: string): MetaData | null {
  const block = text.match(/<!-- CONTENT_META_START -->([\s\S]*?)<!-- CONTENT_META_END -->/);
  if (!block) return null;
  const inner  = block[1];
  const titleM = inner.match(/SEO_TITLE:\s*(.+)/);
  const metaM  = inner.match(/META_DESC:\s*(.+)/);
  if (!titleM || !metaM) return null;
  const kwM  = inner.match(/FOCUS_KEYWORD:\s*(.+)/);
  const catM = inner.match(/CATEGORIES:\s*(.+)/);
  const tagM = inner.match(/TAGS:\s*(.+)/);
  const splitCsv = (s?: string) => (s ? s.split(",").map(x => x.trim()).filter(Boolean) : undefined);
  const rawMetaDesc = metaM[1].trim();
  return {
    seoTitle: titleM[1].trim(),
    metaDesc: rawMetaDesc.length > 160 ? rawMetaDesc.slice(0, 160) : rawMetaDesc,
    focusKeyword: kwM?.[1]?.trim(),
    categories: splitCsv(catM?.[1]),
    tags: splitCsv(tagM?.[1]),
  };
}

function extractSlugHint(text: string): string {
  const m = text.match(/<!--\s*SLUG_HINT:\s*([a-z0-9][a-z0-9-]*)\s*-->/);
  return m ? m[1] : "";
}

function stripMeta(text: string): string {
  return text.replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "").trim();
}

function stripSlugHint(text: string): string {
  return text.replace(/<!--\s*SLUG_HINT:[^>]*-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function downloadMd(text: string, filename = "article.md") {
  const blob = new Blob([text], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_STRUCTURE: ArticleStructure = {
  quickAnswer: true, keyTakeaways: true, comparisonTable: true, faq: true, conclusion: true,
  tables: true, h3: true, lists: true, italics: true, quotes: true, bold: true,
  // Extended — off by default; operator opts in per article
  expertQuote: false, prosCons: false, stepByStep: false,
  calloutBox: false, caseStudy: false, statCallout: false,
};

const DEFAULT_MEDIA: MediaHub = {
  aiImages: "none", imageCount: 3, imageSize: "16:9",
  imageStyle: "", imageSeed: "", imageRefData: "",
  imageInstructions: "", brandName: "",
  includeKeywordAlt: true, autoAltText: false,
  youtubeSource: "none", youtubeCount: 1, youtubeLayout: "distribute",
  strictUnderHeadings: false,
};

const DEFAULT_MARKETING: MarketingBrief = {
  audience: "", forbiddenClaims: "", positioning: "", usp: "", primaryCta: "",
  funnelStage: "", pricePositioning: "", objections: "", emotionalTriggers: "",
};

const DEFAULT_FORM: GenerateForm = {
  keyword: "", title: "", language: "English", targetCountry: "全球（不指定）",
  articleType: "Pillar Article", articleSize: "medium", tone: "Friendly",
  pointOfView: "none", readability: "8th grade (recommended)",
  removeAiWords: "none", model: DEFAULT_AI_TEXT_MODEL,
  details: "", nlpKeywords: "", outline: "", externalLinks: "",
  internalLinks: "", referenceUrls: "",
  structure: { ...DEFAULT_STRUCTURE },
  introHookBrief: "", introHookType: "",
  media: { ...DEFAULT_MEDIA },
  marketing: { ...DEFAULT_MARKETING },
  generateMeta: true, scheduleDate: "",
  wpCategories: "", wpTags: "",
  patternCount: 0,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionToggle({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ border: "1px solid var(--card-border)", borderRadius: "6px", marginBottom: "12px" }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
          fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
        <span>{label}</span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: "0 14px 14px" }}>{children}</div>}
    </div>
  );
}

function ChipBtn({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        padding: "3px 10px", borderRadius: 20, fontSize: 11, border: "1px solid",
        cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text-secondary)",
        borderColor: active ? "var(--accent)" : "var(--card-border)",
        fontWeight: active ? 600 : 400, lineHeight: 1.6,
      }}>
      {label}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

// The article's AI video comes from the video product, which a content door does not serve (it is only optional):
// the staff page passes these calls in (ContentStudioStaff.tsx), so a door page's imports name no /api/video route
// (registry-code.test.ts gate 3) and the door shows no AI video option.
export interface ContentVideoApi {
  generate(body: Record<string, unknown>): Promise<{ ok: boolean; euJobId?: string; jobId?: string; error?: string }>;
  status(jobId: string): Promise<{ ok: boolean; status?: string; video?: { outputs?: Record<string, string> }; error?: string }>;
  embed(body: { postId: number; siteId?: string; videoUrl: string }): Promise<{ ok: boolean; error?: string }>;
}

export default function ContentStudio({ video }: { video?: ContentVideoApi }) {
  const { canUse, why } = usePaidFeatures();
  const searchParams = useSearchParams();
  // On the content door (app/content): staff links go through useDoorHref (null = no door page, hide); the newsletter
  // (our own FluentCRM) and trending-source management are staff-only (step-8 card §5 C-R3/C-R4).
  const onDoor = useOnDoor();
  const calendarHref = useDoorHref("/tools/content/calendar");
  const sitesHref = useDoorHref("/tools/content/sites");
  const clientsHref = useDoorHref("/ops/clients");
  const socialHref = useDoorHref("/tools/social");
  // 字串而非 searchParams 物件本身當依賴 —— 物件每次 render 都是新的，會讓下面的
  // effect 每 render 重跑並蓋掉操作者手動選的站。
  const paramSiteId = searchParams.get("siteId") ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("generate");

  // Multi-site (ManagedSite carries contentDefaults; WpSite is the internal server type)
  const [wpSites,       setWpSites]       = useState<ManagedSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  // 非 null = 網址帶的 ?siteId= 在可用清單裡找不到（停用／已刪除／打錯／別的租戶）。
  // 一定要顯示出來：吞掉它就等於讓人以為自己在對 A 客戶操作，實際卻在對 B 客戶。
  const [unresolvedSiteParam, setUnresolvedSiteParam] = useState<string | null>(null);
  // 區分「還沒載完」與「載完了但一個站都沒有」—— 兩者對 unresolvedSiteParam 的意義相反。
  const [sitesLoaded, setSitesLoaded] = useState(false);

  /**
   * 目前真正選定的站。**刻意不回退到 wpSites[0]** —— 這個檔案原本有 10 處寫著
   *     wpSites.find(s => s.id === selectedSiteId) ?? wpSites[0]
   * 也就是「沒選定就當作選了第一個客戶」。在 selectedSiteId 永遠非空的舊行為下這幾乎不會
   * 觸發；但一旦「指定的站取不到 → 不選」成為一個正常狀態（見 pick-initial-site.ts），它們
   * 就會全部活起來，用**別的客戶**的品牌／SEO 脈絡去生成內容，其中 saveAsClientDefault()
   * 更會直接把表單預設寫進別的客戶那一列。同一條規則抄 10 次是這個 bug 的形狀，所以收斂成
   * 一個 derived value：沒選定就是 undefined，呼叫端各自以 ?. / if (!site) 處理。
   */
  const currentSite = useMemo(
    () => wpSites.find(s => s.id === selectedSiteId),
    [wpSites, selectedSiteId],
  );

  /** 「有哪些站可選」的穩定指紋 —— 選站決策的第二個輸入（第一個是 URL 的 ?siteId=）。 */
  const siteIdsKey = useMemo(() => wpSites.map(s => s.id).join("|"), [wpSites]);

  // Brand Voice
  const [showBrandVoice,    setShowBrandVoice]    = useState(false);
  const [bvSampleText,      setBvSampleText]      = useState("");
  const [bvSampleUrl,       setBvSampleUrl]       = useState("");
  const [bvUrlTouched,      setBvUrlTouched]       = useState(false); // stop auto-fill once operator edits the URL
  const [bvProfileName,     setBvProfileName]     = useState("我的品牌");
  const [bvNameTouched,     setBvNameTouched]     = useState(false); // stop auto-fill once operator edits the name
  const [bvLoading,         setBvLoading]         = useState(false);
  const [bvProfile,         setBvProfile]         = useState<BrandVoiceProfile | null>(null);
  const [bvError,           setBvError]           = useState("");
  const [bvApplied,         setBvApplied]         = useState(false);

  // #5 — Competitor & pain-point analysis (Claude Opus 5.5 /api/content/market-analysis)
  const [showMarket,     setShowMarket]     = useState(false);
  const [marketLoading,  setMarketLoading]  = useState(false);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysisResult | null>(null);
  const [marketContext,  setMarketContext]  = useState(""); // ready-to-inject block; sent with generate
  const [marketError,    setMarketError]    = useState("");

  // #6 — Available Kadence synced patterns on the target site (/api/content/patterns)
  const [availablePatterns, setAvailablePatterns] = useState<Array<{ id: number; title: string; slug: string }>>([]);
  const [patternsLoading,   setPatternsLoading]   = useState(false);
  const [patternsNote,      setPatternsNote]      = useState("");
  const [patternMode,       setPatternMode]       = useState<"auto" | "manual">("auto");
  const [selectedPatternIds, setSelectedPatternIds] = useState<number[]>([]);

  // Media Hub brand name: auto-populate from selected site; stop once operator edits manually
  const [brandNameTouched, setBrandNameTouched] = useState(false);

  // Trending keywords panel
  const [showTrending,    setShowTrending]    = useState(false);
  const [trendGeo,        setTrendGeo]        = useState("TW");
  const [trendingItems,   setTrendingItems]   = useState<Array<{ title: string; traffic: string; relatedQueries: string[]; source?: string }>>([]);
  const [trendLoading,    setTrendLoading]    = useState(false);
  const [suggestResults,  setSuggestResults]  = useState<string[]>([]);
  const [questionResults, setQuestionResults] = useState<string[]>([]);
  const [trendTab,        setTrendTab]        = useState<"trending" | "suggest" | "questions" | "sources">("trending");

  // Operator-managed trending sources (migration 0042 / /api/content/sources)
  const [trendSources,    setTrendSources]    = useState<Array<{ id: string; label: string; url: string; geos: string[] | "*"; enabled: boolean }>>([]);
  const [sourcesLoading,  setSourcesLoading]  = useState(false);
  const [sourcesError,    setSourcesError]    = useState("");
  const [newSourceLabel,  setNewSourceLabel]  = useState("");
  const [newSourceUrl,    setNewSourceUrl]    = useState("");
  const [addingSource,    setAddingSource]    = useState(false);

  // Image generation
  const [showImgGen,      setShowImgGen]      = useState(false);
  const [imgPrompt,       setImgPrompt]       = useState("");
  const [imgPlatform,     setImgPlatform]     = useState("instagram_square");
  const [imgLoading,      setImgLoading]      = useState(false);
  const [imgResult,       setImgResult]       = useState<{ imageUrl: string; spec: { label: string; width: number; height: number } } | null>(null);
  const [imgError,        setImgError]        = useState("");

  // Per-article cost tracking (client-side accumulation)
  // Types imported from CostChip — single source of truth.
  const [sessionCost, setSessionCost] = useState<import("./CostChip").SessionCost | null>(null);
  // Stable UUID shared by all API calls in one generation cycle — ties rows in ai_call_logs / ai_image_jobs.
  const jobIdRef = React.useRef<string | null>(null);
  function addCostLine(line: import("./CostChip").CostLineItem) {
    setSessionCost(prev => {
      const lines = [...(prev?.lines ?? []), line];
      const textUsd  = lines.filter(l => l.kind === "text").reduce((s, l) => s + l.usd, 0);
      const imageUsd = lines.filter(l => l.kind === "image").reduce((s, l) => s + l.usd, 0);
      return { lines, totalUsd: textUsd + imageUsd, textUsd, imageUsd };
    });
  }

  // Generate
  const [form, setForm]           = useState<GenerateForm>(DEFAULT_FORM);
  const [generated, setGenerated] = useState("");
  const [metaData,  setMetaData]  = useState<MetaData | null>(null);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError,  setGenError]  = useState("");
  const [genTruncated, setGenTruncated] = useState(false);

  // Article preview toggle (false = raw markdown editor, true = rendered HTML preview)
  const [showPreview, setShowPreview] = useState(false);

  // Publish
  const [pubStatus,    setPubStatus]    = useState<PubStatus>("idle");
  const [pubResult,    setPubResult]    = useState<{ edit_url?: string; view_url?: string } | null>(null);
  const [pubError,     setPubError]     = useState("");
  const [pubMode,      setPubMode]      = useState<"draft" | "publish" | "future">("draft");
  const [scheduleDate, setScheduleDate] = useState("");   // ISO datetime for "future" mode
  // post_id returned by WP after publish — used for video embed patch
  const [publishedPostId, setPublishedPostId] = useState<number | null>(null);

  // Video fire-and-forget state (decoupled from article publish)
  const [videoStatus, setVideoStatus] = useState<"idle" | "generating" | "embedding" | "done" | "error">("idle");
  const [videoError,  setVideoError]  = useState("");
  const [videoJobId,  setVideoJobId]  = useState("");
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Clear interval on unmount to prevent state updates on an unmounted component.
  useEffect(() => () => { if (videoPollRef.current) clearInterval(videoPollRef.current); }, []);

  // Video config (mirrors tools/video config panel)
  const [videoTotalScenes,  setVideoTotalScenes]  = useState<number>(ARTICLE_VIDEO_DEFAULTS.sceneCount);
  const [videoCustomScenes, setVideoCustomScenes] = useState<number>(ARTICLE_VIDEO_DEFAULTS.customScenes);
  const [videoImageModel,   setVideoImageModel]   = useState<string>(ARTICLE_VIDEO_DEFAULTS.imageModel);
  const [videoVoiceId,      setVideoVoiceId]      = useState(VOICE_MODELS_VIDEO[0].id);
  const [videoStyleZh,      setVideoStyleZh]      = useState("");
  const [videoStyleGroup,   setVideoStyleGroup]   = useState(VIDEO_STYLE_GROUPS[0] ?? "");
  const [videoConfigOpen,   setVideoConfigOpen]   = useState(false);
  // 輸出比例（勾選；預設只 16:9，WP 嵌入用；其他格式走社群發佈）。
  const [videoFormats,      setVideoFormats]      = useState<Set<string>>(new Set(ARTICLE_VIDEO_DEFAULTS.formats));
  // Output URLs keyed by format ("16x9"|"9x16"|"4x5") — populated after video generation polling completes.
  const [videoOutputUrls,   setVideoOutputUrls]   = useState<Record<string, string>>({});

  // Auto-trigger video generation when article is published.
  // Dep array intentionally omits videoStatus: we want this to fire only on pubStatus/postId change,
  // not when videoStatus changes (which would re-fire after the video finishes and resets to idle).
  // The `videoStatus === "idle"` guard inside reads the closure value at fire time — sufficient to
  // prevent double-trigger since React batches the setState calls that produce pubStatus==="done".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (video && pubStatus === "done" && publishedPostId !== null && videoStatus === "idle" && form.media.youtubeSource === "ai-video") {
      void handleGenerateVideo(publishedPostId);
    }
  }, [pubStatus, publishedPostId]); // eslint-disable-line react-hooks/exhaustive-deps

  // SEO check
  const [seoReport,   setSeoReport]   = useState<RankMathReport | null>(null);
  const [seoChecking, setSeoChecking] = useState(false);

  // Slug hint (parsed from <!-- SLUG_HINT: ... --> in generated article)
  const [slugHint, setSlugHint] = useState("");

  // Draft persistence (migration 0041). draftId tracks the currently-loaded/saved row so a
  // re-save updates instead of duplicating; "" = unsaved. saveState drives the header indicator.
  const [draftId,      setDraftId]      = useState("");
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [drafts,       setDrafts]       = useState<DraftListItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError,  setDraftsError]  = useState("");
  const draftSaveRef = useRef(0);

  // Auto-image generation counter (0 = idle, N = N images pending)
  const [autoImgN, setAutoImgN] = useState(0);
  // Last image-gen rejection surfaced to the user (ok:false from /api/content/image, or a thrown
  // network error). "" = no warning. Set by autoReplaceImages / generateHeroImage so a dropped
  // reference image or a missing-key/timeout failure isn't silently swallowed.
  const [imgGenWarn, setImgGenWarn] = useState("");

  // YouTube placeholder resolution (Phase 2): per-placeholder URL the operator pastes. No YouTube
  // Data API key yet, so resolution is manual — auto-search is deferred to the Phase 4 daily pipeline.
  const [ytUrlInputs, setYtUrlInputs] = useState<Record<string, string>>({});

  // Dedicated hero / featured image (issue 四) — generated at generation time, threaded to publish.
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroLoading,  setHeroLoading]  = useState(false);

  // Title suggestions
  const [titleLoading, setTitleLoading]   = useState(false);
  const [titleSugs,    setTitleSugs]      = useState<string[]>([]);
  const [showTitleDrop, setShowTitleDrop] = useState(false);

  // NLP keywords
  const [kwLoading, setKwLoading]   = useState(false);
  const [kwSugs,    setKwSugs]      = useState<string[]>([]);
  const [showKwDrop, setShowKwDrop] = useState(false);

  // Hook brief AI suggestions: map of hook type → generated brief text
  const [hookBriefLoading,  setHookBriefLoading]  = useState(false);
  const [hookBriefSugs,     setHookBriefSugs]     = useState<Record<string, string>>({});
  // Selected hook types for batch brief generation (multi-select)
  const [hookTypesSelected, setHookTypesSelected] = useState<Set<string>>(new Set());

  // Categories / tags chip UI — site's existing taxonomy (fetched on site change)
  const [siteCategories, setSiteCategories] = useState<string[]>([]);
  const [siteTags,       setSiteTags]       = useState<string[]>([]);

  // Outline auto-generate
  const [outlineLoading, setOutlineLoading] = useState(false);

  // Section open state
  const [showNlp,      setShowNlp]      = useState(false);
  const [showCatTags,  setShowCatTags]  = useState(false);
  const [showOutline,  setShowOutline]  = useState(false);
  const [showExtLinks, setShowExtLinks] = useState(false);
  const [showIntLinks, setShowIntLinks] = useState(false);
  const [showConnWeb,  setShowConnWeb]  = useState(false);
  const [showStruct,   setShowStruct]   = useState(true);
  const [showMedia,    setShowMedia]    = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAudProfile, setShowAudProfile] = useState(false); // audience chip UI (above #4)
  const [showMarketing, setShowMarketing] = useState(false); // #4 structured brand-tone form
  const [showPatterns, setShowPatterns] = useState(false);   // #6 Kadence funnel patterns
  const [apState, setApState] = useState<AP>(DEFAULT_AP);   // audience profile chips
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [saveDefaultsMsg, setSaveDefaultsMsg] = useState<string | null>(null);

  // Syndication
  const [showSyn,     setShowSyn]     = useState(false);
  const [synEnabled,  setSynEnabled]  = useState<Record<string, boolean>>({});
  const [twitterMode, setTwitterMode] = useState<"single" | "thread">("single");
  const [synStatus,   setSynStatus]   = useState<SynStatus>("idle");
  const [synContent,  setSynContent]  = useState<Record<string, string>>({});
  const [synCopied,   setSynCopied]   = useState<Record<string, boolean>>({});

  // "none" = text-only | "image" = attach hero/social image | "video" = attach generated video (per-platform format routing)
  // Document-level property — controls the copy generation style. Positioned before generate button.
  const [distMediaType,      setDistMediaType]      = useState<"none" | "image" | "video">("none");
  // true when distMediaType changed after copy was generated → prompt user to re-generate
  const [synStale,           setSynStale]           = useState(false);

  // Mark copy stale when distribution media type changes after copy already generated
  useEffect(() => {
    if (synStatus === "done") setSynStale(true);
  }, [distMediaType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Newsletter (FluentCRM draft push — draft only, never sends; wp-bridge /newsletter)
  const [nlStatus, setNlStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [nlResult, setNlResult] = useState<{ edit_url?: string; error?: string } | null>(null);
  const [nlArticleUrl, setNlArticleUrl] = useState<string>(""); // 公開文章網址（電子報 CTA 連結用，U-FluentCRM）

  // Humanize
  const [humMode,    setHumMode]    = useState<HumMode>("humanize");
  const [humInput,   setHumInput]   = useState("");
  const [humLang,    setHumLang]    = useState("English");
  const [humRead,    setHumRead]    = useState("8th grade (recommended)");
  const [humAiWords, setHumAiWords] = useState<RemoveAI>("basic");
  const [humOutput,  setHumOutput]  = useState("");
  const [humStatus,  setHumStatus]  = useState<HumStatus>("idle");
  const [humError,   setHumError]   = useState("");

  // Abort refs
  const abortRef     = useRef<AbortController | null>(null);
  const humAbortRef  = useRef<AbortController | null>(null);
  const seoRunRef    = useRef(0);
  const imgRunRef    = useRef(0);

  // ─── Load WP sites ────────────────────────────────────────────────────────
  // 只負責把清單載進來。**刻意不在這裡決定選哪個站** —— 見下面那個 effect 的說明。
  useEffect(() => {
    fetch("/api/content/sites")
      .then(r => r.json())
      .then((data: { ok: boolean; sites?: ManagedSite[] }) => {
        if (!data.ok) return;              // 載入失敗 ≠ 清單為空，不可混為一談
        setWpSites(data.sites ?? []);
        setSitesLoaded(true);
      })
      .catch(() => {/* silent — single-site env works without this */});
  }, []);

  /**
   * 「選中哪個站」的決定點 —— **只有這裡**。
   *
   * 不變量：選中的站必須是 (目前的 URL siteId, 目前可用的站清單) 的**函式**：任一輸入改變就
   * 重算，而且**每個分支都要算**。這條不變量是被兩次覆審逼出來的，兩次都是同一個實作缺陷的
   * 不同表現形式：
   *   ① 原本這段算在 fetch 的 .then() 裡、effect 綁 []，於是「掛載後 URL 才變成另一個
   *      ?siteId=」不會重算（App Router 同路由換 query 不會 remount，ClientHubTabs.tsx:606
   *      就有這種連結）。
   *   ② 原本外面包著 `if (data.ok && data.sites?.length)`，於是「清單被 active／租戶過濾成
   *      空」時整段被跳過，pickInitialSite 根本沒被呼叫 —— 純函式處理得對，接線卻沒去問它，
   *      使用者連「你指定的站取不到」都看不到。
   * 把決定從載入裡拆出來之後，這兩種形狀在結構上都回不來了。
   */
  useEffect(() => {
    if (!sitesLoaded) return;              // 還沒載完就判定「取不到」會是假警報
    const picked = pickInitialSite(wpSites, paramSiteId);
    setSelectedSiteId(picked.selectedId);
    setUnresolvedSiteParam(picked.unresolvedRequest);
    // wpSites 本身刻意**不**放進依賴：決策的輸入只有「URL 要哪個站」與「有哪些站可選」，
    // 站的*內容*變了不是決策輸入。saveAsClientDefault() 成功後會 setWpSites(prev.map(...))
    // 更新該列的 contentDefaults —— 那會產生新的陣列 identity，若它是依賴，這個 effect 就會
    // 重跑並把操作者手動選的站踢回 URL 指定的那一個。用 id 集合當依賴才是決策的真實輸入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitesLoaded, siteIdsKey, paramSiteId]);

  // Brand Voice name follows the selected target client (📍 目標客戶) — so the operator never
  // re-types "Soulful Expression". Stops the moment they edit the field manually (bvNameTouched).
  useEffect(() => {
    if (bvNameTouched) return;
    if (currentSite?.name) setBvProfileName(currentSite.name);
  }, [currentSite, bvNameTouched]);

  // #2 — Brand-voice sample URL follows the selected client's site URL (operator reported it was not
  // auto-filling). We default to the site's /about page (the richest brand-voice source); cleared the
  // moment the operator edits the field manually (bvUrlTouched). Mirrors the name auto-fill above.
  useEffect(() => {
    if (bvUrlTouched) return;
    if (currentSite?.url) setBvSampleUrl(`${currentSite.url.replace(/\/$/, "")}/about`);
  }, [currentSite, bvUrlTouched]);

  // Media Hub Brand Name follows the selected site — saves operator from re-typing every time.
  useEffect(() => {
    if (brandNameTouched) return;
    if (currentSite?.name) setMedia("brandName", currentSite.name.slice(0, 30));
  }, [currentSite, brandNameTouched]);

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const setF = useCallback(
    <K extends keyof GenerateForm>(key: K, value: GenerateForm[K]) =>
      setForm(prev => ({ ...prev, [key]: value })),
    []
  );
  const setStruct = useCallback(
    (key: keyof ArticleStructure, value: boolean) =>
      setForm(prev => ({ ...prev, structure: { ...prev.structure, [key]: value } })),
    []
  );
  const setMedia = useCallback(
    <K extends keyof MediaHub>(key: K, value: MediaHub[K]) =>
      setForm(prev => ({ ...prev, media: { ...prev.media, [key]: value } })),
    []
  );
  const setMkt = useCallback(
    <K extends keyof MarketingBrief>(key: K, value: MarketingBrief[K]) =>
      setForm(prev => ({ ...prev, marketing: { ...prev.marketing, [key]: value } })),
    []
  );

  // Audience profile chip helpers
  function toggleSingleAP(field: keyof AP, val: string) {
    setApState(ap => {
      const cur = ap[field] as string | string[] | undefined;
      const arr = Array.isArray(cur) ? cur : [];
      return { ...ap, [field]: arr.includes(val) ? [] : [val] };
    });
  }
  function toggleMultiAP(field: keyof AP, val: string) {
    setApState(ap => {
      const arr = (ap[field] as string[] | undefined) ?? [];
      return { ...ap, [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }
  function setSingleAP(field: keyof AP, val: string) {
    setApState(ap => ({ ...ap, [field]: ap[field] === val ? undefined : val }));
  }
  function applyAPPreset(sel: Record<string, string[]>) {
    setApState(ap => ({ ...ap, ...sel, jobCustom: undefined, emotionCustom: undefined }));
  }

  // ─── Suggest titles ────────────────────────────────────────────────────────

  async function handleSuggestTitles() {
    if (!form.keyword.trim() || titleLoading) return;
    setTitleLoading(true);
    try {
      const res  = await fetch("/api/content/title", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, language: form.language, articleType: form.articleType }),
      });
      const json = await res.json() as { ok: boolean; titles?: string[]; _cost?: { usd: number; model: string; vendor: string } };
      if (json.ok && json.titles?.length) { setTitleSugs(json.titles); setShowTitleDrop(true); }
      if (json._cost) addCostLine({ route: "content/title", model: json._cost.model, vendor: json._cost.vendor, usd: json._cost.usd, kind: "text" });
    } catch { /* silent */ } finally { setTitleLoading(false); }
  }

  // ─── Auto-generate NLP keywords ──────────────────────────────────────────

  async function handleGenKeywords() {
    if (!form.keyword.trim() || kwLoading) return;
    setKwLoading(true);
    try {
      const res  = await fetch("/api/content/keywords", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, language: form.language, articleType: form.articleType }),
      });
      const json = await res.json() as { ok: boolean; keywords?: string[]; _cost?: { usd: number; model: string; vendor: string } };
      if (json.ok && json.keywords?.length) { setKwSugs(json.keywords); setShowKwDrop(true); }
      if (json._cost) addCostLine({ route: "content/keywords", model: json._cost.model, vendor: json._cost.vendor, usd: json._cost.usd, kind: "text" });
    } catch { /* silent */ } finally { setKwLoading(false); }
  }

  // ─── Hook Brief AI suggestions (batch — one call for all selected types) ────

  async function handleGenHookBriefs() {
    const types = hookTypesSelected.size > 0 ? [...hookTypesSelected] : [form.introHookType].filter(Boolean);
    if (!types.length || !form.keyword.trim() || hookBriefLoading) return;
    setHookBriefLoading(true);
    try {
      const res  = await fetch("/api/content/hook-brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, language: form.language, articleType: form.articleType, hookTypes: types }),
      });
      const json = await res.json() as { ok: boolean; briefs?: Record<string, string>; _cost?: { usd: number; model: string; vendor: string } };
      if (json.ok && json.briefs) {
        setHookBriefSugs(prev => ({ ...prev, ...json.briefs }));
        // If only one type selected/returned, auto-fill the brief textarea and select the type
        const entries = Object.entries(json.briefs ?? {});
        if (entries.length === 1) {
          const [t, brief] = entries[0];
          setF("introHookType", t);
          setF("introHookBrief", brief);
        }
      }
      if (json._cost) addCostLine({ route: "content/hook-brief", model: json._cost.model, vendor: json._cost.vendor, usd: json._cost.usd, kind: "text" });
    } catch { /* silent */ } finally { setHookBriefLoading(false); }
  }

  // ─── Auto-generate Outline ────────────────────────────────────────────────

  async function handleGenOutline() {
    if (!form.keyword.trim() || outlineLoading) return;
    setOutlineLoading(true);
    try {
      const res  = await fetch("/api/content/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, title: form.title, language: form.language, articleType: form.articleType, articleSize: form.articleSize }),
      });
      const json = await res.json() as { ok: boolean; outline?: string; _cost?: { usd: number; model: string; vendor: string } };
      if (json.ok && json.outline) { setF("outline", json.outline); if (!showOutline) setShowOutline(true); }
      if (json._cost) addCostLine({ route: "content/outline", model: json._cost.model, vendor: json._cost.vendor, usd: json._cost.usd, kind: "text" });
    } catch { /* silent */ } finally { setOutlineLoading(false); }
  }

  // ─── Trending Keywords ───────────────────────────────────────────────────────

  async function fetchTrending() {
    setTrendLoading(true);
    try {
      const res  = await fetch(`/api/content/trending?type=trending&geo=${trendGeo}`);
      const data = await res.json() as { ok: boolean; items?: Array<{ title: string; traffic: string; relatedQueries: string[] }> };
      if (data.ok) setTrendingItems(data.items ?? []);
    } catch { /* silent */ }
    finally { setTrendLoading(false); }
  }

  async function fetchSuggest(kw: string) {
    if (!kw.trim()) return;
    setTrendLoading(true);
    const hl = (form.language === "繁體中文" || form.language === "簡體中文") ? "zh-TW" : "en";
    try {
      const res  = await fetch(`/api/content/trending?type=suggest&q=${encodeURIComponent(kw)}&hl=${hl}`, { method: "POST" });
      const data = await res.json() as { ok: boolean; suggestions?: string[] };
      if (data.ok) setSuggestResults(data.suggestions ?? []);
    } catch { /* silent */ }
    finally { setTrendLoading(false); }
  }

  async function fetchQuestions(kw: string) {
    if (!kw.trim()) return;
    setTrendLoading(true);
    const hl = (form.language === "繁體中文" || form.language === "簡體中文") ? "zh-TW" : "en";
    try {
      const res  = await fetch(`/api/content/trending?type=questions&q=${encodeURIComponent(kw)}&hl=${hl}`, { method: "POST" });
      const data = await res.json() as { ok: boolean; questions?: string[] };
      if (data.ok) setQuestionResults(data.questions ?? []);
    } catch { /* silent */ }
    finally { setTrendLoading(false); }
  }

  function pickTrendKeyword(kw: string) {
    setActiveTab("generate");
    setF("keyword", kw);
    setShowTrending(false);
  }

  // ─── Trending source management (migration 0042) ──────────────────────────

  async function loadSources() {
    setSourcesLoading(true); setSourcesError("");
    try {
      const res  = await fetch("/api/content/sources");
      const json = await res.json() as { ok: boolean; sources?: typeof trendSources; error?: string };
      if (json.ok && json.sources) setTrendSources(json.sources);
      else setSourcesError(json.error ?? "讀取失敗");
    } catch { setSourcesError("網路錯誤，請重試"); }
    finally { setSourcesLoading(false); }
  }

  async function addSource() {
    const label = newSourceLabel.trim();
    const url   = newSourceUrl.trim();
    if (!label || !url || addingSource) return;
    setAddingSource(true); setSourcesError("");
    try {
      const res  = await fetch("/api/content/sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url }),
      });
      const json = await res.json() as { ok: boolean; source?: typeof trendSources[number]; error?: string };
      if (json.ok && json.source) {
        setTrendSources(prev => [json.source!, ...prev]);
        setNewSourceLabel(""); setNewSourceUrl("");
      } else setSourcesError(json.error ?? "新增失敗");
    } catch { setSourcesError("網路錯誤，請重試"); }
    finally { setAddingSource(false); }
  }

  async function toggleSource(id: string, enabled: boolean) {
    try {
      const res  = await fetch("/api/content/sources", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const json = await res.json() as { ok: boolean; source?: typeof trendSources[number] };
      if (json.ok && json.source) setTrendSources(prev => prev.map(s => s.id === id ? json.source! : s));
    } catch { /* silent — refresh reconciles */ }
  }

  async function deleteSource(id: string) {
    try {
      const res  = await fetch(`/api/content/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json() as { ok: boolean };
      if (json.ok) setTrendSources(prev => prev.filter(s => s.id !== id));
    } catch { /* silent */ }
  }

  // Load sources when the management subtab opens.
  useEffect(() => {
    if (showTrending && trendTab === "sources") void loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrending, trendTab]);


  // ─── Brand Voice ─────────────────────────────────────────────────────────

  async function handleAnalyzeBrandVoice() {
    if (!bvSampleText.trim() && !bvSampleUrl.trim()) return;
    setBvLoading(true); setBvError(""); setBvProfile(null); setBvApplied(false);
    try {
      const res  = await fetch("/api/content/brand-voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bvSampleText, url: bvSampleUrl, name: bvProfileName }),
      });
      const json = await res.json() as { ok: boolean; profile?: BrandVoiceProfile; error?: string };
      if (!json.ok || !json.profile) { setBvError(json.error ?? "分析失敗"); }
      else { setBvProfile(json.profile); }
    } catch { setBvError("網路錯誤，請重試"); }
    finally { setBvLoading(false); }
  }

  function handleApplyBrandVoice() {
    if (!bvProfile) return;
    const existing = form.details.trim();
    const voiceBlock = `=== 品牌聲音（${bvProfile.name}）===\n${bvProfile.promptInjection}\n偏好用詞：${bvProfile.preferWords.join("、")}\n避免用詞：${bvProfile.avoidWords.join("、")}`;
    setF("details", existing ? `${existing}\n\n${voiceBlock}` : voiceBlock);
    setBvApplied(true);
  }

  // ─── #5 Market analysis (competitor + pain-point) ──────────────────────────

  async function handleMarketAnalysis() {
    if (!form.keyword.trim() || marketLoading) return;
    setMarketLoading(true); setMarketError(""); setMarketAnalysis(null); setMarketContext("");
    const brand = bvProfileName || currentSite?.name || "";
    try {
      const res  = await fetch("/api/content/market-analysis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, brand, audience: form.marketing.audience, language: form.language }),
      });
      const json = await res.json() as { ok: boolean; analysis?: MarketAnalysisResult; context?: string; error?: string; _cost?: { usd: number; model: string; vendor: string } };
      if (!json.ok || !json.analysis) { setMarketError(json.error ?? "分析失敗"); }
      else { setMarketAnalysis(json.analysis); setMarketContext(json.context ?? ""); }
      if (json._cost) addCostLine({ route: "content/market-analysis", model: json._cost.model, vendor: json._cost.vendor, usd: json._cost.usd, kind: "text" });
    } catch { setMarketError("網路錯誤，請重試"); }
    finally { setMarketLoading(false); }
  }

  // ─── #6 Load available Kadence synced patterns for the selected site ───────

  const loadPatterns = useCallback(async () => {
    // 不帶 siteId 時伺服器會挑「第一個可存取的站」，於是沒選定客戶時會抓到**別的客戶**的
    // patterns 並混進文章。與下面 categories/tags 的既有作法一致：沒選定就不抓。
    if (!selectedSiteId) { setAvailablePatterns([]); setPatternsNote("尚未選擇目標客戶"); return; }
    setPatternsLoading(true); setPatternsNote("");
    try {
      const res  = await fetch(`/api/content/patterns?siteId=${encodeURIComponent(selectedSiteId)}`);
      const json = await res.json() as { ok: boolean; patterns?: Array<{ id: number; title: string; slug: string }>; note?: string };
      if (json.ok && json.patterns) {
        setAvailablePatterns(json.patterns);
        setSelectedPatternIds(prev => prev.filter(id => json.patterns!.some(p => p.id === id)));
      }
      if (json.note) setPatternsNote(json.note);
    } catch { setPatternsNote("網路錯誤，請重試"); }
    finally { setPatternsLoading(false); }
  }, [selectedSiteId]);

  // #6 — (re)load available Kadence patterns when the funnel section is open and the target site changes.
  useEffect(() => {
    if (showPatterns) void loadPatterns();
  }, [showPatterns, loadPatterns]);

  // Fetch site categories & tags when selected site changes (chip UI)
  useEffect(() => {
    if (!selectedSiteId) return;
    void (async () => {
      try {
        const [catRes, tagRes] = await Promise.all([
          fetch(`/api/content/categories?siteId=${encodeURIComponent(selectedSiteId)}`),
          fetch(`/api/content/tags?siteId=${encodeURIComponent(selectedSiteId)}`),
        ]);
        const catJson = await catRes.json() as { ok: boolean; categories?: string[] };
        const tagJson = await tagRes.json() as { ok: boolean; tags?: string[] };
        if (catJson.ok && catJson.categories) setSiteCategories(catJson.categories);
        if (tagJson.ok && tagJson.tags) setSiteTags(tagJson.tags);
      } catch { /* silent — chips just won't pre-populate */ }
    })();
  }, [selectedSiteId]);

  // Auto-fill Content Studio defaults from the selected site's contentDefaults.
  // Only fills fields that are currently EMPTY — never overwrites operator-entered values.
  useEffect(() => {
    const site = wpSites.find(s => s.id === selectedSiteId);
    const d = site?.contentDefaults;
    if (!d) return;
    setForm(prev => {
      const next = { ...prev };
      if (d.language      && prev.language      === DEFAULT_FORM.language)      next.language      = d.language;
      if (d.targetCountry && prev.targetCountry === DEFAULT_FORM.targetCountry) next.targetCountry = d.targetCountry;
      if (d.tone          && prev.tone          === DEFAULT_FORM.tone)          next.tone          = d.tone;
      if (d.articleType   && prev.articleType   === DEFAULT_FORM.articleType)   next.articleType   = d.articleType;
      if (d.readability   && prev.readability   === DEFAULT_FORM.readability)   next.readability   = d.readability;
      if (d.pointOfView   && prev.pointOfView   === DEFAULT_FORM.pointOfView)   next.pointOfView   = d.pointOfView;
      if (d.imageModel    && prev.media.aiImages === DEFAULT_MEDIA.aiImages)
        next.media = { ...prev.media, aiImages: d.imageModel };
      if (d.brandVoiceInstructions && !prev.details.trim())
        next.details = d.brandVoiceInstructions;
      if (d.marketing) {
        const m = { ...prev.marketing };
        const dm = d.marketing;
        if (dm.audience          && !m.audience.trim())          m.audience          = dm.audience;
        if (dm.positioning       && !m.positioning.trim())       m.positioning       = dm.positioning;
        if (dm.usp               && !m.usp.trim())               m.usp               = dm.usp;
        if (dm.primaryCta        && !m.primaryCta.trim())        m.primaryCta        = dm.primaryCta;
        if (dm.funnelStage       && !m.funnelStage)              m.funnelStage       = dm.funnelStage;
        if (dm.pricePositioning  && !m.pricePositioning)         m.pricePositioning  = dm.pricePositioning;
        if (dm.emotionalTriggers && !m.emotionalTriggers.trim()) m.emotionalTriggers = dm.emotionalTriggers;
        if (dm.objections        && !m.objections.trim())        m.objections        = dm.objections;
        if (dm.forbiddenClaims   && !m.forbiddenClaims.trim())   m.forbiddenClaims   = dm.forbiddenClaims;
        next.marketing = m;
      }
      return next;
    });
    // Pre-select audience profile chips from saved site defaults
    if (site?.contentDefaults?.audienceProfile) {
      setApState(site.contentDefaults.audienceProfile);
    }
  }, [selectedSiteId, wpSites]);

  // Chips → compile audience text into form.marketing.audience
  useEffect(() => {
    const ap = apState;
    const parts: string[] = [];
    if (ap.age?.length)       parts.push(`年齡層：${ap.age.join('、')}`);
    if (ap.gender?.length)    parts.push(`性別：${ap.gender.join('、')}`);
    const job = [...(ap.job ?? []), ...(ap.jobCustom?.trim() ? [ap.jobCustom.trim()] : [])];
    if (job.length)           parts.push(`職業／身分：${job.join('、')}`);
    const emo = [...(ap.emotion ?? []), ...(ap.emotionCustom?.trim() ? [ap.emotionCustom.trim()] : [])];
    if (emo.length)           parts.push(`情緒狀態：${emo.join('、')}`);
    if (ap.awareness?.length) parts.push(`對主題熟悉度：${ap.awareness.join('、')}`);
    if (ap.spending?.length)  parts.push(`消費力：${ap.spending.join('、')}`);
    if (ap.contentGoal)       parts.push(`內容目標：${ap.contentGoal}`);
    if (ap.contentTone)       parts.push(`語氣偏向：${ap.contentTone}`);
    if (ap.audienceAction)    parts.push(`期望觀眾行動：${ap.audienceAction}`);
    const text = parts.join('；');
    if (text) setForm(prev => ({ ...prev, marketing: { ...prev.marketing, audience: text } }));
  }, [apState]);

  // Auto-detect language from keyword: if keyword contains CJK characters and language is still
  // the default "English" (meaning the operator hasn't manually changed it), switch to 繁體中文.
  useEffect(() => {
    if (!form.keyword.trim()) return;
    if (form.language !== "English") return; // operator already chose a language — don't override
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(form.keyword)) {
      setF("language", "繁體中文");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // (form.language intentionally omitted: only re-run when keyword changes; guard reads latest value via closure)
  }, [form.keyword]);

  // ─── Image Generation ─────────────────────────────────────────────────────

  async function handleGenerateImage() {
    if (!imgPrompt.trim()) return;
    setImgLoading(true); setImgError(""); setImgResult(null);
    try {
      const res  = await fetch("/api/content/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imgPrompt, platform: imgPlatform }),
      });
      const json = await res.json() as { ok: boolean; imageUrl?: string; spec?: { label: string; width: number; height: number }; error?: string; cost_usd?: number; model?: string };
      if (!json.ok || !json.imageUrl) { setImgError(json.error ?? "圖片生成失敗"); }
      else {
        setImgResult({ imageUrl: json.imageUrl, spec: json.spec! });
        if (json.cost_usd && json.model) addCostLine({ route: "content/image", model: json.model, vendor: "Image", usd: json.cost_usd, kind: "image" });
      }
    } catch { setImgError("網路錯誤，請重試"); }
    finally { setImgLoading(false); }
  }

  // ─── Generate article ────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!form.keyword.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setGenerated(""); setMetaData(null);
    setSessionCost(null);
    jobIdRef.current = crypto.randomUUID();
    setGenStatus("streaming"); setGenError(""); setGenTruncated(false);
    setPubStatus("idle"); setPubResult(null); setPublishedPostId(null);
    setVideoStatus("idle"); setVideoError("");
    if (videoPollRef.current) { clearInterval(videoPollRef.current); videoPollRef.current = null; }
    setSeoReport(null); setSeoChecking(false);
    setSlugHint(""); setAutoImgN(0); setImgGenWarn(""); // clear here too: autoReplaceImages' clear sits
    // after its no-placeholder early-return, so an image-less re-gen would otherwise keep run A's warning
    setDraftId(""); setDraftSaveState("idle"); // fresh generation → new draft row
    setHeroImageUrl(""); setHeroLoading(false);
    setShowSyn(false); setSynStatus("idle"); setSynContent({});
    setNlStatus("idle"); setNlResult(null);
    // Invalidate any in-flight image/hero writers from a PREVIOUS run NOW — unconditionally, even if
    // this run won't generate images. Bumping only inside the aiImages!=="none" branch let a slow hero
    // fetch from run A resolve and overwrite run B's (image-less) article with a mismatched hero.
    ++imgRunRef.current;

    try {
      const externalLinks = form.externalLinks.split("\n").map(u => u.trim()).filter(u => /^https?:\/\//.test(u)).slice(0, 5);
      const userInternal  = form.internalLinks.split("\n").map(u => u.trim()).filter(u => /^(https?:\/\/|\/)/.test(u));
      const referenceUrls = form.referenceUrls.split("\n").map(u => u.trim()).filter(u => u.startsWith("https://")).slice(0, 3);

      // Auto-fetch REAL related posts from the target site so the model weaves genuine internal
      // links instead of fabricating fake URLs. Best-effort — failure just falls back to user links.
      let autoInternal: string[] = [];
      try {
        // siteId 省略 → 伺服器挑第一個可存取的站，回來的內部連結會是**別的客戶**的網域，
        // 而且會被直接寫進文章內文。沒選定客戶時寧可不要自動內部連結。
        const rp = selectedSiteId ? await fetch("/api/content/related-posts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: form.keyword, siteId: selectedSiteId }),
        }) : null;
        const rpJson = rp ? await rp.json() as { ok: boolean; posts?: Array<{ link: string }> } : null;
        if (rpJson?.ok && rpJson.posts?.length) autoInternal = rpJson.posts.map(p => p.link);
      } catch { /* best-effort: no auto internal links */ }
      const internalLinks = [...new Set([...userInternal, ...autoInternal])].slice(0, 10);

      // #3 — fetch the site's REAL existing categories so the model classifies into them instead of
      // inventing near-duplicates. Best-effort; failure just falls back to the generic CATEGORIES rule.
      let existingCategories: string[] = [];
      try {
        const cr = await fetch(`/api/content/categories${selectedSiteId ? `?siteId=${encodeURIComponent(selectedSiteId)}` : ""}`);
        const crJson = await cr.json() as { ok: boolean; categories?: string[] };
        if (crJson.ok && crJson.categories?.length) existingCategories = crJson.categories;
      } catch { /* best-effort */ }

      // #4 — fold the structured marketing brief into `details` (backend contract unchanged).
      const brief = renderMarketingBrief(form.marketing);
      const rawDetails = form.details.trim();
      const effectiveDetails = brief ? (rawDetails ? `${brief}\n\n${rawDetails}` : brief) : rawDetails;

      // #6 — pattern mode: manual (operator selects specific ids) or auto (AI picks N from all)
      const manualPatterns = availablePatterns.filter(p => selectedPatternIds.includes(p.id));
      const wantPatterns = patternMode === "manual"
        ? manualPatterns.length > 0
        : form.patternCount > 0 && availablePatterns.length > 0;
      const patternsToSend = wantPatterns
        ? (patternMode === "manual" ? manualPatterns : availablePatterns)
        : [];
      const patternCountToSend = wantPatterns
        ? (patternMode === "manual" ? manualPatterns.length : form.patternCount)
        : 0;

      const res = await fetch("/api/content/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Drop the multi-MB img2img reference data URL — generate never reads it (only the image
          // route does), so shipping it here is pure wire bloat (mirrors the draft-save strip).
          // ai-video 模式下後端不插 YouTube placeholder（影片由 embed-to-wp 單獨嵌入）
          media: { ...form.media, imageRefData: "", youtubeSource: form.media.youtubeSource === "ai-video" ? "none" : form.media.youtubeSource },
          details: effectiveDetails,
          externalLinks, internalLinks, referenceUrls,
          existingCategories,              // #3
          marketContext,                   // #5 (empty unless analysis was run)
          patterns: patternsToSend,        // #6
          patternCount: patternCountToSend,
          patternMode,                     // #6 — server uses this to raise the cap in manual mode
          _jobId: jobIdRef.current,        // ledger grouping
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) { setGenStatus("error"); setGenError(`伺服器錯誤：${res.status}`); return; }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        // Filter cost sentinels from live preview (they arrive as the last line(s))
        setGenerated(text.split("\n").filter(l => !l.startsWith("[COST_JSON]")).join("\n"));
      }
      text += dec.decode();

      // Parse and strip [COST_JSON] sentinel lines before article processing
      { const lines = text.split("\n"); const costLines: string[] = []; const bodyLines = lines.filter(l => { if (l.startsWith("[COST_JSON]")) { costLines.push(l.slice("[COST_JSON]".length)); return false; } return true; }); text = bodyLines.join("\n"); for (const cl of costLines) { try { const c = JSON.parse(cl) as { usd: number; model: string; vendor: string; route: string }; addCostLine({ route: c.route, model: c.model, vendor: c.vendor, usd: c.usd, kind: "text" }); } catch { /* ignore */ } } }

      // Detect + strip BOTH server-side markers so neither leaks into the published article body
      // (the standard REST publish path passes pure comment lines through verbatim — critic Major).
      const truncated  = /<!--\s*GENERATION_TRUNCATED:/.test(text);
      const genErrored = /<!--\s*GENERATION_ERROR:/.test(text);
      setGenTruncated(truncated);
      const detrunc = text.replace(/\n*<!--\s*GENERATION_(?:TRUNCATED|ERROR):[^>]*-->/g, "");

      const meta    = extractMeta(detrunc);
      const hint    = extractSlugHint(detrunc);
      const cleanMd = stripSlugHint(meta ? stripMeta(detrunc) : detrunc);
      if (meta) {
        setMetaData(meta);
        // Auto-fill categories/tags from AI suggestion if user hasn't typed anything manually
        if (!form.wpCategories.trim() && meta.categories?.length)
          setF("wpCategories", meta.categories.join(", "));
        if (!form.wpTags.trim() && meta.tags?.length)
          setF("wpTags", meta.tags.join(", "));
      }
      setGenerated(cleanMd);
      setSlugHint(hint);
      // A mid-stream API error arrives as stream CONTENT, not a thrown exception — surface it as an
      // error (not a false "done") and skip SEO-check/image fill on an incomplete article.
      if (genErrored) { setGenStatus("error"); setGenError("產生過程發生錯誤，文章可能不完整，請重試"); return; }
      setGenStatus("done");

      // Autosave the finished draft so it survives reload / regenerate (migration 0041). Best-effort;
      // a failure only flips the header indicator to ✗, never blocks the article. The SEO score is
      // filled in by the seoReport useEffect once the background check resolves.
      void saveDraft({ markdown: cleanMd, meta, slugHint: hint });

      // fire SEO check in background — non-blocking
      const myRun = ++seoRunRef.current;
      setSeoChecking(true);
      // Derive siteDomain so the checker can distinguish internal vs external links when related-posts
      // returns full absolute URLs (e.g. https://soulfulexpression.org/...). Without this, every
      // absolute internal link was counted as external and the internal-links check always failed.
      const _seoSite = currentSite;
      const _siteDomain = _seoSite?.url ? (() => { try { return new URL(_seoSite.url).hostname; } catch { return undefined; } })() : undefined;
      fetch("/api/content/seo-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: cleanMd,
          focusKeyword: form.keyword,
          seoTitle: meta?.seoTitle ?? "",
          metaDescription: meta?.metaDesc ?? "",
          slug: hint || slugify(form.keyword),
          siteDomain: _siteDomain,
        }),
      })
        .then(r => r.ok ? r.json() as Promise<RankMathReport> : null)
        .then(j => { if (j && myRun === seoRunRef.current) setSeoReport(j); })
        .catch(() => { if (myRun === seoRunRef.current) setSeoReport(null); })
        .finally(() => { if (myRun === seoRunRef.current) setSeoChecking(false); });

      // Auto-replace IMAGE_PLACEHOLDERs via Replicate if AI images enabled. imgRunRef was already
      // bumped at the top of this run (see reset block); capture it here without bumping again.
      if (form.media.aiImages !== "none") {
        const myImgRun = imgRunRef.current;
        void autoReplaceImages(cleanMd, myImgRun);
        // Issue 四: also generate a dedicated hero/featured image (OG ratio) for the post thumbnail.
        void generateHeroImage(meta?.seoTitle || form.title || form.keyword, myImgRun);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") setGenStatus("idle");
      else { setGenStatus("error"); setGenError("產生失敗，請重試"); }
    }
  }

  // ─── Draft persistence (migration 0041) ──────────────────────────────────

  // site_id column is uuid; env-source sites carry synthetic non-uuid ids → only forward real uuids
  // so a save never 500s on "invalid input syntax for type uuid".
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Upsert the current article. Pass the freshly-computed values explicitly (React state from the
  // same tick is stale). Returns the row id so a follow-up SEO-score save can target the same row.
  const saveDraft = useCallback(async (payload: {
    markdown: string; meta: MetaData | null; slugHint: string; seoScore?: number | null;
  }): Promise<string | null> => {
    const kw = form.keyword.trim();
    if (!kw || !payload.markdown.trim()) return null;
    const myRun = ++draftSaveRef.current;
    setDraftSaveState("saving");
    try {
      const res = await fetch("/api/content/drafts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId || undefined,
          keyword: kw,
          title: payload.meta?.seoTitle || form.title || null,
          language: form.language,
          articleType: form.articleType,
          markdown: payload.markdown,
          meta: payload.meta,
          slugHint: payload.slugHint || null,
          seoScore: payload.seoScore ?? null,
          // Persist the form but drop the reference-image data URL — it's a transient img2img input
          // (multi-MB base64) that would bloat every autosave row; it never needs to survive a reload.
          formSnapshot: { ...form, media: { ...form.media, imageRefData: "" } },
          siteId: UUID_RE.test(selectedSiteId) ? selectedSiteId : undefined,
        }),
      });
      const json = await res.json() as { ok: boolean; draft?: { id: string } };
      if (myRun !== draftSaveRef.current) return null; // a newer save superseded this one
      if (json.ok && json.draft) {
        setDraftId(json.draft.id);
        setDraftSaveState("saved");
        return json.draft.id;
      }
      setDraftSaveState("error");
      return null;
    } catch {
      if (myRun === draftSaveRef.current) setDraftSaveState("error");
      return null;
    }
  }, [form, draftId, selectedSiteId]);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true); setDraftsError("");
    try {
      const qs  = (selectedSiteId && UUID_RE.test(selectedSiteId)) ? `?siteId=${encodeURIComponent(selectedSiteId)}` : "";
      const res  = await fetch(`/api/content/drafts${qs}`);
      const json = await res.json() as { ok: boolean; drafts?: DraftListItem[]; error?: string };
      if (json.ok && json.drafts) setDrafts(json.drafts);
      else setDraftsError(json.error ?? "讀取失敗");
    } catch { setDraftsError("網路錯誤，請重試"); }
    finally { setDraftsLoading(false); }
  }, [selectedSiteId]);

  // Re-open a saved draft into the generate editor (full fetch: markdown + meta + form snapshot).
  async function openDraft(id: string) {
    try {
      const res  = await fetch(`/api/content/drafts?id=${encodeURIComponent(id)}`);
      const json = await res.json() as {
        ok: boolean;
        draft?: {
          id: string; markdown: string; meta: MetaData | null; slugHint: string | null;
          formSnapshot: GenerateForm | null; keyword: string;
        };
      };
      if (!json.ok || !json.draft) { setDraftsError("草稿開啟失敗"); return; }
      const d = json.draft;
      // Restore the form snapshot (fall back to a minimal form if an old row lacks one).
      if (d.formSnapshot) {
        const restored = { ...DEFAULT_FORM, ...d.formSnapshot };
        // Normalize removed youtubeSource values ("auto" was removed in 2026-06) to "none"
        if (!["none", ...(video ? ["ai-video"] : [])].includes(restored.media?.youtubeSource)) {
          restored.media = { ...restored.media, youtubeSource: "none" };
        }
        setForm(restored);
        // If the snapshot has a non-empty brandName, lock it so the auto-populate effect
        // doesn't overwrite it with the site name after restore.
        if (d.formSnapshot.media?.brandName) setBrandNameTouched(true);
      } else setForm(prev => ({ ...prev, keyword: d.keyword }));
      setGenerated(d.markdown);
      setMetaData(d.meta ?? null);
      setSlugHint(d.slugHint ?? "");
      setDraftId(d.id);
      setDraftSaveState("saved");
      // Clear transient publish/SEO/image/video state from any previous article in the editor.
      setPubStatus("idle"); setPubResult(null); setPublishedPostId(null);
      setVideoStatus("idle"); setVideoError("");
      if (videoPollRef.current) { clearInterval(videoPollRef.current); videoPollRef.current = null; }
      setSeoReport(null); setSeoChecking(false); setAutoImgN(0);
      setGenStatus("done"); setGenError(""); setGenTruncated(false);
      setActiveTab("generate");
    } catch { setDraftsError("網路錯誤，請重試"); }
  }

  async function deleteDraft(id: string) {
    try {
      const res  = await fetch(`/api/content/drafts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setDrafts(prev => prev.filter(d => d.id !== id));
        if (draftId === id) { setDraftId(""); setDraftSaveState("idle"); }
      }
    } catch { /* silent — list refresh will reconcile */ }
  }

  // Load the drafts list whenever the drafts tab is opened.
  useEffect(() => { if (activeTab === "drafts") void loadDrafts(); }, [activeTab, loadDrafts]);

  // Once the background SEO check resolves AND we have a saved row, persist the score (best-effort).
  useEffect(() => {
    if (!draftId || !seoReport || !generated.trim()) return;
    void saveDraft({ markdown: generated, meta: metaData, slugHint, seoScore: seoReport.score });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seoReport]);

  // Build the shared image-gen params (model + resolved style + seed + reference image) sent to
  // /api/content/image by every Media-Hub image call site (body + hero). Style is stored as the
  // STYLE_CATALOG `zh` key and resolved here to its English `.prompt` (what the model actually reads);
  // seed + referenceImages are only attached when the selected model supports them, so a model that
  // ignores them never receives a no-op field. Returns a partial body to spread onto the fetch payload.
  function mediaImageParams(): { model: string; imageStyle?: string; seed?: number; referenceImages?: string[] } {
    const m = form.media;
    const out: { model: string; imageStyle?: string; seed?: number; referenceImages?: string[] } = { model: m.aiImages };
    const style = m.imageStyle ? STYLE_CATALOG.find(s => s.zh === m.imageStyle) : undefined;
    if (style) out.imageStyle = style.prompt;
    const cap = AI_IMAGE_PROVIDERS.find(p => p.value === m.aiImages);
    const seedStr = m.imageSeed.trim();
    // Clamp to uint32 — image backends (flux / replicate) expect a 0…4294967295 seed; a longer digit
    // string would become 1e20+ and silently 422 the request. Math.min handles even Infinity safely.
    if (cap?.seed && /^\d+$/.test(seedStr)) out.seed = Math.min(Number(seedStr), 4294967295);
    if (cap?.img2img && m.imageRefData) out.referenceImages = [m.imageRefData];
    return out;
  }

  // ─── Auto-replace IMAGE_PLACEHOLDER_N with Replicate URLs ─────────────────

  async function autoReplaceImages(md: string, genRun: number) {
    const placeholders = [...md.matchAll(/!\[([^\]]*)\]\(IMAGE_PLACEHOLDER_(\d+)\)/g)];
    if (!placeholders.length) return;
    setAutoImgN(placeholders.length);
    setImgGenWarn("");
    let remaining = placeholders.length;
    let lastErr = "";
    for (const m of placeholders) {
      if (genRun !== imgRunRef.current) break; // user re-generated, abort
      const altText = m[1].trim() || form.keyword;
      const n = m[2];
      try {
        const res = await fetch("/api/content/image", {
          method: "POST", headers: { "Content-Type": "application/json" },
          // form.media.imageSize is now a flux aspect_ratio (e.g. "16:9") — pass it so the chosen
          // ratio actually applies to body images (previously hardcoded twitter_post → ignored → 1:1).
          // mediaImageParams() adds the chosen model + style preset + seed + reference image (img2img).
          body: JSON.stringify({ prompt: altText, platform: "twitter_post", aspectRatio: form.media.imageSize, ...mediaImageParams(), _jobId: jobIdRef.current }),
        });
        if (genRun !== imgRunRef.current) break;
        const json = await res.json() as { ok: boolean; imageUrl?: string; error?: string; cost_usd?: number; model?: string };
        if (json.ok && json.imageUrl) {
          setGenerated(prev => prev.replace(`IMAGE_PLACEHOLDER_${n}`, () => json.imageUrl!));
          if (json.cost_usd && json.model) addCostLine({ route: "content/image", model: json.model, vendor: "Image", usd: json.cost_usd, kind: "image" });
        } else {
          lastErr = (typeof json.error === "string" && json.error) || "圖片生成失敗";
        }
      } catch { lastErr = "圖片生成連線失敗，請稍後重試"; }
      remaining--;
      setAutoImgN(remaining);
    }
    setAutoImgN(0);
    if (lastErr && genRun === imgRunRef.current) setImgGenWarn(`內文配圖：${lastErr}`);
  }

  // ─── YouTube placeholder resolution (Phase 2) ─────────────────────────────
  // Extract the 11-char video id from any common YouTube URL shape and return the canonical
  // watch URL (strips playlist / tracking params). null if the input is not a YouTube URL.
  function canonicalYouTube(raw: string): string | null {
    const s = raw.trim();
    const m =
      s.match(/[?&]v=([\w-]{11})/) ||
      s.match(/youtu\.be\/([\w-]{11})/) ||
      s.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([\w-]{11})/);
    return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
  }

  // Replace `[YOUTUBE_PLACEHOLDER_N: query]` with the canonical watch URL on its own line. Both publish
  // paths then turn that bare URL into a real embed (markdownToBlocks → embed block → plugin youtube();
  // standard REST → WP autoembed). n is a digit string from the placeholder regex, safe to interpolate.
  function resolveYouTube(n: string, rawUrl: string) {
    const canon = canonicalYouTube(rawUrl);
    if (!canon) return;
    setGenerated(prev => prev.replace(new RegExp(`\\[YOUTUBE_PLACEHOLDER_${n}:[^\\]]*\\]`), canon));
    setYtUrlInputs(prev => { const next = { ...prev }; delete next[n]; return next; });
  }

  // ─── Hero (featured) image ────────────────────────────────────────────────
  // Issue 四: generate ONE dedicated hero image at facebook_link (1200×630, OG/featured ratio) so the
  // published post has a feature image. Threaded to publish as featured_image_url; the WP Bridge plugin
  // sideloads it and sets the post thumbnail (best-effort — a failure here never blocks publishing).
  async function generateHeroImage(topic: string, genRun: number) {
    const prompt = topic.trim() || form.keyword.trim();
    if (!prompt) return;
    setHeroLoading(true);
    try {
      const res = await fetch("/api/content/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Hero/featured = 16:9 (Google Discover + OG preview both favour the wide ratio). Same model +
        // style + seed + reference image as the body images so the hero matches the article's look.
        // titleText → Sharp SVG overlay (bottom gradient bar + white title text) baked into the WebP.
        body: JSON.stringify({
          prompt, platform: "facebook_link", aspectRatio: "16:9", ...mediaImageParams(),
          titleText: metaData?.seoTitle || form.keyword || "",
          featuredImageFont: currentSite?.contentDefaults?.featuredImageFont ?? "sans",
          featuredImageTitlePosition: currentSite?.contentDefaults?.featuredImageTitlePosition ?? "bottom",
          _jobId: jobIdRef.current,
        }),
      });
      if (genRun !== imgRunRef.current) return; // user re-generated, abort
      const json = await res.json() as { ok: boolean; imageUrl?: string; error?: string; cost_usd?: number; model?: string };
      if (json.ok && json.imageUrl) {
        setHeroImageUrl(json.imageUrl);
        if (json.cost_usd && json.model) addCostLine({ route: "content/hero-image", model: json.model, vendor: "Image", usd: json.cost_usd, kind: "image" });
      }
      // Hero is best-effort (never blocks publish) but a silent failure hid missing-key / bad-reference
      // problems — surface the reason so the operator can fix the model/reference and retry.
      else if (genRun === imgRunRef.current) {
        setImgGenWarn(`首圖：${(typeof json.error === "string" && json.error) || "圖片生成失敗"}`);
      }
    } catch { if (genRun === imgRunRef.current) setImgGenWarn("首圖：圖片生成連線失敗，請稍後重試"); }
    finally { if (genRun === imgRunRef.current) setHeroLoading(false); }
  }

  // ─── SEO Fix Apply ────────────────────────────────────────────────────────

  function handleFixApply(fixedMd: string, fixedMeta?: { seoTitle: string; metaDesc: string }) {
    setGenerated(fixedMd);
    if (fixedMeta) setMetaData({ seoTitle: fixedMeta.seoTitle, metaDesc: fixedMeta.metaDesc });
    const title    = fixedMeta?.seoTitle  ?? metaData?.seoTitle  ?? "";
    const metaDesc = fixedMeta?.metaDesc  ?? metaData?.metaDesc  ?? "";
    const myRun    = ++seoRunRef.current;
    setSeoChecking(true);
    fetch("/api/content/seo-check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: fixedMd, focusKeyword: form.keyword, seoTitle: title, metaDescription: metaDesc, slug: slugHint || slugify(form.keyword), siteDomain: (() => { try { const s = currentSite; return s?.url ? new URL(s.url).hostname : undefined; } catch { return undefined; } })() }),
    })
      .then(r => r.ok ? r.json() as Promise<RankMathReport> : null)
      .then(j => { if (j && myRun === seoRunRef.current) setSeoReport(j); })
      .catch(() => { if (myRun === seoRunRef.current) setSeoReport(null); })
      .finally(() => { if (myRun === seoRunRef.current) setSeoChecking(false); });
  }

  // ─── Publish ─────────────────────────────────────────────────────────────

  async function handlePublish(mode?: "draft" | "publish" | "future") {
    if (!generated.trim()) return;
    // 沒選定客戶就不准發 —— 送 siteId: undefined 時伺服器會 resolveWpSite(req, undefined)，
    // 也就是「挑呼叫者有權存取的第一個站」。對 staff 而言那是全域第一列，於是文章會被發到
    // **另一個客戶**的網站上。這個伺服器端後備是給不帶 siteId 的唯讀清單呼叫用的，寫入動作
    // 不可以沾。（wpSites 為空時不擋，讓伺服器回報真正的原因。）
    if (!selectedSiteId && wpSites.length > 0) {
      setPubStatus("error"); setPubError("尚未選擇目標客戶 — 請先在上方「📍 目標客戶」選定，再發布。");
      return;
    }
    const resolvedMode = mode ?? pubMode;
    setPubMode(resolvedMode);
    setPubStatus("publishing"); setPubError(""); setPubResult(null);
    try {
      const res  = await fetch("/api/content/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: generated,
          slug: slugHint || slugify(form.keyword),
          seoTitle: metaData?.seoTitle,
          metaDescription: metaData?.metaDesc,
          focusKeyword: form.keyword,
          publishStatus: resolvedMode,
          scheduleDate: resolvedMode === "future" ? (scheduleDate || form.scheduleDate || undefined) : undefined,
          siteId: selectedSiteId || undefined,
          // Manual form fields win; fall back to the AI-suggested CATEGORIES/TAGS from the meta block.
          categories: form.wpCategories
            ? form.wpCategories.split(",").map(s => s.trim()).filter(Boolean)
            : (metaData?.categories?.length ? metaData.categories : undefined),
          tags: form.wpTags
            ? form.wpTags.split(",").map(s => s.trim()).filter(Boolean)
            : (metaData?.tags?.length ? metaData.tags : undefined),
          // Issue 四: hero image (Bridge path only — plugin sets it as the post thumbnail).
          featuredImageUrl: heroImageUrl || undefined,
          // alt only meaningful with a hero URL (plugin reads alt solely inside its featured-image block).
          featuredImageAlt: heroImageUrl && form.keyword ? form.keyword : undefined,
          // Issue 七: focus keyword → ILJ ilj_linkdefinition so other posts auto-link to this one.
          internalLinkKeywords: form.keyword.trim() ? [form.keyword.trim()] : undefined,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string; edit_url?: string; view_url?: string; post_id?: number };
      if (!json.ok) { setPubStatus("error"); setPubError(json.error ?? "未知錯誤"); }
      else {
        setPubStatus("done"); setPubResult({ edit_url: json.edit_url, view_url: json.view_url });
        if (json.post_id) setPublishedPostId(json.post_id);
      }
    } catch { setPubStatus("error"); setPubError("網路錯誤"); }
  }

  // ─── Video fire-and-forget ────────────────────────────────────────────────────
  // Fire video generation AFTER article is published (postId must be known).
  // When render completes, call /api/video/embed-to-wp to replace <!-- VIDEO_PLACEHOLDER -->.
  async function handleGenerateVideo(postId: number) {
    if (!video || videoStatus === "generating" || videoStatus === "embedding") return;
    setVideoStatus("generating"); setVideoError("");
    try {
      const json = await video.generate({
        // /api/video/generate requires `topic` (it uses topic as both topic + keyword) — without it
        // the route 400s before a job is ever created (critic 2026-06-19). seoTitle (→ keyword
        // fallback) is the natural article topic.
        topic: metaData?.seoTitle || form.keyword,
        articleTitle: metaData?.seoTitle || form.keyword,
        articleContent: generated,
        language: form.language || "繁體中文",
        visualStyle: videoStyleZh ? resolveVideoStyle(videoStyleZh) : undefined,
        sceneCount: videoTotalScenes,
        customScenes: Math.min(videoCustomScenes, videoTotalScenes),
        brollScenes: Math.max(0, videoTotalScenes - videoCustomScenes),
        imageModel: videoImageModel,
        outputFormats: VIDEO_FORMAT_CHOICES.filter((f) => videoFormats.has(f)),
        siteId: selectedSiteId || undefined,
        ...parseVoiceModel(videoVoiceId),
      });
      if (!json.ok) { setVideoStatus("error"); setVideoError(json.error ?? "影片生成失敗"); return; }
      const jobId = json.euJobId ?? json.jobId ?? "";
      setVideoJobId(jobId);
      // Poll /api/video/status every 15 s until done, then patch WP post
      if (videoPollRef.current) clearInterval(videoPollRef.current);
      videoPollRef.current = setInterval(async () => {
        try {
          const sj = await video.status(jobId);
          if (!sj.ok || sj.status === "error") {
            clearInterval(videoPollRef.current!); videoPollRef.current = null;
            setVideoStatus("error"); setVideoError(sj.error ?? "影片渲染失敗"); return;
          }
          if (sj.status === "done" && sj.video?.outputs) {
            const primaryUrl = sj.video.outputs["16x9"] ?? sj.video.outputs["youtube_linkedin"] ?? Object.values(sj.video.outputs)[0] ?? "";
            if (!primaryUrl) { /* outputs exists but is empty — treat as error */
              clearInterval(videoPollRef.current!); videoPollRef.current = null;
              setVideoStatus("error"); setVideoError("影片輸出 URL 不存在"); return;
            }
            // Save all output URLs: the distribution section offers video only once one exists.
            setVideoOutputUrls(sj.video.outputs as Record<string, string>);
            clearInterval(videoPollRef.current!); videoPollRef.current = null;
            // 同 handlePublish：embed-to-wp 會**改寫**客戶站上的文章內容，沒選定客戶時
            // 伺服器端的「第一個可存取的站」後備會讓它改到別人的站去。
            if (!selectedSiteId && wpSites.length > 0) {
              setVideoStatus("error");
              setVideoError("尚未選擇目標客戶 — 影片已產出，但未嵌入任何網站。請選定客戶後重試。");
              return;
            }
            setVideoStatus("embedding");
            const ej = await video.embed({ postId, siteId: selectedSiteId || undefined, videoUrl: primaryUrl });
            if (ej.ok) setVideoStatus("done");
            else { setVideoStatus("error"); setVideoError(ej.error ?? "影片嵌入 WP 失敗"); }
          }
        } catch { /* keep polling */ }
      }, 15_000);
    } catch { setVideoStatus("error"); setVideoError("影片生成連線失敗"); }
  }

  // ─── Syndicate ───────────────────────────────────────────────────────────

  async function handleSyndicate() {
    const platforms = Object.entries(synEnabled).filter(([, v]) => v).map(([k]) => k);
    if (platforms.length === 0 || !generated.trim()) return;
    setSynStatus("generating"); setSynContent({});
    try {
      const res  = await fetch("/api/content/syndicate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article: generated, platforms, twitterMode, articleUrl: pubResult?.view_url, siteId: selectedSiteId || undefined,
          mediaType: distMediaType === "video" ? "video" : distMediaType === "image" ? "image" : "text",
        }),
      });
      const json = await res.json() as { ok: boolean; posts?: Record<string, string>; _cost?: { usd: number; model: string; vendor: string } };
      if (json.ok && json.posts) { setSynContent(json.posts); setSynStatus("done"); setSynStale(false); }
      else                       { setSynStatus("error"); }
      if (json._cost) addCostLine({ route: "content/syndicate", model: json._cost.model, vendor: json._cost.vendor, usd: json._cost.usd, kind: "text" });
    } catch { setSynStatus("error"); }
  }

  // ─── Newsletter (FluentCRM draft, never sends) ─────────────────────────────

  async function handlePushNewsletter() {
    if (!generated.trim()) return;
    // Unresolved image placeholders → the email body would silently drop those images. Block so the
    // operator waits for AI images to finish (mirrors the YOUTUBE placeholder gate) rather than
    // shipping a draft with missing images. (critic 2026-06-16 Minor)
    if (/IMAGE_PLACEHOLDER_\d+/.test(generated)) {
      setNlStatus("error");
      setNlResult({ error: "圖片尚未產生完成（仍有未替換的圖片佔位），請稍候再推送" });
      return;
    }
    const subject = (metaData?.seoTitle || form.title || form.keyword || "").trim();
    if (!subject) {
      setNlStatus("error"); setNlResult({ error: "缺少主旨（請先填 SEO 標題或關鍵字）" }); return;
    }
    // U-FluentCRM: send a CONCISE teaser (hero + 摘要 + 閱讀全文 CTA) instead of the full article.
    // excerpt = Meta 描述優先，否則取文章第一段正文；heroImage = 文章內第一張圖。
    const firstParagraph = (md: string): string => {
      for (const raw of md.split("\n")) {
        const t = raw.trim();
        if (!t || /^#{1,6}\s/.test(t) || /^!\[/.test(t) || t.startsWith("<!--")
          || t.startsWith(">") || /^[-*+]\s/.test(t) || t.startsWith("|")) continue;
        return t.replace(/[*_`#]/g, "").slice(0, 320);
      }
      return "";
    };
    const firstImgMatch = generated.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
    const excerpt   = (metaData?.metaDesc?.trim() || firstParagraph(generated)).trim();
    const heroImage = firstImgMatch ? firstImgMatch[1] : "";
    const articleUrl = nlArticleUrl.trim();
    setNlStatus("sending"); setNlResult(null);
    try {
      const res = await fetch("/api/content/newsletter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "teaser",
          markdown: generated, subject, title: subject, preview: metaData?.metaDesc,
          excerpt,
          heroImage: heroImage || undefined,
          articleUrl: articleUrl || undefined,
        }),
      });
      const json = await res.json().catch(() => ({})) as { ok?: boolean; edit_url?: string; error?: string; reason?: string };
      if (res.ok && json.ok) { setNlStatus("done"); setNlResult({ edit_url: json.edit_url }); }
      else { setNlStatus("error"); setNlResult({ error: json.error || json.reason || `推送失敗（${res.status}）` }); }
    } catch { setNlStatus("error"); setNlResult({ error: "連線失敗" }); }
  }

  // ─── Humanize ────────────────────────────────────────────────────────────

  async function handleHumanize() {
    if (!humInput.trim()) return;
    humAbortRef.current?.abort();
    const ac = new AbortController();
    humAbortRef.current = ac;
    setHumOutput(""); setHumStatus("streaming"); setHumError("");

    try {
      const res = await fetch("/api/content/humanize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: humInput, mode: humMode, language: humLang, readability: humRead, removeAiWords: humAiWords }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) { setHumStatus("error"); setHumError(`伺服器錯誤：${res.status}`); return; }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setHumOutput(text.split("\n").filter(l => !l.startsWith("[COST_JSON]")).join("\n"));
      }
      text += dec.decode();
      // Parse and strip cost sentinels
      { const lines = text.split("\n"); const costLines: string[] = []; const bodyLines = lines.filter(l => { if (l.startsWith("[COST_JSON]")) { costLines.push(l.slice("[COST_JSON]".length)); return false; } return true; }); text = bodyLines.join("\n"); for (const cl of costLines) { try { const c = JSON.parse(cl) as { usd: number; model: string; vendor: string; route: string }; addCostLine({ route: c.route, model: c.model, vendor: c.vendor, usd: c.usd, kind: "text" }); } catch { /* ignore */ } } }
      setHumOutput(text);
      setHumStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") setHumStatus("idle");
      else { setHumStatus("error"); setHumError("處理失敗，請重試"); }
    }
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const isGenerating = genStatus === "streaming";
  const hasContent   = generated.trim().length > 0;
  const isHumanizing = humStatus === "streaming";
  const hasHumOutput = humOutput.trim().length > 0;

  // Capabilities of the currently-selected image model — gates the Seed + 參考圖(img2img) controls so the
  // UI never offers a knob the model silently ignores. Falls back to "none" (no caps) for unknown values.
  const selectedImageModel = AI_IMAGE_PROVIDERS.find(p => p.value === form.media.aiImages) ?? AI_IMAGE_PROVIDERS[0];

  // Unresolved YouTube placeholders still in the draft, in document order. Each needs a real watch URL
  // pasted before publish — otherwise publish/route + markdownToBlocks drop the line cleanly.
  const ytPlaceholders = [...generated.matchAll(/\[YOUTUBE_PLACEHOLDER_(\d+):\s*([^\]]+)\]/g)]
    .map(m => ({ n: m[1], query: m[2].trim() }));

  // ─── Styles ───────────────────────────────────────────────────────────────

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px", border: "none", cursor: "pointer", background: "none", fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--btn-primary-bg)" : "var(--text-muted)",
    borderBottom: active ? "2px solid var(--btn-primary-bg)" : "2px solid transparent",
    marginBottom: "-1px",
  });
  const checkRow: React.CSSProperties   = { display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "6px" };
  const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", userSelect: "none" };

  const structLabels: Record<keyof ArticleStructure, string> = {
    quickAnswer: "快速解答", keyTakeaways: "重點整理", comparisonTable: "比較表格",
    faq: "FAQ", conclusion: "結論", tables: "表格", h3: "H3 小標",
    lists: "列表", italics: "斜體", quotes: "引言", bold: "粗體",
    expertQuote: "專家引言", prosCons: "優缺點表", stepByStep: "步驟教學",
    calloutBox: "提示框 💡", caseStudy: "實際案例", statCallout: "數據亮點 📊",
  };

  // ─── Save current form state as client content_defaults ─────────────────
  async function saveAsClientDefault() {
    const site = currentSite;
    // 沒選定客戶就不能存 —— 舊行為是回退到 wpSites[0]，等於把這份表單預設寫進**別的客戶**
    // 那一列。改成擋下並說明白；靜默 return 也不行，那只是把錯誤換成「按了沒反應」。
    if (!site) { setSaveDefaultsMsg("✗ 尚未選擇目標客戶"); return; }
    setSavingDefaults(true);
    setSaveDefaultsMsg(null);
    // Merge: preserve fields not managed by the form (featuredImageFont, featuredImageTitlePosition)
    const existing = site.contentDefaults ?? {};
    const contentDefaults = {
      ...existing,
      language: form.language,
      targetCountry: form.targetCountry,
      tone: form.tone,
      articleType: form.articleType,
      readability: form.readability,
      pointOfView: form.pointOfView,
      imageModel: form.media.aiImages === "none" ? undefined : form.media.aiImages,
      brandVoiceInstructions: form.details || undefined,
      marketing: {
        audience: form.marketing.audience || undefined,
        positioning: form.marketing.positioning || undefined,
        usp: form.marketing.usp || undefined,
        primaryCta: form.marketing.primaryCta || undefined,
        funnelStage: form.marketing.funnelStage || undefined,
        pricePositioning: form.marketing.pricePositioning || undefined,
        emotionalTriggers: form.marketing.emotionalTriggers || undefined,
        objections: form.marketing.objections || undefined,
        forbiddenClaims: form.marketing.forbiddenClaims || undefined,
      },
    };
    try {
      const r = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentDefaults }),
      });
      const data = await r.json() as { ok: boolean; site?: { contentDefaults?: typeof contentDefaults }; error?: string };
      setSaveDefaultsMsg(data.ok ? "✓ 已存為客戶預設" : `錯誤：${data.error ?? "unknown"}`);
      if (data.ok) {
        const saved = data.site?.contentDefaults ?? contentDefaults;
        setWpSites(prev => prev.map(s => s.id === site.id ? { ...s, contentDefaults: saved } : s));
      }
    } catch {
      setSaveDefaultsMsg("網路錯誤，請重試");
    } finally {
      setSavingDefaults(false);
      setTimeout(() => setSaveDefaultsMsg(null), 4000);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", maxWidth: "1400px" }}>

      {/* ── Header: title + site selector + calendar link ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>內容工作室</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {wpSites.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>發布到：</span>
              <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}
                className="form-select" style={{ fontSize: "12px", padding: "4px 8px" }}>
                {wpSites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {calendarHref && <a href={calendarHref}
            style={{ fontSize: "12px", padding: "5px 12px", border: "1px solid var(--card-border)",
              borderRadius: "6px", color: "var(--text-muted)", textDecoration: "none",
              background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "5px" }}>
            📅 內容行事曆
          </a>}
          {clientsHref && <a href={clientsHref}
            style={{ fontSize: "12px", padding: "5px 12px", border: "1px solid var(--card-border)",
              borderRadius: "6px", color: "var(--text-muted)", textDecoration: "none",
              background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "5px" }}>
            🔗 客戶管理
          </a>}
        </div>
      </div>

      {/* ── Trending Keywords Panel ── */}
      <div className="form-block form-block--wide" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => setShowTrending(v => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", padding: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🔥</span> {showTrending ? "▲" : "▼"} 熱門搜尋 / 關鍵字探索
            </button>
            {showTrending && (
              <div style={{ display: "flex", gap: "4px" }}>
                {(["trending", "suggest", "questions", "sources"] as const).filter(t => !onDoor || t !== "sources").map(t => (
                  <button key={t} onClick={() => setTrendTab(t)}
                    style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--card-border)", cursor: "pointer",
                      background: trendTab === t ? "var(--btn-primary-bg)" : "var(--bg-card)",
                      color: trendTab === t ? "var(--btn-primary-text)" : "var(--text-muted)" }}>
                    {t === "trending" ? "今日熱搜" : t === "suggest" ? "搜尋建議" : t === "questions" ? "相關問題" : "⚙️ 管理來源"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showTrending && trendTab !== "sources" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {trendTab === "trending" && (
                <select value={trendGeo} onChange={e => setTrendGeo(e.target.value)}
                  className="form-select" style={{ fontSize: "11px", padding: "3px 8px" }}>
                  <option value="TW">台灣</option>
                  <option value="HK">香港</option>
                  <option value="SG">新加坡</option>
                  <option value="US">美國</option>
                  <option value="GB">英國</option>
                  <option value="JP">日本</option>
                  <option value="AU">澳洲</option>
                </select>
              )}
              <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 10px" }}
                onClick={() => {
                  if (trendTab === "trending") void fetchTrending();
                  else if (trendTab === "suggest") void fetchSuggest(form.keyword || "");
                  else void fetchQuestions(form.keyword || "");
                }}
                disabled={trendLoading || ((trendTab === "suggest" || trendTab === "questions") && !form.keyword.trim())}>
                {trendLoading ? "載入中…" : "搜尋"}
              </button>
            </div>
          )}
        </div>

        {showTrending && (
          <div style={{ marginTop: "12px" }}>
            {/* Trending tab */}
            {trendTab === "trending" && trendingItems.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {trendingItems.map((item, i) => {
                  const srcColor: Record<string, { bg: string; text: string }> = {
                    Reddit: { bg: "#ff4500", text: "#fff" },
                    PTT:    { bg: "#006e2e", text: "#fff" },
                  };
                  const sc = item.source ? (srcColor[item.source] ?? { bg: "var(--ai-bg)", text: "var(--accent)" }) : null;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0", borderRadius: "6px", overflow: "hidden",
                      border: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
                      {sc && (
                        <span style={{ padding: "3px 6px", fontSize: "9px", fontWeight: 700, background: sc.bg, color: sc.text,
                          borderRight: "1px solid rgba(0,0,0,0.1)", letterSpacing: "0.03em", flexShrink: 0 }}>
                          {item.source}
                        </span>
                      )}
                      <button onClick={() => pickTrendKeyword(item.title)}
                        style={{ padding: "5px 10px", background: "none", border: "none", cursor: "pointer",
                          fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap", fontWeight: 500 }}
                        title={`點擊使用此關鍵字${item.relatedQueries.length > 0 ? "；相關：" + item.relatedQueries.slice(0, 3).join("、") : ""}`}>
                        {item.title}
                      </button>
                      {item.traffic && (
                        <span style={{ padding: "3px 6px", fontSize: "10px", background: "var(--build-risk-medium-bg)", color: "var(--build-risk-medium-text)", borderLeft: "1px solid var(--card-border)" }}>
                          {item.traffic}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {trendTab === "trending" && trendingItems.length === 0 && !trendLoading && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                點擊「搜尋」載入今日熱搜（內建：Google News / Reddit / PTT / Serper{onDoor ? "" : "，外加你在「⚙️ 管理來源」新增的自訂 RSS 來源"}）
              </div>
            )}

            {/* Suggest tab */}
            {trendTab === "suggest" && suggestResults.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {suggestResults.map((s, i) => (
                  <button key={i} onClick={() => pickTrendKeyword(s)}
                    style={{ padding: "5px 12px", background: "var(--bg-card)", border: "1px solid var(--card-border)",
                      borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "var(--text-primary)" }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {trendTab === "suggest" && suggestResults.length === 0 && !trendLoading && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {form.keyword.trim() ? "點擊「搜尋」取得搜尋建議" : "請先輸入主要關鍵字，再搜尋建議"}
              </div>
            )}

            {/* Questions tab */}
            {trendTab === "questions" && questionResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {questionResults.map((q, i) => (
                  <button key={i} onClick={() => pickTrendKeyword(q)}
                    style={{ padding: "6px 12px", background: "var(--bg-card)", border: "1px solid var(--card-border)",
                      borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "var(--text-primary)",
                      textAlign: "left", width: "100%", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "var(--btn-primary-bg)", fontWeight: 600 }}>?</span>{q}
                  </button>
                ))}
              </div>
            )}
            {trendTab === "questions" && questionResults.length === 0 && !trendLoading && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {form.keyword.trim() ? "點擊「搜尋」取得相關問題（適合做 FAQ 或 How-to 文章）" : "請先輸入主要關鍵字"}
              </div>
            )}

            {/* Sources management tab (migration 0042) */}
            {!onDoor && trendTab === "sources" && (
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "10px", lineHeight: 1.6 }}>
                  內建來源：📰 Google News · 👽 Reddit · 🗣️ PTT · 🔍 Serper（不可刪）。
                  下方可新增自訂 RSS / Atom feed（須為公開 https 網址），會跟內建來源一起出現在「今日熱搜」。
                </div>

                {/* Add form */}
                <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
                  <input className="form-input" value={newSourceLabel} onChange={e => setNewSourceLabel(e.target.value)}
                    placeholder="來源名稱（例：科技報橘）" style={{ flex: "1 1 140px", fontSize: "12px" }} disabled={addingSource} />
                  <input className="form-input" value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)}
                    placeholder="RSS 網址 https://…/feed" style={{ flex: "2 1 240px", fontSize: "12px" }} disabled={addingSource}
                    onKeyDown={e => { if (e.key === "Enter") void addSource(); }} />
                  <button className="btn-primary" style={{ fontSize: "12px", padding: "5px 14px" }}
                    onClick={() => void addSource()} disabled={addingSource || !newSourceLabel.trim() || !newSourceUrl.trim()}>
                    {addingSource ? "新增中…" : "+ 新增"}
                  </button>
                </div>
                {sourcesError && <div style={{ fontSize: "12px", color: "var(--color-error)", marginBottom: "8px" }}>{sourcesError}</div>}

                {/* DB sources list */}
                {sourcesLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>讀取中…</div>}
                {!sourcesLoading && trendSources.length === 0 && !sourcesError && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>尚無自訂來源。貼一個 RSS 網址即可新增。</div>
                )}
                {trendSources.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {trendSources.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px",
                        border: "1px solid var(--card-border)", borderRadius: "6px", background: "var(--bg-card)",
                        opacity: s.enabled ? 1 : 0.55 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", flexShrink: 0 }}>
                          <input type="checkbox" checked={s.enabled} onChange={e => void toggleSource(s.id, e.target.checked)} />
                        </label>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>🔗 {s.label}</div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.url}{Array.isArray(s.geos) ? ` · ${s.geos.join("/")}` : ""}
                          </div>
                        </div>
                        <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 9px", color: "var(--color-error)", flexShrink: 0 }}
                          onClick={() => { if (window.confirm(`刪除來源「${s.label}」？`)) void deleteSource(s.id); }}>
                          刪除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--card-border)", marginBottom: "24px" }}>
        {(["generate", "humanize", "drafts"] as Tab[]).map(t => (
          <button key={t} style={tabStyle(activeTab === t)} onClick={() => setActiveTab(t)}>
            {t === "generate" ? "產文" : t === "humanize" ? "人性化 / 改寫" : "📁 我的草稿"}
          </button>
        ))}
      </div>

      {/* ══════════════ 產文頁籤 ══════════════ */}
      {activeTab === "generate" && (
        <>
          {/* ── 目標客戶（F-Sites：一律顯示連接中的客戶名稱+網址；>1 時可下拉切換）── */}
          <div className="form-block form-block--wide" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>📍 目標客戶</span>
              {wpSites.length === 0 && (
                <span style={{ fontSize: "12px", color: "var(--yellow)" }}>
                  尚未連接任何網站 — 文章仍可生成，但無法推送。{" "}
                  {sitesHref && <a href={sitesHref} style={{ color: "var(--btn-primary-bg)" }}>前往連接 ↗</a>}
                </span>
              )}
              {unresolvedSiteParam && (
                <span style={{ fontSize: "12px", color: "var(--yellow)" }}>
                  ⚠ 網址指定的客戶（<code>{unresolvedSiteParam}</code>）不在你可用的清單裡 —
                  可能已停用、已刪除，或不屬於你。<strong>尚未選擇目標客戶</strong>，請在右側自行選取。
                </span>
              )}
              {wpSites.length === 1 && !unresolvedSiteParam && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: wpSites[0].color, display: "inline-block" }} />
                  <strong style={{ color: "var(--text-primary)" }}>{wpSites[0].name}</strong>
                  <a href={wpSites[0].url} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>{wpSites[0].url} ↗</a>
                </span>
              )}
              {/* 指定的站取不到時，即使只有一個站也要給下拉 —— 否則操作者沒有「明確選擇」的手段，
                  畫面又會退回「看起來已經選好了」的假象。 */}
              {(wpSites.length > 1 || (unresolvedSiteParam && wpSites.length >= 1)) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <select value={selectedSiteId} onChange={e => { setSelectedSiteId(e.target.value); if (e.target.value) setUnresolvedSiteParam(null); }}
                    className="form-select" style={{ fontSize: "13px", padding: "4px 10px" }}>
                    {!selectedSiteId && <option value="">— 請選擇目標客戶 —</option>}
                    {wpSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {(() => {
                    const s = wpSites.find(x => x.id === selectedSiteId);
                    return s ? <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>{s.url} ↗</a> : null;
                  })()}
                </span>
              )}
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "10px" }}>
                {saveDefaultsMsg && (
                  <span style={{ fontSize: "11px", color: saveDefaultsMsg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>
                    {saveDefaultsMsg}
                  </span>
                )}
                {(selectedSiteId || wpSites.length > 0) && (
                  <button
                    type="button"
                    onClick={saveAsClientDefault}
                    disabled={savingDefaults}
                    style={{
                      fontSize: "11px", padding: "3px 10px", borderRadius: "6px",
                      border: "1px solid var(--accent)", background: "transparent",
                      color: "var(--accent-text)", cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {savingDefaults ? "儲存中…" : "💾 存為客戶預設"}
                  </button>
                )}
                {clientsHref && (() => {
                  const sel = wpSites.find(x => x.id === selectedSiteId);
                  const clientHref = sel?.org_slug ? `${clientsHref}/${sel.org_slug}` : clientsHref;
                  return (
                    <a href={clientHref} style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
                      管理客戶 →
                    </a>
                  );
                })()}
              </span>
            </div>
          </div>

          <div className="form-block form-block--wide" style={{ marginBottom: "16px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "14px", color: "var(--text-primary)" }}>文章設定</div>

            {/* 關鍵字 + 標題 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="form-label">主要關鍵字 *</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input className="form-input" value={form.keyword} onChange={e => setF("keyword", e.target.value)}
                    placeholder="例：藝術療癒" disabled={isGenerating} style={{ flex: 1 }} />
                  <div style={{ position: "relative" }}>
                    <button title={why("content.title")} className="btn-secondary" onClick={handleSuggestTitles}
                      disabled={(isGenerating || !form.keyword.trim() || titleLoading) || !canUse("content.title")}
                      style={{ whiteSpace: "nowrap", fontSize: "12px" }}>
                      {titleLoading ? "…" : "✨ 建議標題"}
                    </button>
                    {showTitleDrop && titleSugs.length > 0 && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                        background: "var(--bg-card, #fff)", border: "1px solid var(--card-border)",
                        borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,.12)", minWidth: "340px", padding: "6px" }}>
                        {titleSugs.map((t, i) => (
                          <button key={i} onClick={() => { setF("title", t); setShowTitleDrop(false); }}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px",
                              background: "none", border: "none", cursor: "pointer", fontSize: "12px",
                              lineHeight: 1.4, color: "var(--text-primary)", borderRadius: "4px" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover, #f5f5f5)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                            {t}
                          </button>
                        ))}
                        <button onClick={() => setShowTitleDrop(false)}
                          style={{ fontSize: "11px", color: "var(--text-muted)", padding: "4px 10px", background: "none", border: "none", cursor: "pointer" }}>
                          關閉
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">文章標題 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（空白則自動生成）</span></label>
                <input className="form-input" value={form.title} onChange={e => setF("title", e.target.value)}
                  placeholder="例：什麼是藝術療癒？" disabled={isGenerating} />
              </div>
            </div>

            {/* 語言 / 地區 / 類型 / 長度 / 模型 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label className="form-label">語言</label>
                <select className="form-select" value={form.language} onChange={e => setF("language", e.target.value)} disabled={isGenerating}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">目標地區</label>
                <select className="form-select" value={form.targetCountry} onChange={e => setF("targetCountry", e.target.value)} disabled={isGenerating}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">文章類型</label>
                <select className="form-select" value={form.articleType} onChange={e => setF("articleType", e.target.value)} disabled={isGenerating}>
                  {ARTICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">文章長度</label>
                <select className="form-select" value={form.articleSize} onChange={e => setF("articleSize", e.target.value)} disabled={isGenerating}>
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI 模型</label>
                <select className="form-select" value={form.model} onChange={e => setF("model", e.target.value)} disabled={isGenerating}>
                  {AI_MODEL_GROUPS.map(g => (
                    <optgroup key={g} label={g}>
                      {AI_MODELS.filter(m => m.group === g).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* 語氣 / 視角 / 可讀性 / AI 清理 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label className="form-label">語氣風格</label>
                <select className="form-select" value={form.tone} onChange={e => setF("tone", e.target.value)} disabled={isGenerating}>
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">人稱視角</label>
                <select className="form-select" value={form.pointOfView} onChange={e => setF("pointOfView", e.target.value)} disabled={isGenerating}>
                  {POVS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">閱讀難度</label>
                <select className="form-select" value={form.readability} onChange={e => setF("readability", e.target.value)} disabled={isGenerating}>
                  {READABILITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI 用詞清理</label>
                <select className="form-select" value={form.removeAiWords} onChange={e => setF("removeAiWords", e.target.value as RemoveAI)} disabled={isGenerating}>
                  <option value="none">關閉</option>
                  <option value="basic">基本（去除常見 AI 用詞）</option>
                  <option value="extended">加強（深度清理）</option>
                </select>
              </div>
            </div>
          </div>


          {/* ══════════════════════════════════════════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════ A：文章 / 內容設定 ═══════════════════════════════════════ */}
          <div style={{ border: "1px solid rgba(59,130,246,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(59,130,246,0.02))", borderBottom: "1px solid rgba(59,130,246,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px" }}>📝</span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--accent-text)" }}>文章 / 內容設定</span>
            </div>
            <div style={{ padding: "0 16px" }}>
          {/* ── 文章結構 ── */}
          <SectionToggle label="Structure" open={showStruct} onToggle={() => setShowStruct(v => !v)}>
            {/* Introductory Hook Brief */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label className="form-label" style={{ margin: 0 }}>Introductory Hook Brief</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button type="button" disabled={(isGenerating || hookBriefLoading || !form.keyword.trim()) || !canUse("content.hook-brief")}
                    style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--card-border)", cursor: "pointer", background: "var(--bg-hover)" }}
                    title={hookTypesSelected.size > 1 ? `為 ${hookTypesSelected.size} 個類型各生成一個 Hook 範例` : "AI 幫你寫一個 Hook 草稿"}
                    onClick={() => {
                      // If nothing selected, auto-select the recommended type first then generate
                      if (hookTypesSelected.size === 0) {
                        const t = form.articleType;
                        const suggested: typeof HOOK_TYPES[number] =
                          t === "How-to Guide" || t === "Tutorial" ? "Statistical or Fact" :
                          t === "Listicle" || t === "Comparison" || t === "Q&A Page" ? "Statistical or Fact" :
                          t === "Case Study" ? "Anecdotal or Story" :
                          t === "Opinion Piece" ? "Personal or Emotional" :
                          "Question";
                        setHookTypesSelected(new Set([suggested]));
                        setF("introHookType", suggested);
                      }
                      void handleGenHookBriefs();
                    }}>
                    {hookBriefLoading ? "…" : `✦ ${hookTypesSelected.size > 1 ? `批次生成（${hookTypesSelected.size}）` : "推薦並生成"}`}
                  </button>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{form.introHookBrief.length}/500</span>
                </div>
              </div>
              {/* Multi-select hook types: left-click = select for article generation; right-click = nothing */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                {HOOK_TYPES.map(ht => {
                  const isActive   = form.introHookType === ht;
                  const isSelected = hookTypesSelected.has(ht);
                  return (
                    <button key={ht} type="button" disabled={isGenerating}
                      onClick={() => {
                        setHookTypesSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(ht)) {
                            next.delete(ht);
                            // If deselecting the active type, promote first remaining member
                            if (isActive) {
                              const promote = [...next][0] ?? "";
                              setF("introHookType", promote);
                              if (promote && hookBriefSugs[promote]) setF("introHookBrief", hookBriefSugs[promote]);
                            }
                          } else {
                            next.add(ht);
                            // Make newly added chip active + pre-fill brief if available
                            setF("introHookType", ht);
                            if (hookBriefSugs[ht]) setF("introHookBrief", hookBriefSugs[ht]);
                          }
                          return next;
                        });
                      }}
                      style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", cursor: "pointer",
                        border: isSelected ? "1.5px solid var(--btn-primary-bg)" : "1px solid var(--card-border)",
                        background: isActive ? "var(--btn-primary-bg)" : isSelected ? "color-mix(in srgb, var(--btn-primary-bg) 12%, transparent)" : "transparent",
                        color: isActive ? "var(--btn-primary-text)" : isSelected ? "var(--btn-primary-bg)" : "var(--text-muted)",
                        fontWeight: isSelected ? 600 : 400,
                      }}>
                      {HOOK_TYPE_LABELS[ht]}
                      {hookBriefSugs[ht] && !isActive && <span style={{ marginLeft: 4, opacity: 0.6 }}>✓</span>}
                    </button>
                  );
                })}
                {hookTypesSelected.size > 0 && (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", alignSelf: "center" }}>
                    {hookTypesSelected.size > 1 ? `已選 ${hookTypesSelected.size} 個 → 按推薦並生成批次生成草稿` : ""}
                  </span>
                )}
              </div>
              {/* Generated hook brief suggestions — only for currently selected types */}
              {Object.keys(hookBriefSugs).filter(t => hookTypesSelected.has(t)).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                  {Object.entries(hookBriefSugs).filter(([t]) => hookTypesSelected.has(t)).map(([t, brief]) => (
                    <div key={t} style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: "12px", border: "1px solid var(--card-border)" }}>
                      <div style={{ fontWeight: 600, fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>{HOOK_TYPE_LABELS[t as typeof HOOK_TYPES[number]] ?? t}</div>
                      <div style={{ color: "var(--text-primary)", lineHeight: 1.5 }}>{brief}</div>
                      <button type="button" onClick={() => { setF("introHookType", t as typeof HOOK_TYPES[number]); setF("introHookBrief", brief); }}
                        style={{ marginTop: "5px", fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--card-border)", cursor: "pointer", background: "var(--bg-hover)" }}>
                        使用此草稿
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea className="form-textarea" style={{ minHeight: "72px" }}
                value={form.introHookBrief} maxLength={500} disabled={isGenerating}
                onChange={e => setF("introHookBrief", e.target.value)}
                placeholder={`補充 Hook 的具體方向（選填）。例：\n• Question → 「你有沒有想過，為什麼大多數人學了藝術治療卻沒有改變？」\n• Statistical or Fact → 「根據 2024 APA 研究，8 成焦慮者從未嘗試表達性藝術…」\n• Anecdotal or Story → 「3 年前，一位來訪者拿著一張全黑的畫走進工作室…」`} />
            </div>

            {/* Yes/No dropdowns grid — 4 cols, 17 items = 5 rows */}
            <div style={{ fontWeight: 600, fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".05em" }}>基本結構</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px 16px", marginBottom: "14px" }}>
              {(["quickAnswer", "keyTakeaways", "comparisonTable", "faq", "conclusion", "tables", "h3", "lists", "italics", "quotes", "bold"] as const).map(key => (
                <div key={key}>
                  <label className="form-label" style={{ marginBottom: "4px" }}>{structLabels[key]}</label>
                  <select className="form-select" value={form.structure[key] ? "yes" : "no"} disabled={isGenerating}
                    onChange={e => setStruct(key, e.target.value === "yes")}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".05em" }}>進階內容元素</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px 16px", marginBottom: "12px" }}>
              {(["expertQuote", "prosCons", "stepByStep", "calloutBox", "caseStudy", "statCallout"] as const).map(key => (
                <div key={key}>
                  <label className="form-label" style={{ marginBottom: "4px" }}>{structLabels[key]}</label>
                  <select className="form-select" value={form.structure[key] ? "yes" : "no"} disabled={isGenerating}
                    onChange={e => setStruct(key, e.target.value === "yes")}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              ))}
            </div>

            <label style={checkLabel}>
              <input type="checkbox" checked={form.generateMeta} onChange={e => setF("generateMeta", e.target.checked)} disabled={isGenerating} />
              自動生成 SEO 標題 + Meta 描述
            </label>
          </SectionToggle>

          {/* ── 大綱編輯器 ── */}
          <SectionToggle label="大綱編輯器（先看大綱、可改再生成全文）" open={showOutline} onToggle={() => setShowOutline(v => !v)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label className="form-label" style={{ marginTop: 0, marginBottom: 0 }}>
                自訂大綱
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— ## H2、### H3、#### H4；每個標題含關鍵字或近義變體，生成全文時嚴格遵循</span>
              </label>
              <button title={why("content.outline")} className="btn-secondary" style={{ fontSize: "12px" }}
                onClick={handleGenOutline} disabled={(isGenerating || !form.keyword.trim() || outlineLoading) || !canUse("content.outline")}>
                {outlineLoading ? "…" : "✨ AI 自動生成大綱"}
              </button>
            </div>
            <textarea className="form-textarea" style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "12px" }}
              value={form.outline} onChange={e => setF("outline", e.target.value)} disabled={isGenerating}
              placeholder={"## 什麼是藝術療癒？\n## 藝術療癒的好處\n### 情緒層面\n### 認知層面\n## 如何開始\n## FAQ\n## 結語"} />
          </SectionToggle>

          {/* ── SEO / NLP 關鍵字 ── */}
          <SectionToggle label="SEO / NLP 關鍵字" open={showNlp} onToggle={() => setShowNlp(v => !v)}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ marginTop: 0 }}>
                  關鍵字列表（逗號分隔）
                  <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— AI 自然融入，不塞字</span>
                </label>
                <input className="form-input" value={form.nlpKeywords} onChange={e => setF("nlpKeywords", e.target.value)}
                  placeholder="例：表達藝術, 自我探索, 藝術工作坊, 創意療癒" disabled={isGenerating} />
              </div>
              <div style={{ position: "relative" }}>
                <button title={why("content.keywords")} className="btn-secondary" style={{ fontSize: "12px", whiteSpace: "nowrap" }}
                  onClick={handleGenKeywords} disabled={(isGenerating || !form.keyword.trim() || kwLoading) || !canUse("content.keywords")}>
                  {kwLoading ? "…" : "✨ AI 自動生成關鍵字"}
                </button>
                {showKwDrop && kwSugs.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                    background: "var(--bg-card)", border: "1px solid var(--card-border)",
                    borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,.12)", minWidth: "300px", padding: "8px" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", padding: "0 4px" }}>點選新增關鍵字：</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "0 4px" }}>
                      {kwSugs.map((kw, i) => (
                        <button key={i}
                          onClick={() => {
                            const existing = form.nlpKeywords.trim();
                            setF("nlpKeywords", existing ? `${existing}, ${kw}` : kw);
                          }}
                          style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid var(--card-border)",
                            background: "var(--bg-page)", cursor: "pointer", fontSize: "12px", color: "var(--text-primary)" }}>
                          {kw}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowKwDrop(false)}
                      style={{ fontSize: "11px", color: "var(--text-muted)", padding: "6px 4px 0", background: "none", border: "none", cursor: "pointer", display: "block" }}>
                      關閉
                    </button>
                  </div>
                )}
              </div>
            </div>
          </SectionToggle>

          {/* ── 分類 / 標籤 ── */}
          <SectionToggle label="分類 / 標籤" open={showCatTags} onToggle={() => setShowCatTags(v => !v)}>
            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label className="form-label">分類</label>
                {siteCategories.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
                    {siteCategories.slice(0, 12).map(cat => {
                      const selected = form.wpCategories.split(",").map(s => s.trim()).filter(Boolean).includes(cat);
                      return (
                        <button key={cat} type="button" disabled={isGenerating}
                          onClick={() => {
                            const cur = form.wpCategories.split(",").map(s => s.trim()).filter(Boolean);
                            const next = selected ? cur.filter(c => c !== cat) : [...cur, cat];
                            setF("wpCategories", next.join(", "));
                          }}
                          style={{ padding: "2px 8px", borderRadius: "12px", border: "1px solid", fontSize: "12px", cursor: "pointer",
                            background: selected ? "var(--color-primary)" : "var(--bg-hover)",
                            color: selected ? "var(--btn-primary-text)" : "var(--text-primary)", borderColor: selected ? "var(--color-primary)" : "var(--card-border)" }}>
                          {selected ? "✓ " : ""}{cat}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input className="form-input" style={{ width: "100%" }}
                  value={form.wpCategories} onChange={e => setF("wpCategories", e.target.value)}
                  placeholder="芳療, DIY 保養, 精油教學" disabled={isGenerating} />
                <div className="form-hint" style={{ marginTop: 4 }}>點選現有分類，或直接輸入（逗號分隔）。不存在的分類會自動建立。</div>
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label className="form-label">標籤</label>
                {siteTags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
                    {siteTags.slice(0, 20).map(tag => {
                      const selected = form.wpTags.split(",").map(s => s.trim()).filter(Boolean).includes(tag);
                      return (
                        <button key={tag} type="button" disabled={isGenerating}
                          onClick={() => {
                            const cur = form.wpTags.split(",").map(s => s.trim()).filter(Boolean);
                            const next = selected ? cur.filter(t => t !== tag) : [...cur, tag];
                            setF("wpTags", next.join(", "));
                          }}
                          style={{ padding: "2px 8px", borderRadius: "12px", border: "1px solid", fontSize: "12px", cursor: "pointer",
                            background: selected ? "var(--color-primary)" : "var(--bg-hover)",
                            color: selected ? "var(--btn-primary-text)" : "var(--text-secondary)",
                            borderColor: selected ? "var(--color-primary)" : "var(--card-border)" }}>
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input className="form-input" style={{ width: "100%" }}
                  value={form.wpTags} onChange={e => setF("wpTags", e.target.value)}
                  placeholder="檸檬精油, 精油配方, 天然保養" disabled={isGenerating} />
                <div className="form-hint" style={{ marginTop: 4 }}>點選現有標籤，或直接輸入（逗號分隔）。不存在的標籤會自動建立。</div>
              </div>
            </div>
          </SectionToggle>

          {/* ── 內部連結 ── */}
          <SectionToggle label="內部連結（Internal Links）" open={showIntLinks} onToggle={() => setShowIntLinks(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              強制引用的站內頁面
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— 每行一個，最多 10 個（絕對 URL 或 /路徑）</span>
            </label>
            <textarea className="form-textarea" style={{ minHeight: "90px" }}
              value={form.internalLinks} onChange={e => setF("internalLinks", e.target.value)} disabled={isGenerating}
              placeholder={"https://soulfulexpression.org/art-therapy-basics\n/workshop-schedule\n/about-us"} />
            <div className="form-hint">站內連結已由 Internal Link Juicer 外掛自動處理。此欄位用於強制 AI 引用特定頁面（例如相關工作坊或課程頁面）。</div>
          </SectionToggle>

          {/* ── Connect to Web ── */}
          <SectionToggle label="參考 URL（Connect to Web）" open={showConnWeb} onToggle={() => setShowConnWeb(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              最多 3 個參考頁面 URL
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— AI 讀取頁面內容作為事實參考</span>
            </label>
            <textarea className="form-textarea" style={{ minHeight: "80px" }}
              value={form.referenceUrls} onChange={e => setF("referenceUrls", e.target.value)} disabled={isGenerating}
              placeholder={"https://en.wikipedia.org/wiki/Art_therapy\nhttps://example.com/research-paper"} />
            <div className="form-hint">伺服器端抓取頁面文字注入提示詞（每個 URL 最多 3000 字元）。只讀 https 網址。</div>
            {(() => {
              // the server reads only https (lib/collect/net/remote-file.ts); say so before the article runs without it
              const plain = form.referenceUrls.split("\n").map(u => u.trim()).filter(u => u && !u.startsWith("https://"));
              return plain.length > 0 && (
                <div style={{ fontSize: "11px", color: "var(--yellow)", marginTop: 4 }}>
                  這些不是 https:// 開頭的網址，不會被讀取：{plain.join("、")}
                </div>
              );
            })()}
          </SectionToggle>

          {/* ── 外部連結 ── */}
          <SectionToggle label="外部連結（External Links）" open={showExtLinks} onToggle={() => setShowExtLinks(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              指定插入的外部連結
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— 每行一個，最多 5 個</span>
            </label>
            <textarea className="form-textarea" style={{ minHeight: "90px" }}
              value={form.externalLinks} onChange={e => setF("externalLinks", e.target.value)} disabled={isGenerating}
              placeholder={"https://example.com/art-therapy-research\nhttps://example.com/mental-health-resources"} />
          </SectionToggle>

          {/* ── Media Hub ── */}
          <SectionToggle label="Media Hub" open={showMedia} onToggle={() => setShowMedia(v => !v)}>
            <div style={{ background: "var(--build-risk-medium-bg)", border: "1px solid var(--yellow)", borderRadius: "6px", padding: "14px" }}>
              {/* Row 1: AI Images + count + size + style */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto 1fr", gap: "12px", marginBottom: "12px", alignItems: "end" }}>
                <div>
                  <label className="form-label">AI Images</label>
                  <select className="form-select" value={form.media.aiImages} disabled={isGenerating}
                    onChange={e => setMedia("aiImages", e.target.value)}>
                    {AI_IMAGE_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Number of images</label>
                  <select className="form-select" value={form.media.imageCount}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("imageCount", Number(e.target.value))}>
                    {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Image Size</label>
                  <select className="form-select" value={form.media.imageSize}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("imageSize", e.target.value)}>
                    {IMAGE_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Image style / 風格預設</label>
                  <select className="form-select" value={form.media.imageStyle}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("imageStyle", e.target.value)}>
                    <option value="">None（不套用風格）</option>
                    {STYLE_GROUPS.map(g => (
                      <optgroup key={g} label={g}>
                        {STYLE_CATALOG.filter(s => s.group === g).map(s => (
                          <option key={s.zh} value={s.zh}>{s.zh}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 1b: Reference image (img2img / 以圖生圖) + Seed (固定風格 / 種子值) — model-gated */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px", alignItems: "end" }}>
                <div>
                  <label className="form-label">
                    參考圖 / img2img{" "}
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                      {selectedImageModel.img2img ? "（以圖生圖：上傳一張參考圖）" : "（此模型不支援）"}
                    </span>
                  </label>
                  {form.media.imageRefData ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <img src={form.media.imageRefData} alt="參考圖"
                        style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--card-border)" }} />
                      <button type="button" className="btn-secondary" style={{ fontSize: "12px", padding: "4px 10px" }}
                        disabled={isGenerating}
                        onClick={() => setMedia("imageRefData", "")}>移除參考圖</button>
                    </div>
                  ) : (
                    <input type="file" accept="image/png,image/jpeg,image/webp"
                      className="form-input"
                      disabled={isGenerating || form.media.aiImages === "none" || !selectedImageModel.img2img}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = ""; // allow re-selecting the same file after a remove
                        if (!file) return;
                        // Reject oversize before encoding: an 8 MB raw file → ~11 M base64 chars, still
                        // under the route's 12 M-char guard. Larger would 413 at the API; catch it here
                        // with a clear message instead of base64-ing megabytes only to bounce it.
                        const MAX_REF_BYTES = 8 * 1024 * 1024;
                        if (file.size > MAX_REF_BYTES) {
                          setImgGenWarn(`參考圖過大（${(file.size / 1048576).toFixed(1)}MB，上限 8MB），請壓縮後再上傳`);
                          return;
                        }
                        setImgGenWarn("");
                        const reader = new FileReader();
                        reader.onload = () => setMedia("imageRefData", typeof reader.result === "string" ? reader.result : "");
                        reader.onerror = () => setImgGenWarn("參考圖讀取失敗，請改用其他圖片");
                        reader.readAsDataURL(file);
                      }} />
                  )}
                </div>
                <div>
                  <label className="form-label">
                    Seed / 種子值{" "}
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                      {selectedImageModel.seed ? "（固定風格可重現）" : "（此模型不支援）"}
                    </span>
                  </label>
                  <input className="form-input" type="number" min={0} max={4294967295} inputMode="numeric"
                    value={form.media.imageSeed}
                    disabled={isGenerating || form.media.aiImages === "none" || !selectedImageModel.seed}
                    onChange={e => setMedia("imageSeed", e.target.value)}
                    placeholder="隨機" />
                </div>
              </div>

              {/* Row 2: Additional Instructions + Brand Name */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="form-label" style={{ margin: 0 }}>Additional Instructions</label>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{form.media.imageInstructions.length}/100</span>
                  </div>
                  <input className="form-input" value={form.media.imageInstructions} maxLength={100}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("imageInstructions", e.target.value)}
                    placeholder="Enter details or creative directions" />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="form-label" style={{ margin: 0 }}>Brand Name</label>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{form.media.brandName.length}/30</span>
                  </div>
                  <input className="form-input" value={form.media.brandName} maxLength={30}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => { setMedia("brandName", e.target.value); setBrandNameTouched(true); }}
                    placeholder="Enter your brand name" />
                  {!brandNameTouched && form.media.brandName && (
                    <div className="form-hint" style={{ marginTop: 2 }}>已自動帶入目標客戶名稱，可直接覆寫。</div>
                  )}
                </div>
              </div>

              {/* Alt-text checkboxes */}
              <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }}
                    checked={form.media.includeKeywordAlt}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("includeKeywordAlt", e.target.checked)} />
                  <span style={{ lineHeight: 1.4 }}>
                    Include the main keyword in the first image as Alt-text.{" "}
                    <span style={{ color: "var(--btn-primary-bg)" }}>Relevant keywords will be picked up and added to the rest of the images.</span>
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }}
                    checked={form.media.autoAltText}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("autoAltText", e.target.checked)} />
                  <span style={{ lineHeight: 1.4, color: "var(--btn-primary-bg)" }}>
                    Adds informative Alt-text to images based on their content, providing a clear description of what is depicted to improve SEO.
                  </span>
                </label>
              </div>

              {/* YouTube row */}
              <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: "12px", marginBottom: "12px", alignItems: "end" }}>
                <div>
                  <label className="form-label">YouTube videos</label>
                  <select className="form-select" value={form.media.youtubeSource} disabled={isGenerating}
                    onChange={e => setMedia("youtubeSource", e.target.value)}>
                    <option value="none">None</option>
                    {video && <option value="ai-video">🎬 AI 影片</option>}
                  </select>
                </div>
                <div>
                  <label className="form-label">Number of videos</label>
                  <select className="form-select" value={form.media.youtubeCount}
                    disabled={isGenerating || form.media.youtubeSource === "none" || form.media.youtubeSource === "ai-video"}
                    onChange={e => setMedia("youtubeCount", Number(e.target.value))}>
                    <option>1</option><option>2</option><option>3</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Layout Options</label>
                  <select className="form-select" value={form.media.youtubeLayout}
                    disabled={isGenerating || form.media.youtubeSource === "none" || form.media.youtubeSource === "ai-video"}
                    onChange={e => setMedia("youtubeLayout", e.target.value)}>
                    {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* AI 影片設定（選 ai-video 時展開）*/}
              {video && form.media.youtubeSource === "ai-video" && (
                <div style={{ marginTop: "8px", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ai-bg)", background: "var(--ai-bg)", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* 素材模式 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ai-text)" }}>素材模式</span>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {([
                        { id: "pexels-video", label: "📹 真實影片", badge: "$0" },
                        { id: "pexels-all",   label: "🖼 照片動畫", badge: "$0" },
                        { id: "__ai__",       label: "✨ AI 生圖",  badge: "按模型" },
                      ] as { id: string; label: string; badge: string }[]).map(({ id, label, badge }) => {
                        const isAiBtn = id === "__ai__";
                        const active = isAiBtn
                          ? (videoImageModel !== "pexels-video" && videoImageModel !== "pexels-all")
                          : videoImageModel === id;
                        return (
                          <button key={id} type="button"
                            onClick={() => {
                              if (isAiBtn) {
                                if (videoImageModel === "pexels-video" || videoImageModel === "pexels-all") {
                                  setVideoImageModel(DEFAULT_IMAGE_MODEL);
                                  setVideoCustomScenes(videoTotalScenes);
                                }
                              } else {
                                setVideoImageModel(id);
                              }
                            }}
                            style={{
                              padding: "6px 12px", borderRadius: 8,
                              border: `2px solid ${active ? "var(--accent)" : "rgba(0,0,0,0.12)"}`,
                              background: active ? "var(--accent)" : "rgba(255,255,255,0.8)",
                              color: active ? "var(--btn-primary-text)" : "var(--text-secondary)",
                              cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500, lineHeight: 1.4,
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                            }}>
                            <span>{label}</span>
                            <span style={{ fontSize: 10, opacity: 0.8 }}>{badge}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* AI 模式：生圖模型下拉 */}
                    {videoImageModel !== "pexels-video" && videoImageModel !== "pexels-all" && (
                      <select value={videoImageModel} onChange={(e) => setVideoImageModel(e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--ai-bg)", fontSize: "12px", background: "var(--card-bg)", color: "var(--text-primary)", width: "100%" }}>
                        {Object.entries(IMAGE_RATES)
                          .filter(([id]) => id !== "pexels-video" && id !== "pexels-all")
                          .map(([id, r]) => (
                            <option key={id} value={id}>{r.label} — ${r.usd}/張</option>
                          ))}
                      </select>
                    )}
                  </div>
                  {/* 視覺風格 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ai-text)" }}>
                      🎨 視覺風格 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>{videoStyleZh || "不指定（電影感預設）"}</span>
                    </span>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {VIDEO_STYLE_GROUPS.map((g) => (
                        <button key={g} type="button" onClick={() => setVideoStyleGroup(g)}
                          style={{ padding: "2px 10px", borderRadius: 20, fontSize: "11px", cursor: "pointer",
                            border: `1px solid ${videoStyleGroup === g ? "var(--severity-low)" : "var(--ai-bg)"}`,
                            background: videoStyleGroup === g ? "var(--severity-low)" : "rgba(255,255,255,0.6)",
                            color: videoStyleGroup === g ? "var(--btn-primary-text)" : "var(--text-muted)" }}>
                          {g}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", maxHeight: "100px", overflowY: "auto" }}>
                      {VIDEO_STYLE_CATALOG.filter((item) => item.group === videoStyleGroup).map((item) => {
                        const active = videoStyleZh === item.zh;
                        return (
                          <button key={item.zh} type="button" onClick={() => setVideoStyleZh(active ? "" : item.zh)}
                            style={{ padding: "2px 9px", borderRadius: 20, fontSize: "11px", cursor: "pointer",
                              border: `1px solid ${active ? "var(--severity-low)" : "var(--ai-bg)"}`,
                              background: active ? "var(--severity-low)" : "rgba(255,255,255,0.6)",
                              color: active ? "var(--btn-primary-text)" : "var(--text-muted)" }}>
                            {item.zh}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* 場景設定 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.6)", border: "1px solid var(--ai-bg)" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ai-text)" }}>場景設定</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>場景總數</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{videoTotalScenes} 場</span>
                      </div>
                      <input type="range" min={1} max={20} step={1} value={videoTotalScenes}
                        onChange={(e) => { const n = Number(e.target.value); setVideoTotalScenes(n); if (videoCustomScenes > n) setVideoCustomScenes(n); }}
                        style={{ width: "100%", accentColor: "var(--severity-low)" }} />
                    </div>
                    {/* 自訂 AI 圖滑桿：只在 AI 生圖模式顯示 */}
                    {videoImageModel !== "pexels-video" && videoImageModel !== "pexels-all" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>自訂 AI 圖</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{videoCustomScenes}/{videoTotalScenes} · B-roll：{Math.max(0, videoTotalScenes - videoCustomScenes)}</span>
                      </div>
                      <input type="range" min={0} max={videoTotalScenes} step={1} value={videoCustomScenes}
                        onChange={(e) => setVideoCustomScenes(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--severity-low)" }} />
                    </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>配音模型</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {(["edge", "openai"] as const).map((prov) => {
                          const active = videoVoiceId.startsWith(prov + ":");
                          const firstVoice = VOICE_MODELS_VIDEO.find((v) => v.id.startsWith(prov + ":"))?.id ?? videoVoiceId;
                          return (
                            <button key={prov} type="button" onClick={() => setVideoVoiceId(firstVoice)}
                              style={{ padding: "2px 10px", borderRadius: 20, fontSize: "11px", cursor: "pointer",
                                border: `1px solid ${active ? "var(--severity-low)" : "var(--ai-bg)"}`,
                                background: active ? "var(--severity-low)" : "rgba(255,255,255,0.6)",
                                color: active ? "var(--btn-primary-text)" : "var(--text-muted)" }}>
                              {prov === "edge" ? "Edge 免費" : "OpenAI"}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {VOICE_MODELS_VIDEO.filter((v) => v.id.startsWith(videoVoiceId.startsWith("openai:") ? "openai:" : "edge:")).map((v) => {
                          const active = videoVoiceId === v.id;
                          return (
                            <button key={v.id} type="button" onClick={() => setVideoVoiceId(v.id)}
                              style={{ padding: "2px 9px", borderRadius: 20, fontSize: "11px", cursor: "pointer",
                                border: `1px solid ${active ? "var(--severity-low)" : "var(--ai-bg)"}`,
                                background: active ? "var(--severity-low)" : "rgba(255,255,255,0.6)",
                                color: active ? "var(--btn-primary-text)" : "var(--text-muted)" }}>
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                      {videoVoiceId.startsWith("openai:") && (
                        <div style={{ fontSize: "11px", color: "#92400e", background: "#fef3c7", padding: "4px 8px", borderRadius: 6, lineHeight: 1.5 }}>
                          ⚠️ OpenAI TTS 需在伺服器設定 OPENAI_API_KEY，否則自動降版 Edge TTS
                        </div>
                      )}
                    </div>
                    {/* 輸出比例（每比例各自原生生成、無黑邊） */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>輸出比例（各比例獨立原生）</span>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {VIDEO_FORMAT_CHOICES.map((fmt) => {
                          const active = videoFormats.has(fmt);
                          const meta = VIDEO_FORMAT_LABELS[fmt];
                          return (
                            <button key={fmt} type="button"
                              onClick={() => setVideoFormats((prev) => {
                                const next = new Set(prev);
                                if (next.has(fmt)) { if (next.size > 1) next.delete(fmt); } // 至少留一個
                                else next.add(fmt);
                                return next;
                              })}
                              style={{
                                padding: "5px 11px", borderRadius: 8,
                                border: `2px solid ${active ? "var(--severity-low)" : "var(--ai-bg)"}`,
                                background: active ? "var(--severity-low)" : "rgba(255,255,255,0.6)",
                                color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
                                cursor: "pointer", fontSize: "12px", fontWeight: active ? 700 : 500,
                                display: "flex", alignItems: "center", gap: "4px",
                              }}>
                              <span>{meta.icon}</span><span>{meta.ratio}</span><span style={{ fontSize: "10px", opacity: 0.75 }}>{meta.label}</span>
                            </button>
                          );
                        })}
                        <button type="button"
                          onClick={() => setVideoFormats(new Set(VIDEO_FORMAT_CHOICES))}
                          style={{
                            padding: "5px 11px", borderRadius: 8,
                            border: `2px solid ${videoFormats.size === VIDEO_FORMAT_CHOICES.length ? "var(--severity-low)" : "var(--ai-bg)"}`,
                            background: videoFormats.size === VIDEO_FORMAT_CHOICES.length ? "var(--severity-low)" : "rgba(255,255,255,0.6)",
                            color: videoFormats.size === VIDEO_FORMAT_CHOICES.length ? "var(--btn-primary-text)" : "var(--text-muted)",
                            cursor: "pointer", fontSize: "12px", fontWeight: 600,
                          }}>
                          全選
                        </button>
                      </div>
                      {videoFormats.size > 1 && videoImageModel !== "pexels-video" && videoImageModel !== "pexels-all" && (
                        <span style={{ fontSize: "11px", color: "#92400e", background: "#fef3c7", padding: "4px 8px", borderRadius: 6, lineHeight: 1.5 }}>
                          ⚠️ {videoFormats.size} 個比例 = 渲染成本/時間約 ×{videoFormats.size}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Strict under headings */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }}
                  checked={form.media.strictUnderHeadings}
                  disabled={isGenerating || (form.media.aiImages === "none" && form.media.youtubeSource === "none")}
                  onChange={e => setMedia("strictUnderHeadings", e.target.checked)} />
                <span style={{ lineHeight: 1.4 }}>
                  <span style={{ color: "var(--btn-primary-bg)" }}>All media elements will be placed strictly under the headings.</span>
                  {" "}<span style={{ color: "var(--text-muted)" }}>If disabled, the AI will decide and find the best placement.</span>
                </span>
              </label>
            </div>
          </SectionToggle>

          {/* ── #6 Kadence 漏斗 Patterns ── */}
          <SectionToggle label="🧲 Kadence 漏斗 Patterns（在文章插入 CTA 區塊）" open={showPatterns} onToggle={() => setShowPatterns(v => !v)}>
            {/* Mode toggle + refresh */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
              <button type="button" disabled={isGenerating}
                onClick={() => setPatternMode("auto")}
                style={{ padding: "3px 12px", fontSize: "12px", borderRadius: "4px", border: "1px solid", cursor: "pointer",
                  background: patternMode === "auto" ? "var(--color-primary)" : "var(--bg-hover)",
                  color: patternMode === "auto" ? "var(--btn-primary-text)" : "var(--text-secondary)",
                  borderColor: patternMode === "auto" ? "var(--color-primary)" : "var(--card-border)" }}>
                AI 自動挑選
              </button>
              <button type="button" disabled={isGenerating}
                onClick={() => setPatternMode("manual")}
                style={{ padding: "3px 12px", fontSize: "12px", borderRadius: "4px", border: "1px solid", cursor: "pointer",
                  background: patternMode === "manual" ? "var(--color-primary)" : "var(--bg-hover)",
                  color: patternMode === "manual" ? "var(--btn-primary-text)" : "var(--text-secondary)",
                  borderColor: patternMode === "manual" ? "var(--color-primary)" : "var(--card-border)" }}>
                手動選擇
              </button>
              <button className="btn-secondary" onClick={() => void loadPatterns()} disabled={patternsLoading}
                style={{ fontSize: "12px", marginLeft: "auto" }}>
                {patternsLoading ? "讀取中…" : "↻ 重新讀取"}
              </button>
            </div>

            {/* Auto mode: count selector + hint */}
            {patternMode === "auto" && (
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "6px" }}>
                  <label className="form-label" style={{ marginTop: 0, marginBottom: 0 }}>AI 插入數量</label>
                  <select className="form-select" style={{ width: "auto" }} value={String(form.patternCount)} disabled={isGenerating}
                    onChange={e => setF("patternCount", Number(e.target.value) || 0)}>
                    {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 0 ? "關閉" : `${n} 個`}</option>)}
                  </select>
                </div>
                <div className="form-hint">AI 從下方 patterns 中挑選最相關的 {form.patternCount || "N"} 個，插入漏斗點（引言後、中段、結論前）。</div>
              </div>
            )}

            {/* Manual mode hint */}
            {patternMode === "manual" && (
              <div className="form-hint" style={{ marginBottom: "6px" }}>
                {selectedPatternIds.length === 0
                  ? "點擊下方 pattern 來選擇（可多選）；AI 將按序插入文章漏斗點。"
                  : `已選 ${selectedPatternIds.length} 個 → AI 將在漏斗點依序插入這些 patterns。`}
              </div>
            )}

            {/* Pattern chips */}
            {availablePatterns.length > 0 ? (
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {availablePatterns.map(p => {
                  const isSelected = patternMode === "manual" && selectedPatternIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" disabled={isGenerating}
                      title={`ID: ${p.id}${p.slug ? ` | ${p.slug}` : ""}`}
                      onClick={() => {
                        if (patternMode !== "manual") return;
                        setSelectedPatternIds(prev =>
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        );
                      }}
                      style={{
                        padding: "3px 10px", borderRadius: "4px", border: "1px solid",
                        fontSize: "12px",
                        cursor: patternMode === "manual" ? "pointer" : "default",
                        background: isSelected ? "var(--color-primary)" : "var(--bg-hover)",
                        color: isSelected ? "var(--btn-primary-text)" : "var(--text-primary)",
                        borderColor: isSelected ? "var(--color-primary)" : "var(--card-border)",
                      }}>
                      {p.title}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="form-hint" style={{ marginTop: 8, color: patternsNote && !patternsNote.includes("no auth") ? "var(--red)" : "var(--text-muted)" }}>
                {patternsLoading ? "" : patternsNote
                  ? patternsNote.includes("no auth")
                    ? "此站台尚未設定 Application Password，無法讀取 wp_block（WordPress → 使用者 → 你的帳號 → 應用程式密碼 → 新增）。"
                    : `讀取異常（${patternsNote}）— 請確認站台 Application Password 設定正確。`
                  : "尚未讀取到 patterns（按上方按鈕讀取；站台需設定 Application Password 才可讀取 wp_block）。"}
              </div>
            )}
          </SectionToggle>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════════════════════ */}
          {/* ══════════════════════════════════ B：品牌資料 ════════════════════════════════════════ */}
          <div style={{ border: "1px solid rgba(139,92,246,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.08),rgba(139,92,246,0.02))", borderBottom: "1px solid rgba(139,92,246,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px" }}>🎯</span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--accent-text)" }}>品牌資料</span>
              {!onDoor && <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: 4 }}>— 自動帶入 app.aware-wave.com/ops/clients 客戶資料</span>}
            </div>
            <div style={{ padding: "0 16px" }}>

          {/* ── 品牌聲音 ── */}
          <SectionToggle label="品牌聲音（Brand Voice）— 分析範例文字，自動萃取寫作風格" open={showBrandVoice} onToggle={() => setShowBrandVoice(v => !v)}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <div>
                <label className="form-label">品牌 / 客戶名稱</label>
                <input className="form-input" value={bvProfileName}
                  onChange={e => { setBvProfileName(e.target.value); setBvNameTouched(true); }}
                  placeholder="例：Soulful Expression" />
                {!bvNameTouched && wpSites.length > 0 && (
                  <div className="form-hint">已自動帶入目標客戶「{currentSite?.name}」，可直接覆寫。</div>
                )}
              </div>
              <div>
                <label className="form-label">從 URL 擷取（選填）</label>
                <input className="form-input" value={bvSampleUrl}
                  onChange={e => { setBvSampleUrl(e.target.value); setBvUrlTouched(true); }}
                  placeholder="https://example.com/about" />
                {!bvUrlTouched && bvSampleUrl.trim() && (
                  <div className="form-hint">已自動帶入目標客戶 About 頁，可直接覆寫。</div>
                )}
                {bvSampleUrl.trim() && !bvSampleText.trim() && (
                  <div className="form-hint" style={{ color: "var(--severity-high)" }}>伺服器端抓取頁面文字；若 URL 需登入或封鎖爬蟲則會靜默失敗，建議同時貼入範例文字。</div>
                )}
              </div>
            </div>
            <label className="form-label">範例文字（貼入品牌文章或 About 頁面，至少 50 字）</label>
            <textarea className="form-textarea" style={{ minHeight: "100px" }}
              value={bvSampleText} onChange={e => setBvSampleText(e.target.value)}
              placeholder="貼入品牌文章、廣告文案或 About 頁面文字…" />
            <div style={{ display: "flex", gap: "10px", marginTop: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button title={why("content.brand-voice")} className="btn-secondary" onClick={handleAnalyzeBrandVoice}
                disabled={(bvLoading || (!bvSampleText.trim() && !bvSampleUrl.trim())) || !canUse("content.brand-voice")}
                style={{ fontSize: "12px" }}>
                {bvLoading ? "分析中…" : "🔍 分析品牌聲音"}
              </button>
              {bvProfile && (
                <button className="btn-primary" onClick={handleApplyBrandVoice} style={{ fontSize: "12px" }}>
                  {bvApplied ? "✓ 已套用" : "✨ 注入文章提示詞"}
                </button>
              )}
              {bvError && <span style={{ color: "var(--color-error)", fontSize: "12px" }}>{bvError}</span>}
            </div>
            {bvProfile && (
              <div style={{ marginTop: "12px", padding: "12px", background: "var(--bg-hover)", borderRadius: "6px", fontSize: "12px" }}>
                <div style={{ fontWeight: 600, marginBottom: "8px", color: "var(--text-primary)" }}>{bvProfile.name} — 品牌聲音摘要</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                  <div><span style={{ color: "var(--text-muted)" }}>語調：</span>{bvProfile.tone}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>詞彙：</span>{bvProfile.vocabulary}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>句型：</span>{bvProfile.sentenceStyle}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>個性：</span>{bvProfile.personality.join("、")}</div>
                </div>
                {bvProfile.preferWords.length > 0 && (
                  <div style={{ marginTop: "6px" }}>
                    <span style={{ color: "var(--text-muted)" }}>偏好用詞：</span>
                    {bvProfile.preferWords.map((w, i) => (
                      <span key={i} style={{ display: "inline-block", padding: "1px 6px", background: "var(--badge-green-bg)", color: "var(--badge-green-text)", borderRadius: "3px", marginRight: "4px", marginBottom: "2px", fontSize: "11px" }}>{w}</span>
                    ))}
                  </div>
                )}
                {bvProfile.avoidWords.length > 0 && (
                  <div style={{ marginTop: "4px" }}>
                    <span style={{ color: "var(--text-muted)" }}>避免用詞：</span>
                    {bvProfile.avoidWords.map((w, i) => (
                      <span key={i} style={{ display: "inline-block", padding: "1px 6px", background: "var(--badge-red-bg)", color: "var(--badge-red-text)", borderRadius: "3px", marginRight: "4px", marginBottom: "2px", fontSize: "11px" }}>{w}</span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: "8px", padding: "8px", background: "var(--bg-card)", borderRadius: "4px", borderLeft: "3px solid var(--btn-primary-bg)", fontSize: "11px", lineHeight: 1.5 }}>
                  {bvProfile.promptInjection}
                </div>
              </div>
            )}
          </SectionToggle>

          {/* ── #5 競業與痛點分析 ── */}
          <SectionToggle label="🔍 競業與痛點分析（多角度市場研究）" open={showMarket} onToggle={() => setShowMarket(v => !v)}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
              <button title={why("content.market-analysis")} className="btn-secondary" onClick={handleMarketAnalysis}
                disabled={(marketLoading || !form.keyword.trim()) || !canUse("content.market-analysis")} style={{ fontSize: "12px" }}>
                {marketLoading ? "分析中（約 10–30 秒）…" : "🔍 分析競業與痛點"}
              </button>
              {marketContext && <span style={{ color: "var(--green)", fontSize: "12px" }}>✓ 已納入，產生文章時自動注入</span>}
              {marketError && <span style={{ color: "var(--color-error)", fontSize: "12px" }}>{marketError}</span>}
            </div>
            <div className="form-hint">用 AI 多角度分析，從競爭對手、讀者痛點、搜尋意圖、轉換疑慮、差異化機會五個角度，結果會引導文章定位。需先填關鍵字。</div>
            {marketAnalysis && (
              <div style={{ marginTop: "12px", display: "grid", gap: "10px", fontSize: "12px" }}>
                {([
                  ["讀者痛點", marketAnalysis.painPoints, "var(--badge-red-bg)", "var(--badge-red-text)"],
                  ["搜尋意圖 / 角度", marketAnalysis.searchIntent, "var(--ai-bg)", "var(--accent)"],
                  ["轉換疑慮", marketAnalysis.objections, "var(--build-risk-medium-bg)", "var(--build-risk-medium-text)"],
                  ["競爭對手", marketAnalysis.competitors, "#f3e8ff", "#6b21a8"],
                  ["差異化機會", marketAnalysis.differentiators, "var(--badge-green-bg)", "var(--badge-green-text)"],
                ] as [string, string[], string, string][]).filter(([, arr]) => arr.length > 0).map(([title, arr, bg, fg]) => (
                  <div key={title}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>{title}</div>
                    <div>
                      {arr.map((x, i) => (
                        <span key={i} style={{ display: "inline-block", padding: "2px 7px", background: bg, color: fg, borderRadius: "3px", marginRight: "4px", marginBottom: "4px" }}>{x}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionToggle>

          {/* ── 精準受眾畫像（獨立折疊，注入文章生成）── */}
          <SectionToggle label="精準受眾畫像（點選即注入文章生成）" open={showAudProfile} onToggle={() => setShowAudProfile(v => !v)}>
            <div>

              {/* 常用人設 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>常用人設（一鍵套整組）</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {AUDIENCE_PRESETS.map(p => (
                    <button key={p.label} type="button" disabled={isGenerating}
                      onClick={() => applyAPPreset(p.sel as Record<string, string[]>)}
                      style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, border: "1px solid var(--accent)", cursor: "pointer", background: "transparent", color: "var(--accent-text)", fontWeight: 500 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2-column grid: 內容目的/語氣/CTA + 六維度 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
                {/* 內容目的 */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>內容目的</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {CONTENT_GOALS.map(g => (
                      <ChipBtn key={g} label={g} disabled={isGenerating} active={apState.contentGoal === g} onClick={() => setSingleAP("contentGoal", g)} />
                    ))}
                  </div>
                </div>

                {/* 語氣風格 */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>語氣風格</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {CONTENT_TONES_CHIPS.map(t => (
                      <ChipBtn key={t} label={t} disabled={isGenerating} active={apState.contentTone === t} onClick={() => setSingleAP("contentTone", t)} />
                    ))}
                  </div>
                </div>

                {/* 觀眾行動 CTA */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>觀眾行動（CTA）</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {CONTENT_CTAS.map(c => (
                      <ChipBtn key={c} label={c} disabled={isGenerating} active={apState.audienceAction === c} onClick={() => setSingleAP("audienceAction", c)} />
                    ))}
                  </div>
                </div>

                {/* 目標受眾六維度 */}
                {AUDIENCE_CATS.map(cat => (
                  <div key={cat.key} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>{cat.label}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      {cat.opts.map(opt => {
                        const arr = (apState[cat.key as keyof AP] as string[] | undefined) ?? [];
                        const active = arr.includes(opt);
                        return (
                          <ChipBtn key={opt} label={opt} disabled={isGenerating} active={active}
                            onClick={() => cat.multi ? toggleMultiAP(cat.key as keyof AP, opt) : toggleSingleAP(cat.key as keyof AP, opt)} />
                        );
                      })}
                      {cat.custom && (
                        <input placeholder="+ 自訂" disabled={isGenerating}
                          style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, border: "1px dashed var(--card-border)", background: "transparent", color: "var(--text-primary)", width: 72 }}
                          value={(apState[(cat.key + "Custom") as keyof AP] as string | undefined) ?? ""}
                          onChange={e => setApState(ap => ({ ...ap, [(cat.key + "Custom") as keyof AP]: e.target.value }))} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 清除 chips */}
              <button type="button" disabled={isGenerating}
                onClick={() => { setApState(DEFAULT_AP); setMkt("audience", ""); }}
                style={{ marginTop: 4, fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                × 清除所有選擇
              </button>
            </div>
          </SectionToggle>

          {/* ── #4 品牌語調 / 精準行銷（結構化表單）── */}
          <SectionToggle label="🎯 品牌語調 / 精準行銷（填表單，打中目標）" open={showMarketing} onToggle={() => setShowMarketing(v => !v)}>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label className="form-label" style={{ marginTop: 0 }}>目標受眾（由上方晶片自動編譯，可手動覆寫）</label>
                <input className="form-input" value={form.marketing.audience} disabled={isGenerating}
                  onChange={e => setMkt("audience", e.target.value)} placeholder="例：台灣成人，對表達藝術有興趣" />
              </div>
              <div>
                <label className="form-label" style={{ marginTop: 0 }}>品牌定位（一句話）</label>
                <input className="form-input" value={form.marketing.positioning} disabled={isGenerating}
                  onChange={e => setMkt("positioning", e.target.value)} placeholder="例：陪伴而非治療的藝術自我探索空間" />
              </div>
              <div>
                <label className="form-label">獨特賣點 / 差異化（USP）</label>
                <input className="form-input" value={form.marketing.usp} disabled={isGenerating}
                  onChange={e => setMkt("usp", e.target.value)} placeholder="例：跨文化、結構化模組、真人帶領" />
              </div>
              <div>
                <label className="form-label">漏斗階段</label>
                <select className="form-select" value={form.marketing.funnelStage} disabled={isGenerating}
                  onChange={e => setMkt("funnelStage", e.target.value)}>
                  {FUNNEL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">主要行動呼籲（CTA）</label>
                <input className="form-input" value={form.marketing.primaryCta} disabled={isGenerating}
                  onChange={e => setMkt("primaryCta", e.target.value)} placeholder="例：預約免費體驗工作坊" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {MKT_PRESETS.primaryCta.map(p => (
                    <button key={p} type="button" disabled={isGenerating} onClick={() => setMkt("primaryCta", p)}
                      style={{ padding: "1px 7px", borderRadius: "10px", border: "1px solid var(--card-border)", fontSize: "11px", cursor: "pointer", background: "var(--bg-hover,#f5f5f5)", color: "var(--text-secondary)" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">價格定位</label>
                <select className="form-select" value={form.marketing.pricePositioning} disabled={isGenerating}
                  onChange={e => setMkt("pricePositioning", e.target.value)}>
                  {PRICE_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">情緒觸發點 / 讀者渴望</label>
                <input className="form-input" value={form.marketing.emotionalTriggers} disabled={isGenerating}
                  onChange={e => setMkt("emotionalTriggers", e.target.value)} placeholder="例：渴望被理解、想找回創造力" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {MKT_PRESETS.emotionalTriggers.map(p => (
                    <button key={p} type="button" disabled={isGenerating}
                      onClick={() => {
                        const cur = form.marketing.emotionalTriggers.trim();
                        setMkt("emotionalTriggers", cur ? `${cur}、${p}` : p);
                      }}
                      style={{ padding: "1px 7px", borderRadius: "10px", border: "1px solid var(--card-border)", fontSize: "11px", cursor: "pointer", background: "var(--bg-hover,#f5f5f5)", color: "var(--text-secondary)" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">需化解的疑慮 / 抗拒點</label>
                <input className="form-input" value={form.marketing.objections} disabled={isGenerating}
                  onChange={e => setMkt("objections", e.target.value)} placeholder="例：我沒有繪畫天份／會不會很貴" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {MKT_PRESETS.objections.map(p => (
                    <button key={p} type="button" disabled={isGenerating}
                      onClick={() => {
                        const cur = form.marketing.objections.trim();
                        setMkt("objections", cur ? `${cur}、${p}` : p);
                      }}
                      style={{ padding: "1px 7px", borderRadius: "10px", border: "1px solid var(--card-border)", fontSize: "11px", cursor: "pointer", background: "var(--bg-hover,#f5f5f5)", color: "var(--text-secondary)" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="form-label">避免使用 / 禁用聲明（逗號分隔）</label>
            <input className="form-input" value={form.marketing.forbiddenClaims} disabled={isGenerating}
              onChange={e => setMkt("forbiddenClaims", e.target.value)} placeholder="例：治癒, 治療疾病, 保證療效" />
            <div className="form-hint" style={{ marginTop: 4 }}>此表單會編譯成行銷簡報，連同下方「進階指示」一起注入。留空的欄位不影響。</div>
          </SectionToggle>

          {/* ── 品牌語調（進階 raw，向後相容）── */}
          <SectionToggle label="品牌語調 / 進階指示（原始文字，選填）" open={showAdvanced} onToggle={() => setShowAdvanced(v => !v)}>
            <textarea className="form-textarea" style={{ minHeight: "90px" }}
              value={form.details} onChange={e => setF("details", e.target.value)} disabled={isGenerating}
              placeholder={`brand_name: "Soulful Expression"\nforbidden_claims: ["治癒", "治療疾病"]\naudience: 台灣成人，對表達藝術有興趣`} />
            <div className="form-hint" style={{ marginTop: 4 }}>自由文字會接在上方「精準行銷」表單之後一起注入。已用表單者此欄可留空。</div>
          </SectionToggle>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════════ C：分發設定 ═══════════════════════════════════════════ */}
          <div style={{ border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.08),rgba(34,197,94,0.02))", borderBottom: "1px solid rgba(34,197,94,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px" }}>📢</span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--green)" }}>分發設定</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: 4 }}>— 生成文章後才能使用</span>
            </div>
            <div style={{ padding: "0 16px" }}>

          {/* ── 社群分發 ── */}
          <SectionToggle label="📤 社群分發 — 自動生成各平台貼文" open={showSyn} onToggle={() => setShowSyn(v => !v)}>
            {!hasContent ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0", textAlign: "center" }}>⏳ 請先生成文章後才能使用</div>
            ) : (
              <>
                {/* Distribution media type — must be set BEFORE generating copy (affects copy style) */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
                    附加媒體（影響文案風格與發佈附件）
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["none", "image", "video"] as const).map(mt => {
                      const disabled = mt === "image" ? !imgResult : mt === "video" ? Object.keys(videoOutputUrls).length === 0 : false;
                      const label = mt === "none" ? "僅文字" : mt === "image" ? `圖片${imgResult ? ` (${imgResult.spec.label})` : " (未生成)"}` : `影片${Object.keys(videoOutputUrls).length > 0 ? " (依平台比例)" : " (未生成)"}`;
                      const active = distMediaType === mt && !disabled;
                      return (
                        <button key={mt} type="button"
                          onClick={() => !disabled && setDistMediaType(mt)}
                          disabled={disabled}
                          style={{
                            padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: disabled ? "not-allowed" : "pointer",
                            border: `1px solid ${active ? "var(--accent)" : "var(--card-border)"}`,
                            background: active ? "var(--accent)" : disabled ? "var(--bg-canvas)" : "rgba(255,255,255,0.6)",
                            color: active ? "#fff" : disabled ? "var(--text-muted)" : "var(--text-secondary)",
                            opacity: disabled ? 0.5 : 1,
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {distMediaType === "video" && Object.keys(videoOutputUrls).length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                      ▶ 16:9 → YouTube/文章/LinkedIn | 📱 9:16 → TikTok/Reels/IG/Threads | 📷 4:5 → FB/Pinterest
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start", marginBottom: "10px" }}>
                  {SYN_PLATFORMS.map(p => (
                    <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={checkLabel}>
                        <input type="checkbox" checked={!!synEnabled[p.key]}
                          onChange={e => setSynEnabled(prev => ({ ...prev, [p.key]: e.target.checked }))} />
                        {p.label}
                      </label>
                      {p.hasThread && synEnabled.twitter && (
                        <div style={{ paddingLeft: "18px", display: "flex", gap: "10px" }}>
                          {["single", "thread"].map(m => (
                            <label key={m} style={{ ...checkLabel, fontSize: "11px" }}>
                              <input type="radio" name="twitterMode" value={m}
                                checked={twitterMode === m} onChange={() => setTwitterMode(m as "single" | "thread")} />
                              {m === "single" ? "單則推文" : "Thread"}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <button title={why("content.syndicate")} className="btn-primary" style={{ fontSize: "12px", padding: "5px 14px" }}
                    onClick={handleSyndicate}
                    disabled={(synStatus === "generating" || !Object.values(synEnabled).some(Boolean)) || !canUse("content.syndicate")}>
                    {synStatus === "generating" ? "生成中…" : "生成社群貼文"}
                  </button>
                  {synStale && synStatus === "done" && (
                    <span style={{ fontSize: 11, color: "#f59e0b", alignSelf: "center" }}>
                      ⚠ 媒體類型已變更，建議重新生成
                    </span>
                  )}
                </div>
                {synStatus === "error" && (
                  <div style={{ fontSize: "12px", color: "var(--color-error)", marginTop: "6px" }}>社群貼文生成失敗，請重試</div>
                )}
                {synStatus === "done" && Object.keys(synContent).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {Object.entries(synContent).map(([key, content]) => {
                      const labelMap: Record<string, string> = {
                        twitter_single: "Twitter / X", twitter_thread: "Twitter Thread",
                        instagram: "Instagram", threads: "Threads",
                        linkedin: "LinkedIn", facebook: "Facebook",
                        tiktok: "TikTok", whatsapp: "WhatsApp",
                        pinterest: "Pinterest", reddit: "Reddit", email: "Email 電子報",
                      };
                      return (
                        <div key={key} style={{ border: "1px solid var(--card-border)", borderRadius: "6px", padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 600 }}>{labelMap[key] ?? key}</span>
                            <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 10px" }}
                              onClick={() => {
                                void navigator.clipboard.writeText(content);
                                setSynCopied(prev => ({ ...prev, [key]: true }));
                                setTimeout(() => setSynCopied(prev => ({ ...prev, [key]: false })), 2000);
                              }}>
                              {synCopied[key] ? "✓ 已複製" : "複製"}
                            </button>
                          </div>
                          <textarea readOnly value={content}
                            style={{ width: "100%", minHeight: "80px", fontFamily: "inherit", fontSize: "12px",
                              lineHeight: 1.5, padding: "8px", border: "1px solid var(--card-border)", borderRadius: "4px",
                              background: "var(--bg-page, #f8f9fc)", resize: "vertical", boxSizing: "border-box" }} />
                        </div>
                      );
                    })}

                    {/* Sending moved to the social manager (ADR 016; SOCIAL_MANAGER_PLAN C12): schedule, review and send there. */}
                    <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 14, marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>排程、審核、送出都在社群發文。上面的貼文可以複製過去。</span>
                      {/* the brand = this site's organization; never a link without it (the social manager would open another brand). New tab: the generated copy above lives only in this page's state */}
                      {!socialHref ? null : currentSite?.organization_id
                        ? <a href={`${socialHref}?brand=${encodeURIComponent(currentSite.organization_id)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 13 }}>到社群發文</a>
                        : <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{currentSite ? "這個網站還沒綁定客戶組織，無法直接開它的社群發文" : "先選客戶"}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionToggle>

          {/* ── 電子報草稿（FluentCRM，只建草稿不寄出；員工專用） ── */}
          {onDoor ? null : !hasContent ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0 16px", textAlign: "center" }}>📧 電子報草稿 — 生成文章後才能使用</div>
          ) : (
            <div style={{ marginTop: "16px", paddingBottom: "8px" }}>
              <div style={{
                background: "linear-gradient(135deg, rgba(88,85,208,0.06), rgba(88,85,208,0.02))",
                border: "1px solid rgba(88,85,208,0.25)", borderRadius: "12px", padding: "16px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "15px" }}>📧</span>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>電子報導讀（FluentCRM 草稿）</span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
                  寄出的是<strong>精簡導讀</strong>（首圖＋摘要＋「閱讀完整文章」按鈕），吸引讀者點進全文 — 不是整篇貼上。<br />
                  只建立草稿、<strong>不會寄出</strong>；收件人與寄送一律在 FluentCRM 人工確認。
                </div>
                <label className="form-label" style={{ marginBottom: "4px" }}>文章公開連結（CTA 按鈕用）</label>
                <input
                  className="form-input"
                  style={{ fontSize: "12px" }}
                  placeholder="https://soulfulexpression.org/your-article-slug（發布到 WordPress 並上線後貼上公開網址）"
                  value={nlArticleUrl}
                  onChange={e => setNlArticleUrl(e.target.value)}
                />
                <div className="form-hint" style={{ marginTop: "4px", marginBottom: "12px" }}>
                  留空也可推送，但導讀就<strong>沒有</strong>「閱讀完整文章」按鈕。建議先用上方「推送到 WordPress（草稿）」發布、文章上線後把公開網址貼這裡。
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <button className="btn-primary" style={{ fontSize: "12px", padding: "6px 16px" }}
                    onClick={handlePushNewsletter} disabled={nlStatus === "sending"}>
                    {nlStatus === "sending" ? "推送中…" : "📧 建立 FluentCRM 導讀草稿"}
                  </button>
                  {!nlArticleUrl.trim() && (
                    <span style={{ fontSize: "11px", color: "var(--yellow)" }}>未填文章連結 — 導讀將不含按鈕</span>
                  )}
                </div>
                {nlStatus === "done" && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-primary)" }}>
                    ✓ 已建立 FluentCRM 草稿
                    {nlResult?.edit_url && (
                      <> — <a href={nlResult.edit_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--btn-primary-bg)" }}>在 FluentCRM 開啟並寄送 ↗</a></>
                    )}
                  </div>
                )}
                {nlStatus === "error" && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--red)" }}>
                    {nlResult?.error ?? "推送失敗"}
                  </div>
                )}
              </div>
            </div>
          )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════════════════════ */}
          {/* ═════════════════════════════════════ D：發布 ════════════════════════════════════════ */}
          <div style={{ border: "1px solid rgba(249,115,22,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(249,115,22,0.08),rgba(249,115,22,0.02))", borderBottom: "1px solid rgba(249,115,22,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px" }}>🚀</span>
              <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--severity-high)" }}>發布</span>
            </div>
            <div style={{ padding: "0 16px" }}>

          {/* ── 發布設定 ── */}
          <div className="form-block form-block--wide" style={{ marginBottom: "20px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "12px", color: "var(--text-primary)" }}>發布設定</div>
            <div>
              <label className="form-label">發布日期</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <label style={checkLabel}>
                  <input type="radio" name="scheduleMode" checked={!form.scheduleDate} onChange={() => setF("scheduleDate", "")} disabled={isGenerating} />
                  立即存為草稿
                </label>
                <label style={checkLabel}>
                  <input type="radio" name="scheduleMode" checked={!!form.scheduleDate}
                    onChange={() => setF("scheduleDate", new Date(Date.now() + 86400000).toISOString().slice(0, 16))} disabled={isGenerating} />
                  排程
                </label>
                {form.scheduleDate && (
                  <input type="datetime-local" className="form-input" style={{ width: "auto", fontSize: "12px" }}
                    value={form.scheduleDate} onChange={e => setF("scheduleDate", e.target.value)} disabled={isGenerating} />
                )}
              </div>
              <div className="form-hint" style={{ marginTop: 4 }}>狀態保持「草稿」，需從 WP 後台手動發布。</div>
            </div>
          </div>
            </div>
          </div>

          {/* ── 產生按鈕 ── */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "28px", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={handleGenerate}
              disabled={isGenerating || !form.keyword.trim()} style={{ fontSize: "14px", padding: "10px 24px" }}>
              {isGenerating ? "產生中…" : "產生文章"}
            </button>
            {isGenerating && (
              <button className="btn-secondary" onClick={() => { abortRef.current?.abort(); setGenStatus("idle"); }}>停止</button>
            )}
            {genStatus === "error" && <span style={{ color: "var(--color-error)", fontSize: "13px" }}>{genError}</span>}
            <div style={{ marginLeft: "auto" }}>
              <CostChip cost={sessionCost} />
            </div>
          </div>
          {/* ═══ 輸出區 ═══ */}
          {(hasContent || isGenerating) && (
            <div className="form-block form-block--wide">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  產出文章
                  {isGenerating && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>串流中…</span>}
                  {genStatus === "done" && <span style={{ fontWeight: 400, color: "var(--green)", marginLeft: 8 }}>✓ 完成</span>}
                  {genStatus === "done" && draftSaveState === "saving" && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, fontSize: "12px" }}>💾 儲存中…</span>}
                  {genStatus === "done" && draftSaveState === "saved"  && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, fontSize: "12px" }}>💾 已存草稿</span>}
                  {genStatus === "done" && draftSaveState === "error"  && <span style={{ fontWeight: 400, color: "var(--yellow)", marginLeft: 8, fontSize: "12px" }}>⚠ 草稿未存（文章不受影響）</span>}
                  {genStatus === "done" && genTruncated && (
                    <span style={{ fontWeight: 500, color: "var(--yellow)", marginLeft: 8, fontSize: "12px" }}>
                      ⚠ 可能被截斷（超過長度上限）— 建議選短篇或拆主題重新生成
                    </span>
                  )}
                </div>
                <CostChip cost={sessionCost} />
              </div>

              {/* ── Preview / Edit toggle ── */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{ fontSize: "12px", padding: "3px 10px", borderRadius: 4, border: "1px solid var(--card-border)",
                    background: !showPreview ? "var(--btn-primary-bg)" : "transparent",
                    color: !showPreview ? "var(--btn-primary-text)" : "var(--text-muted)", cursor: "pointer" }}>
                  ✏️ 編輯 MD
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  style={{ fontSize: "12px", padding: "3px 10px", borderRadius: 4, border: "1px solid var(--card-border)",
                    background: showPreview ? "var(--btn-primary-bg)" : "transparent",
                    color: showPreview ? "var(--btn-primary-text)" : "var(--text-muted)", cursor: "pointer" }}>
                  👁 預覽排版
                </button>
              </div>

              {showPreview ? (
                <div
                  style={{ width: "100%", minHeight: "480px", padding: "20px 24px", border: "1px solid var(--card-border)",
                    borderRadius: "6px", background: "var(--card-bg)", color: "var(--text-primary)", boxSizing: "border-box",
                    fontFamily: "'Noto Sans TC',sans-serif", fontSize: "15px", lineHeight: 1.8, overflowY: "auto" }}
                  dangerouslySetInnerHTML={{ __html: markdownPreview(generated) }}
                />
              ) : (
                <textarea
                  style={{ width: "100%", minHeight: "480px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.6,
                    padding: "12px", border: "1px solid var(--card-border)", borderRadius: "6px",
                    background: "var(--bg-page)", color: "var(--text-primary)", resize: "vertical", boxSizing: "border-box" }}
                  value={generated} onChange={e => setGenerated(e.target.value)} spellCheck={false}
                  placeholder="文章將在此串流顯示…" />
              )}

              {metaData && (
                <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label className="form-label">SEO 標題 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（{metaData.seoTitle.length} 字元）</span></label>
                    <input className="form-input" value={metaData.seoTitle}
                      onChange={e => setMetaData(prev => prev ? { ...prev, seoTitle: e.target.value } : prev)} />
                  </div>
                  <div>
                    <label className="form-label">
                      Meta 描述{" "}
                      <span style={{ fontWeight: 400, color: metaData.metaDesc.length > 160 ? "var(--red)" : "var(--text-muted)" }}>
                        （{metaData.metaDesc.length} / 160 字元{metaData.metaDesc.length > 160 ? " ⚠ 超過上限" : ""}）
                      </span>
                    </label>
                    <input className="form-input" value={metaData.metaDesc}
                      onChange={e => setMetaData(prev => prev ? { ...prev, metaDesc: e.target.value } : prev)} />
                    {metaData.metaDesc.length > 160 && (
                      <div className="form-hint" style={{ color: "var(--red)", marginTop: 2 }}>
                        RankMath 上限 160 字元；超出部分在搜尋結果會被截斷。請縮短後再發布。
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="form-hint" style={{ marginTop: "6px" }}>
                可直接編輯後推送。<code>{"<!-- NEEDS_BRAND_VERIFY -->"}</code> = 填入真實品牌資料。
              </div>

              {/* ── 輸出動作列（移到文章下方：先讀後操作，UX 較順）── */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "12px",
                paddingTop: "12px", borderTop: "1px solid var(--card-border)" }}>
                {hasContent && (
                  <>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => void navigator.clipboard.writeText(generated)}>複製 MD</button>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => downloadMd(generated, `${slugify(form.keyword) || "article"}.md`)}>↓ .md</button>
                  </>
                )}
                {hasContent && pubStatus === "idle" && (
                  <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                    <button className="btn-secondary" style={{ fontSize: "12px" }}
                      onClick={() => handlePublish("draft")}>📝 草稿</button>
                    <button className="btn-primary" style={{ fontSize: "12px" }}
                      onClick={() => handlePublish("publish")}>🚀 直接發佈</button>
                    <button className="btn-secondary" style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: 4 }}
                      onClick={() => setPubMode(prev => prev === "future" ? "draft" : "future")}>
                      📅 排程{pubMode === "future" ? " ▴" : " ▾"}
                    </button>
                    {pubMode === "future" && (
                      <>
                        <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                          style={{ fontSize: "12px", padding: "3px 6px", border: "1px solid var(--card-border)", borderRadius: 4, background: "var(--bg-page)", color: "var(--text-primary)" }} />
                        <button className="btn-primary" style={{ fontSize: "12px" }}
                          disabled={!scheduleDate}
                          onClick={() => handlePublish("future")}>確認排程</button>
                      </>
                    )}
                  </div>
                )}
                {pubStatus === "publishing" && <button className="btn-primary" disabled style={{ fontSize: "13px" }}>推送中…</button>}
                {pubStatus === "done" && pubResult?.edit_url && (
                  <span style={{ fontSize: "13px", color: "var(--green)" }}>
                    ✓ {pubMode === "publish" ? "已發佈" : pubMode === "future" ? "已排程" : "草稿已建立"} —{" "}
                    <a href={pubResult.edit_url} target="_blank" rel="noreferrer" style={{ color: "var(--btn-primary-bg)" }}>WP 後台編輯 ↗</a>
                    {pubResult.view_url && pubMode === "publish" && (
                      <> · <a href={pubResult.view_url} target="_blank" rel="noreferrer" style={{ color: "var(--btn-primary-bg)" }}>查看文章 ↗</a></>
                    )}
                  </span>
                )}
                {pubStatus === "error" && <span style={{ fontSize: "12px", color: "var(--color-error)" }}>推送失敗：{pubError}</span>}
              </div>

              {/* ── 影片（自動觸發 — 文章推送後自動生成並嵌入）── */}
              {pubStatus === "done" && publishedPostId && (
                <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "6px",
                  background: "var(--ai-bg)", border: "1px solid var(--ai-bg)", fontSize: "13px" }}>
                  🎬 影片生成中（自動）：文章已推送，影片完成後自動嵌入文章
                  {videoStatus === "generating" && <span style={{ marginLeft: 10, color: "var(--severity-low)" }}>⏳ 影片生成中（預計 5-15 分鐘）…</span>}
                  {videoStatus === "embedding"  && <span style={{ marginLeft: 10, color: "var(--severity-low)" }}>⏳ 嵌入影片到 WP…</span>}
                  {videoStatus === "done"       && <span style={{ marginLeft: 10, color: "var(--green)" }}>✓ 影片已嵌入文章</span>}
                  {videoStatus === "error"      && (
                    <>
                      <span style={{ marginLeft: 10, color: "var(--color-error)" }}>影片失敗：{videoError}（文章不受影響）</span>
                      <button className="btn-secondary" style={{ fontSize: "11px", marginLeft: "8px" }}
                        onClick={() => { setVideoError(""); void handleGenerateVideo(publishedPostId); }}>重試</button>
                    </>
                  )}
                </div>
              )}

              {/* ── RankMath SEO 合規分數 ── */}
              <SeoCheckPanel
                report={seoReport}
                loading={seoChecking}
                articleMarkdown={generated}
                focusKeyword={form.keyword}
                seoTitle={metaData?.seoTitle ?? ""}
                metaDescription={metaData?.metaDesc ?? ""}
                slug={slugHint || slugify(form.keyword)}
                onFixApply={handleFixApply}
                onCost={(c) => addCostLine({ route: "content/seo-fix", model: c.model, vendor: c.vendor, usd: c.usd, kind: "text" })}
              />

              {/* ── 自動圖片生成進度 ── */}
              {autoImgN > 0 && (
                <div style={{
                  marginTop: "10px", padding: "8px 12px", borderRadius: "6px",
                  background: "var(--ai-bg)", border: "1px solid var(--ai-bg)",
                  fontSize: "12px", color: "var(--severity-low)",
                }}>
                  🎨 正在生成 {autoImgN} 張圖片…
                </div>
              )}

              {/* ── 精選圖片（hero）生成狀態 ── */}
              {(heroLoading || heroImageUrl) && (
                <div style={{
                  marginTop: "10px", padding: "8px 12px", borderRadius: "6px",
                  background: heroImageUrl ? "#f0fdf4" : "#f0f9ff",
                  border: `1px solid ${heroImageUrl ? "#bbf7d0" : "#bae6fd"}`,
                  fontSize: "12px", color: heroImageUrl ? "#16a34a" : "#0284c7",
                }}>
                  {heroLoading ? "🖼️ 正在生成精選圖片（featured image）…" : "🖼️ 精選圖片已就緒，發佈時自動設為文章首圖"}
                </div>
              )}

              {/* ── 圖片生成警告（ok:false / 連線失敗 / 參考圖被拒）── */}
              {imgGenWarn && (
                <div style={{
                  marginTop: "10px", padding: "8px 12px", borderRadius: "6px",
                  background: "#fffbeb", border: "1px solid #fde68a",
                  fontSize: "12px", color: "#b45309",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
                }}>
                  <span>⚠️ {imgGenWarn}</span>
                  <button type="button" onClick={() => setImgGenWarn("")}
                    style={{ background: "none", border: "none", color: "#b45309", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: 0 }}
                    aria-label="關閉警告">×</button>
                </div>
              )}

              {/* ── YouTube 影片嵌入（Phase 2：貼 URL 解析 placeholder）── */}
              {ytPlaceholders.length > 0 && (
                <div style={{
                  marginTop: "10px", padding: "12px 14px", borderRadius: "6px",
                  background: "#fef2f2", border: "1px solid #fecaca", fontSize: "12px", color: "#b91c1c",
                }}>
                  <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                    🎬 {ytPlaceholders.length} 個 YouTube 影片待嵌入
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>
                      貼上 YouTube 網址→自動轉真嵌入；留空發佈時自動移除
                    </span>
                  </div>
                  {ytPlaceholders.map(({ n, query }) => (
                    <div key={n} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ minWidth: "180px", color: "#6b7280" }}>#{n}：建議搜尋「{query}」</span>
                      <input
                        style={{ flex: 1, minWidth: "220px", fontSize: "12px", padding: "5px 8px",
                          border: "1px solid #fecaca", borderRadius: "4px", background: "#fff", color: "#111" }}
                        placeholder="https://www.youtube.com/watch?v=…"
                        value={ytUrlInputs[n] ?? ""}
                        onChange={e => setYtUrlInputs(prev => ({ ...prev, [n]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") resolveYouTube(n, ytUrlInputs[n] ?? ""); }} />
                      <button className="btn-secondary" style={{ fontSize: "12px", padding: "5px 12px" }}
                        disabled={!canonicalYouTube(ytUrlInputs[n] ?? "")}
                        onClick={() => resolveYouTube(n, ytUrlInputs[n] ?? "")}>嵌入</button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── 社群圖片生成 ── */}
              {genStatus === "done" && hasContent && (
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "14px" }}>
                  <button onClick={() => setShowImgGen(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", padding: 0 }}>
                    {showImgGen ? "▲" : "▼"} 社群圖片生成
                  </button>
                  {showImgGen && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <div>
                          <label className="form-label">目標平台 / 尺寸</label>
                          <select className="form-select" value={imgPlatform} onChange={e => setImgPlatform(e.target.value)}>
                            {PLATFORM_IMG_PRESETS.map(p => (
                              <option key={p.platform} value={p.platform}>{p.label} — {p.w}×{p.h}（{p.note}）</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <label className="form-label">圖片描述提示詞</label>
                      <textarea className="form-textarea" style={{ minHeight: "72px" }}
                        value={imgPrompt} onChange={e => setImgPrompt(e.target.value)}
                        placeholder={`例：${form.keyword}主題的概念插圖，溫暖色調，簡潔留白，適合社群媒體`} />
                      <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
                        <button className="btn-primary" style={{ fontSize: "12px", padding: "6px 16px" }}
                          onClick={handleGenerateImage} disabled={imgLoading || !imgPrompt.trim()}>
                          {imgLoading ? "生成中…" : "🎨 生成圖片"}
                        </button>
                        {imgError && <span style={{ color: "var(--color-error, #ef4444)", fontSize: "12px" }}>{imgError}</span>}
                      </div>
                      {/* Platform specs reference */}
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>各平台標準尺寸參考：</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {PLATFORM_IMG_PRESETS.map(p => (
                            <button key={p.platform} onClick={() => setImgPlatform(p.platform)}
                              style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", cursor: "pointer",
                                border: imgPlatform === p.platform ? "1px solid #5855d0" : "1px solid var(--card-border)",
                                background: imgPlatform === p.platform ? "#ede9fe" : "var(--bg-card)",
                                color: imgPlatform === p.platform ? "#5855d0" : "var(--text-muted)" }}>
                              {p.label} {p.w}×{p.h}
                            </button>
                          ))}
                        </div>
                      </div>
                      {imgResult && (
                        <div style={{ marginTop: "12px" }}>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>
                            {imgResult.spec.label} — {imgResult.spec.width}×{imgResult.spec.height}
                          </div>
                          <img src={imgResult.imageUrl} alt="Generated social media image"
                            style={{ maxWidth: "100%", borderRadius: "8px", border: "1px solid var(--card-border)" }} />
                          <a href={imgResult.imageUrl} download="social-image.webp" target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", marginTop: "8px", fontSize: "12px", color: "#5855d0" }}>
                            ↓ 下載圖片
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </>
      )}

      {/* ══════════════ 人性化頁籤 ══════════════ */}
      {activeTab === "humanize" && (
        <div>
          <div className="form-block" style={{ marginBottom: "16px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "14px", color: "var(--text-primary)" }}>人性化 / 改寫設定</div>
            <div style={{ display: "flex", gap: "0", marginBottom: "16px", border: "1px solid var(--card-border)", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
              {(["humanize", "rewrite"] as HumMode[]).map(m => (
                <button key={m} onClick={() => setHumMode(m)}
                  style={{ padding: "8px 20px", border: "none", cursor: "pointer", fontSize: "13px",
                    background: humMode === m ? "var(--btn-primary-bg, #5855d0)" : "transparent",
                    color: humMode === m ? "#fff" : "var(--text-primary)", fontWeight: humMode === m ? 600 : 400 }}>
                  {m === "humanize" ? "人性化文字" : "SEO 改寫"}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label className="form-label">語言</label>
                <select className="form-select" value={humLang} onChange={e => setHumLang(e.target.value)} disabled={isHumanizing}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">目標閱讀難度</label>
                <select className="form-select" value={humRead} onChange={e => setHumRead(e.target.value)} disabled={isHumanizing}>
                  {READABILITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI 用詞清理</label>
                <select className="form-select" value={humAiWords} onChange={e => setHumAiWords(e.target.value as RemoveAI)} disabled={isHumanizing}>
                  <option value="none">關閉</option>
                  <option value="basic">基本</option>
                  <option value="extended">加強</option>
                </select>
              </div>
            </div>
            <label className="form-label">輸入文字 *</label>
            <textarea className="form-textarea" style={{ minHeight: "240px" }}
              value={humInput} onChange={e => setHumInput(e.target.value)} disabled={isHumanizing}
              placeholder="貼上要處理的 AI 文章或任何文字…" />
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "12px" }}>
              <button title={why("content.humanize")} className="btn-primary" onClick={handleHumanize} disabled={(isHumanizing || !humInput.trim()) || !canUse("content.humanize")}>
                {isHumanizing ? "處理中…" : humMode === "humanize" ? "人性化文字" : "SEO 改寫"}
              </button>
              {isHumanizing && (
                <button className="btn-secondary" onClick={() => { humAbortRef.current?.abort(); setHumStatus("idle"); }}>停止</button>
              )}
              {humStatus === "error" && <span style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{humError}</span>}
            </div>
          </div>

          {(hasHumOutput || isHumanizing) && (
            <div className="form-block">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  輸出結果
                  {isHumanizing && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>串流中…</span>}
                  {humStatus === "done" && <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: 8 }}>✓ 完成</span>}
                </div>
                {hasHumOutput && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => void navigator.clipboard.writeText(humOutput)}>複製</button>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => downloadMd(humOutput, "humanized.md")}>↓ .md</button>
                    <button className="btn-secondary" style={{ fontSize: "12px" }}
                      onClick={() => { setHumInput(humOutput); setHumOutput(""); setHumStatus("idle"); }}>↺ 再處理</button>
                  </div>
                )}
              </div>
              <textarea
                style={{ width: "100%", minHeight: "400px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.6,
                  padding: "12px", border: "1px solid var(--card-border)", borderRadius: "6px",
                  background: "var(--bg-page, #f8f9fc)", color: "var(--text-primary)", resize: "vertical", boxSizing: "border-box" }}
                value={humOutput} onChange={e => setHumOutput(e.target.value)} spellCheck={false}
                placeholder="處理後文字將在此顯示…" />
            </div>
          )}
        </div>
      )}

      {/* ══════════════ 我的草稿頁籤 ══════════════ */}
      {activeTab === "drafts" && (
        <div>
          <div className="form-block" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                我的草稿
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, fontSize: "12px" }}>
                  （產文完成自動儲存；最多顯示 100 篇，新到舊）
                </span>
              </div>
              <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => void loadDrafts()} disabled={draftsLoading}>
                {draftsLoading ? "讀取中…" : "↻ 重新整理"}
              </button>
            </div>
            {draftsError && (
              <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--color-error, #ef4444)" }}>{draftsError}</div>
            )}
          </div>

          {!draftsLoading && drafts.length === 0 && !draftsError && (
            <div style={{ padding: "60px 40px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--card-border)", borderRadius: "8px" }}>
              還沒有草稿。到「產文」頁籤生成一篇文章，完成後會自動存到這裡。
            </div>
          )}

          {drafts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {drafts.map(d => (
                <div key={d.id} style={{ border: "1px solid var(--card-border)", borderRadius: "8px", padding: "12px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
                  background: d.id === draftId ? "var(--bg-hover, #f5f5f5)" : "var(--bg-card, #fff)" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "420px" }}>
                        {d.title || d.keyword}
                      </span>
                      {typeof d.seoScore === "number" && (
                        <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "20px", fontWeight: 600,
                          background: d.seoScore >= 81 ? "#dcfce7" : d.seoScore >= 51 ? "#fef9c3" : "#fee2e2",
                          color: d.seoScore >= 81 ? "#166534" : d.seoScore >= 51 ? "#713f12" : "#991b1b" }}>
                          SEO {d.seoScore}
                        </span>
                      )}
                      {d.status !== "draft" && (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {d.status === "published" ? "已發佈" : "已封存"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                      {d.keyword}
                      {d.language ? ` · ${d.language}` : ""}
                      {d.articleType ? ` · ${d.articleType}` : ""}
                      {` · ${new Date(d.updatedAt).toLocaleString()}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                    <button className="btn-primary" style={{ fontSize: "12px", padding: "5px 12px" }} onClick={() => void openDraft(d.id)}>
                      開啟
                    </button>
                    <button className="btn-secondary" style={{ fontSize: "12px", padding: "5px 10px", color: "var(--color-error, #ef4444)" }}
                      onClick={() => { if (window.confirm(`刪除草稿「${d.title || d.keyword}」？此動作無法復原。`)) void deleteDraft(d.id); }}>
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
