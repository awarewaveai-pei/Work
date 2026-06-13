"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "../../../lib/studio/model-options";
import ColorGradePanel, { useColorGrade } from "@/components/tools/ColorGradePanel";
import OutputTrackBar from "@/components/tools/OutputTrackBar";
import { bakeCssFilter } from "@/components/tools/bake-css-filter";

/** Product types steer the prompt suffix + default aspect ratio (print canvas comes later, P-print). */
const PRODUCT_TYPES = [
  { value: "tshirt", label: "T-shirt", aspect: "4:5" as AspectRatio, suffix: "t-shirt graphic design, centered composition, plain background" },
  { value: "hoodie", label: "Hoodie", aspect: "4:5" as AspectRatio, suffix: "hoodie front print design, centered composition, plain background" },
  { value: "mug", label: "Mug", aspect: "3:2" as AspectRatio, suffix: "mug wrap-around print design, horizontal composition, plain background" },
  { value: "poster", label: "Poster / Wall Art", aspect: "2:3" as AspectRatio, suffix: "poster art print, full-bleed composition" },
  { value: "sticker", label: "Sticker", aspect: "1:1" as AspectRatio, suffix: "die-cut sticker design, bold outline, plain background" },
  { value: "none", label: "（不限商品）", aspect: "1:1" as AspectRatio, suffix: "" },
];

const STYLE_PRESETS = [
  "None", "Art Deco", "Kawaii", "Line Art", "Minimalist", "Pop Art",
  "Retro", "Street Art", "Typography", "Vintage Poster", "Watercolor",
];

const ASPECTS: AspectRatio[] = ["2:3", "3:2", "4:5", "1:1", "9:16"];

interface GenState {
  status: "idle" | "generating" | "done" | "error";
  image?: string;
  seed?: number | null;
  error?: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

// Same downscale rationale as TarotStudio: style refs don't need full resolution and the
// request body must stay under the route limit.
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
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = dataUrl;
  });
}

export default function StudioWorkbench() {
  const [model, setModel] = useState<StudioModel>("flux-schnell");
  const [productType, setProductType] = useState("tshirt");
  const [theme, setTheme] = useState("");
  const [vibe, setVibe] = useState("");
  const [subject, setSubject] = useState("");
  const [style, setStyle] = useState("None");
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>("4:5");
  const [refImages, setRefImages] = useState<string[]>([]);
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bgState, setBgState] = useState<"idle" | "removing" | "done" | "error">("idle");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const bgInFlight = useRef(false); // state lags a render — ref blocks same-tick double-click
  const grade = useColorGrade(); // 修圖積木：色彩/色階/銳利度 (live CSS preview + server bake)

  const product = PRODUCT_TYPES.find((p) => p.value === productType) ?? PRODUCT_TYPES[0];
  const modelOption = useMemo(() => STUDIO_MODEL_OPTIONS.find((m) => m.value === model), [model]);
  const maxRefs = modelOption?.maxRefs ?? 0;

  const assembledPrompt = useMemo(() => {
    const parts = [
      subject.trim(),
      theme.trim(),
      vibe.trim(),
      style !== "None" ? `${style} style` : "",
      product.suffix,
    ].filter(Boolean);
    return parts.join(", ");
  }, [subject, theme, vibe, style, product]);

  const effectivePrompt = promptTouched ? prompt : assembledPrompt;

  const onPickProduct = useCallback((value: string) => {
    setProductType(value);
    const p = PRODUCT_TYPES.find((x) => x.value === value);
    if (p) setAspect(p.aspect);
  }, []);

  const onUploadRefs = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const room = Math.max(0, maxRefs - refImages.length);
      const picked = Array.from(files).slice(0, room);
      const urls: string[] = [];
      for (const f of picked) {
        try {
          urls.push(await downscaleImageFile(f));
        } catch {
          /* skip unreadable file */
        }
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
    setGen({ status: "generating" });
    setSaveState("idle");
    setBgState("idle");
    setOriginalImage(null);
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
  }, [model, effectivePrompt, refImages, maxRefs, aspect]);

  const removeBg = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    if (bgInFlight.current) return; // double-click = double Replicate charge
    bgInFlight.current = true;
    setBgState("removing");
    try {
      const res = await fetch("/api/tools/studio/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: gen.image }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) {
        setBgState("error");
        return;
      }
      setOriginalImage(gen.image);
      setGen((prev) => ({ ...prev, image: json.image }));
      setBgState("done");
      setSaveState("idle"); // transparent version not saved yet
    } catch {
      setBgState("error");
    } finally {
      bgInFlight.current = false;
    }
  }, [gen]);

  const restoreOriginal = useCallback(() => {
    if (!originalImage) return;
    setGen((prev) => ({ ...prev, image: originalImage }));
    setOriginalImage(null);
    setBgState("idle");
    setSaveState("idle");
  }, [originalImage]);

  const saveToDesigns = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    setSaveState("saving");
    try {
      // Bake the colour adjustment into the saved image so My Designs matches the preview
      // (洞2 fix). Neutral grade → bakeCssFilter returns the image unchanged.
      const image = await bakeCssFilter(gen.image, grade.cssFilter);
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
          styleTags: style !== "None" ? [style] : [],
          subject: subject.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSaveState(json.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [gen, effectivePrompt, model, productType, theme, style, subject, grade.cssFilter]);

  // Download the current image with the colour adjustment baked in (洞2 fix).
  const downloadGraded = useCallback(async () => {
    if (!gen.image) return;
    const baked = await bakeCssFilter(gen.image, grade.cssFilter);
    const ext = grade.neutral
      ? gen.image.startsWith("data:image/jpeg")
        ? "jpg"
        : gen.image.startsWith("data:image/webp")
          ? "webp"
          : "png"
      : "png"; // baked output is always PNG
    const a = document.createElement("a");
    a.href = baked;
    a.download = `design.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [gen.image, grade.cssFilter, grade.neutral]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, padding: 16 }}>
      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13 }}>
          商品類型
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={productType} onChange={(e) => onPickProduct(e.target.value)}>
            {PRODUCT_TYPES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          主題 Subject
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="例：lotus flower mandala" />
        </label>
        <label style={{ fontSize: 13 }}>
          題材 Theme
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="例：spiritual healing" />
        </label>
        <label style={{ fontSize: 13 }}>
          氛圍 Vibe
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="例：calm, ethereal" />
        </label>
        <label style={{ fontSize: 13 }}>
          風格 Style
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={style} onChange={(e) => setStyle(e.target.value)}>
            {STYLE_PRESETS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          模型
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={model} onChange={(e) => { setModel(e.target.value as StudioModel); setRefImages([]); }}>
            {STUDIO_MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.group} · {m.label} (~NT${m.costNt}{m.maxRefs > 0 ? ` · ${m.maxRefs} 參考圖` : ""})
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          比例
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        {maxRefs > 0 ? (
          <label style={{ fontSize: 13 }}>
            參考圖（{refImages.length}/{maxRefs}）
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ width: "100%", marginTop: 4 }} onChange={(e) => void onUploadRefs(e.target.files)} />
            {refImages.length > 0 ? (
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {refImages.map((r, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={r} alt={`ref-${i}`} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} title="點擊移除" onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))} />
                ))}
              </div>
            ) : null}
          </label>
        ) : null}

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
              // Clearing the box returns to auto-assembly instead of stranding an empty prompt.
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
              <img src={gen.image} alt="generated design" style={{ maxWidth: "100%", maxHeight: 560, borderRadius: 8, background: "#111", filter: grade.cssFilter }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
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
                <button className="btn-secondary" onClick={() => void downloadGraded()}>
                  下載{!grade.neutral ? "（含調色）" : ""}
                </button>
                {gen.seed != null ? <span style={{ fontSize: 12, opacity: 0.6 }}>seed {gen.seed}</span> : null}
                {saveState === "saved" ? <a href="/tools/designs" style={{ fontSize: 12 }}>查看 My Designs →</a> : null}
                {saveState === "error" ? <span style={{ color: "#e5484d", fontSize: 12 }}>儲存失敗（檢查 POD_DESIGNS_ENABLED 與 POD_DESIGNS_DEFAULT_ORG_ID / 伺服器 log）</span> : null}
              </div>

              {/* 修圖積木 + 輸出軌 ([1-f]/[1-g])。POD 商品印刷檔（非卡片尺寸）為後續切片，此處不給 print 目的地。 */}
              <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ width: 260 }}>
                  <ColorGradePanel state={grade.state} onSet={grade.set} onReset={grade.reset} neutral={grade.neutral} />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <OutputTrackBar image={gen.image} source="pod" colorGrade={grade.params} />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
