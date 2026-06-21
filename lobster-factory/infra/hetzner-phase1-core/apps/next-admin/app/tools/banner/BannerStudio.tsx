"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { roleHeader } from "../../../lib/ops-role";
import { openInCanvas } from "@/components/tools/canvas-handoff";
import { STUDIO_MODEL_OPTIONS, type StudioModel } from "../../../lib/studio/model-options";
import { STYLE_CATALOG, resolveStylePrompt } from "../../tools/tarot/tarotStyles";

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
  generating: boolean;
  // AI bg blocks
  aiBgSubject:       string;
  aiBgVibe:          string;
  aiBgStyle:         string;
  aiBgModel:         StudioModel;
  aiBgRefImage:      string | null;
  aiBgRefMode:       "none" | "ref";
  aiBgPromptOvr:     string;
  aiBgPromptTouched: boolean;
  aiBgModelGroup:    string;
  // text
  headline:  string;
  subtext:   string;
  textColor: string;
  fontFamily: string;
  headlineSize: number;
  subtextSize:  number;
  textPos:   TextPos;
  dimOverlay: boolean;
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
  generating: false,
  aiBgSubject:       "",
  aiBgVibe:          "",
  aiBgStyle:         "",
  aiBgModel:         "flux-dev",
  aiBgRefImage:      null,
  aiBgRefMode:       "none",
  aiBgPromptOvr:     "",
  aiBgPromptTouched: false,
  aiBgModelGroup:    "BFL",
  headline:  "",
  subtext:   "",
  textColor: "#ffffff",
  fontFamily: FONTS[0].value,
  headlineSize: 64,
  subtextSize:  32,
  textPos:   "center",
  dimOverlay: true,
  saving:    false,
  saved:     false,
  error:     null,
};

// ---------------------------------------------------------------------------
// Canvas export  (layer order: bg → dim → product → text)
// ---------------------------------------------------------------------------

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => res(img);
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
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, p.w, p.h);
  }

  if (state.productImage) {
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

  const padding  = Math.round(p.w * 0.07);
  const maxWidth = p.w - padding * 2;
  ctx.fillStyle  = state.textColor;
  ctx.textAlign  = "center";
  ctx.textBaseline = "middle";

  const headlineH = state.headline ? state.headlineSize : 0;
  const subtextH  = state.subtext  ? state.subtextSize  : 0;
  const gap       = state.headline && state.subtext ? Math.round(state.headlineSize * 0.5) : 0;
  const blockH    = headlineH + gap + subtextH;

  let blockY: number;
  if (state.textPos === "top")         blockY = padding + blockH / 2;
  else if (state.textPos === "bottom") blockY = p.h - padding - blockH / 2;
  else                                  blockY = p.h / 2;

  if (state.headline) {
    ctx.font = `bold ${state.headlineSize}px ${state.fontFamily}`;
    const lines  = wrapText(ctx, state.headline, maxWidth);
    const totalH = lines.length * state.headlineSize * 1.2;
    let y = blockY - blockH / 2 + state.headlineSize / 2;
    for (const line of lines) { ctx.fillText(line, p.w / 2, y); y += state.headlineSize * 1.2; }
    blockY = blockY - blockH / 2 + totalH + gap + subtextH / 2;
  }
  if (state.subtext) {
    ctx.font = `${state.subtextSize}px ${state.fontFamily}`;
    const lines = wrapText(ctx, state.subtext, maxWidth);
    let y = state.headline ? blockY : blockY - subtextH / 2 + state.subtextSize / 2;
    for (const line of lines) { ctx.fillText(line, p.w / 2, y); y += state.subtextSize * 1.2; }
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
        <div style={{ marginTop: 4, padding: 10, background: "var(--chip-surface, #f7f9fc)", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)" }}>
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
              background: active ? "#6366f1" : "var(--chip-bg, #eef1f7)",
              border: `1px solid ${active ? "#6366f1" : "var(--border, #d4d9e8)"}`,
              cursor: "pointer", color: active ? "#fff" : "var(--text-muted, #3a4560)",
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BannerStudio() {
  const [s, setS]         = useState<State>(INIT);
  const bgFileRef         = useRef<HTMLInputElement>(null);
  const productFileRef    = useRef<HTMLInputElement>(null);
  const aiBgFileRef       = useRef<HTMLInputElement>(null);
  const [aiBgStyleGroup, setAiBgStyleGroup] = useState("不指定");

  const set = useCallback(<K extends keyof State>(key: K, val: State[K]) =>
    setS((prev) => ({ ...prev, [key]: val, saved: key === "saved" ? (val as boolean) : false, error: null }))
  , []);

  const p        = PRESETS[s.preset];
  const previewW = 520;
  const previewH = Math.round(previewW * (p.h / p.w));

  // Assembled AI bg prompt from blocks
  const assembledBgPrompt = useMemo(() => {
    const styleStr = s.aiBgStyle ? resolveStylePrompt(s.aiBgStyle) : "";
    const parts = [s.aiBgSubject.trim(), s.aiBgVibe.trim(), styleStr, "banner background image"].filter(Boolean);
    return parts.join(", ");
  }, [s.aiBgSubject, s.aiBgVibe, s.aiBgStyle]);

  const effectiveBgPrompt = s.aiBgPromptTouched ? s.aiBgPromptOvr : assembledBgPrompt;

  // ── Preview helpers ──
  function previewBg(): React.CSSProperties {
    if ((s.bgMode === "upload" || s.bgMode === "ai") && s.bgImage)
      return { backgroundImage: `url(${s.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" };
    if (s.bgMode === "gradient")
      return { backgroundImage: `linear-gradient(${s.gradAngle}, ${s.gradFrom}, ${s.gradTo})` };
    return { backgroundColor: s.bgColor };
  }

  function productPreviewStyle(): React.CSSProperties {
    const base: React.CSSProperties = { position: "absolute", pointerEvents: "none", objectFit: "contain", maxHeight: "85%" };
    const wPct = `${Math.round(s.productScale * (s.productPos === "center" ? 70 : 45))}%`;
    switch (s.productPos) {
      case "left":         return { ...base, width: wPct, left: "5%",  top:    "50%", transform: "translateY(-50%)" };
      case "right":        return { ...base, width: wPct, right: "5%", top:    "50%", transform: "translateY(-50%)" };
      case "bottom-right": return { ...base, width: wPct, right: "5%", bottom: "5%" };
      default:             return { ...base, width: wPct, left: "50%", top:    "50%", transform: "translate(-50%,-50%)" };
    }
  }

  function textBlockStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      position: "absolute", left: "7%", right: "7%",
      textAlign: "center", color: s.textColor, fontFamily: s.fontFamily, pointerEvents: "none",
    };
    if (s.textPos === "top")    return { ...base, top:    "8%" };
    if (s.textPos === "bottom") return { ...base, bottom: "8%" };
    return { ...base, top: "50%", transform: "translateY(-50%)" };
  }

  // ── Handlers ──

  async function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = () => setS((prev) => ({ ...prev, bgImage: reader.result as string, bgMode: "upload", error: null }));
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
    if (!effectiveBgPrompt.trim()) return;
    setS((prev) => ({ ...prev, generating: true, error: null }));
    try {
      const refs = s.aiBgRefMode === "ref" && s.aiBgRefImage ? [s.aiBgRefImage] : [];
      const res  = await fetch("/api/tools/studio/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body:    JSON.stringify({
          model:           s.aiBgModel,
          prompt:          effectiveBgPrompt,
          referenceImages: refs,
          aspectRatio:     p.aspect,
        }),
      });
      const data = await res.json() as { ok: boolean; image?: string; error?: string };
      if (!data.ok || !data.image) throw new Error(data.error ?? "generation_failed");
      setS((prev) => ({ ...prev, bgImage: data.image!, bgMode: "ai", generating: false }));
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
      const res = await fetch("/api/tools/script-forge", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body:    JSON.stringify({ prompt: langified, model: "claude-sonnet-4-6" }),
      });
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
          prompt:    s.headline || effectiveBgPrompt || undefined,
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

  const scaledHeadline = Math.round(s.headlineSize * (previewW / p.w));
  const scaledSubtext  = Math.round(s.subtextSize  * (previewW / p.w));

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

        {/* ── Left: controls ── */}
        <div style={{ flex: "0 0 340px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Step 0: 文案生成 */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 0 · 文案生成 <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 11 }}>選填</span></h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              <button className="btn btn-primary" disabled={s.copyGenerating || !s.copyBrief.trim()}
                onClick={generateCopy} style={{ alignSelf: "flex-start" }}>
                {s.copyGenerating ? "生成中…" : "生成文案"}
              </button>
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
          </div>

          {/* Step 1: 尺寸 */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 1 · 尺寸</h2>
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
          </div>

          {/* Step 2: 產品圖 */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 2 · 產品圖 <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 11 }}>選填</span></h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                    onClick={() => setS((prev) => ({ ...prev, productOrig: null, productImage: null, saved: false }))}>
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
          </div>

          {/* Step 3: 背景 */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 3 · 背景</h2>
            <div className="form-row">
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
                  <PresetChips chips={BG_VIBE_PRESETS} selected={s.aiBgVibe}
                    onSelect={(v) => set("aiBgVibe", v === s.aiBgVibe ? "" : v)} />
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
                </AccordionSection>

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
                  <button className="btn btn-primary" disabled={s.generating || !effectiveBgPrompt.trim()}
                    onClick={generateAiBg}>
                    {s.generating ? "生成中…" : s.bgImage && s.bgMode === "ai" ? "重新生成" : "生成背景"}
                  </button>
                  {s.bgImage && s.bgMode === "ai" && (
                    <span className="form-hint" style={{ color: "var(--green)" }}>✓ 背景已生成</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 4: 文字 */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 4 · 文字</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                <label className="form-label">字體</label>
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
                <label className="form-label">位置</label>
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
                <label className="form-label">暗化背景</label>
                <input type="checkbox" checked={s.dimOverlay}
                  onChange={(e) => set("dimOverlay", e.target.checked)} />
                <span className="form-hint" style={{ marginLeft: 6 }}>讓文字更易讀</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Right: preview + export ── */}
        <div style={{ flex: 1, minWidth: 300 }}>

          {/* Preview */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>
              預覽 · {p.label}
              <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12, marginLeft: 6 }}>{p.w}×{p.h}</span>
            </h2>
            <div style={{
              width: previewW, height: previewH, maxWidth: "100%",
              position: "relative", borderRadius: 6, overflow: "hidden",
              ...previewBg(),
            }}>
              {s.dimOverlay && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
              )}
              {s.productImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.productImage} alt="" style={productPreviewStyle()} />
              )}
              {(s.headline || s.subtext) && (
                <div style={textBlockStyle()}>
                  {s.headline && (
                    <div style={{
                      fontSize: scaledHeadline, fontWeight: 700, lineHeight: 1.2,
                      marginBottom: s.subtext ? Math.round(scaledHeadline * 0.3) : 0,
                      textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                    }}>{s.headline}</div>
                  )}
                  {s.subtext && (
                    <div style={{
                      fontSize: scaledSubtext, lineHeight: 1.4, opacity: 0.9,
                      textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                    }}>{s.subtext}</div>
                  )}
                </div>
              )}
              {(s.generating || s.productRemoving) && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 14,
                }}>
                  {s.productRemoving ? "去背中…" : "AI 生成中…"}
                </div>
              )}
            </div>
          </div>

          {/* Export */}
          <div className="card">
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
                ✓ 已儲存至 <a href="/tools/designs" style={{ color: "var(--green)" }}>My Designs</a>
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
