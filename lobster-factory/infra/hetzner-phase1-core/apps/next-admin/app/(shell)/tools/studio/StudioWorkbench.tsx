"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "@/lib/studio/model-options";
import { resolveStylePrompt } from "@/app/(shell)/tools/tarot/cards";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";
import {
  SUBJECT_CATEGORIES,
  THEME_CATEGORIES,
  VIBE_CATEGORIES,
  type PresetCategory,
} from "@/lib/studio/prompt-presets";
import {
  CULTURE_REGIONS,
  ALL_TOPICS,
  TOPIC_GROUPS,
  type CultureItem,
  type MapTheme,
} from "@/lib/studio/culture-presets";
import { tabStyle, chipStyle, actionPill, ghostBtn } from "@/components/tools/panel-primitives";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";
import { CANVAS_STAFF_HREF, openInCanvas } from "@/components/tools/canvas-handoff";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import { useDoorHref, useOnDoor } from "@/app/DoorContext";
import { buildSemanticFilename, buildSemanticBase, type SemanticFileMeta } from "@/lib/studio/semantic-filename";
import type { MockupView } from "@/lib/studio/printful-mockup";
import {
  EDGE_MASK_STYLES,
  applyEdgeMask,
  buildMaskSvg,
  type EdgeMaskId,
} from "@/lib/studio/edge-mask";
import { AI_TEXT_MODEL_GROUPS, AI_TEXT_MODELS, type AiTextModel } from "@/lib/ai/text-model-options";
import { EVENT_ALL_COUNTRIES_FILTER, EVENT_COUNTRY_FILTER_GROUPS } from "@/lib/events/countries";
import { textModelCostLabel, textModelCostSummary } from "@/lib/ai/text-model-pricing";

// suffix describes the FLAT print-ready ARTWORK (not the physical product) so literal models
// (Nano Banana / Ideogram) don't render a t-shirt/mug. The aspect ratio still tailors the
// composition to each product. Keep "no product mockup" so output is the design, not a photo.
// Appended to every product suffix so the AI never invents extra subjects beyond what was listed.
const NO_EXTRA_CHARS = "no extra characters or subjects beyond the ones explicitly listed";
const FULL_BLEED_FRAME = "full-bleed edge-to-edge composition, artwork fills the entire image frame, extend the design to the left and right edges, no empty side margins, no border";
const PRINT_SAFE_FRAME = "single standalone print graphic, transparent-background friendly or clean removable white background, no rectangular poster background, no full-bleed scene, keep all important elements fully inside the design with safe margins";
const APPAREL_WIDE_PRINT_FRAME = "wide chest-print graphic, the artwork itself spans nearly the full printable width left to right, large horizontal composition, minimal empty side margins, transparent-background friendly or clean removable white background, no rectangular poster background, no full-bleed scene, do not crop important elements";

const PRODUCT_TYPES = [
  { value: "tshirt", label: "T-shirt", aspect: "4:5" as AspectRatio, suffix: `flat print-ready apparel artwork, ${APPAREL_WIDE_PRINT_FRAME}, clean edges, NOT a product photo, no garment, no mockup, ${NO_EXTRA_CHARS}` },
  { value: "hoodie", label: "Hoodie", aspect: "4:5" as AspectRatio, suffix: `flat print-ready apparel artwork, ${APPAREL_WIDE_PRINT_FRAME}, clean edges, NOT a product photo, no garment, no mockup, ${NO_EXTRA_CHARS}` },
  { value: "mug", label: "Mug", aspect: "3:2" as AspectRatio, suffix: `horizontal wrap-print artwork, fill the printable width left to right while keeping important elements inside safe margins, print-ready, NOT a product photo, no mug, no mockup, ${NO_EXTRA_CHARS}` },
  { value: "poster", label: "Poster / Wall Art", aspect: "2:3" as AspectRatio, suffix: `full-bleed poster illustration, ${FULL_BLEED_FRAME}, complete artwork filling the frame, no frame border, no mockup, ${NO_EXTRA_CHARS}` },
  { value: "sticker", label: "Sticker", aspect: "1:1" as AspectRatio, suffix: `die-cut sticker artwork with bold clean outline, ${PRINT_SAFE_FRAME}, flat design, NOT a product photo, no mockup, ${NO_EXTRA_CHARS}` },
  { value: "none", label: "（不限商品）", aspect: "1:1" as AspectRatio, suffix: `${FULL_BLEED_FRAME}, ${NO_EXTRA_CHARS}` },
];

const ASPECTS: AspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "16:9", "9:16"];

// 🎭 玩法 — "treatment / concept" modifiers (a separate axis from 風格 art-medium and 氛圍).
// Multi-select; each appends an English fragment to the prompt. Works in both normal and
// map mode (e.g. 擬人化 map = cute food characters scattered on the map). zh = chip label,
// en = prompt fragment, desc = hover tip.
const PLAY_MODIFIERS: { zh: string; emoji: string; en: string; desc: string }[] = [
  { zh: "擬人化", emoji: "🧸", en: "as cute cartoon mascot characters with happy faces, little arms and legs, chibi style", desc: "變成有臉有手腳的角色（貼紙最好賣）" },
  { zh: "可愛Q版", emoji: "🌸", en: "kawaii chibi style, soft pastel colors, adorable rounded shapes, healing cute aesthetic", desc: "柔和粉嫩、圓潤可愛、療癒系" },
  { zh: "搞笑趣味", emoji: "😆", en: "funny exaggerated comical cartoon, silly playful expressions, humorous", desc: "誇張好笑、俏皮" },
  { zh: "在地風情", emoji: "🏮", en: "set in an authentic local street scene with regional atmosphere, signage and surroundings", desc: "放進在地真實場景（夜市/招牌/氛圍）" },
  { zh: "美味誘人", emoji: "🍙", en: "deliciously appetizing styling, mouth-watering, glossy fresh look", desc: "食物拍得超誘人（適合美食）" },
  { zh: "童趣繪本", emoji: "📖", en: "children's storybook illustration style, warm friendly, picture-book look", desc: "溫暖繪本插畫風" },
  { zh: "手繪塗鴉", emoji: "🖍️", en: "hand-drawn doodle sketch style, playful crayon and marker lines", desc: "蠟筆/麥克筆手繪塗鴉" },
  { zh: "貼紙風", emoji: "🏷️", en: "die-cut sticker design with bold clean outline and subtle drop shadow", desc: "粗邊去背貼紙" },
  { zh: "繽紛波普", emoji: "🌈", en: "colorful pop-art style, bold flat color blocks, playful graphic", desc: "普普藝術、大膽撞色" },
  { zh: "復古懷舊", emoji: "📻", en: "retro vintage nostalgic style, muted aged colors, old-school poster look", desc: "復古海報、懷舊色調" },
  { zh: "夢幻奇幻", emoji: "✨", en: "dreamy whimsical fantasy style, soft glow, magical sparkles", desc: "夢幻奇幻、微光閃爍" },
  { zh: "節慶喜氣", emoji: "🎉", en: "festive celebratory mood, vibrant joyful colors, party atmosphere", desc: "節慶歡樂、喜氣繽紛" },
  { zh: "霓虹賽博", emoji: "🌃", en: "neon cyberpunk style, glowing lights, futuristic night vibe", desc: "霓虹賽博、未來夜景" },
  { zh: "高級質感", emoji: "💎", en: "premium elegant refined aesthetic, sophisticated tasteful composition", desc: "高級精緻、有質感" },
];

const TRENDING_CATEGORIES = [
  { value: "international-news", label: "國際" },
  { value: "politics", label: "政治" },
  { value: "finance-economy", label: "財經" },
  { value: "sports", label: "運動" },
  { value: "entertainment", label: "玩樂" },
  { value: "lifestyle-culture", label: "品味" },
  { value: "health-wellness", label: "健康" },
  { value: "gaming-tech", label: "遊戲3C" },
  { value: "artificial-intelligence", label: "AI" },
];

const TRANSFORM_MODEL: StudioModel = "flux-kontext-dev";
const DEFAULT_SEARCH_DATA_MODEL: AiTextModel = "gpt-5.4-nano";
const CULTURE_STORAGE_PREFIX = "studio_culture_v3";
const TRENDING_STORAGE_KEY = "studio_trending_v2";
const EVENT_CAT_FILTERS = [
  { value: "all", label: "全部" },
  { value: "sports", label: "運動" },
  { value: "national", label: "國家節慶" },
  { value: "cultural", label: "文化節慶" },
  { value: "commercial", label: "商業檔期" },
  { value: "family", label: "親情節日" },
  { value: "mega", label: "大型事件" },
  { value: "holiday", label: "假日" },
] as const;
const EVENT_WINDOWS = [
  { value: 30, label: "30天" },
  { value: 90, label: "90天" },
  { value: 180, label: "6個月" },
  { value: 365, label: "1年" },
] as const;
const EVENT_SORTS = [
  { value: "opportunity", label: "依機會" },
  { value: "date", label: "依時間" },
] as const;
const EVENT_FETCH_LIMIT = 500;

// Fixed seed so the edge-style preview thumbnails match what `applyEdge` actually composites.
const EDGE_APPLY_SEED = 7;

interface ModelResult {
  model: StudioModel;
  image: string | null;
  seed: number | null;
  error?: string;
  busy: boolean;
}

type RefMode = "none" | "ref" | "transform";

function cultureRuntimeKey(regionEn: string, lensKey: string): string {
  return `${regionEn}|${lensKey}`;
}

function cultureStorageKey(regionEn: string, lensKey: string): string {
  return `${CULTURE_STORAGE_PREFIX}_${encodeURIComponent(regionEn)}_${encodeURIComponent(lensKey)}`;
}

function coerceCultureItems(value: unknown): CultureItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((it): it is Record<string, unknown> => typeof it === "object" && it !== null)
    .map((it) => ({
      zh: typeof it.zh === "string" ? it.zh.trim() : "",
      en: typeof it.en === "string" ? it.en.trim() : "",
      desc: typeof it.desc === "string" ? it.desc.trim() : "",
    }))
    .filter((it) => it.zh && it.en)
    .slice(0, 12);
}

function readStoredCulture(regionEn: string, lensKey: string): CultureItem[] | null {
  try {
    const raw = localStorage.getItem(cultureStorageKey(regionEn, lensKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = coerceCultureItems(parsed.items);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

function storeCulture(regionEn: string, lensKey: string, items: CultureItem[]): void {
  try {
    localStorage.setItem(
      cultureStorageKey(regionEn, lensKey),
      JSON.stringify({ savedAt: new Date().toISOString(), items }),
    );
  } catch {
    // Ignore quota/private-mode failures; the in-memory result still renders.
  }
}

// 🗺️ Build a full illustrated-map prompt from country + the picked specific items.
// `items` are English phrases (real names like "Taipei 101", or the theme fallback).
// The country and every item are written into the prompt explicitly so the output
// is an actual themed map, not a generic scene.
function buildMapPrompt(opts: {
  regionEn: string;
  fusionEn?: string;
  theme: MapTheme;
  items: string[];
}): string {
  const { regionEn, fusionEn, theme, items } = opts;
  const place = fusionEn ? `${regionEn} and ${fusionEn}` : regionEn;
  const icons = items.slice(0, 12).filter(Boolean).join(", ");
  if (theme.kind === "transit") {
    return `A clean stylized ${place} ${theme.enLabel} diagram, colorful subway map design with several distinct colored lines and labeled stations${icons ? ` including ${icons}` : ""}, interchange dots, flat minimal vector infographic, plain light background, not a realistic photograph`;
  }
  if (theme.kind === "chart") {
    return `An illustrated reference chart poster of ${place} ${theme.enLabel}, neat grid of individual labeled icons${icons ? ` such as ${icons}` : ""}, flat vector illustration, bold clean outlines, plain background, infographic style, not a realistic photograph`;
  }
  // `regionEn` is a culture adjective ("Taiwanese") — use it attributively ("a Taiwanese
  // tourist map") so the title banner reads naturally rather than "map of Taiwanese".
  const fusionClause = fusionEn ? ` blended with ${fusionEn} culture` : "";
  return `A colorful flat-vector illustrated ${regionEn} tourist map${fusionClause}, top-down stylized map in the shape of the region, travel-poster infographic highlighting ${theme.enLabel},${icons ? ` with labeled cute illustrated icons of ${icons},` : ""} decorative compass rose, small clouds, trees and a welcome title banner, soft vibrant colors, thick clean outlines, cartographic illustration, not a realistic photograph`;
}

function coerceTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((topic): topic is string => typeof topic === "string")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function coerceTopicsByCategory(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const topicsByCategory: Record<string, string[]> = {};
  for (const cat of TRENDING_CATEGORIES) {
    const topics = coerceTopics(source[cat.value]);
    if (topics.length > 0) topicsByCategory[cat.value] = topics;
  }
  return topicsByCategory;
}

function readStoredTrending(): Record<string, string[]> | null {
  try {
    const raw = localStorage.getItem(TRENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { topics?: unknown };
    const topics = coerceTopicsByCategory(parsed.topics);
    return Object.keys(topics).length ? topics : null;
  } catch {
    return null;
  }
}

function storeTrending(topics: Record<string, string[]>): void {
  try {
    localStorage.setItem(
      TRENDING_STORAGE_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), topics }),
    );
  } catch {
    // Ignore quota/private-mode failures; the in-memory result still renders.
  }
}

function aspectPromptDirective(aspect: AspectRatio): string {
  const orientation = aspect === "1:1"
    ? "square"
    : ["3:2", "4:3", "16:9"].includes(aspect)
      ? "landscape"
      : "portrait";
  return `Output canvas must use selected aspect ratio ${aspect} (${orientation}); compose the artwork to fit that exact frame.`;
}

function promptWithAspect(prompt: string, aspect: AspectRatio): string {
  const value = prompt.trim();
  if (!value) return value;
  return `${value}. ${aspectPromptDirective(aspect)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

async function downscaleImageFile(file: File, maxDim = 1024, quality = 0.85): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = dataUrl;
  });
}

function AccordionSection({
  title, summary, children, defaultOpen = false, icon,
}: {
  title: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean; icon?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        className="btn-secondary"
        style={{ width: "100%", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {icon && <span>{icon}</span>}
          <span>{title}</span>
          {summary && !open && (
            <span style={{ fontSize: 11, opacity: 0.45, marginLeft: 4, fontWeight: 400 }}>{summary}</span>
          )}
        </span>
        <span style={{ opacity: 0.4, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 4, padding: 10, background: "var(--chip-surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

type TipState = { text: string; x: number; y: number } | null;

// Tarot-style categorized chip picker (圖二 layout): a row of sub-category tabs +
// a chip grid, each chip carrying a hover tooltip (中文描述). The chip's `en` is what
// lands in the field so the assembled prompt stays English; the zh label is display-only.
// Single-select: clicking the active chip clears the field.
function CategoryPicker({
  categories, value, onPick, onTip,
}: {
  categories: PresetCategory[];
  value: string;
  onPick: (v: string) => void;
  onTip: (tip: TipState) => void;
}) {
  const [tab, setTab] = useState(categories[0]?.group ?? "");
  const items = categories.find((c) => c.group === tab)?.items ?? [];
  const current = value.trim();
  return (
    <div>
      {/* Row 1: sub-category tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {categories.map((c) => {
          const active = tab === c.group;
          return (
            <button
              key={c.group}
              type="button"
              onClick={() => { setTab(c.group); onTip(null); }}
              style={tabStyle(active)}
            >
              {c.group}
            </button>
          );
        })}
      </div>
      {/* Row 2: chips for selected sub-category — hover handlers on the SPAN so the
          tooltip survives even if the button is ever disabled (mirrors tarot). */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {items.map((it) => {
          const active = current === it.en;
          return (
            <span
              key={it.zh}
              style={{ display: "inline-block" }}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onTip({ text: it.desc, x: r.left + r.width / 2, y: r.top });
              }}
              onMouseLeave={() => onTip(null)}
            >
              <button
                type="button"
                onClick={() => onPick(active ? "" : it.en)}
                style={chipStyle(active)}
              >
                {active ? "✓ " : ""}{it.zh}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function StudioWorkbench() {
  // Culture/trending AI is back-office (ops.cheap-json): an account refused it (a customer on the studio door) keeps the
  // free curated culture lists and never sees a button that would only answer 403.
  const liveAi = usePaidFeatures().canUse("ops.cheap-json");
  // My Designs and the canvas editor are the design product's staff pages; on the studio door they would 404.
  const onDoor = useOnDoor();
  const canvasHref = useDoorHref(CANVAS_STAFF_HREF);
  const [selectedModels, setSelectedModels] = useState<Set<StudioModel>>(new Set<StudioModel>(["flux-schnell"]));
  const [productType, setProductType] = useState("tshirt");
  const [theme, setTheme] = useState("");
  const [vibe, setVibe] = useState("");
  const [subject, setSubject] = useState("");
  const [style, setStyle] = useState("");

  // 🌍 世界文化 — region (single-select) + lens tab + picked culture chips (multi)
  const [region, setRegion] = useState<CultureItem | null>(null);
  const [regionTab, setRegionTab] = useState(CULTURE_REGIONS[0]?.group ?? "");
  const [topic, setTopic] = useState(ALL_TOPICS[0]?.key ?? ""); // 統一主題（兩模式共用同一份；做地圖/做圖案只決定輸出）
  const [cultureChips, setCultureChips] = useState<string[]>([]); // en tokens in prompt
  const [cultureDyn, setCultureDyn] = useState<Record<string, CultureItem[]>>({}); // `${regionEn}|${topicKey}` → items
  const [cultureFetching, setCultureFetching] = useState<Record<string, boolean>>({}); // per-key in-flight flag
  const [fusionRegion, setFusionRegion] = useState<CultureItem | null>(null); // 🎲 混搭骰 second culture
  const [mapMode, setMapMode] = useState(false); // 🗺️ 做地圖（true）vs 🎨 做圖案（false）— 只決定輸出格式
  const [fusionPickMode, setFusionPickMode] = useState(false); // ✋ 手選混搭 — next country click sets fusionRegion
  const [zoomImage, setZoomImage] = useState<string | null>(null); // 🔍 click-to-enlarge lightbox
  const [playMods, setPlayMods] = useState<string[]>([]); // 🎭 玩法 — selected treatment fragments (multi)
  const [showAdvanced, setShowAdvanced] = useState(false); // ▸ 進階：文化混搭 (collapsed by default to declutter)

  // 🔥 時事靈感 — active category tab (圖一 layout: tabs + items below)
  const [trendingTab, setTrendingTab] = useState(TRENDING_CATEGORIES[0]?.value ?? "");

  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [refImages, setRefImages] = useState<string[]>([]);
  const [refMode, setRefMode] = useState<RefMode>("none");

  // Multi-model results: one slot per selected model, updated incrementally
  const [results, setResults] = useState<ModelResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const genIdRef = useRef(0);

  // Per-result post-processing state (keyed by model value)
  const [saveStates, setSaveStates] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [bgStates, setBgStates] = useState<Record<string, "idle" | "removing" | "done" | "error">>({});
  const [originalImages, setOriginalImages] = useState<Record<string, string>>({});
  const [mockupState, setMockupState] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [mockups, setMockups] = useState<MockupView[]>([]);
  const [savedMockups, setSavedMockups] = useState<Record<string, "saving" | "saved" | "error">>({});

  // ✨ Edge-mask (organic edge → transparent PNG) per-result post-processing state
  const [edgeStates, setEdgeStates] = useState<Record<string, "idle" | "applying" | "done" | "error">>({});
  const [edgeOriginals, setEdgeOriginals] = useState<Record<string, string>>({});
  const [edgeApplied, setEdgeApplied] = useState<Record<string, EdgeMaskId | undefined>>({});
  const [edgeAmount, setEdgeAmount] = useState(55);

  // Style / Model group filter state
  const STYLE_GROUPS = Array.from(new Set(STYLE_CATALOG.map((item) => item.group)));
  const MODEL_GROUPS = Array.from(new Set(STUDIO_MODEL_OPTIONS.map((item) => item.group)));
  const [styleGroup, setStyleGroup] = useState(STYLE_GROUPS[0] ?? "");
  const [modelGroup, setModelGroup] = useState(MODEL_GROUPS[0] ?? "");
  const [searchDataModel, setSearchDataModel] = useState<AiTextModel>(DEFAULT_SEARCH_DATA_MODEL);
  const [searchDataModelGroup, setSearchDataModelGroup] = useState(
    AI_TEXT_MODEL_GROUPS.find((group) => group === "OpenAI") ?? AI_TEXT_MODEL_GROUPS[0],
  );

  // Shared hover-tooltip for all categorized chips (主圖/題材/氛圍/風格). Captured at
  // viewport coords on hover, rendered position:fixed at the component root so it escapes
  // the sticky control panel's overflow clipping (same pattern as TarotStudio).
  const [tip, setTip] = useState<TipState>(null);

  // Trending news state — all categories fetched in parallel, cached per day
  const [allTopics, setAllTopics] = useState<Record<string, string[]>>({});
  const [trendingFetching, setTrendingFetching] = useState(false);

  // 🗓️ 活動行事曆 — upcoming events from Supabase events table
  interface UpcomingEvent {
    id: string;
    title: string;
    title_zh: string | null;
    event_date: string;
    event_end_date: string | null;
    category: string;
    subcategory: string | null;
    emoji: string | null;
    marketing_window_start: string;
    marketing_lead_days: number;
    country_codes: string[] | null;
    region: string | null;
    facets?: string[];
    opportunity_score?: number;
  }
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [eventsFetching, setEventsFetching] = useState(false);
  const [eventCatFilter, setEventCatFilter] = useState<string>("all");
  const [eventCountryFilter, setEventCountryFilter] = useState<string>("all");
  const [eventWindowDays, setEventWindowDays] = useState<number>(365);
  const [eventSort, setEventSort] = useState<"opportunity" | "date">("opportunity");
  const [eventBrowserOpen, setEventBrowserOpen] = useState(false);
  const eventCountryLabel = useCallback((event: UpcomingEvent) => {
    const countries = [...new Set(event.country_codes ?? [])].filter(Boolean).sort();
    if (countries.length === 0) return "";
    const shown = countries.slice(0, 3).join(", ");
    return countries.length > 3 ? `${shown} +${countries.length - 3}` : shown;
  }, []);
  const eventMatchesCurrentFilter = useCallback((event: UpcomingEvent) => {
    if (eventCatFilter === "all") return true;
    return (event.facets ?? [event.category]).includes(eventCatFilter);
  }, [eventCatFilter]);

  const bgInFlight = useRef<Record<string, boolean>>({});
  const mockupInFlight = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const edgeInFlight = useRef<Record<string, boolean>>({});
  const edgePending = useRef<Record<string, { styleId: EdgeMaskId; amount: number } | null>>({});

  const product = PRODUCT_TYPES.find((p) => p.value === productType) ?? PRODUCT_TYPES[0];

  // Primary model = first in the set (used for maxRefs, fileMeta, edit panel)
  const primaryModel = useMemo<StudioModel>(() => Array.from(selectedModels)[0] ?? "flux-schnell", [selectedModels]);
  const primaryModelOption = useMemo(() => STUDIO_MODEL_OPTIONS.find((m) => m.value === primaryModel), [primaryModel]);

  // maxRefs = max across all selected models (upload limit; each model gets its own slice at generate time)
  const maxRefs = useMemo(
    () => selectedModels.size === 0 ? 0 : Math.max(...Array.from(selectedModels).map((m) => STUDIO_MODEL_OPTIONS.find((o) => o.value === m)?.maxRefs ?? 0)),
    [selectedModels],
  );

  const resolvedStylePrompt = useMemo(() => (style ? resolveStylePrompt(style) : ""), [style]);

  // Pre-rendered edge-style thumbnails (white shape on transparent) — fixed preview params.
  const edgePreviews = useMemo(
    () =>
      EDGE_MASK_STYLES.map((s) => ({
        id: s.id,
        zh: s.label,
        en: s.labelEn,
        svg: s.maskUrl ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMaskSvg(s.id, 48, 48, { amount: 62, seed: EDGE_APPLY_SEED }))}`,
      })),
    [],
  );

  const fileMeta = useMemo<SemanticFileMeta>(() => {
    const p = PRODUCT_TYPES.find((x) => x.value === productType);
    return {
      product: p && p.value !== "none" ? p.label : undefined,
      subject: subject.trim() || theme.trim() || undefined,
      style: style || undefined,
    };
  }, [productType, subject, theme, style]);

  const assembledPrompt = useMemo(() => {
    // 🎭 玩法 — treatment fragments appended to every mode (multi-select).
    const playClause = playMods.join(", ");
    // 🗺️ 地圖模式 — assemble a whole illustrated-map prompt from country + picked items.
    // Items priority: explicitly picked chips → AI-fetched set for this theme → theme fallback.
    if (mapMode && region) {
      const mt = ALL_TOPICS.find((t) => t.key === topic) ?? ALL_TOPICS[0]!;
      const dyn = cultureDyn[`${region.en}|${topic}`] ?? [];
      const items = cultureChips.length
        ? cultureChips
        : dyn.length
          ? dyn.map((d) => d.en)
          : mt.fallback.map((d) => d.en);
      const base = buildMapPrompt({ regionEn: region.en, fusionEn: fusionRegion?.en, theme: mt, items });
      const extras = [product.suffix, playClause, resolvedStylePrompt, vibe.trim()].filter(Boolean).join(", ");
      return extras ? `${base}, ${extras}` : base;
    }
    // 🌍 culture tokens: region adjective (+ 🎲 fusion culture) + any picked culture chips
    const cultureTokens = [
      region ? `${region.en} cultural heritage` : "",
      fusionRegion ? `fused with ${fusionRegion.en} heritage` : "",
      ...cultureChips,
    ].filter(Boolean);
    if (refMode === "transform" && refImages.length > 0) {
      const parts = [
        "Transform this image.",
        resolvedStylePrompt ? `Apply style: ${resolvedStylePrompt}.` : "",
        cultureTokens.length ? `Cultural influence: ${cultureTokens.join(", ")}.` : "",
        playClause ? `Style treatment: ${playClause}.` : "",
        vibe.trim() ? `Mood: ${vibe.trim()}.` : "",
        subject.trim() ? `Keep subject: ${subject.trim()}.` : "",
        product.suffix,
      ].filter(Boolean);
      return parts.join(" ");
    }
    const parts = [subject.trim(), ...cultureTokens, playClause, theme.trim(), vibe.trim(), resolvedStylePrompt, product.suffix].filter(Boolean);
    return parts.join(", ");
  }, [subject, theme, vibe, resolvedStylePrompt, product, refMode, refImages.length, region, fusionRegion, cultureChips, mapMode, topic, cultureDyn, playMods]);

  const effectivePrompt = promptTouched ? prompt : assembledPrompt;

  const activeResult = results[activeIdx] ?? null;
  const selectedSearchDataModel = AI_TEXT_MODELS.find((model) => model.value === searchDataModel) ?? AI_TEXT_MODELS[0];

  const onPickProduct = useCallback((value: string) => {
    setProductType(value);
    const p = PRODUCT_TYPES.find((x) => x.value === value);
    if (p) setAspect(p.aspect);
  }, []);

  const onModelsChange = useCallback((next: Set<StudioModel>) => {
    setSelectedModels(next);
    const anySupportsRefs = Array.from(next).some(
      (m) => (STUDIO_MODEL_OPTIONS.find((o) => o.value === m)?.maxRefs ?? 0) > 0,
    );
    if (!anySupportsRefs) setRefImages([]);
  }, []);

  const onSetRefMode = useCallback((mode: RefMode) => {
    setRefMode(mode);
    if (mode === "transform") {
      const anySupports = Array.from(selectedModels).some(
        (m) => (STUDIO_MODEL_OPTIONS.find((o) => o.value === m)?.maxRefs ?? 0) > 0,
      );
      if (!anySupports) {
        setSelectedModels(new Set<StudioModel>([TRANSFORM_MODEL]));
        setRefImages([]);
      }
    }
  }, [selectedModels]);

  const toggleCultureChip = useCallback((en: string) => {
    setCultureChips((prev) => (prev.includes(en) ? prev.filter((x) => x !== en) : [...prev, en]));
  }, []);

  const togglePlayMod = useCallback((en: string) => {
    setPlayMods((prev) => (prev.includes(en) ? prev.filter((x) => x !== en) : [...prev, en]));
  }, []);

  // 🗺️ 整體地圖 — picking a broad category (小吃/甜點…) builds a whole map "packed with a wide
  // variety of that category". Enters map mode + toggles a variety token in cultureChips.
  const onPickCategory = useCallback((catEn: string) => {
    const token = `many different kinds of ${catEn}`;
    // Only reset aspect/prompt on the OFF→ON transition (don't clobber a manual edit on every click).
    if (!mapMode) { setMapMode(true); setAspect("2:3"); setPromptTouched(false); setPrompt(""); }
    setCultureChips((prev) => (prev.includes(token) ? prev.filter((x) => x !== token) : [...prev, token]));
  }, [mapMode]);

  // Fetch 12 specific authentic items for the current region×lens.
  // Default path returns pre-baked curated items (free + instant); only the long tail hits
  // the LLM. opts.curatedOnly (auto-load) never spends; opts.force re-rolls via the AI.
  const fetchCulture = useCallback(async (regionEn: string, lensKey: string, opts?: { curatedOnly?: boolean; force?: boolean }) => {
    const key = cultureRuntimeKey(regionEn, lensKey);
    // Silent for auto-load (curated is instant); show the spinner only for explicit fetches.
    if (!opts?.curatedOnly) setCultureFetching((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch("/api/tools/studio/culture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: regionEn, lens: lensKey, model: searchDataModel, curatedOnly: opts?.curatedOnly, force: opts?.force }),
      });
      const json = (await res.json()) as { ok: boolean; items?: CultureItem[] };
      const items = coerceCultureItems(json.items);
      if (json.ok && items.length) {
        setCultureDyn((prev) => ({ ...prev, [key]: items }));
        // Don't persist AI-forced results — only curated data should survive a page reload.
        if (!opts?.force) storeCulture(regionEn, lensKey, items);
      }
    } catch { /* keep fallback chips */ }
    if (!opts?.curatedOnly) setCultureFetching((p) => { const n = { ...p }; delete n[key]; return n; });
  }, [searchDataModel]);

  // 🎲 文化混搭骰 — random 2 cultures × 1 lens, auto-fetch both → forced serendipity.
  // Math.random is fine here (browser/client code; the no-random rule is for workflow scripts).
  const rollDice = useCallback(() => {
    const flat = CULTURE_REGIONS.flatMap((g) => g.items.map((it) => ({ it, group: g.group })));
    if (flat.length < 2) return;
    const ai = Math.floor(Math.random() * flat.length);
    let bi = Math.floor(Math.random() * flat.length);
    if (bi === ai) bi = (bi + 1) % flat.length;
    const a = flat[ai]!, b = flat[bi]!;
    const t = ALL_TOPICS[Math.floor(Math.random() * ALL_TOPICS.length)] ?? ALL_TOPICS[0]!;
    setRegion(a.it);
    setRegionTab(a.group);
    setFusionRegion(b.it);
    setTopic(t.key);
    const opts = liveAi ? undefined : { curatedOnly: true };
    void fetchCulture(a.it.en, t.key, opts);
    void fetchCulture(b.it.en, t.key, opts);
  }, [fetchCulture, liveAi]);

  const fetchAllTrending = useCallback(async () => {
    setTrendingFetching(true);
    const nextTopics: Record<string, string[]> = {};
    await Promise.allSettled(TRENDING_CATEGORIES.map(async (cat) => {
      try {
        const res = await fetch("/api/tools/studio/trending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: cat.value, model: searchDataModel }),
        });
        const json = (await res.json()) as { ok: boolean; topics?: string[] };
        const topics = coerceTopics(json.topics);
        if (json.ok && topics.length) nextTopics[cat.value] = topics;
      } catch { /* skip this category */ }
    }));
    if (Object.keys(nextTopics).length > 0) {
      setAllTopics(nextTopics);
      storeTrending(nextTopics);
    }
    setTrendingFetching(false);
  }, [searchDataModel]);

  // On mount: restore the last clicked trend set without any API call.
  useEffect(() => {
    const stored = readStoredTrending();
    if (stored) setAllTopics(stored);
  }, []);

  // 🗓️ Fetch upcoming events from the monthly-refreshed event cache.
  const fetchUpcomingEvents = useCallback(async () => {
    setEventsFetching(true);
    try {
      const now = new Date().toISOString().slice(0, 10);
      const until = new Date(Date.now() + eventWindowDays * 86400000).toISOString().slice(0, 10);
      const url = new URL("/api/tools/events/upcoming", window.location.origin);
      url.searchParams.set("from", now);
      url.searchParams.set("until", until);
      url.searchParams.set("days", String(eventWindowDays));
      url.searchParams.set("sort", eventSort);
      url.searchParams.set("limit", String(EVENT_FETCH_LIMIT));
      if (eventCatFilter !== "all") url.searchParams.set("category", eventCatFilter);
      if (eventCountryFilter !== "all") url.searchParams.set("country", eventCountryFilter);
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = (await res.json()) as { events: UpcomingEvent[] };
        setUpcomingEvents(json.events ?? []);
      }
    } catch { /* silent */ }
    setEventsFetching(false);
  }, [eventCatFilter, eventCountryFilter, eventSort, eventWindowDays]);

  useEffect(() => { void fetchUpcomingEvents(); }, [fetchUpcomingEvents]);

  // Auto-load items for the selected region×facet WITHOUT a click and WITHOUT spending:
  // localStorage first, else a curated-only fetch (pre-baked = free + instant; never the LLM).
  // The ref guards against an effect loop when a long-tail combo has no curated entry (empty).
  const autoLoadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!region) return;
    const facetKey = topic;
    const key = cultureRuntimeKey(region.en, facetKey);
    const stored = readStoredCulture(region.en, facetKey);
    if (stored) { setCultureDyn((prev) => (prev[key] ? prev : { ...prev, [key]: stored })); return; }
    if (autoLoadedRef.current.has(key)) return;
    autoLoadedRef.current.add(key);
    void fetchCulture(region.en, facetKey, { curatedOnly: true });
  }, [region, topic, fetchCulture]);

  // 🔍 Lightbox: close on Escape while an image is zoomed.
  useEffect(() => {
    if (!zoomImage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomImage(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomImage]);

  const onUploadRefs = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = Math.max(0, maxRefs - refImages.length);
    const picked = Array.from(files).slice(0, room);
    const urls: string[] = [];
    for (const f of picked) {
      try { urls.push(await downscaleImageFile(f)); } catch { /* skip */ }
    }
    setRefImages((prev) => [...prev, ...urls].slice(0, maxRefs));
  }, [maxRefs, refImages.length]);

  // Sequential multi-model generation (avoids API 429, results appear incrementally).
  // promptOverride lets 🎨 單獨生圖 generate one specific item; noRef forces text-to-image.
  const runGenerate = useCallback(async (opts?: { promptOverride?: string; noRef?: boolean }) => {
    const usePrompt = opts?.promptOverride ?? effectivePrompt;
    const requestPrompt = promptWithAspect(usePrompt, aspect);
    const effRefMode: RefMode = opts?.noRef ? "none" : refMode;
    if (!usePrompt || usePrompt.trim().length < 3) {
      setResults([{ model: primaryModel, image: null, seed: null, error: "請先填主題/描述（prompt 至少 3 字）", busy: false }]);
      return;
    }
    if (effRefMode === "transform" && refImages.length === 0) {
      setResults([{ model: primaryModel, image: null, seed: null, error: "改圖模式需要先上傳一張圖", busy: false }]);
      return;
    }

    const modelList = Array.from(selectedModels);

    // Validate ideogram-character requires ref (refMode="none" sends [] regardless of stale refImages)
    if (modelList.includes("ideogram-character") && (effRefMode === "none" || refImages.length === 0)) {
      setResults([{ model: "ideogram-character", image: null, seed: null, error: "Ideogram Character 需要至少 1 張角色參考圖", busy: false }]);
      return;
    }

    const genId = ++genIdRef.current;
    jobIdRef.current = crypto.randomUUID();
    setBusy(true);
    setActiveIdx(0);
    setMockupState("idle");
    setMockups([]);
    setSavedMockups({});
    setSaveStates({});
    setBgStates({});
    setOriginalImages({});
    setEdgeStates({});
    setEdgeOriginals({});
    setEdgeApplied({});

    // Initialise all slots as busy so UI shows pending cards immediately
    const slots: ModelResult[] = modelList.map((m) => ({ model: m, image: null, seed: null, busy: true }));
    setResults([...slots]);

    for (let i = 0; i < modelList.length; i++) {
      if (genIdRef.current !== genId) break; // user re-clicked generate
      const m = modelList[i];
      const mOption = STUDIO_MODEL_OPTIONS.find((o) => o.value === m);
      const refsForModel = effRefMode === "none" ? [] : refImages.slice(0, mOption?.maxRefs ?? 0);

      try {
        const res = await fetch("/api/tools/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: m, prompt: requestPrompt, referenceImages: refsForModel, aspectRatio: aspect, _jobId: jobIdRef.current }),
        });
        const json = (await res.json()) as { ok: boolean; image?: string; seed?: number | null; error?: string };
        slots[i] = json.ok && json.image
          ? { model: m, image: json.image, seed: json.seed ?? null, busy: false }
          : { model: m, image: null, seed: null, error: json.error ?? `HTTP ${res.status}`, busy: false };
      } catch (err) {
        slots[i] = { model: m, image: null, seed: null, error: err instanceof Error ? err.message : String(err), busy: false };
      }

      if (genIdRef.current === genId) setResults([...slots]);
    }

    if (genIdRef.current === genId) setBusy(false);
  }, [selectedModels, effectivePrompt, refImages, aspect, refMode, primaryModel]);

  const generate = useCallback(() => { void runGenerate(); }, [runGenerate]);

  // 🎨 單獨生圖 — generate one specific item on its own (sticker), with current 玩法 + 風格 applied.
  const generateSingle = useCallback((en: string) => {
    const p = [en, playMods.join(", "), resolvedStylePrompt, "die-cut sticker design, bold clean outline, plain background"]
      .filter(Boolean).join(", ");
    void runGenerate({ promptOverride: p, noRef: true });
  }, [runGenerate, playMods, resolvedStylePrompt]);

  const removeBg = useCallback(async (model: StudioModel, image: string) => {
    if (bgInFlight.current[model]) return;
    bgInFlight.current[model] = true;
    setBgStates((prev) => ({ ...prev, [model]: "removing" }));
    try {
      const res = await fetch("/api/tools/studio/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, _jobId: jobIdRef.current }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) { setBgStates((prev) => ({ ...prev, [model]: "error" })); return; }
      setOriginalImages((prev) => ({ ...prev, [model]: image }));
      setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: json.image! } : r));
      setBgStates((prev) => ({ ...prev, [model]: "done" }));
      setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
      setEdgeStates((prev) => ({ ...prev, [model]: "idle" }));
      setEdgeOriginals((prev) => { const n = { ...prev }; delete n[model]; return n; });
      setEdgeApplied((prev) => { const n = { ...prev }; delete n[model]; return n; });
    } catch { setBgStates((prev) => ({ ...prev, [model]: "error" })); }
    finally { bgInFlight.current[model] = false; }
  }, []);

  const restoreOriginal = useCallback((model: StudioModel) => {
    const orig = originalImages[model];
    if (!orig) return;
    setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: orig } : r));
    setOriginalImages((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setBgStates((prev) => ({ ...prev, [model]: "idle" }));
    setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
    setEdgeStates((prev) => ({ ...prev, [model]: "idle" }));
    setEdgeOriginals((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setEdgeApplied((prev) => { const n = { ...prev }; delete n[model]; return n; });
  }, [originalImages]);

  // ✨ Apply an organic edge mask to the active design (client-side canvas compositing).
  // Always masks from the pre-edge base, so switching styles replaces rather than stacks.
  // While one composite is in flight the latest request is QUEUED (not dropped) and drained
  // when it finishes — so a fast slider drag can't leave the image on a stale amount.
  const applyEdge = useCallback(async (model: StudioModel, styleId: EdgeMaskId) => {
    if (edgeInFlight.current[model]) {
      edgePending.current[model] = { styleId, amount: edgeAmount };
      return;
    }
    const cur = results.find((r) => r.model === model);
    const base = edgeOriginals[model] ?? cur?.image;
    if (!base) return;
    edgeInFlight.current[model] = true;
    setEdgeStates((prev) => ({ ...prev, [model]: "applying" }));
    let nextStyle: EdgeMaskId | null = styleId;
    let nextAmount = edgeAmount;
    try {
      while (nextStyle) {
        const appliedStyle: EdgeMaskId = nextStyle;
        const res = await applyEdgeMask(base, appliedStyle, { amount: nextAmount, seed: EDGE_APPLY_SEED });
        if (!res.ok) { setEdgeStates((prev) => ({ ...prev, [model]: "error" })); break; }
        setEdgeOriginals((prev) => (prev[model] ? prev : { ...prev, [model]: base }));
        setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: res.image } : r));
        setEdgeApplied((prev) => ({ ...prev, [model]: appliedStyle }));
        setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
        const pending = edgePending.current[model];
        edgePending.current[model] = null;
        if (!pending) { setEdgeStates((prev) => ({ ...prev, [model]: "done" })); break; }
        nextStyle = pending.styleId;
        nextAmount = pending.amount;
      }
    } catch { setEdgeStates((prev) => ({ ...prev, [model]: "error" })); }
    finally { edgeInFlight.current[model] = false; edgePending.current[model] = null; }
  }, [results, edgeOriginals, edgeAmount]);

  const restoreEdge = useCallback((model: StudioModel) => {
    const base = edgeOriginals[model];
    if (!base) return;
    setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: base } : r));
    setEdgeOriginals((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setEdgeApplied((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setEdgeStates((prev) => ({ ...prev, [model]: "idle" }));
    setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
  }, [edgeOriginals]);

  const saveToDesigns = useCallback(async (model: StudioModel, image: string) => {
    setSaveStates((prev) => ({ ...prev, [model]: "saving" }));
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          prompt: effectivePrompt,
          modelName: model,
          source: "pod-studio",
          productType: productType !== "none" ? productType : undefined,
          theme: theme.trim() || undefined,
          styleTags: style ? [style] : [],
          subject: subject.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSaveStates((prev) => ({ ...prev, [model]: json.ok ? "saved" : "error" }));
    } catch { setSaveStates((prev) => ({ ...prev, [model]: "error" })); }
  }, [effectivePrompt, productType, theme, style, subject]);

  const generateMockupFromDesign = useCallback(async (image: string) => {
    if (mockupInFlight.current) return;
    mockupInFlight.current = true;
    setMockupState("generating");
    try {
      // Pass the design's natural dimensions so Printful preserves the aspect ratio (else the
      // mockup falls back to a hardcoded square → tall art squished + shrunk — 2026-06-20).
      const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const im = new window.Image();
        im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
        im.onerror = () => resolve(null);
        im.src = image;
      });
      const res = await fetch("/api/tools/studio/mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, productType, ...(dims ? { imageWidth: dims.width, imageHeight: dims.height } : {}) }),
      });
      const json = (await res.json()) as { ok: boolean; mockups?: MockupView[]; error?: string };
      if (!json.ok || !json.mockups?.length) { setMockupState("error"); return; }
      setMockups(json.mockups);
      setMockupState("done");
    } catch { setMockupState("error"); }
    finally { mockupInFlight.current = false; }
  }, [productType]);

  const saveMockupToDesigns = useCallback(async (m: MockupView) => {
    if (savedMockups[m.url] === "saving" || savedMockups[m.url] === "saved") return;
    setSavedMockups((prev) => ({ ...prev, [m.url]: "saving" }));
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: m.url, prompt: effectivePrompt, modelName: primaryModel, source: "printful-mockup", productType: productType !== "none" ? productType : undefined, subject: m.label, styleTags: [m.group] }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSavedMockups((prev) => ({ ...prev, [m.url]: json.ok ? "saved" : "error" }));
    } catch { setSavedMockups((prev) => ({ ...prev, [m.url]: "error" })); }
  }, [savedMockups, effectivePrompt, primaryModel, productType]);

  const downloadImageWebP = useCallback((image: string, model: StudioModel) => {
    const el = document.createElement("img");
    el.onerror = () => { console.warn("WebP下載：圖片解碼失敗"); };
    el.onload = () => {
      const MAX = 4096;
      const scale = Math.min(1, MAX / Math.max(el.naturalWidth, el.naturalHeight, 1));
      const c = document.createElement("canvas");
      c.width = Math.round(el.naturalWidth * scale);
      c.height = Math.round(el.naturalHeight * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(el, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/webp", 0.9);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildSemanticFilename({ ...fileMeta, track: model }, "webp", `design.webp`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    el.src = image;
  }, [fileMeta]);

  const downloadImage = useCallback((image: string, model: StudioModel) => {
    const ext = image.startsWith("data:image/jpeg") ? "jpg" : image.startsWith("data:image/webp") ? "webp" : "png";
    const a = document.createElement("a");
    a.href = image;
    a.download = buildSemanticFilename({ ...fileMeta, track: model }, ext, `design.${ext}`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [fileMeta]);

  const isTransformMode = refMode === "transform";
  const isMultiModel = selectedModels.size > 1;
  const anyResults = results.some((r) => !r.busy && r.image);
  const visibleUpcomingEvents = useMemo(
    () => upcomingEvents.filter(eventMatchesCurrentFilter),
    [eventMatchesCurrentFilter, upcomingEvents],
  );
  const groupedUpcomingEvents = useMemo(() => {
    const groups = new Map<string, UpcomingEvent[]>();
    const labelFor = (event: UpcomingEvent) => eventSort === "date" ? event.event_date.slice(0, 7) : "推薦";
    for (const event of visibleUpcomingEvents) {
      const label = labelFor(event);
      groups.set(label, [...(groups.get(label) ?? []), event]);
    }
    return [...groups.entries()];
  }, [eventSort, visibleUpcomingEvents]);
  const buildEventLabel = useCallback((event: UpcomingEvent) => {
    const countryLabel = eventCountryLabel(event);
    const baseLabel = `${event.emoji ?? "📅"} ${event.title_zh ?? event.title}`;
    return countryLabel ? `${baseLabel} (${countryLabel})` : baseLabel;
  }, [eventCountryLabel]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, padding: 16, alignItems: "start" }}>
      {/* ── Controls (RIGHT column, sticky — moved from left per spec) ───────── */}
      <div className="build-panel" style={{ gridColumn: 2, gridRow: 1, position: "sticky", top: 16, alignSelf: "start", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>

        <label style={{ fontSize: 13 }}>
          商品類型
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={productType} onChange={(e) => onPickProduct(e.target.value)}>
            {PRODUCT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {liveAi && <AccordionSection
          title="🔎 搜尋資料AI模型"
          summary={selectedSearchDataModel.label}
        >
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {AI_TEXT_MODEL_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setSearchDataModelGroup(group)}
                style={tabStyle(searchDataModelGroup === group)}
              >
                {group}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {AI_TEXT_MODELS.filter((item) => item.group === searchDataModelGroup).map((item) => {
              const active = searchDataModel === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSearchDataModel(item.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "rgba(99,102,241,0.12)" : "rgba(127,127,127,0.04)",
                    color: active ? "var(--accent-text)" : "var(--text-primary)",
                    fontWeight: active ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  <span>{active ? "✓ " : ""}{item.label}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {textModelCostLabel(item.value)}
                  </span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6, marginBottom: 0 }}>
            世界文化與時事靈感共用此模型；只有點擊 AI 靈感或抓取熱搜時才會花文字 token。
          </p>
          <p style={{ fontSize: 10, opacity: 0.45, marginTop: 4, marginBottom: 0 }}>
            {textModelCostSummary(searchDataModel)}
          </p>
        </AccordionSection>}

        {liveAi && <AccordionSection title="🔥 時事靈感">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>點擊話題填入主圖欄（再點一次取消）</p>
            <button type="button" disabled={trendingFetching} onClick={() => void fetchAllTrending()}
              style={actionPill(trendingFetching)}>
              {trendingFetching ? "搜尋中…" : "抓取今日熱搜"}
            </button>
          </div>
          {/* Row 1: category tabs (圖一 layout) */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TRENDING_CATEGORIES.map((cat) => (
              <button key={cat.value} type="button" onClick={() => setTrendingTab(cat.value)} style={tabStyle(trendingTab === cat.value)}>
                {cat.label}
              </button>
            ))}
          </div>
          {/* Row 2: topics of the active category — active chip shows 淺紫 bg + ✓ (selected = current subject) */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(() => {
              const topics = allTopics[trendingTab];
              if (!topics) {
                return <span style={{ fontSize: 11, opacity: 0.45 }}>{trendingFetching ? "搜尋中…" : "點「抓取今日熱搜」載入話題"}</span>;
              }
              return topics.map((t, i) => {
                const active = subject === t;
                return (
                  <button key={`${trendingTab}-${i}`} type="button" onClick={() => setSubject(active ? "" : t)} style={chipStyle(active)}>
                    {active ? "✓ " : ""}{t}
                  </button>
                );
              });
            })()}
          </div>
        </AccordionSection>}

        {/* 🗓️ 活動行事曆 — upcoming events for merchandise pre-selling */}
        <AccordionSection
          title="🗓️ 活動行事曆"
          summary={visibleUpcomingEvents.length > 0 ? `${visibleUpcomingEvents.length} 個可用` : "載入中…"}
        >
          <p style={{ fontSize: 11, opacity: 0.55, margin: "0 0 8px" }}>點擊活動 → 自動填入主圖欄（為這個活動設計商品圖）</p>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {EVENT_CAT_FILTERS.map((filter) => (
              <button key={filter.value} type="button" onClick={() => setEventCatFilter(filter.value)} style={tabStyle(eventCatFilter === filter.value)}>{filter.label}</button>
            ))}
            <button type="button" onClick={() => void fetchUpcomingEvents()} disabled={eventsFetching}
              style={{ ...actionPill(eventsFetching), marginLeft: "auto" }}>
              {eventsFetching ? "載入中…" : "🔄"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
            <select className="btn-secondary" value={eventCountryFilter} onChange={(e) => setEventCountryFilter(e.target.value)} style={{ fontSize: 12 }}>
              <option value={EVENT_ALL_COUNTRIES_FILTER.value}>{EVENT_ALL_COUNTRIES_FILTER.label}</option>
              {EVENT_COUNTRY_FILTER_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
                </optgroup>
              ))}
            </select>
            <select className="btn-secondary" value={eventWindowDays} onChange={(e) => setEventWindowDays(Number(e.target.value))} style={{ fontSize: 12 }}>
              {EVENT_WINDOWS.map((window_) => <option key={window_.value} value={window_.value}>{window_.label}</option>)}
            </select>
            <select className="btn-secondary" value={eventSort} onChange={(e) => setEventSort(e.target.value as "opportunity" | "date")} style={{ fontSize: 12 }}>
              {EVENT_SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
            </select>
            <button type="button" onClick={() => setEventBrowserOpen(true)} style={actionPill(false)}>
              查看更多
            </button>
          </div>
          <div style={{ display: "grid", gap: 8, maxHeight: 430, overflowY: "auto", paddingRight: 2 }}>
            {(() => {
              if (eventsFetching) {
                return (
                  <span style={{ fontSize: 11, opacity: 0.45 }}>
                    載入中…
                  </span>
                );
              }

              if (groupedUpcomingEvents.length === 0) {
                return <span style={{ fontSize: 11, opacity: 0.45 }}>此篩選暫無活動</span>;
              }

              return groupedUpcomingEvents.map(([group, events]) => (
                <section key={group}>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.58, marginBottom: 5 }}>{group}</div>
                  <div style={{ display: "grid", gap: 5 }}>
                    {events.map((event) => {
                      const label = buildEventLabel(event);
                      const active = subject === label;
                      const daysUntil = Math.ceil((new Date(event.event_date).getTime() - Date.now()) / 86400000);
                      const countries = eventCountryLabel(event);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          title={`${event.event_date} · ${(event.facets ?? [event.category]).join(", ")}${countries ? ` · ${countries}` : ""} · 提前 ${event.marketing_lead_days} 天備稿`}
                          onClick={() => setSubject(active ? "" : label)}
                          style={{
                            textAlign: "left",
                            border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                            background: active ? "rgba(99,102,241,0.12)" : "rgba(127,127,127,0.04)",
                            color: "var(--text-primary)",
                            borderRadius: 6,
                            padding: "8px 9px",
                            cursor: "pointer",
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12, fontWeight: 750, overflowWrap: "anywhere" }}>
                              {active ? "✓ " : ""}{label}
                            </span>
                            <span style={{ display: "block", fontSize: 10, opacity: 0.58, marginTop: 2 }}>
                              {(event.facets ?? [event.category]).join(", ")}{countries ? ` · ${countries}` : ""}
                            </span>
                          </span>
                          <span style={{ textAlign: "right", fontSize: 10, opacity: 0.72, whiteSpace: "nowrap" }}>
                            <span style={{ display: "block", fontWeight: 800 }}>{event.event_date.slice(5)}</span>
                            <span>{daysUntil >= 0 ? `${daysUntil}天` : "進行中"}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ));
            })()}
          </div>
        </AccordionSection>

        {/* 🌍 世界文化 — region × lens, with AI-filled specific items (混搭靈感工具). */}
        <AccordionSection title="🌍 世界文化" summary={region ? (fusionRegion ? `${region.zh}×${fusionRegion.zh}` : region.zh) : (cultureChips.length ? `${cultureChips.length} 元素` : "未選")}>
          <p style={{ fontSize: 11, opacity: 0.55, margin: "0 0 8px" }}>
            1️⃣ 選用途 → 2️⃣ 選國家 → 3️⃣ 選主題 → 項目自動跳出（免費），按「生成」
          </p>

          {/* 1️⃣ 用途：做圖案（衣服/貼紙的文化元素）vs 做地圖（整張觀光地圖）— 明確二選一，取代隱藏的開關 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button type="button" onClick={() => setMapMode(false)}
              title="做衣服/貼紙上的單張文化圖案" style={{ ...tabStyle(!mapMode), flex: 1 }}>
              🎨 做圖案
            </button>
            <button type="button"
              onClick={() => { setMapMode(true); setAspect("2:3"); setPromptTouched(false); setPrompt(""); }}
              title="把國家＋項目組成一整張插畫觀光地圖" style={{ ...tabStyle(mapMode), flex: 1 }}>
              🗺️ 做地圖
            </button>
          </div>
          <div style={{ marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: "rgba(99,102,241,0.10)", border: "1px solid var(--border)", fontSize: 11.5, lineHeight: 1.5 }}>
            {mapMode
              ? <>🗺️ <b>做地圖</b>：選國家＋地圖主題（地標/美食/必去/驚奇…）→ 生成一整張觀光插畫地圖。</>
              : <>🎨 <b>做圖案</b>：選國家＋文化面向（服飾/紋樣/符號…）→ 做衣服或貼紙上的單張文化圖案。</>}
          </div>

          {/* 進階：文化混搭（兩國融合）— 收合，避免一般使用者眼花 */}
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            style={{ ...ghostBtn(), marginBottom: showAdvanced ? 6 : 10 }}>
            {showAdvanced ? "▾" : "▸"} 進階：文化混搭（兩國融合）
          </button>
          {showAdvanced && (
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={rollDice} title="隨機 2 國混搭，逼出意外靈感" style={actionPill()}>
                🎲 隨機混搭
              </button>
              <button type="button" disabled={!region} onClick={() => setFusionPickMode((v) => !v)}
                title="先選一個主國，再開此鈕，點第二個國家自己決定組合" style={tabStyle(fusionPickMode)}>
                ✋ 手選第二國 {fusionPickMode ? "ON" : ""}
              </button>
              <span style={{ fontSize: 10, opacity: 0.5 }}>＝把兩個國家的文化融合</span>
            </div>
          )}
          {fusionRegion && region && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "5px 10px", borderRadius: 8, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.4)", fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>🎲 {region.zh} × {fusionRegion.zh} 混搭中</span>
              <button type="button" onClick={() => setFusionRegion(null)} title="取消混搭"
                style={{ ...ghostBtn(), marginLeft: "auto" }}>✕</button>
            </div>
          )}

          {/* 地域：洲 tabs + 國家 chips（單選） */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {CULTURE_REGIONS.map((g) => (
              <button key={g.group} type="button" onClick={() => setRegionTab(g.group)} style={tabStyle(regionTab === g.group)}>
                {g.group}
              </button>
            ))}
          </div>
          {fusionPickMode && region && (
            <p style={{ fontSize: 11, color: "var(--accent-text)", margin: "0 0 6px" }}>✋ 手選混搭中：點一個國家設為「混搭第二國」（再點取消）</p>
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            {(CULTURE_REGIONS.find((g) => g.group === regionTab)?.items ?? []).map((it) => {
              const isPrimary = region?.en === it.en;
              const isFusion = fusionRegion?.en === it.en;
              const active = isPrimary || isFusion;
              return (
                <span key={it.en} style={{ display: "inline-block" }}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: it.desc, x: r.left + r.width / 2, y: r.top }); }}
                  onMouseLeave={() => setTip(null)}>
                  <button type="button"
                    onClick={() => {
                      // ✋ 手選混搭: when a primary is already chosen, a click on a DIFFERENT
                      // country sets/clears it as the fusion (2nd) country. Otherwise normal single-select.
                      if (fusionPickMode && region && !isPrimary) {
                        setFusionRegion(isFusion ? null : it);
                      } else {
                        setRegion(isPrimary ? null : it);
                        setFusionRegion(null);
                        setFusionPickMode(false);
                      }
                    }}
                    style={chipStyle(active)}>
                    {isPrimary ? "✓ " : isFusion ? "＋ " : ""}{it.zh}
                  </button>
                </span>
              );
            })}
          </div>

          {/* 主題清單（整合版）— 核心/觀光/設計 三組，兩模式共用同一份。單選一個主題。 */}
          {TOPIC_GROUPS.map((g) => (
            <div key={g.label} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", margin: "2px 0 3px" }}>{g.label}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {g.items.map((t) => (
                  <button key={t.key} type="button" onClick={() => setTopic(t.key)} style={tabStyle(topic === t.key)}>
                    {t.emoji} {t.zh}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* 具體項目（dyn，可複選放地圖/🎨單獨生圖）與 分類（fallback，整體地圖）分開列。
              facet = 目前選的主題（兩模式共用 region.en|topic 快取）。 */}
          {(() => {
            const facet = ALL_TOPICS.find((t) => t.key === topic) ?? ALL_TOPICS[0]!;
            const dynKey = region ? `${region.en}|${facet.key}` : "";
            const dyn = dynKey ? cultureDyn[dynKey] : undefined;
            const fetching = dynKey ? !!cultureFetching[dynKey] : false;
            const specSeen = new Set<string>();          // dedupe by en (guard vs AI re-roll dupes)
            const specifics = (dyn ?? []).filter((it) => !specSeen.has(it.en) && specSeen.add(it.en));
            const categories = facet.fallback;           // 概略大類
            const miniBtn: CSSProperties = { fontSize: 11, padding: "2px 6px", borderRadius: 10, cursor: "pointer", border: "1px solid var(--border)", background: "var(--chip-surface)", color: "var(--text-primary)" };
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  {liveAi && <button type="button" disabled={!region || fetching}
                    onClick={() => { if (region) void fetchCulture(region.en, facet.key, { force: true }); }}
                    title="精選清單已自動載入（免費）。想要不一樣的，按這個用 AI 換一批（花一點點錢）"
                    style={actionPill(!region || fetching)}>
                    {fetching ? "AI 思考中…" : `🔄 AI 換一批（${region ? region.zh : "先選地域"}・${facet.zh}）`}
                  </button>}
                  {specifics.length > 0 && <span style={{ fontSize: 10, opacity: 0.45 }}>已載入 {specifics.length} 項</span>}
                </div>

                {/* 具體項目：勾選＝放地圖/加 prompt；🎨＝單獨生這一張 */}
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", margin: "2px 0 4px" }}>具體項目 <span style={{ fontWeight: 400, opacity: 0.6 }}>· 勾選放地圖／🎨單獨生圖</span></div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  {specifics.length === 0 && <span style={{ fontSize: 11, opacity: 0.45 }}>{region ? "按「AI 換一批」取得具體項目" : "先選地域"}</span>}
                  {specifics.map((it) => {
                    const active = cultureChips.includes(it.en);
                    return (
                      <span key={it.en} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
                        onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: it.desc, x: r.left + r.width / 2, y: r.top }); }}
                        onMouseLeave={() => setTip(null)}>
                        <button type="button" onClick={() => toggleCultureChip(it.en)} style={chipStyle(active)}>
                          {active ? "✓ " : ""}{it.zh}
                        </button>
                        <button type="button" disabled={busy} onClick={() => generateSingle(it.en)} title="單獨生這一張圖" style={miniBtn}>🎨</button>
                      </span>
                    );
                  })}
                </div>

                {/* 分類：點＝整體地圖（鋪滿該類多樣） */}
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", margin: "2px 0 4px" }}>分類 <span style={{ fontWeight: 400, opacity: 0.6 }}>· 點＝整體地圖（鋪滿該類多樣）</span></div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {categories.map((it) => {
                    const token = `many different kinds of ${it.en}`;
                    const active = cultureChips.includes(token);
                    return (
                      <span key={it.en} style={{ display: "inline-block" }}
                        onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: `整體地圖：鋪滿各種${it.zh}`, x: r.left + r.width / 2, y: r.top }); }}
                        onMouseLeave={() => setTip(null)}>
                        <button type="button" onClick={() => onPickCategory(it.en)} style={chipStyle(active)}>
                          🗺️ {active ? "✓ " : ""}{it.zh}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* 已選文化元素 summary + 清除 */}
          {cultureChips.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>已選文化元素 ({cultureChips.length})</span>
                <button type="button" onClick={() => setCultureChips([])}
                  style={ghostBtn()}>清除</button>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {cultureChips.map((en) => (
                  <button key={en} type="button" onClick={() => toggleCultureChip(en)} title="點擊移除"
                    style={chipStyle(true)}>
                    {en} ✕
                  </button>
                ))}
              </div>
            </div>
          )}
        </AccordionSection>

        {/* 🎭 玩法 — treatment modifiers (multi-select), applied to whichever items/subject are chosen. */}
        <AccordionSection title="🎭 玩法" summary={playMods.length ? `${playMods.length} 種` : "未選"}>
          <p style={{ fontSize: 11, opacity: 0.55, margin: "0 0 8px" }}>
            套在你選的項目上（可多選）。例：雞排+珍奶 ＋ 擬人化 ＝ 有臉有手腳的可愛角色。
          </p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {PLAY_MODIFIERS.map((m) => {
              const active = playMods.includes(m.en);
              return (
                <span key={m.en} style={{ display: "inline-block" }}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: m.desc, x: r.left + r.width / 2, y: r.top }); }}
                  onMouseLeave={() => setTip(null)}>
                  <button type="button" onClick={() => togglePlayMod(m.en)} style={chipStyle(active)}>
                    {active ? "✓ " : ""}{m.emoji} {m.zh}
                  </button>
                </span>
              );
            })}
          </div>
          {playMods.length > 0 && (
            <button type="button" onClick={() => setPlayMods([])} style={{ ...ghostBtn(), marginTop: 8 }}>清除玩法</button>
          )}
        </AccordionSection>

        <AccordionSection title="🎯 主圖 Subject" summary={subject || "未填"}>
          <input className="btn-secondary" style={{ width: "100%", marginBottom: 8, opacity: isTransformMode ? 0.5 : 1 }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={isTransformMode ? "改圖模式：主圖由上傳圖決定（可選）" : "例：lotus flower mandala"} />
          <CategoryPicker categories={SUBJECT_CATEGORIES} value={subject} onPick={setSubject} onTip={setTip} />
        </AccordionSection>

        <AccordionSection title="📚 題材 Theme" summary={theme || "未填"}>
          <input className="btn-secondary" style={{ width: "100%", marginBottom: 8, opacity: isTransformMode ? 0.4 : 1 }} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={isTransformMode ? "改圖模式下不影響 prompt" : "例：spiritual healing"} />
          <CategoryPicker categories={THEME_CATEGORIES} value={theme} onPick={setTheme} onTip={setTip} />
        </AccordionSection>

        <AccordionSection title="✨ 氛圍 Vibe" summary={vibe || "未填"}>
          <input className="btn-secondary" style={{ width: "100%", marginBottom: 8 }} value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="例：calm, ethereal" />
          <CategoryPicker categories={VIBE_CATEGORIES} value={vibe} onPick={setVibe} onTip={setTip} />
        </AccordionSection>

        {/* 🤖 圖片模型 — placed BEFORE 風格 (per spec). Tarot-style: provider tabs + vertical rows. */}
        <AccordionSection
          title="🤖 圖片模型"
          summary={selectedModels.size > 1 ? `已選 ${selectedModels.size} 個` : (STUDIO_MODEL_OPTIONS.find((o) => selectedModels.has(o.value))?.label ?? "")}
        >
          {/* Row 1: provider tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {MODEL_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => setModelGroup(g)}
                style={tabStyle(modelGroup === g)}>
                {g}
              </button>
            ))}
          </div>
          {/* Row 2: model rows (label left, cost/ref right) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {STUDIO_MODEL_OPTIONS.filter((item) => item.group === modelGroup).map((item) => {
              const active = selectedModels.has(item.value);
              return (
                <button key={item.value} type="button"
                  onClick={() => {
                    onModelsChange((() => {
                      const next = new Set(selectedModels);
                      if (next.has(item.value)) { if (next.size > 1) next.delete(item.value); }
                      else { next.add(item.value); }
                      return next;
                    })());
                  }}
                  title={item.maxRefs > 0 ? `最多 ${item.maxRefs} 張參考圖` : "純文字生圖"}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "rgba(99,102,241,0.12)" : "rgba(127,127,127,0.04)", color: active ? "var(--accent-text)" : "var(--text-primary)", fontWeight: active ? 600 : 400, transition: "all 0.15s" }}>
                  <span>{active && selectedModels.size === 1 ? "✓ " : active ? "☑ " : ""}{item.label}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    NT${item.costNt}{item.maxRefs > 0 ? ` · ${item.maxRefs}ref` : " · text"}
                  </span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
            {selectedModels.size > 1
              ? `已選 ${selectedModels.size} 個模型 → 依序生成 ${selectedModels.size} 張比較圖`
              : (() => { const m = STUDIO_MODEL_OPTIONS.find((o) => selectedModels.has(o.value)); return m?.maxRefs ? `此模型最多吃 ${m.maxRefs} 張參考圖` : "此模型不吃參考圖（純文字生圖）"; })()}
          </p>
        </AccordionSection>

        {/* 🎨 風格 Style — tarot-style: group tabs + chips with hover tooltip (圖二). The
            chip stores the FULL item.zh (needed by resolveStylePrompt); only the display
            is split on "｜" — label before, tooltip description after. */}
        <AccordionSection title="🎨 風格 Style" summary={style ? style.split("｜")[0] : "不指定"}>
          {/* Row 1: group tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {STYLE_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => { setStyleGroup(g); setTip(null); }}
                style={tabStyle(styleGroup === g)}>
                {g}
              </button>
            ))}
          </div>
          {/* Row 2: style chips for selected group, with hover tooltip */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {STYLE_CATALOG.filter((item) => item.group === styleGroup).map((item) => {
              const active = style === item.zh;
              const [label, desc] = item.zh.split("｜");
              return (
                <span
                  key={item.zh}
                  style={{ display: "inline-block" }}
                  onMouseEnter={(e) => {
                    if (!desc) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setTip({ text: desc, x: r.left + r.width / 2, y: r.top });
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  <button type="button" onClick={() => setStyle(active ? "" : item.zh)}
                    style={chipStyle(active)}>
                    {active ? "✓ " : ""}{label}
                  </button>
                </span>
              );
            })}
          </div>
        </AccordionSection>

        <AccordionSection title="📐 比例" summary={aspect}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ASPECTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspect(a)}
                style={chipStyle(aspect === a)}
              >
                {a}
              </button>
            ))}
          </div>
        </AccordionSection>

        {/* 參考圖 + 模式切換 — original bordered box style */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>🖼️ 參考圖</p>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 8 }}>
            <button type="button" onClick={() => onSetRefMode("none")} style={{ flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none", background: refMode === "none" ? "var(--accent)" : "transparent", color: refMode === "none" ? "var(--btn-primary-text)" : "var(--text-muted)", transition: "all 0.15s" }}>
              無
            </button>
            <button type="button" onClick={() => onSetRefMode("ref")} style={{ flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none", background: refMode === "ref" ? "var(--accent)" : "transparent", color: refMode === "ref" ? "var(--btn-primary-text)" : "var(--text-muted)", transition: "all 0.15s" }}>
              🖼️ 風格參考
            </button>
            <button type="button" onClick={() => onSetRefMode("transform")} style={{ flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none", background: refMode === "transform" ? "var(--accent)" : "transparent", color: refMode === "transform" ? "var(--btn-primary-text)" : "var(--text-muted)", transition: "all 0.15s" }}>
              🎨 改圖模式
            </button>
          </div>
          {refMode === "none" ? (
            <p style={{ fontSize: 10, opacity: 0.45, lineHeight: 1.5 }}>不使用參考圖，純文字生圖。</p>
          ) : (
            <>
              <p style={{ fontSize: 10, opacity: 0.5, marginBottom: 8, lineHeight: 1.5 }}>
                {refMode === "ref" ? "上傳圖作為視覺參考，AI 依 Subject/Style 生成新圖" : "直接把你的圖套用選定風格（建議 flux-kontext）"}
              </p>
              {maxRefs > 0 ? (
                <label style={{ fontSize: 12 }}>
                  {refMode === "transform" ? "上傳要改的圖" : `參考圖（${refImages.length}/${maxRefs}）`}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ width: "100%", marginTop: 4 }} onChange={(e) => void onUploadRefs(e.target.files)} />
                  {refImages.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      {refImages.map((r, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={r} alt={`ref-${i}`} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} title="點擊移除" onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))} />
                      ))}
                    </div>
                  )}
                </label>
              ) : (
                <p style={{ fontSize: 11, opacity: 0.45 }}>目前所選模型均不支援參考圖。{refMode === "transform" && " 改圖模式將自動切換至 flux-kontext-dev。"}</p>
              )}
            </>
          )}
        </div>

        <button className="btn-primary" disabled={busy} onClick={() => void generate()}>
          {busy ? `生成中… (${results.filter((r) => !r.busy).length}/${results.length})` : isMultiModel ? `生成比較（${selectedModels.size} 個模型）` : "生成"}
        </button>

        {activeResult && !activeResult.busy && activeResult.image ? (() => {
          const m = activeResult.model;
          const img = activeResult.image;
          const saveState = saveStates[m] ?? "idle";
          const bgState = bgStates[m] ?? "idle";
          const origImg = originalImages[m];
          const edgeState = edgeStates[m] ?? "idle";
          const appliedEdge = edgeApplied[m];
          return (
            <div style={{ marginTop: 4, padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card-bg)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveToDesigns(m, img)}>
                  {saveState === "saved" ? "已存入 My Designs" : saveState === "saving" ? "存入中…" : "存入 My Designs"}
                </button>
                <button className="btn-secondary" disabled={bgState === "removing" || bgState === "done"} onClick={() => void removeBg(m, img)}>
                  {bgState === "done" ? "已去背" : bgState === "removing" ? "去背中…" : "去背（透明 PNG）"}
                </button>
                {bgState === "done" && origImg && (
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => restoreOriginal(m)}>還原原圖</button>
                )}
                {bgState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>去背失敗</span>}
                {bgState === "done" && productType === "tshirt" && (
                  <button className="btn-secondary" disabled={mockupState === "generating" || mockupState === "done"} onClick={() => void generateMockupFromDesign(img)}>
                    {mockupState === "done" ? "產品預覽 ✓" : mockupState === "generating" ? "生成 Mockup…" : "產品 Mockup"}
                  </button>
                )}
                {mockupState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>Mockup 失敗</span>}
                <button className="btn-secondary" onClick={() => downloadImage(img, m)}>PNG下載</button>
                <button className="btn-secondary" onClick={() => downloadImageWebP(img, m)}>WebP下載</button>
                {activeResult.seed != null && <span style={{ fontSize: 12, opacity: 0.6 }}>seed {activeResult.seed}</span>}
                {saveState === "saved" && !onDoor && <a href="/tools/designs" style={{ fontSize: 12 }}>查看 My Designs</a>}
                {saveState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>存入失敗</span>}
              </div>

              <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>✨ 邊緣風格</span>
                  {edgeState === "applying" && <span style={{ fontSize: 11, opacity: 0.6 }}>套用中…</span>}
                  {edgeState === "error" && <span style={{ fontSize: 11, color: "var(--red)" }}>套用失敗</span>}
                  {appliedEdge && (
                    <button className="btn-secondary" style={{ fontSize: 11, marginLeft: "auto" }} onClick={() => restoreEdge(m)}>
                      還原
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                  {edgePreviews.map((pv) => {
                    const active = appliedEdge === pv.id;
                    return (
                      <button
                        key={pv.id}
                        type="button"
                        title={pv.en}
                        disabled={edgeState === "applying"}
                        onClick={() => void applyEdge(m, pv.id)}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                          minWidth: 0, padding: 4, borderRadius: 8, cursor: "pointer",
                          background: active ? "rgba(99,102,241,0.15)" : "rgba(127,127,127,0.06)",
                          border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pv.svg} alt={pv.zh} style={{ width: 40, height: 40, background: "#3a3a3a", borderRadius: 4 }} />
                        <span style={{ fontSize: 10, opacity: 0.8, lineHeight: 1.1, textAlign: "center" }}>{pv.zh}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>強度</span>
                  <input
                    type="range" min={10} max={90} step={1} value={edgeAmount}
                    onChange={(e) => setEdgeAmount(Number(e.target.value))}
                    onPointerUp={() => { if (appliedEdge) void applyEdge(m, appliedEdge); }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 11, opacity: 0.6, width: 30, textAlign: "right" }}>{edgeAmount}</span>
                </div>
              </div>

              {mockups.length > 0 && (
                <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 13, marginBottom: 6, opacity: 0.7 }}>產品預覽</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    {mockups.map((mockup) => {
                      const st = savedMockups[mockup.url];
                      return (
                        <div key={mockup.url}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mockup.url} alt={mockup.label} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "#111", borderRadius: 8, border: "1px solid var(--border)" }} />
                          <div style={{ fontSize: 11, marginTop: 3, opacity: 0.8 }}>{mockup.label}</div>
                          <button className="btn-secondary" style={{ fontSize: 11, marginTop: 3, width: "100%" }} disabled={st === "saving" || st === "saved"} onClick={() => void saveMockupToDesigns(mockup)}>
                            {st === "saved" ? "已存" : st === "saving" ? "存入中…" : st === "error" ? "重試" : "存預覽"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                {canvasHref && <button
                  className="btn-secondary"
                  style={{ width: "100%", marginBottom: 6 }}
                  onClick={() => openInCanvas(activeResult.image, buildSemanticBase({ ...fileMeta, track: "編輯" }), canvasHref)}
                >
                  ✏️ 快速編輯
                </button>}
                <AccordionSection title="✏️ AI image prompt（修圖）" defaultOpen={false}>
                  <ImageEditPromptPanel
                    sourceImage={activeResult.image}
                    currentPrompt={effectivePrompt}
                    imageModel={activeResult.model}
                    target="pod-design"
                    aspectRatio={aspect}
                    title=""
                    styleAnchor={{ model: activeResult.model, mode: refImages.length > 0 ? "image" : "text", stylePrompt: resolvedStylePrompt || effectivePrompt, subject: subject.trim(), refs: refImages.length, target: "pod-design" }}
                    onEditedImage={(image, meta) => {
                      setResults((prev) => prev.map((r, i) => i === activeIdx ? { ...r, image, seed: meta.seed } : r));
                      setSaveStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setBgStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setOriginalImages((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setEdgeStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setEdgeOriginals((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setEdgeApplied((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setMockupState("idle"); setMockups([]); setSavedMockups({});
                    }}
                  />
                </AccordionSection>
              </div>
            </div>
          );
        })() : null}
      </div>

      {/* ── Preview (LEFT column) ──────────────────────────────── */}
      <div className="build-panel" style={{ gridColumn: 1, gridRow: 1, padding: 14 }}>
        <label style={{ fontSize: 13 }}>
          Prompt（自動組裝，可直接改）
          <textarea className="btn-secondary" style={{ width: "100%", marginTop: 4, minHeight: 72, fontFamily: "inherit" }} value={effectivePrompt}
            onChange={(e) => { const v = e.target.value; setPrompt(v); setPromptTouched(v.trim().length > 0); }} />
        </label>
        {promptTouched ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setPromptTouched(false); setPrompt(""); }}>回到自動組裝</button>
            <span style={{ fontSize: 12, opacity: 0.6 }}>手動編輯中 — 左側欄位暫不影響 prompt</span>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          {results.length === 0 && <p style={{ opacity: 0.6 }}>填好左側欄位後按「生成」。</p>}

          {/* Multi-model card strip */}
          {isMultiModel && results.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {results.map((r, i) => {
                const opt = STUDIO_MODEL_OPTIONS.find((o) => o.value === r.model);
                const isActive = i === activeIdx;
                return (
                  <div
                    key={r.model}
                    onClick={() => !r.busy && setActiveIdx(i)}
                    style={{
                      width: 140, cursor: r.busy ? "default" : "pointer",
                      border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 8, overflow: "hidden", transition: "border-color 0.15s",
                      opacity: r.busy ? 0.6 : 1,
                    }}
                  >
                    {r.busy ? (
                      <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-tertiary)", fontSize: 11, opacity: 0.5 }}>生成中…</div>
                    ) : r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt={r.model} style={{ width: "100%", height: 140, objectFit: "cover", display: "block", background: "#fff" }} />
                    ) : (
                      <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-tertiary)", fontSize: 10, color: "var(--red)", padding: 4, textAlign: "center" }}>{r.error ?? "失敗"}</div>
                    )}
                    <div style={{ padding: "4px 6px", fontSize: 10, background: "var(--bg-secondary)" }}>
                      <span style={{ opacity: 0.8 }}>{opt?.label ?? r.model}</span>
                      <span style={{ opacity: 0.5, marginLeft: 4 }}>NT${opt?.costNt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active result detail */}
          {activeResult && !activeResult.busy && activeResult.image ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, alignItems: "flex-start", width: "100%" }}>
              {/* Left: canvas */}
              <div style={{ width: "100%", minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeResult.image} alt="generated design" title="點擊放大"
                onClick={() => setZoomImage(activeResult.image)}
                style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%", minWidth: 0, objectFit: "contain", borderRadius: 8, background: "#fff", cursor: "zoom-in" }} />
              <div style={{ textAlign: "center", fontSize: 11, opacity: 0.5, marginTop: 4 }}>🔍 點圖可放大檢視</div>
              </div>

              {/* Right: operations panel */}
              <div style={{ display: "none" }}>
              {/* Action bar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 0, alignItems: "stretch" }}>
                {(() => {
                  const m = activeResult.model;
                  const img = activeResult.image!;
                  const saveState = saveStates[m] ?? "idle";
                  const bgState = bgStates[m] ?? "idle";
                  const origImg = originalImages[m];
                  return (
                    <>
                      <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveToDesigns(m, img)}>
                        {saveState === "saved" ? "已存入 My Designs ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
                      </button>
                      <button className="btn-secondary" disabled={bgState === "removing" || bgState === "done"} onClick={() => void removeBg(m, img)}>
                        {bgState === "done" ? "已去背 ✓" : bgState === "removing" ? "去背中…" : "去背（透明 PNG）"}
                      </button>
                      {bgState === "done" && origImg && (
                        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => restoreOriginal(m)}>還原原圖</button>
                      )}
                      {bgState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>去背失敗</span>}
                      {bgState === "done" && productType === "tshirt" && (
                        <button className="btn-secondary" disabled={mockupState === "generating" || mockupState === "done"} onClick={() => void generateMockupFromDesign(img)}>
                          {mockupState === "done" ? "產品預覽 ✓" : mockupState === "generating" ? "生成 Mockup…" : "產品 Mockup"}
                        </button>
                      )}
                      {mockupState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>Mockup 失敗</span>}
                      <button className="btn-secondary" onClick={() => downloadImage(img, m)}>PNG下載</button>
                      <button className="btn-secondary" onClick={() => downloadImageWebP(img, m)}>WebP下載</button>
                      {activeResult.seed != null && <span style={{ fontSize: 12, opacity: 0.6 }}>seed {activeResult.seed}</span>}
                      {saveState === "saved" && !onDoor && <a href="/tools/designs" style={{ fontSize: 12 }}>查看 My Designs →</a>}
                      {saveState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>儲存失敗</span>}
                    </>
                  );
                })()}
              </div>

              {/* ✨ 邊緣風格 — 套上有機邊 → 透明 PNG（後續存圖 / 建商品 / 印刷都用這版） */}
              {(() => {
                const m = activeResult.model;
                const est = edgeStates[m] ?? "idle";
                const applied = edgeApplied[m];
                // Asset (real brush) masks are fixed images — the strength slider has no effect on them.
                return (
                  <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>✨ 邊緣風格</span>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>有機邊 → 透明 PNG（深色衣服也印得出來）</span>
                      {est === "applying" && <span style={{ fontSize: 11, opacity: 0.6 }}>套用中…</span>}
                      {est === "error" && <span style={{ fontSize: 11, color: "var(--red)" }}>套用失敗</span>}
                      {applied && (
                        <button className="btn-secondary" style={{ fontSize: 11, marginLeft: "auto" }} onClick={() => restoreEdge(m)}>
                          還原原圖
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {edgePreviews.map((pv) => {
                        const active = applied === pv.id;
                        return (
                          <button
                            key={pv.id}
                            type="button"
                            title={pv.en}
                            disabled={est === "applying"}
                            onClick={() => void applyEdge(m, pv.id)}
                            style={{
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                              width: 60, padding: 4, borderRadius: 8, cursor: "pointer",
                              background: active ? "rgba(99,102,241,0.15)" : "rgba(127,127,127,0.06)",
                              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                              transition: "all 0.15s",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pv.svg} alt={pv.zh} style={{ width: 40, height: 40, background: "#3a3a3a", borderRadius: 4 }} />
                            <span style={{ fontSize: 10, opacity: 0.8, lineHeight: 1.1, textAlign: "center" }}>{pv.zh}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>邊緣強度</span>
                      <input
                        type="range" min={10} max={90} step={1} value={edgeAmount}
                        onChange={(e) => setEdgeAmount(Number(e.target.value))}
                        onPointerUp={() => { if (applied) void applyEdge(m, applied); }}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, opacity: 0.6, width: 30, textAlign: "right" }}>{edgeAmount}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Mockups */}
              {mockups.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, marginBottom: 6, opacity: 0.7 }}>產品預覽（Printful · 設計 100% 忠實）</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {mockups.map((m) => {
                      const st = savedMockups[m.url];
                      return (
                        <div key={m.url} style={{ width: 180 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt={m.label} style={{ width: 180, height: 180, objectFit: "contain", background: "#111", borderRadius: 8, border: "1px solid var(--border)" }} />
                          <div style={{ fontSize: 11, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                            {m.lifestyle ? <span>🧍</span> : <span>👕</span>}
                            <span style={{ opacity: 0.8 }}>{m.label}</span>
                          </div>
                          <button className="btn-secondary" style={{ fontSize: 11, marginTop: 3, width: "100%" }} disabled={st === "saving" || st === "saved"} onClick={() => void saveMockupToDesigns(m)}>
                            {st === "saved" ? "已存 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "重試" : "存到我的設計"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI edit panel + quick edit */}
              <div style={{ marginTop: 14 }}>
                {canvasHref && <button
                  className="btn-secondary"
                  style={{ width: "100%", marginBottom: 6 }}
                  onClick={() => openInCanvas(activeResult.image, buildSemanticBase({ ...fileMeta, track: "編輯" }), canvasHref)}
                >
                  ✏️ 快速編輯
                </button>}
                <AccordionSection title="✏️ AI image prompt（修圖）" defaultOpen={false}>
                  <ImageEditPromptPanel
                    sourceImage={activeResult.image}
                    currentPrompt={effectivePrompt}
                    imageModel={activeResult.model}
                    target="pod-design"
                    aspectRatio={aspect}
                    title=""
                    styleAnchor={{ model: activeResult.model, mode: refImages.length > 0 ? "image" : "text", stylePrompt: resolvedStylePrompt || effectivePrompt, subject: subject.trim(), refs: refImages.length, target: "pod-design" }}
                    onEditedImage={(image, meta) => {
                      setResults((prev) => prev.map((r, i) => i === activeIdx ? { ...r, image, seed: meta.seed } : r));
                      setSaveStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setBgStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setOriginalImages((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setEdgeStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setEdgeOriginals((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setEdgeApplied((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setMockupState("idle"); setMockups([]); setSavedMockups({});
                    }}
                  />
                </AccordionSection>
              </div>
              </div>
            </div>
          ) : activeResult && !activeResult.busy && activeResult.error ? (
            <p style={{ color: "var(--red)" }}>{activeResult.error}</p>
          ) : activeResult?.busy ? (
            <p style={{ opacity: 0.7 }}>生成中（依模型 5–60 秒）…</p>
          ) : null}

          {/* Single-model error (no results yet) */}
          {!isMultiModel && results.length === 1 && results[0].error && !results[0].busy && !anyResults && (
            <p style={{ color: "var(--red)" }}>{results[0].error}</p>
          )}
        </div>
      </div>

      {eventBrowserOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setEventBrowserOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483645,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            className="build-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100vw)",
              height: "100vh",
              overflowY: "auto",
              padding: 16,
              borderRadius: 0,
              borderTop: 0,
              borderRight: 0,
              borderBottom: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🗓️ 活動靈感</div>
              <div style={{ fontSize: 12, opacity: 0.55 }}>{visibleUpcomingEvents.length} 筆 · 每月更新快取</div>
              <button type="button" onClick={() => setEventBrowserOpen(false)} style={{ ...ghostBtn(), marginLeft: "auto" }}>關閉</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 12 }}>
              <select className="btn-secondary" value={eventCatFilter} onChange={(e) => setEventCatFilter(e.target.value)} style={{ fontSize: 12 }}>
                {EVENT_CAT_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
              </select>
              <select className="btn-secondary" value={eventCountryFilter} onChange={(e) => setEventCountryFilter(e.target.value)} style={{ fontSize: 12 }}>
                <option value={EVENT_ALL_COUNTRIES_FILTER.value}>{EVENT_ALL_COUNTRIES_FILTER.label}</option>
                {EVENT_COUNTRY_FILTER_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <select className="btn-secondary" value={eventWindowDays} onChange={(e) => setEventWindowDays(Number(e.target.value))} style={{ fontSize: 12 }}>
                {EVENT_WINDOWS.map((window_) => <option key={window_.value} value={window_.value}>{window_.label}</option>)}
              </select>
              <select className="btn-secondary" value={eventSort} onChange={(e) => setEventSort(e.target.value as "opportunity" | "date")} style={{ fontSize: 12 }}>
                {EVENT_SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
              </select>
            </div>
            {eventsFetching ? (
              <p style={{ fontSize: 12, opacity: 0.6 }}>載入中…</p>
            ) : groupedUpcomingEvents.length === 0 ? (
              <p style={{ fontSize: 12, opacity: 0.6 }}>此篩選暫無活動。</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {groupedUpcomingEvents.map(([group, events]) => (
                  <section key={group}>
                    <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.65, marginBottom: 6 }}>{group}</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {events.map((event) => {
                        const label = buildEventLabel(event);
                        const active = subject === label;
                        const daysUntil = Math.ceil((new Date(event.event_date).getTime() - Date.now()) / 86400000);
                        const countries = eventCountryLabel(event);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => {
                              setSubject(active ? "" : label);
                              setEventBrowserOpen(false);
                            }}
                            style={{
                              textAlign: "left",
                              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                              background: active ? "rgba(99,102,241,0.12)" : "rgba(127,127,127,0.04)",
                              color: "var(--text-primary)",
                              borderRadius: 8,
                              padding: "9px 10px",
                              cursor: "pointer",
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: 8,
                            }}
                          >
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>
                                {active ? "✓ " : ""}{label}
                              </span>
                              <span style={{ display: "block", fontSize: 11, opacity: 0.58, marginTop: 2 }}>
                                {(event.facets ?? [event.category]).join(", ")}{countries ? ` · ${countries}` : ""}
                              </span>
                            </span>
                            <span style={{ textAlign: "right", fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>
                              <span style={{ display: "block", fontWeight: 700 }}>{event.event_date}</span>
                              <span>{daysUntil >= 0 ? `${daysUntil}天` : "進行中"}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chip hover tooltip — position:FIXED at the viewport coords captured on hover,
          rendered at the grid root so it escapes the sticky control panel's overflow
          clipping. Hard-coded colors keep it readable in any theme; x is clamped so
          edge chips don't push it off-screen (same pattern as TarotStudio). */}
      {tip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(tip.x, 8), (typeof window !== "undefined" ? window.innerWidth : 1920) - 8),
            top: tip.y - 6,
            transform: "translate(-50%, -100%)",
            background: "#0d1526",
            color: "#ffffff",
            border: "1px solid #6366f1",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            textAlign: "center",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            pointerEvents: "none",
            zIndex: 2147483647,
          }}
        >
          {tip.text}
        </div>
      )}

      {/* 🔍 Lightbox — click the generated image to view it full-screen. Click anywhere to close. */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 2147483646,
            background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center",
            justifyContent: "center", padding: 24, cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomImage} alt="放大檢視"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }} />
          <button type="button" onClick={() => setZoomImage(null)}
            style={{ position: "fixed", top: 16, right: 20, fontSize: 22, lineHeight: 1, color: "#fff", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, width: 40, height: 40, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
