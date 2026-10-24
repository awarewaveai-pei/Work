"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "@/lib/studio/model-options";
import {
  GARMENTS,
  FLAT_SURFACES,
  FLAT_ARRANGEMENTS,
  FLAT_LIGHTING,
  FLAT_PROPS,
  MODEL_SCENES,
  MODEL_PROPS,
  MODEL_POSES,
  MODEL_LIGHTING,
  MODEL_ETHNICITIES,
  MODEL_GENDERS,
  MODEL_AGES,
  MODEL_BODY_TYPES,
  MODEL_MAKEUP,
  MODEL_ACCESSORIES,
  MODEL_FRAMING,
  MODEL_EMOTIONS,
  GARMENT_PLACEMENT,
  CATEGORY_OPTIONS,
  REFERENCE_KIND_OPTIONS,
  productCategoryFromType,
  buildFlatMockupPrompt,
  buildModelMockupPrompt,
  isChestOccludingPose,
  type GarmentColor,
  type MockupMode,
  type ProductCategory,
  type ReferenceKind,
} from "@/lib/studio/mockup-prompt";


const MOCKUP_MODELS = STUDIO_MODEL_OPTIONS;

export interface CatalogProduct {
  id: number;
  title: string;
  image: string;
  typeName: string;
  typeCode: string;
}

interface ProductMockupResult {
  productId: number;
  productTitle: string;
  productImage: string;
  status: "generating" | "done" | "error";
  mockups?: MockupView[];
  error?: string;
}

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

function getImageNaturalDims(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Apply opacity to a design image (data URL only). Returns original if R2 URL or opacity=100. */
async function applyDesignOpacity(src: string, opacityPct: number): Promise<string> {
  if (opacityPct >= 100 || !src.startsWith("data:")) return src;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(src); return; }
      ctx.globalAlpha = opacityPct / 100;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** Reusable catalog product grid (multi-select). */
function CatalogGrid({
  catalog,
  catalogLoading,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  catalog: CatalogProduct[];
  catalogLoading: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        選擇產品（多選）
        {selectedIds.size > 0 && (
          <span style={{ marginLeft: 8, color: "var(--accent)", fontSize: 12 }}>已選 {selectedIds.size} 個</span>
        )}
      </div>
      {catalogLoading && <p style={{ fontSize: 12, opacity: 0.6 }}>載入產品目錄中…</p>}
      {!catalogLoading && catalog.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--red)" }}>無法載入 Printful 產品目錄</p>
      )}
      {/* 3-col grid of SQUARE cards, image fills each card. Two CSS facts are load-bearing
          (both verified live on production DOM, do NOT change without re-testing):
          • aspectRatio:"1 / 1" on the card → square that scales with the column width.
          • gridAutoRows:"max-content" on the grid → REQUIRED so each row takes the card's
            full aspect-ratio height. With the default auto/1fr rows, the aspect-ratio
            height does NOT feed grid track sizing here, rows collapse, and cards OVERLAP
            (live test: max-content→no overlap; auto/1fr→cards overlap by ~80px). */}
      {catalog.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "max-content", gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {catalog.map((p) => {
            const selected = selectedIds.has(p.id);
            const name = p.title.replace(/\s*\|.*$/, "");
            return (
              <div
                key={p.id}
                onClick={() => onToggle(p.id)}
                title={name}
                style={{
                  cursor: "pointer",
                  border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                  borderRadius: 6,
                  overflow: "hidden",
                  background: "#1a1a1a",
                  position: "relative",
                  aspectRatio: "1 / 1",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt={name} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {selected && (
                  <div style={{ position: "absolute", top: 4, right: 4, background: "var(--accent)", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--btn-primary-text)", fontWeight: 700, zIndex: 2 }}>✓</div>
                )}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 6px 4px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", zIndex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#fff", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {p.typeName} · #{p.id}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {catalog.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={onSelectAll}>全選</button>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={onClearAll}>清除</button>
        </div>
      )}
    </>
  );
}

/** Multi-select chip row for props. */
function PropChips({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            onClick={() => onToggle(o.value)}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              border: on ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
              background: on ? "var(--ai-bg)" : "transparent",
              color: on ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// The Printful catalog route is not a door API: the staff page passes the loader in (MockupStudioStaff.tsx), so a
// design door page's imports name no /api/tools/printful route (step-8 card §2 S1; card D3 decides the door's catalog).
export default function MockupStudio({ loadCatalog }: { loadCatalog?: () => Promise<CatalogProduct[] | null> }) {
  // design source
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [designRef, setDesignRef] = useState<string | null>(null);
  const [designThumb, setDesignThumb] = useState<string | null>(null);
  // mode + shared
  const [mode, setMode] = useState<MockupMode | "printful">("model");
  const [color, setColor] = useState<GarmentColor>("white");
  const [model, setModel] = useState<StudioModel>("nano-banana-2");
  const [aspect, setAspect] = useState<AspectRatio>("2:3");
  // printful catalog (shared across all tabs)
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  // model tab product selection
  const [selectedModelProductIds, setSelectedModelProductIds] = useState<Set<number>>(new Set());
  // flat tab product selection
  const [selectedFlatProductIds, setSelectedFlatProductIds] = useState<Set<number>>(new Set());
  // printful tab product selection
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  // printful controls
  const [designSizePct, setDesignSizePct] = useState(80); // 40-100
  const [designOpacity, setDesignOpacity] = useState(90); // 60-100
  // flat controls
  const [flatSurface, setFlatSurface] = useState(FLAT_SURFACES[0].value);
  const [flatArrangement, setFlatArrangement] = useState(FLAT_ARRANGEMENTS[0].value);
  const [flatLighting, setFlatLighting] = useState(FLAT_LIGHTING[0].value);
  const [flatProps, setFlatProps] = useState<Set<string>>(new Set());
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
  const [modelScene, setModelScene] = useState(MODEL_SCENES[0].value);
  const [modelLighting, setModelLighting] = useState(MODEL_LIGHTING[0].value);
  const [modelFraming, setModelFraming] = useState("three-quarter");
  const [modelEmotion, setModelEmotion] = useState("");
  const [flatCornerDecor, setFlatCornerDecor] = useState(false);
  const [modelProps, setModelProps] = useState<Set<string>>(new Set());
  // reference-image kind (design to print vs photo of a finished product) + manual category
  // override — both let the user mock up THEIR OWN products (not just the Printful catalog).
  const [referenceKind, setReferenceKind] = useState<ReferenceKind>("design");
  const [categoryOverride, setCategoryOverride] = useState<"" | ProductCategory>("");
  const [placement, setPlacement] = useState("center-chest");
  // results
  const [productResults, setProductResults] = useState<Map<number, ProductMockupResult>>(new Map());
  const [saveMockupStates, setSaveMockupStates] = useState<SaveMockupState>({});
  const [selectedMockups, setSelectedMockups] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const inFlight = useRef(false);
  const printfulInFlight = useRef(false);
  const jobIdRef = useRef<string | null>(null);
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
      } catch { /* unavailable */ }
    })();
    if (loadCatalog) void (async () => {
      setCatalogLoading(true);
      try {
        const products = await loadCatalog();
        if (products) setCatalog(products);
      } catch { /* unavailable */ } finally { setCatalogLoading(false); }
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
      } catch { /* unavailable */ }
    })();
  }, [loadCatalog]);

  const modelDesc = useMemo(() => {
    if (modelDescManual.trim()) return modelDescManual.trim();
    return [mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories].filter(Boolean).join(", ");
  }, [mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories, modelDescManual]);

  /** Derive garment phrase from selected catalog products for model/flat tabs. */
  const garmentPhraseFor = useCallback((selectedIds: Set<number>) => {
    if (selectedIds.size === 0) return GARMENTS.tshirt.phrase;
    const first = [...selectedIds][0];
    const prd = catalog.find((c) => c.id === first);
    if (!prd) return GARMENTS.tshirt.phrase;
    // Use clean product title as phrase
    return prd.title.replace(/\s*\|.*$/, "").toLowerCase();
  }, [catalog]);

  /** Model-interaction category (apparel→wear / mug→hold / jewelry→wear-accessory) derived
   *  from the first selected product's Printful type, so the model prompt adapts automatically. */
  const modelCategory = useMemo<ProductCategory>(() => {
    if (categoryOverride) return categoryOverride;
    const first = [...selectedModelProductIds][0];
    const prd = first != null ? catalog.find((c) => c.id === first) : undefined;
    return productCategoryFromType(prd?.typeName);
  }, [categoryOverride, selectedModelProductIds, catalog]);

  /** Same derivation for the flat tab — non-apparel 3-D products shoot upright (立拍). */
  const flatCategory = useMemo<ProductCategory>(() => {
    if (categoryOverride) return categoryOverride;
    const first = [...selectedFlatProductIds][0];
    const prd = first != null ? catalog.find((c) => c.id === first) : undefined;
    return productCategoryFromType(prd?.typeName);
  }, [categoryOverride, selectedFlatProductIds, catalog]);

  const prompt = useMemo(() => {
    if (mode === "printful") return "";
    if (mode === "flat") {
      return buildFlatMockupPrompt({
        garmentPhrase: garmentPhraseFor(selectedFlatProductIds),
        color,
        surface: flatSurface,
        arrangement: flatArrangement,
        lighting: flatLighting,
        props: [...flatProps].map((v) => FLAT_PROPS.find((p) => p.value === v)?.label ?? v),
        designSizePct,
        productCategory: flatCategory,
        referenceKind,
        cornerDecor: flatCornerDecor,
        placement,
      });
    }
    return buildModelMockupPrompt({
      garmentPhrase: garmentPhraseFor(selectedModelProductIds),
      color,
      ageGroup,
      modelDescription: modelDesc,
      pose,
      scene: modelScene,
      lighting: modelLighting,
      props: [...modelProps].map((v) => MODEL_PROPS.find((p) => p.value === v)?.label ?? v),
      designSizePct,
      framing: modelFraming,
      productCategory: modelCategory,
      referenceKind,
      emotion: modelEmotion,
      placement,
    });
  }, [mode, color, flatSurface, flatArrangement, flatLighting, flatProps,
      selectedFlatProductIds, selectedModelProductIds, garmentPhraseFor,
      ageGroup, modelDesc, pose, modelScene, modelLighting, modelProps,
      designSizePct, modelFraming, modelCategory, flatCategory, referenceKind,
      modelEmotion, flatCornerDecor, placement]);

  const effectivePrompt = promptOverride ?? prompt;

  const onUploadDesign = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const dataUrl = await readFileAsDataUrl(files[0]);
      setDesignRef(dataUrl);
      setDesignThumb(dataUrl);
    } catch { /* unreadable */ }
  }, []);

  const generate = useCallback(async () => {
    if (!designRef) { setGen({ status: "error", error: "請先選一張設計圖（My Designs 點選或上傳）" }); return; }
    if (inFlight.current) return;
    jobIdRef.current = crypto.randomUUID();
    inFlight.current = true;
    setGen({ status: "generating" });
    setSaveState("idle");
    try {
      const processedRef = await applyDesignOpacity(designRef, designOpacity);
      const res = await fetch("/api/tools/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: effectivePrompt, referenceImages: [processedRef], aspectRatio: aspect, _jobId: jobIdRef.current }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) { setGen({ status: "error", error: json.error ?? `HTTP ${res.status}` }); return; }
      setGen({ status: "done", image: json.image });
    } catch (err) {
      setGen({ status: "error", error: err instanceof Error ? err.message : String(err) });
    } finally { inFlight.current = false; }
  }, [designRef, model, effectivePrompt, aspect, designOpacity]);

  const generatePrintful = useCallback(async () => {
    if (!designRef) {
      setProductResults(new Map([[0, { productId: 0, productTitle: "", productImage: "", status: "error", error: "請先選一張設計圖（My Designs 點選或上傳）" }]]));
      return;
    }
    if (selectedProductIds.size === 0) {
      setProductResults(new Map([[0, { productId: 0, productTitle: "", productImage: "", status: "error", error: "請先選擇至少一個產品" }]]));
      return;
    }
    if (printfulInFlight.current) return;
    jobIdRef.current = crypto.randomUUID();
    printfulInFlight.current = true;

    const initial = new Map<number, ProductMockupResult>();
    for (const pid of selectedProductIds) {
      const prd = catalog.find((c) => c.id === pid);
      initial.set(pid, { productId: pid, productTitle: prd?.title ?? `Product ${pid}`, productImage: prd?.image ?? "", status: "generating" });
    }
    setProductResults(new Map(initial));
    setSaveMockupStates({});
    setSelectedMockups(new Set());

    // Apply opacity to design (client-side, data URL only)
    const processedDesign = await applyDesignOpacity(designRef, designOpacity);
    const dims = await getImageNaturalDims(processedDesign);
    const isDataUrl = processedDesign.startsWith("data:");
    const sizeFraction = designSizePct / 100;

    const BATCH_SIZE = 2;
    const pids = [...selectedProductIds];

    const generateOne = async (pid: number) => {
      const prd = catalog.find((c) => c.id === pid);
      try {
        const res = await fetch("/api/tools/studio/mockup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isDataUrl ? { image: processedDesign } : { imageUrl: processedDesign }),
            productId: pid,
            designSizePct: sizeFraction,
            color,
            ...(dims ? { imageWidth: dims.width, imageHeight: dims.height } : {}),
          }),
        });
        const json = (await res.json()) as { ok: boolean; mockups?: MockupView[]; error?: string };
        setProductResults((prev) => {
          const next = new Map(prev);
          next.set(pid, {
            productId: pid,
            productTitle: prd?.title ?? `Product ${pid}`,
            productImage: prd?.image ?? "",
            status: json.ok && json.mockups ? "done" : "error",
            mockups: json.mockups,
            error: json.ok ? undefined : (json.error ?? "未知錯誤"),
          });
          return next;
        });
      } catch (err) {
        setProductResults((prev) => {
          const next = new Map(prev);
          next.set(pid, { productId: pid, productTitle: prd?.title ?? `Product ${pid}`, productImage: prd?.image ?? "", status: "error", error: err instanceof Error ? err.message : String(err) });
          return next;
        });
      }
    };

    for (let i = 0; i < pids.length; i += BATCH_SIZE) {
      await Promise.all(pids.slice(i, i + BATCH_SIZE).map(generateOne));
    }
    printfulInFlight.current = false;
  }, [designRef, selectedProductIds, catalog, designSizePct, designOpacity, color]);

  const toggleMockup = useCallback((url: string) => {
    setSelectedMockups((prev) => { const next = new Set(prev); if (next.has(url)) next.delete(url); else next.add(url); return next; });
  }, []);

  const saveBulkMockups = useCallback(async () => {
    if (selectedMockups.size === 0 || bulkSaving) return;
    setBulkSaving(true);
    await Promise.all([...selectedMockups].map((url) => saveMockupToDesigns(url)));
    setBulkSaving(false);
    setSelectedMockups(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMockups, bulkSaving]);

  const saveMockupToDesigns = useCallback(async (mockupUrl: string) => {
    setSaveMockupStates((prev) => ({ ...prev, [mockupUrl]: "saving" }));
    const productTitle = [...productResults.values()].find((r) => r.mockups?.some((m) => m.url === mockupUrl))?.productTitle ?? "product";
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: mockupUrl, prompt: `[printful:${productTitle}]`, source: "mockup" }),
      });
      const json = (await res.json()) as { ok: boolean };
      setSaveMockupStates((prev) => ({ ...prev, [mockupUrl]: json.ok ? "saved" : "error" }));
    } catch {
      setSaveMockupStates((prev) => ({ ...prev, [mockupUrl]: "error" }));
    }
  }, [productResults]);

  const saveMockup = useCallback(async () => {
    if (gen.status !== "done" || !gen.image) return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: gen.image, prompt: `[mockup:${mode}:${color}] ${effectivePrompt}`, modelName: model, source: "mockup" }),
      });
      const json = (await res.json()) as { ok: boolean };
      setSaveState(json.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
  }, [gen, mode, color, effectivePrompt, model]);

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
            pose, modelScene, modelLighting,
            modelProps: JSON.stringify([...modelProps]),
            color, ageGroup,
          },
        }),
      });
      const json = (await res.json()) as { ok: boolean; preset?: PresetAsset };
      if (json.ok && json.preset) setModelPresets((prev) => [json.preset!, ...prev]);
    } catch { /* silent */ }
  }, [gen, mEthnicity, mGender, mAge, mBody, mMakeup, mAccessories,
      pose, modelScene, modelLighting, modelProps, color, ageGroup]);

  const saveProductPreset = useCallback(async () => {
    if (!productUploadFile) return;
    const name = window.prompt("產品預設名稱：");
    if (!name || !name.trim()) return;
    try {
      const dataUrl = await readFileAsDataUrl(productUploadFile);
      const res = await fetch("/api/tools/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, presetType: "product", presetName: name.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; preset?: PresetAsset };
      if (json.ok && json.preset) { setProductPresets((prev) => [json.preset!, ...prev]); setProductUploadFile(null); }
    } catch { /* silent */ }
  }, [productUploadFile]);

  const applyModelPreset = useCallback((preset: PresetAsset) => {
    if (preset.object_url) { setDesignRef(preset.object_url); setDesignThumb(preset.object_url); }
    const s = preset.metadata?.preset_settings;
    if (!s) return;
    if (s.mEthnicity !== undefined) setMEthnicity(s.mEthnicity);
    if (s.mGender !== undefined) setMGender(s.mGender);
    if (s.mAge !== undefined) setMAge(s.mAge);
    if (s.mBody !== undefined) setMBody(s.mBody);
    if (s.mMakeup !== undefined) setMMakeup(s.mMakeup);
    if (s.mAccessories !== undefined) setMAccessories(s.mAccessories);
    if (s.pose !== undefined) setPose(s.pose);
    if (s.modelScene !== undefined) setModelScene(s.modelScene);
    if (s.modelLighting !== undefined) setModelLighting(s.modelLighting);
    if (s.modelProps) { try { setModelProps(new Set(JSON.parse(s.modelProps) as string[])); } catch { /* ignore */ } }
    if (s.color !== undefined) setColor(s.color as GarmentColor);
    if (s.ageGroup !== undefined) setAgeGroup(s.ageGroup as "adult" | "youth");
  }, []);

  const deletePreset = useCallback(async (id: string, domain: "mockup_model_preset" | "mockup_product_preset") => {
    await fetch(`/api/tools/presets?id=${id}`, { method: "DELETE" });
    if (domain === "mockup_model_preset") setModelPresets((prev) => prev.filter((p) => p.id !== id));
    else setProductPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const toggleCatalogProduct = useCallback((setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    setter((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const selectStyle = (selected: boolean) => ({
    border: selected ? "2px solid var(--accent)" : "2px solid transparent",
    borderRadius: 6,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, padding: 16, alignItems: "start" }}>
      {/* ── Controls (right column) ──────────────────────────── */}
      <div className="build-panel" style={{ gridColumn: 2, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

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
                <button className={presetsTab === "model" ? "btn-primary" : "btn-secondary"} style={{ fontSize: 12 }} onClick={() => setPresetsTab("model")}>模特預設</button>
                <button className={presetsTab === "product" ? "btn-primary" : "btn-secondary"} style={{ fontSize: 12 }} onClick={() => setPresetsTab("product")}>產品預設</button>
              </div>
              {presetsTab === "model" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {modelPresets.length === 0 && <p style={{ fontSize: 12, opacity: 0.5 }}>尚無模特預設</p>}
                  {modelPresets.map((p) => (
                    <div key={p.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => applyModelPreset(p)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.object_url!} alt={p.metadata?.preset_name ?? p.id} style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 4, background: "#111" }} />
                      <div style={{ fontSize: 10, textAlign: "center", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.metadata?.preset_name ?? "預設"}</div>
                      <button style={{ position: "absolute", top: 0, right: 0, fontSize: 9, background: "var(--red)", color: "var(--btn-primary-text)", border: "none", borderRadius: 2, cursor: "pointer", padding: "1px 3px" }} onClick={(e) => { e.stopPropagation(); void deletePreset(p.id, p.asset_domain); }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {presetsTab === "product" && (
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {productPresets.length === 0 && <p style={{ fontSize: 12, opacity: 0.5 }}>尚無產品預設</p>}
                    {productPresets.map((p) => (
                      <div key={p.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => { if (p.object_url) { setDesignRef(p.object_url); setDesignThumb(p.object_url); } }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.object_url!} alt={p.metadata?.preset_name ?? p.id} style={{ width: 64, height: 80, objectFit: "cover", borderRadius: 4, background: "#111" }} />
                        <div style={{ fontSize: 10, textAlign: "center", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.metadata?.preset_name ?? "預設"}</div>
                        <button style={{ position: "absolute", top: 0, right: 0, fontSize: 9, background: "var(--red)", color: "var(--btn-primary-text)", border: "none", borderRadius: 2, cursor: "pointer", padding: "1px 3px" }} onClick={(e) => { e.stopPropagation(); void deletePreset(p.id, p.asset_domain); }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>上傳產品圖</div>
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ fontSize: 11, marginBottom: 4 }} onChange={(e) => setProductUploadFile(e.target.files?.[0] ?? null)} />
                  {productUploadFile && <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => void saveProductPreset()}>存為產品預設</button>}
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
              <img key={d.id} src={d.object_url!} alt={d.metadata?.prompt ?? d.id}
                style={{ width: 56, height: 56, objectFit: "contain", background: "#111", ...selectStyle(designRef === d.object_url) }}
                onClick={() => { setDesignRef(d.object_url); setDesignThumb(d.object_url); }}
              />
            ))}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" style={{ width: "100%", marginTop: 6 }} onChange={(e) => void onUploadDesign(e.target.files)} />
          {designThumb && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              已選設計：{/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={designThumb} alt="selected design" style={{ width: 40, height: 40, objectFit: "contain", background: "#111", verticalAlign: "middle", marginLeft: 6, borderRadius: 4 }} />
            </div>
          )}
        </div>

        {/* ── Mode tabs ── */}
        <div style={{ display: "flex", gap: 8 }}>
          <button className={mode === "model" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("model")}>模特</button>
          <button className={mode === "flat" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("flat")}>平拍</button>
          <button className={mode === "printful" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("printful")}>Printful</button>
        </div>

        {/* ── Shared shirt colour (all tabs). On Printful it picks the real White/Grey/Black
              variant from Printful's data; on AI tabs it sets the garment colour in the prompt. ── */}
        <div style={{ fontSize: 13 }}>
          顏色
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className={color === "white" ? "btn-primary" : "btn-secondary"} onClick={() => setColor("white")}>白</button>
            <button className={color === "grey" ? "btn-primary" : "btn-secondary"} onClick={() => setColor("grey")}>灰</button>
            <button className={color === "black" ? "btn-primary" : "btn-secondary"} onClick={() => setColor("black")}>黑（自動鎖色）</button>
          </div>
          {mode === "printful" && (
            <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
              對應 Printful 真實 variant（白=White、灰=Athletic Heather、黑=Black）
            </span>
          )}
        </div>

        {/* ═══════════════════ PRINTFUL TAB ═══════════════════ */}
        {mode === "printful" && (
          <>
            <CatalogGrid
              catalog={catalog} catalogLoading={catalogLoading}
              selectedIds={selectedProductIds}
              onToggle={(id) => toggleCatalogProduct(setSelectedProductIds, id)}
              onSelectAll={() => setSelectedProductIds(new Set(catalog.map((c) => c.id)))}
              onClearAll={() => setSelectedProductIds(new Set())}
            />

            <label style={{ fontSize: 13 }}>
              設計大小（{designSizePct}% 印刷寬度）
              <input type="range" min={40} max={100} step={5} value={designSizePct}
                onChange={(e) => setDesignSizePct(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }} />
            </label>

            <label style={{ fontSize: 13 }}>
              圖案透明度 {designOpacity}%
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>（褪色／復古效果，<b>不是</b>融合；僅對上傳圖有效，圖庫選的不生效）</span>
              <input type="range" min={60} max={100} step={5} value={designOpacity}
                onChange={(e) => setDesignOpacity(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }} />
            </label>

            <button
              className="btn-primary"
              disabled={[...productResults.values()].some((r) => r.status === "generating")}
              onClick={() => void generatePrintful()}
            >
              {[...productResults.values()].some((r) => r.status === "generating")
                ? `合成中（${[...productResults.values()].filter((r) => r.status === "generating").length} 產品剩餘）…`
                : `生成 Mockup（${selectedProductIds.size} 產品）`}
            </button>
          </>
        )}

        {/* ═══════════════════ MODEL TAB ═══════════════════════ */}
        {mode === "model" && (
          <>
            <label style={{ fontSize: 13 }}>
              參考圖類型
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={referenceKind} onChange={(e) => setReferenceKind(e.target.value as ReferenceKind)}>
                {REFERENCE_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
                {REFERENCE_KIND_OPTIONS.find((o) => o.value === referenceKind)?.hint}
              </span>
            </label>

            <label style={{ fontSize: 13 }}>
              產品類型
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={categoryOverride} onChange={(e) => setCategoryOverride(e.target.value as "" | ProductCategory)}>
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
                自己的產品（不在 Printful，如珠寶）在這裡指定類型。
              </span>
            </label>

            {modelCategory === "apparel" && (
              <label style={{ fontSize: 13 }}>
                圖案位置 Placement
                <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={placement} onChange={(e) => setPlacement(e.target.value)}>
                  {GARMENT_PLACEMENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            )}

            <label style={{ fontSize: 13 }}>
              設計大小（{designSizePct}% {modelCategory === "apparel" ? "胸前範圍" : "印刷範圍"}）
              <input type="range" min={40} max={100} step={5} value={designSizePct}
                onChange={(e) => setDesignSizePct(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }} />
            </label>

            <label style={{ fontSize: 13 }}>
              圖案透明度 {designOpacity}%
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>（褪色／復古效果，<b>不是</b>融合；僅對上傳圖有效，圖庫選的不生效）</span>
              <input type="range" min={60} max={100} step={5} value={designOpacity}
                onChange={(e) => setDesignOpacity(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }} />
            </label>

            <CatalogGrid
              catalog={catalog} catalogLoading={catalogLoading}
              selectedIds={selectedModelProductIds}
              onToggle={(id) => toggleCatalogProduct(setSelectedModelProductIds, id)}
              onSelectAll={() => setSelectedModelProductIds(new Set(catalog.map((c) => c.id)))}
              onClearAll={() => setSelectedModelProductIds(new Set())}
            />

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
              {modelDesc && !modelDescManual && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>→ {modelDesc}</div>}
              <input className="btn-secondary" style={{ width: "100%", marginTop: 6 }} value={modelDescManual}
                onChange={(e) => setModelDescManual(e.target.value)}
                placeholder="手動描述（覆蓋上方，例：blonde Asian woman, 20s）" />
            </div>

            <label style={{ fontSize: 13 }}>
              姿勢
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={pose} onChange={(e) => setPose(e.target.value)}>
                {MODEL_POSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {isChestOccludingPose(pose) && <span style={{ color: "var(--yellow)", fontSize: 12 }}>⚠ 此姿勢會遮住胸前設計</span>}
            </label>

            <label style={{ fontSize: 13 }}>
              場景 Scene
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={modelScene} onChange={(e) => setModelScene(e.target.value)}>
                {MODEL_SCENES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <label style={{ fontSize: 13 }}>
              光線 Lighting
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={modelLighting} onChange={(e) => setModelLighting(e.target.value)}>
                {MODEL_LIGHTING.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <label style={{ fontSize: 13 }}>
              框景 Framing
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={modelFraming} onChange={(e) => setModelFraming(e.target.value)}>
                {MODEL_FRAMING.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {modelFraming === "full-body" && !["4:5", "9:16"].includes(aspect) && (
                <span style={{ fontSize: 11, color: "var(--yellow)", display: "block", marginTop: 4, lineHeight: 1.4 }}>
                  ⚠ 全身框景建議搭配 <strong>4:5</strong> 或 <strong>9:16</strong> 比例（畫面更高，頭腳不易裁切）。目前比例：{aspect}
                </span>
              )}
              <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
                全身會露出整個人；模特的頭一律不裁切。
              </span>
            </label>

            <label style={{ fontSize: 13 }}>
              模特情緒 Emotion
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={modelEmotion} onChange={(e) => setModelEmotion(e.target.value)}>
                {MODEL_EMOTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
                有情緒的表情更能提升產品吸引力。
              </span>
            </label>

            {modelCategory !== "apparel" && (
              <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, background: "var(--ai-bg)", color: "var(--ai-text)" }}>
                偵測到非服飾產品（{modelCategory}）→ 模特會以「{modelCategory === "drinkware" ? "手持杯子" : modelCategory === "jewelry" ? "配戴飾品特寫" : modelCategory === "wall-art" ? "手持展示" : modelCategory === "bag" ? "揹／拿著包" : modelCategory === "phone" ? "手持手機" : modelCategory === "pillow" ? "抱著抱枕" : "展示"}」方式入鏡，而非穿在身上。
              </div>
            )}

            <div style={{ fontSize: 13 }}>
              場景道具（可複選）
              <PropChips
                options={MODEL_PROPS}
                selected={modelProps}
                onToggle={(v) => setModelProps((prev) => { const next = new Set(prev); if (next.has(v)) next.delete(v); else next.add(v); return next; })}
              />
            </div>
          </>
        )}

        {/* ═══════════════════ FLAT TAB ════════════════════════ */}
        {mode === "flat" && (
          <>
            <label style={{ fontSize: 13 }}>
              參考圖類型
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={referenceKind} onChange={(e) => setReferenceKind(e.target.value as ReferenceKind)}>
                {REFERENCE_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
                {REFERENCE_KIND_OPTIONS.find((o) => o.value === referenceKind)?.hint}
              </span>
            </label>

            <label style={{ fontSize: 13 }}>
              產品類型
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={categoryOverride} onChange={(e) => setCategoryOverride(e.target.value as "" | ProductCategory)}>
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ fontSize: 11, opacity: 0.5, display: "block", marginTop: 2 }}>
                自己的產品（不在 Printful，如珠寶）在這裡指定類型。
              </span>
            </label>

            {flatCategory !== "apparel" && (
              <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, background: "var(--ai-bg)", color: "var(--ai-text)" }}>
                偵測到非服飾產品（{flatCategory}）→ {flatCategory === "jewelry" ? "以俯拍平擺呈現" : "改用「立拍」：產品站立、斜前角度，而非平躺俯拍。"}
              </div>
            )}
            {flatCategory === "apparel" && (
              <label style={{ fontSize: 13 }}>
                圖案位置 Placement
                <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={placement} onChange={(e) => setPlacement(e.target.value)}>
                  {GARMENT_PLACEMENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            )}
            <label style={{ fontSize: 13 }}>
              設計大小（{designSizePct}% {flatCategory === "apparel" ? "胸前範圍" : "印刷範圍"}）
              <input type="range" min={40} max={100} step={5} value={designSizePct}
                onChange={(e) => setDesignSizePct(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }} />
            </label>

            <label style={{ fontSize: 13 }}>
              圖案透明度 {designOpacity}%
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>（褪色／復古效果，<b>不是</b>融合；僅對上傳圖有效，圖庫選的不生效）</span>
              <input type="range" min={60} max={100} step={5} value={designOpacity}
                onChange={(e) => setDesignOpacity(Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }} />
            </label>

            <CatalogGrid
              catalog={catalog} catalogLoading={catalogLoading}
              selectedIds={selectedFlatProductIds}
              onToggle={(id) => toggleCatalogProduct(setSelectedFlatProductIds, id)}
              onSelectAll={() => setSelectedFlatProductIds(new Set(catalog.map((c) => c.id)))}
              onClearAll={() => setSelectedFlatProductIds(new Set())}
            />

            <label style={{ fontSize: 13 }}>
              桌面/背景 Surface
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={flatSurface} onChange={(e) => setFlatSurface(e.target.value)}>
                {FLAT_SURFACES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            {/* Arrangement only drives the apparel flat-lay composition; for non-apparel the
                composition is fixed per product type (upright / leaning / flat-lay), so hide it. */}
            {flatCategory === "apparel" && (
              <label style={{ fontSize: 13 }}>
                擺放 Arrangement
                <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={flatArrangement} onChange={(e) => setFlatArrangement(e.target.value)}>
                  {FLAT_ARRANGEMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            )}

            <label style={{ fontSize: 13 }}>
              光線 Lighting
              <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={flatLighting} onChange={(e) => setFlatLighting(e.target.value)}>
                {FLAT_LIGHTING.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <div style={{ fontSize: 13 }}>
              場景道具（可複選）
              <PropChips
                options={FLAT_PROPS}
                selected={flatProps}
                onToggle={(v) => setFlatProps((prev) => { const next = new Set(prev); if (next.has(v)) next.delete(v); else next.add(v); return next; })}
              />
            </div>

            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={flatCornerDecor} onChange={(e) => setFlatCornerDecor(e.target.checked)} />
              四角裝飾（道具擺在畫面四個角落，中間留給產品）
            </label>
          </>
        )}

        {/* ── AI model + aspect (model + flat tabs) ── */}
        {mode !== "printful" && (
          <>
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
                <span style={{ color: "var(--yellow)", fontSize: 12 }}>⚠ 此模型不吃參考圖，設計不會印上衣服</span>
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

      {/* ── Preview (left column, large) ─────────────────────── */}
      <div className="build-panel" style={{ gridColumn: 1, gridRow: 1, padding: 14 }}>
        {mode !== "printful" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Prompt</span>
              {promptOverride !== null && (
                <button className="btn-secondary" style={{ fontSize: 11, padding: "1px 8px" }} onClick={() => setPromptOverride(null)}>↺ 還原自動</button>
              )}
            </div>
            <textarea
              value={effectivePrompt}
              onChange={(e) => setPromptOverride(e.target.value)}
              rows={10}
              style={{ width: "100%", fontSize: 12, resize: "vertical", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </div>
        )}

        {mode !== "printful" && (
          <>
            {/* Design image — always shown when selected */}
            {designThumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={designThumb} alt="selected design" style={{ maxWidth: "100%", maxHeight: 600, borderRadius: 8, background: "#111", display: "block", marginBottom: 10 }} />
            )}
            {!designThumb && gen.status === "idle" && <p style={{ opacity: 0.6 }}>選設計圖 → 選產品 → 填控制欄 → 合成。</p>}
            {gen.status === "generating" && <p style={{ opacity: 0.7 }}>合成中…</p>}
            {gen.status === "error" && <p style={{ color: "var(--red)" }}>{gen.error}</p>}
            {gen.status === "done" && gen.image && (
              <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveMockup()}>
                  {saveState === "saved" ? "已存入 My Designs ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
                </button>
                <a className="btn-secondary" href={gen.image} download={`mockup-${mode}-${color}.png`}>下載合成圖</a>
                <button className="btn-secondary" onClick={() => void generate()}>再合成一張</button>
                {mode === "model" && <button className="btn-secondary" onClick={() => void saveModelPreset()}>儲存為模特預設</button>}
                {saveState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>儲存失敗</span>}
              </div>
            )}
          </>
        )}

        {mode === "printful" && (
          <>
            {productResults.size === 0 && <p style={{ opacity: 0.6 }}>選設計圖 → 從左側選擇產品 → 生成 Mockup。</p>}
            {productResults.size > 0 && [...productResults.values()].some((r) => r.status === "done") && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => {
                  const allUrls = [...productResults.values()].flatMap((r) => r.mockups?.map((m) => m.url) ?? []);
                  setSelectedMockups(new Set(allUrls));
                }}>全選所有</button>
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setSelectedMockups(new Set())}>取消選取</button>
                {selectedMockups.size > 0 && (
                  <button className="btn-primary" style={{ fontSize: 11 }} disabled={bulkSaving} onClick={() => void saveBulkMockups()}>
                    {bulkSaving ? "儲存中…" : `存入 My Designs (${selectedMockups.size})`}
                  </button>
                )}
              </div>
            )}
            {[...productResults.values()].map((pr) => (
              <div key={pr.productId} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {pr.productImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pr.productImage} alt={pr.productTitle} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, background: "#222" }} />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{pr.productTitle.replace(/\s*\|.*$/, "")}</span>
                  {pr.status === "generating" && <span style={{ fontSize: 12, opacity: 0.6 }}>合成中…</span>}
                  {pr.status === "done" && pr.mockups && <span style={{ fontSize: 11, opacity: 0.5 }}>{pr.mockups.length} 張</span>}
                  {pr.status === "error" && <span style={{ fontSize: 12, color: "var(--red)" }}>✗ {pr.error}</span>}
                </div>
                {pr.status === "done" && pr.mockups && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {pr.mockups.map((mv) => {
                      const st = saveMockupStates[mv.url] ?? "idle";
                      const checked = selectedMockups.has(mv.url);
                      return (
                        <div key={mv.url} style={{ display: "flex", flexDirection: "column", gap: 3, cursor: "pointer", position: "relative" }} onClick={() => toggleMockup(mv.url)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mv.url} alt={mv.label} style={{ width: "100%", borderRadius: 6, background: "#111", outline: checked ? "2px solid var(--accent)" : "none" }} />
                          <input type="checkbox" checked={checked} onChange={() => toggleMockup(mv.url)}
                            style={{ position: "absolute", top: 4, left: 4, width: 16, height: 16, cursor: "pointer" }}
                            onClick={(e) => e.stopPropagation()} />
                          {st === "saved" && <div style={{ position: "absolute", top: 4, right: 4, background: "var(--green)", color: "var(--btn-primary-text)", fontSize: 10, borderRadius: 3, padding: "1px 4px" }}>✓</div>}
                          <div style={{ fontSize: 10, opacity: 0.65, textAlign: "center" }}>{mv.label}</div>
                          {st === "error" && <span style={{ color: "var(--red)", fontSize: 10, textAlign: "center" }}>儲存失敗</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
