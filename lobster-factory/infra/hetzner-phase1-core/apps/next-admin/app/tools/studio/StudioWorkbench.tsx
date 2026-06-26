"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "../../../lib/studio/model-options";
import { resolveStylePrompt } from "@/app/tools/tarot/cards";
import { STYLE_CATALOG } from "@/app/tools/tarot/tarotStyles";
import {
  SUBJECT_CATEGORIES,
  THEME_CATEGORIES,
  VIBE_CATEGORIES,
  type PresetCategory,
} from "@/lib/studio/prompt-presets";
import {
  CULTURE_REGIONS,
  CULTURE_LENSES,
  type CultureItem,
} from "@/lib/studio/culture-presets";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";
import { openInCanvas } from "@/components/tools/canvas-handoff";
import { buildSemanticFilename, buildSemanticBase, type SemanticFileMeta } from "@/lib/studio/semantic-filename";
import type { MockupView } from "@/lib/studio/printful-mockup";
import {
  EDGE_MASK_STYLES,
  applyEdgeMask,
  buildMaskSvg,
  type EdgeMaskId,
} from "@/lib/studio/edge-mask";

const PRODUCT_TYPES = [
  { value: "tshirt", label: "T-shirt", aspect: "4:5" as AspectRatio, suffix: "t-shirt graphic design, centered composition, plain background" },
  { value: "hoodie", label: "Hoodie", aspect: "4:5" as AspectRatio, suffix: "hoodie front print design, centered composition, plain background" },
  { value: "mug", label: "Mug", aspect: "3:2" as AspectRatio, suffix: "mug wrap-around print design, horizontal composition, plain background" },
  { value: "poster", label: "Poster / Wall Art", aspect: "2:3" as AspectRatio, suffix: "poster art print, full-bleed composition" },
  { value: "sticker", label: "Sticker", aspect: "1:1" as AspectRatio, suffix: "die-cut sticker design, bold outline, plain background" },
  { value: "none", label: "（不限商品）", aspect: "1:1" as AspectRatio, suffix: "" },
];

const ASPECTS: AspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "16:9", "9:16"];

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

const TRANSFORM_MODEL: StudioModel = "flux-kontext-dev";

// Fixed seed so the edge-style preview thumbnails match what `applyEdge` actually composites.
const EDGE_APPLY_SEED = 7;

interface ModelResult {
  model: StudioModel;
  image: string | null;
  seed: number | null;
  error?: string;
  busy: boolean;
}

type RefMode = "none" | "ref" | "transform";

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
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = dataUrl;
  });
}

// ── Studio panel design system (4 primitives — keep ALL same-type elements identical) ──
//   tabStyle(active)      sub-category TABS  — solid-accent fill when active
//   chipStyle(active)     option CHIPS       — light-purple fill when active (distinct from tabs)
//   actionPill(disabled)  primary ACTION     — solid-accent pill (fetch / dice / roll)
//   ghostBtn()            secondary ACTION   — transparent + bordered (clear / cancel / remove)
// Boundary: the result-stage buttons (生成 / 存入 / 去背 / 下載) use the GLOBAL
// btn-primary / btn-secondary CSS classes — a separate, self-consistent primitive.
// Do NOT unify across that boundary; only same-type elements share a helper.
function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent)" : "rgba(127,127,127,0.08)",
    color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400, transition: "all 0.15s",
  };
}
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "rgba(99,102,241,0.15)" : "rgba(127,127,127,0.08)",
    color: active ? "var(--accent)" : "var(--text-muted)",
    fontWeight: active ? 600 : 400, transition: "all 0.15s",
  };
}
// Primary ACTION button — solid-accent pill (radius 20). Every trigger: fetch / dice / roll.
function actionPill(disabled = false): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 600, padding: "4px 14px", borderRadius: 20,
    cursor: disabled ? "default" : "pointer",
    background: "var(--accent)", color: "var(--btn-primary-text)", border: "none",
    opacity: disabled ? 0.5 : 1, flexShrink: 0, transition: "all 0.15s",
  };
}
// Secondary ACTION button — transparent + bordered, muted (radius 20). clear / cancel / remove.
function ghostBtn(): React.CSSProperties {
  return {
    fontSize: 11, padding: "2px 10px", borderRadius: 20, cursor: "pointer",
    background: "transparent", border: "1px solid var(--border)",
    color: "var(--text-muted)", transition: "all 0.15s",
  };
}

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
        <div style={{ marginTop: 4, padding: 10, background: "var(--chip-surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

type TipState = { text: string; x: number; y: number } | null;

// Tarot-style categorized chip picker (圖二 layout): a row of sub-category tabs +
// a chip grid, each chip carrying a hover tooltip (中文描述). The chip's `en` is what
// lands in the field so the assembled prompt stays English; the zh label is display-only.
// Single-select: clicking the active chip clears the field.
function CategoryPicker({
  categories, value, onPick, onTip,
}: {
  categories: PresetCategory[];
  value: string;
  onPick: (v: string) => void;
  onTip: (tip: TipState) => void;
}) {
  const [tab, setTab] = useState(categories[0]?.group ?? "");
  const items = categories.find((c) => c.group === tab)?.items ?? [];
  const current = value.trim();
  return (
    <div>
      {/* Row 1: sub-category tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {categories.map((c) => {
          const active = tab === c.group;
          return (
            <button
              key={c.group}
              type="button"
              onClick={() => { setTab(c.group); onTip(null); }}
              style={tabStyle(active)}
            >
              {c.group}
            </button>
          );
        })}
      </div>
      {/* Row 2: chips for selected sub-category — hover handlers on the SPAN so the
          tooltip survives even if the button is ever disabled (mirrors tarot). */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {items.map((it) => {
          const active = current === it.en;
          return (
            <span
              key={it.zh}
              style={{ display: "inline-block" }}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onTip({ text: it.desc, x: r.left + r.width / 2, y: r.top });
              }}
              onMouseLeave={() => onTip(null)}
            >
              <button
                type="button"
                onClick={() => onPick(active ? "" : it.en)}
                style={chipStyle(active)}
              >
                {active ? "✓ " : ""}{it.zh}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function StudioWorkbench() {
  const [selectedModels, setSelectedModels] = useState<Set<StudioModel>>(new Set<StudioModel>(["flux-schnell"]));
  const [productType, setProductType] = useState("tshirt");
  const [theme, setTheme] = useState("");
  const [vibe, setVibe] = useState("");
  const [subject, setSubject] = useState("");
  const [style, setStyle] = useState("");

  // 🌍 世界文化 — region (single-select) + lens tab + picked culture chips (multi)
  const [region, setRegion] = useState<CultureItem | null>(null);
  const [regionTab, setRegionTab] = useState(CULTURE_REGIONS[0]?.group ?? "");
  const [cultureLens, setCultureLens] = useState(CULTURE_LENSES[0]?.key ?? "");
  const [cultureChips, setCultureChips] = useState<string[]>([]); // en tokens in prompt
  const [cultureDyn, setCultureDyn] = useState<Record<string, CultureItem[]>>({}); // `${regionEn}|${lensKey}` → items
  const [cultureFetching, setCultureFetching] = useState<Record<string, boolean>>({}); // per-key in-flight flag
  const [fusionRegion, setFusionRegion] = useState<CultureItem | null>(null); // 🎲 混搭骰 second culture
  const [showMap, setShowMap] = useState(false); // 🗺️ 靈感地圖 toggle

  // 🔥 時事靈感 — active category tab (圖一 layout: tabs + items below)
  const [trendingTab, setTrendingTab] = useState(TRENDING_CATEGORIES[0]?.value ?? "");

  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [refImages, setRefImages] = useState<string[]>([]);
  const [refMode, setRefMode] = useState<RefMode>("none");

  // Multi-model results: one slot per selected model, updated incrementally
  const [results, setResults] = useState<ModelResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const genIdRef = useRef(0);

  // Per-result post-processing state (keyed by model value)
  const [saveStates, setSaveStates] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [bgStates, setBgStates] = useState<Record<string, "idle" | "removing" | "done" | "error">>({});
  const [originalImages, setOriginalImages] = useState<Record<string, string>>({});
  const [mockupState, setMockupState] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [mockups, setMockups] = useState<MockupView[]>([]);
  const [savedMockups, setSavedMockups] = useState<Record<string, "saving" | "saved" | "error">>({});

  // ✨ Edge-mask (organic edge → transparent PNG) per-result post-processing state
  const [edgeStates, setEdgeStates] = useState<Record<string, "idle" | "applying" | "done" | "error">>({});
  const [edgeOriginals, setEdgeOriginals] = useState<Record<string, string>>({});
  const [edgeApplied, setEdgeApplied] = useState<Record<string, EdgeMaskId | undefined>>({});
  const [edgeAmount, setEdgeAmount] = useState(55);

  // Style / Model group filter state
  const STYLE_GROUPS = Array.from(new Set(STYLE_CATALOG.map((item) => item.group)));
  const MODEL_GROUPS = Array.from(new Set(STUDIO_MODEL_OPTIONS.map((item) => item.group)));
  const [styleGroup, setStyleGroup] = useState(STYLE_GROUPS[0] ?? "");
  const [modelGroup, setModelGroup] = useState(MODEL_GROUPS[0] ?? "");

  // Shared hover-tooltip for all categorized chips (主圖/題材/氛圍/風格). Captured at
  // viewport coords on hover, rendered position:fixed at the component root so it escapes
  // the sticky control panel's overflow clipping (same pattern as TarotStudio).
  const [tip, setTip] = useState<TipState>(null);

  // Trending news state — all categories fetched in parallel, cached per day
  const [allTopics, setAllTopics] = useState<Record<string, string[]>>({});
  const [trendingFetching, setTrendingFetching] = useState(false);

  const bgInFlight = useRef<Record<string, boolean>>({});
  const mockupInFlight = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const edgeInFlight = useRef<Record<string, boolean>>({});
  const edgePending = useRef<Record<string, { styleId: EdgeMaskId; amount: number } | null>>({});

  const product = PRODUCT_TYPES.find((p) => p.value === productType) ?? PRODUCT_TYPES[0];

  // Primary model = first in the set (used for maxRefs, fileMeta, edit panel)
  const primaryModel = useMemo<StudioModel>(() => Array.from(selectedModels)[0] ?? "flux-schnell", [selectedModels]);
  const primaryModelOption = useMemo(() => STUDIO_MODEL_OPTIONS.find((m) => m.value === primaryModel), [primaryModel]);

  // maxRefs = max across all selected models (upload limit; each model gets its own slice at generate time)
  const maxRefs = useMemo(
    () => selectedModels.size === 0 ? 0 : Math.max(...Array.from(selectedModels).map((m) => STUDIO_MODEL_OPTIONS.find((o) => o.value === m)?.maxRefs ?? 0)),
    [selectedModels],
  );

  const resolvedStylePrompt = useMemo(() => (style ? resolveStylePrompt(style) : ""), [style]);

  // Pre-rendered edge-style thumbnails (white shape on transparent) — fixed preview params.
  const edgePreviews = useMemo(
    () =>
      EDGE_MASK_STYLES.map((s) => ({
        id: s.id,
        zh: s.label,
        en: s.labelEn,
        svg: s.maskUrl ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMaskSvg(s.id, 48, 48, { amount: 62, seed: EDGE_APPLY_SEED }))}`,
      })),
    [],
  );

  const fileMeta = useMemo<SemanticFileMeta>(() => {
    const p = PRODUCT_TYPES.find((x) => x.value === productType);
    return {
      product: p && p.value !== "none" ? p.label : undefined,
      subject: subject.trim() || theme.trim() || undefined,
      style: style || undefined,
    };
  }, [productType, subject, theme, style]);

  const assembledPrompt = useMemo(() => {
    // 🌍 culture tokens: region adjective (+ 🎲 fusion culture) + any picked culture chips
    const cultureTokens = [
      region ? `${region.en} cultural heritage` : "",
      fusionRegion ? `fused with ${fusionRegion.en} heritage` : "",
      ...cultureChips,
    ].filter(Boolean);
    if (refMode === "transform" && refImages.length > 0) {
      const parts = [
        "Transform this image.",
        resolvedStylePrompt ? `Apply style: ${resolvedStylePrompt}.` : "",
        cultureTokens.length ? `Cultural influence: ${cultureTokens.join(", ")}.` : "",
        vibe.trim() ? `Mood: ${vibe.trim()}.` : "",
        subject.trim() ? `Keep subject: ${subject.trim()}.` : "",
        product.suffix,
      ].filter(Boolean);
      return parts.join(" ");
    }
    const parts = [subject.trim(), ...cultureTokens, theme.trim(), vibe.trim(), resolvedStylePrompt, product.suffix].filter(Boolean);
    return parts.join(", ");
  }, [subject, theme, vibe, resolvedStylePrompt, product, refMode, refImages.length, region, fusionRegion, cultureChips]);

  const effectivePrompt = promptTouched ? prompt : assembledPrompt;

  const activeResult = results[activeIdx] ?? null;

  const onPickProduct = useCallback((value: string) => {
    setProductType(value);
    const p = PRODUCT_TYPES.find((x) => x.value === value);
    if (p) setAspect(p.aspect);
  }, []);

  const onModelsChange = useCallback((next: Set<StudioModel>) => {
    setSelectedModels(next);
    const anySupportsRefs = Array.from(next).some(
      (m) => (STUDIO_MODEL_OPTIONS.find((o) => o.value === m)?.maxRefs ?? 0) > 0,
    );
    if (!anySupportsRefs) setRefImages([]);
  }, []);

  const onSetRefMode = useCallback((mode: RefMode) => {
    setRefMode(mode);
    if (mode === "transform") {
      const anySupports = Array.from(selectedModels).some(
        (m) => (STUDIO_MODEL_OPTIONS.find((o) => o.value === m)?.maxRefs ?? 0) > 0,
      );
      if (!anySupports) {
        setSelectedModels(new Set<StudioModel>([TRANSFORM_MODEL]));
        setRefImages([]);
      }
    }
  }, [selectedModels]);

  const toggleCultureChip = useCallback((en: string) => {
    setCultureChips((prev) => (prev.includes(en) ? prev.filter((x) => x !== en) : [...prev, en]));
  }, []);

  // Fetch 12 specific authentic items for the current region×lens via the LLM.
  // Cached per (regionEn|lensKey) for the session — re-clicking is a no-op.
  const fetchCulture = useCallback(async (regionEn: string, lensKey: string) => {
    const key = `${regionEn}|${lensKey}`;
    if (cultureDyn[key]) return;
    setCultureFetching((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch("/api/tools/studio/culture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: regionEn, lens: lensKey }),
      });
      const json = (await res.json()) as { ok: boolean; items?: CultureItem[] };
      if (json.ok && json.items?.length) {
        setCultureDyn((prev) => ({ ...prev, [key]: json.items! }));
      }
    } catch { /* keep fallback chips */ }
    setCultureFetching((p) => { const n = { ...p }; delete n[key]; return n; });
  }, [cultureDyn]);

  // 🎲 文化混搭骰 — random 2 cultures × 1 lens, auto-fetch both → forced serendipity.
  // Math.random is fine here (browser/client code; the no-random rule is for workflow scripts).
  const rollDice = useCallback(() => {
    const flat = CULTURE_REGIONS.flatMap((g) => g.items.map((it) => ({ it, group: g.group })));
    if (flat.length < 2) return;
    const ai = Math.floor(Math.random() * flat.length);
    let bi = Math.floor(Math.random() * flat.length);
    if (bi === ai) bi = (bi + 1) % flat.length;
    const a = flat[ai]!, b = flat[bi]!;
    const lens = CULTURE_LENSES[Math.floor(Math.random() * CULTURE_LENSES.length)] ?? CULTURE_LENSES[0]!;
    setRegion(a.it);
    setRegionTab(a.group);
    setFusionRegion(b.it);
    setCultureLens(lens.key);
    setShowMap(true);
    void fetchCulture(a.it.en, lens.key);
    void fetchCulture(b.it.en, lens.key);
  }, [fetchCulture]);

  const fetchAllTrending = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Load whatever is already cached today
    const fromCache: Record<string, string[]> = {};
    const missing: typeof TRENDING_CATEGORIES = [];
    for (const cat of TRENDING_CATEGORIES) {
      try {
        const val = localStorage.getItem(`studio_trending_v1_${cat.value}_${today}`);
        if (val) { fromCache[cat.value] = JSON.parse(val) as string[]; }
        else { missing.push(cat); }
      } catch { missing.push(cat); }
    }
    setAllTopics((prev) => ({ ...prev, ...fromCache }));
    if (missing.length === 0) return;
    setTrendingFetching(true);
    await Promise.allSettled(missing.map(async (cat) => {
      try {
        const res = await fetch("/api/tools/studio/trending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: cat.value }),
        });
        const json = (await res.json()) as { ok: boolean; topics?: string[] };
        if (json.ok && json.topics?.length) {
          try { localStorage.setItem(`studio_trending_v1_${cat.value}_${today}`, JSON.stringify(json.topics)); } catch { /* quota */ }
          setAllTopics((prev) => ({ ...prev, [cat.value]: json.topics! }));
        }
      } catch { /* skip this category */ }
    }));
    setTrendingFetching(false);
  }, []);

  // On mount: restore today's cache without any API call
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const fromCache: Record<string, string[]> = {};
    for (const cat of TRENDING_CATEGORIES) {
      try {
        const val = localStorage.getItem(`studio_trending_v1_${cat.value}_${today}`);
        if (val) fromCache[cat.value] = JSON.parse(val) as string[];
      } catch { /* ignore */ }
    }
    if (Object.keys(fromCache).length > 0) setAllTopics(fromCache);
  }, []);

  const onUploadRefs = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = Math.max(0, maxRefs - refImages.length);
    const picked = Array.from(files).slice(0, room);
    const urls: string[] = [];
    for (const f of picked) {
      try { urls.push(await downscaleImageFile(f)); } catch { /* skip */ }
    }
    setRefImages((prev) => [...prev, ...urls].slice(0, maxRefs));
  }, [maxRefs, refImages.length]);

  // Sequential multi-model generation (avoids API 429, results appear incrementally)
  const generate = useCallback(async () => {
    if (!effectivePrompt || effectivePrompt.trim().length < 3) {
      setResults([{ model: primaryModel, image: null, seed: null, error: "請先填主題/描述（prompt 至少 3 字）", busy: false }]);
      return;
    }
    if (refMode === "transform" && refImages.length === 0) {
      setResults([{ model: primaryModel, image: null, seed: null, error: "改圖模式需要先上傳一張圖", busy: false }]);
      return;
    }

    const modelList = Array.from(selectedModels);

    // Validate ideogram-character requires ref (refMode="none" sends [] regardless of stale refImages)
    if (modelList.includes("ideogram-character") && (refMode === "none" || refImages.length === 0)) {
      setResults([{ model: "ideogram-character", image: null, seed: null, error: "Ideogram Character 需要至少 1 張角色參考圖", busy: false }]);
      return;
    }

    const genId = ++genIdRef.current;
    jobIdRef.current = crypto.randomUUID();
    setBusy(true);
    setActiveIdx(0);
    setMockupState("idle");
    setMockups([]);
    setSavedMockups({});
    setSaveStates({});
    setBgStates({});
    setOriginalImages({});
    setEdgeStates({});
    setEdgeOriginals({});
    setEdgeApplied({});

    // Initialise all slots as busy so UI shows pending cards immediately
    const slots: ModelResult[] = modelList.map((m) => ({ model: m, image: null, seed: null, busy: true }));
    setResults([...slots]);

    for (let i = 0; i < modelList.length; i++) {
      if (genIdRef.current !== genId) break; // user re-clicked generate
      const m = modelList[i];
      const mOption = STUDIO_MODEL_OPTIONS.find((o) => o.value === m);
      const refsForModel = refMode === "none" ? [] : refImages.slice(0, mOption?.maxRefs ?? 0);

      try {
        const res = await fetch("/api/tools/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: m, prompt: effectivePrompt, referenceImages: refsForModel, aspectRatio: aspect, _jobId: jobIdRef.current }),
        });
        const json = (await res.json()) as { ok: boolean; image?: string; seed?: number | null; error?: string };
        slots[i] = json.ok && json.image
          ? { model: m, image: json.image, seed: json.seed ?? null, busy: false }
          : { model: m, image: null, seed: null, error: json.error ?? `HTTP ${res.status}`, busy: false };
      } catch (err) {
        slots[i] = { model: m, image: null, seed: null, error: err instanceof Error ? err.message : String(err), busy: false };
      }

      if (genIdRef.current === genId) setResults([...slots]);
    }

    if (genIdRef.current === genId) setBusy(false);
  }, [selectedModels, effectivePrompt, refImages, aspect, refMode, primaryModel]);

  const removeBg = useCallback(async (model: StudioModel, image: string) => {
    if (bgInFlight.current[model]) return;
    bgInFlight.current[model] = true;
    setBgStates((prev) => ({ ...prev, [model]: "removing" }));
    try {
      const res = await fetch("/api/tools/studio/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, _jobId: jobIdRef.current }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) { setBgStates((prev) => ({ ...prev, [model]: "error" })); return; }
      setOriginalImages((prev) => ({ ...prev, [model]: image }));
      setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: json.image! } : r));
      setBgStates((prev) => ({ ...prev, [model]: "done" }));
      setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
      setEdgeStates((prev) => ({ ...prev, [model]: "idle" }));
      setEdgeOriginals((prev) => { const n = { ...prev }; delete n[model]; return n; });
      setEdgeApplied((prev) => { const n = { ...prev }; delete n[model]; return n; });
    } catch { setBgStates((prev) => ({ ...prev, [model]: "error" })); }
    finally { bgInFlight.current[model] = false; }
  }, []);

  const restoreOriginal = useCallback((model: StudioModel) => {
    const orig = originalImages[model];
    if (!orig) return;
    setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: orig } : r));
    setOriginalImages((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setBgStates((prev) => ({ ...prev, [model]: "idle" }));
    setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
    setEdgeStates((prev) => ({ ...prev, [model]: "idle" }));
    setEdgeOriginals((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setEdgeApplied((prev) => { const n = { ...prev }; delete n[model]; return n; });
  }, [originalImages]);

  // ✨ Apply an organic edge mask to the active design (client-side canvas compositing).
  // Always masks from the pre-edge base, so switching styles replaces rather than stacks.
  // While one composite is in flight the latest request is QUEUED (not dropped) and drained
  // when it finishes — so a fast slider drag can't leave the image on a stale amount.
  const applyEdge = useCallback(async (model: StudioModel, styleId: EdgeMaskId) => {
    if (edgeInFlight.current[model]) {
      edgePending.current[model] = { styleId, amount: edgeAmount };
      return;
    }
    const cur = results.find((r) => r.model === model);
    const base = edgeOriginals[model] ?? cur?.image;
    if (!base) return;
    edgeInFlight.current[model] = true;
    setEdgeStates((prev) => ({ ...prev, [model]: "applying" }));
    let nextStyle: EdgeMaskId | null = styleId;
    let nextAmount = edgeAmount;
    try {
      while (nextStyle) {
        const appliedStyle: EdgeMaskId = nextStyle;
        const res = await applyEdgeMask(base, appliedStyle, { amount: nextAmount, seed: EDGE_APPLY_SEED });
        if (!res.ok) { setEdgeStates((prev) => ({ ...prev, [model]: "error" })); break; }
        setEdgeOriginals((prev) => (prev[model] ? prev : { ...prev, [model]: base }));
        setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: res.image } : r));
        setEdgeApplied((prev) => ({ ...prev, [model]: appliedStyle }));
        setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
        const pending = edgePending.current[model];
        edgePending.current[model] = null;
        if (!pending) { setEdgeStates((prev) => ({ ...prev, [model]: "done" })); break; }
        nextStyle = pending.styleId;
        nextAmount = pending.amount;
      }
    } catch { setEdgeStates((prev) => ({ ...prev, [model]: "error" })); }
    finally { edgeInFlight.current[model] = false; edgePending.current[model] = null; }
  }, [results, edgeOriginals, edgeAmount]);

  const restoreEdge = useCallback((model: StudioModel) => {
    const base = edgeOriginals[model];
    if (!base) return;
    setResults((prev) => prev.map((r) => r.model === model ? { ...r, image: base } : r));
    setEdgeOriginals((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setEdgeApplied((prev) => { const n = { ...prev }; delete n[model]; return n; });
    setEdgeStates((prev) => ({ ...prev, [model]: "idle" }));
    setSaveStates((prev) => ({ ...prev, [model]: "idle" }));
  }, [edgeOriginals]);

  const saveToDesigns = useCallback(async (model: StudioModel, image: string) => {
    setSaveStates((prev) => ({ ...prev, [model]: "saving" }));
    try {
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
          styleTags: style ? [style] : [],
          subject: subject.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSaveStates((prev) => ({ ...prev, [model]: json.ok ? "saved" : "error" }));
    } catch { setSaveStates((prev) => ({ ...prev, [model]: "error" })); }
  }, [effectivePrompt, productType, theme, style, subject]);

  const generateMockupFromDesign = useCallback(async (image: string) => {
    if (mockupInFlight.current) return;
    mockupInFlight.current = true;
    setMockupState("generating");
    try {
      // Pass the design's natural dimensions so Printful preserves the aspect ratio (else the
      // mockup falls back to a hardcoded square → tall art squished + shrunk — 2026-06-20).
      const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const im = new window.Image();
        im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
        im.onerror = () => resolve(null);
        im.src = image;
      });
      const res = await fetch("/api/tools/studio/mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, productType, _jobId: jobIdRef.current, ...(dims ? { imageWidth: dims.width, imageHeight: dims.height } : {}) }),
      });
      const json = (await res.json()) as { ok: boolean; mockups?: MockupView[]; error?: string };
      if (!json.ok || !json.mockups?.length) { setMockupState("error"); return; }
      setMockups(json.mockups);
      setMockupState("done");
    } catch { setMockupState("error"); }
    finally { mockupInFlight.current = false; }
  }, [productType]);

  const saveMockupToDesigns = useCallback(async (m: MockupView) => {
    if (savedMockups[m.url] === "saving" || savedMockups[m.url] === "saved") return;
    setSavedMockups((prev) => ({ ...prev, [m.url]: "saving" }));
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: m.url, prompt: effectivePrompt, modelName: primaryModel, source: "printful-mockup", productType: productType !== "none" ? productType : undefined, subject: m.label, styleTags: [m.group] }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSavedMockups((prev) => ({ ...prev, [m.url]: json.ok ? "saved" : "error" }));
    } catch { setSavedMockups((prev) => ({ ...prev, [m.url]: "error" })); }
  }, [savedMockups, effectivePrompt, primaryModel, productType]);

  const downloadImageWebP = useCallback((image: string, model: StudioModel) => {
    const el = document.createElement("img");
    el.onerror = () => { console.warn("WebP下載：圖片解碼失敗"); };
    el.onload = () => {
      const MAX = 4096;
      const scale = Math.min(1, MAX / Math.max(el.naturalWidth, el.naturalHeight, 1));
      const c = document.createElement("canvas");
      c.width = Math.round(el.naturalWidth * scale);
      c.height = Math.round(el.naturalHeight * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(el, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/webp", 0.9);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildSemanticFilename({ ...fileMeta, track: model }, "webp", `design.webp`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    el.src = image;
  }, [fileMeta]);

  const downloadImage = useCallback((image: string, model: StudioModel) => {
    const ext = image.startsWith("data:image/jpeg") ? "jpg" : image.startsWith("data:image/webp") ? "webp" : "png";
    const a = document.createElement("a");
    a.href = image;
    a.download = buildSemanticFilename({ ...fileMeta, track: model }, ext, `design.${ext}`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [fileMeta]);

  const isTransformMode = refMode === "transform";
  const isMultiModel = selectedModels.size > 1;
  const anyResults = results.some((r) => !r.busy && r.image);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, padding: 16, alignItems: "start" }}>
      {/* ── Controls (RIGHT column, sticky — moved from left per spec) ───────── */}
      <div className="build-panel" style={{ gridColumn: 2, gridRow: 1, position: "sticky", top: 16, alignSelf: "start", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>

        <label style={{ fontSize: 13 }}>
          商品類型
          <select className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={productType} onChange={(e) => onPickProduct(e.target.value)}>
            {PRODUCT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {/* 🌍 世界文化 — region × lens, with AI-filled specific items (混搭靈感工具). Moved to FIRST per spec. */}
        <AccordionSection title="🌍 世界文化" summary={region ? (fusionRegion ? `${region.zh}×${fusionRegion.zh}` : region.zh) : (cultureChips.length ? `${cultureChips.length} 元素` : "未選")} defaultOpen>
          <p style={{ fontSize: 11, opacity: 0.55, margin: "0 0 8px" }}>
            1️⃣ 選地域 → 2️⃣ 選鏡頭 → ✨ AI 噴出該文化專屬靈感（可多選，填入 prompt）
          </p>

          {/* 🎲 混搭骰 + 🗺️ 地圖切換 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={rollDice} title="隨機 2 國 × 1 鏡頭混搭，逼出意外靈感"
              style={actionPill()}>
              🎲 文化混搭骰
            </button>
            <button type="button" onClick={() => setShowMap((v) => !v)}
              style={tabStyle(showMap)}>
              🗺️ 靈感地圖 {showMap ? "▲" : "▼"}
            </button>
          </div>
          {fusionRegion && region && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "5px 10px", borderRadius: 8, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.4)", fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>🎲 {region.zh} × {fusionRegion.zh}</span>
              <span style={{ opacity: 0.6 }}>· {CULTURE_LENSES.find((l) => l.key === cultureLens)?.zh ?? ""} 混搭中</span>
              <button type="button" onClick={() => setFusionRegion(null)} title="取消混搭"
                style={{ ...ghostBtn(), marginLeft: "auto" }}>✕</button>
            </div>
          )}

          {/* 地域：洲 tabs + 國家 chips（單選） */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {CULTURE_REGIONS.map((g) => (
              <button key={g.group} type="button" onClick={() => setRegionTab(g.group)} style={tabStyle(regionTab === g.group)}>
                {g.group}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            {(CULTURE_REGIONS.find((g) => g.group === regionTab)?.items ?? []).map((it) => {
              const active = region?.en === it.en;
              return (
                <span key={it.en} style={{ display: "inline-block" }}
                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: it.desc, x: r.left + r.width / 2, y: r.top }); }}
                  onMouseLeave={() => setTip(null)}>
                  <button type="button" onClick={() => { setRegion(active ? null : it); setFusionRegion(null); }} style={chipStyle(active)}>
                    {active ? "✓ " : ""}{it.zh}
                  </button>
                </span>
              );
            })}
          </div>

          {/* 鏡頭 lens tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {CULTURE_LENSES.map((l) => (
              <button key={l.key} type="button" onClick={() => setCultureLens(l.key)} style={tabStyle(cultureLens === l.key)}>
                {l.emoji} {l.zh}
              </button>
            ))}
          </div>

          {/* AI 動態填充 + chips（動態具體項在前，靜態 fallback 在後，多選） */}
          {(() => {
            const lens = CULTURE_LENSES.find((l) => l.key === cultureLens) ?? CULTURE_LENSES[0];
            const dynKey = region ? `${region.en}|${cultureLens}` : "";
            const dyn = dynKey ? cultureDyn[dynKey] : undefined;
            const fetching = dynKey ? !!cultureFetching[dynKey] : false;
            const seen = new Set<string>();
            const chips: CultureItem[] = [];
            for (const it of [...(dyn ?? []), ...lens.fallback]) {
              if (seen.has(it.en)) continue;
              seen.add(it.en); chips.push(it);
            }
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <button type="button" disabled={!region || fetching}
                    onClick={() => { if (region) void fetchCulture(region.en, cultureLens); }}
                    style={actionPill(!region || fetching)}>
                    {fetching ? "AI 思考中…" : `✨ AI 靈感（${region ? region.zh : "先選地域"}・${lens.zh}）`}
                  </button>
                  {dyn && <span style={{ fontSize: 10, opacity: 0.45 }}>AI 已填 {dyn.length} 項</span>}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {chips.map((it) => {
                    const active = cultureChips.includes(it.en);
                    return (
                      <span key={it.en} style={{ display: "inline-block" }}
                        onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: it.desc, x: r.left + r.width / 2, y: r.top }); }}
                        onMouseLeave={() => setTip(null)}>
                        <button type="button" onClick={() => toggleCultureChip(it.en)} style={chipStyle(active)}>
                          {active ? "✓ " : ""}{it.zh}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* 🗺️ 靈感地圖 — AI 項目以圖釘散佈在地域板上，點釘填入 prompt（golden-angle 散佈，無依賴） */}
          {showMap && region && (() => {
            const lens = CULTURE_LENSES.find((l) => l.key === cultureLens) ?? CULTURE_LENSES[0]!;
            const dyn = cultureDyn[`${region.en}|${cultureLens}`];
            const seen = new Set<string>();
            const items: CultureItem[] = [];
            for (const it of [...(dyn ?? []), ...lens.fallback]) {
              if (seen.has(it.en)) continue;
              seen.add(it.en); items.push(it);
            }
            const shown = items.slice(0, 12);
            const n = Math.max(shown.length, 1);
            const GOLDEN = 2.399963229728653; // ~137.5° in radians — even, non-overlapping scatter
            return (
              <div style={{ marginTop: 10, position: "relative", height: 220, borderRadius: 12, border: "1px solid var(--border)", background: "radial-gradient(circle at 32% 30%, rgba(99,102,241,0.12), rgba(127,127,127,0.04) 70%)", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 8, left: 10, fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.5 }}>
                  🗺️ {region.zh}{fusionRegion ? ` × ${fusionRegion.zh}` : ""} · {lens.emoji}{lens.zh}
                </div>
                {shown.map((it, i) => {
                  const ang = i * GOLDEN;
                  const rad = Math.sqrt((i + 0.5) / n);
                  const cx = 50 + Math.cos(ang) * rad * 32;
                  const cy = 56 + Math.sin(ang) * rad * 24;
                  const active = cultureChips.includes(it.en);
                  return (
                    <button key={it.en} type="button" onClick={() => toggleCultureChip(it.en)} title={it.desc}
                      style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)", fontSize: 11, padding: "2px 8px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "rgba(99,102,241,0.92)" : "var(--chip-surface)", color: active ? "#fff" : "var(--text-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.18)", transition: "all 0.15s" }}>
                      📍{it.zh}
                    </button>
                  );
                })}
                <div style={{ position: "absolute", bottom: 6, right: 10, fontSize: 10, opacity: 0.4 }}>點圖釘填入 prompt</div>
              </div>
            );
          })()}

          {/* 已選文化元素 summary + 清除 */}
          {cultureChips.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>已選文化元素 ({cultureChips.length})</span>
                <button type="button" onClick={() => setCultureChips([])}
                  style={ghostBtn()}>清除</button>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {cultureChips.map((en) => (
                  <button key={en} type="button" onClick={() => toggleCultureChip(en)} title="點擊移除"
                    style={chipStyle(true)}>
                    {en} ✕
                  </button>
                ))}
              </div>
            </div>
          )}
        </AccordionSection>

        <AccordionSection title="🎯 主圖 Subject" summary={subject || "未填"}>
          <input className="btn-secondary" style={{ width: "100%", marginBottom: 8, opacity: isTransformMode ? 0.5 : 1 }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={isTransformMode ? "改圖模式：主圖由上傳圖決定（可選）" : "例：lotus flower mandala"} />
          <CategoryPicker categories={SUBJECT_CATEGORIES} value={subject} onPick={setSubject} onTip={setTip} />
        </AccordionSection>

        <AccordionSection title="📚 題材 Theme" summary={theme || "未填"}>
          <input className="btn-secondary" style={{ width: "100%", marginBottom: 8, opacity: isTransformMode ? 0.4 : 1 }} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder={isTransformMode ? "改圖模式下不影響 prompt" : "例：spiritual healing"} />
          <CategoryPicker categories={THEME_CATEGORIES} value={theme} onPick={setTheme} onTip={setTip} />
        </AccordionSection>

        <AccordionSection title="✨ 氛圍 Vibe" summary={vibe || "未填"}>
          <input className="btn-secondary" style={{ width: "100%", marginBottom: 8 }} value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="例：calm, ethereal" />
          <CategoryPicker categories={VIBE_CATEGORIES} value={vibe} onPick={setVibe} onTip={setTip} />
        </AccordionSection>

        <AccordionSection title="🔥 時事靈感">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>點擊話題填入主圖欄（再點一次取消）</p>
            <button type="button" disabled={trendingFetching} onClick={() => void fetchAllTrending()}
              style={actionPill(trendingFetching)}>
              {trendingFetching ? "搜尋中…" : "抓取今日熱搜"}
            </button>
          </div>
          {/* Row 1: category tabs (圖一 layout) */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TRENDING_CATEGORIES.map((cat) => (
              <button key={cat.value} type="button" onClick={() => setTrendingTab(cat.value)} style={tabStyle(trendingTab === cat.value)}>
                {cat.label}
              </button>
            ))}
          </div>
          {/* Row 2: topics of the active category — active chip shows 淺紫 bg + ✓ (selected = current subject) */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(() => {
              const topics = allTopics[trendingTab];
              if (!topics) {
                return <span style={{ fontSize: 11, opacity: 0.45 }}>{trendingFetching ? "搜尋中…" : "點「抓取今日熱搜」載入話題"}</span>;
              }
              return topics.map((t, i) => {
                const active = subject === t;
                return (
                  <button key={`${trendingTab}-${i}`} type="button" onClick={() => setSubject(active ? "" : t)} style={chipStyle(active)}>
                    {active ? "✓ " : ""}{t}
                  </button>
                );
              });
            })()}
          </div>
        </AccordionSection>

        {/* 🤖 圖片模型 — placed BEFORE 風格 (per spec). Tarot-style: provider tabs + vertical rows. */}
        <AccordionSection
          title="🤖 圖片模型"
          summary={selectedModels.size > 1 ? `已選 ${selectedModels.size} 個` : (STUDIO_MODEL_OPTIONS.find((o) => selectedModels.has(o.value))?.label ?? "")}
        >
          {/* Row 1: provider tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {MODEL_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => setModelGroup(g)}
                style={tabStyle(modelGroup === g)}>
                {g}
              </button>
            ))}
          </div>
          {/* Row 2: model rows (label left, cost/ref right) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {STUDIO_MODEL_OPTIONS.filter((item) => item.group === modelGroup).map((item) => {
              const active = selectedModels.has(item.value);
              return (
                <button key={item.value} type="button"
                  onClick={() => {
                    onModelsChange((() => {
                      const next = new Set(selectedModels);
                      if (next.has(item.value)) { if (next.size > 1) next.delete(item.value); }
                      else { next.add(item.value); }
                      return next;
                    })());
                  }}
                  title={item.maxRefs > 0 ? `最多 ${item.maxRefs} 張參考圖` : "純文字生圖"}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "rgba(99,102,241,0.12)" : "rgba(127,127,127,0.04)", color: active ? "var(--accent)" : "var(--text-primary)", fontWeight: active ? 600 : 400, transition: "all 0.15s" }}>
                  <span>{active && selectedModels.size === 1 ? "✓ " : active ? "☑ " : ""}{item.label}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    NT${item.costNt}{item.maxRefs > 0 ? ` · ${item.maxRefs}ref` : " · text"}
                  </span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
            {selectedModels.size > 1
              ? `已選 ${selectedModels.size} 個模型 → 依序生成 ${selectedModels.size} 張比較圖`
              : (() => { const m = STUDIO_MODEL_OPTIONS.find((o) => selectedModels.has(o.value)); return m?.maxRefs ? `此模型最多吃 ${m.maxRefs} 張參考圖` : "此模型不吃參考圖（純文字生圖）"; })()}
          </p>
        </AccordionSection>

        {/* 🎨 風格 Style — tarot-style: group tabs + chips with hover tooltip (圖二). The
            chip stores the FULL item.zh (needed by resolveStylePrompt); only the display
            is split on "｜" — label before, tooltip description after. */}
        <AccordionSection title="🎨 風格 Style" summary={style ? style.split("｜")[0] : "不指定"}>
          {/* Row 1: group tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {STYLE_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => { setStyleGroup(g); setTip(null); }}
                style={tabStyle(styleGroup === g)}>
                {g}
              </button>
            ))}
          </div>
          {/* Row 2: style chips for selected group, with hover tooltip */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {STYLE_CATALOG.filter((item) => item.group === styleGroup).map((item) => {
              const active = style === item.zh;
              const [label, desc] = item.zh.split("｜");
              return (
                <span
                  key={item.zh}
                  style={{ display: "inline-block" }}
                  onMouseEnter={(e) => {
                    if (!desc) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setTip({ text: desc, x: r.left + r.width / 2, y: r.top });
                  }}
                  onMouseLeave={() => setTip(null)}
                >
                  <button type="button" onClick={() => setStyle(active ? "" : item.zh)}
                    style={chipStyle(active)}>
                    {active ? "✓ " : ""}{label}
                  </button>
                </span>
              );
            })}
          </div>
        </AccordionSection>

        <AccordionSection title="📐 比例" summary={aspect}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ASPECTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspect(a)}
                style={chipStyle(aspect === a)}
              >
                {a}
              </button>
            ))}
          </div>
        </AccordionSection>

        {/* 參考圖 + 模式切換 — original bordered box style */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>🖼️ 參考圖</p>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 8 }}>
            <button type="button" onClick={() => onSetRefMode("none")} style={{ flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none", background: refMode === "none" ? "var(--accent)" : "transparent", color: refMode === "none" ? "var(--btn-primary-text)" : "var(--text-muted)", transition: "all 0.15s" }}>
              無
            </button>
            <button type="button" onClick={() => onSetRefMode("ref")} style={{ flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none", background: refMode === "ref" ? "var(--accent)" : "transparent", color: refMode === "ref" ? "var(--btn-primary-text)" : "var(--text-muted)", transition: "all 0.15s" }}>
              🖼️ 風格參考
            </button>
            <button type="button" onClick={() => onSetRefMode("transform")} style={{ flex: 1, padding: "6px 4px", fontSize: 11, cursor: "pointer", border: "none", background: refMode === "transform" ? "var(--accent)" : "transparent", color: refMode === "transform" ? "var(--btn-primary-text)" : "var(--text-muted)", transition: "all 0.15s" }}>
              🎨 改圖模式
            </button>
          </div>
          {refMode === "none" ? (
            <p style={{ fontSize: 10, opacity: 0.45, lineHeight: 1.5 }}>不使用參考圖，純文字生圖。</p>
          ) : (
            <>
              <p style={{ fontSize: 10, opacity: 0.5, marginBottom: 8, lineHeight: 1.5 }}>
                {refMode === "ref" ? "上傳圖作為視覺參考，AI 依 Subject/Style 生成新圖" : "直接把你的圖套用選定風格（建議 flux-kontext）"}
              </p>
              {maxRefs > 0 ? (
                <label style={{ fontSize: 12 }}>
                  {refMode === "transform" ? "上傳要改的圖" : `參考圖（${refImages.length}/${maxRefs}）`}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ width: "100%", marginTop: 4 }} onChange={(e) => void onUploadRefs(e.target.files)} />
                  {refImages.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      {refImages.map((r, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={r} alt={`ref-${i}`} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} title="點擊移除" onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))} />
                      ))}
                    </div>
                  )}
                </label>
              ) : (
                <p style={{ fontSize: 11, opacity: 0.45 }}>目前所選模型均不支援參考圖。{refMode === "transform" && " 改圖模式將自動切換至 flux-kontext-dev。"}</p>
              )}
            </>
          )}
        </div>

        <button className="btn-primary" disabled={busy} onClick={() => void generate()}>
          {busy ? `生成中… (${results.filter((r) => !r.busy).length}/${results.length})` : isMultiModel ? `生成比較（${selectedModels.size} 個模型）` : "生成"}
        </button>
      </div>

      {/* ── Preview (LEFT column) ──────────────────────────────── */}
      <div className="build-panel" style={{ gridColumn: 1, gridRow: 1, padding: 14 }}>
        <label style={{ fontSize: 13 }}>
          Prompt（自動組裝，可直接改）
          <textarea className="btn-secondary" style={{ width: "100%", marginTop: 4, minHeight: 72, fontFamily: "inherit" }} value={effectivePrompt}
            onChange={(e) => { const v = e.target.value; setPrompt(v); setPromptTouched(v.trim().length > 0); }} />
        </label>
        {promptTouched ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setPromptTouched(false); setPrompt(""); }}>回到自動組裝</button>
            <span style={{ fontSize: 12, opacity: 0.6 }}>手動編輯中 — 左側欄位暫不影響 prompt</span>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          {results.length === 0 && <p style={{ opacity: 0.6 }}>填好左側欄位後按「生成」。</p>}

          {/* Multi-model card strip */}
          {isMultiModel && results.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {results.map((r, i) => {
                const opt = STUDIO_MODEL_OPTIONS.find((o) => o.value === r.model);
                const isActive = i === activeIdx;
                return (
                  <div
                    key={r.model}
                    onClick={() => !r.busy && setActiveIdx(i)}
                    style={{
                      width: 140, cursor: r.busy ? "default" : "pointer",
                      border: `2px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 8, overflow: "hidden", transition: "border-color 0.15s",
                      opacity: r.busy ? 0.6 : 1,
                    }}
                  >
                    {r.busy ? (
                      <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-tertiary)", fontSize: 11, opacity: 0.5 }}>生成中…</div>
                    ) : r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt={r.model} style={{ width: "100%", height: 140, objectFit: "cover", display: "block", background: "#fff" }} />
                    ) : (
                      <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-tertiary)", fontSize: 10, color: "var(--red)", padding: 4, textAlign: "center" }}>{r.error ?? "失敗"}</div>
                    )}
                    <div style={{ padding: "4px 6px", fontSize: 10, background: "var(--bg-secondary)" }}>
                      <span style={{ opacity: 0.8 }}>{opt?.label ?? r.model}</span>
                      <span style={{ opacity: 0.5, marginLeft: 4 }}>NT${opt?.costNt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active result detail */}
          {activeResult && !activeResult.busy && activeResult.image ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 16, alignItems: "flex-start" }}>
              {/* Left: canvas */}
              <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeResult.image} alt="generated design" style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: isMultiModel ? 420 : 560, margin: "0 auto", objectFit: "contain", borderRadius: 8, background: "#fff" }} />
              </div>

              {/* Right: operations panel */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Action bar */}
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                {(() => {
                  const m = activeResult.model;
                  const img = activeResult.image!;
                  const saveState = saveStates[m] ?? "idle";
                  const bgState = bgStates[m] ?? "idle";
                  const origImg = originalImages[m];
                  return (
                    <>
                      <button className="btn-primary" disabled={saveState === "saving" || saveState === "saved"} onClick={() => void saveToDesigns(m, img)}>
                        {saveState === "saved" ? "已存入 My Designs ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
                      </button>
                      <button className="btn-secondary" disabled={bgState === "removing" || bgState === "done"} onClick={() => void removeBg(m, img)}>
                        {bgState === "done" ? "已去背 ✓" : bgState === "removing" ? "去背中…" : "去背（透明 PNG）"}
                      </button>
                      {bgState === "done" && origImg && (
                        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => restoreOriginal(m)}>還原原圖</button>
                      )}
                      {bgState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>去背失敗</span>}
                      {bgState === "done" && productType === "tshirt" && (
                        <button className="btn-secondary" disabled={mockupState === "generating" || mockupState === "done"} onClick={() => void generateMockupFromDesign(img)}>
                          {mockupState === "done" ? "產品預覽 ✓" : mockupState === "generating" ? "生成 Mockup…" : "產品 Mockup"}
                        </button>
                      )}
                      {mockupState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>Mockup 失敗</span>}
                      <button className="btn-secondary" onClick={() => downloadImage(img, m)}>PNG下載</button>
                      <button className="btn-secondary" onClick={() => downloadImageWebP(img, m)}>WebP下載</button>
                      {activeResult.seed != null && <span style={{ fontSize: 12, opacity: 0.6 }}>seed {activeResult.seed}</span>}
                      {saveState === "saved" && <a href="/tools/designs" style={{ fontSize: 12 }}>查看 My Designs →</a>}
                      {saveState === "error" && <span style={{ color: "var(--red)", fontSize: 12 }}>儲存失敗</span>}
                    </>
                  );
                })()}
              </div>

              {/* ✨ 邊緣風格 — 套上有機邊 → 透明 PNG（後續存圖 / 建商品 / 印刷都用這版） */}
              {(() => {
                const m = activeResult.model;
                const est = edgeStates[m] ?? "idle";
                const applied = edgeApplied[m];
                // Asset (real brush) masks are fixed images — the strength slider has no effect on them.
                return (
                  <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>✨ 邊緣風格</span>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>有機邊 → 透明 PNG（深色衣服也印得出來）</span>
                      {est === "applying" && <span style={{ fontSize: 11, opacity: 0.6 }}>套用中…</span>}
                      {est === "error" && <span style={{ fontSize: 11, color: "var(--red)" }}>套用失敗</span>}
                      {applied && (
                        <button className="btn-secondary" style={{ fontSize: 11, marginLeft: "auto" }} onClick={() => restoreEdge(m)}>
                          還原原圖
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {edgePreviews.map((pv) => {
                        const active = applied === pv.id;
                        return (
                          <button
                            key={pv.id}
                            type="button"
                            title={pv.en}
                            disabled={est === "applying"}
                            onClick={() => void applyEdge(m, pv.id)}
                            style={{
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                              width: 60, padding: 4, borderRadius: 8, cursor: "pointer",
                              background: active ? "rgba(99,102,241,0.15)" : "rgba(127,127,127,0.06)",
                              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                              transition: "all 0.15s",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pv.svg} alt={pv.zh} style={{ width: 40, height: 40, background: "#3a3a3a", borderRadius: 4 }} />
                            <span style={{ fontSize: 10, opacity: 0.8, lineHeight: 1.1, textAlign: "center" }}>{pv.zh}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>邊緣強度</span>
                      <input
                        type="range" min={10} max={90} step={1} value={edgeAmount}
                        onChange={(e) => setEdgeAmount(Number(e.target.value))}
                        onPointerUp={() => { if (applied) void applyEdge(m, applied); }}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, opacity: 0.6, width: 30, textAlign: "right" }}>{edgeAmount}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Mockups */}
              {mockups.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, marginBottom: 6, opacity: 0.7 }}>產品預覽（Printful · 設計 100% 忠實）</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {mockups.map((m) => {
                      const st = savedMockups[m.url];
                      return (
                        <div key={m.url} style={{ width: 180 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt={m.label} style={{ width: 180, height: 180, objectFit: "contain", background: "#111", borderRadius: 8, border: "1px solid var(--border)" }} />
                          <div style={{ fontSize: 11, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                            {m.lifestyle ? <span>🧍</span> : <span>👕</span>}
                            <span style={{ opacity: 0.8 }}>{m.label}</span>
                          </div>
                          <button className="btn-secondary" style={{ fontSize: 11, marginTop: 3, width: "100%" }} disabled={st === "saving" || st === "saved"} onClick={() => void saveMockupToDesigns(m)}>
                            {st === "saved" ? "已存 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "重試" : "存到我的設計"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI edit panel + quick edit */}
              <div style={{ marginTop: 14 }}>
                <button
                  className="btn-secondary"
                  style={{ width: "100%", marginBottom: 6 }}
                  onClick={() => openInCanvas(activeResult.image, buildSemanticBase({ ...fileMeta, track: "編輯" }))}
                >
                  ✏️ 快速編輯
                </button>
                <AccordionSection title="✏️ AI image prompt（修圖）" defaultOpen={false}>
                  <ImageEditPromptPanel
                    sourceImage={activeResult.image}
                    currentPrompt={effectivePrompt}
                    imageModel={activeResult.model}
                    target="pod-design"
                    aspectRatio={aspect}
                    title=""
                    styleAnchor={{ model: activeResult.model, mode: refImages.length > 0 ? "image" : "text", stylePrompt: resolvedStylePrompt || effectivePrompt, subject: subject.trim(), refs: refImages.length, target: "pod-design" }}
                    onEditedImage={(image, meta) => {
                      setResults((prev) => prev.map((r, i) => i === activeIdx ? { ...r, image, seed: meta.seed } : r));
                      setSaveStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setBgStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setOriginalImages((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setEdgeStates((prev) => ({ ...prev, [activeResult.model]: "idle" }));
                      setEdgeOriginals((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setEdgeApplied((prev) => { const n = { ...prev }; delete n[activeResult.model]; return n; });
                      setMockupState("idle"); setMockups([]); setSavedMockups({});
                    }}
                  />
                </AccordionSection>
              </div>
              </div>
            </div>
          ) : activeResult && !activeResult.busy && activeResult.error ? (
            <p style={{ color: "var(--red)" }}>{activeResult.error}</p>
          ) : activeResult?.busy ? (
            <p style={{ opacity: 0.7 }}>生成中（依模型 5–60 秒）…</p>
          ) : null}

          {/* Single-model error (no results yet) */}
          {!isMultiModel && results.length === 1 && results[0].error && !results[0].busy && !anyResults && (
            <p style={{ color: "var(--red)" }}>{results[0].error}</p>
          )}
        </div>
      </div>

      {/* Chip hover tooltip — position:FIXED at the viewport coords captured on hover,
          rendered at the grid root so it escapes the sticky control panel's overflow
          clipping. Hard-coded colors keep it readable in any theme; x is clamped so
          edge chips don't push it off-screen (same pattern as TarotStudio). */}
      {tip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(tip.x, 8), (typeof window !== "undefined" ? window.innerWidth : 1920) - 8),
            top: tip.y - 6,
            transform: "translate(-50%, -100%)",
            background: "#0d1526",
            color: "#ffffff",
            border: "1px solid #6366f1",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
            textAlign: "center",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            pointerEvents: "none",
            zIndex: 2147483647,
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
