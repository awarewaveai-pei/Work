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
  MODEL_ETHNICITIES,
  MODEL_GENDERS,
  MODEL_AGES,
  MODEL_BODY_TYPES,
  MODEL_MAKEUP,
  MODEL_ACCESSORIES,
  buildFlatMockupPrompt,
  buildModelMockupPrompt,
  isChestOccludingPose,
  type GarmentColor,
  type MockupMode,
} from "../../../lib/studio/mockup-prompt";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";

// Show all 15 models; ref-count shown in label so user knows which ones apply the design.
const MOCKUP_MODELS = STUDIO_MODEL_OPTIONS;

const PRINTFUL_PRODUCTS = [
  { value: "tshirt", label: "T-Shirt" },
  { value: "hoodie", label: "Hoodie" },
  { value: "mug", label: "Mug" },
  { value: "tote", label: "Tote Bag" },
] as const;

type PrintfulProductType = (typeof PRINTFUL_PRODUCTS)[number]["value"];

interface DesignAsset {
  id: string;
  object_url: string | null;
  metadata: { prompt?: string | null } | null;
}

interface PresetAsset {
  id: string;
  object_url: string | null;
  asset_domain: "mockup_model_preset" | "mockup_product_preset";
  metadata: {
    preset_name?: string | null;
    preset_settings?: Record<string, string> | null;
  } | null;
}

interface MockupView {
  url: string;
  label: string;
  group: string;
  view: string;
  lifestyle: boolean;
}

interface GenState {
  status: "idle" | "generating" | "done" | "error";
  image?: string;
  error?: string;
}

interface PrintfulState {
  status: "idle" | "generating" | "done" | "error";
  mockups?: MockupView[];
  error?: string;
}

interface SaveMockupState {
  [url: string]: "idle" | "saving" | "saved" | "error";
}


function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

/** Get natural pixel dimensions of an image (URL or data URL). No CORS needed for naturalWidth/Height. */
function getImageNaturalDims(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export default function MockupStudio() {
  // design source
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [designRef, setDesignRef] = useState<string | null>(null);
  const [designThumb, setDesignThumb] = useState<string | null>(null);
  // mode + shared
  const [mode, setMode] = useState<MockupMode | "printful">("model");
  const [garment, setGarment] = useState("tshirt");
  const [color, setColor] = useState<GarmentColor>("white");
  const [model, setModel] = useState<StudioModel>("nano-banana-2");
  const [aspect, setAspect] = useState<AspectRatio>("2:3");
  // flat controls
  const [surface, setSurface] = useState("light wooden table");
  const [flatStyle, setFlatStyle] = useState(FLAT_STYLES[0].value);
  const [flatLighting, setFlatLighting] = useState(FLAT_LIGHTING[0].value);
  const [propBL, setPropBL] = useState("");
  const [propTR, setPropTR] = useState("");
  const [propBR, setPropBR] = useState("");
  // model controls — descriptor dropdowns
  const [ageGroup, setAgeGroup] = useState<"adult" | "youth">("adult");
  const [mEthnicity, setMEthnicity] = useState("");
  const [mGender, setMGender] = useState("");
  const [mAge, setMAge] = useState("");
  const [mBody, setMBody] = useState("");
  const [mMakeup, setMMakeup] = useState("");
  const [mAccessories, setMAccessories] = useState("");
  const [modelDescManual, setModelDescManual] = useState("");
  const [pose, setPose] = useState(MODEL_POSES[0].value);
  const [environment, setEnvironment] = useState("");
  const [modelLighting, setModelLighting] = useState(MODEL_LIGHTING[0].value);
  const [envPropTR, setEnvPropTR] = useState("");
  const [envPropBL, setEnvPropBL] = useState("");
  // printful controls
  const [printfulProduct, setPrintfulProduct] = useState<PrintfulProductType>("tshirt");
  const [printfulState, setPrintfulState] = useState<PrintfulState>({ status: "idle" });
  const [saveMockupStates, setSaveMockupStates] = useState<SaveMockupState>({});
  const [selectedMockups, setSelectedMockups] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  // results
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inFlight = useRef(false);
  const printfulInFlight = useRef(false);
  // presets
  const [modelPresets, setModelPresets] = useState<PresetAsset[]>([]);
  const [productPresets, setProductPresets] = useState<PresetAsset[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presetsTab, setPresetsTab] = useState<"model" | "product">("model");
  const [productUploadFile, setProductUploadFile] = useState<File | null>(null);

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
    void (async () => {
      try {
        const res = await fetch("/api/tools/presets", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; presets?: PresetAsset[] };
        if (json.ok) {
          const all = (json.presets ?? []).filter((p) => p.object_url);
          setModelPresets(all.filter((p) => p.asset_domain === "mockup_model_preset"));
          setProductPresets(all.filter((p) => p.asset_domain === "mockup_product_preset"));
        }
      } catch {
        /* presets unavailable */
      }
    })();
  }, []);

  const modelDesc = useMemo(() => {
    if (modelDescManual.trim()) return modelDescManual.trim();
    return [mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories].filter(Boolean).join(", ");
  }, [mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories, modelDescManual]);

  const prompt = useMemo(() => {
    if (mode === "printful") return "";
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

  const generatePrintful = useCallback(async () => {
    if (!designRef) {
      setPrintfulState({ status: "error", error: "請先選一張設計圖（My Designs 點選或上傳）" });
      return;
    }
    if (printfulInFlight.current) return;
    printfulInFlight.current = true;
    setPrintfulState({ status: "generating" });
    setSaveMockupStates({});
    setSelectedMockups(new Set());
    try {
      // Resolve true pixel dimensions for aspect-ratio-correct Printful position.
      // img.naturalWidth/Height works cross-origin without CORS headers.
      const dims = await getImageNaturalDims(designRef);
      // Send imageUrl (R2 https://) or image (base64 data URL) — server handles both.
      // Never fetch cross-origin in the browser (CORS).
      const isDataUrl = designRef.startsWith("data:");
      const res = await fetch("/api/tools/studio/mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isDataUrl ? { image: designRef } : { imageUrl: designRef }),
          productType: printfulProduct,
          ...(dims ? { imageWidth: dims.width, imageHeight: dims.height } : {}),
        }),
      });
      const json = (await res.json()) as { ok: boolean; mockups?: MockupView[]; error?: string };
      if (!json.ok || !json.mockups) {
        setPrintfulState({ status: "error", error: json.error ?? `HTTP ${res.status}` });
        return;
      }
      setPrintfulState({ status: "done", mockups: json.mockups });
    } catch (err) {
      setPrintfulState({ status: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      printfulInFlight.current = false;
    }
  }, [designRef, printfulProduct]);

  const toggleMockup = useCallback((url: string) => {
    setSelectedMockups((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }, []);

  const saveBulkMockups = useCallback(async () => {
    if (selectedMockups.size === 0 || bulkSaving) return;
    setBulkSaving(true);
    // Save in parallel; individual states updated by saveMockupToDesigns
    await Promise.all([...selectedMockups].map((url) => saveMockupToDesigns(url)));
    setBulkSaving(false);
    setSelectedMockups(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMockups, bulkSaving]);

  const saveMockupToDesigns = useCallback(async (mockupUrl: string) => {
    setSaveMockupStates((prev) => ({ ...prev, [mockupUrl]: "saving" }));
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: mockupUrl,
          prompt: `[printful:${printfulProduct}]`,
          source: "pod-studio",
        }),
      });
      const json = (await res.json()) as { ok: boolean };
      setSaveMockupStates((prev) => ({ ...prev, [mockupUrl]: json.ok ? "saved" : "error" }));
    } catch {
      setSaveMockupStates((prev) => ({ ...prev, [mockupUrl]: "error" }));
    }
  }, [printfulProduct]);

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

  const saveModelPreset = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    const name = window.prompt("預設名稱：");
    if (!name || !name.trim()) return;
    try {
      const res = await fetch("/api/tools/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: gen.image,
          presetType: "model",
          presetName: name.trim(),
          presetSettings: {
            mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories,
            pose, environment, modelLighting, envPropTR, envPropBL,
            garment, color, ageGroup,
          },
        }),
      });
      const json = (await res.json()) as { ok: boolean; preset?: PresetAsset };
      if (json.ok && json.preset) {
        setModelPresets((prev) => [json.preset!, ...prev]);
      }
    } catch {
      /* save failed — silent */
    }
  }, [gen, mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories,
      pose, environment, modelLighting, envPropTR, envPropBL, garment, color, ageGroup]);

  const saveProductPreset = useCallback(async () => {
    if (!productUploadFile) return;
    const name = window.prompt("產品預設名稱：");
    if (!name || !name.trim()) return;
    try {
      const dataUrl = await readFileAsDataUrl(productUploadFile);
      const res = await fetch("/api/tools/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          presetType: "product",
          presetName: name.trim(),
        }),
      });
      const json = (await res.json()) as { ok: boolean; preset?: PresetAsset };
      if (json.ok && json.preset) {
        setProductPresets((prev) => [json.preset!, ...prev]);
        setProductUploadFile(null);
      }
    } catch {
      /* save failed — silent */
    }
  }, [productUploadFile]);

  const applyModelPreset = useCallback((preset: PresetAsset) => {
    if (preset.object_url) {
      setDesignRef(preset.object_url);
      setDesignThumb(preset.object_url);
    }
    const s = preset.metadata?.preset_settings;
    if (!s) return;
    if (s.mEthnicity !== undefined) setMEthnicity(s.mEthnicity);
    if (s.mGender !== undefined) setMGender(s.mGender);
    if (s.mAge !== undefined) setMAge(s.mAge);
    if (s.mBody !== undefined) setMBody(s.mBody);
    if (s.mMakeup !== undefined) setMMakeup(s.mMakeup);
    if (s.mAccessories !== undefined) setMAccessories(s.mAccessories);
    if (s.pose !== undefined) setPose(s.pose);
    if (s.environment !== undefined) setEnvironment(s.environment);
    if (s.modelLighting !== undefined) setModelLighting(s.modelLighting);
    if (s.envPropTR !== undefined) setEnvPropTR(s.envPropTR);
    if (s.envPropBL !== undefined) setEnvPropBL(s.envPropBL);
    if (s.garment !== undefined) setGarment(s.garment);
    if (s.color !== undefined) setColor(s.color as GarmentColor);
    if (s.ageGroup !== undefined) setAgeGroup(s.ageGroup as "adult" | "youth");
  }, []);

  const deletePreset = useCallback(async (id: string, domain: "mockup_model_preset" | "mockup_product_preset") => {
    await fetch(`/api/tools/presets?id=${id}`, { method: "DELETE" });
    if (domain === "mockup_model_preset") {
      setModelPresets((prev) => prev.filter((p) => p.id !== id));
    } else {
      setProductPresets((prev) => prev.filter((p) => p.id !== id));
    }
  }, []);

  const selectStyle = (selected: boolean) => ({
    border: selected ? "2px solid #4f8cff" : "2px solid transparent",
    borderRadius: 6,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, padding: 16 }}>
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Preset Library ── */}
        <div style={{ border: "1px solid #333", borderRadius: 6 }}>
          <button
            className="btn-secondary"
            style={{ width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: 6 }}
            onClick={() => setPresetsOpen((v) => !v)}
          >
            {presetsOpen ? "[-]" : "[+]"} 預設庫 (Preset Library)
          </button>
          {presetsOpen && (
            <div style={{ padding: "8px 10px" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <button
                  className={presetsTab === "model" ? "btn-primary" : "btn-secondary"}
                  style={{ fontSize: 12 }}
                  onClick={() => setPresetsTab("model")}
                >
                  模特預設
                </button>
                <button
                  className={presetsTab === "product" ? "btn-primary" : "btn-secondary"}
                  style={{ fontSize: 12 }}
                  onClick={() => setPresetsTab("product")}
                >
                  產品預設
                </button>
              </div>

              {presetsTab === "model" && (
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {modelPresets.length === 0 && (
                      <p style={{ fontSize: 12, opacity: 0.5 }}>尚無模特預設</p>
                    )}
                    {modelPresets.map((p) => (
                      <div key={p.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => applyModelPreset(p)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.object_url!}
                          alt={p.metadata?.preset_name ?? p.id}
                          style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 4, background: "#111" }}
                        />
                        <div style={{ fontSize: 10, textAlign: "center", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.metadata?.preset_name ?? "預設"}
                        </div>
                        <button
                          style={{ position: "absolute", top: 0, right: 0, fontSize: 9, background: "#e5484d", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer", padding: "1px 3px" }}
                          onClick={(e) => { e.stopPropagation(); void deletePreset(p.id, p.asset_domain); }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {presetsTab === "product" && (
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {productPresets.length === 0 && (
                      <p style={{ fontSize: 12, opacity: 0.5 }}>尚無產品預設</p>
                    )}
                    {productPresets.map((p) => (
                      <div key={p.id} style={{ position: "relative", cursor: "pointer" }}
                        onClick={() => { if (p.object_url) { setDesignRef(p.object_url); setDesignThumb(p.object_url); } }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.object_url!}
                          alt={p.metadata?.preset_name ?? p.id}
                          style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 4, background: "#111" }}
                        />
                        <div style={{ fontSize: 10, textAlign: "center", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.metadata?.preset_name ?? "預設"}
                        </div>
                        <button
                          style={{ position: "absolute", top: 0, right: 0, fontSize: 9, background: "#e5484d", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer", padding: "1px 3px" }}
                          onClick={(e) => { e.stopPropagation(); void deletePreset(p.id, p.asset_domain); }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>上傳產品圖</div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ fontSize: 11, marginBottom: 4 }}
                    onChange={(e) => setProductUploadFile(e.target.files?.[0] ?? null)}
                  />
                  {productUploadFile && (
                    <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => void saveProductPreset()}>
                      存為產品預設
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── My Designs ── */}
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
          <button className={mode === "printful" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("printful")}>Printful</button>
        </div>

        {mode === "printful" ? (
          <>
            <label style={{ fontSize: 13 }}>
              產品類型
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={printfulProduct} onChange={(e) => setPrintfulProduct(e.target.value as PrintfulProductType)}>
                {PRINTFUL_PRODUCTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
            <button
              className="btn-primary"
              disabled={printfulState.status === "generating"}
              onClick={() => void generatePrintful()}
            >
              {printfulState.status === "generating" ? "Printful 合成中（30–60 秒）…" : "生成 Printful Mockup"}
            </button>
          </>
        ) : (
          <>
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
                <div style={{ fontSize: 13 }}>
                  模特描述
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>族裔／膚色</div>
                      <select className="btn-secondary" style={{ width: "100%" }} value={mEthnicity} onChange={(e) => setMEthnicity(e.target.value)}>
                        {MODEL_ETHNICITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>性別</div>
                      <select className="btn-secondary" style={{ width: "100%" }} value={mGender} onChange={(e) => setMGender(e.target.value)}>
                        {MODEL_GENDERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>年齡</div>
                      <select className="btn-secondary" style={{ width: "100%" }} value={mAge} onChange={(e) => setMAge(e.target.value)}>
                        {MODEL_AGES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>體型</div>
                      <select className="btn-secondary" style={{ width: "100%" }} value={mBody} onChange={(e) => setMBody(e.target.value)}>
                        {MODEL_BODY_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>妝造</div>
                      <select className="btn-secondary" style={{ width: "100%" }} value={mMakeup} onChange={(e) => setMMakeup(e.target.value)}>
                        {MODEL_MAKEUP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>飾品</div>
                      <select className="btn-secondary" style={{ width: "100%" }} value={mAccessories} onChange={(e) => setMAccessories(e.target.value)}>
                        {MODEL_ACCESSORIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {modelDesc && !modelDescManual && (
                    <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>→ {modelDesc}</div>
                  )}
                  <input
                    className="btn-secondary"
                    style={{ width: "100%", marginTop: 6 }}
                    value={modelDescManual}
                    onChange={(e) => setModelDescManual(e.target.value)}
                    placeholder="手動描述（覆蓋上方，例：blonde Asian woman, 20s）"
                  />
                </div>
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
              模型（⟳ = 吃設計圖；首選 Nano Banana 2）
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={model} onChange={(e) => setModel(e.target.value as StudioModel)}>
                {MOCKUP_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.maxRefs > 0 ? "⟳ " : "○ "}{m.group} · {m.label} (~NT${m.costNt})
                  </option>
                ))}
              </select>
              {MOCKUP_MODELS.find((m) => m.value === model)?.maxRefs === 0 && (
                <span style={{ color: "#f5a623", fontSize: 12 }}>⚠ 此模型不吃參考圖，設計不會印上衣服</span>
              )}
            </label>

            <label style={{ fontSize: 13 }}>
              比例
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}>
                {(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"] as const).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>

            <button className="btn-primary" disabled={gen.status === "generating"} onClick={() => void generate()}>
              {gen.status === "generating" ? "合成中（20–40 秒）…" : "合成 Mockup"}
            </button>
          </>
        )}
      </div>

      {/* ── Preview ─────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: 14 }}>
        {mode !== "printful" && (
          <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: "pre-wrap", marginBottom: 10 }}>{prompt}</div>
        )}

        {/* AI generate result */}
        {mode !== "printful" && (
          <>
            {gen.status === "idle" ? <p style={{ opacity: 0.6 }}>選設計圖 → 填控制欄 → 合成。</p> : null}
            {gen.status === "generating" ? <p style={{ opacity: 0.7 }}>合成中…</p> : null}
            {gen.status === "error" ? <p style={{ color: "#e5484d" }}>{gen.error}</p> : null}
            {gen.status === "done" && gen.image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gen.image} alt="mockup" style={{ maxWidth: "100%", maxHeight: 600, borderRadius: 8, background: "#111" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveMockup()}>
                    {saveState === "saved" ? "已存入 My Designs ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
                  </button>
                  <a className="btn-secondary" href={gen.image} download={`mockup-${mode}-${color}.png`}>下載</a>
                  <button className="btn-secondary" onClick={() => void generate()}>再合成一張</button>
                  {mode === "model" && (
                    <button className="btn-secondary" onClick={() => void saveModelPreset()}>儲存為模特預設</button>
                  )}
                  {saveState === "error" ? <span style={{ color: "#e5484d", fontSize: 12 }}>儲存失敗</span> : null}
                </div>
                <div style={{ marginTop: 14 }}>
                  <ImageEditPromptPanel
                    sourceImage={gen.image}
                    currentPrompt={prompt}
                    imageModel={model}
                    target="mockup"
                    aspectRatio={aspect}
                    styleAnchor={{
                      model,
                      mode: "image",
                      stylePrompt: prompt,
                      subject: `${garment} ${color}`,
                      refs: designRef ? 1 : 0,
                      target: "mockup",
                    }}
                    onEditedImage={(image, meta) => {
                      setModel(meta.model);
                      setGen({ status: "done", image });
                      setSaveState("idle");
                    }}
                  />
                </div>
              </>
            ) : null}
          </>
        )}

        {/* Printful result */}
        {mode === "printful" && (
          <>
            {printfulState.status === "idle" && <p style={{ opacity: 0.6 }}>選設計圖 → 選產品 → 生成 Printful Mockup。</p>}
            {printfulState.status === "generating" && <p style={{ opacity: 0.7 }}>Printful 合成中（30–60 秒）…</p>}
            {printfulState.status === "error" && <p style={{ color: "#e5484d" }}>{printfulState.error}</p>}
            {printfulState.status === "done" && printfulState.mockups && (
              <>
                {/* Toolbar */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, opacity: 0.7 }}>
                    {printfulState.mockups.length} 張（{PRINTFUL_PRODUCTS.find((p) => p.value === printfulProduct)?.label}）
                  </span>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 11 }}
                    onClick={() => setSelectedMockups(new Set(printfulState.mockups!.map((m) => m.url)))}
                  >
                    全選
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 11 }}
                    onClick={() => setSelectedMockups(new Set())}
                  >
                    取消
                  </button>
                  {selectedMockups.size > 0 && (
                    <button
                      className="btn-primary"
                      style={{ fontSize: 11 }}
                      disabled={bulkSaving}
                      onClick={() => void saveBulkMockups()}
                    >
                      {bulkSaving ? "儲存中…" : `存入 My Designs (${selectedMockups.size})`}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {printfulState.mockups.map((mv) => {
                    const st = saveMockupStates[mv.url] ?? "idle";
                    const checked = selectedMockups.has(mv.url);
                    return (
                      <div
                        key={mv.url}
                        style={{ display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", position: "relative" }}
                        onClick={() => toggleMockup(mv.url)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mv.url}
                          alt={mv.label}
                          style={{ width: "100%", borderRadius: 6, background: "#111", outline: checked ? "2px solid #4f8cff" : "none" }}
                        />
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMockup(mv.url)}
                          style={{ position: "absolute", top: 4, left: 4, width: 16, height: 16, cursor: "pointer" }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {st === "saved" && (
                          <div style={{ position: "absolute", top: 4, right: 4, background: "#1a9e5c", color: "#fff", fontSize: 10, borderRadius: 3, padding: "1px 4px" }}>✓ 已存入</div>
                        )}
                        <div style={{ fontSize: 11, opacity: 0.7, textAlign: "center" }}>{mv.label}</div>
                        {st === "error" && <span style={{ color: "#e5484d", fontSize: 10, textAlign: "center" }}>儲存失敗</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
