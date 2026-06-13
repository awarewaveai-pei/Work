"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "../../../lib/studio/model-options";
import {
  GARMENTS,
  FLAT_STYLES,
  FLAT_LIGHTING,
  MODEL_POSES,
  MODEL_LIGHTING,
  buildFlatMockupPrompt,
  buildModelMockupPrompt,
  isChestOccludingPose,
  type GarmentColor,
  type MockupMode,
} from "../../../lib/studio/mockup-prompt";

// Only models that can consume a reference image can place a design on a garment.
const MOCKUP_MODELS = STUDIO_MODEL_OPTIONS.filter((m) => m.maxRefs > 0);

interface DesignAsset {
  id: string;
  object_url: string | null;
  metadata: { prompt?: string | null } | null;
}

interface GenState {
  status: "idle" | "generating" | "done" | "error";
  image?: string;
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

export default function MockupStudio() {
  // design source
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [designRef, setDesignRef] = useState<string | null>(null); // public URL or data URL
  const [designThumb, setDesignThumb] = useState<string | null>(null);
  // mode + shared
  const [mode, setMode] = useState<MockupMode>("model");
  const [garment, setGarment] = useState("tshirt");
  const [color, setColor] = useState<GarmentColor>("white");
  const [model, setModel] = useState<StudioModel>("nano-banana-2");
  // Default to a supported portrait ratio. "3:4" is NOT in VALID_ASPECT_RATIOS
  // (lib/tarot/image-gen.ts) — the studio generate route rejects it with 400, so it
  // must never be an input here. 4:5 is the closest supported apparel/portrait ratio.
  const [aspect, setAspect] = useState<AspectRatio>("4:5");
  // flat controls
  const [surface, setSurface] = useState("light wooden table");
  const [flatStyle, setFlatStyle] = useState(FLAT_STYLES[0].value);
  const [flatLighting, setFlatLighting] = useState(FLAT_LIGHTING[0].value);
  const [propBL, setPropBL] = useState("");
  const [propTR, setPropTR] = useState("");
  const [propBR, setPropBR] = useState("");
  // model controls
  const [ageGroup, setAgeGroup] = useState<"adult" | "youth">("adult");
  const [modelDesc, setModelDesc] = useState("");
  const [pose, setPose] = useState(MODEL_POSES[0].value);
  const [environment, setEnvironment] = useState("");
  const [modelLighting, setModelLighting] = useState(MODEL_LIGHTING[0].value);
  const [envPropTR, setEnvPropTR] = useState("");
  const [envPropBL, setEnvPropBL] = useState("");
  // results
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inFlight = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tools/designs", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; assets?: DesignAsset[] };
        if (json.ok) setDesigns((json.assets ?? []).filter((a) => a.object_url));
      } catch {
        /* gallery unavailable — local upload still works */
      }
    })();
  }, []);

  const prompt = useMemo(() => {
    if (mode === "flat") {
      return buildFlatMockupPrompt({
        garment, color, surface, style: flatStyle, lighting: flatLighting,
        propBottomLeft: propBL, propTopRight: propTR, propBottomRight: propBR,
      });
    }
    return buildModelMockupPrompt({
      garment, color, ageGroup, modelDescription: modelDesc, pose,
      environment, lighting: modelLighting, propTopRight: envPropTR, propBottomLeft: envPropBL,
    });
  }, [mode, garment, color, surface, flatStyle, flatLighting, propBL, propTR, propBR,
      ageGroup, modelDesc, pose, environment, modelLighting, envPropTR, envPropBL]);

  const onUploadDesign = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const dataUrl = await readFileAsDataUrl(files[0]);
      setDesignRef(dataUrl);
      setDesignThumb(dataUrl);
    } catch {
      /* unreadable file ignored */
    }
  }, []);

  const generate = useCallback(async () => {
    if (!designRef) {
      setGen({ status: "error", error: "請先選一張設計圖（My Designs 點選或上傳）" });
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setGen({ status: "generating" });
    setSaveState("idle");
    try {
      const res = await fetch("/api/tools/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, referenceImages: [designRef], aspectRatio: aspect }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) {
        setGen({ status: "error", error: json.error ?? `HTTP ${res.status}` });
        return;
      }
      setGen({ status: "done", image: json.image });
    } catch (err) {
      setGen({ status: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight.current = false;
    }
  }, [designRef, model, prompt, aspect]);

  const saveMockup = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: gen.image, prompt: `[mockup:${mode}:${color}] ${prompt}`, modelName: model }),
      });
      const json = (await res.json()) as { ok: boolean };
      setSaveState(json.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [gen, mode, color, prompt, model]);

  const selectStyle = (selected: boolean) => ({
    border: selected ? "2px solid #4f8cff" : "2px solid transparent",
    borderRadius: 6,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, padding: 16 }}>
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13 }}>
          設計圖（My Designs 點選，或上傳）
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", maxHeight: 132, overflowY: "auto" }}>
            {designs.map((d) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={d.id}
                src={d.object_url!}
                alt={d.metadata?.prompt ?? d.id}
                style={{ width: 56, height: 56, objectFit: "contain", background: "#111", ...selectStyle(designRef === d.object_url) }}
                onClick={() => { setDesignRef(d.object_url); setDesignThumb(d.object_url); }}
              />
            ))}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" style={{ width: "100%", marginTop: 6 }} onChange={(e) => void onUploadDesign(e.target.files)} />
          {designThumb ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              已選設計：{/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={designThumb} alt="selected design" style={{ width: 40, height: 40, objectFit: "contain", background: "#111", verticalAlign: "middle", marginLeft: 6, borderRadius: 4 }} />
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className={mode === "model" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("model")}>模特</button>
          <button className={mode === "flat" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("flat")}>平拍</button>
        </div>

        <label style={{ fontSize: 13 }}>
          商品
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={garment} onChange={(e) => setGarment(e.target.value)}>
            {Object.entries(GARMENTS).map(([k, g]) => (
              <option key={k} value={k}>{g.label}</option>
            ))}
          </select>
        </label>

        <div style={{ fontSize: 13 }}>
          顏色（本案只做白/黑）
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className={color === "white" ? "btn-primary" : "btn-secondary"} onClick={() => setColor("white")}>白</button>
            <button className={color === "black" ? "btn-primary" : "btn-secondary"} onClick={() => setColor("black")}>黑（自動鎖色）</button>
          </div>
        </div>

        {mode === "flat" ? (
          <>
            <label style={{ fontSize: 13 }}>
              桌面/背景 Surface
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={surface} onChange={(e) => setSurface(e.target.value)} />
            </label>
            <label style={{ fontSize: 13 }}>
              擺放 Style
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={flatStyle} onChange={(e) => setFlatStyle(e.target.value)}>
                {FLAT_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              光線
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={flatLighting} onChange={(e) => setFlatLighting(e.target.value)}>
                {FLAT_LIGHTING.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              道具・左下（apparel prop）
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={propBL} onChange={(e) => setPropBL(e.target.value)} placeholder="例：bubble tea" />
            </label>
            <label style={{ fontSize: 13 }}>
              道具・右上（niche prop 1）
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={propTR} onChange={(e) => setPropTR(e.target.value)} placeholder="例：tarot cards" />
            </label>
            <label style={{ fontSize: 13 }}>
              道具・右下（niche prop 2）
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={propBR} onChange={(e) => setPropBR(e.target.value)} placeholder="例：crystals and sage" />
            </label>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13 }}>
              年齡層
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className={ageGroup === "adult" ? "btn-primary" : "btn-secondary"} onClick={() => setAgeGroup("adult")}>Adult</button>
                <button className={ageGroup === "youth" ? "btn-primary" : "btn-secondary"} onClick={() => setAgeGroup("youth")}>Youth</button>
              </div>
            </div>
            <label style={{ fontSize: 13 }}>
              模特描述（族裔/膚色/性別/年齡/體型）
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={modelDesc} onChange={(e) => setModelDesc(e.target.value)} placeholder="例：blonde Asian woman, 20s, slim" />
            </label>
            <label style={{ fontSize: 13 }}>
              姿勢
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={pose} onChange={(e) => setPose(e.target.value)}>
                {MODEL_POSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {isChestOccludingPose(pose) ? (
                <span style={{ color: "#f5a623", fontSize: 12 }}>⚠ 此姿勢會遮住胸前設計（P0 實測），建議改站姿</span>
              ) : null}
            </label>
            <label style={{ fontSize: 13 }}>
              場景 Environment
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="例：cafe interior with coffee cups" />
            </label>
            <label style={{ fontSize: 13 }}>
              光線
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={modelLighting} onChange={(e) => setModelLighting(e.target.value)}>
                {MODEL_LIGHTING.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              場景道具・右上（60% cropped）
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={envPropTR} onChange={(e) => setEnvPropTR(e.target.value)} placeholder="例：bookshelves" />
            </label>
            <label style={{ fontSize: 13 }}>
              場景道具・左下（70% cropped）
              <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={envPropBL} onChange={(e) => setEnvPropBL(e.target.value)} placeholder="例：leather chair" />
            </label>
          </>
        )}

        <label style={{ fontSize: 13 }}>
          模型（吃參考圖者；勝率首選 Nano Banana 2）
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={model} onChange={(e) => setModel(e.target.value as StudioModel)}>
            {MOCKUP_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.group} · {m.label} (~NT${m.costNt})</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          比例
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}>
            {(["4:5", "1:1", "2:3", "3:2", "9:16"] as const).filter((a, i, arr) => arr.indexOf(a) === i).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        <button className="btn-primary" disabled={gen.status === "generating"} onClick={() => void generate()}>
          {gen.status === "generating" ? "合成中（20–40 秒）…" : "合成 Mockup"}
        </button>
      </div>

      {/* ── Preview ─────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: "pre-wrap", marginBottom: 10 }}>{prompt}</div>
        {gen.status === "idle" ? <p style={{ opacity: 0.6 }}>選設計圖 → 填控制欄 → 合成。</p> : null}
        {gen.status === "generating" ? <p style={{ opacity: 0.7 }}>合成中…</p> : null}
        {gen.status === "error" ? <p style={{ color: "#e5484d" }}>{gen.error}</p> : null}
        {gen.status === "done" && gen.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gen.image} alt="mockup" style={{ maxWidth: "100%", maxHeight: 600, borderRadius: 8, background: "#111" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveMockup()}>
                {saveState === "saved" ? "已存入 My Designs ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
              </button>
              <a className="btn-secondary" href={gen.image} download={`mockup-${mode}-${color}.png`}>下載</a>
              <button className="btn-secondary" onClick={() => void generate()}>再合成一張</button>
              {saveState === "error" ? <span style={{ color: "#e5484d", fontSize: 12 }}>儲存失敗</span> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
