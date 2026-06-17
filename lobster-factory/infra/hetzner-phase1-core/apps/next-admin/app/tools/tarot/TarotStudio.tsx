"use client";

import { useEffect, useRef, useState } from "react";
import { roleHeader } from "../../../lib/ops-role";
import ColorGradePanel, { useColorGrade } from "@/components/tools/ColorGradePanel";
import OutputTrackBar from "@/components/tools/OutputTrackBar";
import GradedPreview from "@/components/tools/GradedPreview";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";
import { buildSemanticFilename } from "@/lib/studio/semantic-filename";
import { TAROT_CARDS, PREVIEW_CARD, buildCardPrompt, STYLE_PRESETS, resolveStylePrompt, type TarotCard } from "./cards";

type GroupKey = "all" | "major" | "wands" | "cups" | "swords" | "pentacles";
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "major", label: "大阿卡納 22" },
  { key: "all", label: "全部 78 張" },
  { key: "wands", label: "權杖 14" },
  { key: "cups", label: "聖杯 14" },
  { key: "swords", label: "寶劍 14" },
  { key: "pentacles", label: "錢幣 14" },
];
function inGroup(card: TarotCard, key: GroupKey): boolean {
  return key === "all" ? true : card.type === key;
}
import { renderPrintCard, CARD_TEMPLATES, type CardTemplate } from "./renderPrintCard";
// type-only import (erased at build — does not pull the server lib into the client bundle);
// keeps the model union in sync with the server. maxRefs/cost stay local on purpose.
import type { TarotModel } from "../../../lib/tarot/image-gen";

type Mode = "text" | "image";

interface GenResponse {
  ok: boolean;
  image?: string;
  seed?: number | null;
  error?: string;
}

interface BatchItem {
  card: TarotCard;
  status: "idle" | "pending" | "done" | "error";
  url?: string;
  blob?: Blob;
  error?: string;
}

// Model menu, cheapest → priciest. costNt = rough NT$ per image (for the 78-card estimate).
// maxRefs = how many reference images this model consumes (0 = text-only).
type ModelOption = { value: TarotModel; label: string; group: string; costNt: number; maxRefs: number };
const MODEL_OPTIONS: ModelOption[] = [
  // Budget
  { value: "flux-schnell",         label: "FLUX schnell",         group: "BFL",      costNt: 0.1,  maxRefs: 0 },
  // Ideogram
  { value: "ideogram-v2a-turbo",   label: "Ideogram v2a Turbo",   group: "Ideogram", costNt: 1,    maxRefs: 0 },
  { value: "ideogram-v3-balanced", label: "Ideogram v3 Balanced", group: "Ideogram", costNt: 2,    maxRefs: 0 },
  { value: "ideogram-v4-turbo",    label: "Ideogram v4 Turbo",    group: "Ideogram", costNt: 1,    maxRefs: 0 },
  { value: "ideogram-v4-quality",  label: "Ideogram v4 Quality",  group: "Ideogram", costNt: 3,    maxRefs: 0 },
  { value: "ideogram-character",   label: "Ideogram Character",   group: "Ideogram", costNt: 5,    maxRefs: 1 },
  // Creative
  { value: "flux-dev",             label: "FLUX dev",             group: "BFL",      costNt: 1,    maxRefs: 1 },
  { value: "flux-2-max",           label: "FLUX 2 Max",           group: "BFL",      costNt: 2.3,  maxRefs: 0 },
  // Google / ByteDance
  { value: "seedream-4.5",         label: "Seedream 4.5",         group: "Google+",  costNt: 1.3,  maxRefs: 0 },
  { value: "nano-banana-2",        label: "Nano Banana 2",        group: "Google+",  costNt: 2.2,  maxRefs: 14 },
  { value: "nano-banana-pro",      label: "Nano Banana Pro",      group: "Google+",  costNt: 4.4,  maxRefs: 8 },
  { value: "imagen-4",             label: "Imagen 4",             group: "Google+",  costNt: 1.3,  maxRefs: 0 },
  // OpenAI
  { value: "openai-low",           label: "GPT-Image-1 低",       group: "OpenAI",   costNt: 0.5,  maxRefs: 5 },
  { value: "openai-medium",        label: "GPT-Image-1 中",       group: "OpenAI",   costNt: 1.3,  maxRefs: 5 },
  { value: "openai-high",          label: "GPT-Image-1 高",       group: "OpenAI",   costNt: 5.5,  maxRefs: 5 },
];

type CompareResult = { model: TarotModel; image: string | null; seed: number | null; error?: string; busy: boolean };

function modelOption(m: TarotModel): ModelOption {
  return MODEL_OPTIONS.find((o) => o.value === m) ?? MODEL_OPTIONS[0];
}

const MODEL_GROUPS = Array.from(new Set(MODEL_OPTIONS.map((o) => o.group)));

// Neutral gradient used to render template previews before the user has generated art.
const PLACEHOLDER_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='#c9b8f8'/><stop offset='1' stop-color='#6d4c91'/>" +
      "</linearGradient></defs><rect width='400' height='600' fill='url(#g)'/>" +
      "<text x='200' y='310' font-size='34' fill='white' text-anchor='middle' opacity='0.75'>樣式預覽</text></svg>",
  );

async function callGenerate(body: {
  model: TarotModel;
  prompt: string;
  referenceImages?: string[];
  seed?: number | null;
  printQuality?: boolean;
}): Promise<GenResponse> {
  const res = await fetch("/api/tools/tarot/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body: JSON.stringify(body),
  });
  return (await res.json()) as GenResponse;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

// Downscale an uploaded reference image to a small JPEG data URL. A style reference does not
// need full resolution, and keeping it small avoids the route's 10MB request-body limit
// (a few full-res photos would blow past it → truncated body → "invalid_json").
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
        resolve(dataUrl); // fall back to original if canvas unavailable
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = dataUrl;
  });
}

export default function TarotStudio() {
  // Multi-select for comparison; batch generation always uses lockedModel (set at lock time).
  const [selectedModels, setSelectedModels] = useState<Set<TarotModel>>(new Set<TarotModel>(["flux-schnell"]));
  const [lockedModel, setLockedModel] = useState<TarotModel>("flux-schnell");
  // Tarot is print-fixed at 2:3 portrait — no ratio UI here. Other apps pass aspectRatio
  // to the same API/toolkit (see lobster-factory/docs/IMAGE_GEN_TOOLKIT.md).
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [compareBusy, setCompareBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("text");
  const [group, setGroup] = useState<GroupKey>("major");
  const [template, setTemplate] = useState<CardTemplate>("gold");
  const [stylePrompt, setStylePrompt] = useState("");
  const [subjectText, setSubjectText] = useState(""); // optional character override (text channel)
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  // The final English actually sent. Defaults to the auto-resolved English from the zh chips, but
  // the user can edit it directly before generating; once edited, `styleEnglishEdited` pins their text.
  const [styleEnglish, setStyleEnglish] = useState("");
  const [styleEnglishEdited, setStyleEnglishEdited] = useState(false);

  const [suggestBusy, setSuggestBusy] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Background batch (Trigger.dev)
  const [bgJobId, setBgJobId]       = useState<string | null>(null);
  const [bgStatus, setBgStatus]     = useState<string>("idle"); // idle|pending|running|done|error
  const [bgProgress, setBgProgress] = useState({ done: 0, total: 0 });
  const [bgLoadBusy, setBgLoadBusy] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null); // large-view modal (batch cards)
  const [previewZoom, setPreviewZoom] = useState(false); // large-view modal (step-1 preview)
  const [compareZoom, setCompareZoom] = useState<string | null>(null); // large-view modal (compare grid)
  const [previewSig, setPreviewSig] = useState<string | null>(null); // model+style that made the current preview
  const [templateThumbs, setTemplateThumbs] = useState<Record<string, string>>({});
  const grade = useColorGrade(); // 修圖積木：色彩/色階/銳利度 (live CSS preview + server bake)

  const doneCount = batch.filter((b) => b.status === "done").length;
  // For Step 1 UI (ref upload limit), use first selected model.
  const activeModel: TarotModel = Array.from(selectedModels)[0] ?? "flux-schnell";
  const maxRefs = modelOption(activeModel).maxRefs;
  const isMultiModel = selectedModels.size > 1;

  // Style box = comma-separated zh labels. zh labels never contain commas, so this cleanly
  // recovers the selected chips (drives chip highlight + toggle).
  const styleTokens = stylePrompt.split(",").map((s) => s.trim()).filter(Boolean);

  // English actually sent: the user's edited text if they touched it, else auto-resolved from chips.
  const autoEnglish = resolveStylePrompt(stylePrompt);
  const effectiveEnglish = styleEnglishEdited ? styleEnglish : autoEnglish;

  // Stale when model selection, aspect ratio, style, subject, or refs changed after last generate.
  const previewStale = !!previewImage && !locked && previewSig != null && previewSig !== `${activeModel}::${effectiveEnglish.trim()}::subj=${subjectText.trim()}::refs=${referenceImages.length}`;

  // The deck's style anchor uses lockedModel's maxRefs (set at lock time, not current selection).
  const lockedMaxRefs = modelOption(lockedModel).maxRefs;
  const lockedRefs: string[] =
    lockedMaxRefs === 0
      ? []
      : referenceImages.length > 0
        ? referenceImages.slice(0, lockedMaxRefs)
        : previewImage
          ? [previewImage]
          : [];

  // Track current template-thumb blob URLs so we can revoke them without touching
  // state — keeping the revocation outside state updaters avoids React 18 Strict Mode
  // double-invoke blanking the thumbnails in development.
  const thumbUrlsRef = useRef<string[]>([]);

  // Revoke all card object URLs on unmount to avoid leaking blobs (78 + retries).
  const batchRef = useRef<BatchItem[]>([]);
  // Generation token: incremented on each generateCompare call and on selectCompareResult.
  // The final setCompareResults is skipped if the token changed (prevents stale repaint after lock).
  const compareGenIdRef = useRef(0);
  // Prompt values captured at compare-generation time — used in selectCompareResult so that
  // previewSig reflects the prompt that actually made the comparison images, not an edited value.
  const compareStyleRef = useRef({ english: "", subject: "" });
  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);
  useEffect(
    () => () => {
      batchRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url));
    },
    [],
  );

  // Render a small preview of every template (using the user's art if available) so the
  // chooser shows the actual frame style, not just text.
  // Three renders run in parallel (Promise.all) — ~3× faster than sequential await.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sample = previewImage ?? PLACEHOLDER_ART;
      const results = await Promise.all(
        CARD_TEMPLATES.map(async (t) => {
          try {
            const blob = await renderPrintCard(PREVIEW_CARD, sample, t.key);
            return { key: t.key, url: URL.createObjectURL(blob) };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) {
        results.forEach((r) => r && URL.revokeObjectURL(r.url));
        return;
      }
      const next: Record<string, string> = {};
      const newUrls: string[] = [];
      for (const r of results) {
        if (r) {
          next[r.key] = r.url;
          newUrls.push(r.url);
        }
      }
      // Revoke old URLs BEFORE calling setState — outside any updater function so
      // React 18 Strict Mode's double-invoke of state updaters cannot re-revoke the
      // freshly-created URLs (which would blank the thumbnails in development).
      thumbUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      thumbUrlsRef.current = newUrls;
      setTemplateThumbs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewImage]);

  // Poll background batch status every 8s while running.
  useEffect(() => {
    if (!bgJobId || bgStatus === "done" || bgStatus === "error" || bgStatus === "idle") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tools/tarot/batch/${bgJobId}`, {
          headers: { ...roleHeader("operator") },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; job?: { status: string; completedCards: number; totalCards: number } };
        if (!data.ok || !data.job) return;
        const j = data.job;
        setBgProgress({ done: j.completedCards, total: j.totalCards });
        if (j.status === "done" || j.status === "error") {
          setBgStatus(j.status);
          clearInterval(interval);
        }
      } catch { /* ignore poll errors */ }
    }, 8_000);
    return () => clearInterval(interval);
  }, [bgJobId, bgStatus]);

  async function onAddReferences(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      // downscale each upload to a small JPEG so the request body stays well under the 10MB limit
      const added = await Promise.all(Array.from(files).map((f) => downscaleImageFile(f)));
      setReferenceImages((prev) => [...prev, ...added].slice(0, maxRefs || 5));
    } catch {
      setMessage("參考圖讀取失敗");
    }
  }

  function removeReference(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  function previewInputsValid(): boolean {
    setMessage(null);
    if (mode === "image" && referenceImages.length === 0) {
      setMessage("以圖生圖模式請先上傳至少一張參考圖（或切到文字模式並填描述）");
      return false;
    }
    const hasStyle = effectiveEnglish.trim().length >= 3;
    const hasSubject = subjectText.trim().length >= 2;
    const hasRef = mode === "image" && referenceImages.length > 0;
    if (!hasStyle && !hasSubject && !hasRef) {
      setMessage("請填風格描述（至少 3 字）或角色描述，或在「以圖生圖」模式上傳參考圖");
      return false;
    }
    return true;
  }

  async function suggestPrompt() {
    const hint = stylePrompt.trim() || subjectText.trim();
    if (!hint) {
      setMessage("請先在「風格描述」或「主角」欄填入提示，再讓 AI 幫你生成 prompt");
      return;
    }
    setSuggestBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tools/tarot/suggest-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({ hint, subject: subjectText.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; prompt?: string; error?: string };
      if (!data.ok || !data.prompt) {
        setMessage(`AI 無法生成 prompt：${data.error ?? "unknown"}`);
        return;
      }
      setStyleEnglish(data.prompt);
      setStyleEnglishEdited(true);
    } catch (e) {
      setMessage(`AI 生成失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSuggestBusy(false);
    }
  }

  async function generatePreview() {
    if (!previewInputsValid()) return;
    setPreviewBusy(true);
    setLocked(false);
    setCompareResults([]);
    setCompareZoom(null);
    try {
      const resp = await callGenerate({
        model: activeModel,
        prompt: buildCardPrompt(PREVIEW_CARD, { styleResolved: effectiveEnglish, subject: subjectText }),
        referenceImages: mode === "image" ? referenceImages.slice(0, maxRefs) : [],
        seed: null,
        printQuality: true,
      });
      if (!resp.ok || !resp.image) {
        setMessage(`預覽生成失敗：${resp.error ?? "unknown"}`);
        return;
      }
      setPreviewImage(resp.image);
      setPreviewSeed(resp.seed ?? null);
      setPreviewSig(`${activeModel}::${effectiveEnglish.trim()}::subj=${subjectText.trim()}::refs=${referenceImages.length}`);
      saveToGallery(resp.image, "tarot-preview", { model: activeModel, prompt: effectiveEnglish });
    } catch (e) {
      setMessage(`預覽生成失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  // Multi-model comparison: run models sequentially (one at a time) to avoid Replicate 429.
  // Results appear incrementally — each card updates as its model finishes.
  async function generateCompare() {
    if (!previewInputsValid()) return;
    setCompareBusy(true);
    setLocked(false);
    setCompareZoom(null);
    const modelList = Array.from(selectedModels);
    const genId = ++compareGenIdRef.current;
    // Capture prompt at compare time; selectCompareResult reads these for previewSig.
    compareStyleRef.current = { english: effectiveEnglish, subject: subjectText };
    const prompt = buildCardPrompt(PREVIEW_CARD, { styleResolved: effectiveEnglish, subject: subjectText });
    // Initialise all slots as busy so the UI shows every pending card immediately
    const slots: CompareResult[] = modelList.map((m) => ({ model: m, image: null, seed: null, busy: true }));
    setCompareResults([...slots]);

    for (let i = 0; i < modelList.length; i++) {
      if (compareGenIdRef.current !== genId) break; // user already selected a winner
      const m = modelList[i];
      let result: CompareResult;
      try {
        const resp = await callGenerate({
          model: m,
          prompt,
          referenceImages: mode === "image" ? referenceImages.slice(0, modelOption(m).maxRefs) : [],
          seed: null,
          printQuality: true,
        });
        result = { model: m, image: resp.ok && resp.image ? resp.image : null, seed: resp.ok ? (resp.seed ?? null) : null, error: resp.ok ? undefined : (resp.error ?? "unknown"), busy: false };
      } catch (e) {
        result = { model: m, image: null, seed: null, error: e instanceof Error ? e.message : String(e), busy: false };
      }
      slots[i] = result;
      if (result.image) {
        saveToGallery(result.image, "tarot-compare", { model: m, prompt });
      }
      if (compareGenIdRef.current === genId) {
        setCompareResults([...slots]); // update incrementally — completed cards appear immediately
      }
    }
    if (compareGenIdRef.current === genId) setCompareBusy(false);
  }

  // Pick a comparison result as the active preview → selects model + auto-locks (no extra button needed).
  function selectCompareResult(r: CompareResult) {
    if (!r.image) return;
    const newModel = r.model;
    compareGenIdRef.current++; // invalidate any in-flight compare so it won't repopulate after lock
    const { english, subject } = compareStyleRef.current; // use prompt that produced these images
    saveToGallery(r.image, "tarot-preview", { model: newModel, prompt: english });
    setPreviewImage(r.image);
    setPreviewSeed(r.seed);
    setSelectedModels(new Set([newModel]));
    setLockedModel(newModel);
    setPreviewSig(`${newModel}::${english.trim()}::subj=${subject.trim()}::refs=${referenceImages.length}`);
    setCompareResults([]);
    setCompareZoom(null);
    // Selecting from comparison means "I want this style" → auto-lock and proceed to batch step
    setLocked(true);
    setBatch((prev) => {
      prev.forEach((it) => it.url && URL.revokeObjectURL(it.url));
      return TAROT_CARDS.map((card) => ({ card, status: "idle" }));
    });
    setMessage(null);
  }

  function lockStyle() {
    if (!previewImage) return;
    saveToGallery(previewImage, "tarot-preview", { model: activeModel, prompt: effectiveEnglish });
    setLockedModel(activeModel); // freeze which model is used for batch generation
    setLocked(true);
    setCompareResults([]);
    setBatch((prev) => {
      prev.forEach((it) => it.url && URL.revokeObjectURL(it.url));
      return TAROT_CARDS.map((card) => ({ card, status: "idle" }));
    });
    setMessage(null);
  }

  function patchItem(index: number, patch: Partial<BatchItem>) {
    setBatch((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  // Fire-and-forget save to R2 gallery — never blocks generation or UI.
  // styleTags (the picked zh chips) + subject ride along so the gallery can show what was
  // selected and build a meaningful filename. Read from current state — for compare's async
  // loop the chips rarely change mid-run, same posture as lockedModel below.
  function saveToGallery(image: string, source: string, extra?: { cardName?: string; prompt?: string; model?: string }) {
    void fetch("/api/tools/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        source,
        prompt: extra?.prompt ?? null,
        modelName: extra?.model ?? lockedModel,
        cardName: extra?.cardName ?? null,
        styleTags: styleTokens,
        subject: subjectText.trim() || undefined,
      }),
    }).catch(() => {/* gallery save never blocks generation */});
  }

  async function generateOne(card: TarotCard, index: number): Promise<void> {
    patchItem(index, { status: "pending", error: undefined });
    try {
      const resp = await callGenerate({
        model: lockedModel,
        prompt: buildCardPrompt(card, { styleResolved: effectiveEnglish, subject: subjectText }),
        referenceImages: lockedRefs,
        seed: previewSeed,
        printQuality: true,
      });
      if (!resp.ok || !resp.image) {
        patchItem(index, { status: "error", error: resp.error ?? "unknown" });
        return;
      }
      saveToGallery(resp.image, "tarot", {
        cardName: card.name,
        prompt: buildCardPrompt(card, { styleResolved: effectiveEnglish, subject: subjectText }),
      });
      // Apply the deck's colour-grade to every card (洞1 fix): the adjustment made on the
      // preview now propagates to all 78 cards' print render — not just the preview download.
      const blob = await renderPrintCard(card, resp.image, template, grade.neutral ? undefined : grade.cssFilter);
      const url = URL.createObjectURL(blob);
      // revoke any prior url for this slot (retry case) before replacing
      setBatch((prev) =>
        prev.map((it, i) => {
          if (i !== index) return it;
          if (it.url) URL.revokeObjectURL(it.url);
          return { ...it, status: "done", blob, url, error: undefined };
        }),
      );
    } catch (e) {
      patchItem(index, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Generate pending/failed cards in the currently-selected group (skips already-done by default).
  // skipDone=false regenerates everything (full redo).
  async function generateGroup(skipDone = true) {
    const all = batch.map((it, i) => ({ it, i })).filter(({ it }) => inGroup(it.card, group));
    const targets = skipDone ? all.filter(({ it }) => it.status !== "done") : all;
    if (targets.length === 0) {
      if (skipDone) setMessage("這組的牌都已生成完畢，點「重新生成全組」可覆蓋重做。");
      return;
    }
    const opt = modelOption(lockedModel);
    const estNt = Math.round(targets.length * opt.costNt);
    const mins = Math.max(1, Math.round((targets.length * 20) / 60));
    const label = GROUPS.find((g) => g.key === group)?.label ?? "";
    const ok = window.confirm(
      `即將生成 ${targets.length} 張（${label}，${lockedModel}）。\n` +
        `預估費用約 NT$${estNt}，約 ${mins} 分鐘，請保持此分頁開啟。\n\n確定開始？`,
    );
    if (!ok) return;
    setBatchBusy(true);
    setMessage(null);
    try {
      for (const t of targets) {
        await generateOne(t.it.card, t.i);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  // Launch a Trigger.dev background batch for all 78 cards (browser can be closed).
  async function startBackgroundBatch() {
    const opt = modelOption(lockedModel);
    const estNt = Math.round(78 * opt.costNt);
    const ok = window.confirm(
      `背景批次生成 78 張（${lockedModel}）。\n` +
        `預估費用約 NT$${estNt}，約 20-90 分鐘在伺服器背景執行，可關閉瀏覽器。\n` +
        `生成完成後回來按「載入批次結果」即可。\n\n確定開始？`,
    );
    if (!ok) return;
    setBgStatus("pending");
    setBgProgress({ done: 0, total: 78 });
    setMessage(null);
    try {
      const cards = TAROT_CARDS.map((card, i) => ({
        index: i,
        name: card.name,
        prompt: buildCardPrompt(card, { styleResolved: effectiveEnglish, subject: subjectText }),
      }));
      const res = await fetch("/api/tools/tarot/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({
          cards,
          model: lockedModel,
          aspectRatio: "2:3",
          seed: previewSeed,
        }),
      });
      const data = (await res.json()) as { ok: boolean; jobId?: string; totalCards?: number; error?: string };
      if (!data.ok || !data.jobId) {
        setMessage(`背景批次啟動失敗：${data.error ?? "unknown"}`);
        setBgStatus("idle");
        return;
      }
      setBgJobId(data.jobId);
      setBgStatus("running");
      setMessage(`背景批次已啟動 (job: ${data.jobId.slice(0, 8)}) — 可關閉瀏覽器，8 秒自動更新進度。`);
    } catch (e) {
      setMessage(`背景批次失敗：${e instanceof Error ? e.message : String(e)}`);
      setBgStatus("idle");
    }
  }

  // Load results from a completed background batch into the local batch grid.
  async function loadBatchResults() {
    if (!bgJobId) return;
    setBgLoadBusy(true);
    setMessage("載入背景批次結果中…");
    try {
      const res = await fetch(`/api/tools/tarot/batch/${bgJobId}`, {
        headers: { ...roleHeader("operator") },
      });
      const data = (await res.json()) as {
        ok: boolean;
        job?: { results: Array<{ cardIndex: number; cardName: string; url: string }> };
        error?: string;
      };
      if (!data.ok || !data.job) {
        setMessage(`載入失敗：${data.error ?? "unknown"}`);
        return;
      }
      const results = data.job.results;
      setBatch((prev) => {
        const next = [...prev];
        for (const r of results) {
          if (r.cardIndex >= 0 && r.cardIndex < next.length && r.url) {
            const existing = next[r.cardIndex];
            if (existing.url) URL.revokeObjectURL(existing.url);
            next[r.cardIndex] = { ...existing, status: "done", url: r.url, blob: undefined };
          }
        }
        return next;
      });
      setMessage(`已載入 ${results.length} 張背景批次結果。如需含框 ZIP，請點「下載 ZIP」（會自動套框）。`);
    } catch (e) {
      setMessage(`載入失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBgLoadBusy(false);
    }
  }

  // Generate (or regenerate) a single card — fast, no confirm.
  async function generateSingle(index: number) {
    if (batchBusy) return;
    setBatchBusy(true);
    setMessage(null);
    try {
      await generateOne(batch[index].card, index);
    } finally {
      setBatchBusy(false);
    }
  }

  async function downloadZip() {
    const done = batch.filter((b) => b.status === "done" && (b.blob || b.url));
    if (done.length === 0) {
      setMessage("還沒有可下載的牌卡");
      return;
    }
    setZipBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      // Snapshot the deck colour-grade once (洞1: background-batch cards have only an R2 url,
      // not a pre-graded blob, so they must be (re)graded here too — foreground cards' blobs
      // were already graded in generateOne). One snapshot = uniform deck, no mid-zip drift.
      const deckFilter = grade.neutral ? undefined : grade.cssFilter;
      for (const it of batch) {
        if (it.status !== "done") continue;
        // Cards from background batch have url (R2) but no blob — render the print card on demand.
        if (!it.blob && it.url) {
          try {
            const imgRes = await fetch(it.url);
            const imgBlob = await imgRes.blob();
            const artDataUrl: string = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error("read_error"));
              reader.readAsDataURL(imgBlob);
            });
            const printBlob = await renderPrintCard(it.card, artDataUrl, template, deckFilter);
            const safe = it.card.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
            zip.file(`${String(it.card.id).padStart(2, "0")}_${safe}.png`, printBlob);
          } catch { /* skip unrenderable cards */ }
          continue;
        }
        if (it.blob) {
          const safe = it.card.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
          zip.file(`${String(it.card.id).padStart(2, "0")}_${safe}.png`, it.blob);
        }
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildSemanticFilename(
        { product: "塔羅整套", style: stylePrompt.trim() || undefined },
        "zip",
        "tarot-deck-print.zip",
      );
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(`打包失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>🔮 塔羅牌印刷檔生成工具</h1>
      <p className="form-hint" style={{ marginBottom: 20 }}>
        先設計一張風格樣本 → 鎖定風格 → 整套 78 張同風格生成 → 下載印刷檔 PNG（70×120mm @300DPI 含出血）。
      </p>

      {message && (
        <div className="form-message" style={{ marginBottom: 16 }}>
          {message}
        </div>
      )}

      {/* ── Step 1: style design ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 14px" }}>Step 1 · 風格設計</h2>

        <div className="form-row">
          <label className="form-label">
            圖片模型{isMultiModel ? "（多選 → 生成比較）" : "（點選 → 生成預覽）"}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MODEL_GROUPS.map((group) => (
              <div key={group}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{group}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {MODEL_OPTIONS.filter((o) => o.group === group).map((o) => {
                    const active = selectedModels.has(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          setSelectedModels((prev) => {
                            const next = new Set(prev);
                            if (next.has(o.value)) {
                              if (next.size > 1) next.delete(o.value); // keep at least 1 selected
                            } else {
                              next.add(o.value);
                            }
                            return next;
                          });
                        }}
                        title={`~NT$${o.costNt}/張${o.maxRefs > 0 ? `，最多 ${o.maxRefs} 張參考圖` : "，純文字"}`}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 14,
                          fontSize: 12,
                          cursor: locked ? "default" : "pointer",
                          border: `1px solid ${active ? "#6366f1" : "var(--card-border)"}`,
                          background: active ? "#6366f1" : "rgba(127,127,127,0.08)",
                          color: active ? "#fff" : "var(--text-muted)",
                          fontWeight: active ? 600 : 400,
                          opacity: locked ? 0.5 : 1,
                        }}
                      >
                        {active && selectedModels.size === 1 ? "✓ " : active ? "☑ " : ""}{o.label}
                        <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>NT${o.costNt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="form-hint" style={{ marginTop: 6 }}>
            {isMultiModel
              ? `已選 ${selectedModels.size} 個模型 → 點「生成比較」同時生成對比。`
              : maxRefs === 0
                ? "此模型不吃參考圖（純文字生圖）"
                : `此模型最多吃 ${maxRefs} 張參考圖`}
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">生成模式</label>
          <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={locked}>
            <option value="text">文字生圖（純描述）</option>
            <option value="image">以圖生圖 / 上傳風格參考圖</option>
          </select>
        </div>

        {mode === "image" && (
          <div className="form-row">
            <label className="form-label">參考圖（風格參考，可多張）</label>
            {maxRefs === 0 ? (
              <div className="form-hint" style={{ color: "var(--yellow)" }}>
                ⚠ 目前模型不吃參考圖。改選 FLUX dev（1 張）或 gpt-image-1（最多 5 張）才會用到上傳圖。
              </div>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="form-input"
                  disabled={locked || referenceImages.length >= maxRefs}
                  onChange={(e) => {
                    void onAddReferences(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="form-hint">
                  已上傳 {referenceImages.length} / {maxRefs} 張
                  {referenceImages.length >= maxRefs ? "（已達此模型上限）" : ""}
                </div>
              </>
            )}
            {referenceImages.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {referenceImages.map((src, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`ref ${i + 1}`} style={{ height: 90, borderRadius: 6, border: "1px solid var(--card-border)" }} />
                    {!locked && (
                      <button
                        onClick={() => removeReference(i)}
                        title="移除"
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          lineHeight: "20px",
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="form-row">
          <label className="form-label">主角／角色替換（選填）</label>
          <input
            className="form-input"
            placeholder="留空＝用標準塔羅人物。例：a fluffy orange cat / a cartoon robot / 一隻柴犬"
            value={subjectText}
            onChange={(e) => setSubjectText(e.target.value)}
            disabled={locked}
          />
          <div className="form-hint">
            換掉每張牌的主角，情境（姿勢、道具、符號）不變，整副 78 張同一角色。中文會自動轉英；用英文最準。
            <b>上傳真人／角色照片</b>時這裡留空即可，模型會直接照圖換臉（走上方「以圖生圖」）。
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">風格描述{mode === "image" && referenceImages.length > 0 ? "（選填，已上傳參考圖可留空）" : ""}</label>
          <div style={{ marginBottom: 8 }}>
            {Array.from(new Set(STYLE_PRESETS.map((p) => p.group))).map((g) => (
              <div key={g} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, opacity: 0.8 }}>{g}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STYLE_PRESETS.filter((p) => p.group === g).map((p) => {
                    const selected = styleTokens.includes(p.zh);
                    return (
                    <button
                      key={p.zh}
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        // Toggle the zh label in/out of the box. The textarea shows Chinese; the
                        // English catalog prompt is resolved + sent at generation time. zh labels
                        // have no commas, so comma-split round-trips cleanly.
                        setStylePrompt((prev) => {
                          const toks = prev.split(",").map((s) => s.trim()).filter(Boolean);
                          const i = toks.indexOf(p.zh);
                          if (i >= 0) toks.splice(i, 1);
                          else toks.push(p.zh);
                          return toks.join(", ");
                        })
                      }
                      title={selected ? `移除 ${p.zh}` : `加入 ${p.zh}`}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 14,
                        fontSize: 12,
                        cursor: locked ? "default" : "pointer",
                        border: `1px solid ${selected ? "#6366f1" : "var(--card-border)"}`,
                        background: selected ? "#6366f1" : "rgba(127,127,127,0.08)",
                        color: selected ? "#fff" : "var(--text-muted)",
                        fontWeight: selected ? 600 : 400,
                        opacity: locked ? 0.5 : 1,
                      }}
                    >
                      {selected ? "✓ " : ""}
                      {p.zh}
                    </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <textarea
            className="form-textarea"
            placeholder="點上方按鈕選風格（顯示中文）。也可自行輸入。例：水彩｜透明淡彩暈染風格"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            disabled={locked}
          />
          <div className="form-hint">
            點按鈕選風格 → 框裡顯示<b>中文</b>（看得懂選了什麼），再點一次取消（打勾＝已選）。對應的<b>完整英文</b>會帶到下方，<b>你可以直接編輯</b>，生成時送的就是下面那段。整段套用到 78 張牌；風格不夠強時改用 FLUX dev 模型。
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                🎨 <b>實際送給圖片模型的英文</b>（可直接改，改了就送這段）
              </span>
              <button
                type="button"
                disabled={locked || suggestBusy}
                onClick={() => void suggestPrompt()}
                title="用 AI 根據你的風格提示自動生成英文 art-direction prompt"
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 10,
                  border: "1px solid #6366f1",
                  background: locked || suggestBusy ? "rgba(127,127,127,0.08)" : "#eef2ff",
                  color: locked || suggestBusy ? "var(--text-muted)" : "#4338ca",
                  cursor: locked || suggestBusy ? "default" : "pointer",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {suggestBusy ? "✨ AI 生成中…" : "✨ 幫我想 prompt"}
              </button>
              {styleEnglishEdited && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setStyleEnglish("");
                    setStyleEnglishEdited(false);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "1px 8px",
                    borderRadius: 10,
                    border: "1px solid var(--card-border)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: locked ? "default" : "pointer",
                  }}
                >
                  ↻ 重設為中文對應
                </button>
              )}
            </div>
            <textarea
              className="form-textarea"
              style={{ minHeight: 90, fontSize: 12, lineHeight: 1.5, background: "rgba(99,102,241,0.06)" }}
              placeholder="（選了上方風格這裡會自動帶出英文；也可自行修改或直接輸入英文）"
              value={effectiveEnglish}
              onChange={(e) => {
                setStyleEnglish(e.target.value);
                setStyleEnglishEdited(true);
              }}
              disabled={locked}
            />
            {styleEnglishEdited && (
              <div className="form-hint" style={{ color: "var(--yellow)" }}>
                ✏ 你已手動編輯英文 → 生成時送這段（已覆蓋中文按鈕的自動對應）。按「重設」恢復自動。
              </div>
            )}
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">外框顏色（正式塔羅版式 · 上羅馬數字／中圖像／下牌名 · 三色直線外框）</label>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {CARD_TEMPLATES.map((t) => {
              const active = template === t.key;
              return (
                <div
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  style={{ cursor: "pointer", textAlign: "center", width: 129 }}
                >
                  {templateThumbs[t.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={templateThumbs[t.key]}
                      alt={t.label}
                      style={{
                        width: 129,
                        height: 213,
                        borderRadius: 6,
                        objectFit: "cover",
                        border: active ? "3px solid #6366f1" : "1px solid var(--card-border)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 129,
                        height: 213,
                        borderRadius: 6,
                        border: "1px solid var(--card-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        opacity: 0.5,
                      }}
                    >
                      …
                    </div>
                  )}
                  <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.3, color: active ? "#4338ca" : "var(--text-muted)" }}>
                    {t.label}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="form-hint">每張下載的牌都會套這個框 + 自動加牌名。生成預覽後，這裡會用你的圖顯示各模板樣式。</div>
        </div>

        {previewStale && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #f59e0b",
              background: "#fffbeb",
              color: "#92400e",
              fontSize: 13,
            }}
          >
            ⚠ 你已更改風格或模型，但上方預覽與外框縮圖仍是<strong>舊圖</strong>。請按「重新生成預覽」套用新風格（縮圖不會自己更新）。
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isMultiModel ? (
            <button
              className="btn-primary"
              onClick={generateCompare}
              disabled={compareBusy || locked}
            >
              {compareBusy ? `生成中… (${selectedModels.size} 個模型)` : `生成比較（${selectedModels.size} 個）`}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={generatePreview}
              disabled={previewBusy || locked}
              style={previewStale ? { boxShadow: "0 0 0 3px #fde68a" } : undefined}
            >
              {previewBusy ? "生成中…" : previewImage ? "重新生成預覽（套用新風格）" : "生成風格預覽"}
            </button>
          )}
        </div>

        {/* Multi-model comparison results */}
        {compareResults.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
              比較結果（點圖放大，按「選這個」進入整套生成）
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {compareResults.map((r) => (
                <div key={r.model} style={{ textAlign: "center", maxWidth: 220 }}>
                  {r.busy ? (
                    <div
                      style={{
                        width: 180,
                        height: 270,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid var(--card-border)",
                        borderRadius: 8,
                        fontSize: 13,
                        color: "var(--text-muted)",
                      }}
                    >
                      ⏳ 生成中…
                    </div>
                  ) : r.image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.image}
                        alt={r.model}
                        onClick={() => setCompareZoom(r.image)}
                        title="點擊放大"
                        style={{ width: 180, borderRadius: 8, border: "2px solid transparent", cursor: "zoom-in", display: "block" }}
                      />
                      <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-muted)" }}>
                        {modelOption(r.model).label}
                      </div>
                      <button
                        className="btn-primary"
                        style={{ marginTop: 6, fontSize: 11, padding: "4px 14px" }}
                        onClick={() => selectCompareResult(r)}
                      >
                        選這個
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "#ef4444", width: 180 }}>
                      {modelOption(r.model).label}
                      <br />
                      ⚠ {r.error ?? "失敗"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {previewImage && (
          <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* True WYSIWYG preview — gamma/sharpen/levels show their real effect (not CSS). */}
            <div onClick={() => setPreviewZoom(true)} title="點擊放大" style={{ cursor: "zoom-in", border: "1px solid var(--card-border)", borderRadius: 10, lineHeight: 0 }}>
              <GradedPreview image={previewImage} params={grade.params} maxWidth={300} maxHeight={450} />
            </div>
            <div>
              <div className="form-hint" style={{ marginBottom: 8 }}>
                預覽牌：{PREVIEW_CARD.name}
                {previewSeed != null ? ` · seed ${previewSeed}` : ""}
              </div>
              {!locked ? (
                <button className="btn-primary" onClick={lockStyle}>
                  ✓ 鎖定這個風格，進入整套生成
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => setLocked(false)}>
                  解除鎖定，重新設計
                </button>
              )}
              {/* 輸出軌 ([1-g])：塔羅卡 4 目的地，尺寸正確（70×120/121mm）。色階/銳利度由 server bake。 */}
              <div style={{ marginTop: 12 }}>
                <OutputTrackBar
                  image={previewImage}
                  source="tarot"
                  colorGrade={grade.params}
                  printDestinations={["tw-local", "mpc", "tgc", "printninja"]}
                  fileMeta={{
                    product: "塔羅卡",
                    subject: subjectText.trim() || undefined,
                    style: stylePrompt.trim() || undefined,
                  }}
                />
              </div>
            </div>
            <ImageEditPromptPanel
              sourceImage={previewImage}
              currentPrompt={buildCardPrompt(PREVIEW_CARD, { styleResolved: effectiveEnglish, subject: subjectText })}
              imageModel={activeModel}
              target="tarot-preview"
              generateEndpoint="/api/tools/tarot/generate"
              aspectRatio="2:3"
              printQuality
              styleAnchor={{
                model: activeModel,
                mode,
                stylePrompt: effectiveEnglish,
                subject: subjectText.trim(),
                refs: referenceImages.length,
              }}
              onEditedImage={(image, meta) => {
                setSelectedModels(new Set<TarotModel>([meta.model as TarotModel]));
                setPreviewImage(image);
                setPreviewSeed(meta.seed);
                setPreviewSig(`${meta.model}::${meta.prompt}::edit=1`);
                setLocked(false);
                setBatch((prev) => {
                  prev.forEach((it) => it.url && URL.revokeObjectURL(it.url));
                  return [];
                });
                saveToGallery(image, "tarot-preview-edit", { model: meta.model, prompt: meta.prompt });
              }}
            />
            {/* 修圖積木 ([1-f])：色彩/色階/銳利度滑桿，即時 CSS 預覽。 */}
            <div style={{ width: 260 }}>
              <ColorGradePanel state={grade.state} onSet={grade.set} onReset={grade.reset} neutral={grade.neutral} />
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2 + 3: per-group / per-card generation + download ──── */}
      {locked &&
        (() => {
          const groupItems = batch.map((it, i) => ({ it, i })).filter(({ it }) => inGroup(it.card, group));
          const groupDone = groupItems.filter(({ it }) => it.status === "done").length;
          const groupPending = groupItems.filter(({ it }) => it.status !== "done").length;
          return (
            <div className="card">
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Step 2 · 分組 / 單張生成與下載</h2>

              {/* group filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {GROUPS.map((g) => {
                  const active = group === g.key;
                  return (
                    <button
                      key={g.key}
                      onClick={() => setGroup(g.key)}
                      disabled={batchBusy}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: batchBusy ? "default" : "pointer",
                        border: `1px solid ${active ? "#6366f1" : "var(--card-border)"}`,
                        background: active ? "#eef2ff" : "transparent",
                        color: active ? "#4338ca" : "var(--text-muted)",
                      }}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <button className="btn-primary" onClick={() => void generateGroup(true)} disabled={batchBusy || groupPending === 0}>
                  {batchBusy ? `生成中… ${groupDone}/${groupItems.length}` : `生成未完成 ${groupPending} 張`}
                </button>
                {groupDone > 0 && (
                  <button className="btn-secondary" onClick={() => void generateGroup(false)} disabled={batchBusy}
                    title="重新生成這組所有牌（包含已完成的），會覆蓋現有結果">
                    重新生成全組
                  </button>
                )}
                <button className="btn-secondary" onClick={downloadZip} disabled={zipBusy || doneCount === 0}>
                  {zipBusy ? "打包中…" : `下載 ZIP（全部 ${doneCount} 張）`}
                </button>
                <span className="form-hint">
                  這組 {groupDone}/{groupItems.length}　·　全部 {doneCount}/{TAROT_CARDS.length}
                </span>
              </div>

              {/* Background batch (Trigger.dev) */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--card-border)", background: "rgba(99,102,241,0.04)" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>⚡ 背景批次（78 張）</span>
                {bgStatus === "idle" && (
                  <button
                    className="btn-secondary"
                    disabled={batchBusy}
                    onClick={() => void startBackgroundBatch()}
                    title="在伺服器背景生成全 78 張，可關閉瀏覽器"
                    style={{ fontSize: 12 }}
                  >
                    🚀 背景生成全 78 張
                  </button>
                )}
                {(bgStatus === "pending" || bgStatus === "running") && (
                  <span style={{ fontSize: 12, color: "#6366f1" }}>
                    進行中 {bgProgress.done}/{bgProgress.total} 張…
                    {bgJobId && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>job: {bgJobId.slice(0, 8)}</span>}
                  </span>
                )}
                {bgStatus === "done" && (
                  <>
                    <span style={{ fontSize: 12, color: "#10b981" }}>✅ 完成 {bgProgress.done}/{bgProgress.total} 張</span>
                    <button
                      className="btn-primary"
                      disabled={bgLoadBusy}
                      onClick={() => void loadBatchResults()}
                      style={{ fontSize: 12 }}
                    >
                      {bgLoadBusy ? "載入中…" : "載入批次結果"}
                    </button>
                  </>
                )}
                {bgStatus === "error" && (
                  <>
                    <span style={{ fontSize: 12, color: "#ef4444" }}>❌ 部分失敗 {bgProgress.done}/{bgProgress.total}</span>
                    <button
                      className="btn-secondary"
                      disabled={bgLoadBusy}
                      onClick={() => void loadBatchResults()}
                      style={{ fontSize: 12 }}
                    >
                      {bgLoadBusy ? "載入中…" : "載入已完成的"}
                    </button>
                  </>
                )}
              </div>
              <div className="form-hint" style={{ marginBottom: 12 }}>
                💡 點<b>已完成</b>的卡 = 看大圖（裡面可重新生成）。點<b>空白卡</b> = 生成那一張。建議先生一張看滿不滿意再「生成這組」。
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {groupItems.map(({ it, i }) => (
                  <div
                    key={it.card.id}
                    title={`${it.card.name}${it.error ? ` — ${it.error}` : ""}`}
                    onClick={() => {
                      if (batchBusy) return;
                      if (it.status === "done") setViewIndex(i);
                      else generateSingle(i);
                    }}
                    style={{
                      width: 132,
                      height: 219,
                      borderRadius: 8,
                      border: `1px solid ${it.card.colors[0]}55`,
                      background: it.card.colors[1],
                      position: "relative",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: it.card.colors[0],
                      textAlign: "center",
                      cursor: batchBusy ? "default" : "pointer",
                      opacity: batchBusy && it.status !== "pending" ? 0.6 : 1,
                    }}
                  >
                    {it.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.url} alt={it.card.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : it.status === "pending" ? (
                      <span>⏳ 生成中…</span>
                    ) : it.status === "error" ? (
                      <span>
                        ⚠️ 失敗
                        <br />
                        點擊重試
                      </span>
                    ) : (
                      <span style={{ padding: 6 }}>
                        {it.card.name}
                        <br />
                        <span style={{ opacity: 0.6 }}>（點擊生成）</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      {/* large-view modal */}
      {viewIndex != null && batch[viewIndex]?.url && (
        <div
          onClick={() => setViewIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* image + loading overlay */}
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={batch[viewIndex].url}
                alt={batch[viewIndex].card.name}
                style={{
                  maxHeight: "78vh", maxWidth: "90vw", borderRadius: 10,
                  boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                  opacity: batch[viewIndex].status === "pending" ? 0.35 : 1,
                  transition: "opacity 0.2s",
                }}
              />
              {batch[viewIndex].status === "pending" && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, fontWeight: 600, gap: 10,
                }}>
                  <div style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>⏳</div>
                  生成中，請稍候…
                </div>
              )}
            </div>
            {batch[viewIndex].status === "error" && (
              <div style={{ color: "#f87171", fontSize: 13 }}>
                ❌ {batch[viewIndex].error ?? "生成失敗"}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-primary"
                disabled={batchBusy}
                onClick={() => {
                  const idx = viewIndex;
                  if (idx != null) void generateSingle(idx);
                }}
              >
                {batchBusy ? "生成中…" : "🔄 重新生成這張"}
              </button>
              <button className="btn-secondary" onClick={() => setViewIndex(null)}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* large-view modal — compare grid image */}
      {compareZoom && (
        <div
          onClick={() => setCompareZoom(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={compareZoom}
            alt="compare large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "90vh", maxWidth: "92vw", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          />
        </div>
      )}

      {/* large-view modal — step-1 style preview */}
      {previewZoom && previewImage && (
        <div
          onClick={() => setPreviewZoom(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt="preview large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "90vh", maxWidth: "92vw", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          />
        </div>
      )}
    </div>
  );
}
