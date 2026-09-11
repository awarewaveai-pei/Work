"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VIDEO_PIPELINE_STEPS, computeVideoCost } from "@/lib/content/video/video-cost";
import { IMAGE_RATES, DEFAULT_IMAGE_MODEL } from "@/lib/ai/cost-model";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import type { VideoHistoryItem } from "@/app/api/video/history/route";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";
import { resolveStylePrompt } from "@/app/(shell)/tools/tarot/cards";
import { tabStyle, chipStyle } from "@/components/tools/panel-primitives";
import TimelineValidationPanel from "./TimelineValidationPanel";
import FootageEditor from "./FootageEditor";
import ReleaseDeliveryPanel from "./ReleaseDeliveryPanel";
import MediaOperationsPanel from "./MediaOperationsPanel";

// 影片專屬攝影風格 preset（放最前 = 預設組）。值為英文 prompt，直接送 Flux。
const VIDEO_STYLE_PRESETS: { zh: string; group: string; prompt: string }[] = [
  { zh: "電影感", group: "影片風格", prompt: "Cinematic wide-angle 16:9, dramatic lighting, rich color grade" },
  { zh: "紀錄片", group: "影片風格", prompt: "Documentary photography, natural light, authentic moment" },
  { zh: "商業攝影", group: "影片風格", prompt: "Clean commercial photography, studio lighting, professional" },
];
const VIDEO_PRESET_BY_LABEL = new Map(VIDEO_STYLE_PRESETS.map((p) => [p.zh, p.prompt]));
// 影片 preset + tarot/studio 103 風格合併（preset 在前 → 預設組）。
const VIDEO_STYLE_CATALOG = [...VIDEO_STYLE_PRESETS, ...STYLE_CATALOG];
const VIDEO_STYLE_GROUPS = Array.from(new Set(VIDEO_STYLE_CATALOG.map((s) => s.group)));

// 生圖模型廠商分組（外層 tab → 內層 chip 兩層選擇器）。
const IMAGE_VENDOR_GROUPS: Record<string, string[]> = {
  "FLUX":      ["flux-schnell", "flux-dev", "flux-kontext-dev", "flux-kontext-pro", "flux-2-max"],
  "Ideogram":  ["ideogram-v2a-turbo", "ideogram-v3-balanced", "ideogram-v4-turbo", "ideogram-v4-quality", "ideogram-character"],
  "Google":    ["nano-banana-2", "nano-banana-pro", "imagen-4"],
  "ByteDance": ["seedream-4.5"],
  "OpenAI":    ["openai-low", "openai-medium", "openai-high"],
};
function vendorForModel(model: string): string {
  for (const [v, ids] of Object.entries(IMAGE_VENDOR_GROUPS)) {
    if (ids.includes(model)) return v;
  }
  return "FLUX";
}

// preset 直接回英文 prompt；其餘走 tarot resolveStylePrompt（zh label → 英文）。
function resolveVideoStyle(label: string): string {
  return VIDEO_PRESET_BY_LABEL.get(label) ?? resolveStylePrompt(label);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const NT = (usd: number) => {
  const n = usdToNtd(usd);
  return `NT$${n.toLocaleString("zh-TW", { maximumFractionDigits: n < 1 ? 4 : n < 100 ? 2 : 0 })}`;
};
const USD = (usd: number) =>
  `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd < 0.01 ? 4 : 2 })}`;

// ─── Types ────────────────────────────────────────────────────────────────────

type GenStatus = "idle" | "loading" | "done" | "error";

interface VideoOutputs {
  outputs: Record<string, string>;
  out_dir: string;
  title: string;
}

interface DraftScene {
  id: number;
  narration: string;
  imageUrl: string;
  /** 生圖提示（英文）— 單張重生需要。 */
  imagePrompt: string;
  /** B-roll 搜尋關鍵字 — Pexels 場景重生需要。 */
  brollKeyword: string;
  /** custom = Flux AI 圖；broll = Pexels 素材 — 決定重生走哪條路。 */
  visual: "custom" | "broll";
}

interface VideoCapabilities {
  openaiTts: boolean;
}

// ─── Voice model options ──────────────────────────────────────────────────────

interface VoiceModel {
  id: string;          // "edge:VOICE" | "openai:MODEL:VOICE"
  label: string;
  lang: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  note?: string;
}

const VOICE_MODELS: VoiceModel[] = [
  { id: "edge:zh-TW-HsiaoChenNeural", label: "Edge TTS 繁中女聲", lang: "繁中", badge: "$0 免費", badgeColor: "var(--badge-green-text)", badgeBg: "var(--badge-green-bg)" },
  { id: "edge:zh-TW-YunJheNeural",    label: "Edge TTS 繁中男聲", lang: "繁中", badge: "$0 免費", badgeColor: "var(--badge-green-text)", badgeBg: "var(--badge-green-bg)" },
  { id: "edge:en-US-JennyNeural",     label: "Edge TTS English F", lang: "EN",  badge: "$0 免費", badgeColor: "var(--badge-green-text)", badgeBg: "var(--badge-green-bg)" },
  { id: "edge:en-US-GuyNeural",       label: "Edge TTS English M", lang: "EN",  badge: "$0 免費", badgeColor: "var(--badge-green-text)", badgeBg: "var(--badge-green-bg)" },
  { id: "openai:tts-1:nova",          label: "OpenAI nova",        lang: "多語", badge: "$15/1M字", badgeColor: "var(--build-risk-medium-text)", badgeBg: "var(--build-risk-medium-bg)", note: "自然、英文佳" },
  { id: "openai:tts-1:shimmer",       label: "OpenAI shimmer",     lang: "多語", badge: "$15/1M字", badgeColor: "var(--build-risk-medium-text)", badgeBg: "var(--build-risk-medium-bg)", note: "柔和女聲" },
  { id: "openai:tts-1:alloy",         label: "OpenAI alloy",       lang: "多語", badge: "$15/1M字", badgeColor: "var(--build-risk-medium-text)", badgeBg: "var(--build-risk-medium-bg)" },
  { id: "openai:tts-1:onyx",          label: "OpenAI onyx",        lang: "多語", badge: "$15/1M字", badgeColor: "var(--build-risk-medium-text)", badgeBg: "var(--build-risk-medium-bg)", note: "低沉男聲" },
  { id: "openai:tts-1-hd:nova",       label: "OpenAI nova HD",     lang: "多語", badge: "$30/1M字", badgeColor: "var(--badge-red-text)", badgeBg: "var(--badge-red-bg)", note: "HD 品質" },
];

function parseVoiceModel(id: string): { ttsProvider: string; ttsVoice: string } {
  const [provider, ...rest] = id.split(":");
  return { ttsProvider: provider, ttsVoice: rest.join(":") };
}

function estimateCharsPerScene(targetMinutes: number) {
  return targetMinutes >= 4 ? 160 : targetMinutes >= 2 ? 120 : 50;
}

function countNarrationChars(scenes: { narration: string }[]) {
  return scenes.reduce((sum, scene) => sum + scene.narration.trim().length, 0);
}

// ─── Output format label map ──────────────────────────────────────────────────

const OUTPUT_LABELS: Record<string, { label: string; ratio: string; icon: string }> = {
  "16x9": { label: "16:9 YouTube/文章",   ratio: "16:9", icon: "▶" },
  "9x16": { label: "9:16 TikTok/Reels",  ratio: "9:16", icon: "📱" },
  "4x5":  { label: "4:5 IG Feed/FB",     ratio: "4:5",  icon: "📷" },
  // 舊格式鍵（相容歷史影片顯示）
  youtube_linkedin: { label: "YouTube / LinkedIn", ratio: "16:9", icon: "▶" },
  tiktok_reels:    { label: "TikTok / Reels",     ratio: "9:16",  icon: "📱" },
  instagram_facebook: { label: "Instagram / Facebook", ratio: "1:1", icon: "📷" },
  twitter_reddit_bluesky: { label: "Twitter / Reddit / Bluesky", ratio: "16:9 短版", icon: "🐦" },
};

// 可選輸出比例（順序固定 → 勾選排序穩定；[0] = draft 預覽的主版）。每個比例各自原生生成。
const VIDEO_FORMAT_CHOICES = ["16x9", "9x16", "4x5"] as const;

// ─── Pipeline step descriptions (for progress tracker) ────────────────────────

const PROGRESS_STEPS = [
  { key: "script",  label: "腳本生成",      match: "腳本" },
  { key: "assets",  label: "素材生成",      match: "素材" },
  { key: "submit",  label: "提交渲染",      match: "提交" },
  { key: "render",  label: "TTS + ffmpeg",  match: "TTS" },
  { key: "done",    label: "完成",          match: "__done__" },
];

function getCurrentStepIndex(step: string): number {
  const idx = PROGRESS_STEPS.findIndex((s) => step.includes(s.match));
  return idx >= 0 ? idx : 0;
}

// ─── Studio tab groups（2026-09-10 IA 修正：既有 5 個平級 tab 重分組成三段，
//     不砍任何既有 tab；新增 footage/release/operations 接線既有孤兒面板；
//     「說明 & 成本」從 tab 移出 → 常駐彈窗，見 infoOpen）───────────────────
type StudioTabId = "generate" | "remotion" | "footage" | "release" | "timeline" | "history" | "operations";
const STUDIO_TAB_GROUPS: { group: string; items: { id: StudioTabId; label: string }[] }[] = [
  { group: "製作", items: [
    { id: "generate", label: "生成影片" },
    { id: "remotion", label: "Remotion 模板" },
    { id: "footage",  label: "實拍剪輯" },
  ]},
  { group: "審片與交付", items: [
    { id: "release",  label: "Release 交付" },
    { id: "timeline", label: "Timeline 驗證（進階）" },
  ]},
  { group: "營運", items: [
    { id: "history",    label: "生成記錄" },
    { id: "operations", label: "營運與成效" },
  ]},
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface VideoStudioInitial {
  topic?: string;
  articleTitle?: string;
  articleContent?: string;
  /** 深層接力：前製腳本場景（台詞→旁白、畫面→生圖提示）→ 直接出片，不重生。 */
  scenes?: { narration: string; imagePrompt: string; visual?: "custom" | "broll"; brollKeyword?: string }[];
  /** 前製腳本帶入的素材模式（pexels-video / pexels-all / __ai__） */
  mediaMode?: string;
  /** 前製腳本帶入的目標時長（分鐘） */
  duration?: number;
  /** 前製腳本帶入的 AI 生圖場景數 */
  customScenes?: number;
}

interface ScriptRemotionPrefill {
  topic: string;
  headline?: string;
  tagline?: string;
  cta?: string;
  imageHint?: string;
  scenes?: { visual: string; dialogue: string }[];
  mediaMode?: string;
  duration?: number;
  customScenes?: number;
}

interface VideoStudioEmbedded {
  /** 鎖定顯示單一內層 tab、隱藏自己的 tab bar chrome——供 VideoPipeline 當「④ 生成或選取素材」步驟內容嵌入。 */
  lockTab: StudioTabId;
  /** 該次生成完成（草稿渲染完成）時通知外層 wizard，讓它可以自動前進到下一步。 */
  onRenderComplete?: () => void;
  /**
   * wizard②選的租戶，覆蓋 render-draft 的預設租戶解析。2026-09-11 修：之前這裡完全沒有欄位可傳，
   * 渲染永遠落在伺服器端預設租戶，跟 wizard 選的不是同一個 → ⑦字幕/⑧QA/⑨Release 都找不到剛
   * 渲染好的素材（真實跑過一次才發現：wizard 選 E2E-Verify-0704，影片卻記在 AwareWave Ops）。
   */
  organizationId?: string;
}

export default function VideoStudio({ initial, remotionInitial, embedded }: { initial?: VideoStudioInitial; remotionInitial?: ScriptRemotionPrefill; embedded?: VideoStudioEmbedded } = {}) {
  // ── Config knobs ──
  const [customScenes] = useState(initial?.customScenes ?? 3);
  const [imageModel, setImageModel] = useState(() => {
    const m = initial?.mediaMode;
    if (!m || m === "__ai__") return DEFAULT_IMAGE_MODEL;
    return m; // "pexels-video" or "pexels-all"
  });
  const [imageVendor, setImageVendor] = useState(() => {
    const m = initial?.mediaMode;
    if (!m || m === "__ai__") return vendorForModel(DEFAULT_IMAGE_MODEL);
    return vendorForModel(DEFAULT_IMAGE_MODEL); // pexels: vendor unused
  });
  const [targetMinutes, setTargetMinutes] = useState(initial?.duration ?? 1);
  // Derived: ~2 scenes/min, clamped [3, 12]. When initial scenes provided, override with their length.
  const totalScenes = initial?.scenes?.length ?? Math.min(12, Math.max(3, Math.round(targetMinutes * 2)));
  const [voiceModelId, setVoiceModelId] = useState(VOICE_MODELS[0].id);
  const [videoCaps, setVideoCaps] = useState<VideoCapabilities | null>(null);
  const voiceSelection = useMemo(() => parseVoiceModel(voiceModelId), [voiceModelId]);
  const activeVoice = VOICE_MODELS.find((v) => v.id === voiceModelId) ?? VOICE_MODELS[0];
  const openAiVoiceSelected = voiceSelection.ttsProvider === "openai";
  const costVoiceSelection = openAiVoiceSelected && videoCaps?.openaiTts === false
    ? { ttsProvider: "edge", ttsVoice: "" }
    : voiceSelection;
  const isPexels = imageModel === "pexels-video" || imageModel === "pexels-all";
  // 輸出比例（預設只 16:9，WP/YouTube 用；需社群格式時手動勾選）。每比例各自原生生成 → 圖片成本/時間 ×已選數。
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(["16x9"]));
  const orderedFormats = VIDEO_FORMAT_CHOICES.filter((f) => selectedFormats.has(f));

  const brollScenes = Math.max(0, totalScenes - customScenes);
  // 深層接力：前製腳本場景（若有）→ 生成草稿時直接用，跳過 Claude 重生。
  const [providedScenes] = useState(initial?.scenes ?? []);

  const providedCustomScenes = providedScenes.filter((s) => s.visual !== "broll").length;
  const providedBrollScenes = Math.max(0, providedScenes.length - providedCustomScenes);
  const ttsCharEstimate = providedScenes.length > 0
    ? countNarrationChars(providedScenes)
    : Math.max(1, totalScenes) * estimateCharsPerScene(targetMinutes);
  // 成本：前製腳本接力已經完成文字生成，影片區只估素材/配音/渲染；Pexels 模式不計 AI 圖。
  const costBreakdown = useMemo(
    () => providedScenes.length > 0
      ? computeVideoCost({ totalScenes: providedScenes.length, customScenes: isPexels ? 0 : providedCustomScenes, brollScenes: isPexels ? providedScenes.length : providedBrollScenes, imageModel, formatCount: orderedFormats.length, includeScriptCost: false, ...costVoiceSelection, ttsChars: ttsCharEstimate })
      : computeVideoCost({ totalScenes, customScenes: Math.min(customScenes, totalScenes), brollScenes, imageModel, formatCount: orderedFormats.length, ...costVoiceSelection, ttsChars: ttsCharEstimate }),
    [providedScenes, providedCustomScenes, providedBrollScenes, isPexels, totalScenes, customScenes, brollScenes, imageModel, orderedFormats.length, costVoiceSelection, ttsCharEstimate],
  );

  // ── Generate form ── (initial = 從 ScriptForge「送去生產」帶入的腳本預填)
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [articleTitle, setArticleTitle] = useState(initial?.articleTitle ?? "");
  const [articleContent, setArticleContent] = useState(initial?.articleContent ?? "");
  const [language, setLanguage] = useState("繁體中文");
  const [videoStyle, setVideoStyle] = useState("");
  const [videoStyleGroup, setVideoStyleGroup] = useState(VIDEO_STYLE_GROUPS[0] ?? "");
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genStep, setGenStep] = useState("");
  const [genError, setGenError] = useState("");
  const [genResult, setGenResult] = useState<VideoOutputs | null>(null);

  // ── Draft state ──
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftScenes, setDraftScenes] = useState<DraftScene[]>([]);
  // draft 各格式原生圖組（render 時送回；主格式那組以 draftScenes.imageUrl 覆蓋以反映編輯/重生/上傳）。
  const [draftFormatUrls, setDraftFormatUrls] = useState<Record<string, string[]>>({});
  const [draftFormats, setDraftFormats] = useState<string[]>([]);
  const [draftPreviewFormat, setDraftPreviewFormat] = useState("");
  const [draftR2Keys, setDraftR2Keys] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [regenIds, setRegenIds] = useState<Set<number>>(new Set()); // 場景忙碌中的 id（單張重生 或 上傳中）
  const draftReady = draftScenes.length > 0;

  // ── History ──
  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoHistoryItem | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [deletingVideos, setDeletingVideos] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTabId>(embedded?.lockTab ?? (remotionInitial ? "remotion" : "generate"));
  // 說明&成本已從步驟移出（2026-09-10 IA 修正：獨立可及，不佔生產流程），改用彈窗，跟 studioTab 分開追蹤。
  const [infoOpen, setInfoOpen] = useState(false);

  // Auto-switch to Remotion tab when a script prefill arrives from ScriptForge (standalone use only —
  // embedded/wizard use pins the tab via embedded.lockTab, which owns tab selection instead).
  useEffect(() => { if (remotionInitial && !embedded) setStudioTab("remotion"); }, [remotionInitial, embedded]);
  // wizard 嵌入時，外層 step 切換到別的模式可能重掛載同一個 VideoStudio 實例；lockTab 改變時同步跟上。
  useEffect(() => { if (embedded?.lockTab) setStudioTab(embedded.lockTab); }, [embedded?.lockTab]);
  // 草稿渲染完成通知 wizard，讓它能自動前進到下一步（Timeline 背景驗證）。
  useEffect(() => { if (embedded?.onRenderComplete && genStatus === "done") embedded.onRenderComplete(); }, [genStatus, embedded]);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRenderingRef = useRef(false);

  // clear poll timer on unmount
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  // load history on mount
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/video/history?limit=20");
      const j = (await r.json()) as { ok: boolean; items?: VideoHistoryItem[] };
      if (j.ok && j.items) setHistory(j.items);
    } catch { /* best-effort */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/video/capabilities", { cache: "no-store" });
        const j = (await r.json()) as { capabilities?: { openaiTts?: boolean } };
        if (alive) setVideoCaps({ openaiTts: j.capabilities?.openaiTts === true });
      } catch {
        if (alive) setVideoCaps({ openaiTts: false });
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Delete selected videos ──
  const deleteSelected = async () => {
    if (selectedVideos.size === 0) return;
    if (!confirm(`刪除 ${selectedVideos.size} 個影片？此操作無法復原。`)) return;
    setDeletingVideos(true);
    try {
      await Promise.all(
        Array.from(selectedVideos).map(id =>
          fetch(`/api/video/${id}`, { method: "DELETE" })
        )
      );
      setSelectedVideos(new Set());
      void loadHistory();
    } catch (e) {
      console.error("delete failed", e);
    } finally {
      setDeletingVideos(false);
    }
  };

  // ── Shared polling helper ──
  function startPolling(jobId: string) {
    interface StatusResp {
      ok: boolean;
      status?: "running" | "done" | "error";
      step?: string;
      video?: { outputs: Record<string, string>; out_dir: string };
      title?: string;
      error?: string;
    }
    const deadline = Date.now() + 12 * 60 * 1000;
    const poll = async (): Promise<void> => {
      if (Date.now() > deadline) {
        isRenderingRef.current = false;
        setGenStatus("error");
        setGenError("生成逾時（>12 分鐘）。影片可能仍在背景產出，稍後可至下方歷史紀錄查看。");
        return;
      }
      let sj: StatusResp;
      try {
        const sr = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}`);
        sj = (await sr.json()) as StatusResp;
      } catch {
        pollRef.current = setTimeout(() => void poll(), 5000);
        return;
      }
      if (!sj.ok) { isRenderingRef.current = false; setGenStatus("error"); setGenError(sj.error ?? "查詢生成狀態失敗"); return; }
      if (sj.status === "running") {
        if (sj.step) setGenStep(sj.step);
        pollRef.current = setTimeout(() => void poll(), 5000);
        return;
      }
      if (sj.status === "done" && sj.video) {
        isRenderingRef.current = false;
        setGenResult({ outputs: sj.video.outputs, out_dir: sj.video.out_dir, title: sj.title ?? "" });
        setGenStatus("done");
        void loadHistory();
        return;
      }
      isRenderingRef.current = false;
      setGenStatus("error");
      setGenError(sj.error ?? "生成失敗");
    };
    pollRef.current = setTimeout(() => void poll(), 3000);
  }

  // ── Draft generation handler ──
  async function handleGenerateDraft() {
    if (!topic.trim() && providedScenes.length === 0) return;
    isRenderingRef.current = false;
    if (pollRef.current) clearTimeout(pollRef.current);
    setDraftLoading(true);
    setDraftScenes([]);
    setDraftFormatUrls({});
    setDraftFormats([]);
    setDraftPreviewFormat("");
    setDraftR2Keys([]);
    setGenError("");
    setGenResult(null);
    setGenStatus("idle");
    try {
      const res = await fetch("/api/video/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          articleTitle: articleTitle.trim() || undefined,
          articleContent: articleContent.trim() || undefined,
          language,
          visualStyle: videoStyle ? resolveVideoStyle(videoStyle) : undefined,
          imageModel,
          targetMinutes,
          // 三模式共用：sceneCount 覆蓋 targetMinutes 推導值；customScenes 僅 AI 生圖模式有意義。
          sceneCount: providedScenes.length === 0 ? totalScenes : undefined,
          customScenes: (providedScenes.length === 0 && imageModel !== "pexels-video" && imageModel !== "pexels-all") ? Math.min(customScenes, totalScenes) : undefined,
          outputFormats: orderedFormats,
          scenes: providedScenes.length > 0 ? providedScenes : undefined,
        }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        scenes?: { id: number; narration: string; imagePrompt?: string; brollKeyword?: string; visual?: "custom" | "broll" }[];
        formatImageUrls?: Record<string, string[]>;
        formats?: string[];
        r2Keys?: string[];
        title?: string;
        error?: string;
      };
      if (!j.ok || !j.scenes || !j.formatImageUrls || !j.formats || j.formats.length === 0) {
        setGenError(j.error ?? "草稿生成失敗");
        setGenStatus("error");
        return;
      }
      // 主格式（formats[0]）那組作預覽編輯；全部格式原生圖組存起，render 時送回。
      const primaryFmt = j.formats[0];
      const primaryUrls = j.formatImageUrls[primaryFmt] ?? [];
      setDraftScenes(j.scenes.map((s, i) => ({
        id: s.id, narration: s.narration, imageUrl: primaryUrls[i] ?? "",
        imagePrompt: s.imagePrompt ?? "", brollKeyword: s.brollKeyword ?? "", visual: s.visual ?? "custom",
      })));
      setDraftFormatUrls(j.formatImageUrls);
      setDraftFormats(j.formats);
      setDraftPreviewFormat(primaryFmt);
      setDraftR2Keys(j.r2Keys ?? []);
      setDraftTitle(j.title ?? topic.trim());
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "網路錯誤，請重試");
      setGenStatus("error");
    } finally {
      setDraftLoading(false);
    }
  }

  function handleDraftPreviewFormatChange(fmt: string) {
    const urls = draftFormatUrls[fmt];
    if (!urls) return;
    setDraftPreviewFormat(fmt);
    setDraftScenes((prev) => prev.map((s, i) => ({ ...s, imageUrl: urls[i] ?? s.imageUrl })));
  }

  // ── Single-image regenerate handler (draft review) ──
  async function handleRegenerateImage(sceneId: number) {
    const scene = draftScenes.find((s) => s.id === sceneId);
    if (!scene || regenIds.has(sceneId)) return;
    const sceneIndex = draftScenes.findIndex((s) => s.id === sceneId);
    const activeFormat = draftPreviewFormat || draftFormats[0];
    setRegenIds((prev) => new Set(prev).add(sceneId));
    setGenError("");
    try {
      const res = await fetch("/api/video/regenerate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: scene.imagePrompt,
          imageModel,
          visualStyle: videoStyle ? resolveVideoStyle(videoStyle) : undefined,
          brollKeyword: scene.brollKeyword,
          visual: scene.visual,
          oldImageUrl: scene.imageUrl,
          format: activeFormat,
        }),
      });
      const j = (await res.json()) as { ok: boolean; imageUrl?: string; error?: string };
      if (j.ok && j.imageUrl) {
        setDraftScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, imageUrl: j.imageUrl! } : s)));
        if (activeFormat && sceneIndex >= 0) {
          setDraftFormatUrls((prev) => ({
            ...prev,
            [activeFormat]: (prev[activeFormat] ?? []).map((url, i) => (i === sceneIndex ? j.imageUrl! : url)),
          }));
        }
      } else {
        setGenError(j.error ?? "圖片重新生成失敗");
      }
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "網路錯誤，重新生成失敗");
    } finally {
      setRegenIds((prev) => { const n = new Set(prev); n.delete(sceneId); return n; });
    }
  }

  // ── Single-scene upload-your-own-asset handler (draft review) ──
  async function handleUploadAsset(sceneId: number, file: File) {
    const scene = draftScenes.find((s) => s.id === sceneId);
    if (!scene || regenIds.has(sceneId)) return;
    const sceneIndex = draftScenes.findIndex((s) => s.id === sceneId);
    const activeFormat = draftPreviewFormat || draftFormats[0];
    const isVideo = file.type === "video/mp4";
    const capMb = isVideo ? 45 : 12; // 與後端 + nginx /api/ 50M 對齊
    if (file.size > capMb * 1048576) { setGenError(`檔案過大（上限 ${capMb}MB）`); return; }
    setRegenIds((prev) => new Set(prev).add(sceneId));
    setGenError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("oldImageUrl", scene.imageUrl);
      const res = await fetch("/api/video/upload-asset", { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; imageUrl?: string; error?: string };
      if (j.ok && j.imageUrl) {
        setDraftScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, imageUrl: j.imageUrl! } : s)));
        if (activeFormat && sceneIndex >= 0) {
          setDraftFormatUrls((prev) => ({
            ...prev,
            [activeFormat]: (prev[activeFormat] ?? []).map((url, i) => (i === sceneIndex ? j.imageUrl! : url)),
          }));
        }
      } else {
        setGenError(j.error ?? "上傳失敗");
      }
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "網路錯誤，上傳失敗");
    } finally {
      setRegenIds((prev) => { const n = new Set(prev); n.delete(sceneId); return n; });
    }
  }

  // ── Render draft handler ──
  async function handleRenderDraft() {
    if (isRenderingRef.current) return; // sync guard — prevents double-submit before React re-renders
    isRenderingRef.current = true;
    if (pollRef.current) clearTimeout(pollRef.current);
    setGenStatus("loading");
    setGenStep("提交渲染中…");
    setGenError("");
    try {
      // 目前預覽比例那組以 draftScenes.imageUrl 覆蓋（反映編輯/重生/上傳）；其他比例保留各自原生圖。
      const primaryFmt = draftPreviewFormat || draftFormats[0];
      const formatImageUrls: Record<string, string[]> = { ...draftFormatUrls };
      if (primaryFmt) formatImageUrls[primaryFmt] = draftScenes.map((s) => s.imageUrl);
      const res = await fetch("/api/video/render-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: draftScenes.map((s) => ({ id: s.id, narration: s.narration })),
          formatImageUrls,
          formats: draftFormats,
          r2Keys: draftR2Keys,
          title: draftTitle,
          ...(embedded?.organizationId ? { organizationId: embedded.organizationId } : {}),
          ...parseVoiceModel(voiceModelId),
        }),
      });
      const j = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!j.ok || !j.jobId) { isRenderingRef.current = false; setGenStatus("error"); setGenError(j.error ?? "提交渲染失敗"); return; }
      startPolling(j.jobId);
    } catch (e: unknown) {
      isRenderingRef.current = false;
      setGenStatus("error");
      setGenError(e instanceof Error ? e.message : "網路錯誤，請重試");
    }
  }

  // ── Generate handler (direct, no draft) — kept for backward compat ──
  async function handleGenerate() {
    if (!topic.trim()) return;
    if (pollRef.current) clearTimeout(pollRef.current);
    setGenStatus("loading");
    setGenStep("準備中…");
    setGenError("");
    setGenResult(null);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          articleTitle: articleTitle.trim() || undefined,
          articleContent: articleContent.trim() || undefined,
          language,
          sceneCount: (imageModel !== "pexels-video" && imageModel !== "pexels-all") ? totalScenes : undefined,
          customScenes: (imageModel !== "pexels-video" && imageModel !== "pexels-all") ? Math.min(customScenes, totalScenes) : undefined,
          brollScenes,
          imageModel,
          outputFormats: orderedFormats,
          ...parseVoiceModel(voiceModelId),
        }),
      });
      const start = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!start.ok || !start.jobId) {
        setGenStatus("error");
        setGenError(start.error ?? "無法建立生成工作");
        return;
      }
      startPolling(start.jobId);
    } catch (e: unknown) {
      setGenStatus("error");
      setGenError(e instanceof Error ? e.message : "網路錯誤，請重試");
    }
  }

  const isLoading = genStatus === "loading";
  const isBusy = isLoading || draftLoading;
  const canGenerate = (topic.trim().length > 0 || providedScenes.length > 0) && !isBusy;

  // suppress unused warning for handleGenerate (kept for backward compat)
  void handleGenerate;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>

      {/* ── Inner tab bar：三段式（製作／審片與交付／營運）+ 常駐成本說明入口 ── */}
      {/* embedded（VideoPipeline wizard 內嵌）= 外層 stepper 已經在扮演這個角色，這裡不重複顯示 tab bar。 */}
      {!embedded && <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        padding: "10px 28px 0",
        background: "var(--bg-canvas)", borderBottom: "1px solid var(--border-subtle)",
      }}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {STUDIO_TAB_GROUPS.map(({ group, items }) => (
            <div key={group} style={{ display: "flex", alignItems: "center", paddingRight: 10, marginRight: 10, borderRight: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 0.5, marginRight: 4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{group}</span>
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setStudioTab(t.id)}
                  style={{
                    padding: "10px 14px", border: "none",
                    borderBottom: `3px solid ${studioTab === t.id ? "var(--accent)" : "transparent"}`,
                    background: "transparent", cursor: "pointer", fontSize: 13.5, whiteSpace: "nowrap",
                    fontWeight: studioTab === t.id ? 700 : 500,
                    color: studioTab === t.id ? "var(--accent)" : "var(--text-secondary)",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setInfoOpen(true)}
          style={{ marginBottom: 8, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          💰 說明 & 成本
        </button>
      </div>}

      {/* ── Generate tab ── */}
      {studioTab === "generate" && (
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Hint banner — full width */}
          {providedScenes.length > 0 ? (
            <div style={{ ...videoConfigWidthStyle, background: "var(--intake-success-bg)", border: "1px solid var(--green)", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: "var(--badge-green-text)", lineHeight: 1.6 }}>
              已從前製腳本帶入 <b>{providedScenes.length}</b> 個場景。影片區只設定素材、配音與輸出比例；內容量請回腳本區調整。
            </div>
          ) : (
            <div style={{ ...videoConfigWidthStyle, background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "9px 12px", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              可到「前製腳本」寫完再帶入，或直接填主題快速生成。
            </div>
          )}

          {/* ── Phase: done ── */}
          {genStatus === "done" && genResult && (
            <ResultPanel result={genResult} onClose={() => { isRenderingRef.current = false; setGenStatus("idle"); setDraftScenes([]); }} />
          )}

          {/* ── Phase: rendering (progress) ── */}
          {isLoading && <ProgressTracker step={genStep} />}

          {/* ── Phase: draft review ── */}
          {draftReady && !isLoading && genStatus !== "done" && (
            <>
              {genStatus === "error" && (
                <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>失敗</div>
                  <div style={{ fontSize: 12.5, color: "var(--badge-red-text)" }}>{genError}</div>
                </div>
              )}
              <DraftEditor
                scenes={draftScenes}
                title={draftTitle}
                formats={draftFormats}
                activeFormat={draftPreviewFormat || draftFormats[0] || ""}
                onChangeFormat={handleDraftPreviewFormatChange}
                onChangeScene={(id, narration) =>
                  setDraftScenes((prev) => prev.map((s) => s.id === id ? { ...s, narration } : s))
                }
                onBack={() => { isRenderingRef.current = false; setDraftScenes([]); setGenError(""); setGenStatus("idle"); }}
                onRender={handleRenderDraft}
                onRegenerate={handleRegenerateImage}
                onUpload={handleUploadAsset}
                regenIds={regenIds}
                disabled={isBusy}
                errorMsg={genStatus === "error" ? genError : undefined}
              />
            </>
          )}

          {/* ── Phase: idle / config — single-column layout ── */}
          {!draftReady && !isLoading && genStatus !== "done" && (
          <div style={videoConfigStackStyle}>

            {/* Form cards */}
            <div style={videoConfigFieldsStyle}>

            {/* ① 輸入內容 */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-subtle)" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>① 輸入內容</span>
              </div>
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>主題 / 關鍵字 <span style={{ color: "var(--red)" }}>*</span></label>
                  <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                    placeholder="例：如何用 AI 提升 SEO 排名" style={inputStyle} disabled={isLoading} />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={labelStyle}>語言</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }} disabled={isLoading}>
                      {["繁體中文", "English", "簡體中文", "日文", "西班牙文"].map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>

                <details style={{ borderRadius: 8, border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                  <summary style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-subtle)", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
                    ▸ 文章內容（選用 — 填入可讓腳本更貼近你的文章）
                  </summary>
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={labelStyle}>文章標題</label>
                      <input type="text" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)}
                        placeholder="留白 = 純主題生成" style={inputStyle} disabled={isLoading} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={labelStyle}>文章內文（Markdown 或純文字）</label>
                      <textarea value={articleContent} onChange={(e) => setArticleContent(e.target.value)}
                        placeholder="留白 = 以主題/標題生成腳本" rows={4}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} disabled={isLoading} />
                    </div>
                  </div>
                </details>

              </div>
            </div>

            {/* ② 影片設定 */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-subtle)" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>② 影片設定</span>
              </div>
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* 素材模式 — 合併後生產區常駐可編輯（含前製腳本接力）；2026-06-26 設定擁有權自前製腳本移回此處 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>素材模式</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { id: "pexels-video", label: "真實影片", badge: "免費",    tip: "真實動態影片片段，最自然" },
                      { id: "pexels-all",   label: "照片動畫", badge: "免費",    tip: "免費照片 + Ken Burns 縮放效果" },
                      { id: "__ai__",       label: "AI 生圖",  badge: "按模型", tip: "Flux / Ideogram 等 AI 插圖" },
                    ].map(({ id, label, badge, tip }) => {
                      const isAiMode = id === "__ai__";
                      const active = isAiMode ? !isPexels : imageModel === id;
                      return (
                        <button key={id} type="button" title={tip}
                          onClick={() => {
                            if (isAiMode) {
                              if (isPexels) { setImageModel(DEFAULT_IMAGE_MODEL); setImageVendor(vendorForModel(DEFAULT_IMAGE_MODEL)); }
                            } else {
                              setImageModel(id);
                            }
                          }}
                          disabled={isBusy}
                          style={{ ...tabStyle(active), flex: 1, padding: "8px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span>{label}</span>
                          <span style={{ fontSize: 10, opacity: 0.75 }}>{badge}</span>
                        </button>
                      );
                    })}
                  </div>
                  {imageModel === "pexels-video" && (
                    <div style={{ fontSize: 11, color: "var(--badge-green-text)", background: "var(--badge-green-bg)", padding: "6px 10px", borderRadius: 6, lineHeight: 1.6 }}>
                      每場景自動搜尋 Pexels 影片片段（HD MP4）→ EU FFmpeg 拼接 + TTS 配音。費用 $0。
                    </div>
                  )}
                </div>

                {/* 前製擁有場景總數與 AI/圖庫分配；生產區只顯示 handoff 結果或快速生成預設。 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: "var(--bg-subtle)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {providedScenes.length > 0
                      ? `場景與素材分配由前製腳本決定（${providedScenes.length} 場；AI 生圖 ${providedCustomScenes} 場｜圖庫補 ${providedBrollScenes} 場）。`
                      : `場景與 AI/圖庫分配請在上方「前製腳本」設定；直接快速生成使用 ${totalScenes} 場、AI 生圖 ${customScenes} 場、圖庫補 ${brollScenes} 場預設。`}
                  </div>
                  {providedScenes.length > 0 ? (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      影片長度由前製腳本旁白與 TTS 決定；要改成更長/更短，請回腳本區調整場景數或重寫腳本。
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>時間長度</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{targetMinutes} 分鐘</span>
                      </div>
                      <input type="range" min={1} max={10} step={0.5} value={targetMinutes}
                        onChange={e => setTargetMinutes(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--accent)" }} disabled={isBusy} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
                        <span>1 分</span><span>5 分</span><span>10 分</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "right" }}>
                        預計 <b>{totalScenes}</b> 個場景
                      </div>
                    </div>
                  )}
                </div>

                {/* 生圖模型 — AI 模式，廠商 tab + 模型 chip */}
                {!isPexels && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>生圖模型</span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {Object.keys(IMAGE_VENDOR_GROUPS).map(v => (
                        <button key={v} type="button" disabled={isBusy}
                          onClick={() => {
                            setImageVendor(v);
                            const first = IMAGE_VENDOR_GROUPS[v]?.[0];
                            if (first) setImageModel(first);
                          }}
                          style={tabStyle(imageVendor === v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(IMAGE_VENDOR_GROUPS[imageVendor] ?? []).map(id => {
                        const r = IMAGE_RATES[id];
                        const active = imageModel === id;
                        return (
                          <button key={id} type="button" onClick={() => setImageModel(id)} disabled={isBusy}
                            style={chipStyle(active)}>
                            {r?.label ?? id}
                            {r && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>${r.usd}/張</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 視覺風格 — AI 模式，類別 tab + 風格 chip */}
                {!isPexels && (
                  <details style={{ borderRadius: 8, border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                    <summary style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-subtle)", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      ▸ 視覺風格{videoStyle
                        ? <span style={{ color: "var(--accent)", fontWeight: 400 }}>&nbsp;— {videoStyle}</span>
                        : <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>&nbsp;（不指定 = 電影感預設）</span>}
                    </summary>
                    <div style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {VIDEO_STYLE_GROUPS.map(g => (
                          <button key={g} type="button" onClick={() => setVideoStyleGroup(g)} disabled={isBusy}
                            style={tabStyle(videoStyleGroup === g)}>
                            {g}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 120, overflowY: "auto" }}>
                        {VIDEO_STYLE_CATALOG.filter(item => item.group === videoStyleGroup).map(item => {
                          const active = videoStyle === item.zh;
                          return (
                            <button key={item.zh} type="button" onClick={() => setVideoStyle(active ? "" : item.zh)} disabled={isBusy}
                              style={chipStyle(active)}>
                              {item.zh}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                )}

                {/* 配音模型 — 廠商 tab + 聲音 chip，統一 accent 色 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>配音模型</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(["edge", "openai"] as const).map(prov => {
                      const active = voiceModelId.startsWith(prov + ":");
                      const firstVoice = VOICE_MODELS.find(v => v.id.startsWith(prov + ":"))?.id ?? voiceModelId;
                      return (
                        <button key={prov} type="button" onClick={() => setVoiceModelId(firstVoice)}
                          style={tabStyle(active)}>
                          {prov === "edge" ? "Edge 免費" : "OpenAI"}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {VOICE_MODELS.filter(v => v.id.startsWith(voiceModelId.startsWith("openai:") ? "openai:" : "edge:")).map(v => {
                      const active = voiceModelId === v.id;
                      return (
                        <button key={v.id} type="button" onClick={() => setVoiceModelId(v.id)} title={v.note ?? v.badge}
                          style={{ ...chipStyle(active), display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span>{v.label}</span>
                          <span style={{ fontSize: 10, color: v.badgeColor, background: v.badgeBg, padding: "1px 6px", borderRadius: 999, fontWeight: 700 }}>
                            {v.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {openAiVoiceSelected && (
                    <div style={{
                      fontSize: 11,
                      color: videoCaps?.openaiTts ? "var(--badge-green-text)" : "#92400e",
                      background: videoCaps?.openaiTts ? "var(--badge-green-bg)" : "#fef3c7",
                      padding: "4px 8px",
                      borderRadius: 6,
                      lineHeight: 1.5,
                    }}>
                      {videoCaps === null
                        ? "正在檢查 EU video-service 的 OpenAI TTS 設定..."
                        : videoCaps.openaiTts
                          ? "OpenAI TTS 已在 EU video-service 啟用；成本會依旁白字元數估算。"
                          : "EU video-service 尚未設定 OPENAI_API_KEY；目前會自動降版 Edge TTS。"}
                    </div>
                  )}
                </div>

                {/* 輸出比例 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>輸出比例 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（各比例獨立原生生成）</span></span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {VIDEO_FORMAT_CHOICES.map(fmt => {
                      const active = selectedFormats.has(fmt);
                      const meta = OUTPUT_LABELS[fmt];
                      return (
                        <button key={fmt} type="button" disabled={isBusy}
                          onClick={() => setSelectedFormats(prev => {
                            const next = new Set(prev);
                            if (next.has(fmt)) { if (next.size > 1) next.delete(fmt); }
                            else next.add(fmt);
                            return next;
                          })}
                          style={chipStyle(active)}>
                          {meta.ratio}
                        </button>
                      );
                    })}
                    <button type="button" disabled={isBusy}
                      onClick={() => setSelectedFormats(new Set(VIDEO_FORMAT_CHOICES))}
                      style={chipStyle(selectedFormats.size === VIDEO_FORMAT_CHOICES.length)}>
                      全選
                    </button>
                  </div>
                  {orderedFormats.length > 1 && (
                    <span style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", padding: "4px 8px", borderRadius: 6, lineHeight: 1.5 }}>
                      {orderedFormats.length} 個比例 = 成本與時間約 x{orderedFormats.length}（每比例各自原生生成）
                    </span>
                  )}
                </div>

              </div>
            </div>

              {/* Draft loading inline */}
              {draftLoading && (
                <div style={{ background: "var(--ai-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>生成草稿中…</div>
                  <div style={{ fontSize: 12, color: "var(--accent)" }}>Claude 生成腳本 + Flux 生成圖片（約 30–60 秒）</div>
                </div>
              )}

              {/* Error (non-draft phase) */}
              {genStatus === "error" && !draftReady && (
                <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>失敗</div>
                  <div style={{ fontSize: 12.5, color: "var(--badge-red-text)" }}>{genError}</div>
                  {genError.toLowerCase().includes("video-service") && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--badge-red-text)" }}>提示：EU video-service 需正常運行（健康狀態請查 Repair Center）。</div>
                  )}
                </div>
              )}
            </div>{/* end form cards */}

            {/* Cost + CTA */}
            <div style={videoConfigCtaStyle}>

              {/* ③ 費用預覽 card */}
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>③ 費用預覽</span>
                  <button type="button" onClick={() => setInfoOpen(true)}
                    style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    完整明細 →
                  </button>
                </div>
                <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Mini cost breakdown */}
                  {costBreakdown.lines.filter(l => !l.free).map(l => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: "var(--text-secondary)" }}>{l.icon} {l.label}</span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace" }}>{NT(l.totalUsd)}</span>
                    </div>
                  ))}
                  {costBreakdown.lines.some(l => l.free) && (
                    <div style={{ fontSize: 11, color: "var(--badge-green-text)" }}>
                      + {costBreakdown.lines.filter(l => l.free).map(l => l.label).join("、")} 免費
                    </div>
                  )}
                  {/* Total */}
                  <div style={{ borderTop: "2px solid var(--border-subtle)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>每支合計</span>
                    <span style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{NT(costBreakdown.totalUsd)}</span>
                  </div>
                  {/* CTA */}
                  <button onClick={handleGenerateDraft} disabled={!canGenerate}
                    style={{
                      padding: "13px 0", borderRadius: 8, border: "none", width: "100%",
                      cursor: canGenerate ? "pointer" : "not-allowed",
                      background: canGenerate ? "var(--accent)" : "var(--border-subtle)",
                      color: canGenerate ? "var(--btn-primary-text)" : "var(--text-muted)",
                      fontSize: 15, fontWeight: 700, transition: "background 0.15s",
                    }}>
                    {draftLoading ? "草稿生成中…" : "生成草稿"}
                  </button>
                </div>
              </div>

              {/* Settings summary */}
              <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>目前設定</div>
                {[
                  { key: "素材", label: isPexels ? (imageModel === "pexels-video" ? "真實影片" : "照片動畫") : (IMAGE_RATES[imageModel]?.label ?? imageModel) },
                  { key: "場景", label: providedScenes.length > 0 ? `${providedScenes.length} 場（前製腳本；長度由旁白決定）` : `${totalScenes} 場 / ${targetMinutes} 分鐘${!isPexels ? ` / AI ${customScenes}` : ""}` },
                  { key: "配音", label: `${activeVoice.label} · ${activeVoice.badge}` },
                  { key: "比例", label: orderedFormats.map(f => OUTPUT_LABELS[f]?.ratio ?? f).join(" + ") },
                  ...(videoStyle ? [{ key: "風格", label: videoStyle }] : []),
                ].map(({ key, label }) => (
                  <div key={key} style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", minWidth: 26, paddingTop: 1, flexShrink: 0 }}>{key}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>

            </div>{/* end cost + CTA */}

          </div>)}{/* end config grid + idle condition */}

        </div>
      )}

      {/* ── History tab ── */}
      {studioTab === "history" && (
        <div style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>生成記錄</span>
            <button onClick={loadHistory} disabled={historyLoading}
              style={{ fontSize: 11.5, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
              {historyLoading ? "載入中…" : "↻ 重新整理"}
            </button>
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" }}>
              {historyLoading ? "載入中…" : "尚無影片記錄。生成第一支影片後會出現在這裡。"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVideos.size === history.length && history.length > 0}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedVideos(new Set(history.map((v) => v.id)));
                      } else {
                        setSelectedVideos(new Set());
                      }
                    }}
                  />
                  全選共 {history.length} 個
                </label>
                {selectedVideos.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    disabled={deletingVideos}
                    className="px-3 py-1 rounded text-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                  >
                    {deletingVideos ? "刪除中..." : `刪除 ${selectedVideos.size} 個`}
                  </button>
                )}
                {selectedVideos.size > 0 && (
                  <span className="text-xs text-neutral-500 ml-auto">已選 {selectedVideos.size}</span>
                )}
              </div>
              {history.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  active={selectedVideo?.id === item.id}
                  onSelect={() => setSelectedVideo(selectedVideo?.id === item.id ? null : item)}
                  checked={selectedVideos.has(item.id)}
                  onCheck={e => {
                    const next = new Set(selectedVideos);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    setSelectedVideos(next);
                  }}
                />
              ))}
            </div>
          )}
          {selectedVideo && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
              <VideoViewer
                title={selectedVideo.title}
                outputs={selectedVideo.formats}
                primaryUrl={selectedVideo.object_url}
                onClose={() => setSelectedVideo(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 說明 & 成本：2026-09-10 從 tab 移出改彈窗，獨立可及、不佔生產步驟 ── */}
      {infoOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}
          onClick={() => setInfoOpen(false)}>
          <div style={{ background: "var(--bg-canvas)", borderRadius: 14, maxWidth: 980, width: "100%", padding: "20px 24px 24px" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>說明 & 成本</span>
              <button type="button" onClick={() => setInfoOpen(false)}
                style={{ border: "none", background: "var(--bg-subtle)", borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontSize: 14, color: "var(--text-secondary)" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 480px) 1fr", gap: 24, alignItems: "start" }}>
              <Card title="生成流程" subtitle="lib/content/video/video-cost.ts VIDEO_PIPELINE_STEPS 驅動">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {VIDEO_PIPELINE_STEPS.map((step, idx) => (
                    <FlowCard
                      key={step.id}
                      step={step}
                      index={idx}
                      costLine={costBreakdown.lines.find((l) => l.id === step.id)}
                      activeStep={isLoading ? genStep : undefined}
                    />
                  ))}
                </div>
              </Card>
              <Card title="成本明細">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                      <th style={{ padding: "6px 0", fontWeight: 600 }}>步驟</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>USD</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>×</th>
                      <th style={{ padding: "6px 0", fontWeight: 600, textAlign: "right" }}>NT$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBreakdown.lines.map((line) => (
                      <tr key={line.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "7px 0", color: "var(--text-primary)" }}>
                          <span style={{ marginRight: 6 }}>{line.icon}</span>{line.label}
                          {line.free && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "var(--badge-green-text)", background: "var(--badge-green-bg)", padding: "1px 5px", borderRadius: 4 }}>免費</span>}
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11.5 }}>{line.free ? "—" : USD(line.unitUsd)}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)" }}>{line.count}</td>
                        <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 600, color: line.free ? "var(--text-muted)" : "var(--text-primary)" }}>{line.free ? "—" : NT(line.totalUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, borderTop: "2px solid var(--border-subtle)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>每支合計</span>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)", marginLeft: 8 }}>({USD(costBreakdown.totalUsd)})</span>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>{NT(costBreakdown.totalUsd)}</span>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── Remotion 模板／實拍剪輯／Release 交付／營運 tab（孤兒面板接線，零 props，掛載點變動不影響其內部邏輯）── */}
      {studioTab === "remotion" && <RemotionStudio scriptPrefill={remotionInitial} organizationId={embedded?.organizationId} />}
      {studioTab === "footage" && <FootageEditor />}
      {studioTab === "release" && <ReleaseDeliveryPanel />}
      {studioTab === "timeline" && <TimelineValidationPanel />}
      {studioTab === "operations" && <MediaOperationsPanel />}

    </div>
  );
}

// ─── DraftEditor ──────────────────────────────────────────────────────────────

function DraftEditor({
  scenes, title, formats, activeFormat, onChangeFormat, onChangeScene, onBack, onRender, onRegenerate, onUpload, regenIds, disabled, errorMsg,
}: {
  scenes: DraftScene[];
  title: string;
  formats: string[];
  activeFormat: string;
  onChangeFormat: (fmt: string) => void;
  onChangeScene: (id: number, narration: string) => void;
  onBack: () => void;
  onRender: () => void;
  onRegenerate: (id: number) => void;
  onUpload: (id: number, file: File) => void;
  regenIds: Set<number>;
  disabled: boolean;
  errorMsg?: string;
}) {
  // 有任何單張重生進行中 → 鎖住「返回 / 送出渲染」，避免送出時用到尚未更新的舊圖（per-scene 重生鈕仍各自獨立）。
  const flowBlocked = disabled || regenIds.size > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          📋 草稿審核 — {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>可編輯旁白後送出渲染</div>
      </div>

      {formats.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {formats.map((fmt) => {
            const active = fmt === activeFormat;
            const meta = OUTPUT_LABELS[fmt];
            return (
              <button key={fmt} type="button" onClick={() => onChangeFormat(fmt)} disabled={disabled}
                style={chipStyle(active)}>
                {meta?.ratio ?? fmt}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 520, overflowY: "auto" }}>
        {scenes.map((scene, idx) => (
          <div key={scene.id} style={{
            display: "flex", gap: 10, padding: "10px 12px",
            border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--card-bg)",
          }}>
            {/* Thumbnail + 重新生成 — 照片用 img；Pexels MP4 用靜音 video 預覽 */}
            <div style={{ flexShrink: 0, width: 140, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ width: 140, height: 96, borderRadius: 6, overflow: "hidden", background: "#0f172a" }}>
                {/\.mp4(\?|$)/.test(scene.imageUrl) || scene.imageUrl.includes("videos.pexels.com") || scene.imageUrl.includes("player.vimeo.com") ? (
                  <video src={scene.imageUrl} muted loop autoPlay playsInline
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : scene.imageUrl.startsWith("https://") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt={`場景 ${scene.id}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎬</div>
                )}
              </div>
              <button type="button" onClick={() => onRegenerate(scene.id)}
                disabled={disabled || regenIds.has(scene.id)}
                title="不喜歡這張圖？重新生成一張"
                style={{
                  width: "100%", padding: "4px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  border: "1px solid var(--border-subtle)",
                  background: (disabled || regenIds.has(scene.id)) ? "var(--border-subtle)" : "var(--bg-canvas)",
                  color: (disabled || regenIds.has(scene.id)) ? "var(--text-muted)" : "var(--accent)",
                  cursor: (disabled || regenIds.has(scene.id)) ? "not-allowed" : "pointer",
                }}>
                {regenIds.has(scene.id) ? "⏳ 生成中" : "🔄 重新生成"}
              </button>
              <label title="上傳自己的圖片或影片（PNG / JPEG / WebP / MP4）"
                style={{
                  width: "100%", padding: "4px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, textAlign: "center",
                  boxSizing: "border-box", border: "1px solid var(--border-subtle)",
                  background: (disabled || regenIds.has(scene.id)) ? "var(--border-subtle)" : "var(--bg-canvas)",
                  color: (disabled || regenIds.has(scene.id)) ? "var(--text-muted)" : "var(--text-secondary)",
                  cursor: (disabled || regenIds.has(scene.id)) ? "not-allowed" : "pointer",
                }}>
                ⬆️ 上傳
                <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4"
                  disabled={disabled || regenIds.has(scene.id)} style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(scene.id, f); e.target.value = ""; }} />
              </label>
            </div>
            {/* Narration editor */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>場景 {idx + 1}</div>
              <textarea
                value={scene.narration}
                onChange={(e) => onChangeScene(scene.id, e.target.value)}
                rows={2}
                disabled={disabled}
                style={{
                  width: "100%", borderRadius: 6, border: "1px solid var(--border-subtle)",
                  padding: "6px 8px", fontSize: 12.5, fontFamily: "inherit",
                  resize: "vertical", background: "var(--bg-canvas)", color: "var(--text-primary)",
                  lineHeight: 1.55,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {errorMsg && (
        <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 700, marginBottom: 2 }}>操作失敗</div>
          <div style={{ fontSize: 12, color: "var(--badge-red-text)" }}>{errorMsg}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} disabled={flowBlocked}
          style={{
            padding: "10px 16px", borderRadius: 8, border: "1px solid var(--border-subtle)",
            cursor: flowBlocked ? "not-allowed" : "pointer",
            background: "var(--bg-canvas)", color: "var(--text-secondary)",
            fontSize: 13, fontWeight: 600,
          }}>
          ← 返回重生
        </button>
        <button onClick={onRender} disabled={flowBlocked}
          style={{
            flex: 1, padding: "10px 16px", borderRadius: 8, border: "none",
            cursor: flowBlocked ? "not-allowed" : "pointer",
            background: flowBlocked ? "var(--border-subtle)" : "var(--green)",
            color: flowBlocked ? "var(--text-muted)" : "var(--btn-primary-text)",
            fontSize: 13, fontWeight: 700,
          }}>
          {regenIds.size > 0 ? "⏳ 圖片生成中…" : disabled ? "⏳ 處理中…" : "🎬 確認送出渲染"}
        </button>
      </div>
    </div>
  );
}

// ─── ProgressTracker ──────────────────────────────────────────────────────────

function ProgressTracker({ step }: { step: string }) {
  const currentIdx = getCurrentStepIndex(step);
  return (
    <div style={{ background: "var(--ai-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 12 }}>🔄 正在生成…</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROGRESS_STEPS.slice(0, -1).map((s, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
                background: done ? "var(--green)" : active ? "var(--accent)" : "var(--border)",
                color: done || active ? "var(--btn-primary-text)" : "var(--text-muted)",
              }}>
                {done ? "✓" : idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontSize: 12.5, fontWeight: active ? 700 : 500,
                  color: done ? "var(--green)" : active ? "var(--accent)" : "var(--text-muted)",
                }}>
                  {s.label}
                </span>
                {active && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)" }}>{step}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--accent)" }}>
        可以關閉頁面，完成後影片會出現在「📋 生成記錄」。
      </div>
    </div>
  );
}

// ─── ResultPanel ──────────────────────────────────────────────────────────────

function ResultPanel({ result, onClose }: { result: VideoOutputs; onClose: () => void }) {
  // 主版優先 16x9；若未勾 16x9 則取第一個實際輸出格式（避免落到已不存在的 legacy key）。
  const primaryKey = result.outputs["16x9"] ? "16x9" : (Object.keys(result.outputs)[0] ?? "");
  const primaryUrl = result.outputs[primaryKey] ?? Object.values(result.outputs)[0] ?? "";

  return (
    <div style={{ background: "var(--intake-success-bg)", border: "1px solid var(--green)", borderRadius: 10, padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--badge-green-text)" }}>✅ 生成完成：{result.title}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--badge-green-text)", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {/* Primary video player */}
      {primaryUrl && primaryUrl.startsWith("https://") && (
        <div style={{ marginBottom: 14 }}>
          <video
            controls
            src={primaryUrl}
            style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 280 }}
          />
        </div>
      )}

      <VideoViewer title={result.title} outputs={result.outputs} primaryUrl={primaryUrl} />
    </div>
  );
}

// ─── VideoViewer ──────────────────────────────────────────────────────────────

function VideoViewer({ title, outputs, primaryUrl, onClose }: {
  title: string;
  outputs: Record<string, string>;
  primaryUrl?: string;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  return (
    <div>
      {onClose && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
        </div>
      )}

      {/* Preview player */}
      {primaryUrl && primaryUrl.startsWith("https://") && (
        <video controls src={primaryUrl} style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 200, marginBottom: 10 }} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {Object.entries(outputs).map(([key, url]) => {
          const meta = OUTPUT_LABELS[key];
          const isHttps = url.startsWith("https://");
          return (
            <div key={key} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                  {meta ? `${meta.icon} ${meta.label}` : key}
                </span>
                {meta && <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--border)", padding: "1px 6px", borderRadius: 4 }}>{meta.ratio}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {isHttps ? (
                  <>
                    <a href={url} download target="_blank" rel="noreferrer"
                      style={{ flex: 1, padding: "5px 8px", background: "var(--accent)", color: "var(--btn-primary-text)", borderRadius: 6, textAlign: "center", fontSize: 11.5, fontWeight: 700, textDecoration: "none" }}>
                      ⬇ 下載
                    </a>
                    <button onClick={() => copyUrl(url, key)}
                      style={{ padding: "5px 8px", background: "var(--badge-gray-bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 11.5, cursor: "pointer", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {copied === key ? "✓" : "複製"}
                    </button>
                  </>
                ) : (
                  <code style={{ fontSize: 10, wordBreak: "break-all", color: "var(--text-muted)", background: "var(--badge-gray-bg)", padding: "4px 6px", borderRadius: 4 }}>{url}</code>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HistoryRow ───────────────────────────────────────────────────────────────

function HistoryRow({ item, active, onSelect, checked, onCheck }: {
  item: VideoHistoryItem;
  active: boolean;
  onSelect: () => void;
  checked: boolean;
  onCheck: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const date = new Date(item.created_at);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  const formatCount = Object.keys(item.formats).length;

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px", borderRadius: 8, cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
        background: active ? "var(--ai-bg)" : "var(--card-bg)",
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        className="mt-1 cursor-pointer"
        onClick={e => e.stopPropagation()}
      />
      <div style={{ width: 36, height: 36, borderRadius: 6, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
        🎬
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {dateStr} · {item.sceneCount || "?"} 場景 · {formatCount} 格式
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: active ? "var(--accent)" : "var(--text-muted)", fontWeight: 600 }}>
        {active ? "▲ 收起" : "▼ 展開"}
      </div>
    </div>
  );
}

// ─── FlowCard ─────────────────────────────────────────────────────────────────

function FlowCard({
  step, index, costLine, activeStep,
}: {
  step: (typeof VIDEO_PIPELINE_STEPS)[number];
  index: number;
  costLine?: { totalUsd: number; free: boolean; count: number };
  activeStep?: string;
}) {
  const muted = !step.enabled;
  // highlight the active pipeline step during generation
  // VIDEO_PIPELINE_STEPS: 0=script,1=image,2=broll,3=tts,4=render
  const isActive = activeStep !== undefined && !muted &&
    PROGRESS_STEPS.some((ps) => activeStep.includes(ps.match) && ps.key !== "__done__" &&
      (ps.key === "script" ? index === 0 :
       ps.key === "assets" ? index === 1 :
       ps.key === "render" ? index === 3 || index === 4 : false));

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      border: `1px solid ${isActive ? "var(--accent)" : muted ? "var(--border)" : "var(--border-subtle)"}`,
      background: isActive ? "var(--ai-bg)" : muted ? "var(--bg-subtle)" : "var(--card-bg)",
      opacity: muted ? 0.55 : 1,
      transition: "border-color 0.15s, background 0.15s",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        background: isActive ? "var(--accent)" : muted ? "var(--border)" : "var(--accent)",
        color: muted && !isActive ? "var(--text-muted)" : "var(--btn-primary-text)",
        fontSize: 11, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isActive ? "●" : index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15 }}>{step.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: muted ? "var(--text-muted)" : "var(--text-primary)", textDecoration: muted ? "line-through" : "none" }}>
            {step.label}
          </span>
          {muted && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", background: "var(--badge-gray-bg)", padding: "1px 6px", borderRadius: 4 }}>已停用</span>}
          {isActive && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--ai-bg)", padding: "1px 6px", borderRadius: 4, animation: "pulse 1s infinite" }}>進行中</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 3 }}>
          {step.tool} · <span style={{ color: "var(--text-muted)" }}>{step.vendor}</span>
        </div>
        {step.note && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{step.note}</div>}
      </div>
      {costLine !== undefined && (
        <div style={{ flexShrink: 0 }}>
          {costLine.free
            ? <span style={{ background: "var(--badge-green-bg)", color: "var(--badge-green-text)", padding: "2px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>$0 免費</span>
            : <span style={{ background: "var(--build-risk-medium-bg)", color: "var(--build-risk-medium-text)", padding: "2px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>${costLine.totalUsd.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
          }
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" };

const videoConfigWidthStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 960,
  margin: "0 auto",
  boxSizing: "border-box",
};

const videoConfigStackStyle: React.CSSProperties = {
  ...videoConfigWidthStyle,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const videoConfigFieldsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
};

const videoConfigCtaStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "100%",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8,
  border: "1px solid var(--border-subtle)",
  fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)",
  width: "100%", boxSizing: "border-box",
};

// ─── RemotionStudio ───────────────────────────────────────────────────────────

interface RemotionTemplateField {
  key: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  optional?: boolean;
  type?: "image" | "audio" | "logo" | "color" | "number" | "text";
  prefillFrom?: "headline" | "tagline" | "cta" | "topic";
  maxLen?: number;
}

interface RemotionTemplate {
  id: string;
  name: string;
  aspect: string;
  duration: string;
  desc: string;
  fields: RemotionTemplateField[];
}

const REMOTION_TEMPLATES: RemotionTemplate[] = [
  {
    id: "scale-bg-text-slideup",
    name: "背景縮放 + 文字滑入",
    aspect: "16:9",
    duration: "6s",
    desc: "全幅背景圖緩慢縮放，主標語從底部滑入（廣告橫幅、促銷貼文）",
    fields: [
      { key: "imageUrl",  label: "背景圖片", type: "image", hint: "https://..." },
      { key: "text",      label: "主標語", type: "text", prefillFrom: "headline", maxLen: 20, hint: "限時優惠 75折" },
      { key: "logoUrl",   label: "Logo", type: "logo", hint: "", optional: true },
      { key: "audioUrl",  label: "背景音樂", type: "audio", hint: "", optional: true },
    ],
  },
  {
    id: "pan-slide-text-left-3scenes",
    name: "三場景平移 + 文字",
    aspect: "9:16",
    duration: "20s",
    desc: "直式短影音；三場景 Ken Burns 平移，文字從側邊滑入（TikTok / Reels / Stories）",
    fields: [
      { key: "imageUrl1", label: "場景 1 圖片", type: "image", hint: "" },
      { key: "text1",     label: "場景 1 文字", type: "text", prefillFrom: "headline", maxLen: 20, hint: "" },
      { key: "imageUrl2", label: "場景 2 圖片", type: "image", hint: "" },
      { key: "text2",     label: "場景 2 文字", type: "text", prefillFrom: "tagline", maxLen: 20, hint: "" },
      { key: "imageUrl3", label: "場景 3 圖片", type: "image", hint: "" },
      { key: "text3",     label: "場景 3 文字", type: "text", prefillFrom: "cta", maxLen: 20, hint: "" },
      { key: "logoUrl",   label: "Logo", type: "logo", hint: "", optional: true },
      { key: "audioUrl",  label: "背景音樂", type: "audio", hint: "", optional: true },
    ],
  },
  {
    id: "circle-mask-text-slideup-reveal",
    name: "圓形遮罩 + 品牌文字",
    aspect: "16:9",
    duration: "20s",
    desc: "圖片以圓形揭幕方式展開，右側品牌文字逐行滑入（品牌形象、產品上市）",
    fields: [
      { key: "imageUrl",  label: "主圖片", type: "image", hint: "" },
      { key: "headline",  label: "主標題", type: "text", prefillFrom: "headline", maxLen: 20, hint: "重新定義品質" },
      { key: "brand",     label: "品牌名", type: "text", prefillFrom: "topic", maxLen: 16, hint: "", optional: true },
      { key: "tagline",   label: "副標語", type: "text", prefillFrom: "tagline", maxLen: 30, hint: "", optional: true },
      { key: "logoUrl",   label: "Logo", type: "logo", hint: "", optional: true },
      { key: "audioUrl",  label: "背景音樂", type: "audio", hint: "", optional: true },
    ],
  },
  {
    id: "product-review-typewriter",
    name: "產品評論打字機",
    aspect: "16:9",
    duration: "10s",
    desc: "評論框從中展開，星星逐個跳入，評論文字以打字效果呈現（電商信任感、UGC）",
    fields: [
      { key: "backgroundImageUrl", label: "背景圖片", type: "image", hint: "" },
      { key: "productImageUrl",    label: "產品圖片", type: "image", hint: "" },
      { key: "profileImageUrl",    label: "評論人大頭照", type: "image", hint: "", optional: true },
      { key: "reviewerName",       label: "評論人姓名", type: "text", maxLen: 20, hint: "Wang Mei" },
      { key: "reviewDate",         label: "日期", type: "text", maxLen: 20, hint: "June 2026" },
      { key: "reviewText",         label: "評論內容", multiline: true, prefillFrom: "headline", maxLen: 80, hint: "這產品太棒了！強烈推薦！" },
      { key: "starCount",          label: "星星數（1–5）", type: "number", hint: "5" },
      { key: "logoUrl",            label: "Logo", type: "logo", hint: "", optional: true },
      { key: "audioUrl",           label: "背景音樂", type: "audio", hint: "", optional: true },
    ],
  },
  {
    id: "photo-highlights-slides-zoom",
    name: "相片精選幻燈片",
    aspect: "16:9",
    duration: "22s",
    desc: "三張相片縮放平移 + 旋轉滑動切換，旅遊 / 活動回顧 / 作品集（60fps）",
    fields: [
      { key: "imageUrl1",       label: "相片 1", type: "image", hint: "" },
      { key: "text1",           label: "相片 1 說明", type: "text", prefillFrom: "headline", maxLen: 20, hint: "" },
      { key: "imageUrl2",       label: "相片 2", type: "image", hint: "" },
      { key: "text2",           label: "相片 2 說明", type: "text", prefillFrom: "tagline", maxLen: 20, hint: "" },
      { key: "imageUrl3",       label: "相片 3", type: "image", hint: "" },
      { key: "text3",           label: "相片 3 說明", type: "text", prefillFrom: "cta", maxLen: 20, hint: "" },
      { key: "logoUrl",         label: "Logo", type: "logo", hint: "", optional: true },
      { key: "backgroundColor", label: "主題色", type: "color", hint: "#0ebba2", optional: true },
      { key: "audioUrl",        label: "背景音樂", type: "audio", hint: "", optional: true },
    ],
  },
];

type RemotionStatus = "idle" | "submitting" | "rendering" | "done" | "error";

// ── Helpers for AI image generation prompt resolution ──
function getSceneIndexForImageField(key: string): number | null {
  const match = key.match(/Url(\d)$/);
  if (match) return parseInt(match[1]) - 1;
  return null;
}

function getImagePromptForField(fieldKey: string, prefill: ScriptRemotionPrefill | undefined): string {
  if (!prefill) return "";
  const idx = getSceneIndexForImageField(fieldKey);
  if (idx !== null && prefill.scenes?.[idx]?.visual) return prefill.scenes[idx].visual;
  return prefill.imageHint || prefill.topic || "";
}

function aspectToFormat(aspect: string): string {
  if (aspect === "9:16") return "9x16";
  if (aspect === "4:5") return "4x5";
  return "16x9";
}

function RemotionStudio({ scriptPrefill, organizationId }: { scriptPrefill?: ScriptRemotionPrefill; organizationId?: string }) {
  const [selectedId, setSelectedId] = useState(REMOTION_TEMPLATES[0].id);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RemotionStatus>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [aiGenFields, setAiGenFields] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which (selectedId × scriptPrefill identity) combo has already been applied,
  // so clearing a prefilled field doesn't get re-clobbered on the next render.
  const prefillAppliedRef = useRef<string>("");

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const tmpl = REMOTION_TEMPLATES.find(t => t.id === selectedId)!;
  const busy = status === "submitting" || status === "rendering";

  // Auto-populate text fields from scriptPrefill — runs exactly once per (selectedId × scriptPrefill identity)
  useEffect(() => {
    if (!scriptPrefill) return;
    const applyKey = `${selectedId}::${scriptPrefill.topic}::${scriptPrefill.headline ?? ""}::${scriptPrefill.tagline ?? ""}`;
    if (prefillAppliedRef.current === applyKey) return;
    prefillAppliedRef.current = applyKey;
    setFields(prev => {
      const next = { ...prev };
      tmpl.fields.forEach(f => {
        if (f.prefillFrom && !next[f.key]) {
          const v = scriptPrefill[f.prefillFrom as keyof ScriptRemotionPrefill];
          if (typeof v === "string" && v) {
            next[f.key] = f.maxLen ? v.slice(0, f.maxLen) : v;
          }
        }
      });
      return next;
    });
  }, [scriptPrefill, selectedId, tmpl.fields]);

  const setField = (key: string, value: string) =>
    setFields(prev => {
      const maxLen = tmpl.fields.find(f => f.key === key)?.maxLen;
      return { ...prev, [key]: maxLen ? value.slice(0, maxLen) : value };
    });

  function selectTemplate(id: string) {
    if (busy) return;
    setSelectedId(id);
    setFields({});
    setStatus("idle");
    setError("");
    setResultUrl("");
  }

  // AI image generation for a single field
  async function generateImageForField(fieldKey: string) {
    const prompt = getImagePromptForField(fieldKey, scriptPrefill);
    if (!prompt) return;
    setAiGenFields(prev => ({ ...prev, [fieldKey]: true }));
    try {
      const r = await fetch("/api/video/regenerate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: prompt,
          imageModel: "flux-schnell",
          format: aspectToFormat(tmpl.aspect),
          visual: "custom",
        }),
      });
      const j = (await r.json()) as { ok: boolean; imageUrl?: string };
      if (j.ok && j.imageUrl) setField(fieldKey, j.imageUrl);
    } catch { /* best-effort */ }
    setAiGenFields(prev => ({ ...prev, [fieldKey]: false }));
  }

  function startPolling(jobId: string) {
    const deadline = Date.now() + 15 * 60 * 1000;
    const poll = async (): Promise<void> => {
      if (Date.now() > deadline) { setStatus("error"); setError("渲染逾時（>15 分鐘）"); return; }
      try {
        const r = await fetch(`/api/video/remotion-job-status?jobId=${encodeURIComponent(jobId)}`);
        const j = (await r.json()) as { ok: boolean; status?: string; video?: { outputs?: Record<string, string> }; error?: string };
        if (!j.ok || j.status === "error") { setStatus("error"); setError(j.error ?? "渲染失敗"); return; }
        const outputUrl = j.video?.outputs?.remotion;
        if (j.status === "done" && outputUrl) { setStatus("done"); setResultUrl(outputUrl); return; }
        pollRef.current = setTimeout(() => void poll(), 5000);
      } catch {
        pollRef.current = setTimeout(() => void poll(), 5000);
      }
    };
    pollRef.current = setTimeout(() => void poll(), 5000);
  }

  async function handleSubmit() {
    if (busy) return;
    setStatus("submitting");
    setError("");
    setResultUrl("");
    const props: Record<string, unknown> = { ...fields };
    if (selectedId === "product-review-typewriter") {
      props.starCount = Math.min(5, Math.max(1, Number(fields.starCount) || 5));
    }
    try {
      const r = await fetch("/api/video/remotion-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedId, props, ...(organizationId ? { organizationId } : {}) }),
      });
      const j = (await r.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!j.ok || !j.jobId) { setStatus("error"); setError(j.error ?? "提交失敗"); return; }
      setStatus("rendering");
      startPolling(j.jobId);
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "網路錯誤");
    }
  }

  const isPortrait = (aspect: string) => aspect === "9:16";

  return (
    <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Script prefill banner */}
      {scriptPrefill && (
        <div style={{
          background: "var(--ai-bg)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "9px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontWeight: 700, color: "var(--accent)" }}>✨ 腳本已帶入</span>
          <span style={{ color: "var(--text-secondary)" }}>{scriptPrefill.headline || scriptPrefill.topic} — 文字欄位已預填；圖片點「AI 生圖」自動生成</span>
        </div>
      )}

      {/* Template selector — horizontal scroll */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {REMOTION_TEMPLATES.map(t => {
          const active = t.id === selectedId;
          const portrait = isPortrait(t.aspect);
          return (
            <button key={t.id} type="button" onClick={() => selectTemplate(t.id)}
              style={{
                flexShrink: 0, width: 164, padding: "12px", borderRadius: 10, textAlign: "left",
                cursor: busy ? "not-allowed" : "pointer",
                border: `2px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
                background: active ? "var(--ai-bg)" : "var(--card-bg)",
                boxShadow: active ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)" : "none",
                transition: "all 0.15s",
              }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                {/* Aspect ratio thumbnail */}
                <div style={{
                  width: portrait ? 16 : 30, height: portrait ? 30 : 16,
                  borderRadius: 3, flexShrink: 0,
                  background: active ? "var(--accent)" : "var(--border-subtle)",
                  transition: "background 0.15s",
                }} />
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: active ? "var(--accent)" : "var(--text-muted)", fontFamily: "monospace", lineHeight: 1.2 }}>{t.aspect}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.2 }}>{t.duration}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--accent)" : "var(--text-primary)", lineHeight: 1.3, marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>{t.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Field form */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{tmpl.name} — 填入素材</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{tmpl.aspect} · {tmpl.duration}</span>
        </div>
        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {tmpl.fields.map(f => {
            const val = fields[f.key] ?? "";
            const isImgField = f.type === "image";
            const isLogoField = f.type === "logo";
            const isAudioField = f.type === "audio";
            const isColorField = f.type === "color";
            const isNumberField = f.type === "number";
            const aiLoading = aiGenFields[f.key] === true;
            const aiPrompt = getImagePromptForField(f.key, scriptPrefill);
            const hasAIGen = isImgField;
            const showImgPreview = (isImgField || isLogoField) && val.startsWith("https://");
            const fullWidth = f.multiline || isAudioField;

            return (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: fullWidth ? "1 / -1" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 4 }}>
                    {f.label}
                    {f.optional && <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 10 }}>選用</span>}
                  </label>
                  {f.maxLen && val && (
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: val.length > f.maxLen ? "var(--red)" : "var(--text-muted)" }}>
                      {val.length}/{f.maxLen}
                    </span>
                  )}
                </div>

                {f.multiline ? (
                  <textarea value={val} onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.hint} rows={2} disabled={busy}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
                ) : isImgField ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="text" value={val} onChange={e => setField(f.key, e.target.value)}
                        placeholder="https://..." disabled={busy || aiLoading}
                        style={{ ...inputStyle, flex: 1, fontSize: 11 }} />
                      {hasAIGen && (
                        <button type="button"
                          onClick={() => void generateImageForField(f.key)}
                          disabled={busy || aiLoading || !aiPrompt}
                          title={aiPrompt ? `AI 生圖：${aiPrompt.slice(0, 40)}…` : "需先從前製腳本帶入（✨ 送去 Remotion 模板）才能 AI 生圖"}
                          style={{
                            padding: "0 10px", height: 36, borderRadius: 7, flexShrink: 0,
                            border: "1px solid var(--border-subtle)", fontSize: 11, fontWeight: 700,
                            cursor: (busy || aiLoading || !aiPrompt) ? "not-allowed" : "pointer",
                            background: aiLoading ? "var(--border-subtle)" : (aiPrompt ? "var(--ai-bg)" : "var(--bg-subtle)"),
                            color: aiLoading ? "var(--text-muted)" : (aiPrompt ? "var(--accent)" : "var(--text-muted)"),
                            whiteSpace: "nowrap", transition: "all 0.15s",
                          }}>
                          {aiLoading ? "⏳" : "✨ AI"}
                        </button>
                      )}
                    </div>
                    {showImgPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={val} alt="" style={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 6 }} />
                    )}
                  </div>
                ) : isColorField ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="color" value={val || "#0ebba2"} onChange={e => setField(f.key, e.target.value)}
                      style={{ width: 36, height: 34, padding: 2, border: "1px solid var(--border-subtle)", borderRadius: 6, cursor: "pointer", background: "var(--card-bg)" }} />
                    <input type="text" value={val} onChange={e => setField(f.key, e.target.value)}
                      placeholder={f.hint || "#0ebba2"} disabled={busy}
                      style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }} />
                  </div>
                ) : isNumberField ? (
                  <input type="number" value={val} onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.hint} min={1} max={5} disabled={busy}
                    style={{ ...inputStyle, width: 80 }} />
                ) : (
                  <input type="text" value={val} onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.hint} disabled={busy} style={inputStyle} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status */}
      {status === "submitting" && (
        <div style={{ background: "var(--ai-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "var(--accent)", fontWeight: 700 }}>
          ⏳ 提交到 remotion-service 中…
        </div>
      )}
      {status === "rendering" && (
        <div style={{ background: "var(--ai-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>🎬</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>渲染中 — Chrome + ffmpeg</div>
              <div style={{ fontSize: 11.5, color: "var(--accent)", opacity: 0.8 }}>預計 2–5 分鐘。可保持頁面開啟等待。</div>
            </div>
          </div>
          <div style={{ height: 3, background: "var(--border-subtle)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--accent)", borderRadius: 2, width: "60%",
              animation: "indeterminate 2s ease-in-out infinite" }} />
          </div>
          <style>{`@keyframes indeterminate{0%{margin-left:-30%;width:30%}100%{margin-left:100%;width:30%}}`}</style>
        </div>
      )}
      {status === "error" && (
        <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>渲染失敗</div>
          <div style={{ fontSize: 12.5, color: "var(--badge-red-text)", marginBottom: 8 }}>{error}</div>
          <button onClick={() => setStatus("idle")}
            style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
            ← 修改後重試
          </button>
        </div>
      )}
      {status === "done" && resultUrl && (
        <div style={{ background: "var(--intake-success-bg)", border: "1px solid var(--green)", borderRadius: 12, padding: "16px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--badge-green-text)", marginBottom: 12, display: "flex", alignItems: "center" }}>
            ✅ 渲染完成
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>{tmpl.name} · {tmpl.aspect}</span>
          </div>
          <video controls src={resultUrl} style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 320, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <a href={resultUrl} download target="_blank" rel="noreferrer"
              style={{ flex: 1, padding: "9px 0", background: "var(--accent)", color: "var(--btn-primary-text)", borderRadius: 8, textAlign: "center", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
              ⬇ 下載 MP4
            </a>
            <button onClick={() => navigator.clipboard.writeText(resultUrl).catch(() => {})}
              style={{ padding: "9px 16px", background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)", fontWeight: 600 }}>
              複製 URL
            </button>
            <button onClick={() => { setStatus("idle"); setResultUrl(""); setError(""); }}
              style={{ padding: "9px 16px", background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)", fontWeight: 600 }}>
              再做一個
            </button>
          </div>
        </div>
      )}

      {/* CTA */}
      {status !== "done" && (
        <button onClick={() => void handleSubmit()} disabled={busy}
          style={{
            padding: "13px 0", borderRadius: 8, border: "none", width: "100%",
            cursor: busy ? "not-allowed" : "pointer",
            background: busy ? "var(--border-subtle)" : "var(--accent)",
            color: busy ? "var(--text-muted)" : "var(--btn-primary-text)",
            fontSize: 15, fontWeight: 700, transition: "background 0.15s",
          }}>
          {status === "submitting" ? "提交中…" : status === "rendering" ? "渲染中…" : "🎬 送出渲染"}
        </button>
      )}

    </div>
  );
}
