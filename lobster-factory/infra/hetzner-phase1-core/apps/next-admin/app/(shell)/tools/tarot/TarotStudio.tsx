"use client";

import { useEffect, useRef, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import ColorGradePanel, { useColorGrade } from "@/components/tools/ColorGradePanel";
import OutputTrackBar from "@/components/tools/OutputTrackBar";
import GradedPreview from "@/components/tools/GradedPreview";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";
import { buildSemanticFilename, buildSemanticBase } from "@/lib/studio/semantic-filename";
import { openInCanvas } from "@/components/tools/canvas-handoff";
import { TAROT_CARDS, PREVIEW_CARD, buildCardPrompt, STYLE_PRESETS, resolveStylePrompt, type TarotCard } from "./cards";
import { tabStyle, chipStyle, ghostBtn } from "@/components/tools/panel-primitives";

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
import { renderPrintCard, applyGradeToDataUrl, CARD_TEMPLATES, type CardTemplate } from "./renderPrintCard";
// type-only import (erased at build — does not pull the server lib into the client bundle);
// keeps the model union in sync with the server. maxRefs/cost stay local on purpose.
import type { TarotModel } from "@/lib/tarot/image-gen";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";

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
  /** Frameless graded artwork (the AI picture WITHOUT the card frame) as a PNG data URL.
   *  Retained so the large-view modal can save the raw art to My Designs on demand. */
  art?: string;
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
  // Google
  { value: "nano-banana-2",        label: "Nano Banana 2",        group: "Google+",  costNt: 2.2,  maxRefs: 14 },
  { value: "nano-banana-pro",      label: "Nano Banana Pro",      group: "Google+",  costNt: 4.4,  maxRefs: 8 },
  { value: "imagen-4",             label: "Imagen 4",             group: "Google+",  costNt: 1.3,  maxRefs: 0 },
  // OpenAI
  { value: "openai-low",           label: "GPT-Image-1 低",       group: "OpenAI",   costNt: 0.5,  maxRefs: 5 },
  { value: "openai-medium",        label: "GPT-Image-1 中",       group: "OpenAI",   costNt: 1.3,  maxRefs: 5 },
  { value: "openai-high",          label: "GPT-Image-1 高",       group: "OpenAI",   costNt: 5.5,  maxRefs: 5 },
];

// Chinese / Japanese / Korean script in the subject (models read English only). RegExp constructor:
// tsconfig targets ES2017, which rejects u-flag property escapes in a regex literal.
const CJK_TEXT = new RegExp(String.raw`\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}`, "u");
// One in-browser card run: its stop signal and the deck it was started for (deckGenRef value).
type CardRun = { signal: AbortSignal; deck: number };
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
  _jobId?: string | null;
}, signal?: AbortSignal): Promise<GenResponse> {
  const res = await fetch("/api/tools/tarot/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body: JSON.stringify(body),
    signal,
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

// Re-encode a (possibly multi-MB PNG) artwork data URL into a gallery-sized WebP data URL:
// caps the longest side and recompresses. A raw 2K-model PNG can exceed the gallery API's
// ~9MB limit (→ HTTP 413 → "save failed"); this keeps it safely under while staying visually
// faithful (quality 0.9) for collecting / reuse. Full-resolution printing still uses the
// original art via renderPrintCard — only the gallery copy is capped. Best-effort: any decode /
// canvas / encode failure falls back to the original data URL (let the API decide).
async function toGalleryArt(dataUrl: string, maxDim = 2048, quality = 0.9): Promise<string> {
  return new Promise((resolve) => {
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
      try {
        const webp = canvas.toDataURL("image/webp", quality);
        // Some browsers silently return a PNG data URL when webp is unsupported — accept either,
        // but if it somehow produced nothing usable, fall back to JPEG then the original.
        resolve(webp.startsWith("data:image/") ? webp : canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function TarotStudio() {
  const { canUse, why } = usePaidFeatures();
  // Multi-select for comparison; batch generation always uses lockedModel (set at lock time).
  const [selectedModels, setSelectedModels] = useState<Set<TarotModel>>(new Set<TarotModel>());
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
  // Colour-graded snapshot of previewImage at lock time — used as AI style reference so the
  // model sees what the user sees (not the raw ungraded artwork). Null when grade is neutral.
  const [lockedGradedPreview, setLockedGradedPreview] = useState<string | null>(null);

  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchStopping, setBatchStopping] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Background batch (Trigger.dev)
  const [bgJobId, setBgJobId]       = useState<string | null>(null);
  const [bgStatus, setBgStatus]     = useState<string>("idle"); // idle|pending|running|done|error
  const [bgProgress, setBgProgress] = useState({ done: 0, total: 0 });
  const [bgLoadBusy, setBgLoadBusy] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null); // large-view modal (batch cards)
  const [savingArt, setSavingArt] = useState(false); // modal "存無框圖" in-flight
  const [savedArt, setSavedArt] = useState<Set<number>>(() => new Set()); // batch indices whose frameless art is saved
  const [previewZoom, setPreviewZoom] = useState(false); // large-view modal (step-1 preview)
  const [compareZoom, setCompareZoom] = useState<string | null>(null); // large-view modal (compare grid)
  const [previewSig, setPreviewSig] = useState<string | null>(null); // model+style that made the current preview
  const [templateThumbs, setTemplateThumbs] = useState<Record<string, string>>({});
  const grade = useColorGrade(); // 修圖積木：色彩/色階/銳利度 (live CSS preview + server bake)

  const [styleGroupTab, setStyleGroupTab] = useState<string>("西方畫家");
  const [modelProviderTab, setModelProviderTab] = useState<string>("BFL");
  // Style-chip hover tooltip: viewport coords captured on hover so the tip can be
  // rendered position:fixed at the component root (escapes the sidebar's overflow
  // clipping + sticky stacking context). null = hidden.
  const [styleTip, setStyleTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState<Record<string, boolean>>({
    model: false, style: false, subject: false, mode: false, template: false, grade: false, edit: false,
  });
  function togglePanel(key: string) {
    setPanelOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  // Defensive clear: if the chip list is restructured (tab switch / style accordion
  // collapse / lock) while a chip is hovered, the chip can unmount without a
  // mouseleave — dismiss any live tooltip so it can't strand at stale coords.
  useEffect(() => { setStyleTip(null); }, [styleGroupTab, panelOpen.style, locked]);

  const doneCount = batch.filter((b) => b.status === "done").length;
  // For Step 1 UI (ref upload limit), use first selected model.
  const activeModel: TarotModel = Array.from(selectedModels)[0] ?? "flux-schnell";
  const maxRefs = modelOption(activeModel).maxRefs;
  const isMultiModel = selectedModels.size > 1;
  const hasSelectedModel = selectedModels.size > 0;
  const STYLE_GROUPS = Array.from(new Set(STYLE_PRESETS.map((p) => p.group)));

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
        // Use the colour-graded snapshot (set at lock time) so the AI sees what the user
        // sees — not the raw ungraded artwork. Falls back to raw if grade was neutral.
        : (lockedGradedPreview ?? previewImage)
          ? [(lockedGradedPreview ?? previewImage)!]
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
  // Job ID: stable UUID per user-initiated generation session (preview / compare / group / single).
  const jobIdRef = useRef<string | null>(null);
  // Prompt values captured at compare-generation time — used in selectCompareResult so that
  // previewSig reflects the prompt that actually made the comparison images, not an edited value.
  const compareStyleRef = useRef({ english: "", subject: "" });
  // Abort handle for the running in-browser card loop (group or single). Aborting cancels the
  // in-flight fetch and the loop checks it before each card, so no request leaves after stop.
  const batchAbortRef = useRef<AbortController | null>(null);
  // Async-continuation identity. Every continuation (card generate → grade/render → FileReader →
  // gallery save; background poll; background results load) captures the deck/job it started for
  // and re-checks it right before each state write or outgoing request, so work from a previous
  // deck or job can never land in the current one. deckGenRef bumps on every deck reset
  // (startNewDeck / unlockStyle); bgJobRef mirrors bgJobId plus the deck that launched the job.
  const deckGenRef = useRef(0);
  const bgJobRef = useRef<{ id: string; deck: number } | null>(null);
  function setBgJob(job: { id: string; deck: number } | null) {
    bgJobRef.current = job;
    setBgJobId(job?.id ?? null);
  }
  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);
  useEffect(
    () => () => {
      batchAbortRef.current?.abort(); // leaving the page must not keep paying for cards
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
    const jobId = bgJobId;
    const isCurrentJob = () => bgJobRef.current?.id === jobId;
    const interval = setInterval(async () => {
      try {
        if (!isCurrentJob()) { clearInterval(interval); return; }
        const res = await fetch(`/api/tools/tarot/batch/${jobId}`, {
          headers: { ...roleHeader("operator") },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; job?: { status: string; completedCards: number; totalCards: number } };
        // A poll that was in flight when the job was cleared/replaced must not resurrect it.
        if (!isCurrentJob()) { clearInterval(interval); return; }
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
    if (!hasSelectedModel) {
      setMessage("請先在右側面板選擇一個圖片模型");
      return false;
    }
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
    jobIdRef.current = crypto.randomUUID();
    // An AI edit landing meanwhile (onEditedImage → unlockStyle) bumps the deck; this response is then stale.
    const deck = deckGenRef.current;
    try {
      const resp = await callGenerate({
        model: activeModel,
        prompt: buildCardPrompt(PREVIEW_CARD, { styleResolved: effectiveEnglish, subject: subjectText }),
        referenceImages: mode === "image" ? referenceImages.slice(0, maxRefs) : [],
        seed: null,
        printQuality: true,
        _jobId: jobIdRef.current,
      });
      if (deckGenRef.current !== deck) return;
      if (!resp.ok || !resp.image) {
        setMessage(`預覽生成失敗：${resp.error ?? "unknown"}`);
        return;
      }
      setPreviewImage(resp.image);
      setPreviewSeed(resp.seed ?? null);
      setPreviewSig(`${activeModel}::${effectiveEnglish.trim()}::subj=${subjectText.trim()}::refs=${referenceImages.length}`);
      // Save colour-graded preview to gallery (Bug 1 fix: raw resp.image ≠ what user sees).
      const gradedPreview = !grade.neutral
        ? await applyGradeToDataUrl(resp.image, grade.params).catch(() => resp.image)
        : resp.image;
      if (deckGenRef.current !== deck) return;
      saveToGallery(gradedPreview, "tarot-preview", { model: activeModel, prompt: effectiveEnglish });
    } catch (e) {
      if (deckGenRef.current !== deck) return;
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
    jobIdRef.current = crypto.randomUUID();
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
          _jobId: jobIdRef.current,
        });
        result = { model: m, image: resp.ok && resp.image ? resp.image : null, seed: resp.ok ? (resp.seed ?? null) : null, error: resp.ok ? undefined : (resp.error ?? "unknown"), busy: false };
      } catch (e) {
        result = { model: m, image: null, seed: null, error: e instanceof Error ? e.message : String(e), busy: false };
      }
      slots[i] = result;
      if (result.image) {
        const gradedCompare = !grade.neutral
          ? await applyGradeToDataUrl(result.image, grade.params).catch(() => result.image!)
          : result.image;
        saveToGallery(gradedCompare, "tarot-compare", { model: m, prompt });
      }
      if (compareGenIdRef.current === genId) {
        setCompareResults([...slots]); // update incrementally — completed cards appear immediately
      }
    }
    if (compareGenIdRef.current === genId) setCompareBusy(false);
  }

  // Pick a comparison result as the active preview → selects model + auto-locks (no extra button needed).
  async function selectCompareResult(r: CompareResult) {
    if (!r.image) return;
    const newModel = r.model;
    compareGenIdRef.current++; // invalidate any in-flight compare so it won't repopulate after lock
    // The invalidated loop skips its own setCompareBusy(false), so clear it here — otherwise the
    // compare button stays 「生成中…」 for the rest of the page's life.
    setCompareBusy(false);
    const { english, subject } = compareStyleRef.current; // use prompt that produced these images
    const gradedSelected = !grade.neutral
      ? await applyGradeToDataUrl(r.image, grade.params).catch(() => r.image!)
      : r.image;
    saveToGallery(gradedSelected, "tarot-preview", { model: newModel, prompt: english });
    setLockedGradedPreview(!grade.neutral ? gradedSelected : null);
    setPreviewImage(r.image);
    setPreviewSeed(r.seed);
    setSelectedModels(new Set([newModel]));
    setLockedModel(newModel);
    setPreviewSig(`${newModel}::${english.trim()}::subj=${subject.trim()}::refs=${referenceImages.length}`);
    setCompareResults([]);
    setCompareZoom(null);
    // Selecting from comparison means "I want this style" → auto-lock and proceed to batch step
    setLocked(true);
    startNewDeck();
  }

  // Fresh 78-slot deck after a (re)lock. A finished background job belongs to the previous deck:
  // its done/error panel hides 「背景生成全 78 張」, so drop it. A running job is kept (still paid).
  // A running job keeps its own deck id, so its results never merge into this new deck (loadBatchResults).
  function startNewDeck() {
    deckGenRef.current++;
    setBatch((prev) => {
      prev.forEach((it) => it.url && URL.revokeObjectURL(it.url));
      return TAROT_CARDS.map((card) => ({ card, status: "idle" }));
    });
    setSavedArt(new Set()); // new deck — drop stale "已存無框圖" marks
    if (bgStatus === "done" || bgStatus === "error") {
      setBgJob(null);
      setBgStatus("idle");
      setBgProgress({ done: 0, total: 0 });
    }
    setMessage(null);
  }

  // Unlock = back to step 1. Stops any running card loop first so it cannot keep writing into
  // (and paying for) a deck that is about to be replaced.
  function unlockStyle() {
    deckGenRef.current++;
    stopBatch();
    setLocked(false);
  }

  function stopBatch() {
    if (!batchAbortRef.current) return;
    batchAbortRef.current.abort();
    setBatchStopping(true);
  }

  async function lockStyle() {
    if (!previewImage) return;
    // NOTE: do NOT saveToGallery here — whichever path produced previewImage already saved it:
    // generatePreview + selectCompareResult save "tarot-preview", the AI quick-edit saves
    // "tarot-preview-edit". Locking is a UI state transition, not a new generation; re-saving
    // created a duplicate gallery entry (identical bits when grade is neutral). We still bake
    // gradedLock for lockedGradedPreview (the in-memory deck reference).
    const gradedLock = !grade.neutral
      ? await applyGradeToDataUrl(previewImage, grade.params).catch(() => previewImage!)
      : previewImage;
    setLockedGradedPreview(!grade.neutral ? gradedLock : null);
    setLockedModel(activeModel); // freeze which model is used for batch generation
    setLocked(true);
    setCompareResults([]);
    startNewDeck();
  }

  function patchItem(index: number, patch: Partial<BatchItem>) {
    setBatch((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  // Fire-and-forget save to R2 gallery — never blocks generation or UI.
  // styleTags (the picked zh chips) + subject ride along so the gallery can show what was
  // selected and build a meaningful filename. Read from current state — for compare's async
  // loop the chips rarely change mid-run, same posture as lockedModel below.
  // POST one image to the gallery; resolves true on a 2xx, false on any failure (never throws).
  // Shared by the fire-and-forget saveToGallery and the modal "存無框圖" button (which awaits
  // the boolean to show saving / saved / failed feedback).
  function postDesign(image: string, source: string, extra?: { cardName?: string; prompt?: string; model?: string }): Promise<boolean> {
    return fetch("/api/tools/designs", {
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
    })
      .then((r) => r.ok)
      .catch(() => false);
  }

  // Fire-and-forget save — never blocks generation or UI.
  function saveToGallery(image: string, source: string, extra?: { cardName?: string; prompt?: string; model?: string }) {
    void postDesign(image, source, extra);
  }

  // seedOverride: omit → use the locked deck seed (previewSeed) for first-fill consistency.
  // Pass an explicit fresh seed for *regeneration* — deterministic models (FLUX go_fast:false,
  // ideogram v2a/v3) reproduce the identical image from the same seed, so reusing previewSeed
  // made "重新生成" silently no-op. A new seed forces a genuinely different result.
  async function generateOne(card: TarotCard, index: number, seedOverride: number | null | undefined, run: CardRun): Promise<void> {
    const { signal } = run;
    // Same deck and not stopped — checked before every state write and outgoing request below.
    const live = () => !signal.aborted && deckGenRef.current === run.deck;
    if (!live()) return;
    patchItem(index, { status: "pending", error: undefined });
    try {
      const resp = await callGenerate({
        model: lockedModel,
        prompt: buildCardPrompt(card, { styleResolved: effectiveEnglish, subject: subjectText }),
        referenceImages: lockedRefs,
        seed: seedOverride !== undefined ? seedOverride : previewSeed,
        printQuality: true,
        _jobId: jobIdRef.current,
      }, signal);
      if (!live()) throw new DOMException("stale card run", "AbortError");
      if (!resp.ok || !resp.image) {
        patchItem(index, { status: "error", error: resp.error ?? "unknown" });
        return;
      }
      // Bake the full colour grade (Fabric: gamma/sharpen/balance included) into the artwork
      // first; then composite into the print card frame — all 10 sliders applied, not just CSS dims.
      const artForPrint = !grade.neutral
        ? await applyGradeToDataUrl(resp.image, grade.params).catch(() => resp.image)
        : resp.image;
      const blob = await renderPrintCard(card, artForPrint, template);
      const url = URL.createObjectURL(blob);
      // Gallery-sized copy of the frameless art (capped WebP) for the on-demand "存無框圖" save —
      // keeps a raw 2K PNG (which can exceed the gallery API's ~9MB limit → 413) safely under it,
      // and shrinks what we retain in React state. The full-res artForPrint is still used for the
      // printable card above; only this collected copy is capped.
      const galleryArt = await toGalleryArt(artForPrint);
      // Stopped or deck replaced during grade/render: drop the result (catch restores the slot).
      if (!live()) {
        URL.revokeObjectURL(url);
        throw new DOMException("stale card run", "AbortError");
      }
      // Save the colour-graded card to gallery (洞2 fix): previously saved raw resp.image BEFORE
      // renderPrintCard, so the gallery always got the ungraded original. Now we convert the graded
      // blob to a data URL and save that — gallery and download are always in sync.
      // live() is re-checked inside the async read: stop can land between here and onload.
      void new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      }).then((dataUrl) => {
        if (!live()) return;
        saveToGallery(dataUrl, "tarot", {
          cardName: card.name,
          prompt: buildCardPrompt(card, { styleResolved: effectiveEnglish, subject: subjectText }),
        });
      });
      // Retain the gallery-sized frameless artwork so the large-view modal can save it to My Designs
      // on demand — the user collects only the pictures she likes, no auto-flooding the gallery.
      // revoke any prior url for this slot (retry case) before replacing
      setBatch((prev) =>
        prev.map((it, i) => {
          if (i !== index) return it;
          if (it.url) URL.revokeObjectURL(it.url);
          return { ...it, status: "done", blob, url, art: galleryArt, error: undefined };
        }),
      );
      // Fresh art for this slot — clear any prior "已存無框圖" mark so the new art can be saved.
      setSavedArt((prev) => {
        if (!prev.has(index)) return prev;
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    } catch (e) {
      // Deck replaced: the slots this run knew are gone — write nothing.
      if (deckGenRef.current !== run.deck) return;
      if (signal.aborted) {
        // Stopped mid-card: not a failure. A slot that already had art goes back to done.
        setBatch((prev) => prev.map((it, i) => (i === index ? { ...it, status: it.url ? "done" : "idle", error: undefined } : it)));
        return;
      }
      patchItem(index, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Shared lifecycle for every in-browser card run: one AbortController, busy flags always
  // cleared in finally (also after stop / error), so the next action works without a reload.
  async function runCardLoop(work: (run: CardRun) => Promise<void>): Promise<boolean> {
    const ctrl = new AbortController();
    const run: CardRun = { signal: ctrl.signal, deck: deckGenRef.current };
    batchAbortRef.current = ctrl;
    jobIdRef.current = crypto.randomUUID();
    setBatchBusy(true);
    setBatchStopping(false);
    setMessage(null);
    try {
      await work(run);
    } finally {
      // Only the current run owns the busy flags; a superseded run must not clear a newer one's.
      if (batchAbortRef.current === ctrl) {
        batchAbortRef.current = null;
        setBatchBusy(false);
        setBatchStopping(false);
      }
    }
    // A stopped run whose deck is still current reports the stop; a replaced deck says nothing.
    return ctrl.signal.aborted && deckGenRef.current === run.deck;
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
    const stopped = await runCardLoop(async (run) => {
      for (const t of targets) {
        if (run.signal.aborted || deckGenRef.current !== run.deck) break;
        // "重新生成全組" (skipDone=false) redoes already-done cards → needs a fresh seed each,
        // else deterministic models reproduce the same images. "填補未完成" (skipDone=true) is
        // first-fill → keep the deck seed (previewSeed) for cross-card consistency.
        await generateOne(t.it.card, t.i, skipDone ? undefined : Math.floor(Math.random() * 1_000_000_000), run);
      }
    });
    if (stopped) setMessage("已停止。生成好的牌都保留，可下載 ZIP。");
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
    const deck = deckGenRef.current; // the job belongs to this deck even if it is relocked mid-request
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
      setBgJob({ id: data.jobId, deck });
      setBgStatus("running");
      setMessage(`背景批次已啟動 (job: ${data.jobId.slice(0, 8)}) — 可關閉瀏覽器，8 秒自動更新進度。`);
    } catch (e) {
      setMessage(`背景批次失敗：${e instanceof Error ? e.message : String(e)}`);
      setBgStatus("idle");
    }
  }

  // Load results from a completed background batch into the local batch grid.
  // Results merge only into the deck that launched the job. A job from a previous deck (style was
  // relocked while it ran) is dropped with a message instead of filling the new deck by card index.
  async function loadBatchResults() {
    const job = bgJobRef.current;
    if (!job) return;
    const isCurrent = () => bgJobRef.current?.id === job.id && deckGenRef.current === job.deck;
    if (!isCurrent()) {
      setBgJob(null);
      setBgStatus("idle");
      setBgProgress({ done: 0, total: 0 });
      setMessage(`背景批次 ${job.id.slice(0, 8)} 是上一副牌（風格已重新鎖定）產生的，不載入到目前這副牌。`);
      return;
    }
    setBgLoadBusy(true);
    setMessage("載入背景批次結果中…");
    try {
      const res = await fetch(`/api/tools/tarot/batch/${job.id}`, {
        headers: { ...roleHeader("operator") },
      });
      const data = (await res.json()) as {
        ok: boolean;
        job?: { results: Array<{ cardIndex: number; cardName: string; url: string }> };
        error?: string;
      };
      if (!isCurrent()) return; // deck or job changed while loading
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
      if (isCurrent()) setMessage(`載入失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBgLoadBusy(false);
    }
  }

  // Generate (or regenerate) a single card — fast, no confirm.
  async function generateSingle(index: number) {
    if (batchBusy) return;
    const stopped = await runCardLoop(async (run) => {
      // Always a fresh seed: this button is "regenerate this card", whether the slot was blank
      // or already done. Without a new seed, deterministic models redraw the identical image.
      await generateOne(batch[index].card, index, Math.floor(Math.random() * 1_000_000_000), run);
    });
    if (!stopped) setMessage("✓ 已重新生成");
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
      const deckParams = grade.neutral ? null : grade.params;
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
            const gradedArt = deckParams
              ? await applyGradeToDataUrl(artDataUrl, deckParams).catch(() => artDataUrl)
              : artDataUrl;
            const printBlob = await renderPrintCard(it.card, gradedArt, template);
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
    <div style={{ display: "flex", minHeight: "calc(100vh - 52px)", alignItems: "flex-start" }}>

      {/* ── LEFT: main content ── */}
      <div style={{ flex: 1, minWidth: 0, padding: "16px 16px 32px" }}>

        {message && (
          <div className="form-message" style={{ marginBottom: 12 }}>
            {message}
          </div>
        )}

        {/* Empty state */}
        {!previewImage && !locked && compareResults.length === 0 && (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: 420, gap: 16, textAlign: "center",
              border: "1px dashed var(--card-border)", borderRadius: 16,
              padding: 40, background: "rgba(99,102,241,0.03)",
            }}
          >
            <div style={{ fontSize: 64, lineHeight: 1 }}>🔮</div>
            <h1 style={{ fontSize: 20, margin: 0 }}>塔羅牌印刷檔生成工具</h1>
            <p className="form-hint" style={{ maxWidth: 360 }}>
              在右側選擇圖片模型 → 選風格 → 點「生成預覽」查看效果 → 滿意後鎖定，整套 78 張同風格生成
            </p>
            {!hasSelectedModel && (
              <div
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)",
                  color: "var(--yellow)", fontSize: 13,
                }}
              >
                ← 請先在右側選擇一個圖片模型
              </div>
            )}
          </div>
        )}

        {/* Compare results */}
        {compareResults.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
              比較結果（點圖放大 · 點「選這個」進入整套生成）
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {compareResults.map((r) => (
                <div key={r.model} style={{ textAlign: "center", maxWidth: 220 }}>
                  {r.busy ? (
                    <div
                      style={{
                        width: 180, height: 270, display: "flex", alignItems: "center",
                        justifyContent: "center", border: "1px solid var(--card-border)",
                        borderRadius: 8, fontSize: 13, color: "var(--text-muted)",
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
                    <div style={{ fontSize: 12, color: "var(--red)", width: 180 }}>
                      {modelOption(r.model).label}
                      <br />⚠ {r.error ?? "失敗"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
        {previewImage && (
          <div className="card" style={{ marginBottom: 16 }}>
            {previewStale && (
              <div
                style={{
                  marginBottom: 10, padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--yellow)", background: "var(--build-risk-medium-bg)",
                  color: "var(--build-risk-medium-text)", fontSize: 13,
                }}
              >
                ⚠ 風格或模型已變更，預覽仍是<strong>舊圖</strong>。在右側點「重新生成預覽」套用。
              </div>
            )}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div
                onClick={() => setPreviewZoom(true)}
                title="點擊放大"
                style={{ cursor: "zoom-in", border: "1px solid var(--card-border)", borderRadius: 10, lineHeight: 0 }}
              >
                <GradedPreview image={previewImage} params={grade.params} maxWidth={260} maxHeight={390} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="form-hint" style={{ marginBottom: 8 }}>
                  預覽牌：{PREVIEW_CARD.name}{previewSeed != null ? ` · seed ${previewSeed}` : ""}
                </div>
                {!locked ? (
                  <button className="btn-primary" onClick={lockStyle}>
                    ✓ 鎖定這個風格，進入整套生成
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={unlockStyle}>
                    解除鎖定，重新設計
                  </button>
                )}
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
                    hideQuickEdit
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: batch grid */}
        {locked &&
          (() => {
            const groupItems = batch.map((it, i) => ({ it, i })).filter(({ it }) => inGroup(it.card, group));
            const groupDone = groupItems.filter(({ it }) => it.status === "done").length;
            const groupPending = groupItems.filter(({ it }) => it.status !== "done").length;
            return (
              <div className="card">
                <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>整套生成 · Step 2</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {GROUPS.map((g) => {
                    const active = group === g.key;
                    return (
                      <button
                        key={g.key}
                        onClick={() => setGroup(g.key)}
                        disabled={batchBusy}
                        style={{ ...chipStyle(active), cursor: batchBusy ? "default" : "pointer" }}
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
                  {batchBusy && (
                    <button className="btn-secondary" onClick={stopBatch} disabled={batchStopping} title="停止，已生成的牌保留">
                      {batchStopping ? "停止中…" : "■ 停止"}
                    </button>
                  )}
                  {groupDone > 0 && (
                    <button
                      className="btn-secondary"
                      onClick={() => void generateGroup(false)}
                      disabled={batchBusy}
                      title="重新生成這組所有牌"
                    >
                      重新生成全組
                    </button>
                  )}
                  <button className="btn-secondary" onClick={downloadZip} disabled={zipBusy || doneCount === 0}>
                    {zipBusy ? "打包中…" : `下載 ZIP（${doneCount} 張）`}
                  </button>
                  <span className="form-hint">
                    這組 {groupDone}/{groupItems.length} · 全部 {doneCount}/{TAROT_CARDS.length}
                  </span>
                </div>
                {/* Background batch */}
                <div
                  style={{
                    display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                    marginBottom: 8, padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--card-border)", background: "rgba(99,102,241,0.04)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>⚡ 背景批次（78 張）</span>
                  {bgStatus === "idle" && (
                    <button
                      className="btn-secondary"
                      disabled={batchBusy}
                      onClick={() => void startBackgroundBatch()}
                      style={{ fontSize: 12 }}
                    >
                      🚀 背景生成全 78 張
                    </button>
                  )}
                  {(bgStatus === "pending" || bgStatus === "running") && (
                    <span style={{ fontSize: 12, color: "var(--accent)" }}>
                      進行中 {bgProgress.done}/{bgProgress.total} 張…
                      {bgJobId && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>job: {bgJobId.slice(0, 8)}</span>}
                    </span>
                  )}
                  {bgStatus === "done" && (
                    <>
                      <span style={{ fontSize: 12, color: "var(--green)" }}>✅ 完成 {bgProgress.done}/{bgProgress.total} 張</span>
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
                      <span style={{ fontSize: 12, color: "var(--red)" }}>❌ 部分失敗 {bgProgress.done}/{bgProgress.total}</span>
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
                  💡 點<b>已完成</b>的卡查看大圖（可重新生成）。點<b>空白卡</b>生成那一張。
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
                        width: 132, height: 219, borderRadius: 8,
                        border: `1px solid ${it.card.colors[0]}55`,
                        background: it.card.colors[1],
                        position: "relative", overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: it.card.colors[0], textAlign: "center",
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
      </div>

      {/* ── RIGHT: sticky settings accordion ── */}
      <div
        style={{
          width: 360, flexShrink: 0,
          position: "sticky", top: 0, alignSelf: "flex-start",
          maxHeight: "100vh", overflowY: "auto",
          borderLeft: "1px solid var(--card-border)",
          padding: "12px 12px 32px",
        }}
      >
        {/* ── 未選模型全域警示（頂部） ── */}
        {!isMultiModel && !hasSelectedModel && (
          <div style={{
            marginBottom: 10,
            padding: "8px 12px",
            borderRadius: 7,
            border: "1.5px solid var(--yellow)",
            background: "rgba(234,179,8,0.09)",
            fontSize: 12, color: "var(--yellow)",
            fontWeight: 600, textAlign: "center",
          }}>
            ⚠️ 請先在下方「圖片模型」選一個模型
          </div>
        )}

        {/* Locked: every setting below is disabled on purpose (one deck = one style). Say so and
            offer the way back here — the only other unlock button sits in the left preview card. */}
        {locked && (
          <div style={{
            marginBottom: 10, padding: "8px 12px", borderRadius: 7,
            border: "1px solid var(--card-border)", background: "rgba(99,102,241,0.06)",
            fontSize: 12, color: "var(--text-muted)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ flex: 1 }}>🔒 風格已鎖定，下方設定不能改。</span>
            <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={unlockStyle}>
              解除鎖定
            </button>
          </div>
        )}

        {/* Compare-mode generate button — single-model preview button lives in 調色/修圖 panel */}
        {isMultiModel && (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={generateCompare}
              disabled={compareBusy || locked}
            >
              {compareBusy ? `生成中… (${selectedModels.size} 模型)` : `生成比較（${selectedModels.size}）`}
            </button>
          </div>
        )}

        {/* ── Accordion: 生成模式 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => togglePanel("mode")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>生成模式</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", marginRight: 6 }}>
              {mode === "text" ? "文字生圖" : `以圖生圖 (${referenceImages.length}張)`}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.mode ? "▲" : "▼"}</span>
          </button>
          {panelOpen.mode && (
            <div style={{ paddingBottom: 12 }}>
              {/* Mode toggle buttons */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {(["text", "image"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={locked}
                    onClick={() => setMode(m)}
                    style={{ ...chipStyle(mode === m), flex: 1, padding: "7px 0", opacity: locked ? 0.5 : 1, cursor: locked ? "default" : "pointer" }}
                  >
                    {m === "text" ? "文字生圖" : "以圖生圖"}
                  </button>
                ))}
              </div>
              {mode === "image" && (
                <>
                  {!hasSelectedModel ? (
                    <div className="form-hint" style={{ color: "var(--yellow)" }}>
                      請先在「圖片模型」選擇支援參考圖的模型（如 FLUX dev、GPT-Image-1）
                    </div>
                  ) : maxRefs === 0 ? (
                    <div className="form-hint" style={{ color: "var(--yellow)" }}>
                      ⚠ 目前選的模型不吃參考圖。改選 FLUX dev 或 GPT-Image-1。
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="form-input"
                        disabled={locked || referenceImages.length >= maxRefs}
                        onChange={(e) => { void onAddReferences(e.target.files); e.currentTarget.value = ""; }}
                      />
                      <div className="form-hint">
                        已上傳 {referenceImages.length}/{maxRefs} 張
                        {referenceImages.length >= maxRefs ? "（已達上限）" : ""}
                      </div>
                    </>
                  )}
                  {referenceImages.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {referenceImages.map((src, i) => (
                        <div key={i} style={{ position: "relative" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={`ref ${i + 1}`}
                            style={{ height: 70, borderRadius: 6, border: "1px solid var(--card-border)" }}
                          />
                          {!locked && (
                            <button
                              onClick={() => removeReference(i)}
                              style={{
                                position: "absolute", top: -6, right: -6,
                                width: 18, height: 18, borderRadius: "50%",
                                border: "none", background: "var(--red)",
                                color: "var(--btn-primary-text)", cursor: "pointer",
                                fontSize: 11, lineHeight: "18px", padding: 0,
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Accordion: 主角替換 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => togglePanel("subject")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>主角替換</span>
            <span
              style={{
                fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", marginRight: 6,
                maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {subjectText.trim() || "標準塔羅人物"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.subject ? "▲" : "▼"}</span>
          </button>
          {panelOpen.subject && (
            <div style={{ paddingBottom: 12 }}>
              <input
                className="form-input"
                placeholder="留空＝標準塔羅人物。例：a fluffy orange cat"
                value={subjectText}
                onChange={(e) => setSubjectText(e.target.value)}
                disabled={locked}
              />
              <div className="form-hint" style={{ marginTop: 4 }}>
                換掉每張牌的主角，整副 78 張同一角色。請用英文填寫。
              </div>
              {/* Nothing translates the subject: it goes verbatim into buildCardPrompt (cards.ts). */}
              {CJK_TEXT.test(subjectText) && (
                <div className="form-hint" style={{ marginTop: 2, color: "var(--yellow)" }}>
                  ⚠ 含中日韓文字：FLUX 等模型讀不懂，主角可能不會換。請改英文，例：a blue cat
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Accordion: 外框模板 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => togglePanel("template")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>外框模板</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", marginRight: 6 }}>
              {CARD_TEMPLATES.find((t) => t.key === template)?.label ?? template}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.template ? "▲" : "▼"}</span>
          </button>
          {panelOpen.template && (
            <div style={{ paddingBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CARD_TEMPLATES.map((t) => {
                  const active = template === t.key;
                  return (
                    <div key={t.key} onClick={() => setTemplate(t.key)} style={{ cursor: "pointer", textAlign: "center" }}>
                      {templateThumbs[t.key] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={templateThumbs[t.key]}
                          alt={t.label}
                          style={{
                            width: 78, height: 129, borderRadius: 5, objectFit: "cover",
                            border: active ? "2px solid var(--accent)" : "1px solid var(--card-border)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 78, height: 129, borderRadius: 5,
                            border: `${active ? 2 : 1}px solid ${active ? "var(--accent)" : "var(--card-border)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18, opacity: 0.5,
                          }}
                        >
                          …
                        </div>
                      )}
                      <div style={{ fontSize: 11, marginTop: 4, color: active ? "var(--accent)" : "var(--text-muted)" }}>
                        {t.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="form-hint" style={{ marginTop: 6 }}>
                每張牌都會套這個框 + 自動加牌名。
              </div>
            </div>
          )}
        </div>

        {/* ── Accordion: 圖片模型 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => togglePanel("model")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>圖片模型</span>
            <span
              style={{
                fontSize: 11, color: hasSelectedModel ? "var(--accent)" : "var(--text-muted)",
                marginLeft: "auto", marginRight: 6,
                maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {hasSelectedModel
                ? [...selectedModels].map((m) => modelOption(m).label).join(" + ")
                : "未選擇"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.model ? "▲" : "▼"}</span>
          </button>
          {panelOpen.model && (
            <div style={{ paddingBottom: 12 }}>
              {/* Provider tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
                {MODEL_GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setModelProviderTab(g)}
                    style={tabStyle(modelProviderTab === g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {/* Model rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {MODEL_OPTIONS.filter((o) => o.group === modelProviderTab).map((o) => {
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
                            next.delete(o.value);
                          } else {
                            next.add(o.value);
                          }
                          return next;
                        });
                      }}
                      title={`~NT$${o.costNt}/張${o.maxRefs > 0 ? `，最多 ${o.maxRefs} 張參考圖` : "，純文字"}`}
                      style={{
                        ...chipStyle(active),
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px",
                        color: active ? "var(--accent)" : "var(--text)",
                        opacity: locked ? 0.5 : 1,
                        cursor: locked ? "default" : "pointer",
                      }}
                    >
                      <span>{active ? "✓ " : ""}{o.label}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        NT${o.costNt}{o.maxRefs > 0 ? ` · ${o.maxRefs}ref` : " · text"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isMultiModel && (
                <div className="form-hint" style={{ marginTop: 6 }}>
                  已選 {selectedModels.size} 個模型 → 用「生成比較」同時比較
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Accordion: 風格 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => togglePanel("style")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>風格</span>
            <span
              style={{
                fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", marginRight: 6,
                maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {styleTokens.length > 0
                ? styleTokens.slice(0, 2).join("、") + (styleTokens.length > 2 ? `…+${styleTokens.length - 2}` : "")
                : "未選擇"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.style ? "▲" : "▼"}</span>
          </button>
          {panelOpen.style && (
            <div style={{ paddingBottom: 12 }}>
              {/* Group tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                {STYLE_GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setStyleGroupTab(g)}
                    style={tabStyle(styleGroupTab === g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {/* Chips */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                {STYLE_PRESETS.filter((p) => p.group === styleGroupTab).map((p) => {
                  const selected = styleTokens.includes(p.zh);
                  const hasDesc = p.zh.includes("｜");
                  const desc = hasDesc ? p.zh.split("｜")[1] : null;
                  // Hover handlers live on the SPAN (not the button): a disabled button
                  // does not fire mouse events, so the tooltip would die while locked.
                  const showTip = (e: React.MouseEvent<HTMLElement>) => {
                    if (!desc) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setStyleTip({ text: desc, x: r.left + r.width / 2, y: r.top });
                  };
                  return (
                    <span
                      key={p.zh}
                      style={{ display: "inline-block" }}
                      onMouseEnter={showTip}
                      onMouseLeave={() => setStyleTip(null)}
                    >
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          setStylePrompt((prev) => {
                            const toks = prev.split(",").map((s) => s.trim()).filter(Boolean);
                            const i = toks.indexOf(p.zh);
                            if (i >= 0) toks.splice(i, 1);
                            else toks.push(p.zh);
                            return toks.join(", ");
                          })
                        }
                        style={{
                          ...chipStyle(selected),
                          cursor: locked ? "default" : "pointer",
                          // pointerEvents:none while locked lets the hover reach the span
                          pointerEvents: locked ? "none" : "auto",
                          opacity: locked ? 0.5 : 1,
                        }}
                      >
                        {selected ? "✓ " : ""}{p.zh.split("｜")[0]}
                      </button>
                    </span>
                  );
                })}
              </div>
              <textarea
                className="form-textarea"
                style={{ minHeight: 52, fontSize: 12 }}
                placeholder="點上方選風格，或自行輸入中文"
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                disabled={locked}
              />
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>🎨 送給模型的英文</span>
                  <button title={why("tarot.prompt")}
                    type="button"
                    disabled={(locked || suggestBusy) || !canUse("tarot.prompt")}
                    onClick={() => void suggestPrompt()}
                    style={{ ...ghostBtn(), cursor: locked || suggestBusy ? "default" : "pointer", opacity: locked || suggestBusy ? 0.5 : 1 }}
                  >
                    {suggestBusy ? "✨ AI 生成中…" : "✨ 幫我想 prompt"}
                  </button>
                  {styleEnglishEdited && (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => { setStyleEnglish(""); setStyleEnglishEdited(false); }}
                      style={{ ...ghostBtn(), cursor: locked ? "default" : "pointer", opacity: locked ? 0.5 : 1 }}
                    >
                      ↻ 重設
                    </button>
                  )}
                </div>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 72, fontSize: 11, background: "rgba(99,102,241,0.06)" }}
                  placeholder="（選風格後自動帶出；可直接修改）"
                  value={effectiveEnglish}
                  onChange={(e) => { setStyleEnglish(e.target.value); setStyleEnglishEdited(true); }}
                  disabled={locked}
                />
                {styleEnglishEdited && (
                  <div className="form-hint" style={{ color: "var(--yellow)", marginTop: 2 }}>
                    ✏ 已手動編輯英文，生成時送這段。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 生成風格預覽 button + Accordion: 調色/修圖 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          {!isMultiModel && (
            <div style={{ padding: "10px 0 6px" }}>
              <button
                className="btn-primary"
                style={{
                  width: "100%",
                  boxShadow: previewStale ? "0 0 0 3px var(--yellow)" : undefined,
                  opacity: !hasSelectedModel ? 0.45 : 1,
                }}
                onClick={generatePreview}
                disabled={previewBusy || locked || !hasSelectedModel}
              >
                {previewBusy ? "生成中…" : previewImage ? "重新生成預覽" : "生成風格預覽"}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => togglePanel("grade")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>調色 / 修圖</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.grade ? "▲" : "▼"}</span>
          </button>
          {panelOpen.grade && (
            <div style={{ paddingBottom: 12 }}>
              <ColorGradePanel state={grade.state} onSet={grade.set} onReset={grade.reset} neutral={grade.neutral} />
            </div>
          )}
        </div>

        {/* ── Accordion: 快速編輯 ── */}
        <div style={{ borderTop: "1px solid var(--card-border)" }}>
          <button
            type="button"
            onClick={() => togglePanel("edit")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", background: "none", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text)",
            }}
          >
            <span>快速編輯</span>
            <span style={{ fontSize: 11, color: previewImage ? "var(--accent)" : "var(--text-muted)", marginLeft: "auto", marginRight: 6 }}>
              {previewImage ? "AI 修圖" : "需先生成預覽"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{panelOpen.edit ? "▲" : "▼"}</span>
          </button>
          {panelOpen.edit && (
            <div style={{ paddingBottom: 12 }}>
              {!previewImage ? (
                <div className="form-hint" style={{ color: "var(--text-muted)" }}>
                  請先在左側生成預覽圖，再使用快速編輯。
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: "100%", marginBottom: 10 }}
                    onClick={() =>
                      openInCanvas(
                        previewImage,
                        buildSemanticBase({
                          product: "塔羅卡",
                          subject: subjectText.trim() || undefined,
                          style: stylePrompt.trim() || undefined,
                          track: "編輯",
                        }),
                      )
                    }
                  >
                    ✏️ 在 Canvas 編輯
                  </button>
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
                    onEditedImage={async (image, meta) => {
                      setSelectedModels(new Set<TarotModel>([meta.model as TarotModel]));
                      setPreviewImage(image);
                      setLockedGradedPreview(null); // edit resets lock; graded set at next lockStyle()
                      setPreviewSeed(meta.seed);
                      setPreviewSig(`${meta.model}::${meta.prompt}::edit=1`);
                      unlockStyle(); // also stops a running card loop — its deck is dropped below
                      setBatch((prev) => {
                        prev.forEach((it) => it.url && URL.revokeObjectURL(it.url));
                        return [];
                      });
                      const gradedEdit = !grade.neutral
                        ? await applyGradeToDataUrl(image, grade.params).catch(() => image)
                        : image;
                      saveToGallery(gradedEdit, "tarot-preview-edit", { model: meta.model, prompt: meta.prompt });
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Modals ── */}
      {viewIndex != null && batch[viewIndex]?.url && (
        <div
          onClick={() => setViewIndex(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
          >
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
                <div
                  style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 16, fontWeight: 600, gap: 10,
                  }}
                >
                  <div style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>⏳</div>
                  生成中，請稍候…
                </div>
              )}
            </div>
            {batch[viewIndex].status === "error" && (
              <div style={{ color: "var(--red)", fontSize: 13 }}>
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
              {batch[viewIndex].status === "done" && batch[viewIndex].art && (
                <button
                  className="btn-secondary"
                  disabled={savingArt || savedArt.has(viewIndex)}
                  title="把這張圖（不含牌框 / 標題 / 羅馬數字）存進 My Designs"
                  onClick={async () => {
                    const idx = viewIndex;
                    if (idx == null) return;
                    const item = batch[idx];
                    if (!item?.art || savingArt || savedArt.has(idx)) return;
                    setSavingArt(true);
                    const ok = await postDesign(item.art, "tarot-art", {
                      cardName: item.card.name,
                      prompt: buildCardPrompt(item.card, { styleResolved: effectiveEnglish, subject: subjectText }),
                    });
                    setSavingArt(false);
                    if (ok) setSavedArt((prev) => new Set(prev).add(idx));
                    else setMessage("無框圖儲存失敗，請稍後再試。");
                  }}
                >
                  {savingArt ? "儲存中…" : savedArt.has(viewIndex) ? "✓ 已存無框圖" : "🖼 存無框圖"}
                </button>
              )}
              <button className="btn-secondary" onClick={() => setViewIndex(null)}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {compareZoom && (
        <div
          onClick={() => setCompareZoom(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 24, cursor: "zoom-out",
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

      {previewZoom && previewImage && (
        <div
          onClick={() => setPreviewZoom(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 24, cursor: "zoom-out",
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

      {/* Style-chip hover tooltip — position:FIXED at the viewport coords captured on
          chip hover. Rendered here at the component root (a sibling of the sticky
          sidebar) so it escapes the sidebar's overflowY:auto clipping AND its
          position:sticky stacking context. Hard-coded colors (no CSS var) keep it
          readable in any theme; x is clamped so edge chips don't push it off-screen. */}
      {styleTip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(styleTip.x, 8), (typeof window !== "undefined" ? window.innerWidth : 1920) - 8),
            top: styleTip.y - 6,
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
          {styleTip.text}
        </div>
      )}
    </div>
  );
}
