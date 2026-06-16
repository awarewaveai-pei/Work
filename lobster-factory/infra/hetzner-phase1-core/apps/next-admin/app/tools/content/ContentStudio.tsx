"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { WpSite } from "@/lib/content/wp-sites";
import type { BrandVoiceProfile } from "@/app/api/content/brand-voice/route";
import type { RankMathReport } from "@/lib/seo/rankmath-checker";
import { SeoCheckPanel } from "./SeoCheckPanel";
import { STYLE_CATALOG } from "@/app/tools/tarot/tarotStyles";

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

const AI_MODELS = [
  { value: "claude-sonnet-4-6",         label: "Sonnet 4.6（推薦）" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5（快速省 token）" },
  { value: "claude-opus-4-8",           label: "Opus 4.8（最高品質）" },
];

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

type Tab       = "generate" | "humanize" | "bulk" | "drafts";
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
  generateMeta: boolean;
  scheduleDate: string;
  wpCategories: string;
  wpTags: string;
}

interface MetaData { seoTitle: string; metaDesc: string; focusKeyword?: string; categories?: string[]; tags?: string[]; }

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

interface BulkRow {
  id: number;
  keyword: string;
  status: "idle" | "running" | "done" | "error";
  article: string;
  error: string;
  pubStatus: "idle" | "publishing" | "done" | "error";
  pubUrl: string;
  seoTitle?: string;
  metaDesc?: string;
  focusKeyword?: string;
  truncated?: boolean;
}

type BulkSettings = Omit<GenerateForm, "keyword" | "title" | "scheduleDate" | "nlpKeywords" | "outline" | "internalLinks" | "referenceUrls">;

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
  return {
    seoTitle: titleM[1].trim(),
    metaDesc: metaM[1].trim(),
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
};

const DEFAULT_MEDIA: MediaHub = {
  aiImages: "none", imageCount: 3, imageSize: "16:9",
  imageStyle: "", imageSeed: "", imageRefData: "",
  imageInstructions: "", brandName: "",
  includeKeywordAlt: true, autoAltText: false,
  youtubeSource: "none", youtubeCount: 1, youtubeLayout: "distribute",
  strictUnderHeadings: false,
};

const DEFAULT_FORM: GenerateForm = {
  keyword: "", title: "", language: "English", targetCountry: "全球（不指定）",
  articleType: "Pillar Article", articleSize: "medium", tone: "Friendly",
  pointOfView: "none", readability: "8th grade (recommended)",
  removeAiWords: "none", model: "claude-sonnet-4-6",
  details: "", nlpKeywords: "", outline: "", externalLinks: "",
  internalLinks: "", referenceUrls: "",
  structure: { ...DEFAULT_STRUCTURE },
  introHookBrief: "", introHookType: "",
  media: { ...DEFAULT_MEDIA },
  generateMeta: true, scheduleDate: "",
  wpCategories: "", wpTags: "",
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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ContentStudio() {

  const [activeTab, setActiveTab] = useState<Tab>("generate");

  // Multi-site
  const [wpSites,       setWpSites]       = useState<WpSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  // Brand Voice
  const [showBrandVoice,    setShowBrandVoice]    = useState(false);
  const [bvSampleText,      setBvSampleText]      = useState("");
  const [bvSampleUrl,       setBvSampleUrl]       = useState("");
  const [bvProfileName,     setBvProfileName]     = useState("我的品牌");
  const [bvNameTouched,     setBvNameTouched]     = useState(false); // stop auto-fill once operator edits the name
  const [bvLoading,         setBvLoading]         = useState(false);
  const [bvProfile,         setBvProfile]         = useState<BrandVoiceProfile | null>(null);
  const [bvError,           setBvError]           = useState("");
  const [bvApplied,         setBvApplied]         = useState(false);

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

  // Generate
  const [form, setForm]           = useState<GenerateForm>(DEFAULT_FORM);
  const [generated, setGenerated] = useState("");
  const [metaData,  setMetaData]  = useState<MetaData | null>(null);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError,  setGenError]  = useState("");
  const [genTruncated, setGenTruncated] = useState(false);

  // Publish
  const [pubStatus, setPubStatus] = useState<PubStatus>("idle");
  const [pubResult, setPubResult] = useState<{ edit_url?: string; view_url?: string } | null>(null);
  const [pubError,  setPubError]  = useState("");

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

  // Outline auto-generate
  const [outlineLoading, setOutlineLoading] = useState(false);

  // Section open state
  const [showNlp,      setShowNlp]      = useState(false);
  const [showOutline,  setShowOutline]  = useState(false);
  const [showExtLinks, setShowExtLinks] = useState(false);
  const [showIntLinks, setShowIntLinks] = useState(false);
  const [showConnWeb,  setShowConnWeb]  = useState(false);
  const [showStruct,   setShowStruct]   = useState(true);
  const [showMedia,    setShowMedia]    = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Syndication
  const [showSyn,     setShowSyn]     = useState(false);
  const [synEnabled,  setSynEnabled]  = useState<Record<string, boolean>>({});
  const [twitterMode, setTwitterMode] = useState<"single" | "thread">("single");
  const [synStatus,   setSynStatus]   = useState<SynStatus>("idle");
  const [synContent,  setSynContent]  = useState<Record<string, string>>({});
  const [synCopied,   setSynCopied]   = useState<Record<string, boolean>>({});

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

  // Bulk
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkRows,     setBulkRows]     = useState<BulkRow[]>([]);
  const [bulkRunning,  setBulkRunning]  = useState(false);
  const [bulkSettings, setBulkSettings] = useState<BulkSettings>({
    language: "English", targetCountry: "全球（不指定）", articleType: "Pillar Article",
    articleSize: "medium", tone: "Friendly", pointOfView: "none",
    readability: "8th grade (recommended)", removeAiWords: "none", model: "claude-sonnet-4-6",
    details: "", externalLinks: "",
    structure: { ...DEFAULT_STRUCTURE },
    introHookBrief: "", introHookType: "",
    media: { ...DEFAULT_MEDIA },
    generateMeta: false,
    wpCategories: "", wpTags: "",
  });

  // Abort refs
  const abortRef     = useRef<AbortController | null>(null);
  const humAbortRef  = useRef<AbortController | null>(null);
  const bulkAbortRef = useRef<AbortController | null>(null);
  const seoRunRef    = useRef(0);
  const imgRunRef    = useRef(0);

  // ─── Load WP sites ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/content/sites")
      .then(r => r.json())
      .then((data: { ok: boolean; sites?: WpSite[] }) => {
        if (data.ok && data.sites?.length) {
          setWpSites(data.sites);
          setSelectedSiteId(data.sites[0].id);
        }
      })
      .catch(() => {/* silent — single-site env works without this */});
  }, []);

  // Brand Voice name follows the selected target client (📍 目標客戶) — so the operator never
  // re-types "Soulful Expression". Stops the moment they edit the field manually (bvNameTouched).
  useEffect(() => {
    if (bvNameTouched) return;
    const site = wpSites.find(s => s.id === selectedSiteId) ?? wpSites[0];
    if (site?.name) setBvProfileName(site.name);
  }, [wpSites, selectedSiteId, bvNameTouched]);

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

  // ─── Suggest titles ────────────────────────────────────────────────────────

  async function handleSuggestTitles() {
    if (!form.keyword.trim() || titleLoading) return;
    setTitleLoading(true);
    try {
      const res  = await fetch("/api/content/title", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, language: form.language, articleType: form.articleType }),
      });
      const json = await res.json() as { ok: boolean; titles?: string[] };
      if (json.ok && json.titles?.length) { setTitleSugs(json.titles); setShowTitleDrop(true); }
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
      const json = await res.json() as { ok: boolean; keywords?: string[] };
      if (json.ok && json.keywords?.length) { setKwSugs(json.keywords); setShowKwDrop(true); }
    } catch { /* silent */ } finally { setKwLoading(false); }
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
      const json = await res.json() as { ok: boolean; outline?: string };
      if (json.ok && json.outline) { setF("outline", json.outline); if (!showOutline) setShowOutline(true); }
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
      const res  = await fetch(`/api/content/trending?type=suggest&q=${encodeURIComponent(kw)}&hl=${hl}`);
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
      const res  = await fetch(`/api/content/trending?type=questions&q=${encodeURIComponent(kw)}&hl=${hl}`);
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

  // ─── Image Generation ─────────────────────────────────────────────────────

  async function handleGenerateImage() {
    if (!imgPrompt.trim()) return;
    setImgLoading(true); setImgError(""); setImgResult(null);
    try {
      const res  = await fetch("/api/content/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imgPrompt, platform: imgPlatform }),
      });
      const json = await res.json() as { ok: boolean; imageUrl?: string; spec?: { label: string; width: number; height: number }; error?: string };
      if (!json.ok || !json.imageUrl) { setImgError(json.error ?? "圖片生成失敗"); }
      else { setImgResult({ imageUrl: json.imageUrl, spec: json.spec! }); }
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
    setGenStatus("streaming"); setGenError(""); setGenTruncated(false);
    setPubStatus("idle"); setPubResult(null);
    setSeoReport(null); setSeoChecking(false);
    setSlugHint(""); setAutoImgN(0);
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
      const referenceUrls = form.referenceUrls.split("\n").map(u => u.trim()).filter(u => /^https?:\/\//.test(u)).slice(0, 3);

      // Auto-fetch REAL related posts from the target site so the model weaves genuine internal
      // links instead of fabricating fake URLs. Best-effort — failure just falls back to user links.
      let autoInternal: string[] = [];
      try {
        const rp = await fetch("/api/content/related-posts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: form.keyword, siteId: selectedSiteId || undefined }),
        });
        const rpJson = await rp.json() as { ok: boolean; posts?: Array<{ link: string }> };
        if (rpJson.ok && rpJson.posts?.length) autoInternal = rpJson.posts.map(p => p.link);
      } catch { /* best-effort: no auto internal links */ }
      const internalLinks = [...new Set([...userInternal, ...autoInternal])].slice(0, 10);

      const res = await fetch("/api/content/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, externalLinks, internalLinks, referenceUrls }),
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
        setGenerated(text);
      }
      text += dec.decode();

      // Detect + strip BOTH server-side markers so neither leaks into the published article body
      // (the standard REST publish path passes pure comment lines through verbatim — critic Major).
      const truncated  = /<!--\s*GENERATION_TRUNCATED:/.test(text);
      const genErrored = /<!--\s*GENERATION_ERROR:/.test(text);
      setGenTruncated(truncated);
      const detrunc = text.replace(/\n*<!--\s*GENERATION_(?:TRUNCATED|ERROR):[^>]*-->/g, "");

      const meta    = extractMeta(detrunc);
      const hint    = extractSlugHint(detrunc);
      const cleanMd = stripSlugHint(meta ? stripMeta(detrunc) : detrunc);
      if (meta) setMetaData(meta);
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
      fetch("/api/content/seo-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: cleanMd,
          focusKeyword: form.keyword,
          seoTitle: meta?.seoTitle ?? "",
          metaDescription: meta?.metaDesc ?? "",
          slug: hint || slugify(form.keyword),
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
          formSnapshot: form,
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
      const res  = await fetch("/api/content/drafts");
      const json = await res.json() as { ok: boolean; drafts?: DraftListItem[]; error?: string };
      if (json.ok && json.drafts) setDrafts(json.drafts);
      else setDraftsError(json.error ?? "讀取失敗");
    } catch { setDraftsError("網路錯誤，請重試"); }
    finally { setDraftsLoading(false); }
  }, []);

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
      if (d.formSnapshot) setForm({ ...DEFAULT_FORM, ...d.formSnapshot });
      else setForm(prev => ({ ...prev, keyword: d.keyword }));
      setGenerated(d.markdown);
      setMetaData(d.meta ?? null);
      setSlugHint(d.slugHint ?? "");
      setDraftId(d.id);
      setDraftSaveState("saved");
      // Clear transient publish/SEO/image state from any previous article in the editor.
      setPubStatus("idle"); setPubResult(null);
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
    if (cap?.seed && /^\d+$/.test(seedStr)) out.seed = Number(seedStr);
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
          body: JSON.stringify({ prompt: altText, platform: "twitter_post", aspectRatio: form.media.imageSize, ...mediaImageParams() }),
        });
        if (genRun !== imgRunRef.current) break;
        const json = await res.json() as { ok: boolean; imageUrl?: string; error?: string };
        if (json.ok && json.imageUrl) {
          setGenerated(prev => prev.replace(`IMAGE_PLACEHOLDER_${n}`, json.imageUrl!));
        } else {
          // Route answers 200 + ok:false (missing key / timeout / bad reference) or 4xx with an error
          // body. Don't swallow it — remember the reason so the operator sees why a placeholder stayed.
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
        body: JSON.stringify({ prompt, platform: "facebook_link", aspectRatio: "16:9", ...mediaImageParams() }),
      });
      if (genRun !== imgRunRef.current) return; // user re-generated, abort
      const json = await res.json() as { ok: boolean; imageUrl?: string; error?: string };
      if (json.ok && json.imageUrl) setHeroImageUrl(json.imageUrl);
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
      body: JSON.stringify({ markdown: fixedMd, focusKeyword: form.keyword, seoTitle: title, metaDescription: metaDesc, slug: slugHint || slugify(form.keyword) }),
    })
      .then(r => r.ok ? r.json() as Promise<RankMathReport> : null)
      .then(j => { if (j && myRun === seoRunRef.current) setSeoReport(j); })
      .catch(() => { if (myRun === seoRunRef.current) setSeoReport(null); })
      .finally(() => { if (myRun === seoRunRef.current) setSeoChecking(false); });
  }

  // ─── Publish ─────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!generated.trim()) return;
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
          scheduleDate: form.scheduleDate || undefined,
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
      const json = await res.json() as { ok: boolean; error?: string; edit_url?: string; view_url?: string };
      if (!json.ok) { setPubStatus("error"); setPubError(json.error ?? "未知錯誤"); }
      else           { setPubStatus("done"); setPubResult({ edit_url: json.edit_url, view_url: json.view_url }); }
    } catch { setPubStatus("error"); setPubError("網路錯誤"); }
  }

  // ─── Syndicate ───────────────────────────────────────────────────────────

  async function handleSyndicate() {
    const platforms = Object.entries(synEnabled).filter(([, v]) => v).map(([k]) => k);
    if (platforms.length === 0 || !generated.trim()) return;
    setSynStatus("generating"); setSynContent({});
    try {
      const res  = await fetch("/api/content/syndicate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: generated, platforms, twitterMode, articleUrl: pubResult?.view_url }),
      });
      const json = await res.json() as { ok: boolean; posts?: Record<string, string> };
      if (json.ok && json.posts) { setSynContent(json.posts); setSynStatus("done"); }
      else                       { setSynStatus("error"); }
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
        setHumOutput(text);
      }
      text += dec.decode();
      setHumOutput(text);
      setHumStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") setHumStatus("idle");
      else { setHumStatus("error"); setHumError("處理失敗，請重試"); }
    }
  }

  // ─── Bulk generation ────────────────────────────────────────────────────

  async function handleBulkRun() {
    if (bulkRunning) { bulkAbortRef.current?.abort(); setBulkRunning(false); return; }
    const kws = bulkKeywords.split("\n").map(k => k.trim()).filter(Boolean).slice(0, 10);
    if (kws.length === 0) return;

    const rows: BulkRow[] = kws.map((kw, i) => ({ id: i, keyword: kw, status: "idle", article: "", error: "", pubStatus: "idle", pubUrl: "" }));
    setBulkRows(rows);
    setBulkRunning(true);
    const ac = new AbortController();
    bulkAbortRef.current = ac;

    for (let i = 0; i < rows.length; i++) {
      if (ac.signal.aborted) break;
      setBulkRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: "running" } : r));
      try {
        const res = await fetch("/api/content/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...bulkSettings, keyword: rows[i].keyword }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value, { stream: true });
          setBulkRows(prev => prev.map((r, idx) => idx === i ? { ...r, article: text } : r));
        }
        text += dec.decode();
        // Strip BOTH server markers before they reach the published post body (critic Major).
        const bulkTruncated = /<!--\s*GENERATION_TRUNCATED:/.test(text);
        const bulkClean = text.replace(/\n*<!--\s*GENERATION_(?:TRUNCATED|ERROR):[^>]*-->/g, "");
        const bulkMeta  = extractMeta(bulkClean);
        const finalText = stripSlugHint(stripMeta(bulkClean));
        setBulkRows(prev => prev.map((r, idx) => idx === i ? {
          ...r, status: "done", article: finalText, truncated: bulkTruncated,
          seoTitle:     bulkMeta?.seoTitle,
          metaDesc:     bulkMeta?.metaDesc,
          focusKeyword: bulkMeta?.focusKeyword || rows[i].keyword,
        } : r));
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
        setBulkRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: String(err) } : r));
      }
    }
    setBulkRunning(false);
  }

  async function handleBulkPublish(rowId: number) {
    const row = bulkRows.find(r => r.id === rowId);
    if (!row || !row.article.trim()) return;
    setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, pubStatus: "publishing" } : r));
    try {
      const cats = bulkSettings.wpCategories.split(",").map(s => s.trim()).filter(Boolean);
      const tags = bulkSettings.wpTags.split(",").map(s => s.trim()).filter(Boolean);
      const res  = await fetch("/api/content/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown:        row.article,
          slug:            slugify(row.keyword),
          siteId:          selectedSiteId || undefined,
          seoTitle:        row.seoTitle   || undefined,
          metaDescription: row.metaDesc   || undefined,
          focusKeyword:    row.focusKeyword || row.keyword,
          categories:      cats.length ? cats : undefined,
          tags:            tags.length ? tags : undefined,
        }),
      });
      const json = await res.json() as { ok: boolean; edit_url?: string };
      if (json.ok) setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, pubStatus: "done", pubUrl: json.edit_url ?? "" } : r));
      else         setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, pubStatus: "error" } : r));
    } catch {
      setBulkRows(prev => prev.map(r => r.id === rowId ? { ...r, pubStatus: "error" } : r));
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
    color: active ? "var(--btn-primary-bg, #5855d0)" : "var(--text-muted)",
    borderBottom: active ? "2px solid var(--btn-primary-bg, #5855d0)" : "2px solid transparent",
    marginBottom: "-1px",
  });
  const checkRow: React.CSSProperties   = { display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "6px" };
  const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", userSelect: "none" };

  const structLabels: Record<keyof ArticleStructure, string> = {
    quickAnswer: "快速解答", keyTakeaways: "Key Takeaways", comparisonTable: "比較表格",
    faq: "FAQ", conclusion: "Conclusion", tables: "Tables", h3: "H3",
    lists: "Lists", italics: "Italics", quotes: "Quotes", bold: "Bold",
  };

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
          <a href="/tools/content/calendar"
            style={{ fontSize: "12px", padding: "5px 12px", border: "1px solid var(--card-border)",
              borderRadius: "6px", color: "var(--text-muted)", textDecoration: "none",
              background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "5px" }}>
            📅 內容行事曆
          </a>
          <a href="/tools/content/sites"
            style={{ fontSize: "12px", padding: "5px 12px", border: "1px solid var(--card-border)",
              borderRadius: "6px", color: "var(--text-muted)", textDecoration: "none",
              background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "5px" }}>
            🔗 網站管理
          </a>
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
                {(["trending", "suggest", "questions", "sources"] as const).map(t => (
                  <button key={t} onClick={() => setTrendTab(t)}
                    style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--card-border)", cursor: "pointer",
                      background: trendTab === t ? "var(--btn-primary-bg, #5855d0)" : "var(--bg-card)",
                      color: trendTab === t ? "#fff" : "var(--text-muted)" }}>
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
                  const sc = item.source ? (srcColor[item.source] ?? { bg: "#e0e7ff", text: "#3730a3" }) : null;
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
                        <span style={{ padding: "3px 6px", fontSize: "10px", background: "#fef3c7", color: "#92400e", borderLeft: "1px solid var(--card-border)" }}>
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
                點擊「搜尋」載入今日熱搜（內建：Google News / Reddit / PTT / Perplexity，外加你在「⚙️ 管理來源」新增的自訂 RSS 來源）
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
                    <span style={{ color: "#5855d0", fontWeight: 600 }}>?</span>{q}
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
            {trendTab === "sources" && (
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "10px", lineHeight: 1.6 }}>
                  內建來源：📰 Google News · 👽 Reddit · 🗣️ PTT · 🔮 Perplexity（不可刪）。
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
                {sourcesError && <div style={{ fontSize: "12px", color: "var(--color-error, #ef4444)", marginBottom: "8px" }}>{sourcesError}</div>}

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
                        <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 9px", color: "var(--color-error, #ef4444)", flexShrink: 0 }}
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
        {(["generate", "humanize", "bulk", "drafts"] as Tab[]).map(t => (
          <button key={t} style={tabStyle(activeTab === t)} onClick={() => setActiveTab(t)}>
            {t === "generate" ? "產文" : t === "humanize" ? "人性化 / 改寫" : t === "bulk" ? "批量產文" : "📁 我的草稿"}
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
                <span style={{ fontSize: "12px", color: "#f59e0b" }}>
                  尚未連接任何網站 — 文章仍可生成，但無法推送。{" "}
                  <a href="/tools/content/sites" style={{ color: "var(--btn-primary-bg)" }}>前往連接 ↗</a>
                </span>
              )}
              {wpSites.length === 1 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: wpSites[0].color, display: "inline-block" }} />
                  <strong style={{ color: "var(--text-primary)" }}>{wpSites[0].name}</strong>
                  <a href={wpSites[0].url} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>{wpSites[0].url} ↗</a>
                </span>
              )}
              {wpSites.length > 1 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <select value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)}
                    className="form-select" style={{ fontSize: "13px", padding: "4px 10px" }}>
                    {wpSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {(() => {
                    const s = wpSites.find(x => x.id === selectedSiteId);
                    return s ? <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>{s.url} ↗</a> : null;
                  })()}
                </span>
              )}
              <a href="/tools/content/sites" style={{ marginLeft: "auto", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>管理客戶網站 →</a>
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
                    <button className="btn-secondary" onClick={handleSuggestTitles}
                      disabled={isGenerating || !form.keyword.trim() || titleLoading}
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
                  {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
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

          {/* ── 文章結構 ── */}
          <SectionToggle label="Structure" open={showStruct} onToggle={() => setShowStruct(v => !v)}>
            {/* Introductory Hook Brief */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label className="form-label" style={{ margin: 0 }}>Introductory Hook Brief</label>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{form.introHookBrief.length}/500</span>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                {HOOK_TYPES.map(ht => (
                  <button key={ht} type="button"
                    onClick={() => setF("introHookType", form.introHookType === ht ? "" : ht)}
                    disabled={isGenerating}
                    style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", cursor: "pointer",
                      border: "1px solid var(--card-border)",
                      background: form.introHookType === ht ? "var(--btn-primary-bg, #5855d0)" : "transparent",
                      color: form.introHookType === ht ? "#fff" : "var(--text-muted)" }}>
                    {ht}
                  </button>
                ))}
              </div>
              <textarea className="form-textarea" style={{ minHeight: "72px" }}
                value={form.introHookBrief} maxLength={500} disabled={isGenerating}
                onChange={e => setF("introHookBrief", e.target.value)}
                placeholder="Enter the type of hook for the article's opening sentence" />
            </div>

            {/* Yes/No dropdowns grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px 16px", marginBottom: "12px" }}>
              {(["conclusion", "tables", "h3", "lists", "italics", "quotes", "keyTakeaways", "faq", "bold"] as const).map(key => (
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

            <label style={checkLabel}>
              <input type="checkbox" checked={form.generateMeta} onChange={e => setF("generateMeta", e.target.checked)} disabled={isGenerating} />
              自動生成 SEO 標題 + Meta 描述
            </label>
          </SectionToggle>

          {/* ── Media Hub ── */}
          <SectionToggle label="Media Hub" open={showMedia} onToggle={() => setShowMedia(v => !v)}>
            <div style={{ background: "#fffef0", border: "1px solid #fde68a", borderRadius: "6px", padding: "14px" }}>
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
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setMedia("imageRefData", typeof reader.result === "string" ? reader.result : "");
                        reader.readAsDataURL(file);
                        e.target.value = ""; // allow re-selecting the same file after a remove
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
                  <input className="form-input" type="number" min={0} inputMode="numeric"
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
                    onChange={e => setMedia("brandName", e.target.value)}
                    placeholder="Enter your brand name" />
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
                    <span style={{ color: "var(--btn-primary-bg, #5855d0)" }}>Relevant keywords will be picked up and added to the rest of the images.</span>
                  </span>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }}
                    checked={form.media.autoAltText}
                    disabled={isGenerating || form.media.aiImages === "none"}
                    onChange={e => setMedia("autoAltText", e.target.checked)} />
                  <span style={{ lineHeight: 1.4, color: "var(--btn-primary-bg, #5855d0)" }}>
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
                    <option value="auto">Auto（AI 建議）</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Number of videos</label>
                  <select className="form-select" value={form.media.youtubeCount}
                    disabled={isGenerating || form.media.youtubeSource === "none"}
                    onChange={e => setMedia("youtubeCount", Number(e.target.value))}>
                    <option>1</option><option>2</option><option>3</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Layout Options</label>
                  <select className="form-select" value={form.media.youtubeLayout}
                    disabled={isGenerating || form.media.youtubeSource === "none"}
                    onChange={e => setMedia("youtubeLayout", e.target.value)}>
                    {LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Strict under headings */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" style={{ marginTop: "2px", flexShrink: 0 }}
                  checked={form.media.strictUnderHeadings}
                  disabled={isGenerating || (form.media.aiImages === "none" && form.media.youtubeSource === "none")}
                  onChange={e => setMedia("strictUnderHeadings", e.target.checked)} />
                <span style={{ lineHeight: 1.4 }}>
                  <span style={{ color: "var(--btn-primary-bg, #5855d0)" }}>All media elements will be placed strictly under the headings.</span>
                  {" "}<span style={{ color: "var(--text-muted)" }}>If disabled, the AI will decide and find the best placement.</span>
                </span>
              </label>
            </div>
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
                <button className="btn-secondary" style={{ fontSize: "12px", whiteSpace: "nowrap" }}
                  onClick={handleGenKeywords} disabled={isGenerating || !form.keyword.trim() || kwLoading}>
                  {kwLoading ? "…" : "✨ AI 自動生成關鍵字"}
                </button>
                {showKwDrop && kwSugs.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                    background: "var(--bg-card, #fff)", border: "1px solid var(--card-border)",
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
                            background: "var(--bg-page, #f8f9fc)", cursor: "pointer", fontSize: "12px", color: "var(--text-primary)" }}>
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

          {/* ── 大綱編輯器 ── */}
          <SectionToggle label="大綱編輯器（先看大綱、可改再生成全文）" open={showOutline} onToggle={() => setShowOutline(v => !v)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label className="form-label" style={{ marginTop: 0, marginBottom: 0 }}>
                自訂大綱
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— ## H2、### H3、#### H4；每個標題含關鍵字或近義變體，生成全文時嚴格遵循</span>
              </label>
              <button className="btn-secondary" style={{ fontSize: "12px" }}
                onClick={handleGenOutline} disabled={isGenerating || !form.keyword.trim() || outlineLoading}>
                {outlineLoading ? "…" : "✨ AI 自動生成大綱"}
              </button>
            </div>
            <textarea className="form-textarea" style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "12px" }}
              value={form.outline} onChange={e => setF("outline", e.target.value)} disabled={isGenerating}
              placeholder={"## 什麼是藝術療癒？\n## 藝術療癒的好處\n### 情緒層面\n### 認知層面\n## 如何開始\n## FAQ\n## 結語"} />
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

          {/* ── Connect to Web ── */}
          <SectionToggle label="參考 URL（Connect to Web）" open={showConnWeb} onToggle={() => setShowConnWeb(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              最多 3 個參考頁面 URL
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>— AI 讀取頁面內容作為事實參考</span>
            </label>
            <textarea className="form-textarea" style={{ minHeight: "80px" }}
              value={form.referenceUrls} onChange={e => setF("referenceUrls", e.target.value)} disabled={isGenerating}
              placeholder={"https://en.wikipedia.org/wiki/Art_therapy\nhttps://example.com/research-paper"} />
            <div className="form-hint">伺服器端抓取頁面文字注入提示詞（每個 URL 最多 3000 字元）。</div>
          </SectionToggle>

          {/* ── 品牌聲音 ── */}
          <SectionToggle label="品牌聲音（Brand Voice）— 分析範例文字，自動萃取寫作風格" open={showBrandVoice} onToggle={() => setShowBrandVoice(v => !v)}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              <div>
                <label className="form-label">品牌 / 客戶名稱</label>
                <input className="form-input" value={bvProfileName}
                  onChange={e => { setBvProfileName(e.target.value); setBvNameTouched(true); }}
                  placeholder="例：Soulful Expression" />
                {!bvNameTouched && wpSites.length > 0 && (
                  <div className="form-hint">已自動帶入目標客戶「{(wpSites.find(s => s.id === selectedSiteId) ?? wpSites[0])?.name}」，可直接覆寫。</div>
                )}
              </div>
              <div>
                <label className="form-label">從 URL 擷取（選填）</label>
                <input className="form-input" value={bvSampleUrl} onChange={e => setBvSampleUrl(e.target.value)}
                  placeholder="https://example.com/about" />
                {bvSampleUrl.trim() && !bvSampleText.trim() && (
                  <div className="form-hint" style={{ color: "#f97316" }}>伺服器端抓取頁面文字；若 URL 需登入或封鎖爬蟲則會靜默失敗，建議同時貼入範例文字。</div>
                )}
              </div>
            </div>
            <label className="form-label">範例文字（貼入品牌文章或 About 頁面，至少 50 字）</label>
            <textarea className="form-textarea" style={{ minHeight: "100px" }}
              value={bvSampleText} onChange={e => setBvSampleText(e.target.value)}
              placeholder="貼入品牌文章、廣告文案或 About 頁面文字…" />
            <div style={{ display: "flex", gap: "10px", marginTop: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-secondary" onClick={handleAnalyzeBrandVoice}
                disabled={bvLoading || (!bvSampleText.trim() && !bvSampleUrl.trim())}
                style={{ fontSize: "12px" }}>
                {bvLoading ? "分析中…" : "🔍 分析品牌聲音"}
              </button>
              {bvProfile && (
                <button className="btn-primary" onClick={handleApplyBrandVoice} style={{ fontSize: "12px" }}>
                  {bvApplied ? "✓ 已套用" : "✨ 注入文章提示詞"}
                </button>
              )}
              {bvError && <span style={{ color: "var(--color-error, #ef4444)", fontSize: "12px" }}>{bvError}</span>}
            </div>
            {bvProfile && (
              <div style={{ marginTop: "12px", padding: "12px", background: "var(--bg-hover, #f5f5f5)", borderRadius: "6px", fontSize: "12px" }}>
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
                      <span key={i} style={{ display: "inline-block", padding: "1px 6px", background: "#dcfce7", color: "#166534", borderRadius: "3px", marginRight: "4px", marginBottom: "2px", fontSize: "11px" }}>{w}</span>
                    ))}
                  </div>
                )}
                {bvProfile.avoidWords.length > 0 && (
                  <div style={{ marginTop: "4px" }}>
                    <span style={{ color: "var(--text-muted)" }}>避免用詞：</span>
                    {bvProfile.avoidWords.map((w, i) => (
                      <span key={i} style={{ display: "inline-block", padding: "1px 6px", background: "#fee2e2", color: "#991b1b", borderRadius: "3px", marginRight: "4px", marginBottom: "2px", fontSize: "11px" }}>{w}</span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: "8px", padding: "8px", background: "var(--bg-card)", borderRadius: "4px", borderLeft: "3px solid #5855d0", fontSize: "11px", lineHeight: 1.5 }}>
                  {bvProfile.promptInjection}
                </div>
              </div>
            )}
          </SectionToggle>

          {/* ── 品牌語調 ── */}
          <SectionToggle label="品牌語調 / 進階指示" open={showAdvanced} onToggle={() => setShowAdvanced(v => !v)}>
            <textarea className="form-textarea" style={{ minHeight: "90px" }}
              value={form.details} onChange={e => setF("details", e.target.value)} disabled={isGenerating}
              placeholder={`brand_name: "Soulful Expression"\nforbidden_claims: ["治癒", "治療疾病"]\naudience: 台灣成人，對表達藝術有興趣`} />
          </SectionToggle>

          {/* ── 發布設定 ── */}
          <div className="form-block form-block--wide" style={{ marginBottom: "20px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "12px", color: "var(--text-primary)" }}>發布設定</div>
            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
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
              <div style={{ flex: 1, minWidth: "160px" }}>
                <label className="form-label">分類（逗號分隔）</label>
                <input className="form-input" style={{ width: "100%" }}
                  value={form.wpCategories} onChange={e => setF("wpCategories", e.target.value)}
                  placeholder="芳療, DIY 保養, 精油教學" disabled={isGenerating} />
                <div className="form-hint" style={{ marginTop: 4 }}>不存在的分類會自動建立。</div>
              </div>
              <div style={{ flex: 1, minWidth: "160px" }}>
                <label className="form-label">標籤（逗號分隔）</label>
                <input className="form-input" style={{ width: "100%" }}
                  value={form.wpTags} onChange={e => setF("wpTags", e.target.value)}
                  placeholder="檸檬精油, 精油配方, 天然保養" disabled={isGenerating} />
                <div className="form-hint" style={{ marginTop: 4 }}>不存在的標籤會自動建立。</div>
              </div>
            </div>
          </div>

          {/* ── 產生按鈕 ── */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "28px" }}>
            <button className="btn-primary" onClick={handleGenerate}
              disabled={isGenerating || !form.keyword.trim()} style={{ fontSize: "14px", padding: "10px 24px" }}>
              {isGenerating ? "產生中…" : "產生文章"}
            </button>
            {isGenerating && (
              <button className="btn-secondary" onClick={() => { abortRef.current?.abort(); setGenStatus("idle"); }}>停止</button>
            )}
            {genStatus === "error" && <span style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{genError}</span>}
          </div>

          {/* ═══ 輸出區 ═══ */}
          {(hasContent || isGenerating) && (
            <div className="form-block form-block--wide">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  產出文章
                  {isGenerating && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>串流中…</span>}
                  {genStatus === "done" && <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: 8 }}>✓ 完成</span>}
                  {genStatus === "done" && draftSaveState === "saving" && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, fontSize: "12px" }}>💾 儲存中…</span>}
                  {genStatus === "done" && draftSaveState === "saved"  && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, fontSize: "12px" }}>💾 已存草稿</span>}
                  {genStatus === "done" && draftSaveState === "error"  && <span style={{ fontWeight: 400, color: "#f59e0b", marginLeft: 8, fontSize: "12px" }}>⚠ 草稿未存（文章不受影響）</span>}
                  {genStatus === "done" && genTruncated && (
                    <span style={{ fontWeight: 500, color: "#f59e0b", marginLeft: 8, fontSize: "12px" }}>
                      ⚠ 可能被截斷（超過長度上限）— 建議選短篇或拆主題重新生成
                    </span>
                  )}
                </div>
              </div>

              <textarea
                style={{ width: "100%", minHeight: "480px", fontFamily: "monospace", fontSize: "13px", lineHeight: 1.6,
                  padding: "12px", border: "1px solid var(--card-border)", borderRadius: "6px",
                  background: "var(--bg-page, #f8f9fc)", color: "var(--text-primary)", resize: "vertical", boxSizing: "border-box" }}
                value={generated} onChange={e => setGenerated(e.target.value)} spellCheck={false}
                placeholder="文章將在此串流顯示…" />

              {metaData && (
                <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label className="form-label">SEO 標題 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（{metaData.seoTitle.length} 字元）</span></label>
                    <input className="form-input" value={metaData.seoTitle}
                      onChange={e => setMetaData(prev => prev ? { ...prev, seoTitle: e.target.value } : prev)} />
                  </div>
                  <div>
                    <label className="form-label">Meta 描述 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（{metaData.metaDesc.length} 字元）</span></label>
                    <input className="form-input" value={metaData.metaDesc}
                      onChange={e => setMetaData(prev => prev ? { ...prev, metaDesc: e.target.value } : prev)} />
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
                  <button className="btn-primary" onClick={handlePublish} style={{ fontSize: "13px" }}>推送到 WordPress（草稿）</button>
                )}
                {pubStatus === "publishing" && <button className="btn-primary" disabled style={{ fontSize: "13px" }}>推送中…</button>}
                {pubStatus === "done" && pubResult?.edit_url && (
                  <span style={{ fontSize: "13px", color: "#22c55e" }}>
                    ✓ 草稿已建立 — <a href={pubResult.edit_url} target="_blank" rel="noreferrer" style={{ color: "var(--btn-primary-bg)" }}>WP 後台編輯 ↗</a>
                  </span>
                )}
                {pubStatus === "error" && <span style={{ fontSize: "12px", color: "var(--color-error, #ef4444)" }}>推送失敗：{pubError}</span>}
              </div>

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
              />

              {/* ── 自動圖片生成進度 ── */}
              {autoImgN > 0 && (
                <div style={{
                  marginTop: "10px", padding: "8px 12px", borderRadius: "6px",
                  background: "#f0f9ff", border: "1px solid #bae6fd",
                  fontSize: "12px", color: "#0284c7",
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

              {/* ── 社群分發 ── */}
              {genStatus === "done" && hasContent && (
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "14px" }}>
                  <button onClick={() => setShowSyn(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", padding: 0 }}>
                    {showSyn ? "▲" : "▼"} 社群分發 — 自動生成各平台貼文
                  </button>

                  {showSyn && (
                    <div style={{ marginTop: "12px" }}>
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
                        <button className="btn-primary" style={{ fontSize: "12px", padding: "5px 14px" }}
                          onClick={handleSyndicate}
                          disabled={synStatus === "generating" || !Object.values(synEnabled).some(Boolean)}>
                          {synStatus === "generating" ? "生成中…" : "生成社群貼文"}
                        </button>
                      </div>

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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── 電子報草稿（FluentCRM，只建草稿不寄出）── U-FluentCRM：精簡導讀 + 文章連結 + 精美卡片 ── */}
              {genStatus === "done" && hasContent && (
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "16px" }}>
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

                    {/* 文章公開連結 — CTA 按鈕指向這個網址 */}
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
                        <span style={{ fontSize: "11px", color: "#f59e0b" }}>未填文章連結 — 導讀將不含按鈕</span>
                      )}
                    </div>
                    {nlStatus === "done" && (
                      <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-primary)" }}>
                        ✓ 已建立 FluentCRM 草稿
                        {nlResult?.edit_url && (
                          <> — <a href={nlResult.edit_url} target="_blank" rel="noopener noreferrer" style={{ color: "#5855d0" }}>在 FluentCRM 開啟並寄送 ↗</a></>
                        )}
                      </div>
                    )}
                    {nlStatus === "error" && (
                      <div style={{ marginTop: "10px", fontSize: "12px", color: "#c0392b" }}>
                        ⚠ {nlResult?.error ?? "推送失敗"}
                      </div>
                    )}
                  </div>
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
              <button className="btn-primary" onClick={handleHumanize} disabled={isHumanizing || !humInput.trim()}>
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

      {/* ══════════════ 批量產文頁籤 ══════════════ */}
      {activeTab === "bulk" && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "20px" }}>

          {/* 左：設定面板 */}
          <div>
            <div className="form-block" style={{ marginBottom: "16px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px", color: "var(--text-primary)" }}>
                關鍵字列表
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>（每行一個，最多 10 篇）</span>
              </div>
              <textarea className="form-textarea" style={{ minHeight: "180px" }}
                value={bulkKeywords} onChange={e => setBulkKeywords(e.target.value)} disabled={bulkRunning}
                placeholder={"藝術療癒\n表達藝術工作坊\n正念繪畫\n創意自我探索\n藝術與心理健康"} />
            </div>

            <div className="form-block" style={{ marginBottom: "16px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px", color: "var(--text-primary)" }}>共用設定</div>
              {([
                ["語言",       "language",    LANGUAGES.map(v => ({ value: v, label: v }))],
                ["文章類型",   "articleType", ARTICLE_TYPES],
                ["文章長度",   "articleSize", SIZES],
                ["語氣風格",   "tone",        TONES],
                ["AI 模型",    "model",       AI_MODELS],
                ["AI 用詞清理","removeAiWords",[
                  { value: "none", label: "關閉" },
                  { value: "basic", label: "基本" },
                  { value: "extended", label: "加強" },
                ]],
              ] as [string, string, {value: string; label: string}[]][]).map(([label, key, opts]) => (
                <div key={key} style={{ marginBottom: "8px" }}>
                  <label className="form-label">{label}</label>
                  <select className="form-select"
                    value={(bulkSettings as unknown as Record<string, string>)[key]}
                    onChange={e => setBulkSettings(prev => ({ ...prev, [key]: e.target.value }))}
                    disabled={bulkRunning}>
                    {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ marginBottom: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox"
                    checked={bulkSettings.generateMeta}
                    onChange={e => setBulkSettings(prev => ({ ...prev, generateMeta: e.target.checked }))}
                    disabled={bulkRunning} />
                  產生 SEO Meta（標題 / 摘要 / 關鍵字）
                </label>
                <div className="form-hint">開啟後批量發布時自動帶入 SEO 欄位</div>
              </div>
            </div>

            <div className="form-block" style={{ marginBottom: "16px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px", color: "var(--text-primary)" }}>發布設定</div>
              <div style={{ marginBottom: "8px" }}>
                <label className="form-label">WP 分類（逗號分隔）</label>
                <input className="form-input"
                  value={bulkSettings.wpCategories}
                  onChange={e => setBulkSettings(prev => ({ ...prev, wpCategories: e.target.value }))}
                  disabled={bulkRunning}
                  placeholder="療癒, 工作坊, 心理健康" />
              </div>
              <div>
                <label className="form-label">WP 標籤（逗號分隔）</label>
                <input className="form-input"
                  value={bulkSettings.wpTags}
                  onChange={e => setBulkSettings(prev => ({ ...prev, wpTags: e.target.value }))}
                  disabled={bulkRunning}
                  placeholder="藝術療癒, 正念, 自我成長" />
              </div>
            </div>

            <button className="btn-primary" onClick={handleBulkRun}
              disabled={!bulkKeywords.trim() && !bulkRunning}
              style={{ width: "100%", padding: "10px", fontSize: "14px" }}>
              {bulkRunning ? "⏹ 停止批量" : "▶ 開始批量產文"}
            </button>
            <div className="form-hint" style={{ marginTop: "6px", textAlign: "center" }}>逐篇串流，瀏覽器保持開啟</div>
          </div>

          {/* 右：進度面板 */}
          <div>
            {bulkRows.length === 0 && (
              <div style={{ padding: "60px 40px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--card-border)", borderRadius: "8px" }}>
                輸入關鍵字後按「開始批量產文」
              </div>
            )}
            {bulkRows.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {bulkRows.map(row => (
                  <div key={row.id} style={{ border: "1px solid var(--card-border)", borderRadius: "8px", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", background: "var(--bg-card, #fff)",
                      borderBottom: row.article ? "1px solid var(--card-border)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          fontSize: "11px", padding: "2px 8px", borderRadius: "20px", fontWeight: 600,
                          background: row.status === "done" ? "#dcfce7" : row.status === "running" ? "#fef9c3" : row.status === "error" ? "#fee2e2" : "var(--bg-page, #f5f5f5)",
                          color: row.status === "done" ? "#166534" : row.status === "running" ? "#713f12" : row.status === "error" ? "#991b1b" : "var(--text-muted)",
                        }}>
                          {row.status === "idle" ? "待處理" : row.status === "running" ? "產文中…" : row.status === "done" ? "✓ 完成" : "✗ 失敗"}
                        </span>
                        <span style={{ fontWeight: 500, fontSize: "13px" }}>{row.keyword}</span>
                        {row.status === "done" && row.truncated && (
                          <span title="文章可能被截斷，建議改短篇或拆主題重生成" style={{ fontSize: "11px", color: "#f59e0b", fontWeight: 500 }}>⚠ 截斷</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {row.status === "done" && (
                          <>
                            <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 8px" }} onClick={() => void navigator.clipboard.writeText(row.article)}>複製</button>
                            <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 8px" }} onClick={() => downloadMd(row.article, `${slugify(row.keyword)}.md`)}>↓ .md</button>
                            {row.pubStatus === "idle" && (
                              <button className="btn-primary" style={{ fontSize: "11px", padding: "3px 8px" }} onClick={() => void handleBulkPublish(row.id)}>推送 WP</button>
                            )}
                            {row.pubStatus === "publishing" && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>推送中…</span>}
                            {row.pubStatus === "done" && row.pubUrl && (
                              <a href={row.pubUrl} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "#22c55e" }}>✓ 草稿 ↗</a>
                            )}
                            {row.pubStatus === "error" && <span style={{ fontSize: "11px", color: "var(--color-error, #ef4444)" }}>推送失敗</span>}
                          </>
                        )}
                      </div>
                    </div>
                    {row.article && (
                      <textarea readOnly value={row.article}
                        style={{ width: "100%", height: "180px", fontFamily: "monospace", fontSize: "11px",
                          lineHeight: 1.5, padding: "10px", border: "none",
                          background: "var(--bg-page, #f8f9fc)", resize: "vertical", boxSizing: "border-box", color: "var(--text-primary)" }} />
                    )}
                    {row.status === "error" && row.error && (
                      <div style={{ padding: "8px 14px", fontSize: "12px", color: "var(--color-error, #ef4444)", borderTop: "1px solid var(--card-border)" }}>
                        錯誤：{row.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
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
