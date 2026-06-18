"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "../../../lib/studio/model-options";
import { resolveStylePrompt } from "@/app/tools/tarot/cards";
import ImageStyleControls from "@/components/tools/ImageStyleControls";
import OutputTrackBar from "@/components/tools/OutputTrackBar";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";
import { buildSemanticFilename, type SemanticFileMeta } from "@/lib/studio/semantic-filename";
import type { MockupView } from "@/lib/studio/printful-mockup";

const PRODUCT_TYPES = [
  { value: "tshirt", label: "T-shirt", aspect: "4:5" as AspectRatio, suffix: "t-shirt graphic design, centered composition, plain background" },
  { value: "hoodie", label: "Hoodie", aspect: "4:5" as AspectRatio, suffix: "hoodie front print design, centered composition, plain background" },
  { value: "mug", label: "Mug", aspect: "3:2" as AspectRatio, suffix: "mug wrap-around print design, horizontal composition, plain background" },
  { value: "poster", label: "Poster / Wall Art", aspect: "2:3" as AspectRatio, suffix: "poster art print, full-bleed composition" },
  { value: "sticker", label: "Sticker", aspect: "1:1" as AspectRatio, suffix: "die-cut sticker design, bold outline, plain background" },
  { value: "none", label: "（不限商品）", aspect: "1:1" as AspectRatio, suffix: "" },
];

const ASPECTS: AspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "16:9", "9:16"];

const SUBJECT_PRESETS = [
  "Dragon warrior", "Celestial goddess", "Skull with flowers",
  "Koi fish spirit", "Mountain with moon", "Tiger spirit",
  "Astronaut drifting", "Wolf howling at moon", "Phoenix rising",
  "Samurai warrior", "Sacred geometry", "Mermaid deep sea",
  "Lion with crown", "Butterfly mandala", "Cyberpunk cityscape",
];

const THEME_PRESETS = [
  "Sports & competition", "Music culture", "Street fashion",
  "Ancient mythology", "Future technology", "Nature ecology",
  "Spiritual journey", "Social satire", "Art therapy",
  "Gaming culture", "Psychology & mind", "Historical heritage",
  "Animal liberation", "Space exploration", "Luxury lifestyle",
];

const VIBE_PRESETS = [
  "Bold & powerful", "Dark & mysterious", "Calm & ethereal",
  "Playful & whimsical", "Romantic & dreamy", "Raw & edgy",
  "Sacred & divine", "Nostalgic & warm", "Sharp & modern",
  "Electric & vibrant", "Zen & peaceful", "Epic & grand",
  "Melancholic & deep", "Rebellious & wild", "Tender & intimate",
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

// Transform-capable models (flux-kontext family handles img2img best)
const TRANSFORM_MODEL: StudioModel = "flux-kontext-dev";

interface GenState {
  status: "idle" | "generating" | "done" | "error";
  image?: string;
  seed?: number | null;
  error?: string;
}

type RefMode = "ref" | "transform";

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
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = dataUrl;
  });
}

function PresetChips({ chips, onSelect }: { chips: string[]; onSelect: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
      {chips.map((c, i) => (
        <button
          key={`${c}-${i}`}
          type="button"
          onClick={() => onSelect(c)}
          style={{
            fontSize: 11, padding: "2px 9px", borderRadius: 20,
            background: "var(--bg-tertiary, #1e1e1e)", border: "1px solid var(--border, #333)",
            cursor: "pointer", color: "var(--text-muted, #888)", lineHeight: 1.6,
            transition: "border-color 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--accent, #6366f1)")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border, #333)")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export default function StudioWorkbench() {
  const [model, setModel] = useState<StudioModel>("flux-schnell");
  const [productType, setProductType] = useState("tshirt");
  const [theme, setTheme] = useState("");
  const [vibe, setVibe] = useState("");
  const [subject, setSubject] = useState("");
  const [style, setStyle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>("4:5");
  const [refImages, setRefImages] = useState<string[]>([]);
  const [refMode, setRefMode] = useState<RefMode>("ref");
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bgState, setBgState] = useState<"idle" | "removing" | "done" | "error">("idle");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [mockupState, setMockupState] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [mockups, setMockups] = useState<MockupView[]>([]);
  const [savedMockups, setSavedMockups] = useState<Record<string, "saving" | "saved" | "error">>({});

  // Trending news state
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [trendingCategory, setTrendingCategory] = useState("");
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState(false);

  const bgInFlight = useRef(false);
  const mockupInFlight = useRef(false);

  const product = PRODUCT_TYPES.find((p) => p.value === productType) ?? PRODUCT_TYPES[0];

  const fileMeta = useMemo<SemanticFileMeta>(() => {
    const p = PRODUCT_TYPES.find((x) => x.value === productType);
    return {
      product: p && p.value !== "none" ? p.label : undefined,
      subject: subject.trim() || theme.trim() || undefined,
      style: style || undefined,
    };
  }, [productType, subject, theme, style]);

  const modelOption = useMemo(() => STUDIO_MODEL_OPTIONS.find((m) => m.value === model), [model]);
  const maxRefs = modelOption?.maxRefs ?? 0;
  const resolvedStylePrompt = useMemo(() => (style ? resolveStylePrompt(style) : ""), [style]);

  // Transform mode assembles a different prompt: style is applied TO the uploaded image
  const assembledPrompt = useMemo(() => {
    if (refMode === "transform" && refImages.length > 0) {
      const parts = [
        "Transform this image.",
        resolvedStylePrompt ? `Apply style: ${resolvedStylePrompt}.` : "",
        vibe.trim() ? `Mood: ${vibe.trim()}.` : "",
        subject.trim() ? `Keep subject: ${subject.trim()}.` : "",
        product.suffix,
      ].filter(Boolean);
      return parts.join(" ");
    }
    const parts = [subject.trim(), theme.trim(), vibe.trim(), resolvedStylePrompt, product.suffix].filter(Boolean);
    return parts.join(", ");
  }, [subject, theme, vibe, resolvedStylePrompt, product, refMode, refImages.length]);

  const effectivePrompt = promptTouched ? prompt : assembledPrompt;

  const onPickProduct = useCallback((value: string) => {
    setProductType(value);
    const p = PRODUCT_TYPES.find((x) => x.value === value);
    if (p) setAspect(p.aspect);
  }, []);

  // Switching to transform mode: auto-upgrade to a kontext model if current has no ref support
  const onSetRefMode = useCallback((mode: RefMode) => {
    setRefMode(mode);
    if (mode === "transform") {
      const cur = STUDIO_MODEL_OPTIONS.find((m) => m.value === model);
      if ((cur?.maxRefs ?? 0) === 0) {
        setModel(TRANSFORM_MODEL);
        setRefImages([]);
      }
    }
  }, [model]);

  const fetchTrending = useCallback(async (cat: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `studio_trending_v1_${cat}_${today}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setTrendingTopics(JSON.parse(cached) as string[]);
        return;
      }
    } catch { /* ignore parse error */ }

    setTrendingLoading(true);
    setTrendingTopics([]);
    setTrendingError(false);
    try {
      const res = await fetch("/api/tools/studio/trending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat }),
      });
      const json = (await res.json()) as { ok: boolean; topics?: string[]; error?: string };
      if (json.ok && json.topics) {
        setTrendingTopics(json.topics);
        try { localStorage.setItem(cacheKey, JSON.stringify(json.topics)); } catch { /* quota */ }
      } else {
        setTrendingError(true);
      }
    } catch { setTrendingError(true); } finally {
      setTrendingLoading(false);
    }
  }, []);

  const onSelectTrendingCategory = useCallback((cat: string) => {
    setTrendingCategory(cat);
    void fetchTrending(cat);
  }, [fetchTrending]);

  const onUploadRefs = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const room = Math.max(0, maxRefs - refImages.length);
      const picked = Array.from(files).slice(0, room);
      const urls: string[] = [];
      for (const f of picked) {
        try { urls.push(await downscaleImageFile(f)); } catch { /* skip */ }
      }
      setRefImages((prev) => [...prev, ...urls].slice(0, maxRefs));
    },
    [maxRefs, refImages.length],
  );

  const generate = useCallback(async () => {
    if (!effectivePrompt || effectivePrompt.trim().length < 3) {
      setGen({ status: "error", error: "請先填主題/描述（prompt 至少 3 字）" });
      return;
    }
    if (model === "ideogram-character" && refImages.length === 0) {
      setGen({ status: "error", error: "Ideogram Character 需要至少 1 張角色參考圖" });
      return;
    }
    if (refMode === "transform" && refImages.length === 0) {
      setGen({ status: "error", error: "改圖模式需要先上傳一張圖" });
      return;
    }
    setGen({ status: "generating" });
    setSaveState("idle");
    setBgState("idle");
    setOriginalImage(null);
    setMockupState("idle");
    setMockups([]);
    setSavedMockups({});
    try {
      const res = await fetch("/api/tools/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: effectivePrompt,
          referenceImages: refImages.slice(0, maxRefs),
          aspectRatio: aspect,
        }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; seed?: number | null; error?: string };
      if (!json.ok || !json.image) {
        setGen({ status: "error", error: json.error ?? `HTTP ${res.status}` });
        return;
      }
      setGen({ status: "done", image: json.image, seed: json.seed ?? null });
    } catch (err) {
      setGen({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }, [model, effectivePrompt, refImages, maxRefs, aspect, refMode]);

  const removeBg = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    if (bgInFlight.current) return;
    bgInFlight.current = true;
    setBgState("removing");
    try {
      const res = await fetch("/api/tools/studio/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: gen.image }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) { setBgState("error"); return; }
      setOriginalImage(gen.image);
      setGen((prev) => ({ ...prev, image: json.image }));
      setBgState("done");
      setSaveState("idle");
    } catch { setBgState("error"); } finally { bgInFlight.current = false; }
  }, [gen]);

  const restoreOriginal = useCallback(() => {
    if (!originalImage) return;
    setGen((prev) => ({ ...prev, image: originalImage }));
    setOriginalImage(null);
    setBgState("idle");
    setSaveState("idle");
    setMockupState("idle");
    setMockups([]);
    setSavedMockups({});
  }, [originalImage]);

  const generateMockupFromDesign = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    if (mockupInFlight.current) return;
    mockupInFlight.current = true;
    setMockupState("generating");
    try {
      const res = await fetch("/api/tools/studio/mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: gen.image, productType }),
      });
      const json = (await res.json()) as { ok: boolean; mockups?: MockupView[]; error?: string };
      if (!json.ok || !json.mockups || json.mockups.length === 0) { setMockupState("error"); return; }
      setMockups(json.mockups);
      setMockupState("done");
    } catch { setMockupState("error"); } finally { mockupInFlight.current = false; }
  }, [gen, productType]);

  const saveMockupToDesigns = useCallback(async (m: MockupView) => {
    if (savedMockups[m.url] === "saving" || savedMockups[m.url] === "saved") return;
    setSavedMockups((prev) => ({ ...prev, [m.url]: "saving" }));
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: m.url,
          prompt: effectivePrompt,
          modelName: model,
          source: "printful-mockup",
          productType: productType !== "none" ? productType : undefined,
          subject: m.label,
          styleTags: [m.group],
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSavedMockups((prev) => ({ ...prev, [m.url]: json.ok ? "saved" : "error" }));
    } catch {
      setSavedMockups((prev) => ({ ...prev, [m.url]: "error" }));
    }
  }, [savedMockups, effectivePrompt, model, productType]);

  const saveToDesigns = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: gen.image,
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
      setSaveState(json.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
  }, [gen, effectivePrompt, model, productType, theme, style, subject]);

  const downloadOriginal = useCallback(() => {
    if (!gen.image) return;
    const ext = gen.image.startsWith("data:image/jpeg") ? "jpg" : gen.image.startsWith("data:image/webp") ? "webp" : "png";
    const a = document.createElement("a");
    a.href = gen.image;
    a.download = buildSemanticFilename({ ...fileMeta, track: "原圖" }, ext, `design.${ext}`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [gen.image, fileMeta]);

  const isTransformMode = refMode === "transform";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, padding: 16 }}>
      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* 商品類型 */}
        <label style={{ fontSize: 13 }}>
          商品類型
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={productType} onChange={(e) => onPickProduct(e.target.value)}>
            {PRODUCT_TYPES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {/* Subject */}
        <div>
          <label style={{ fontSize: 13 }}>
            主題 Subject
            <input
              className="btn-secondary"
              style={{ width: "100%", marginTop: 4, opacity: isTransformMode ? 0.5 : 1 }}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={isTransformMode ? "改圖模式：主題由上傳圖決定（可選）" : "例：lotus flower mandala"}
            />
          </label>
          <PresetChips chips={SUBJECT_PRESETS} onSelect={setSubject} />
        </div>

        {/* Theme */}
        <div>
          <label style={{ fontSize: 13 }}>
            題材 Theme
            <input
              className="btn-secondary"
              style={{ width: "100%", marginTop: 4, opacity: isTransformMode ? 0.4 : 1 }}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={isTransformMode ? "改圖模式下不影響 prompt" : "例：spiritual healing"}
            />
          </label>
          <PresetChips chips={THEME_PRESETS} onSelect={setTheme} />
        </div>

        {/* Vibe */}
        <div>
          <label style={{ fontSize: 13 }}>
            氛圍 Vibe
            <input
              className="btn-secondary"
              style={{ width: "100%", marginTop: 4 }}
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="例：calm, ethereal"
            />
          </label>
          <PresetChips chips={VIBE_PRESETS} onSelect={setVibe} />
        </div>

        {/* 時事靈感 drawer */}
        <div>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "100%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}
            onClick={() => setTrendingOpen((v) => !v)}
          >
            <span>🔥 時事靈感</span>
            <span style={{ opacity: 0.5 }}>{trendingOpen ? "▲" : "▼"}</span>
          </button>

          {trendingOpen && (
            <div style={{ marginTop: 6, padding: 10, background: "var(--bg-tertiary, #1a1a1a)", borderRadius: 8, border: "1px solid var(--border, #333)" }}>
              <p style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>選類別 → 抓今日熱門話題 → 點擊填入主題</p>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                {TRENDING_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => onSelectTrendingCategory(cat.value)}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 20, cursor: "pointer",
                      background: trendingCategory === cat.value ? "var(--accent, #6366f1)" : "var(--bg-secondary, #2a2a2a)",
                      color: trendingCategory === cat.value ? "#fff" : "var(--text-muted, #888)",
                      border: `1px solid ${trendingCategory === cat.value ? "var(--accent, #6366f1)" : "var(--border, #333)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {trendingLoading && (
                <p style={{ fontSize: 11, opacity: 0.5 }}>搜尋中…</p>
              )}

              {!trendingLoading && trendingError && (
                <p style={{ fontSize: 11, color: "#e5484d" }}>抓取失敗，請重試</p>
              )}

              {!trendingLoading && !trendingError && trendingTopics.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {trendingTopics.map((t, i) => (
                    <button
                      key={`${t}-${i}`}
                      type="button"
                      onClick={() => setSubject(t)}
                      style={{
                        fontSize: 11, padding: "3px 9px", borderRadius: 6, cursor: "pointer",
                        background: "var(--bg-secondary, #222)", border: "1px solid var(--border, #333)",
                        color: "var(--text, #ccc)", textAlign: "left", transition: "border-color 0.15s",
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--accent, #6366f1)")}
                      onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border, #333)")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Style + Model */}
        <ImageStyleControls
          model={model}
          style={style}
          onStyleChange={setStyle}
          onModelChange={(nextModel) => {
            setModel(nextModel);
            setRefImages([]);
          }}
        />

        {/* 比例 */}
        <label style={{ fontSize: 13 }}>
          比例
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        {/* 參考圖 + 模式切換 */}
        <div style={{ border: "1px solid var(--border, #333)", borderRadius: 8, padding: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>參考圖</p>

          {/* Mode toggle */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #333)", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => onSetRefMode("ref")}
              style={{
                flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none",
                background: refMode === "ref" ? "var(--accent, #6366f1)" : "transparent",
                color: refMode === "ref" ? "#fff" : "var(--text-muted, #888)",
                transition: "all 0.15s",
              }}
            >
              🖼️ 風格參考
            </button>
            <button
              type="button"
              onClick={() => onSetRefMode("transform")}
              style={{
                flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none",
                background: refMode === "transform" ? "var(--accent, #6366f1)" : "transparent",
                color: refMode === "transform" ? "#fff" : "var(--text-muted, #888)",
                transition: "all 0.15s",
              }}
            >
              🎨 改圖模式
            </button>
          </div>

          <p style={{ fontSize: 10, opacity: 0.5, marginBottom: 8, lineHeight: 1.5 }}>
            {refMode === "ref"
              ? "上傳圖作為視覺參考，AI 依 Subject/Style 生成新圖"
              : `直接把你的圖套用選定風格（已切至 ${model.includes("kontext") ? model : TRANSFORM_MODEL}）`}
          </p>

          {maxRefs > 0 ? (
            <label style={{ fontSize: 12 }}>
              {refMode === "transform" ? "上傳要改的圖" : `參考圖（${refImages.length}/${maxRefs}）`}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                style={{ width: "100%", marginTop: 4 }}
                onChange={(e) => void onUploadRefs(e.target.files)}
              />
              {refImages.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {refImages.map((r, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={r}
                      alt={`ref-${i}`}
                      style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, cursor: "pointer" }}
                      title="點擊移除"
                      onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              )}
            </label>
          ) : (
            <p style={{ fontSize: 11, opacity: 0.45 }}>
              目前模型不支援參考圖。
              {refMode === "transform" && " 改圖模式將自動切換至 flux-kontext-dev。"}
            </p>
          )}
        </div>

        <button className="btn-primary" disabled={gen.status === "generating"} onClick={() => void generate()}>
          {gen.status === "generating" ? "生成中…" : "生成"}
        </button>
      </div>

      {/* ── Preview ───────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14 }}>
        <label style={{ fontSize: 13 }}>
          Prompt（自動組裝，可直接改）
          <textarea
            className="btn-secondary"
            style={{ width: "100%", marginTop: 4, minHeight: 72, fontFamily: "inherit" }}
            value={effectivePrompt}
            onChange={(e) => {
              const v = e.target.value;
              setPrompt(v);
              setPromptTouched(v.trim().length > 0);
            }}
          />
        </label>
        {promptTouched ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setPromptTouched(false); setPrompt(""); }}>
              回到自動組裝
            </button>
            <span style={{ fontSize: 12, opacity: 0.6 }}>手動編輯中 — 左側欄位暫不影響 prompt</span>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          {gen.status === "idle" ? <p style={{ opacity: 0.6 }}>填好左側欄位後按「生成」。</p> : null}
          {gen.status === "generating" ? <p style={{ opacity: 0.7 }}>生成中（依模型 5–60 秒）…</p> : null}
          {gen.status === "error" ? <p style={{ color: "#e5484d" }}>{gen.error}</p> : null}
          {gen.status === "done" && gen.image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gen.image}
                alt="generated design"
                style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: 560, margin: "0 auto", objectFit: "contain", borderRadius: 8, background: "#fff" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveToDesigns()}>
                  {saveState === "saved" ? "已存入 My Designs ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
                </button>
                <button className="btn-secondary" disabled={bgState === "removing" || bgState === "done"} onClick={() => void removeBg()}>
                  {bgState === "done" ? "已去背 ✓" : bgState === "removing" ? "去背中…" : "去背（透明 PNG）"}
                </button>
                {bgState === "done" && originalImage ? (
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={restoreOriginal}>還原原圖</button>
                ) : null}
                {bgState === "error" ? <span style={{ color: "#e5484d", fontSize: 12 }}>去背失敗，請重試</span> : null}
                {bgState === "done" && productType === "tshirt" ? (
                  <button className="btn-secondary" disabled={mockupState === "generating" || mockupState === "done"} onClick={() => void generateMockupFromDesign()}>
                    {mockupState === "done" ? "產品預覽 ✓" : mockupState === "generating" ? "生成 Mockup…" : "產品 Mockup（多風格＋模特）"}
                  </button>
                ) : null}
                {mockupState === "error" ? <span style={{ color: "#e5484d", fontSize: 12 }}>Mockup 失敗，請重試</span> : null}
                <button className="btn-secondary" onClick={downloadOriginal}>下載原圖</button>
                {gen.seed != null ? <span style={{ fontSize: 12, opacity: 0.6 }}>seed {gen.seed}</span> : null}
                {saveState === "saved" ? <a href="/tools/designs" style={{ fontSize: 12 }}>查看 My Designs →</a> : null}
                {saveState === "error" ? <span style={{ color: "#e5484d", fontSize: 12 }}>儲存失敗（檢查 POD_DESIGNS_ENABLED）</span> : null}
              </div>

              {mockups.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, marginBottom: 6, opacity: 0.7 }}>
                    產品預覽（Printful · 設計 100% 忠實）— 平放/鬼影/真人模特；按「存到我的設計」即可在 Publish 當商品圖
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {mockups.map((m) => {
                      const st = savedMockups[m.url];
                      return (
                        <div key={m.url} style={{ width: 180 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt={m.label} style={{ width: 180, height: 180, objectFit: "contain", background: "#111", borderRadius: 8, border: "1px solid var(--border)" }} />
                          <div style={{ fontSize: 11, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                            {m.lifestyle ? <span title="真人模特">🧍</span> : <span title="產品實拍">👕</span>}
                            <span style={{ opacity: 0.8 }}>{m.label}</span>
                          </div>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 11, marginTop: 3, width: "100%" }}
                            disabled={st === "saving" || st === "saved"}
                            onClick={() => void saveMockupToDesigns(m)}
                          >
                            {st === "saved" ? "已存 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "重試存圖" : "存到我的設計"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <ImageEditPromptPanel
                  sourceImage={gen.image}
                  currentPrompt={effectivePrompt}
                  imageModel={model}
                  target="pod-design"
                  aspectRatio={aspect}
                  title="AI image prompt（修圖）"
                  styleAnchor={{
                    model,
                    mode: refImages.length > 0 ? "image" : "text",
                    stylePrompt: resolvedStylePrompt || effectivePrompt,
                    subject: subject.trim(),
                    refs: refImages.length,
                    target: "pod-design",
                  }}
                  onEditedImage={(image, meta) => {
                    setModel(meta.model);
                    setGen({ status: "done", image, seed: meta.seed });
                    setSaveState("idle");
                    setBgState("idle");
                    setOriginalImage(null);
                    setMockupState("idle");
                    setMockups([]);
                    setSavedMockups({});
                  }}
                />
                <div style={{ flex: 1, minWidth: 240 }}>
                  <OutputTrackBar image={gen.image} source="pod" fileMeta={fileMeta} />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
