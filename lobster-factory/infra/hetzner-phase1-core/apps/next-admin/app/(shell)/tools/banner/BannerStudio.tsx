"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { openInCanvas } from "@/components/tools/canvas-handoff";
import { STUDIO_MODEL_OPTIONS, modelSupportsRefs, modelCompositesProduct, type StudioModel } from "@/lib/studio/model-options";
import { STYLE_CATALOG } from "../tarot/tarotStyles";
import { resolveStylePrompt } from "../tarot/cards";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import { useDoorHref } from "@/app/DoorContext";

// ---------------------------------------------------------------------------
// Size presets & constants
// ---------------------------------------------------------------------------

const PRESETS = {
  "hero-desktop":  { label: "Hero 桌機",     w: 1920, h: 640,  aspect: "16:9", group: "wp" as const },
  "hero-full":     { label: "Hero 全版",      w: 1920, h: 1080, aspect: "16:9", group: "wp" as const },
  "hero-mobile":   { label: "Hero 手機",      w: 1000, h: 1000, aspect: "1:1",  group: "wp" as const },
  "featured-og":   { label: "Featured / OG", w: 1200, h: 800,  aspect: "3:2",  group: "wp" as const },
  "woo-product":   { label: "WooCommerce",    w: 1000, h: 1000, aspect: "1:1",  group: "wp" as const },
  "ig-square":     { label: "IG 方形",        w: 1080, h: 1080, aspect: "1:1",  group: "social" as const },
  "ig-portrait":   { label: "IG 直式 ★",     w: 1080, h: 1350, aspect: "4:5",  group: "social" as const },
  "ig-story":      { label: "IG Story/Reels", w: 1080, h: 1920, aspect: "9:16", group: "social" as const },
  "fb-post":       { label: "FB Post",        w: 1080, h: 1350, aspect: "4:5",  group: "social" as const },
  "twitter-x":     { label: "X (Twitter)",    w: 1200, h: 675,  aspect: "16:9", group: "social" as const },
  "pinterest":     { label: "Pinterest Pin",  w: 1000, h: 1500, aspect: "2:3",  group: "social" as const },
  "linkedin-post": { label: "LinkedIn Post",  w: 1200, h: 627,  aspect: "3:2",  group: "social" as const },
} as const satisfies Record<string, { label: string; w: number; h: number; aspect: string; group: "wp" | "social" }>;
type PresetKey = keyof typeof PRESETS;

const PRESET_GROUPS: { key: "wp" | "social"; label: string }[] = [
  { key: "wp",     label: "WP 網站" },
  { key: "social", label: "社交平台" },
];

const FONTS = [
  { value: "'Noto Sans TC', 'PingFang TC', sans-serif",  label: "黑體" },
  { value: "'Noto Serif TC', 'Songti TC', serif",         label: "明體" },
  { value: "'LXGW WenKai TC', cursive",                   label: "楷書" },
  { value: "'jf-openhuninn', sans-serif",                  label: "圓體" },
  { value: "'Inter', 'Helvetica Neue', sans-serif",        label: "Inter" },
];

// Curated headline × body pairings (Tier 2 — instant "designed" hierarchy)
const FONT_PAIRS: { label: string; headline: string; body: string }[] = [
  { label: "明體標 × 黑體文", headline: FONTS[1].value, body: FONTS[0].value },
  { label: "黑體 × 黑體",     headline: FONTS[0].value, body: FONTS[0].value },
  { label: "楷書標 × 黑體文", headline: FONTS[2].value, body: FONTS[0].value },
  { label: "圓體 × 圓體",     headline: FONTS[3].value, body: FONTS[3].value },
  { label: "Inter 標 × 黑體文", headline: FONTS[4].value, body: FONTS[0].value },
  { label: "明體 × 明體",     headline: FONTS[1].value, body: FONTS[1].value },
];

// Marketing art-direction presets for the AI background (Tier 3 — commercial moods, not fine-art)
const MARKETING_STYLE_PRESETS: { label: string; kw: string }[] = [
  { label: "奢華極簡", kw: "luxury minimal, premium product photography, soft studio lighting, elegant negative space" },
  { label: "節慶促銷", kw: "festive sale scene, vibrant celebratory, confetti and warm bokeh, energetic" },
  { label: "溫暖生活", kw: "warm lifestyle, cozy natural window light, authentic lived-in, inviting" },
  { label: "大膽促購", kw: "bold promotional, high contrast dramatic lighting, punchy saturated colors" },
  { label: "清新自然", kw: "fresh natural, airy bright, botanical clean, soft daylight" },
  { label: "科技未來", kw: "sleek futuristic, gradient glow, neon accents, modern minimal" },
];

// Product-as-hero scene scaffolds — one click fills Subject + Vibe for pro product photography (Tier 3)
const PRODUCT_SCENE_PRESETS: { label: string; subject: string; vibe: string }[] = [
  { label: "桌面晨光", subject: "product resting on a wooden table by a window", vibe: "soft morning daylight, warm and inviting, shallow depth of field" },
  { label: "貨架氛圍", subject: "product styled on a minimalist shelf", vibe: "moody warm ambient light, premium boutique feel" },
  { label: "極簡平拍", subject: "flat-lay of the product on a marble surface with props", vibe: "luxury minimal, soft even overhead light, elegant negative space" },
  { label: "戶外自然", subject: "product in an outdoor natural setting with greenery", vibe: "golden hour sunlight, fresh and organic, gentle bokeh" },
  { label: "棚拍純背", subject: "product on a seamless studio backdrop", vibe: "clean soft key light, professional studio, subtle gradient" },
  { label: "生活情境", subject: "product in a cozy lifestyle context being used", vibe: "warm natural light, authentic candid, inviting atmosphere" },
];

// Lighting / composition direction — orthogonal keyword chips appended to the scene (Tier 3)
const LIGHTING_PRESETS: { label: string; kw: string }[] = [
  { label: "左側柔光", kw: "soft key light from the left" },
  { label: "戲劇側光", kw: "dramatic side lighting, deep shadows" },
  { label: "逆光輪廓", kw: "backlight rim glow, luminous edges" },
  { label: "柔頂光", kw: "soft overhead diffused light" },
  { label: "暖色調", kw: "warm golden color temperature" },
  { label: "冷色調", kw: "cool crisp color temperature" },
];

const GRAD_DIRS: { value: string; label: string }[] = [
  { value: "135deg", label: "↘ 斜" },
  { value: "90deg",  label: "→ 橫" },
  { value: "180deg", label: "↓ 縱" },
  { value: "45deg",  label: "↗ 反斜" },
];

const COPY_TONES = ["促銷", "品牌形象", "活動", "教育"] as const;
type CopyTone = typeof COPY_TONES[number];
type BgMode   = "color" | "gradient" | "upload" | "ai";
type TextPos  = "top" | "center" | "bottom";
type ProductPos = "center" | "left" | "right" | "bottom-right";

// AI bg blocks
const BG_SUBJECT_PRESETS = [
  "Abstract gradient waves", "Mountain sunrise in mist", "Dark ocean waves",
  "Neon city lights at night", "Forest morning sunlight", "Soft bokeh blur",
  "Marble stone texture", "Starry night sky", "Tropical beach golden sunset",
  "Snowy mountain peaks", "Golden wheat field", "Rain drops on glass",
  "Moody cinematic fog", "Urban skyline at dusk", "Geometric abstract shapes",
];

const BG_VIBE_PRESETS = [
  "Bold & powerful", "Dark & mysterious", "Calm & ethereal",
  "Romantic & dreamy", "Sharp & modern", "Epic & grand",
  "Warm & inviting", "Cool & professional", "Playful & vibrant",
  "Raw & edgy", "Sacred & divine", "Electric & vibrant",
];

const MODEL_GROUPS = Array.from(new Set(STUDIO_MODEL_OPTIONS.map((m) => m.group)));
const STYLE_GROUPS_ALL = Array.from(new Set(STYLE_CATALOG.map((s) => s.group)));

// ── Marketing / conversion element types ──
type BadgeStyle = "ribbon" | "pill" | "burst";
type BadgePos   = "tl" | "tr";
type TrustType  = "none" | "stars" | "reviews" | "guarantee";
type TextAlignH = "left" | "center" | "right";

const CTA_PRESETS   = ["立即選購", "馬上搶購", "了解更多", "限時下單", "免費領取", "預約諮詢"];
const BADGE_PRESETS = ["限時優惠", "母親節限定", "新品上市", "買一送一", "免運費", "熱賣中"];

interface CopyVariant { headline: string; subtext: string }

interface State {
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
  textPos:   TextPos;
  textAlignH: TextAlignH;
  dimOverlay: boolean;
  textScrim:  boolean;   // 局部底襯（文字後方半透明圓角板）— 比整張暗化更高級
  textOutline: boolean;  // 標題描邊 + 陰影（匯出時保留，修舊版 export 掉陰影）
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
  // export
  saving:    boolean;
  saved:     boolean;
  error:     string | null;
}

const INIT: State = {
  preset:       "featured-og",
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
  textPos:   "center",
  textAlignH: "center",
  dimOverlay: true,
  textScrim:  false,
  textOutline: true,
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
  saving:    false,
  saved:     false,
  error:     null,
};

// ---------------------------------------------------------------------------
// Layout templates — pre-composed conversion arrangements (eye-flow tested).
// Each patch sets LAYOUT + STYLE + which elements are on; never touches the
// user's content (headline/subtext/product/bg). Applied via merge into State.
// ---------------------------------------------------------------------------

const TEMPLATES: { key: string; label: string; icon: string; patch: Partial<State> }[] = [
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
];

// ---------------------------------------------------------------------------
// Canvas export — single source of truth (preview renders this too).
// Layer order: bg → dim → product → scrim → text stack (headline/subtext/price/
// CTA/trust) → corner badge.
// ---------------------------------------------------------------------------

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Decoded-image cache keyed by src — the preview re-renders the whole canvas on
// every state change, so re-decoding the (possibly 2K) bg/product each time would lag.
// LRU-bounded: a long "generate many AI backgrounds" session would otherwise pin every
// decoded 2K image (keyed by a multi-MB data URL) for the page lifetime.
const _imgCache = new Map<string, HTMLImageElement>();
const _IMG_CACHE_MAX = 12;
async function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = _imgCache.get(src);
  if (cached?.complete) {
    _imgCache.delete(src); _imgCache.set(src, cached); // touch → most-recent
    return cached;
  }
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => {
      _imgCache.set(src, img);
      while (_imgCache.size > _IMG_CACHE_MAX) {
        const oldest = _imgCache.keys().next().value;
        if (oldest === undefined) break;
        _imgCache.delete(oldest);
      }
      res(img);
    };
    img.onerror = () => rej(new Error("image_load_failed"));
    img.src = src;
  });
}

async function exportToPng(state: State): Promise<string> {
  const p   = PRESETS[state.preset];
  const cv  = document.createElement("canvas");
  cv.width  = p.w;
  cv.height = p.h;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  if (state.bgMode === "color") {
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, p.w, p.h);
  } else if (state.bgMode === "gradient") {
    const deg    = Number.isFinite(parseFloat(state.gradAngle)) ? parseFloat(state.gradAngle) : 135;
    const rad    = (deg * Math.PI) / 180;
    const cx     = p.w / 2;
    const cy     = p.h / 2;
    const half   = Math.sqrt(cx * cx + cy * cy);
    const grd    = ctx.createLinearGradient(
      cx - Math.cos(rad) * half, cy - Math.sin(rad) * half,
      cx + Math.cos(rad) * half, cy + Math.sin(rad) * half,
    );
    grd.addColorStop(0, state.gradFrom);
    grd.addColorStop(1, state.gradTo);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, p.w, p.h);
  } else if (state.bgImage) {
    const img   = await loadImage(state.bgImage);
    const scale = Math.max(p.w / img.width, p.h / img.height);
    const sw    = img.width  * scale;
    const sh    = img.height * scale;
    ctx.drawImage(img, (p.w - sw) / 2, (p.h - sh) / 2, sw, sh);
  } else {
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, p.w, p.h);
  }

  if (state.dimOverlay) {
    ctx.fillStyle = `rgba(0,0,0,${state.dimOverlayOpacity})`;
    ctx.fillRect(0, 0, p.w, p.h);
  }

  // Skip overlaying the product when the active AI background already has it baked in.
  // Keyed off bgImageHasProduct (set at generation time), NOT the live toggle — so flipping
  // the toggle after a composite generate can't double-draw the product.
  const aiComposited = state.bgImageHasProduct && state.bgMode === "ai" && !!state.bgImage;
  if (state.productImage && !aiComposited) {
    const img  = await loadImage(state.productImage);
    const isCtr = state.productPos === "center";
    const maxW  = p.w * state.productScale * (isCtr ? 0.7 : 0.45);
    const maxH  = p.h * 0.85;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const sw    = img.width  * scale;
    const sh    = img.height * scale;
    const pad   = p.w * 0.05;
    let x: number, y: number;
    switch (state.productPos) {
      case "left":         x = pad;              y = (p.h - sh) / 2;  break;
      case "right":        x = p.w - sw - pad;   y = (p.h - sh) / 2;  break;
      case "bottom-right": x = p.w - sw - pad;   y = p.h - sh - pad;  break;
      default:             x = (p.w - sw) / 2;   y = (p.h - sh) / 2;
    }
    ctx.drawImage(img, x, y, sw, sh);
  }

  // ── unified content stack: headline → subtext → price → CTA → trust ──
  const font     = state.fontFamily;
  const padding  = Math.round(p.w * 0.06);
  const maxWidth = p.w - padding * 2;
  const align    = state.textAlignH;
  const anchorX  = align === "left" ? padding : align === "right" ? p.w - padding : p.w / 2;
  const gapV     = Math.round(state.subtextSize * 0.62);
  // left edge of a w-wide block under the current alignment
  const leftOf   = (w: number) => align === "left" ? anchorX : align === "right" ? anchorX - w : anchorX - w / 2;

  type Block = { h: number; w: number; draw: (top: number) => void };
  const blocks: Block[] = [];

  // headline — own font, letter-spacing, accent words (**字**), outlined for legibility
  if (state.headline) {
    const hFont = state.headlineFont || font;
    ctx.font = `bold ${state.headlineSize}px ${hFont}`;
    setLetterSpacing(ctx, state.letterSpacing);
    const lines = layoutAccentLines(ctx, parseAccentRuns(state.headline), maxWidth);
    const lineW = (ln: AccentRun[]) => ln.reduce((s, r) => s + ctx.measureText(r.text).width, 0);
    const lineH = state.headlineSize * 1.16;
    const w = Math.min(maxWidth, Math.max(1, ...lines.map(lineW)));
    setLetterSpacing(ctx, 0);
    blocks.push({
      h: lines.length * lineH, w,
      draw: (top) => {
        ctx.font = `bold ${state.headlineSize}px ${hFont}`;
        setLetterSpacing(ctx, state.letterSpacing);
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        let y = top;
        for (const ln of lines) {
          const lw = lineW(ln);
          let x = align === "left" ? anchorX : align === "right" ? anchorX - lw : anchorX - lw / 2;
          // accent highlight rects (behind text)
          if (state.accentHighlight) {
            let hx = x;
            for (const r of ln) {
              const rw = ctx.measureText(r.text).width;
              if (r.accent && r.text.trim()) {
                ctx.fillStyle = state.accentColor;
                roundRectPath(ctx, hx - state.headlineSize * 0.06, y - state.headlineSize * 0.08,
                  rw + state.headlineSize * 0.12, state.headlineSize * 1.22, state.headlineSize * 0.12);
                ctx.fill();
              }
              hx += rw;
            }
          }
          for (const r of ln) {
            const rw = ctx.measureText(r.text).width;
            const plated = r.accent && state.accentHighlight;
            ctx.fillStyle = r.accent ? (plated ? "#1a1a1a" : state.accentColor) : state.textColor;
            if (state.textOutline && !plated) {
              // Two-pass shadow halo: no strokeText (avoid per-stroke outline on CJK)
              ctx.shadowColor = "rgba(0,0,0,0.85)";
              ctx.shadowBlur = state.headlineSize * 0.22;
              ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
              ctx.fillText(r.text, x, y);
              ctx.shadowBlur = state.headlineSize * 0.08;
            }
            ctx.fillText(r.text, x, y);
            ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            x += rw;
          }
          y += lineH;
        }
        setLetterSpacing(ctx, 0);
      },
    });
  }

  // subtext
  if (state.subtext) {
    ctx.font = `${state.subtextSize}px ${font}`;
    const lines = wrapText(ctx, state.subtext, maxWidth);
    const lineH = state.subtextSize * 1.32;
    const w = Math.min(maxWidth, Math.max(1, ...lines.map((l) => ctx.measureText(l).width)));
    blocks.push({
      h: lines.length * lineH, w,
      draw: (top) => {
        ctx.font = `${state.subtextSize}px ${font}`;
        ctx.textAlign = align; ctx.textBaseline = "top";
        let y = top;
        for (const line of lines) {
          if (state.textOutline) { ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = state.subtextSize * 0.18; }
          ctx.fillStyle = state.textColor;
          ctx.globalAlpha = 0.95;
          ctx.fillText(line, anchorX, y);
          ctx.globalAlpha = 1; ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
          y += lineH;
        }
      },
    });
  }

  // price row (now big bold + was struck-through)
  if (state.showPrice && (state.priceNow || state.priceWas)) {
    const nowSize = Math.round(state.headlineSize * 0.78);
    const wasSize = Math.round(state.subtextSize * 0.9);
    ctx.font = `bold ${nowSize}px ${font}`;
    const nowW = state.priceNow ? ctx.measureText(state.priceNow).width : 0;
    ctx.font = `${wasSize}px ${font}`;
    const wasW = state.priceWas ? ctx.measureText(state.priceWas).width : 0;
    const gapP = state.priceNow && state.priceWas ? Math.round(nowSize * 0.35) : 0;
    const rowW = nowW + gapP + wasW;
    blocks.push({
      h: nowSize * 1.1, w: rowW,
      draw: (top) => {
        let x = leftOf(rowW);
        const baseY = top + nowSize;
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        if (state.priceNow) {
          ctx.font = `bold ${nowSize}px ${font}`;
          ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = nowSize * 0.12;
          ctx.fillStyle = state.textColor;
          ctx.fillText(state.priceNow, x, baseY);
          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
          x += nowW + gapP;
        }
        if (state.priceWas) {
          ctx.font = `${wasSize}px ${font}`;
          ctx.fillStyle = state.textColor; ctx.globalAlpha = 0.7;
          const wy = baseY;
          ctx.fillText(state.priceWas, x, wy);
          ctx.strokeStyle = state.textColor;
          ctx.lineWidth = Math.max(2, wasSize * 0.08);
          ctx.beginPath();
          ctx.moveTo(x, wy - wasSize * 0.32);
          ctx.lineTo(x + wasW, wy - wasSize * 0.32);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      },
    });
  }

  // CTA button (the conversion driver)
  if (state.ctaText) {
    const bf   = Math.round(state.subtextSize * 1.02);
    ctx.font = `bold ${bf}px ${font}`;
    const tw   = ctx.measureText(state.ctaText).width;
    const padX = Math.round(bf * 0.95);
    const padY = Math.round(bf * 0.56);
    const bw   = tw + padX * 2;
    const bh   = bf + padY * 2;
    blocks.push({
      h: bh, w: bw,
      draw: (top) => {
        const left = leftOf(bw);
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.32)"; ctx.shadowBlur = bh * 0.28; ctx.shadowOffsetY = bh * 0.12;
        roundRectPath(ctx, left, top, bw, bh, bh / 2);
        ctx.fillStyle = state.ctaBg; ctx.fill();
        ctx.restore();
        ctx.fillStyle = state.ctaTextColor;
        ctx.font = `bold ${bf}px ${font}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(state.ctaText, left + bw / 2, top + bh / 2 + bf * 0.06);
      },
    });
  }

  // trust signals
  if (state.trustType !== "none") {
    const tSize = Math.round(state.subtextSize * 0.88);
    let starsStr = "";
    let label = "";
    if (state.trustType === "stars" || state.trustType === "reviews") {
      const n = Math.max(0, Math.min(5, Math.round(state.trustStars)));
      starsStr = "★".repeat(n) + "☆".repeat(5 - n);
      if (state.trustType === "reviews") label = state.trustText || "12,000+ 則好評";
    } else {
      label = "✓ " + (state.trustText || "30 天滿意保證");
    }
    ctx.font = `${tSize}px ${font}`;
    const starW = starsStr ? ctx.measureText(starsStr).width : 0;
    const labW  = label ? ctx.measureText(label).width : 0;
    const gapT  = starsStr && label ? Math.round(tSize * 0.45) : 0;
    const rowW  = starW + gapT + labW;
    blocks.push({
      h: tSize * 1.1, w: rowW,
      draw: (top) => {
        let x = leftOf(rowW);
        const by = top + tSize;
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.font = `${tSize}px ${font}`;
        if (starsStr) { ctx.fillStyle = "#fbbf24"; ctx.fillText(starsStr, x, by); x += starW + gapT; }
        if (label) { ctx.fillStyle = state.textColor; ctx.globalAlpha = 0.92; ctx.fillText(label, x, by); ctx.globalAlpha = 1; }
      },
    });
  }

  // position the whole stack
  const stackH = blocks.reduce((sum, b) => sum + b.h, 0) + gapV * Math.max(0, blocks.length - 1);
  let stackTop = state.textPos === "top" ? padding
    : state.textPos === "bottom" ? p.h - padding - stackH
    : (p.h - stackH) / 2;
  stackTop = Math.max(padding, stackTop);

  // localized scrim behind the stack (cleaner than dimming the whole image)
  if (state.textScrim && blocks.length) {
    const maxW = Math.max(...blocks.map((b) => b.w));
    const sPadX = Math.round(state.subtextSize * 0.95);
    const sPadY = Math.round(state.subtextSize * 0.75);
    const sx = Math.max(0, leftOf(maxW) - sPadX);
    const sw = Math.min(p.w - sx, maxW + sPadX * 2);
    const sy = Math.max(0, stackTop - sPadY);
    const sh = Math.min(p.h - sy, stackH + sPadY * 2);
    ctx.fillStyle = `rgba(0,0,0,${state.textScrimOpacity})`;
    roundRectPath(ctx, sx, sy, sw, sh, Math.round(state.subtextSize * 0.6));
    ctx.fill();
  }

  // draw stack top-down
  let cy = stackTop;
  for (const b of blocks) { b.draw(cy); cy += b.h + gapV; }
  ctx.globalAlpha = 1; ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // corner offer badge (independent of the stack)
  if (state.badgeText) {
    const bf = Math.round(state.subtextSize * 0.95 * state.badgeScale);
    const margin = Math.round(p.w * 0.035);
    ctx.font = `bold ${bf}px ${font}`;
    const tw = ctx.measureText(state.badgeText).width;
    const onLeft = state.badgePos === "tl";
    if (state.badgeStyle === "burst") {
      const r = Math.max(bf * 1.9, tw * 0.62 + bf * 0.4);
      const cxb = onLeft ? margin + r : p.w - margin - r;
      const cyb = margin + r;
      ctx.save();
      ctx.translate(cxb, cyb);
      ctx.rotate((onLeft ? -1 : 1) * 0.18);
      ctx.beginPath();
      const spikes = 16;
      for (let i = 0; i < spikes * 2; i++) {
        const rr = i % 2 === 0 ? r : r * 0.84;
        const a = (Math.PI / spikes) * i - Math.PI / 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = state.badgeColor; ctx.fill();
      ctx.fillStyle = "#ffffff";
      const fit = Math.min(bf, (r * 1.5) / Math.max(1, tw / bf));
      ctx.font = `bold ${Math.round(fit)}px ${font}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(state.badgeText, 0, 0);
      ctx.restore();
    } else if (state.badgeStyle === "ribbon") {
      const padX = bf * 0.7, bh = bf * 1.9, notch = bh * 0.45;
      const bw = tw + padX * 2 + notch;
      const x = onLeft ? margin : p.w - margin - bw;
      const y = margin;
      ctx.fillStyle = state.badgeColor;
      ctx.beginPath();
      if (onLeft) {
        ctx.moveTo(x, y); ctx.lineTo(x + bw, y);
        ctx.lineTo(x + bw - notch, y + bh / 2); ctx.lineTo(x + bw, y + bh);
        ctx.lineTo(x, y + bh);
      } else {
        ctx.moveTo(x + bw, y); ctx.lineTo(x, y);
        ctx.lineTo(x + notch, y + bh / 2); ctx.lineTo(x, y + bh);
        ctx.lineTo(x + bw, y + bh);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${bf}px ${font}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(state.badgeText, onLeft ? x + (bw - notch) / 2 : x + notch + (bw - notch) / 2, y + bh / 2);
    } else {
      // pill
      const padX = bf * 0.8, bh = bf * 1.9, bw = tw + padX * 2;
      const x = onLeft ? margin : p.w - margin - bw;
      const y = margin;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = bh * 0.25; ctx.shadowOffsetY = bh * 0.1;
      roundRectPath(ctx, x, y, bw, bh, bh / 2);
      ctx.fillStyle = state.badgeColor; ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${bf}px ${font}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(state.badgeText, x + bw / 2, y + bh / 2);
    }
  }

  return cv.toDataURL("image/png");
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const isCjk   = /[　-鿿豈-﫿]/.test(text);
  const tokens   = isCjk ? text.split("") : text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const tok of tokens) {
    const test = isCjk ? current + tok : (current ? `${current} ${tok}` : tok);
    if (ctx.measureText(test).width <= maxWidth) { current = test; }
    else { if (current) lines.push(current); current = tok; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

// `**字**` → accent runs. Returns segments with an accent flag.
type AccentRun = { text: string; accent: boolean };
function parseAccentRuns(text: string): AccentRun[] {
  const out: AccentRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), accent: false });
    out.push({ text: m[1], accent: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false });
  return out.length ? out : [{ text, accent: false }];
}

// Wrap accent runs into lines (char-level — robust for CJK + mixed digits).
// Each line is a list of merged same-accent runs. ctx.font + letterSpacing must be set first.
function layoutAccentLines(ctx: CanvasRenderingContext2D, runs: AccentRun[], maxWidth: number): AccentRun[][] {
  const lines: AccentRun[][] = [];
  let line: AccentRun[] = []; let lineW = 0;
  for (const r of runs) {
    for (const ch of Array.from(r.text)) {
      const w = ctx.measureText(ch).width;
      if (lineW + w > maxWidth && line.length) { lines.push(line); line = []; lineW = 0; }
      const last = line[line.length - 1];
      if (last && last.accent === r.accent) last.text += ch;
      else line.push({ text: ch, accent: r.accent });
      lineW += w;
    }
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[{ text: "", accent: false }]];
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* unsupported browser — no-op */ }
}

// History signature: excludes transient flags; reduces big image data-URLs to their length
// (so comparing snapshots never stringifies multi-MB base64).
function designSig(st: State): string {
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
function sanitizeDesign(raw: Record<string, unknown>): Partial<State> {
  const out: Partial<State> = {};
  const str  = (v: unknown) => (typeof v === "string" ? v : undefined);
  const hex  = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const enumOf = <T extends string>(v: unknown, allowed: readonly T[]) =>
    (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
  const assign = <K extends keyof State>(k: K, v: State[K] | undefined) => { if (v !== undefined) out[k] = v; };

  assign("headline", str(raw.headline));
  assign("subtext", str(raw.subtext));
  assign("ctaText", str(raw.ctaText));
  assign("ctaBg", hex(raw.ctaBg));
  assign("ctaTextColor", hex(raw.ctaTextColor));
  assign("badgeText", str(raw.badgeText));
  assign("badgeStyle", enumOf<BadgeStyle>(raw.badgeStyle, ["ribbon", "pill", "burst"]));
  assign("badgeColor", hex(raw.badgeColor));
  assign("badgePos", enumOf<BadgePos>(raw.badgePos, ["tl", "tr"]));
  assign("showPrice", bool(raw.showPrice));
  assign("priceNow", str(raw.priceNow));
  assign("priceWas", str(raw.priceWas));
  assign("trustType", enumOf<TrustType>(raw.trustType, ["none", "stars", "reviews", "guarantee"]));
  if (typeof raw.trustStars === "number") assign("trustStars", Math.max(1, Math.min(5, Math.round(raw.trustStars))));
  assign("trustText", str(raw.trustText));
  assign("textColor", hex(raw.textColor));
  assign("accentColor", hex(raw.accentColor));
  assign("accentHighlight", bool(raw.accentHighlight));
  assign("textPos", enumOf<TextPos>(raw.textPos, ["top", "center", "bottom"]));
  assign("textAlignH", enumOf<TextAlignH>(raw.textAlignH, ["left", "center", "right"]));
  assign("textScrim", bool(raw.textScrim));
  assign("textOutline", bool(raw.textOutline));
  assign("bgMode", enumOf<BgMode>(raw.bgMode, ["color", "gradient"])); // never let AI flip to upload/ai
  assign("gradFrom", hex(raw.gradFrom));
  assign("gradTo", hex(raw.gradTo));
  assign("aiBgSubject", str(raw.aiBgSubject));
  assign("aiBgVibe", str(raw.aiBgVibe));
  return out;
}

// ── colour utilities (reference-image palette extraction + brand colour mapping) ──
function hexToRgb(h: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function luminance(h: string): number { const { r, g, b } = hexToRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; }
function saturation(h: string): number {
  const { r, g, b } = hexToRgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
// Extract a ~n-colour palette from an image (downscale → coarse-quantize → popularity → dedup).
async function extractPalette(src: string, n = 6): Promise<string[]> {
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

// ---------------------------------------------------------------------------
// Shared UI sub-components (same pattern as StudioWorkbench)
// ---------------------------------------------------------------------------

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
        style={{
          width: "100%", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 14px", background: "var(--chip-surface, #f8f9fa)", border: "none", borderRadius: 6,
          cursor: "pointer", color: "var(--text-primary)", fontWeight: 600,
        }}
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

function PresetChips({ chips, onSelect, selected }: { chips: string[]; onSelect: (v: string) => void; selected?: string }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
      {chips.map((c, i) => {
        const active = selected === c;
        return (
          <button
            key={`${c}-${i}`}
            type="button"
            onClick={() => onSelect(c)}
            style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 20,
              background: active ? "var(--accent)" : "var(--chip-bg)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer", color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
              fontWeight: active ? 600 : 400, lineHeight: 1.6,
              transition: "all 0.15s",
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function StepCard({
  title, step, icon, hint, children, defaultOpen = false, order,
}: {
  title: string; step?: string; icon?: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean; order?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", ...(order !== undefined ? { order } : {}) }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none",
          padding: "13px 16px", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          color: "var(--text-primary)", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
          {step && <span style={{ fontSize: 10, opacity: 0.35, fontWeight: 400, letterSpacing: 0.5 }}>{step}</span>}
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          {hint && <span style={{ fontSize: 11, opacity: 0.45, fontWeight: 400, marginLeft: 2 }}>{hint}</span>}
        </span>
        <span style={{ opacity: 0.35, fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 16px 16px", borderTop: "1px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Calls a design door does not serve: AI copy and one-click design bill video.script through /api/tools/script-forge
// (video is only optional to design), and brand colours come from the staff client list. The staff page passes them in
// (BannerStudioStaff.tsx); without them the AI copy card and the brand picker do not render (step-8 card §6 D-V2/D-V3).
export interface BannerStaffApi {
  /** The text model's streamed answer to `prompt` (the script-forge response). */
  scriptForge(prompt: string): Promise<Response>;
  brandClients(): Promise<{ slug: string; name: string; colors: string[] }[]>;
}

export default function BannerStudio({ staff }: { staff?: BannerStaffApi }) {
  const { canUse, why } = usePaidFeatures();
  const designsHref = useDoorHref("/tools/designs");
  const [s, setS]         = useState<State>(INIT);
  const bgFileRef         = useRef<HTMLInputElement>(null);
  const productFileRef    = useRef<HTMLInputElement>(null);
  const aiBgFileRef       = useRef<HTMLInputElement>(null);
  const colorRefFileRef   = useRef<HTMLInputElement>(null);
  const [aiBgStyleGroup, setAiBgStyleGroup] = useState("不指定");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // colour tools (not part of design State / undo history — derived/fetched data)
  const [palette, setPalette]     = useState<string[]>([]);
  const [selSwatch, setSelSwatch] = useState<string | null>(null);
  const [brandClients, setBrandClients] = useState<{ slug: string; name: string; colors: string[] }[]>([]);

  const set = useCallback(<K extends keyof State>(key: K, val: State[K]) =>
    setS((prev) => ({ ...prev, [key]: val, saved: key === "saved" ? (val as boolean) : false, error: null }))
  , []);

  const p        = PRESETS[s.preset];

  // Assembled AI bg prompt from blocks
  const assembledBgPrompt = useMemo(() => {
    const styleStr = s.aiBgStyle ? resolveStylePrompt(s.aiBgStyle) : "";
    const parts = [s.aiBgSubject.trim(), s.aiBgVibe.trim(), s.aiBgLighting.trim(), styleStr].filter(Boolean);
    return parts.length ? parts.join(", ") + ", banner background image" : "";
  }, [s.aiBgSubject, s.aiBgVibe, s.aiBgLighting, s.aiBgStyle]);

  const effectiveBgPrompt = s.aiBgPromptTouched ? s.aiBgPromptOvr : assembledBgPrompt;
  // In composite mode the product image alone is enough input (a scene description is optional);
  // otherwise at least one prompt block must be filled.
  const aiBgHasInput =
    !!(s.aiBgSubject || s.aiBgVibe || s.aiBgStyle || s.aiBgPromptTouched) ||
    (s.aiBgCompositeProduct && !!s.productImage);

  // Live preview renders the REAL exportToPng output (single source of truth — preview
  // always matches the downloaded PNG). Debounced so typing stays smooth; images are cached.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      exportToPng(s).then((url) => { if (!cancelled) setPreviewUrl(url); }).catch(() => { /* mid-edit, ignore */ });
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [s]);

  // ── template apply ──
  const applyTemplate = useCallback((patch: Partial<State>) =>
    setS((prev) => ({ ...prev, ...patch, saved: false, error: null }))
  , []);

  // ── undo / redo (Banner's whole design is ONE serializable State; unchanged image
  //    strings are shared by reference across snapshots, so history is memory-cheap) ──
  const historyRef  = useRef<State[]>([INIT]);
  const histIdxRef  = useRef(0);
  const restoringRef = useRef(false);
  const [, bumpHist] = useState(0);
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return; }
    const t = setTimeout(() => {
      const hist = historyRef.current;
      const cur = hist[histIdxRef.current];
      if (cur && designSig(cur) === designSig(s)) return;
      const next = hist.slice(0, histIdxRef.current + 1);
      next.push(s);
      while (next.length > 25) next.shift();
      historyRef.current = next;
      histIdxRef.current = next.length - 1;
      bumpHist((v) => v + 1);
    }, 500);
    return () => clearTimeout(t);
  }, [s]);
  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    restoringRef.current = true;
    setS(historyRef.current[histIdxRef.current]);
    bumpHist((v) => v + 1);
  }, []);
  const redo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current += 1;
    restoringRef.current = true;
    setS(historyRef.current[histIdxRef.current]);
    bumpHist((v) => v + 1);
  }, []);
  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  // ── AI 一鍵設計整張：LLM 回傳一個 State patch（renderer 直接吃 → 幾乎零渲染成本）──
  async function generateFullDesign() {
    if (!s.copyBrief.trim()) return;
    setS((prev) => ({ ...prev, designing: true, error: null }));
    try {
      const prompt =
        `【AI Banner 一鍵設計】\n` +
        `產品/活動：${s.copyBrief}\n` +
        `平台尺寸：${p.label} ${p.w}×${p.h}\n\n` +
        `扮演國際級轉換廣告設計師，設計一張「會讓訪客點擊下單」的 banner。輸出純 JSON（無 markdown 包裹），欄位全部選填、能填則填：\n` +
        `{"headline":"主標，可用 **字** 包住要強調的重點字（例：省 **50%** 起）",` +
        `"subtext":"副標或行動說明",` +
        `"ctaText":"按鈕文字，例 立即選購","ctaBg":"#rrggbb","ctaTextColor":"#rrggbb",` +
        `"badgeText":"促銷徽章（不需要可空字串）","badgeStyle":"ribbon|pill|burst","badgeColor":"#rrggbb","badgePos":"tl|tr",` +
        `"showPrice":true,"priceNow":"NT$590","priceWas":"NT$890",` +
        `"trustType":"none|stars|reviews|guarantee","trustStars":5,"trustText":"12,000+ 則好評",` +
        `"textColor":"#rrggbb","accentColor":"#rrggbb","accentHighlight":false,` +
        `"textPos":"top|center|bottom","textAlignH":"left|center|right","textScrim":true,"textOutline":true,` +
        `"bgMode":"gradient","gradFrom":"#rrggbb","gradTo":"#rrggbb",` +
        `"aiBgSubject":"英文場景描述(供 AI 生背景)","aiBgVibe":"英文氛圍"}\n\n` +
        `配色和諧、對比足夠、CTA 醒目；文字用繁體中文；只輸出 JSON。`;
      if (!staff) return;
      const res = await staff.scriptForge(prompt);
      if (!res.ok || !res.body) throw new Error(`設計生成失敗（${res.status}）`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
      }
      full += dec.decode();
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(full.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
      } catch {
        throw new Error("AI 回傳格式錯誤，請重試");
      }
      const patch = sanitizeDesign(raw);
      setS((prev) => ({ ...prev, ...patch, designing: false, saved: false }));
    } catch (err) {
      setS((prev) => ({ ...prev, designing: false, error: String(err) }));
    }
  }

  // ── brand colours: clients that have brandColors set on /ops/clients (staff page only) ──
  useEffect(() => {
    if (!staff) return;
    let cancelled = false;
    staff.brandClients()
      .then((list) => { if (!cancelled) setBrandClients(list); })
      .catch(() => { /* clients endpoint unavailable — brand picker just stays empty */ });
    return () => { cancelled = true; };
  }, [staff]);

  // ── colour-tool handlers ──
  function handleColorRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const pal = await extractPalette(reader.result as string);
        setPalette(pal); setSelSwatch(pal[0] ?? null);
      } catch { setS((prev) => ({ ...prev, error: "palette_extract_failed" })); }
    };
    reader.onerror = () => setS((prev) => ({ ...prev, error: "upload_read_failed" }));
    reader.readAsDataURL(file);
  }

  // Auto-distribute a palette across the design (dark→bg gradient, most-saturated→CTA/accent, light→text).
  function autoApplyPalette(pal: string[]) {
    if (!pal.length) return;
    const byLum = [...pal].sort((a, b) => luminance(a) - luminance(b));
    const dark = byLum[0];
    const dark2 = byLum[1] ?? byLum[0];
    const light = byLum[byLum.length - 1];
    const accent = [...pal].sort((a, b) => saturation(b) - saturation(a))[0];
    setS((prev) => ({
      ...prev,
      bgMode: "gradient", gradFrom: dark, gradTo: dark2,
      textColor: luminance(light) > 150 ? light : "#ffffff",
      ctaBg: accent, badgeColor: accent, accentColor: accent,
      ctaTextColor: luminance(accent) > 150 ? "#111111" : "#ffffff",
      saved: false, error: null,
    }));
  }

  type ColorKey = "textColor" | "accentColor" | "ctaBg" | "badgeColor" | "gradFrom" | "gradTo" | "bgColor";
  const SWATCH_TARGETS: { label: string; key: ColorKey }[] = [
    { label: "標題字", key: "textColor" }, { label: "重點字", key: "accentColor" },
    { label: "CTA 底", key: "ctaBg" }, { label: "徽章", key: "badgeColor" },
    { label: "背景起", key: "gradFrom" }, { label: "背景迄", key: "gradTo" }, { label: "純色背景", key: "bgColor" },
  ];

  // ── Handlers ──

  async function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = () => setS((prev) => ({ ...prev, bgImage: reader.result as string, bgMode: "upload", bgImageHasProduct: false, error: null }));
    reader.onerror = () => setS((prev) => ({ ...prev, error: "upload_read_failed" }));
    reader.readAsDataURL(file);
  }

  async function handleProductUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = () => setS((prev) => ({
      ...prev, productOrig: reader.result as string, productImage: reader.result as string, error: null,
    }));
    reader.onerror = () => setS((prev) => ({ ...prev, error: "upload_read_failed" }));
    reader.readAsDataURL(file);
  }

  async function handleAiBgRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = () => setS((prev) => ({ ...prev, aiBgRefImage: reader.result as string, error: null }));
    reader.onerror = () => setS((prev) => ({ ...prev, error: "upload_read_failed" }));
    reader.readAsDataURL(file);
  }

  async function removeProductBg() {
    if (!s.productOrig) return;
    setS((prev) => ({ ...prev, productRemoving: true, error: null }));
    try {
      const res  = await fetch("/api/tools/studio/remove-bg", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body:    JSON.stringify({ image: s.productOrig }),
      });
      const data = await res.json() as { ok: boolean; image?: string; error?: string };
      if (!data.ok || !data.image) throw new Error(data.error ?? "remove_bg_failed");
      setS((prev) => ({ ...prev, productImage: data.image!, productRemoving: false }));
    } catch (err) {
      setS((prev) => ({ ...prev, productRemoving: false, error: String(err) }));
    }
  }

  async function generateAiBg() {
    const compositing = s.aiBgCompositeProduct && !!s.productImage;
    if (!effectiveBgPrompt.trim() && !compositing) return;
    setS((prev) => ({ ...prev, generating: true, error: null }));
    try {
      const maxRefs = STUDIO_MODEL_OPTIONS.find((m) => m.value === s.aiBgModel)?.maxRefs ?? 0;
      // Product ref takes priority; a style ref is appended only if the model has spare ref slots.
      const refs: string[] = [];
      if (compositing && s.productImage) refs.push(s.productImage);
      if (s.aiBgRefMode === "ref" && s.aiBgRefImage && refs.length < maxRefs) refs.push(s.aiBgRefImage);
      const trimmedRefs = refs.slice(0, maxRefs);

      let prompt = effectiveBgPrompt;
      if (compositing) {
        const scene = effectiveBgPrompt.trim() || "a clean professional studio background";
        prompt =
          `Scene: ${scene}. Composite the provided product photo INTO this scene as the hero subject. ` +
          `Physically PLACE the product resting on a real surface in the foreground — a table, counter or shelf that belongs to the scene — ` +
          `standing upright with its base actually touching the surface (a grounded contact shadow beneath it), ` +
          `NOT floating, NOT pasted flat over the background. ` +
          `Match the scene's camera perspective, depth of field, lighting direction and color temperature; ` +
          `add soft contact shadows and subtle surface reflection so it looks physically present in the room. ` +
          `Keep the product's exact shape, label, colors, text and proportions unchanged — do not distort, recolor, relabel, crop or redraw it. ` +
          `Keep clean, uncluttered negative space for a headline.`;
      }

      const res  = await fetch("/api/tools/studio/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body:    JSON.stringify({
          model:           s.aiBgModel,
          prompt,
          referenceImages: trimmedRefs,
          aspectRatio:     p.aspect,
        }),
      });
      const data = await res.json() as { ok: boolean; image?: string; error?: string };
      if (!data.ok || !data.image) throw new Error(data.error ?? "generation_failed");
      setS((prev) => ({ ...prev, bgImage: data.image!, bgMode: "ai", bgImageHasProduct: compositing, generating: false }));
    } catch (err) {
      setS((prev) => ({ ...prev, generating: false, error: String(err) }));
    }
  }

  async function generateCopy() {
    if (!s.copyBrief.trim()) return;
    setS((prev) => ({ ...prev, copyGenerating: true, copyVariants: [], copyStream: "", error: null }));
    try {
      const platform = p.group === "wp" ? "WP 網站 Banner" : "社交媒體貼文圖";
      const prompt =
        `【Banner 文案生成】\n` +
        `用途：${platform} · ${p.label} (${p.w}×${p.h})\n` +
        `語氣風格：${s.copyTone}\n` +
        `產品/服務描述：${s.copyBrief}\n\n` +
        `請生成 5 組 banner 文案，每組包含：\n` +
        `- headline：主標題，簡潔有力，8-15 字\n` +
        `- subtext：副標題或行動呼籲（CTA），10-25 字\n\n` +
        `輸出純 JSON，不含任何 markdown 包裹：\n` +
        `{"variants":[{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."}]}`;
      const langified = `【預設輸出語言：繁體中文】未另行指定時，所有文字請用繁體中文；JSON key 保持英文。\n\n${prompt}`;
      if (!staff) return;
      const res = await staff.scriptForge(langified);
      if (!res.ok || !res.body) throw new Error(`文案生成失敗（${res.status}）`);
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let full     = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setS((prev) => ({ ...prev, copyStream: full }));
      }
      full += dec.decode();
      const parsed = JSON.parse(full.replace(/```json|```/g, "").trim()) as { variants?: CopyVariant[] };
      const variants = Array.isArray(parsed?.variants) ? parsed.variants : [];
      setS((prev) => ({ ...prev, copyGenerating: false, copyVariants: variants, copyStream: "" }));
    } catch (err) {
      setS((prev) => ({ ...prev, copyGenerating: false, copyStream: "", error: String(err) }));
    }
  }

  async function handleSave() {
    setS((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const png = await exportToPng(s);
      const res = await fetch("/api/tools/designs", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body:    JSON.stringify({
          image:     png,
          source:    "banner",
          prompt:    s.headline || (s.bgMode === "ai" ? effectiveBgPrompt : undefined) || undefined,
          modelName: s.bgMode === "ai" ? s.aiBgModel : undefined,
          subject:   s.preset,
        }),
      });
      if (!res.ok) throw new Error(`save_failed_${res.status}`);
      setS((prev) => ({ ...prev, saving: false, saved: true }));
    } catch (err) {
      setS((prev) => ({ ...prev, saving: false, error: String(err) }));
    }
  }

  async function handleDownload() {
    try {
      const png  = await exportToPng(s);
      const link = document.createElement("a");
      link.href     = png;
      link.download = `banner-${s.preset}.png`;
      link.click();
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  async function handleOpenInCanvas() {
    try {
      const png = await exportToPng(s);
      openInCanvas(png, `banner-${s.preset}`);
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>🖼 Banner Studio</h1>
      <p className="form-hint" style={{ marginBottom: 20 }}>
        WP 網站 + 社交平台 · AI 文案 + 產品圖去背 + AI 背景 · 匯出高解析 PNG
      </p>

      {s.error && (
        <div className="form-message" style={{ marginBottom: 16, color: "var(--red)" }}>
          ⚠ {s.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── Controls (right side) ── */}
        <div style={{ order: 2, flex: "0 0 380px", width: 380,
          display: "flex", flexDirection: "column", gap: 12 }}>

          <StepCard title="配色 / 品牌色" icon="🎨" order={1}>
            {!staff ? null : brandClients.length > 0 ? (
              <div className="form-row" style={{ marginTop: 12 }}>
                <label className="form-label">品牌</label>
                <select className="form-select" defaultValue=""
                  onChange={(e) => {
                    const c = brandClients.find((x) => x.slug === e.target.value);
                    if (c) { setPalette(c.colors); setSelSwatch(c.colors[0] ?? null); }
                  }}>
                  <option value="">選擇品牌帶入配色…</option>
                  {brandClients.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
            ) : (
              <p className="form-hint" style={{ marginTop: 12 }}>尚無品牌色。到 <a href="/ops/clients">客戶設定</a> 填入品牌色後即可在此選取帶入。</p>
            )}

            <input ref={colorRefFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleColorRefUpload} />
            <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 8 }} onClick={() => colorRefFileRef.current?.click()}>
              📷 從參考圖擷取配色
            </button>

            {palette.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {palette.map((c, i) => (
                    <button key={`${c}-${i}`} onClick={() => setSelSwatch(c)} title={c}
                      style={{
                        width: 30, height: 30, borderRadius: 6, background: c, cursor: "pointer", padding: 0,
                        border: selSwatch === c ? "3px solid var(--accent)" : "1px solid var(--border)",
                      }} />
                  ))}
                </div>
                <button className="btn btn-primary" style={{ fontSize: 12, marginTop: 10 }} onClick={() => autoApplyPalette(palette)}>
                  ✨ 自動套用整組配色
                </button>
                {selSwatch && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                      把選中色
                      <span style={{ display: "inline-block", width: 13, height: 13, background: selSwatch, borderRadius: 3, border: "1px solid #0002" }} />
                      套到：
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {SWATCH_TARGETS.map((t) => (
                        <button key={t.key} className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={() => { if (selSwatch) set(t.key, selSwatch); }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </StepCard>

          <StepCard title="版型模板" icon="✨" hint="一鍵套用" order={5}>
            <p className="form-hint" style={{ marginBottom: 8, marginTop: 4 }}>套用後再填內容；只改版面/元素，不動你的文字與圖。</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {TEMPLATES.map((t) => (
                <button key={t.key} className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "8px 6px", textAlign: "left", lineHeight: 1.3 }}
                  onClick={() => applyTemplate(t.patch)}>
                  <span style={{ fontSize: 15, marginRight: 4 }}>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </StepCard>

          {/* Step 0: 文案生成 */}
          {staff && <StepCard title="文案生成" step="Step 0" icon="✍️" hint="選填" order={6}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <div className="form-row">
                <label className="form-label">描述</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="產品/服務一句話描述，例：有機冷壓橄欖油，主打健康家庭"
                  value={s.copyBrief}
                  onChange={(e) => set("copyBrief", e.target.value)}
                  style={{ resize: "vertical", fontSize: 13 }}
                />
              </div>
              <div className="form-row">
                <label className="form-label">語氣</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {COPY_TONES.map((t) => (
                    <button key={t}
                      className={s.copyTone === t ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ fontSize: 12, padding: "3px 8px" }}
                      onClick={() => set("copyTone", t)}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button title={why("video.script")} className="btn btn-primary" disabled={(s.copyGenerating || s.designing || !s.copyBrief.trim()) || !canUse("video.script")}
                  onClick={generateCopy}>
                  {s.copyGenerating ? "生成中…" : "生成文案"}
                </button>
                <button title={why("video.script")} className="btn btn-primary" disabled={(s.designing || s.copyGenerating || !s.copyBrief.trim()) || !canUse("video.script")}
                  onClick={generateFullDesign}
                  style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none" }}>
                  {s.designing ? "設計中…" : "✨ AI 一鍵設計整張"}
                </button>
              </div>
              <p className="form-hint">「一鍵設計」讓 AI 直接配好標題/重點字/CTA/徽章/價格/配色/版面 — 再微調即可。</p>
              {s.copyGenerating && s.copyStream && (
                <div style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace", maxHeight: 40, overflow: "hidden" }}>
                  {s.copyStream.slice(-80)}
                </div>
              )}
              {s.copyVariants.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {s.copyVariants.map((v, i) => (
                    <button key={i} className="btn btn-ghost"
                      style={{ textAlign: "left", padding: "8px 10px", fontSize: 12, lineHeight: 1.4 }}
                      onClick={() => setS((prev) => ({ ...prev, headline: v.headline, subtext: v.subtext, saved: false, error: null }))}>
                      <div style={{ fontWeight: 600 }}>{v.headline}</div>
                      <div style={{ opacity: 0.65, fontSize: 11 }}>{v.subtext}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </StepCard>}

          {/* Step 1: 尺寸 */}
          <StepCard title="尺寸" step="Step 1" icon="📐" order={2}>
            {PRESET_GROUPS.map((grp) => (
              <div key={grp.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>
                  {grp.label}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(Object.keys(PRESETS) as PresetKey[])
                    .filter((k) => PRESETS[k].group === grp.key)
                    .map((k) => (
                      <button key={k}
                        className={s.preset === k ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        onClick={() => set("preset", k)}>
                        {PRESETS[k].label}
                        <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 9 }}>
                          {PRESETS[k].w}×{PRESETS[k].h}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </StepCard>

          {/* Step 2: 產品圖 */}
          <StepCard title="產品圖" step="Step 2" icon="🖼" hint="選填" order={3}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <input ref={productFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleProductUpload} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => productFileRef.current?.click()}>
                  {s.productImage ? "換圖" : "上傳產品圖"}
                </button>
                {s.productOrig && (
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={s.productRemoving} onClick={removeProductBg}>
                    {s.productRemoving ? "去背中…" : s.productImage !== s.productOrig ? "✓ 已去背" : "一鍵去背"}
                  </button>
                )}
                {s.productImage && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--red)" }}
                    onClick={() => setS((prev) => ({ ...prev, productOrig: null, productImage: null, aiBgCompositeProduct: false, saved: false }))}>
                    移除
                  </button>
                )}
              </div>
              {s.productImage && (
                <>
                  <div className="form-row">
                    <label className="form-label">位置</label>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {(["center", "left", "right", "bottom-right"] as ProductPos[]).map((pos) => (
                        <button key={pos}
                          className={s.productPos === pos ? "btn btn-primary" : "btn btn-ghost"}
                          style={{ fontSize: 11, padding: "3px 8px" }}
                          onClick={() => set("productPos", pos)}>
                          {{ center: "中央", left: "左", right: "右", "bottom-right": "右下" }[pos]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-row">
                    <label className="form-label">大小</label>
                    <input type="range" min={0.2} max={1.0} step={0.05} value={s.productScale}
                      onChange={(e) => set("productScale", Number(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 32 }}>
                      {Math.round(s.productScale * 100)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </StepCard>

          {/* Step 3: 背景 */}
          <StepCard title="背景" step="Step 3" icon="🎆" order={4}>
            <div className="form-row" style={{ marginTop: 4 }}>
              <label className="form-label">類型</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["color", "gradient", "upload", "ai"] as BgMode[]).map((m) => (
                  <button key={m}
                    className={s.bgMode === m ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => set("bgMode", m)}>
                    {{ color: "純色", gradient: "漸層", upload: "上傳圖", ai: "AI 生成" }[m]}
                  </button>
                ))}
              </div>
            </div>

            {s.bgMode === "color" && (
              <div className="form-row" style={{ marginTop: 10 }}>
                <label className="form-label">背景色</label>
                <input type="color" value={s.bgColor} onChange={(e) => set("bgColor", e.target.value)}
                  style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
              </div>
            )}

            {s.bgMode === "gradient" && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="form-row">
                  <label className="form-label">起始色</label>
                  <input type="color" value={s.gradFrom} onChange={(e) => set("gradFrom", e.target.value)}
                    style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
                </div>
                <div className="form-row">
                  <label className="form-label">結束色</label>
                  <input type="color" value={s.gradTo} onChange={(e) => set("gradTo", e.target.value)}
                    style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
                </div>
                <div className="form-row">
                  <label className="form-label">方向</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {GRAD_DIRS.map((d) => (
                      <button key={d.value}
                        className={s.gradAngle === d.value ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 12, padding: "3px 8px" }}
                        onClick={() => set("gradAngle", d.value)}>{d.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {s.bgMode === "upload" && (
              <div style={{ marginTop: 10 }}>
                <input ref={bgFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBgUpload} />
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => bgFileRef.current?.click()}>
                  {s.bgImage ? "✓ 已上傳，點此換圖" : "選擇圖片…"}
                </button>
              </div>
            )}

            {/* ── AI 生成 (生圖積木) ── */}
            {s.bgMode === "ai" && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>

                {/* 圖片模型 */}
                <AccordionSection
                  title="圖片模型"
                  summary={STUDIO_MODEL_OPTIONS.find((m) => m.value === s.aiBgModel)?.label ?? s.aiBgModel}
                  icon="🤖"
                  defaultOpen
                >
                  <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                    {MODEL_GROUPS.map((g) => (
                      <button key={g}
                        className={s.aiBgModelGroup === g ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => set("aiBgModelGroup", g)}>{g}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {STUDIO_MODEL_OPTIONS.filter((m) => m.group === s.aiBgModelGroup).map((m) => (
                      <button key={m.value}
                        className={s.aiBgModel === m.value ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        onClick={() => set("aiBgModel", m.value)}>
                        {m.label}
                        <span style={{ opacity: 0.45, fontSize: 9, marginLeft: 3 }}>NT${m.costNt}</span>
                      </button>
                    ))}
                  </div>
                </AccordionSection>

                {/* 產品場景模板（合成用）— 一鍵填好 Subject + Vibe */}
                {s.aiBgCompositeProduct && s.productImage && (
                  <AccordionSection title="產品場景模板" summary="一鍵專業擺拍" icon="📸" defaultOpen>
                    <p className="form-hint" style={{ marginBottom: 6 }}>選一個場景，自動填好主題＋氛圍（產品會放進此場景）。</p>
                    <PresetChips chips={PRODUCT_SCENE_PRESETS.map((sc) => sc.label)}
                      selected={PRODUCT_SCENE_PRESETS.find((sc) => sc.subject === s.aiBgSubject)?.label}
                      onSelect={(label) => {
                        const sc = PRODUCT_SCENE_PRESETS.find((x) => x.label === label);
                        if (sc) setS((prev) => ({ ...prev, aiBgSubject: sc.subject, aiBgVibe: sc.vibe, saved: false }));
                      }} />
                  </AccordionSection>
                )}

                {/* 主題 Subject */}
                <AccordionSection title="主題 Subject" summary={s.aiBgSubject || "未填"} icon="🎯">
                  <input className="form-input" type="text"
                    placeholder="e.g. mountain sunrise in mist..."
                    value={s.aiBgSubject}
                    onChange={(e) => set("aiBgSubject", e.target.value)}
                    style={{ marginBottom: 4, fontSize: 13, width: "100%" }} />
                  <PresetChips chips={BG_SUBJECT_PRESETS} selected={s.aiBgSubject}
                    onSelect={(v) => set("aiBgSubject", v === s.aiBgSubject ? "" : v)} />
                </AccordionSection>

                {/* 氣圍 Vibe */}
                <AccordionSection title="氣圍 Vibe" summary={s.aiBgVibe || "未填"} icon="✨">
                  <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>行銷風格（商業感）</div>
                  <PresetChips chips={MARKETING_STYLE_PRESETS.map((m) => m.label)}
                    selected={MARKETING_STYLE_PRESETS.find((m) => m.kw === s.aiBgVibe)?.label}
                    onSelect={(label) => {
                      const m = MARKETING_STYLE_PRESETS.find((x) => x.label === label);
                      if (m) set("aiBgVibe", m.kw === s.aiBgVibe ? "" : m.kw);
                    }} />
                  <div style={{ fontSize: 10, opacity: 0.5, margin: "8px 0 3px" }}>一般氛圍</div>
                  <PresetChips chips={BG_VIBE_PRESETS} selected={s.aiBgVibe}
                    onSelect={(v) => set("aiBgVibe", v === s.aiBgVibe ? "" : v)} />
                </AccordionSection>

                {/* 打光 / 構圖 */}
                <AccordionSection title="打光 / 構圖" summary={LIGHTING_PRESETS.find((l) => l.kw === s.aiBgLighting)?.label || "未指定"} icon="💡">
                  <PresetChips chips={LIGHTING_PRESETS.map((l) => l.label)}
                    selected={LIGHTING_PRESETS.find((l) => l.kw === s.aiBgLighting)?.label}
                    onSelect={(label) => {
                      const l = LIGHTING_PRESETS.find((x) => x.label === label);
                      if (l) set("aiBgLighting", l.kw === s.aiBgLighting ? "" : l.kw);
                    }} />
                </AccordionSection>

                {/* 風格 Style */}
                <AccordionSection title="風格 Style" summary={s.aiBgStyle || "不指定"} icon="🎨">
                  <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                    {["不指定", ...STYLE_GROUPS_ALL].map((g) => (
                      <button key={g}
                        className={aiBgStyleGroup === g ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 10, padding: "2px 7px" }}
                        onClick={() => setAiBgStyleGroup(g)}>{g}</button>
                    ))}
                  </div>
                  {aiBgStyleGroup !== "不指定" && (
                    <PresetChips
                      chips={STYLE_CATALOG.filter((x) => x.group === aiBgStyleGroup).map((x) => x.zh)}
                      selected={s.aiBgStyle}
                      onSelect={(v) => set("aiBgStyle", v === s.aiBgStyle ? "" : v)}
                    />
                  )}
                  {s.aiBgStyle && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 6 }}
                      onClick={() => set("aiBgStyle", "")}>✕ 清除風格</button>
                  )}
                </AccordionSection>

                {/* 參考圖 */}
                <AccordionSection title="參考圖" summary={s.aiBgRefMode === "ref" ? "風格參考" : "無"} icon="🖼">
                  <input ref={aiBgFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAiBgRefUpload} />
                  {!modelSupportsRefs(s.aiBgModel) ? (
                    <p className="form-hint">此模型純文字生圖，不支援參考圖</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        {(["none", "ref"] as const).map((mode) => (
                          <button key={mode}
                            className={s.aiBgRefMode === mode ? "btn btn-primary" : "btn btn-ghost"}
                            style={{ fontSize: 12, padding: "3px 10px" }}
                            onClick={() => {
                              set("aiBgRefMode", mode);
                              if (mode === "none") set("aiBgRefImage", null);
                            }}>
                            {{ none: "無", ref: "🖼 風格參考" }[mode]}
                          </button>
                        ))}
                      </div>
                      {s.aiBgRefMode === "ref" && (
                        <div>
                          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => aiBgFileRef.current?.click()}>
                            {s.aiBgRefImage ? "✓ 已上傳，換圖" : "上傳參考圖…"}
                          </button>
                          {s.aiBgRefImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.aiBgRefImage} alt="" style={{ display: "block", marginTop: 6, height: 60, borderRadius: 4, objectFit: "cover" }} />
                          )}
                          <p className="form-hint" style={{ marginTop: 4 }}>
                            模型仿照參考圖的風格（非內容）
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </AccordionSection>

                {/* 產品圖處理（僅當已上傳產品圖時出現） */}
                {s.productImage && (
                  <div style={{ padding: 10, background: "var(--chip-surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>📦 產品圖處理</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className={!s.aiBgCompositeProduct ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 12, padding: "3px 10px" }}
                        onClick={() => set("aiBgCompositeProduct", false)}>
                        事後疊加
                      </button>
                      <button
                        className={s.aiBgCompositeProduct ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 12, padding: "3px 10px" }}
                        onClick={() => {
                          // Composite needs a model that PLACES the product as an object (not flux-dev's
                          // img2img / ideogram-character's face ref); auto-switch to nano-banana-2 otherwise.
                          setS((prev) => {
                            const next = { ...prev, aiBgCompositeProduct: true, saved: false, error: null };
                            if (!modelCompositesProduct(prev.aiBgModel)) {
                              next.aiBgModel = "nano-banana-2";
                              next.aiBgModelGroup = "Google+";
                            }
                            return next;
                          });
                        }}>
                        AI 合成進場景
                      </button>
                    </div>
                    <p className="form-hint" style={{ marginTop: 6 }}>
                      {s.aiBgCompositeProduct
                        ? "AI 把產品放進場景（放在桌面、真實光影），匯出時不再事後疊加產品。"
                        : "AI 只生背景，產品圖事後疊在上層（可調位置/大小）。"}
                    </p>
                    {s.aiBgCompositeProduct && !modelCompositesProduct(s.aiBgModel) && (
                      <p className="form-hint" style={{ marginTop: 4, color: "var(--red)" }}>
                        ⚠ 此模型不會把產品「放進場景」（flux-dev 是 img2img、ideogram-character 是人臉參考）。請在「圖片模型」改選 Nano Banana 2/Pro、FLUX Kontext 或 GPT-Image-1。
                      </p>
                    )}
                  </div>
                )}

                {/* 組合提示詞預覽 */}
                <div style={{ marginTop: 2 }}>
                  <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 3, letterSpacing: 0.5 }}>組合提示詞預覽</div>
                  <textarea
                    className="form-input"
                    rows={2}
                    style={{ fontSize: 12, resize: "vertical", width: "100%" }}
                    value={s.aiBgPromptTouched ? s.aiBgPromptOvr : assembledBgPrompt}
                    placeholder="選擇積木後自動組合，或直接輸入…"
                    onChange={(e) => setS((prev) => ({ ...prev, aiBgPromptOvr: e.target.value, aiBgPromptTouched: true }))}
                  />
                  {s.aiBgPromptTouched && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 2 }}
                      onClick={() => setS((prev) => ({ ...prev, aiBgPromptTouched: false, aiBgPromptOvr: "" }))}>
                      ↺ 恢復自動組合
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <button
                    className="btn btn-primary"
                    disabled={s.generating || !aiBgHasInput || (s.aiBgCompositeProduct && !!s.productImage && !modelCompositesProduct(s.aiBgModel))}
                    onClick={generateAiBg}>
                    {s.generating
                      ? "生成中…"
                      : s.aiBgCompositeProduct && s.productImage
                        ? (s.bgImage && s.bgMode === "ai" ? "重新合成" : "合成產品到場景")
                        : (s.bgImage && s.bgMode === "ai" ? "重新生成" : "生成背景")}
                  </button>
                  {s.bgImage && s.bgMode === "ai" && (
                    <span className="form-hint" style={{ color: "var(--green)" }}>
                      {s.aiBgCompositeProduct && s.productImage ? "✓ 已合成" : "✓ 背景已生成"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </StepCard>

          {/* Step 4: 文字 */}
          <StepCard title="文字" step="Step 4" icon="✍" order={7}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <div className="form-row">
                <label className="form-label">標題</label>
                <input className="form-input" type="text" placeholder="主標題…"
                  value={s.headline} onChange={(e) => set("headline", e.target.value)} />
              </div>
              <div className="form-row">
                <label className="form-label">副標</label>
                <input className="form-input" type="text" placeholder="副標題或 CTA…"
                  value={s.subtext} onChange={(e) => set("subtext", e.target.value)} />
              </div>
              <div className="form-row">
                <label className="form-label">字體配對</label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {FONT_PAIRS.map((fp) => {
                    const active = s.headlineFont === fp.headline && s.fontFamily === fp.body;
                    return (
                      <button key={fp.label}
                        className={active ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: 11, padding: "2px 7px" }}
                        onClick={() => setS((prev) => ({ ...prev, headlineFont: fp.headline, fontFamily: fp.body, saved: false }))}>
                        {fp.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">標題字體</label>
                <select className="form-select" value={s.headlineFont} onChange={(e) => set("headlineFont", e.target.value)}>
                  {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">內文字體</label>
                <select className="form-select" value={s.fontFamily} onChange={(e) => set("fontFamily", e.target.value)}>
                  {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">字色</label>
                <input type="color" value={s.textColor} onChange={(e) => set("textColor", e.target.value)}
                  style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
              </div>
              <div className="form-row">
                <label className="form-label">重點字</label>
                <input type="color" value={s.accentColor} onChange={(e) => set("accentColor", e.target.value)}
                  style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
                  <input type="checkbox" checked={s.accentHighlight} onChange={(e) => set("accentHighlight", e.target.checked)} />
                  螢光底
                </label>
                <span className="form-hint" style={{ marginLeft: 6 }}>標題用 **字** 標重點，例：省 **50%**</span>
              </div>
              <div className="form-row">
                <label className="form-label">字距</label>
                <input type="range" min={-2} max={16} value={s.letterSpacing}
                  onChange={(e) => set("letterSpacing", Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.letterSpacing}</span>
              </div>
              <div className="form-row">
                <label className="form-label">標題 px</label>
                <input type="range" min={24} max={200} value={s.headlineSize}
                  onChange={(e) => set("headlineSize", Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.headlineSize}</span>
              </div>
              <div className="form-row">
                <label className="form-label">副標 px</label>
                <input type="range" min={12} max={120} value={s.subtextSize}
                  onChange={(e) => set("subtextSize", Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.subtextSize}</span>
              </div>
              <div className="form-row">
                <label className="form-label">垂直</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["top", "center", "bottom"] as TextPos[]).map((pos) => (
                    <button key={pos}
                      className={s.textPos === pos ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ fontSize: 12, padding: "3px 10px" }}
                      onClick={() => set("textPos", pos)}>
                      {{ top: "上", center: "中", bottom: "下" }[pos]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">水平</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["left", "center", "right"] as TextAlignH[]).map((a) => (
                    <button key={a}
                      className={s.textAlignH === a ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ fontSize: 12, padding: "3px 10px" }}
                      onClick={() => set("textAlignH", a)}>
                      {{ left: "左", center: "中", right: "右" }[a]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">描邊陰影</label>
                <input type="checkbox" checked={s.textOutline}
                  onChange={(e) => set("textOutline", e.target.checked)} />
                <span className="form-hint" style={{ marginLeft: 6 }}>文字在雜亂背景上也清楚</span>
              </div>
              <div className="form-row">
                <label className="form-label">文字底襯</label>
                <input type="checkbox" checked={s.textScrim}
                  onChange={(e) => set("textScrim", e.target.checked)} />
                <span className="form-hint" style={{ marginLeft: 6 }}>文字後方半透明板（比整張暗化高級）</span>
                {s.textScrim && (
                  <>
                    <input type="range" min={0.05} max={0.9} step={0.05} value={s.textScrimOpacity}
                      onChange={(e) => set("textScrimOpacity", Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
                    <span style={{ fontSize: 12, opacity: 0.7, minWidth: 32 }}>{Math.round(s.textScrimOpacity * 100)}%</span>
                  </>
                )}
              </div>
              <div className="form-row">
                <label className="form-label">暗化背景</label>
                <input type="checkbox" checked={s.dimOverlay}
                  onChange={(e) => set("dimOverlay", e.target.checked)} />
                <span className="form-hint" style={{ marginLeft: 6 }}>整張壓暗</span>
                {s.dimOverlay && (
                  <>
                    <input type="range" min={0.05} max={0.85} step={0.05} value={s.dimOverlayOpacity}
                      onChange={(e) => set("dimOverlayOpacity", Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
                    <span style={{ fontSize: 12, opacity: 0.7, minWidth: 32 }}>{Math.round(s.dimOverlayOpacity * 100)}%</span>
                  </>
                )}
              </div>
            </div>
          </StepCard>

          {/* Step 4.5: 行銷元素 — conversion drivers */}
          <StepCard title="行銷元素" step="Step 4.5" icon="🛒" hint="讓人點擊下單" order={8}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>

              {/* CTA 按鈕 */}
              <AccordionSection title="CTA 按鈕" summary={s.ctaText || "無"} icon="🛒" defaultOpen>
                <input className="form-input" type="text" placeholder="例：立即選購、馬上搶購…"
                  value={s.ctaText} onChange={(e) => set("ctaText", e.target.value)}
                  style={{ width: "100%", fontSize: 13, marginBottom: 4 }} />
                <PresetChips chips={CTA_PRESETS} selected={s.ctaText}
                  onSelect={(v) => set("ctaText", v === s.ctaText ? "" : v)} />
                {s.ctaText && (
                  <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      底色 <input type="color" value={s.ctaBg.startsWith("#") ? s.ctaBg : "#ff5a5f"}
                        onChange={(e) => set("ctaBg", e.target.value)}
                        style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
                    </label>
                    <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      字色 <input type="color" value={s.ctaTextColor}
                        onChange={(e) => set("ctaTextColor", e.target.value)}
                        style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
                    </label>
                  </div>
                )}
              </AccordionSection>

              {/* 促銷徽章 */}
              <AccordionSection title="促銷徽章" summary={s.badgeText || "無"} icon="🏷">
                <input className="form-input" type="text" placeholder="例：限時優惠、母親節限定…"
                  value={s.badgeText} onChange={(e) => set("badgeText", e.target.value)}
                  style={{ width: "100%", fontSize: 13, marginBottom: 4 }} />
                <PresetChips chips={BADGE_PRESETS} selected={s.badgeText}
                  onSelect={(v) => set("badgeText", v === s.badgeText ? "" : v)} />
                {s.badgeText && (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                      {(["ribbon", "pill", "burst"] as BadgeStyle[]).map((st) => (
                        <button key={st}
                          className={s.badgeStyle === st ? "btn btn-primary" : "btn btn-ghost"}
                          style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={() => set("badgeStyle", st)}>
                          {{ ribbon: "緞帶", pill: "膠囊", burst: "爆炸星" }[st]}
                        </button>
                      ))}
                      {(["tl", "tr"] as BadgePos[]).map((pos) => (
                        <button key={pos}
                          className={s.badgePos === pos ? "btn btn-primary" : "btn btn-ghost"}
                          style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={() => set("badgePos", pos)}>
                          {{ tl: "左上", tr: "右上" }[pos]}
                        </button>
                      ))}
                      <input type="color" value={s.badgeColor}
                        onChange={(e) => set("badgeColor", e.target.value)}
                        style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
                    </div>
                    <div className="form-row" style={{ marginTop: 8 }}>
                      <label className="form-label">徽章大小</label>
                      <input type="range" min={0.5} max={2.5} step={0.1} value={s.badgeScale}
                        onChange={(e) => set("badgeScale", Number(e.target.value))} style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 32 }}>{s.badgeScale.toFixed(1)}×</span>
                    </div>
                  </>
                )}
              </AccordionSection>

              {/* 價格 */}
              <AccordionSection title="價格" summary={s.showPrice ? (s.priceNow || "已開") : "無"} icon="💰">
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <input type="checkbox" checked={s.showPrice} onChange={(e) => set("showPrice", e.target.checked)} />
                  顯示價格
                </label>
                {s.showPrice && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="form-input" type="text" placeholder="現價 例：NT$590"
                      value={s.priceNow} onChange={(e) => set("priceNow", e.target.value)}
                      style={{ flex: 1, fontSize: 13 }} />
                    <input className="form-input" type="text" placeholder="原價 例：NT$890"
                      value={s.priceWas} onChange={(e) => set("priceWas", e.target.value)}
                      style={{ flex: 1, fontSize: 13 }} />
                  </div>
                )}
              </AccordionSection>

              {/* 信任標記 */}
              <AccordionSection title="信任標記" summary={s.trustType === "none" ? "無" : { stars: "評分", reviews: "評論", guarantee: "保固" }[s.trustType]} icon="⭐">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["none", "stars", "reviews", "guarantee"] as TrustType[]).map((tt) => (
                    <button key={tt}
                      className={s.trustType === tt ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => set("trustType", tt)}>
                      {{ none: "無", stars: "★ 評分", reviews: "評論數", guarantee: "保固" }[tt]}
                    </button>
                  ))}
                </div>
                {(s.trustType === "stars" || s.trustType === "reviews") && (
                  <div className="form-row" style={{ marginTop: 8 }}>
                    <label className="form-label">星數</label>
                    <input type="range" min={1} max={5} value={s.trustStars}
                      onChange={(e) => set("trustStars", Number(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>{s.trustStars}★</span>
                  </div>
                )}
                {(s.trustType === "reviews" || s.trustType === "guarantee") && (
                  <input className="form-input" type="text"
                    placeholder={s.trustType === "reviews" ? "例：12,000+ 則好評" : "例：30 天滿意保證"}
                    value={s.trustText} onChange={(e) => set("trustText", e.target.value)}
                    style={{ width: "100%", fontSize: 13, marginTop: 8 }} />
                )}
              </AccordionSection>

            </div>
          </StepCard>

          {/* Export */}
          <div className="card" style={{ order: 9 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 5 · 匯出</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={s.saving || s.generating || s.productRemoving}>
                {s.saving ? "儲存中…" : s.saved ? "✓ 已存到圖庫" : "存到圖庫"}
              </button>
              <button className="btn btn-ghost" onClick={handleDownload}
                disabled={s.generating || s.productRemoving}>
                下載 PNG
              </button>
              <button className="btn btn-ghost" onClick={handleOpenInCanvas}
                disabled={s.generating || s.productRemoving}>
                在 Canvas Editor 開啟
              </button>
            </div>
            {s.saved && (
              <p className="form-hint" style={{ marginTop: 8, color: "var(--green)" }}>
                ✓ 已儲存至 {designsHref ? <a href={designsHref} style={{ color: "var(--green)" }}>My Designs</a> : "My Designs"}
              </p>
            )}
          </div>

        </div>

        {/* ── Preview (left side, sticky) ── */}
        <div style={{
          order: 1, flex: "1.7 1 520px", minWidth: 320,
          position: "sticky", top: 12, alignSelf: "flex-start",
        }}>

          {/* Preview */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>
                預覽 · {p.label}
                <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12, marginLeft: 6 }}>{p.w}×{p.h}</span>
              </h2>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "2px 9px" }}
                  disabled={!canUndo} onClick={undo} title="復原">↩ 復原</button>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "2px 9px" }}
                  disabled={!canRedo} onClick={redo} title="重做">↪ 重做</button>
              </div>
            </div>
            <div style={{
              display: "inline-block", maxWidth: "100%", minHeight: previewUrl ? undefined : 240,
              position: "relative", borderRadius: 6, overflow: "hidden",
              background: "var(--chip-surface)",
              backgroundImage:
                "linear-gradient(45deg,#0001 25%,transparent 25%),linear-gradient(-45deg,#0001 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0001 75%),linear-gradient(-45deg,transparent 75%,#0001 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
            }}>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="banner preview"
                  style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 230px)", width: "auto", height: "auto" }} />
              )}
              {(s.generating || s.productRemoving || s.designing) && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--btn-primary-text)", fontSize: 14,
                }}>
                  {s.productRemoving ? "去背中…" : s.designing ? "AI 設計中…" : "AI 生成中…"}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
