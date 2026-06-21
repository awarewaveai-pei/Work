"use client";

import { useCallback, useRef, useState } from "react";
import { roleHeader } from "../../../lib/ops-role";
import { openInCanvas } from "@/components/tools/canvas-handoff";

// ---------------------------------------------------------------------------
// Size presets & constants
// ---------------------------------------------------------------------------

const PRESETS = {
  "fb-cover":  { label: "FB Cover",       w: 1200, h: 630,  aspect: "3:2"  },
  "ig-post":   { label: "IG Post",         w: 1080, h: 1080, aspect: "1:1"  },
  "ig-story":  { label: "IG Story",        w: 1080, h: 1920, aspect: "9:16" },
  "yt-thumb":  { label: "YT Thumbnail",    w: 1280, h: 720,  aspect: "16:9" },
  "linkedin":  { label: "LinkedIn Banner", w: 1584, h: 396,  aspect: "16:9" },
  "twitter":   { label: "Twitter Header",  w: 1500, h: 500,  aspect: "16:9" },
} as const satisfies Record<string, { label: string; w: number; h: number; aspect: string }>;
type PresetKey = keyof typeof PRESETS;

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

type BgMode  = "color" | "gradient" | "upload" | "ai";
type TextPos = "top" | "center" | "bottom";

interface State {
  preset:    PresetKey;
  bgMode:    BgMode;
  bgColor:   string;
  gradFrom:  string;
  gradTo:    string;
  gradAngle: string;
  bgImage:   string | null;
  headline:  string;
  subtext:   string;
  textColor: string;
  fontFamily: string;
  headlineSize: number;
  subtextSize:  number;
  textPos:   TextPos;
  dimOverlay: boolean;
  aiPrompt:  string;
  aiModel:   string;
  generating: boolean;
  saving:    boolean;
  saved:     boolean;
  error:     string | null;
}

const INIT: State = {
  preset:    "ig-post",
  bgMode:    "color",
  bgColor:   "#1a1a2e",
  gradFrom:  "#667eea",
  gradTo:    "#764ba2",
  gradAngle: "135deg",
  bgImage:   null,
  headline:  "",
  subtext:   "",
  textColor: "#ffffff",
  fontFamily: FONTS[0].value,
  headlineSize: 64,
  subtextSize:  32,
  textPos:   "center",
  dimOverlay: true,
  aiPrompt:  "",
  aiModel:   "flux-dev",
  generating: false,
  saving:    false,
  saved:     false,
  error:     null,
};

// ---------------------------------------------------------------------------
// Canvas export helper
// ---------------------------------------------------------------------------

async function exportToPng(state: State): Promise<string> {
  const p = PRESETS[state.preset];
  const canvas = document.createElement("canvas");
  canvas.width  = p.w;
  canvas.height = p.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  // Background
  if (state.bgMode === "color") {
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, p.w, p.h);
  } else if (state.bgMode === "gradient") {
    const angleDeg = parseFloat(state.gradAngle);
    const rad      = (angleDeg * Math.PI) / 180;
    const cx       = p.w / 2;
    const cy       = p.h / 2;
    const halfLen  = Math.sqrt(cx * cx + cy * cy);
    const grd = ctx.createLinearGradient(
      cx - Math.cos(rad) * halfLen, cy - Math.sin(rad) * halfLen,
      cx + Math.cos(rad) * halfLen, cy + Math.sin(rad) * halfLen,
    );
    grd.addColorStop(0, state.gradFrom);
    grd.addColorStop(1, state.gradTo);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, p.w, p.h);
  } else if (state.bgImage) {
    await new Promise<void>((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const scale = Math.max(p.w / img.width, p.h / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, (p.w - sw) / 2, (p.h - sh) / 2, sw, sh);
        res();
      };
      img.onerror = () => rej(new Error("bg_image_load_failed"));
      img.src = state.bgImage!;
    });
  } else {
    ctx.fillStyle = state.bgColor;
    ctx.fillRect(0, 0, p.w, p.h);
  }

  // Dim overlay
  if (state.dimOverlay) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, p.w, p.h);
  }

  // Text
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
  if (state.textPos === "top")    blockY = padding + blockH / 2;
  else if (state.textPos === "bottom") blockY = p.h - padding - blockH / 2;
  else blockY = p.h / 2;

  if (state.headline) {
    ctx.font = `bold ${state.headlineSize}px ${state.fontFamily}`;
    const lines = wrapText(ctx, state.headline, maxWidth, state.headlineSize);
    const totalH = lines.length * state.headlineSize * 1.2;
    let y = blockY - blockH / 2 + state.headlineSize / 2;
    for (const line of lines) {
      ctx.fillText(line, p.w / 2, y);
      y += state.headlineSize * 1.2;
    }
    blockY = blockY - blockH / 2 + totalH + gap + subtextH / 2;
  }
  if (state.subtext) {
    ctx.font = `${state.subtextSize}px ${state.fontFamily}`;
    const lines = wrapText(ctx, state.subtext, maxWidth, state.subtextSize);
    let y = state.headline
      ? blockY
      : blockY - subtextH / 2 + state.subtextSize / 2;
    for (const line of lines) {
      ctx.fillText(line, p.w / 2, y);
      y += state.subtextSize * 1.2;
    }
  }

  return canvas.toDataURL("image/png");
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number): string[] {
  const words  = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BannerStudio() {
  const [s, setS] = useState<State>(INIT);
  const fileRef   = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof State>(key: K, val: State[K]) =>
    setS((prev) => ({ ...prev, [key]: val, saved: key === "saved" ? val as boolean : false, error: null }))
  , []);

  const p = PRESETS[s.preset];

  // Preview aspect ratio (clamped so very tall/wide stays usable)
  const previewW = 520;
  const previewH = Math.round(previewW * (p.h / p.w));

  // CSS background for preview
  function previewBg(): React.CSSProperties {
    if ((s.bgMode === "upload" || s.bgMode === "ai") && s.bgImage) {
      return { backgroundImage: `url(${s.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" };
    }
    if (s.bgMode === "gradient") {
      return { backgroundImage: `linear-gradient(${s.gradAngle}, ${s.gradFrom}, ${s.gradTo})` };
    }
    return { backgroundColor: s.bgColor };
  }

  function textBlockStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      position:  "absolute",
      left:      "7%",
      right:     "7%",
      textAlign: "center",
      color:     s.textColor,
      fontFamily: s.fontFamily,
      pointerEvents: "none",
    };
    if (s.textPos === "top")    return { ...base, top:    "8%" };
    if (s.textPos === "bottom") return { ...base, bottom: "8%" };
    return { ...base, top: "50%", transform: "translateY(-50%)" };
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setS((prev) => ({ ...prev, bgImage: reader.result as string, bgMode: "upload", error: null }));
    reader.readAsDataURL(file);
  }

  async function generateAiBg() {
    if (!s.aiPrompt.trim()) return;
    setS((prev) => ({ ...prev, generating: true, error: null }));
    try {
      const res = await fetch("/api/tools/tarot/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({
          model:       s.aiModel,
          prompt:      s.aiPrompt,
          aspectRatio: p.aspect,
        }),
      });
      const data = await res.json() as { ok: boolean; image?: string; error?: string };
      if (!data.ok || !data.image) throw new Error(data.error ?? "generation_failed");
      setS((prev) => ({ ...prev, bgImage: data.image!, bgMode: "ai", generating: false }));
    } catch (err) {
      setS((prev) => ({ ...prev, generating: false, error: String(err) }));
    }
  }

  async function handleSave() {
    setS((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const png = await exportToPng(s);
      const res = await fetch("/api/tools/designs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image:     png,
          source:    "banner",
          prompt:    s.headline || s.aiPrompt || undefined,
          modelName: s.bgMode === "ai" ? s.aiModel : undefined,
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
        社群媒體橫幅生成器 · AI 背景 + 文字排版 · 匯出高解析 PNG
      </p>

      {s.error && (
        <div className="form-message" style={{ marginBottom: 16, color: "var(--red)" }}>
          ⚠ {s.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── Left: controls ── */}
        <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Step 1: Size */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 1 · 尺寸</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                <button
                  key={k}
                  className={s.preset === k ? "btn btn-primary" : "btn btn-ghost"}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => set("preset", k)}
                >
                  {PRESETS[k].label}
                  <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 10 }}>
                    {PRESETS[k].w}×{PRESETS[k].h}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Background */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 2 · 背景</h2>

            <div className="form-row">
              <label className="form-label">類型</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["color", "gradient", "upload", "ai"] as BgMode[]).map((m) => (
                  <button
                    key={m}
                    className={s.bgMode === m ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => set("bgMode", m)}
                  >
                    {{ color: "純色", gradient: "漸層", upload: "上傳圖", ai: "AI 生成" }[m]}
                  </button>
                ))}
              </div>
            </div>

            {s.bgMode === "color" && (
              <div className="form-row" style={{ marginTop: 10 }}>
                <label className="form-label">背景色</label>
                <input
                  type="color"
                  value={s.bgColor}
                  onChange={(e) => set("bgColor", e.target.value)}
                  style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }}
                />
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
                        onClick={() => set("gradAngle", d.value)}
                      >{d.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {s.bgMode === "upload" && (
              <div style={{ marginTop: 10 }}>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
                <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>
                  {s.bgImage ? "✓ 已上傳，點此換圖" : "選擇圖片…"}
                </button>
              </div>
            )}

            {s.bgMode === "ai" && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="form-row">
                  <label className="form-label">模型</label>
                  <select className="form-select" value={s.aiModel} onChange={(e) => set("aiModel", e.target.value)}>
                    <option value="flux-schnell">FLUX schnell（快/省）</option>
                    <option value="flux-dev">FLUX dev（推薦）</option>
                    <option value="ideogram-v3-balanced">Ideogram v3</option>
                    <option value="ideogram-v4-turbo">Ideogram v4 Turbo</option>
                    <option value="imagen-4">Imagen 4</option>
                    <option value="openai-medium">GPT-Image-1 中</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">描述</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="e.g. serene mountain landscape at golden hour, cinematic..."
                    value={s.aiPrompt}
                    onChange={(e) => set("aiPrompt", e.target.value)}
                    style={{ resize: "vertical", fontSize: 13 }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  disabled={s.generating || !s.aiPrompt.trim()}
                  onClick={generateAiBg}
                  style={{ alignSelf: "flex-start" }}
                >
                  {s.generating ? "生成中…" : s.bgImage ? "重新生成" : "生成背景"}
                </button>
                {s.bgImage && s.bgMode === "ai" && (
                  <span className="form-hint" style={{ color: "var(--green)" }}>✓ 背景已生成</span>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Text */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 3 · 文字</h2>

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
                  onChange={(e) => set("headlineSize", Number(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.headlineSize}</span>
              </div>

              <div className="form-row">
                <label className="form-label">副標 px</label>
                <input type="range" min={12} max={120} value={s.subtextSize}
                  onChange={(e) => set("subtextSize", Number(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.subtextSize}</span>
              </div>

              <div className="form-row">
                <label className="form-label">位置</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["top", "center", "bottom"] as TextPos[]).map((pos) => (
                    <button key={pos}
                      className={s.textPos === pos ? "btn btn-primary" : "btn btn-ghost"}
                      style={{ fontSize: 12, padding: "3px 10px" }}
                      onClick={() => set("textPos", pos)}
                    >{{ top: "上", center: "中", bottom: "下" }[pos]}</button>
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
              預覽 · {p.label} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>{p.w}×{p.h}</span>
            </h2>
            <div
              style={{
                width: previewW,
                height: previewH,
                maxWidth: "100%",
                position: "relative",
                borderRadius: 6,
                overflow: "hidden",
                ...previewBg(),
              }}
            >
              {/* Dim overlay */}
              {s.dimOverlay && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(0,0,0,0.45)",
                }} />
              )}

              {/* Text block */}
              {(s.headline || s.subtext) && (
                <div style={textBlockStyle()}>
                  {s.headline && (
                    <div style={{
                      fontSize: scaledHeadline,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      marginBottom: s.subtext ? Math.round(scaledHeadline * 0.3) : 0,
                      textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                    }}>
                      {s.headline}
                    </div>
                  )}
                  {s.subtext && (
                    <div style={{
                      fontSize: scaledSubtext,
                      lineHeight: 1.4,
                      opacity: 0.9,
                      textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                    }}>
                      {s.subtext}
                    </div>
                  )}
                </div>
              )}

              {/* Loading overlay */}
              {s.generating && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 14,
                }}>
                  AI 生成中…
                </div>
              )}
            </div>
          </div>

          {/* Export actions */}
          <div className="card">
            <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Step 4 · 匯出</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={s.saving || s.generating}>
                {s.saving ? "儲存中…" : s.saved ? "✓ 已存到圖庫" : "存到圖庫"}
              </button>
              <button className="btn btn-ghost" onClick={handleDownload} disabled={s.generating}>
                下載 PNG
              </button>
              <button className="btn btn-ghost" onClick={handleOpenInCanvas} disabled={s.generating}>
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
