"use client";
import { useRef, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { CANVAS_STAFF_HREF, openInCanvas } from "@/components/tools/canvas-handoff";
import { useDoorHref } from "@/app/DoorContext";
import { fetchAwaitingCodex } from "@/lib/studio/codex-wait";
import { STUDIO_MODEL_OPTIONS, modelSupportsRefs, modelCompositesProduct } from "@/lib/studio/model-options";
import { STYLE_CATALOG } from "../../tarot/tarotStyles";
import { BANNER_RETURN_TOOL } from "../banner-canvas-return";
import { ntdLabel, removeBgNtd } from "../banner-design";
import type { GroundingOpts } from "../product-grounding";
import { BG_PLACE_RESET, PRESETS, aiBgPromptOf, type BgMode, type ProductPos } from "../banner-state";
import type { StepSlot } from "./order";
import { AccordionSection, PresetChips, StepCard, SubHead, type StepCtx } from "./ui";

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

const BG_MODE_LABEL: Record<BgMode, string> = { color: "純色", gradient: "漸層", upload: "上傳圖", ai: "AI 生成" };

export default function StepCanvas({ slot, s, set, setS }: StepCtx & { slot: StepSlot }) {
  const canvasHref = useDoorHref(CANVAS_STAFF_HREF);
  const bgFileRef         = useRef<HTMLInputElement>(null);
  const productFileRef    = useRef<HTMLInputElement>(null);
  const aiBgFileRef       = useRef<HTMLInputElement>(null);
  const [aiBgStyleGroup, setAiBgStyleGroup] = useState("不指定");
  const p = PRESETS[s.preset];
  const effectiveBgPrompt = aiBgPromptOf(s);
  const assembledBgPrompt = aiBgPromptOf({ ...s, aiBgPromptTouched: false });
  // In composite mode the product image alone is enough input (a scene description is optional);
  // otherwise at least one prompt block must be filled.
  const aiBgHasInput =
    !!(s.aiBgSubject || s.aiBgVibe || s.aiBgStyle || s.aiBgPromptTouched) ||
    (s.aiBgCompositeProduct && !!s.productImage);

  async function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = () => setS((prev) => ({ ...prev, bgImage: reader.result as string, bgMode: "upload", bgImageHasProduct: false, ...BG_PLACE_RESET, error: null }));
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
    const orig = s.productOrig; // the product may be replaced (換圖 / 傳回) while this runs: then the cut-out is stale
    setS((prev) => ({ ...prev, productRemoving: true, error: null }));
    try {
      const res  = await fetch("/api/tools/studio/remove-bg", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body:    JSON.stringify({ image: orig }),
      });
      const data = await res.json() as { ok: boolean; image?: string; error?: string };
      if (!data.ok || !data.image) throw new Error(data.error ?? "remove_bg_failed");
      setS((prev) => (prev.productOrig === orig ? { ...prev, productImage: data.image!, productRemoving: false } : { ...prev, productRemoving: false }));
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

      const res  = await fetchAwaitingCodex("/api/tools/studio/generate", {
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
      setS((prev) => ({ ...prev, bgImage: data.image!, bgMode: "ai", bgImageHasProduct: compositing, ...BG_PLACE_RESET, generating: false }));
    } catch (err) {
      setS((prev) => ({ ...prev, generating: false, error: String(err) }));
    }
  }

  const bgCanvasButton = s.bgImage && canvasHref ? (
    <button className="btn btn-ghost" style={{ fontSize: 12, marginLeft: 6 }} data-testid="banner-bg-canvas"
      onClick={() => void openInCanvas(s.bgImage!, `banner-${s.preset}-背景`, canvasHref, undefined, { tool: BANNER_RETURN_TOOL, slot: "bg", label: "Banner 背景" })}>
      ✏️ 在畫布編輯
    </button>
  ) : null;

  return (
    <StepCard title={slot.title} step={slot.no} icon="🎆" summary={`${BG_MODE_LABEL[s.bgMode]}${s.productImage ? " · 產品圖" : ""}`}>
      <SubHead first={true}>背景</SubHead>
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
          {bgCanvasButton}
        </div>
      )}

      {(s.bgMode === "upload" || s.bgMode === "ai") && s.bgImage && (
        <div className="form-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>
          <label className="form-label">圖片位置</label>
          <span className="form-hint" style={{ width: "100%" }}>在預覽圖上按住拖曳移動；按住 Ctrl（Mac 按 ⌘）再滾輪，或觸控板兩指開合，放大縮小。一般滾輪是捲動頁面。縮小露出的地方是背景色。</span>
          <span style={{ fontSize: 12 }}>大小</span>
          <input type="range" min={0.5} max={3} step={0.05} value={s.bgImgScale} data-testid="banner-bg-scale"
            onChange={(e) => set("bgImgScale", Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
          <span style={{ fontSize: 12, opacity: 0.7, minWidth: 40 }}>{Math.round(s.bgImgScale * 100)}%</span>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            底色 <input type="color" value={s.bgColor} onChange={(e) => set("bgColor", e.target.value)} data-testid="banner-bg-under-color"
              style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
          </label>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} data-testid="banner-bg-reset"
            onClick={() => setS((prev) => ({ ...prev, ...BG_PLACE_RESET, saved: false, error: null }))}>重設</button>
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
                <p className="form-hint" style={{ marginTop: 4, color: "var(--badge-red-text)" }}>
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
                : `${s.aiBgCompositeProduct && s.productImage
                  ? (s.bgImage && s.bgMode === "ai" ? "重新合成" : "合成產品到場景")
                  : (s.bgImage && s.bgMode === "ai" ? "重新生成" : "生成背景")}（${ntdLabel(STUDIO_MODEL_OPTIONS.find((m) => m.value === s.aiBgModel)?.costNt ?? 0)}）`}
            </button>
            {s.bgImage && s.bgMode === "ai" && (
              <span className="form-hint" style={{ color: "var(--badge-green-text)" }}>
                {s.aiBgCompositeProduct && s.productImage ? "✓ 已合成" : "✓ 背景已生成"}
              </span>
            )}
            {s.bgMode === "ai" && bgCanvasButton}
          </div>
        </div>
      )}
      <SubHead first={false}>產品圖</SubHead>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        <input ref={productFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleProductUpload} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => productFileRef.current?.click()}>
            {s.productImage ? "換圖" : "上傳產品圖"}
          </button>
          {s.productOrig && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={s.productRemoving} onClick={removeProductBg}>
              {s.productRemoving ? "去背中…" : s.productImage !== s.productOrig ? "✓ 已去背" : `一鍵去背（${ntdLabel(removeBgNtd())}）`}
            </button>
          )}
          {s.productImage && canvasHref && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }} data-testid="banner-product-canvas"
              onClick={() => void openInCanvas(s.productImage!, `banner-${s.preset}-商品圖`, canvasHref, undefined, { tool: BANNER_RETURN_TOOL, slot: "product", label: "Banner 商品圖" })}>
              ✏️ 在畫布編輯
            </button>
          )}
          {s.productImage && (
            <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--badge-red-text)" }}
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
      {s.productImage && (() => {
        const g = s.grounding;
        const setG = <K extends keyof GroundingOpts>(k: K, v: NonNullable<GroundingOpts[K]>) => set("grounding", { ...g, [k]: v });
        const slider = (label: string, value: number, min: number, max: number, step: number, on: (v: number) => void, unit = "%", id = "") => (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ minWidth: 48 }}>{label}</span>
            <input type="range" min={min} max={max} step={step} value={value} data-testid={id || undefined}
              onChange={(e) => on(Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
            <span style={{ opacity: 0.7, minWidth: 40, textAlign: "right" }}>{unit === "%" ? `${Math.round(value * 100)}%` : `${value}${unit}`}</span>
          </label>
        );
        const sh = g.shadow ?? { enabled: false }, rf = g.reflection ?? { enabled: false }, tn = g.tone ?? { enabled: false };
        return (
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>商品擬真</div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={!!sh.enabled} data-testid="banner-ground-shadow" onChange={(e) => setG("shadow", { ...sh, enabled: e.target.checked })} />
              接觸陰影（商品放在桌面上的影子）
            </label>
            {sh.enabled && (<>
              {slider("濃度", sh.opacity ?? 0.5, 0, 1, 0.05, (v) => setG("shadow", { ...sh, opacity: v }))}
              {slider("柔和", sh.softness ?? 0.35, 0, 1, 0.05, (v) => setG("shadow", { ...sh, softness: v }))}
              {slider("下移", sh.distance ?? 0, -40, 80, 1, (v) => setG("shadow", { ...sh, distance: v }), "px")}
            </>)}
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={!!rf.enabled} data-testid="banner-ground-reflection" onChange={(e) => setG("reflection", { ...rf, enabled: e.target.checked })} />
              倒影（光滑桌面）
            </label>
            {rf.enabled && (<>
              {slider("長度", rf.height ?? 0.35, 0, 1, 0.05, (v) => setG("reflection", { ...rf, height: v }))}
              {slider("濃度", rf.fade ?? 0.3, 0, 1, 0.05, (v) => setG("reflection", { ...rf, fade: v }))}
              {slider("間距", rf.gap ?? 0, 0, 60, 1, (v) => setG("reflection", { ...rf, gap: v }), "px")}
            </>)}
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={!!tn.enabled} data-testid="banner-ground-tone" onChange={(e) => setG("tone", { ...tn, enabled: e.target.checked })} />
              色調匹配（商品顏色往背景靠一點，最多 ±12%）
            </label>
            {tn.enabled && slider("強度", tn.strength ?? 0.4, 0, 1, 0.05, (v) => setG("tone", { ...tn, strength: v }))}
          </div>
        );
      })()}
    </StepCard>
  );
}
