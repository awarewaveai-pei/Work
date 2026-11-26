// The banner design: its State, the blank design, sizes (C5 multi-size, C11 multi-select), templates, the AI design
// sanitizer and the colour helpers. Moved from BannerStudio.tsx (R2-B1); no React here.
import type { ComponentType } from "react";
import {
  DEFAULT_CTA_SHADOW, DEFAULT_TEXT_SHADOW, loadImage,
  type ElemPositions, type ShadowSpec,
} from "./banner-layers";
import { applySemantic, dropPositions, semanticElems } from "./banner-layout";
import type { GroundingOpts } from "./product-grounding";
import type { BannerAiModel } from "./banner-design";
import { bgStatsFromColors, bgStatsFromPixels, mergeBgInfo, type BgInfo } from "./design-colors";
import type { StudioModel, AspectRatio } from "@/lib/studio/model-options";
import { resolveStylePrompt } from "../tarot/cards";

// ---------------------------------------------------------------------------
// Size presets & constants
// ---------------------------------------------------------------------------

// One button per ratio; `where` lists every platform that takes it (checked 2026-11 against Sprout Social / Buffer /
// Metricool guides). 2:1: X documents its large-image link card as 2:1
// (https://dev.twitter.com/cards/types/summary-large-image, min 300x157); no other platform found documenting 2:1.
// `aspect` = nearest ratio the AI background models accept (lib/studio/model-options).
export const PRESETS = {
  "r9x16":  { ratio: "9:16",   w: 1080, h: 1920, aspect: "9:16", shape: "tall",   use: "限時動態、Reels、直式圖片貼文",   where: "IG Story／Reels、FB Story、TikTok 圖文、YouTube Shorts" },
  "r2x3":   { ratio: "2:3",    w: 1000, h: 1500, aspect: "2:3",  shape: "tall",   use: "Pin 圖",                          where: "Pinterest" },
  "r3x4":   { ratio: "3:4",    w: 1080, h: 1440, aspect: "3:4",  shape: "tall",   use: "個人頁格狀不裁切的直式貼文",      where: "IG" },
  "r4x5":   { ratio: "4:5",    w: 1080, h: 1350, aspect: "4:5",  shape: "tall",   use: "直式貼文、多圖貼文",              where: "IG、FB、Threads、X、LinkedIn、Bluesky", star: true },
  "r1x1":   { ratio: "1:1",    w: 1080, h: 1080, aspect: "1:1",  shape: "square", use: "方形貼文、商品圖、手機版 Hero",    where: "IG、FB、Threads、X、LinkedIn、Bluesky、WooCommerce" },
  "r4x3":   { ratio: "4:3",    w: 1200, h: 900,  aspect: "4:3",  shape: "wide",   use: "部落格封面（特色圖片）",          where: "WP 部落格列表卡片；文章頁由佈景主題裁成 3:2" },
  "r3x2":   { ratio: "3:2",    w: 1200, h: 800,  aspect: "3:2",  shape: "wide",   use: "部落格內文圖",                    where: "WP 文章內文" },
  "r16x9":  { ratio: "16:9",   w: 1920, h: 1080, aspect: "16:9", shape: "wide",   use: "橫式貼文、影片縮圖、網站全版 Hero", where: "IG、FB、Threads、X、LinkedIn、Bluesky、YouTube 縮圖、WP 網站" },
  "r191x1": { ratio: "1.91:1", w: 1200, h: 630,  aspect: "16:9", shape: "wide",   use: "連結分享預覽（OG）",              where: "FB／LinkedIn／X／LINE 連結預覽（Rank Math 另設的分享圖）" },
  "r2x1":   { ratio: "2:1",    w: 1200, h: 600,  aspect: "16:9", shape: "wide",   use: "X 大圖連結卡",                    where: "X 連結預覽（summary_large_image）" },
  "r3x1":   { ratio: "3:1",    w: 1920, h: 640,  aspect: "16:9", shape: "wide",   use: "網站橫幅",                        where: "WP 網站桌機 Hero" },
} as const satisfies Record<string, { ratio: string; w: number; h: number; aspect: AspectRatio; shape: "tall" | "square" | "wide"; use: string; where: string; star?: boolean }>;
export type PresetKey = keyof typeof PRESETS;
export const presetLabel = (k: PresetKey) => `${PRESETS[k].ratio} ${PRESETS[k].use}`;

export const PRESET_GROUPS: { key: "tall" | "square" | "wide"; label: string }[] = [
  { key: "tall",   label: "直式" },
  { key: "square", label: "方形" },
  { key: "wide",   label: "橫式" },
];

// Self-hosted, all SIL OFL (public/banner-fonts, scripts/fetch-banner-fonts.mjs). English display faces fall back to
// 黑體 / 明體 for Chinese characters. Index order is used by FONT_PAIRS and INIT.
export const FONTS = [
  { value: "'Noto Sans TC', 'PingFang TC', sans-serif",         label: "黑體" },
  { value: "'Noto Serif TC', 'Songti TC', serif",                label: "明體" },
  { value: "'LXGW WenKai TC', cursive",                          label: "楷書（霞鶩文楷）" },
  { value: "'Huninn', 'jf-openhuninn', sans-serif",              label: "圓體（粉圓）" },
  { value: "'Inter', 'Helvetica Neue', sans-serif",              label: "Inter" },
  { value: "'Montserrat', 'Noto Sans TC', sans-serif",           label: "Montserrat" },
  { value: "'Playfair Display', 'Noto Serif TC', serif",         label: "Playfair Display" },
  { value: "'Oswald', 'Noto Sans TC', sans-serif",               label: "Oswald" },
  { value: "'Bebas Neue', 'Noto Sans TC', sans-serif",           label: "Bebas Neue" },
];
export const WEIGHTS: { value: number; label: string }[] = [
  { value: 300, label: "細" }, { value: 400, label: "常規" }, { value: 500, label: "中" }, { value: 700, label: "粗" }, { value: 900, label: "特粗" },
];
export const BANNER_FONTS_CSS = "/banner-fonts/fonts.css";

// Curated headline × body pairings (Tier 2 — instant "designed" hierarchy)
export const FONT_PAIRS: { label: string; headline: string; body: string }[] = [
  { label: "明體標 × 黑體文", headline: FONTS[1].value, body: FONTS[0].value },
  { label: "黑體 × 黑體",     headline: FONTS[0].value, body: FONTS[0].value },
  { label: "楷書標 × 黑體文", headline: FONTS[2].value, body: FONTS[0].value },
  { label: "圓體 × 圓體",     headline: FONTS[3].value, body: FONTS[3].value },
  { label: "Inter 標 × 黑體文", headline: FONTS[4].value, body: FONTS[0].value },
  { label: "明體 × 明體",     headline: FONTS[1].value, body: FONTS[1].value },
  { label: "Playfair 標 × 黑體文", headline: FONTS[6].value, body: FONTS[0].value },
  { label: "Bebas 標 × 黑體文", headline: FONTS[8].value, body: FONTS[0].value },
  { label: "Montserrat × 黑體", headline: FONTS[5].value, body: FONTS[0].value },
];

export const COPY_TONES = ["促銷", "品牌形象", "活動", "教育"] as const;
export type CopyTone = typeof COPY_TONES[number];
export type BgMode   = "color" | "gradient" | "upload" | "ai";
export type TextPos  = "top" | "center" | "bottom";
export type ProductPos = "center" | "left" | "right" | "bottom-right";

// ── Marketing / conversion element types ──
export type BadgeStyle = "ribbon" | "pill" | "burst";
export type BadgePos   = "tl" | "tr";
export type LogoPos    = "bl" | "br" | "tl" | "tr";
export type TrustType  = "none" | "stars" | "reviews" | "guarantee";
export type TextAlignH = "left" | "center" | "right";

export interface CopyVariant { headline: string; subtext: string }

export interface State {
  preset:       PresetKey;
  // copy generation
  copyBrief:    string;
  copyTone:     CopyTone;
  copyGenerating: boolean;
  copyVariants: CopyVariant[];
  copyStream:   string;
  // product image
  productOrig:     string | null;
  productImage:    string | null;
  productRemoving: boolean;
  productPos:      ProductPos;
  productScale:    number;
  // background
  bgMode:    BgMode;
  bgColor:   string;
  gradFrom:  string;
  gradTo:    string;
  gradAngle: string;
  bgImage:   string | null;
  bgImageHasProduct: boolean;   // true 當 bgImage 已由 AI 把產品合成進去（決定是否略過事後疊加）
  generating: boolean;
  designing: boolean;   // AI 一鍵設計整張進行中
  // AI bg blocks
  aiBgSubject:       string;
  aiBgVibe:          string;
  aiBgLighting:      string;   // 打光/構圖方向（與 subject/vibe 正交）
  aiBgStyle:         string;
  aiBgModel:         StudioModel;
  aiBgRefImage:      string | null;
  aiBgRefMode:       "none" | "ref";
  aiBgPromptOvr:     string;
  aiBgPromptTouched: boolean;
  aiBgModelGroup:    string;
  aiBgCompositeProduct: boolean;   // 把產品圖合成進 AI 場景（非事後疊加）
  // text
  headline:  string;
  subtext:   string;
  textColor: string;
  fontFamily:   string;   // body font (subtext / price / cta / trust)
  headlineFont: string;   // 標題字體（可與內文不同 → 層級感）
  accentColor:  string;   // 重點字（**字**）顏色
  accentHighlight: boolean; // 重點字加螢光底色塊
  letterSpacing: number;  // 標題字距 px
  headlineSize: number;
  subtextSize:  number;
  typeAuto:     boolean;  // R2-A: title / subtitle sized by the layout engine; a moved px slider turns it off
  textPos:   TextPos;
  textAlignH: TextAlignH;
  dimOverlay: boolean;
  textScrim:  boolean;   // 局部底襯（文字後方半透明圓角板）— 比整張暗化更高級
  textOutline: boolean;  // 標題描邊 + 陰影（匯出時保留，修舊版 export 掉陰影）
  brandBar:   boolean;   // card R3: a bar in the accent (brand) colour beside a left-aligned stack (影片片頭 版型)
  balanceTitle: boolean; // card R3: a wrapped title's lines made even (no one-character last line) -- 影片片頭 版型
  // marketing / conversion elements
  ctaText:      string;  // "" = 無按鈕
  ctaBg:        string;
  ctaTextColor: string;
  badgeText:    string;  // "" = 無徽章
  badgeStyle:   BadgeStyle;
  badgeColor:   string;
  badgePos:     BadgePos;
  showPrice:    boolean;
  priceNow:     string;
  priceWas:     string;
  trustType:    TrustType;
  trustStars:   number;  // 0-5
  trustText:    string;  // 評論數 / 保固說明
  // export controls
  badgeScale:          number;
  textScrimOpacity:    number;
  dimOverlayOpacity:   number;
  // background picture placement (dragged / wheel-zoomed on the preview): scale x "cover", centre offset / canvas size
  bgImgScale: number;
  bgImgX:     number;
  bgImgY:     number;
  // shadows (blur / offsets in shares of the element's height); badgeShadow null = the badge style's own default
  textShadow:  ShadowSpec;
  ctaShadow:   ShadowSpec;
  badgeShadow: ShadowSpec | null;
  // C3 typography
  headlineWeight:     number;   // 300 細 / 400 常規 / 500 中 / 700 粗 / 900 特粗
  bodyWeight:         number;
  headlineLineHeight: number;   // x font size
  bodyLineHeight:     number;
  bodyLetterSpacing:  number;   // px (letterSpacing = the title's)
  kinsoku:            boolean;  // 避頭尾
  cjkSpacing:         boolean;  // 中英間距
  positions:          ElemPositions; // C4: elements dragged on the preview (box centre / canvas); {} = automatic layout
  // C5 multi-size: the sizes made together, each size's own tweaks (only the SIZE_KEYS fields), and the size being tweaked
  // now (`main` = the main design's size fields and preset, put back when the tweak ends)
  multiSizes:    PresetKey[];
  sizeOverrides: Partial<Record<PresetKey, SizePatch>>;
  editingSize:   { key: PresetKey; main: SizePatch & { preset: PresetKey } } | null;
  // C8: product grounding (C7 module) and the brand logo (C6 kit; a same-origin data URL so exports stay untainted)
  grounding: GroundingOpts;
  logoImage: string | null;
  logoScale: number;
  logoPos:   LogoPos;
  // export
  saving:    boolean;
  saved:     boolean;
  error:     string | null;
}

/** The blank design (exported for the size-selection tests). */
export const INIT: State = {
  preset:       "r4x5",
  copyBrief:    "",
  copyTone:     "促銷",
  copyGenerating: false,
  copyVariants: [],
  copyStream:   "",
  productOrig:     null,
  productImage:    null,
  productRemoving: false,
  productPos:      "center",
  productScale:    0.6,
  bgMode:    "color",
  bgColor:   "#1a1a2e",
  gradFrom:  "#667eea",
  gradTo:    "#764ba2",
  gradAngle: "135deg",
  bgImage:   null,
  bgImageHasProduct: false,
  generating: false,
  designing: false,
  aiBgSubject:       "",
  aiBgVibe:          "",
  aiBgLighting:      "",
  aiBgStyle:         "",
  aiBgModel:         "flux-dev",
  aiBgRefImage:      null,
  aiBgRefMode:       "none",
  aiBgPromptOvr:     "",
  aiBgPromptTouched: false,
  aiBgModelGroup:    "BFL",
  aiBgCompositeProduct: false,
  headline:  "",
  subtext:   "",
  textColor: "#ffffff",
  fontFamily: FONTS[0].value,
  headlineFont: FONTS[1].value,
  accentColor: "#fbbf24",
  accentHighlight: false,
  letterSpacing: 0,
  headlineSize: 64,
  subtextSize:  32,
  typeAuto:     true,
  textPos:   "center",
  textAlignH: "center",
  dimOverlay: true,
  textScrim:  false,
  textOutline: true,
  brandBar:   false,
  balanceTitle: false,
  ctaText:      "",
  ctaBg:        "#ff5a5f",
  ctaTextColor: "#ffffff",
  badgeText:    "",
  badgeStyle:   "ribbon",
  badgeColor:   "#e11d48",
  badgePos:     "tr",
  showPrice:    false,
  priceNow:     "",
  priceWas:     "",
  trustType:    "none",
  trustStars:   5,
  trustText:    "",
  badgeScale:          1.0,
  textScrimOpacity:    0.5,
  dimOverlayOpacity:   0.45,
  bgImgScale: 1,
  bgImgX:     0,
  bgImgY:     0,
  textShadow:  DEFAULT_TEXT_SHADOW,
  ctaShadow:   DEFAULT_CTA_SHADOW,
  badgeShadow: null,
  headlineWeight:     700,
  bodyWeight:         400,
  headlineLineHeight: 1.16,
  bodyLineHeight:     1.32,
  bodyLetterSpacing:  0,
  kinsoku:            true,
  cjkSpacing:         true,
  positions:          {},
  multiSizes:    [],
  sizeOverrides: {},
  editingSize:   null,
  grounding: {
    shadow:     { enabled: false, opacity: 0.5, softness: 0.35, distance: 0 },
    reflection: { enabled: false, height: 0.35, fade: 0.3, gap: 0 },
    tone:       { enabled: false, strength: 0.4 },
  },
  logoImage: null,
  logoScale: 0.16,
  logoPos:   "bl",
  saving:    false,
  saved:     false,
  error:     null,
};

// ---------------------------------------------------------------------------
// C5 multi-size. A size of the design = the main design at that size: positions are shares of the canvas (kept inside by
// the renderer), type scales with the shorter side, then that size's own tweaks. Tweaking a size = editing it as the
// design (s.preset = that size) with the main design's size fields parked in editingSize.main; leaving stores only what
// differs from the derived size.
// ---------------------------------------------------------------------------

/** The fields a size may set for itself; everything else (words, colours, images, fonts…) is shared by all sizes. */
export const SIZE_KEYS = [
  "positions", "headlineSize", "subtextSize", "typeAuto", "letterSpacing", "bodyLetterSpacing", "productScale", "productPos",
  "badgeScale", "textPos", "textAlignH", "badgePos", "logoPos", "bgImgScale", "bgImgX", "bgImgY", "logoScale",
] as const;
export type SizePatch = Partial<Pick<State, (typeof SIZE_KEYS)[number]>>;
export const pickSize = (st: State): SizePatch => Object.fromEntries(SIZE_KEYS.map((k) => [k, st[k]])) as SizePatch;

/** The main design (outside a size tweak). */
export function mainOf(st: State): State {
  return st.editingSize ? { ...st, ...st.editingSize.main, editingSize: null } : st;
}
/** Size `k` of the design (the live state itself while `k` is being tweaked). */
export function variantOf(st: State, k: PresetKey, withTweaks = true): State {
  if (withTweaks && st.editingSize?.key === k) return st;
  const m = mainOf(st);
  const a = PRESETS[m.preset], b = PRESETS[k];
  const f = Math.min(b.w, b.h) / Math.min(a.w, a.h);
  const r = (v: number) => Math.round(v * f);
  return {
    ...m, preset: k, editingSize: null,
    headlineSize: r(m.headlineSize), subtextSize: r(m.subtextSize), letterSpacing: r(m.letterSpacing), bodyLetterSpacing: r(m.bodyLetterSpacing),
    ...(withTweaks ? m.sizeOverrides[k] : {}),
  };
}
/** End a size tweak: store what differs from the derived size, put the main design's size fields back. */
export function leaveSize(st: State): State {
  if (!st.editingSize) return st;
  const { key, main } = st.editingSize;
  const back: State = { ...st, ...main, editingSize: null };
  const base = variantOf(back, key, false);
  const patch = Object.fromEntries(SIZE_KEYS.filter((f) => JSON.stringify(st[f]) !== JSON.stringify(base[f])).map((f) => [f, st[f]])) as SizePatch;
  return { ...back, sizeOverrides: { ...st.sizeOverrides, [key]: patch } };
}
/** Drop size `k`'s tweaks; while `k` is being tweaked, its unsaved edits go too (it reopens as derived). */
export function clearSizeTweak(st: State, k: PresetKey): State {
  const sizeOverrides = { ...st.sizeOverrides };
  delete sizeOverrides[k];
  if (st.editingSize?.key !== k) return { ...st, sizeOverrides };
  const back: State = { ...st, ...st.editingSize.main, editingSize: null, sizeOverrides };
  return enterSize(back, k);
}
// ── C11: the 尺寸 buttons are a multi-select. Picked = the main size (preset) + multiSizes; the one being edited is the main
// size or the size being tweaked (editingSize). Same data as before, so a saved / undone state with multiSizes loads as is.
export const SIZE_ORDER = Object.keys(PRESETS) as PresetKey[];
/** The picked sizes in button order (the main size always among them). */
export function selectedSizes(st: State): PresetKey[] {
  const main = mainOf(st).preset;
  return SIZE_ORDER.filter((k) => k === main || st.multiSizes.includes(k));
}
/** The size shown and edited now. */
export const editingSizeOf = (st: State): PresetKey => st.editingSize?.key ?? st.preset;
/** Make picked size `k` the main one (the old main size was dropped): the design as it looked at `k` becomes the main design. */
export function promoteMain(st: State, k: PresetKey, dropped: PresetKey): State {
  const m = leaveSize(st);
  const v = variantOf(m, k);
  const sizeOverrides = { ...m.sizeOverrides };
  delete sizeOverrides[k];
  return { ...v, preset: k, editingSize: null, sizeOverrides, multiSizes: m.multiSizes.filter((x) => x !== k && x !== dropped) };
}
/** Press a size button: not picked -> picked; picked -> dropped (the last one stays). Dropping the size being edited moves
 *  editing to the first size left. */
export function toggleSizePick(st: State, k: PresetKey): State {
  const picked = selectedSizes(st);
  if (!picked.includes(k)) {
    const m = mainOf(st);
    return { ...st, multiSizes: SIZE_ORDER.filter((x) => x !== m.preset && (x === k || st.multiSizes.includes(x))) };
  }
  if (picked.length === 1) return st;
  const editing = editingSizeOf(st);
  const main = mainOf(st).preset;
  const left = picked.filter((x) => x !== k);
  let next: State;
  if (k === main) next = promoteMain(st, editing !== k ? editing : left[0], k);
  else next = { ...leaveSize(st), multiSizes: st.multiSizes.filter((x) => x !== k) };
  // keep editing what was edited; if that was the dropped size, the first size left
  const target = editing === k ? left[0] : editing;
  return editingSizeOf(next) === target ? next : enterSize(next, target);
}

/** Start tweaking size `k` (the main size = just leave any tweak). */
export function enterSize(st: State, k: PresetKey): State {
  const m = leaveSize(st);
  if (k === m.preset) return m;
  return { ...variantOf(m, k), editingSize: { key: k, main: { preset: m.preset, ...pickSize(m) } } };
}

// ---------------------------------------------------------------------------
// Layout templates — pre-composed conversion arrangements (eye-flow tested).
// Each patch sets LAYOUT + STYLE + which elements are on; never touches the
// user's content (headline/subtext/product/bg). Applied via merge into State.
// ---------------------------------------------------------------------------

export const TEMPLATES: { key: string; label: string; icon: string; patch: Partial<State>; group?: "opener"; fit?: number }[] = [
  {
    key: "sale-blast", label: "促銷爆款", icon: "🔥",
    patch: {
      textPos: "center", textAlignH: "left", productPos: "right",
      textColor: "#ffffff", textScrim: true, textOutline: true, dimOverlay: false,
      ctaText: "立即選購", ctaBg: "#ff5a5f", ctaTextColor: "#ffffff",
      badgeText: "限時優惠", badgeStyle: "burst", badgeColor: "#e11d48", badgePos: "tr",
      showPrice: true, trustType: "stars", trustStars: 5,
    },
  },
  {
    key: "luxury-min", label: "極簡精品", icon: "🤍",
    patch: {
      textPos: "center", textAlignH: "center", productPos: "center",
      textColor: "#ffffff", textScrim: false, textOutline: false, dimOverlay: true,
      ctaText: "了解更多", ctaBg: "#ffffff", ctaTextColor: "#111111",
      badgeText: "", showPrice: false, trustType: "none",
    },
  },
  {
    key: "urgency", label: "限時搶購", icon: "⏰",
    patch: {
      textPos: "bottom", textAlignH: "center", productPos: "center",
      textColor: "#ffffff", textScrim: true, textOutline: true, dimOverlay: false,
      ctaText: "馬上搶購", ctaBg: "#f59e0b", ctaTextColor: "#111111",
      badgeText: "限時優惠", badgeStyle: "ribbon", badgeColor: "#dc2626", badgePos: "tl",
      showPrice: true, trustType: "reviews",
    },
  },
  {
    key: "festive-gift", label: "節慶禮物", icon: "🎁",
    patch: {
      textPos: "center", textAlignH: "center", productPos: "left",
      textColor: "#fff7ed", textScrim: true, textOutline: true, dimOverlay: false,
      ctaText: "選購禮物", ctaBg: "#be123c", ctaTextColor: "#ffffff",
      badgeText: "母親節限定", badgeStyle: "pill", badgeColor: "#be123c", badgePos: "tr",
      showPrice: false, trustType: "none",
    },
  },
  {
    key: "brand-hero", label: "形象主視覺", icon: "✦",
    patch: {
      textPos: "center", textAlignH: "center", productPos: "center",
      textColor: "#ffffff", textScrim: false, textOutline: true, dimOverlay: true,
      ctaText: "探索系列", ctaBg: "#111827", ctaTextColor: "#ffffff",
      badgeText: "", showPrice: false, trustType: "none",
    },
  },
  {
    key: "social-promo", label: "社群貼文", icon: "📱",
    patch: {
      textPos: "bottom", textAlignH: "left", productPos: "right",
      textColor: "#ffffff", textScrim: true, textOutline: true, dimOverlay: false,
      ctaText: "點我下單", ctaBg: "#6366f1", ctaTextColor: "#ffffff",
      badgeText: "熱賣中", badgeStyle: "pill", badgeColor: "#6366f1", badgePos: "tl",
      showPrice: true, trustType: "stars", trustStars: 5,
    },
  },
  // Card R3: 影片片頭 -- a card a video opens with (the editor's 「開橫幅工具做一張」 preselects one; the video zooms into it).
  // Words only, centred in the frame's safe area (the stack sits between the top and bottom thirds' UI on 9:16); no price,
  // no button, no badge. Colours stay the user's (text / accent = brand colour), so these name none. fit = the title's
  // size as a share of the card's width -- at least 9% of the width on 9:16 and 4:5 (legible on a phone), at most 15% of the
  // height on a wide card -- and a wrapped title has even lines.
  {
    key: "opener-center", label: "片頭：大標題置中", icon: "🎬", group: "opener", fit: 0.1,
    patch: {
      textPos: "center", textAlignH: "center",
      textScrim: false, textOutline: true, dimOverlay: true, brandBar: false,
      ctaText: "", badgeText: "", showPrice: false, trustType: "none",
    },
  },
  {
    key: "opener-title-sub", label: "片頭：標題＋副標", icon: "🎞", group: "opener", fit: 0.1,
    patch: {
      textPos: "center", textAlignH: "center",
      textScrim: true, textOutline: true, dimOverlay: false, brandBar: false,
      ctaText: "", badgeText: "", showPrice: false, trustType: "none",
    },
  },
  {
    key: "opener-left-bar", label: "片頭：左對齊大字＋品牌色條", icon: "▍", group: "opener", fit: 0.1,
    patch: {
      textPos: "center", textAlignH: "left",
      textScrim: false, textOutline: true, dimOverlay: true, brandBar: true,
      ctaText: "", badgeText: "", showPrice: false, trustType: "none",
    },
  },
];
/** Card R3: the video ratios the editor opens this tool with (?ratio=) -> the size of that shape. */
export const RATIO_PRESET: Record<string, PresetKey> = { "16:9": "r16x9", "9:16": "r9x16", "4:5": "r4x5", "1:1": "r1x1" };
/** A template's patch at a size. Any template first undoes what an opener sets (brand bar, even lines, fixed type); an
 *  opener's title (and subtitle) is then sized to that card's width with the automatic type off. */
export function templatePatch(t: (typeof TEMPLATES)[number], preset: PresetKey): Partial<State> {
  const base: Partial<State> = { brandBar: false, balanceTitle: false, typeAuto: true, ...t.patch };
  if (!t.fit) return base;
  const { w, h } = PRESETS[preset], headlineSize = Math.round(Math.min(w * t.fit, h * 0.15));
  return { ...base, balanceTitle: true, typeAuto: false, headlineSize, subtextSize: Math.round(headlineSize * 0.42) };
}

/** Every position button and template goes through here (R2-A applySemantic): the elements the patch moves lose their
 *  drag, so the button always shows. Tweaking a size = only that size's drags go. On the main size, a size tweak that
 *  does not set the field itself inherits the new value, so its drags of those elements go too. */
export function applyLayout(st: State, patch: Partial<State>): State {
  const next = applySemantic(st, patch);
  if (st.editingSize) return next;
  const sizeOverrides = { ...st.sizeOverrides };
  for (const k of Object.keys(sizeOverrides) as PresetKey[]) {
    const o = sizeOverrides[k];
    if (!o?.positions) continue;
    const inherited = Object.fromEntries(Object.keys(patch).filter((f) => !(f in o)).map((f) => [f, true]));
    sizeOverrides[k] = { ...o, positions: dropPositions(o.positions, semanticElems(inherited)) };
  }
  return { ...next, sizeOverrides };
}

export const BG_PLACE_RESET = { bgImgScale: 1, bgImgX: 0, bgImgY: 0 } as const satisfies Partial<State>;

/** An opener on an empty card shows nothing to look at: fill a placeholder title (and subtitle for 標題＋副標) only
 *  where the field is empty -- typed words are never replaced. */
export function openerPlaceholders(key: string, s: Pick<State, "headline" | "subtext">): Partial<State> {
  return {
    ...(s.headline.trim() ? {} : { headline: "片頭標題" }),
    ...(key === "opener-title-sub" && !s.subtext.trim() ? { subtext: "副標題" } : {}),
  };
}

// History signature: excludes transient flags; reduces big image data-URLs to their length
// (so comparing snapshots never stringifies multi-MB base64).
/** C13: nothing about the picture changed yet -- the blank design (the topic / tone typed in 開始 and the sizes picked are
 *  not the picture). Any other change (a background colour, a gradient, words, an image, a template…) shows the preview. */
export function isUntouched(st: State): boolean {
  const notPicture: Partial<State> = { copyBrief: INIT.copyBrief, copyTone: INIT.copyTone, preset: INIT.preset, multiSizes: [], sizeOverrides: {}, editingSize: null };
  return designSig({ ...st, ...notPicture }) === designSig(INIT);
}

/** 清除設計: the blank design, keeping the picked sizes (main size + the others); size tweaks, words, topic, images go. The
 *  client is not in State, so it stays too. Undo brings the design back (it is one history step). */
export function clearDesign(st: State): State {
  const m = mainOf(st);
  return { ...INIT, preset: m.preset, multiSizes: m.multiSizes };
}
/** What the user sees differs: the design, or the copy list (designSig leaves copyVariants out -- history still records
 *  typing by design only). */
export function sameVisible(a: State, b: State): boolean {
  return designSig(a) === designSig(b) && JSON.stringify(a.copyVariants) === JSON.stringify(b.copyVariants);
}
/** 清除設計 does something visible. */
export const canClear = (st: State): boolean => !sameVisible(clearDesign(st), st);

/** Undo history after recording `st` at `idx`: redo steps after `idx` go; a step equal to the current one is skipped --
 *  equal by design, or for a one-click change (清除設計…) by everything visible, so the copy list comes back on undo. */
export const HISTORY_MAX = 25;
export function pushHistory(hist: State[], idx: number, st: State, oneClick = false): { hist: State[]; idx: number } {
  const cur = hist[idx];
  if (cur && (oneClick ? sameVisible(cur, st) : designSig(cur) === designSig(st))) return { hist, idx };
  const next = hist.slice(0, idx + 1);
  next.push(st);
  while (next.length > HISTORY_MAX) next.shift();
  return { hist: next, idx: next.length - 1 };
}

export function designSig(st: State): string {
  // typed → tsc catches any future transient field that's misspelled or forgotten here
  const skip = new Set<keyof State>(["saving", "saved", "error", "generating", "designing", "productRemoving", "copyGenerating", "copyStream", "copyVariants"]);
  const imgKeys = new Set<keyof State>(["bgImage", "productImage", "productOrig", "aiBgRefImage"]);
  const obj: Record<string, unknown> = {};
  for (const k of Object.keys(st) as (keyof State)[]) {
    if (skip.has(k)) continue;
    const v = st[k];
    obj[k] = imgKeys.has(k) ? (typeof v === "string" ? v.length : 0) : v;
  }
  return JSON.stringify(obj);
}

// Validate an AI "full design" JSON into a safe State patch (drop anything malformed/out-of-range).
export function sanitizeDesign(raw: Record<string, unknown>): Partial<State> {
  const out: Partial<State> = {};
  const str  = (v: unknown) => (typeof v === "string" ? v : undefined);
  const hex  = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const enumOf = <T extends string>(v: unknown, allowed: readonly T[]) =>
    (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
  const assign = <K extends keyof State>(k: K, v: State[K] | undefined) => { if (v !== undefined) out[k] = v; };

  assign("headline", str(raw.headline));
  assign("subtext", str(raw.subtext));
  // C12: every colour (text / accent / CTA / badge / background, scrim, outline) is set by resolveDesignColors -- the
  // palette, the picture background and contrast are checked there, not here
  assign("ctaText", str(raw.ctaText));
  assign("badgeText", str(raw.badgeText));
  assign("badgeStyle", enumOf<BadgeStyle>(raw.badgeStyle, ["ribbon", "pill", "burst"]));
  assign("badgePos", enumOf<BadgePos>(raw.badgePos, ["tl", "tr"]));
  assign("showPrice", bool(raw.showPrice));
  assign("priceNow", str(raw.priceNow));
  assign("priceWas", str(raw.priceWas));
  assign("trustType", enumOf<TrustType>(raw.trustType, ["none", "stars", "reviews", "guarantee"]));
  if (typeof raw.trustStars === "number") assign("trustStars", Math.max(1, Math.min(5, Math.round(raw.trustStars))));
  assign("trustText", str(raw.trustText));
  assign("accentHighlight", bool(raw.accentHighlight));
  assign("textPos", enumOf<TextPos>(raw.textPos, ["top", "center", "bottom"]));
  assign("textAlignH", enumOf<TextAlignH>(raw.textAlignH, ["left", "center", "right"]));
  assign("aiBgSubject", str(raw.aiBgSubject));
  assign("aiBgVibe", str(raw.aiBgVibe));
  // shadows: a malformed object is dropped whole. The background picture's placement is never AI-set (the AI never
  // switches the background to a picture).
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
  const shadow = (v: unknown): ShadowSpec | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const o = v as Record<string, unknown>;
    const on = bool(o.on), color = hex(o.color), opacity = num(o.opacity, 0, 1), blur = num(o.blur, 0, 1), x = num(o.x, -0.5, 0.5), y = num(o.y, -0.5, 0.5);
    return on === undefined || !color || opacity === undefined || blur === undefined || x === undefined || y === undefined
      ? undefined : { on, color, opacity, blur, x, y };
  };
  assign("textShadow", shadow(raw.textShadow));
  assign("ctaShadow", shadow(raw.ctaShadow));
  assign("badgeShadow", shadow(raw.badgeShadow));
  return out;
}

// ── colour utilities (reference-image palette extraction + brand colour mapping) ──
export function hexToRgb(h: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
export function luminance(h: string): number { const { r, g, b } = hexToRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; }
export function saturation(h: string): number {
  const { r, g, b } = hexToRgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
// Extract a ~n-colour palette from an image (downscale → coarse-quantize → popularity → dedup).
export async function extractPalette(src: string, n = 6): Promise<string[]> {
  const img = await loadImage(src);
  const cw = 56, ch = 56;
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext("2d"); if (!ctx) return [];
  ctx.drawImage(img, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bk = buckets.get(key);
    if (bk) { bk.count++; bk.r += r; bk.g += g; bk.b += b; }
    else buckets.set(key, { count: 1, r, g, b });
  }
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const out: { r: number; g: number; b: number }[] = [];
  for (const bk of sorted) {
    const r = bk.r / bk.count, g = bk.g / bk.count, b = bk.b / bk.count;
    if (out.every((c) => Math.abs(c.r - r) + Math.abs(c.g - g) + Math.abs(c.b - b) > 56)) out.push({ r, g, b });
    if (out.length >= n) break;
  }
  return out.map((c) => rgbToHex(c.r, c.g, c.b));
}

/** C12: the background as the AI and the contrast guard see it (free, before the call). A picture is drawn small the way
 *  the renderer places it, once per size made (each crops it differently); a colour / gradient is read from its settings. */
export async function measureBackground(st: State, sizes: readonly PresetKey[]): Promise<BgInfo> {
  if ((st.bgMode === "upload" || st.bgMode === "ai") && st.bgImage) {
    const img = await loadImage(st.bgImage);
    const colors = await extractPalette(st.bgImage, 6);
    const infos = (sizes.length ? sizes : [st.preset]).map((k) => {
      const v = variantOf(st, k), ps = PRESETS[k];
      const w = 64, h = Math.max(8, Math.round((64 * ps.h) / ps.w));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return bgStatsFromColors("color", st.bgColor);
      ctx.fillStyle = v.bgColor; ctx.fillRect(0, 0, w, h);
      const sc = Math.max(w / img.width, h / img.height) * (v.bgImgScale || 1);
      const sw = img.width * sc, sh = img.height * sc;
      ctx.drawImage(img, (w - sw) / 2 + (v.bgImgX || 0) * w, (h - sh) / 2 + (v.bgImgY || 0) * h, sw, sh);
      return bgStatsFromPixels(ctx.getImageData(0, 0, w, h).data, w, h, colors, st.bgMode);
    });
    return mergeBgInfo(infos);
  }
  if (st.bgMode === "gradient") return bgStatsFromColors("gradient", st.gradFrom, st.gradTo);
  // a colour, or a picture mode with no picture yet (the renderer then fills the background colour)
  return { ...bgStatsFromColors("color", st.bgColor), mode: st.bgMode };
}

/** The AI background prompt: the typed override, else the blocks (subject, vibe, lighting, style) joined. */
export function aiBgPromptOf(s: State): string {
  if (s.aiBgPromptTouched) return s.aiBgPromptOvr;
  const styleStr = s.aiBgStyle ? resolveStylePrompt(s.aiBgStyle) : "";
  const parts = [s.aiBgSubject.trim(), s.aiBgVibe.trim(), s.aiBgLighting.trim(), styleStr].filter(Boolean);
  return parts.length ? parts.join(", ") + ", banner background image" : "";
}

// Calls a design door does not serve: AI copy and one-click design bill video.script through /api/tools/script-forge
// (video is only optional to design), and the client list is staff-only. The staff page passes them in
// (BannerStudioStaff.tsx); without them 開始 and AI 文案與設計 do not render (step-8 card §6 D-V2/D-V3).
export interface BannerStaffApi {
  /** The text model's streamed answer to `prompt` (the script-forge response). */
  /** One task of the server's banner module (lib/script-forge/modules.ts): the prompt is built there, not here. */
  scriptForge(task: "design" | "copy", fields: Record<string, unknown>, model: BannerAiModel): Promise<Response>;
  /** Card R3: which client's 我的設計 存到圖庫 saves into (staff work for a customer); null = 自用 (the default org). */
  SaveOrgPicker: ComponentType<{ selected: string | null; onPick(orgId: string | null, name?: string): void }>;
}
