"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STYLE_PRESETS } from "../tarot/cards";
// SSOT for source→group classification — shared with the publish picker + /api/tools/designs filter.
import { assetToolGroup as toolGroup, GALLERY_MODEL_LABELS, GALLERY_PRODUCT_LABELS, TAROT_SOURCES } from "@/lib/studio/asset-group";
import {
  EDGE_MASK_STYLES,
  applyEdgeMask,
  buildMaskSvg,
  type EdgeMaskId,
} from "@/lib/studio/edge-mask";
import { CANVAS_STAFF_HREF, openInCanvas } from "@/components/tools/canvas-handoff";
import { useDoorHref } from "@/app/DoorContext";
import { bucketDownloadHref } from "@/lib/storage/download-href";

interface AssetMetadata {
  prompt?: string | null;
  model_name?: string | null;
  source?: string | null;
  card_name?: string | null;
  product_type?: string | null;
  theme?: string | null;
  brand?: string | null;
  /** Style chips the user picked at generation time (zh labels). */
  style_tags?: string[] | null;
  /** Main subject (tarot subject override / studio subject) — feeds the download filename. */
  subject?: string | null;
}

interface VideoAssetMetadata {
  title?: string | null;
  /** Map of format key → public R2 URL. */
  formats?: Record<string, string> | null;
  sceneCount?: number | null;
}

interface DesignAsset {
  id: string;
  object_key: string;
  object_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
  metadata: AssetMetadata | null;
}

interface VideoAsset {
  id: string;
  object_key: string;
  object_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
  metadata: VideoAssetMetadata | null;
}

type ActiveTab = "designs" | "mockups" | "videos";
type LoadState = "loading" | "ready" | "error" | "disabled";
type SortOrder = "desc" | "asc";
type TimeRange = "all" | "today" | "week" | "month";

/** GET /api/tools/designs list response (lib/studio/designs-list.ts DesignListResult). */
interface DesignListResponse {
  ok: boolean;
  error?: string;
  assets?: DesignAsset[];
  nextCursor?: string | null;
  total?: number;
  facets?: {
    model: Record<string, number>;
    product: Record<string, number>;
    theme: Record<string, number>;
    brand: Record<string, number>;
    time: Record<TimeRange, number>;
    all: Record<"model" | "product" | "theme" | "brand", number>;
  };
}
type DesignFacets = NonNullable<DesignListResponse["facets"]>;

const MODEL_LABELS = GALLERY_MODEL_LABELS;

const TOOL_GROUP_LABELS: Record<string, string> = {
  tarot: "Tarot",
  studio: "Studio",
  mockup: "Mockup",
};

const SOURCE_SUBTYPE: Record<string, string> = {
  "tarot-preview": "預覽",
  "tarot-preview-edit": "預覽修改",
  "tarot-compare": "比較",
  "tarot-art": "原圖",
  tarot: "牌卡",
};

const PRODUCT_LABELS = GALLERY_PRODUCT_LABELS;

function assetProduct(asset: DesignAsset): string | null {
  const src = asset.metadata?.source;
  if (isTarotSrc(src)) return "tarot-card";
  if (src === "pod-studio") return asset.metadata?.product_type ?? null;
  if (src === "mockup") return "mockup-composite";
  return null;
}

function isTarotSrc(source: string | null | undefined): boolean {
  return !!source && (TAROT_SOURCES as readonly string[]).includes(source);
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function assetExtension(asset: DesignAsset): string {
  const keyMatch = asset.object_key.match(/\.([a-z0-9]+)$/i);
  if (keyMatch?.[1]) {
    const ext = keyMatch[1].toLowerCase();
    return ext === "jpeg" ? "jpg" : ext;
  }
  return MIME_EXTENSION[asset.mime_type ?? ""] ?? "png";
}

function safeFilePart(value: string | null | undefined, fallback: string): string {
  let cleaned = (value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "") // Windows silently trims leading/trailing dots → hidden/empty files
    .slice(0, 80)
    .replace(/[.\s]+$/g, ""); // the slice above can re-expose a trailing dot
  // Windows reserved device names would make the file unusable — prefix to neutralise.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned || fallback;
}

/* ─── Style chip classification (SSOT = tarot STYLE_PRESETS) ──────── */
const PAINTER_GROUPS = new Set(["西方畫家", "亞洲畫家"]);
const STYLE_GROUP_BY_LABEL = new Map(STYLE_PRESETS.map((p) => [p.zh, p.group] as const));
type StyleKind = "畫家" | "媒材" | "風格";
const STYLE_KIND_ORDER: StyleKind[] = ["畫家", "媒材", "風格"];

function styleKind(label: string): StyleKind {
  const g = STYLE_GROUP_BY_LABEL.get(label);
  if (g && PAINTER_GROUPS.has(g)) return "畫家";
  if (g === "媒材") return "媒材";
  return "風格"; // catalog 風格 group + any free-typed / studio token
}

function groupStyleTags(tags: string[]): Record<StyleKind, string[]> {
  const out: Record<StyleKind, string[]> = { "畫家": [], "媒材": [], "風格": [] };
  for (const t of tags) out[styleKind(t)].push(t);
  return out;
}

/** Compact a zh label for filenames: keep the lead before "｜" (e.g. "水彩｜…" → "水彩"). */
function shortStyleLabel(zh: string): string {
  return zh.split("｜")[0].trim();
}

/**
 * Filename stem: 產品-主圖-畫家/媒材/風格.
 * 主圖 = card_name → subject → theme; style tags joined with "+"; any empty part is dropped
 * (so img2img / no-style images just get 產品-主圖). Falls back to "design" when all empty.
 */
function designBaseName(asset: DesignAsset): string {
  const product = PRODUCT_LABELS[assetProduct(asset) ?? ""] ?? "";
  const subject = asset.metadata?.card_name ?? asset.metadata?.subject ?? asset.metadata?.theme ?? "";
  const styleLabel = (asset.metadata?.style_tags ?? [])
    .map(shortStyleLabel)
    .filter(Boolean)
    .join("+");
  const parts = [product, subject, styleLabel].filter(Boolean);
  return safeFilePart(parts.join("-"), "design");
}

function zipEntryName(asset: DesignAsset, _index: number, used: Set<string>): string {
  const base = designBaseName(asset);
  const ext = assetExtension(asset);
  let candidate = `${base}.${ext}`;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}.${ext}`;
    suffix++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTimestamp(now = new Date()): string {
  return now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
}

/* ─── Filter chips ──────────────────────────────────────────────── */
function Chips({
  label,
  options,
  value,
  onChange,
  showEmpty = false,
}: {
  label: string;
  options: { key: string; label: string; count: number }[];
  value: string;
  onChange: (v: string) => void;
  showEmpty?: boolean;
}) {
  const visible = options.filter((o) => o.key === "all" || showEmpty || o.count > 0);
  if (visible.every((o) => o.key !== "all" && o.count === 0) && !showEmpty) return null;
  return (
    <div className="designs-filter-row">
      <span className="designs-filter-label">{label}</span>
      {visible.map((o) => (
        <button
          key={o.key}
          className={`designs-chip${value === o.key ? " active" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.key !== "all" && <span className="designs-chip-count">({o.count})</span>}
        </button>
      ))}
    </div>
  );
}

export default function DesignsGallery() {
  const canvasHref = useDoorHref(CANVAS_STAFF_HREF);
  const publishHref = useDoorHref("/tools/publish");
  /* ── tab ── */
  const [activeTab, setActiveTab] = useState<ActiveTab>("designs");

  /* ── images state ── */
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  // Filters, sort, paging and counts run in the DB (GET /api/tools/designs); the page only shows
  // what was loaded so far, with totals from the server.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [facets, setFacets] = useState<DesignFacets | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const listSeq = useRef(0);
  const assetsRef = useRef<DesignAsset[]>([]);
  assetsRef.current = assets;
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<string | null>(null);

  /* ✨ edge-mask editor — apply an organic edge to a saved design → new transparent PNG */
  const [editAsset, setEditAsset] = useState<DesignAsset | null>(null);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [editStyle, setEditStyle] = useState<EdgeMaskId | null>(null);
  const [editAmount, setEditAmount] = useState(55);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editSavedUrl, setEditSavedUrl] = useState<string | null>(null);

  /* multi-select */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDownloadDone, setBulkDownloadDone] = useState(0);
  const [bulkDownloadTotal, setBulkDownloadTotal] = useState(0);

  /* filters */
  const [filterModel, setFilterModel] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterTheme, setFilterTheme] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterTime, setFilterTime] = useState<TimeRange>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  /* ── videos state ── */
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([]);
  const [videoState, setVideoState] = useState<LoadState>("loading");
  const [videoErrorMessage, setVideoErrorMessage] = useState("");
  const [videoSelectedIds, setVideoSelectedIds] = useState<Set<string>>(new Set());
  const [videoSortOrder, setVideoSortOrder] = useState<SortOrder>("desc");
  const [videoFilterTime, setVideoFilterTime] = useState<TimeRange>("all");
  const [videoBulkDeleting, setVideoBulkDeleting] = useState(false);
  const [videoBulkDownloading, setVideoBulkDownloading] = useState(false);
  const [videoBulkDownloadDone, setVideoBulkDownloadDone] = useState(0);
  const [videoBulkDownloadTotal, setVideoBulkDownloadTotal] = useState(0);
  const [videoDeletingId, setVideoDeletingId] = useState<string | null>(null);
  const [videoDownloadingId, setVideoDownloadingId] = useState<string | null>(null);

  /* kebab overflow menu */
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const designGroup = activeTab === "mockups" ? "mockup" : "design";

  const fetchPage = useCallback(async (cursor: string | null): Promise<DesignListResponse> => {
    const p = new URLSearchParams({ group: designGroup, order: sortOrder, tz: String(new Date().getTimezoneOffset()) });
    if (filterModel !== "all") p.set("model", filterModel);
    if (filterProduct !== "all") p.set("product", filterProduct);
    if (filterTheme !== "all") p.set("theme", filterTheme);
    if (filterBrand !== "all") p.set("brand", filterBrand);
    if (filterTime !== "all") p.set("time", filterTime);
    if (cursor) p.set("cursor", cursor);
    else p.set("counts", "1");
    const res = await fetch(`/api/tools/designs?${p.toString()}`, { cache: "no-store" });
    return (await res.json()) as DesignListResponse;
  }, [designGroup, sortOrder, filterModel, filterProduct, filterTheme, filterBrand, filterTime]);

  /** "reset": first page for the current filters. "refresh": re-read first page + counts and keep
   *  the pages already loaded (dedupe by id) so a background refresh never collapses the list. */
  const load = useCallback(async (mode: "reset" | "refresh" = "reset") => {
    const seq = ++listSeq.current;
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const json = await fetchPage(null);
      if (seq !== listSeq.current) return; // a newer filter change already answered
      if (!json.ok) {
        if (json.error === "pod_designs_disabled") { setState("disabled"); return; }
        setErrorMessage(json.error ?? "unknown_error");
        setState("error");
        return;
      }
      const first = json.assets ?? [];
      const firstNext = json.nextCursor ?? null;
      const loaded = assetsRef.current;
      if (mode === "refresh" && loaded.length > first.length) {
        const seen = new Set(first.map((a) => a.id));
        setAssets([...first, ...loaded.filter((a) => !seen.has(a.id))]); // nextCursor stays at the deepest page
      } else {
        setAssets(first);
        setNextCursor(firstNext);
      }
      setTotal(json.total ?? null);
      setFacets(json.facets ?? null);
      setState("ready");
    } catch (err) {
      if (seq !== listSeq.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const seq = listSeq.current;
    setLoadingMore(true);
    try {
      const json = await fetchPage(nextCursor);
      if (seq !== listSeq.current) return;
      if (!json.ok) { alert(`載入失敗：${json.error ?? "unknown"}`); return; }
      const page = json.assets ?? [];
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.filter((a) => !seen.has(a.id))];
      });
      setNextCursor(json.nextCursor ?? null);
    } catch {
      alert("載入失敗：網路錯誤");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchPage]);

  const loadVideos = useCallback(async () => {
    setVideoState("loading");
    try {
      const res = await fetch("/api/tools/designs?domain=ai_video", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; assets?: VideoAsset[]; error?: string };
      if (!json.ok) {
        if (json.error === "pod_designs_disabled") { setVideoState("disabled"); return; }
        setVideoErrorMessage(json.error ?? "unknown_error");
        setVideoState("error");
        return;
      }
      setVideoAssets(json.assets ?? []);
      setVideoState("ready");
    } catch (err) {
      setVideoErrorMessage(err instanceof Error ? err.message : String(err));
      setVideoState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) { void load("refresh"); void loadVideos(); } };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (!document.hidden) { void load("refresh"); void loadVideos(); } }, 300_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [load, loadVideos]);

  useEffect(() => { void loadVideos(); }, [loadVideos]);

  /* close kebab menu on outside click (use click, not mousedown — mousedown fires before
   * React 18's synthetic stopPropagation can cancel it, so items were unreachable) */
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenuId]);

  /* hide filter panel when scrolling down, reveal on scroll up */
  const [filterHidden, setFilterHidden] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    const handle = () => {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 120) setFilterHidden(true);
      else if (y < lastScrollY.current) setFilterHidden(false);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  const copyUrl = useCallback(async (asset: DesignAsset) => {
    if (!asset.object_url) return;
    try {
      await navigator.clipboard.writeText(asset.object_url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable */ }
  }, []);

  const deleteAsset = useCallback(async (asset: DesignAsset) => {
    if (!confirm(`刪除這張圖片？此操作無法復原。`)) return;
    setDeletingId(asset.id);
    try {
      const res = await fetch(`/api/tools/designs?id=${asset.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        setSelectedIds((prev) => { const n = new Set(prev); n.delete(asset.id); return n; });
        void load("refresh"); // totals + chip counts come from the server
      } else {
        alert(`刪除失敗：${json.error ?? "unknown"}`);
      }
    } catch {
      alert("刪除失敗：網路錯誤");
    } finally {
      setDeletingId(null);
    }
  }, [load]);


  /* Single-image download — fetch through the SAME-ORIGIN download proxy
     (bucketDownloadHref: Content-Disposition: attachment, bucket-host allowlisted) instead
     of the cross-origin R2 URL: a same-origin fetch can't be blocked by R2 CORS, which was the cause of
     the "opened a tab, had to 右鍵另存" complaint. Gallery images are small, so a blob save is fine.
     Still falls back to opening a tab if even the proxy fails. */
  const downloadOne = useCallback(async (asset: DesignAsset) => {
    if (!asset.object_url) return;
    setDownloadingId(asset.id);
    const filename = `${designBaseName(asset)}.${assetExtension(asset)}`;
    try {
      const res = await fetch(bucketDownloadHref(asset.object_url, filename), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      downloadBlob(blob, filename);
    } catch {
      // Proxy blocked/disabled — fall back to opening, but say so: opening ≠ saving.
      window.open(asset.object_url, "_blank", "noopener");
      alert("無法直接下載（可能被瀏覽器阻擋），已改開新分頁，請在圖片上按右鍵另存。");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  /* ─── ✨ edge-mask editor (fetch via same-origin proxy → client canvas compositing) ─── */
  const edgePreviews = useMemo(
    () =>
      EDGE_MASK_STYLES.map((s) => ({
        id: s.id,
        zh: s.label,
        en: s.labelEn,
        svg: s.maskUrl ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMaskSvg(s.id, 48, 48, { amount: 62, seed: 7 }))}`,
      })),
    [],
  );

  const openEdgeEdit = useCallback((asset: DesignAsset) => {
    setEditAsset(asset);
    setEditResult(null);
    setEditStyle(null);
    setEditError(null);
    setEditSavedUrl(null);
    setEditAmount(55);
  }, []);

  const closeEdgeEdit = useCallback(() => {
    setEditAsset(null);
    setEditResult(null);
    setEditStyle(null);
    setEditError(null);
    setEditSavedUrl(null);
  }, []);

  const applyEdgeStyle = useCallback(async (styleId: EdgeMaskId) => {
    if (!editAsset?.object_url) return;
    setEditBusy(true);
    setEditError(null);
    try {
      // Same-origin proxy → no canvas taint for the cross-origin R2 image.
      const proxied = `/api/tools/studio/proxy-image?url=${encodeURIComponent(editAsset.object_url)}`;
      const res = await applyEdgeMask(proxied, styleId, { amount: editAmount, seed: 7 });
      if (res.ok) {
        setEditResult(res.image);
        setEditStyle(styleId);
        setEditSavedUrl(null);
      } else {
        // tsconfig here does not narrow the !ok branch — same cast convention as the routes.
        setEditError((res as { ok: false; error: string }).error);
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "edge_failed");
    } finally {
      setEditBusy(false);
    }
  }, [editAsset, editAmount]);

  const saveEdged = useCallback(async (): Promise<string | null> => {
    if (!editResult || !editAsset) return null;
    setEditSaving(true);
    setEditError(null);
    try {
      const styleLabel = editStyle ? EDGE_MASK_STYLES.find((s) => s.id === editStyle)?.label ?? editStyle : null;
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: editResult,
          source: "edge-mask",
          productType: editAsset.metadata?.product_type ?? undefined,
          theme: editAsset.metadata?.theme ?? undefined,
          prompt: editAsset.metadata?.prompt ?? undefined,
          subject: editAsset.metadata?.subject ?? editAsset.metadata?.card_name ?? undefined,
          styleTags: styleLabel ? [`邊緣｜${styleLabel}`] : undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; asset?: { object_url?: string }; error?: string };
      if (json.ok) {
        const u = json.asset?.object_url ?? null;
        setEditSavedUrl(u);
        void load("refresh");
        return u;
      }
      setEditError(`儲存失敗：${json.error ?? "unknown"}`);
      return null;
    } catch {
      setEditError("儲存失敗（網路錯誤）");
      return null;
    } finally {
      setEditSaving(false);
    }
  }, [editResult, editAsset, editStyle, load]);

  const goToProductFromEdit = useCallback(async () => {
    const url = editSavedUrl ?? (await saveEdged());
    if (url && publishHref) window.location.assign(publishHref);
  }, [editSavedUrl, saveEdged, publishHref]);




  /* ─── filter option lists: chip sets are fixed per tab; each count = what clicking it gives (facets) ─── */
  const modelOptions = useMemo(() => [
    { key: "all", label: "全部", count: facets?.all.model ?? total ?? 0 },
    ...Object.keys(MODEL_LABELS).map((k) => ({ key: k, label: MODEL_LABELS[k], count: facets?.model[k] ?? 0 })),
  ], [facets, total]);

  const productOptions = useMemo(() => [
    { key: "all", label: "全部", count: facets?.all.product ?? total ?? 0 },
    ...Object.entries(facets?.product ?? {}).map(([k, n]) => ({ key: k, label: PRODUCT_LABELS[k] ?? k, count: n })),
  ], [facets, total]);

  const themeOptions = useMemo(() => [
    { key: "all", label: "全部", count: facets?.all.theme ?? total ?? 0 },
    ...Object.entries(facets?.theme ?? {}).map(([k, n]) => ({ key: k, label: k, count: n })),
  ], [facets, total]);

  const brandOptions = useMemo(() => [
    { key: "all", label: "全部", count: facets?.all.brand ?? total ?? 0 },
    ...Object.entries(facets?.brand ?? {}).map(([k, n]) => ({ key: k, label: k, count: n })),
  ], [facets, total]);

  /* tab, filters and sort are applied by the server; `visible` = the pages loaded so far */
  const visible = assets;
  const filtersActive =
    filterModel !== "all" || filterProduct !== "all" || filterTheme !== "all" || filterBrand !== "all" || filterTime !== "all";

  /* bulk delete — scoped to visible set so filtered-out assets are never deleted */
  const bulkDelete = useCallback(async () => {
    const ids = visible.filter((a) => selectedIds.has(a.id)).map((a) => a.id);
    if (ids.length === 0) return;
    if (!confirm(`確定刪除選取的 ${ids.length} 張圖片？此操作無法復原。`)) return;
    setBulkDeleting(true);
    let failed = 0;
    let done = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tools/designs?id=${id}`, { method: "DELETE" });
        const json = (await res.json()) as { ok: boolean };
        if (json.ok) {
          done++;
          setAssets((prev) => prev.filter((a) => a.id !== id));
          setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    if (done > 0) void load("refresh");
    if (failed > 0) alert(`${failed} 張刪除失敗（${done} 張成功）`);
  }, [visible, selectedIds, load]);

  /* bulk download — scoped to visible set so filtered-out assets are never downloaded */
  const bulkDownload = useCallback(async () => {
    const selected = visible.filter((a) => selectedIds.has(a.id) && a.object_url);
    if (selected.length === 0) return;

    setBulkDownloading(true);
    setBulkDownloadDone(0);
    setBulkDownloadTotal(selected.length);
    let failed = 0;
    let added = 0;

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const [index, asset] of selected.entries()) {
        try {
          const res = await fetch(bucketDownloadHref(asset.object_url!), { cache: "no-store" });
          if (!res.ok) {
            failed++;
            continue;
          }
          const blob = await res.blob();
          zip.file(zipEntryName(asset, index, usedNames), blob);
          added++;
        } catch {
          failed++;
        } finally {
          setBulkDownloadDone((prev) => prev + 1);
        }
      }

      if (added === 0) {
        alert("下載失敗：沒有可打包的檔案。");
        return;
      }

      const out = await zip.generateAsync({ type: "blob" });
      downloadBlob(out, `designs-${downloadTimestamp()}.zip`);
      if (failed > 0) {
        alert(`已下載 ${added} 張，${failed} 張失敗。`);
      }
    } finally {
      setBulkDownloading(false);
      setBulkDownloadDone(0);
      setBulkDownloadTotal(0);
    }
  }, [visible, selectedIds]);

  /* ─── videos: filter + sort ─── */
  const visibleVideos = useMemo(() => {
    const now = new Date();
    const cutoff: Date | null =
      videoFilterTime === "today" ? startOfDay(now)
      : videoFilterTime === "week" ? startOfWeek(now)
      : videoFilterTime === "month" ? startOfMonth(now)
      : null;
    const filtered = cutoff
      ? videoAssets.filter((v) => new Date(v.created_at) >= cutoff)
      : videoAssets;
    return videoSortOrder === "asc" ? [...filtered].reverse() : filtered;
  }, [videoAssets, videoFilterTime, videoSortOrder]);

  const toggleVideoSelect = useCallback((id: string) => {
    setVideoSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const deleteVideo = useCallback(async (video: VideoAsset) => {
    if (!confirm(`刪除這部影片？此操作無法復原。`)) return;
    setVideoDeletingId(video.id);
    try {
      const res = await fetch(`/api/tools/designs?id=${video.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setVideoAssets((prev) => prev.filter((v) => v.id !== video.id));
        setVideoSelectedIds((prev) => { const n = new Set(prev); n.delete(video.id); return n; });
      } else {
        alert(`刪除失敗：${json.error ?? "unknown"}`);
      }
    } catch {
      alert("刪除失敗：網路錯誤");
    } finally {
      setVideoDeletingId(null);
    }
  }, []);

  const downloadVideo = useCallback(async (video: VideoAsset) => {
    if (!video.object_url) return;
    setVideoDownloadingId(video.id);
    try {
      const res = await fetch(bucketDownloadHref(video.object_url), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = video.object_key.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "mp4";
      const title = video.metadata?.title ? safeFilePart(video.metadata.title, "video") : "video";
      downloadBlob(blob, `${title}.${ext}`);
    } catch {
      window.open(video.object_url, "_blank", "noopener");
      alert("無法直接下載（可能被瀏覽器阻擋），已改開新分頁。");
    } finally {
      setVideoDownloadingId(null);
    }
  }, []);

  const videoBulkDelete = useCallback(async () => {
    const ids = visibleVideos.filter((v) => videoSelectedIds.has(v.id)).map((v) => v.id);
    if (ids.length === 0) return;
    if (!confirm(`確定刪除選取的 ${ids.length} 部影片？此操作無法復原。`)) return;
    setVideoBulkDeleting(true);
    let failed = 0, done = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/tools/designs?id=${id}`, { method: "DELETE" });
        const json = (await res.json()) as { ok: boolean };
        if (json.ok) {
          done++;
          setVideoAssets((prev) => prev.filter((v) => v.id !== id));
          setVideoSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        } else { failed++; }
      } catch { failed++; }
    }
    setVideoBulkDeleting(false);
    if (failed > 0) alert(`${failed} 部刪除失敗（${done} 部成功）`);
  }, [visibleVideos, videoSelectedIds]);

  const videoBulkDownload = useCallback(async () => {
    const selected = visibleVideos.filter((v) => videoSelectedIds.has(v.id) && v.object_url);
    if (selected.length === 0) return;
    setVideoBulkDownloading(true);
    setVideoBulkDownloadDone(0);
    setVideoBulkDownloadTotal(selected.length);
    let failed = 0, added = 0;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedVideoNames = new Set<string>();
      for (const v of selected) {
        try {
          const res = await fetch(bucketDownloadHref(v.object_url!), { cache: "no-store" });
          if (!res.ok) { failed++; continue; }
          const blob = await res.blob();
          const ext = v.object_key.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "mp4";
          const base = v.metadata?.title ? safeFilePart(v.metadata.title, "video") : "video";
          let candidate = `${base}.${ext}`;
          let suffix = 2;
          while (usedVideoNames.has(candidate.toLowerCase())) {
            candidate = `${base}-${suffix}.${ext}`;
            suffix++;
          }
          usedVideoNames.add(candidate.toLowerCase());
          zip.file(candidate, blob);
          added++;
        } catch { failed++; }
        finally { setVideoBulkDownloadDone((p) => p + 1); }
      }
      if (added === 0) { alert("下載失敗：沒有可打包的檔案。"); return; }
      const out = await zip.generateAsync({ type: "blob" });
      downloadBlob(out, `videos-${downloadTimestamp()}.zip`);
      if (failed > 0) alert(`已下載 ${added} 部，${failed} 部失敗。`);
    } finally {
      setVideoBulkDownloading(false);
      setVideoBulkDownloadDone(0);
      setVideoBulkDownloadTotal(0);
    }
  }, [visibleVideos, videoSelectedIds]);

  /* ─── early returns (disabled / hard-error apply to both tabs) ─── */
  if (state === "disabled") {
    return (
      <div className="designs-state">
        My Designs 尚未啟用 — 伺服器設定 <code>POD_DESIGNS_ENABLED=true</code> 後生效。
      </div>
    );
  }

  // A row shows when its scope has values at all (the server lists only those), never because of other filters.
  const hasProducts = productOptions.length > 1;
  const hasThemes = themeOptions.length > 1;
  const hasBrands = brandOptions.length > 1;

  /* ─── Tab switcher (shared header) ─── */
  const TabBar = (
    <div className="designs-tabs">
      <button
        className={`designs-tab${activeTab === "designs" ? " designs-tab--active" : ""}`}
        onClick={() => setActiveTab("designs")}
      >
        設計圖
      </button>
      <button
        className={`designs-tab${activeTab === "mockups" ? " designs-tab--active" : ""}`}
        onClick={() => setActiveTab("mockups")}
      >
        Mockup
      </button>
      <button
        className={`designs-tab${activeTab === "videos" ? " designs-tab--active" : ""}`}
        onClick={() => setActiveTab("videos")}
      >
        影片
      </button>
    </div>
  );

  /* ─── Videos tab rendering ─── */
  if (activeTab === "videos") {
    const FORMAT_LABELS: Record<string, string> = {
      "16x9": "16:9 橫式",
      "9x16": "9:16 直式",
      "4x5": "4:5 直式",
      youtube_linkedin: "YouTube / LinkedIn",
      tiktok_reels: "TikTok / Reels",
      instagram_facebook: "Instagram / Facebook",
      twitter_reddit_bluesky: "Twitter / Reddit / Bluesky",
    };

    const videoSelectedVisible = visibleVideos.filter((v) => videoSelectedIds.has(v.id));
    const videoVisibleSelectedCount = videoSelectedVisible.length;
    const videoDownloadableSelected = videoSelectedVisible.filter((v) => v.object_url).length;
    const allVisibleVideosSelected = videoVisibleSelectedCount === visibleVideos.length && visibleVideos.length > 0;

    const videoContent = () => {
      if (videoState === "loading") {
        return <div className="designs-state">載入中…</div>;
      }
      if (videoState === "error") {
        return (
          <div className="designs-state">
            <p className="designs-state-error">載入失敗：{videoErrorMessage}</p>
            <button className="btn-secondary" onClick={() => void loadVideos()}>重試</button>
          </div>
        );
      }
      if (videoAssets.length === 0) {
        return (
          <div className="designs-state">
            還沒有已儲存的影片 — 生成後會自動出現在這裡。
          </div>
        );
      }
      if (visibleVideos.length === 0) {
        return <div className="designs-state">沒有符合條件的影片。</div>;
      }
      return (
        <div className="designs-grid">
          {visibleVideos.map((v) => {
            const isSelected = videoSelectedIds.has(v.id);
            const isDeleting = videoDeletingId === v.id;
            const isDownloading = videoDownloadingId === v.id;
            return (
              <div key={v.id} className={`designs-card${isSelected ? " designs-card--selected" : ""}`}>
                {/* ── badges + checkbox ── */}
                <div className="designs-card-header">
                  <input
                    type="checkbox"
                    className="designs-card-checkbox"
                    checked={isSelected}
                    onChange={() => toggleVideoSelect(v.id)}
                  />
                  <div className="designs-badges">
                    <span className="designs-badge designs-badge--studio">影片</span>
                    {v.metadata?.sceneCount != null ? (
                      <span className="designs-badge designs-badge--product">
                        {v.metadata.sceneCount} 場景
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* ── primary video player ── */}
                {v.object_url ? (
                  <div className="designs-img-frame designs-img-frame--square">
                    <video
                      src={v.object_url}
                      controls
                      preload="metadata"
                      className="designs-img"
                      style={{ objectFit: "contain", background: "#000" }}
                    />
                  </div>
                ) : (
                  <div className="designs-img-placeholder designs-img-placeholder--square" />
                )}

                {/* ── title ── */}
                {v.metadata?.title ? (
                  <div className="designs-card-name">{v.metadata.title}</div>
                ) : null}

                {/* ── metadata ── */}
                <div className="designs-meta">
                  <div className="designs-meta-row">
                    <span className="designs-meta-key">時間</span>
                    <span className="designs-meta-val">
                      {new Date(v.created_at).toLocaleString("zh-TW")}
                    </span>
                  </div>
                </div>

                {/* ── action buttons ── */}
                <div className="designs-actions">
                  {v.object_url && (
                    <button
                      className="designs-action-btn"
                      disabled={isDownloading || isDeleting || videoBulkDeleting || videoBulkDownloading}
                      onClick={() => void downloadVideo(v)}
                    >
                      {isDownloading ? "下載中…" : "下載"}
                    </button>
                  )}
                  <button
                    className="designs-action-btn designs-action-btn--danger"
                    disabled={isDeleting || isDownloading || videoBulkDeleting || videoBulkDownloading}
                    onClick={() => void deleteVideo(v)}
                  >
                    {isDeleting ? "刪除中…" : "刪除"}
                  </button>
                </div>

                {/* ── format download links ── */}
                {v.metadata?.formats && Object.keys(v.metadata.formats).length > 0 ? (
                  <div className="designs-prompt-section">
                    <div className="designs-style-row" style={{ flexWrap: "wrap", gap: "6px" }}>
                      {Object.entries(v.metadata.formats).map(([fmt, url]) => (
                        <a
                          key={fmt}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="designs-action-btn"
                          style={{ textDecoration: "none", display: "inline-block" }}
                        >
                          {FORMAT_LABELS[fmt] ?? fmt}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="designs-page">
        {TabBar}

        {/* ── Video filter panel ── */}
        <div className={`designs-filter-panel${filterHidden ? " designs-filter-panel--hidden" : ""}`}>
          <div className="designs-filter-row">
            <span className="designs-filter-label">時間</span>
            {(["all", "today", "week", "month"] as TimeRange[]).map((k) => {
              const lbl = k === "all" ? "全部" : k === "today" ? "今天" : k === "week" ? "本週" : "本月";
              return (
                <button
                  key={k}
                  className={`designs-chip${videoFilterTime === k ? " active" : ""}`}
                  onClick={() => setVideoFilterTime(k)}
                >
                  {lbl}
                </button>
              );
            })}
            <span className="designs-filter-spacer" />
            <span className="designs-filter-label">排序</span>
            <button
              className={`designs-chip${videoSortOrder === "desc" ? " active" : ""}`}
              onClick={() => setVideoSortOrder("desc")}
            >
              新→舊
            </button>
            <button
              className={`designs-chip${videoSortOrder === "asc" ? " active" : ""}`}
              onClick={() => setVideoSortOrder("asc")}
            >
              舊→新
            </button>
            <button className="designs-refresh-btn" onClick={() => void loadVideos()}>
              重新整理
            </button>
          </div>

          {/* ── Video toolbar ── */}
          <div className="designs-toolbar">
          <span className="designs-toolbar-count">
            {videoState === "ready" ? `顯示 ${visibleVideos.length} / ${videoAssets.length} 部影片` : ""}
          </span>
          <span className="designs-filter-spacer" />
          {videoState === "ready" && visibleVideos.length > 0 && (
            <button
              className="designs-toolbar-btn"
              onClick={() => {
                if (allVisibleVideosSelected) {
                  setVideoSelectedIds(new Set());
                } else {
                  setVideoSelectedIds(new Set(visibleVideos.map((v) => v.id)));
                }
              }}
            >
              {allVisibleVideosSelected ? "取消全選" : "全選"}
            </button>
          )}
          {videoVisibleSelectedCount > 0 && (
            <button
              className="designs-toolbar-btn"
              disabled={videoBulkDownloading || videoBulkDeleting || videoDownloadableSelected === 0}
              onClick={() => void videoBulkDownload()}
            >
              {videoBulkDownloading
                ? `打包中 ${videoBulkDownloadDone}/${videoBulkDownloadTotal}`
                : `下載 ${videoDownloadableSelected} 部`}
            </button>
          )}
          {videoVisibleSelectedCount > 0 && (
            <button
              className="designs-toolbar-btn designs-toolbar-btn--danger"
              disabled={videoBulkDeleting || videoBulkDownloading}
              onClick={() => void videoBulkDelete()}
            >
              {videoBulkDeleting ? "刪除中…" : `刪除 ${videoVisibleSelectedCount} 部`}
            </button>
          )}
          </div>
        </div>

        {videoContent()}
      </div>
    );
  }

  /* ─── Images tab: original early returns ─── */
  if (state === "error") {
    return (
      <div className="designs-page">
        {TabBar}
        <div className="designs-state">
          <p className="designs-state-error">載入失敗：{errorMessage}</p>
          <button className="btn-secondary" onClick={() => void load()}>重試</button>
        </div>
      </div>
    );
  }
  if (state === "loading") {
    return (
      <div className="designs-page">
        {TabBar}
        <div className="designs-state">載入中…</div>
      </div>
    );
  }

  if (assets.length === 0 && !filtersActive && activeTab === "designs" && (facets?.time.all ?? 0) === 0) {
    return (
      <div className="designs-page">
        {TabBar}
        <div className="designs-state">
          還沒有已儲存的設計 — 生成後會自動出現在這裡。
        </div>
      </div>
    );
  }

  return (
    <div className="designs-page">
      {TabBar}
      {/* ── Filter panel ─────────────────────────────────────────── */}
      <div className={`designs-filter-panel${filterHidden ? " designs-filter-panel--hidden" : ""}`}>
        <Chips label="模型" options={modelOptions} value={filterModel} onChange={setFilterModel} showEmpty />
        {hasProducts && (
          <Chips label="產品" options={productOptions} value={filterProduct} onChange={setFilterProduct} showEmpty />
        )}
        {hasThemes && (
          <Chips label="主題" options={themeOptions} value={filterTheme} onChange={setFilterTheme} showEmpty />
        )}
        {hasBrands && (
          <Chips label="品牌" options={brandOptions} value={filterBrand} onChange={setFilterBrand} showEmpty />
        )}

        {/* Time + sort row */}
        <div className="designs-filter-row">
          <span className="designs-filter-label">時間</span>
          {(["all", "today", "week", "month"] as TimeRange[]).map((k) => {
            const lbl = k === "all" ? "全部" : k === "today" ? "今天" : k === "week" ? "本週" : "本月";
            return (
              <button
                key={k}
                className={`designs-chip${filterTime === k ? " active" : ""}`}
                onClick={() => setFilterTime(k)}
              >
                {lbl}
                {k !== "all" && facets && <span className="designs-chip-count">({facets.time[k]})</span>}
              </button>
            );
          })}
          <span className="designs-filter-spacer" />
          <span className="designs-filter-label">排序</span>
          <button
            className={`designs-chip${sortOrder === "desc" ? " active" : ""}`}
            onClick={() => setSortOrder("desc")}
          >
            新→舊
          </button>
          <button
            className={`designs-chip${sortOrder === "asc" ? " active" : ""}`}
            onClick={() => setSortOrder("asc")}
          >
            舊→新
          </button>
          <button className="designs-refresh-btn" onClick={() => void load("reset")}>
            重新整理
          </button>
        </div>

      {/* ── Bulk action toolbar ───────────────────────────────────── */}
      {(() => {
        const selectedVisible = visible.filter((a) => selectedIds.has(a.id));
        const visibleSelected = selectedVisible.length;
        const downloadableSelected = selectedVisible.filter((a) => a.object_url).length;
        const allVisibleSelected = visibleSelected === visible.length && visible.length > 0;
        return (
          <div className="designs-toolbar">
            <span className="designs-toolbar-count">顯示 {visible.length} / {total ?? visible.length} 張</span>
            <span className="designs-filter-spacer" />
            <button
              className="designs-toolbar-btn"
              onClick={() => {
                if (allVisibleSelected) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(visible.map((a) => a.id)));
                }
              }}
            >
              {allVisibleSelected ? "取消全選" : "全選"}
            </button>
            {visibleSelected > 0 && (
              <button
                className="designs-toolbar-btn"
                disabled={bulkDownloading || bulkDeleting || downloadableSelected === 0}
                onClick={() => void bulkDownload()}
              >
                {bulkDownloading ? `打包中 ${bulkDownloadDone}/${bulkDownloadTotal}` : `下載 ${downloadableSelected} 張`}
              </button>
            )}
            {visibleSelected > 0 && (
              <button
                className="designs-toolbar-btn designs-toolbar-btn--danger"
                disabled={bulkDeleting || bulkDownloading}
                onClick={() => void bulkDelete()}
              >
                {bulkDeleting ? "刪除中…" : `刪除 ${visibleSelected} 張`}
              </button>
            )}
          </div>
        );
      })()}
      </div>

      {/* ── Per-tab empty hint ───────────────────────────────────── */}
      {visible.length === 0 && (
        <div className="designs-state">
          {filtersActive
            ? "沒有符合篩選條件的圖片。"
            : activeTab === "mockups"
            ? "還沒有已儲存的 Mockup — 在 Mockup 工具生成後會自動出現在這裡。"
            : "還沒有已儲存的設計 — 生成後會自動出現在這裡。"}
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div className="designs-grid">
        {visible.map((asset) => {
          const src = asset.metadata?.source;
          const grp = toolGroup(src);
          const isTarot = isTarotSrc(src);
          const subtype = SOURCE_SUBTYPE[src ?? ""] ?? "";
          const product = assetProduct(asset);
          const isSelected = selectedIds.has(asset.id);
          return (
            <div
              key={asset.id}
              className={`designs-card${isSelected ? " designs-card--selected" : ""}`}
            >
              {/* ── badges + checkbox + kebab (right-aligned) ── */}
              <div className="designs-card-header">
                <input
                  type="checkbox"
                  className="designs-card-checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(asset.id)}
                />
                <div className="designs-badges">
                  <span className={`designs-badge designs-badge--${grp === "tarot" ? "tarot" : grp === "studio" ? "studio" : "mockup"}`}>
                    {TOOL_GROUP_LABELS[grp] ?? grp}
                    {subtype ? <span className="designs-badge-subtype"> · {subtype}</span> : null}
                  </span>
                  {product && product !== "tarot-card" ? (
                    <span className="designs-badge designs-badge--product">
                      {PRODUCT_LABELS[product] ?? product}
                    </span>
                  ) : null}
                  {asset.metadata?.brand ? (
                    <span className="designs-badge designs-badge--brand">
                      {asset.metadata.brand}
                    </span>
                  ) : null}
                </div>
                <div className="designs-kebab-wrap">
                  {openMenuId === asset.id ? (
                    <div
                      className="designs-kebab-menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {asset.object_url && canvasHref ? (
                        <button
                          className="designs-kebab-item"
                          onClick={() => { setOpenMenuId(null); openInCanvas(asset.object_url!, designBaseName(asset), canvasHref); }}
                        >
                          🎨 Canvas 編輯
                        </button>
                      ) : null}
                      {asset.object_url ? (
                        <button
                          className="designs-kebab-item"
                          onClick={() => { setOpenMenuId(null); openEdgeEdit(asset); }}
                          title="套上有機／筆刷邊 → 透明 PNG，再去建商品"
                        >
                          ✨ 改邊緣
                        </button>
                      ) : null}
                      <button
                        className="designs-kebab-item"
                        onClick={() => { setOpenMenuId(null); void copyUrl(asset); }}
                      >
                        {copiedId === asset.id ? "✓ 已複製" : "🔗 複製 URL"}
                      </button>
                      {asset.object_url ? (
                        <button
                          className="designs-kebab-item"
                          disabled={downloadingId === asset.id}
                          onClick={() => { setOpenMenuId(null); void downloadOne(asset); }}
                        >
                          {downloadingId === asset.id ? "下載中…" : "⬇ 下載"}
                        </button>
                      ) : null}
                      <button
                        className="designs-kebab-item designs-kebab-item--danger"
                        disabled={deletingId === asset.id}
                        onClick={() => { setOpenMenuId(null); void deleteAsset(asset); }}
                      >
                        {deletingId === asset.id ? "刪除中…" : "🗑 刪除"}
                      </button>
                    </div>
                  ) : null}
                  <button
                    className="designs-kebab-btn"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === asset.id ? null : asset.id); }}
                    title="更多操作"
                  >
                    ···
                  </button>
                </div>
              </div>

              {/* ── image ── */}
              {asset.object_url ? (
                <button
                  className="designs-img-btn"
                  onClick={() => setZoom(asset.object_url!)}
                >
                  <div className={`designs-img-frame designs-img-frame--${isTarot ? "tarot" : "square"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.object_url}
                      alt={asset.metadata?.card_name ?? asset.metadata?.prompt ?? asset.object_key}
                      loading="lazy"
                      className="designs-img"
                    />
                  </div>
                </button>
              ) : (
                <div className={`designs-img-placeholder designs-img-placeholder--${isTarot ? "tarot" : "square"}`} />
              )}

              {/* ── card name (BELOW image: keeps every image top aligned across the row,
                   regardless of whether a name exists or how long it is) ── */}
              {asset.metadata?.card_name ? (
                <div className="designs-card-name">{asset.metadata.card_name}</div>
              ) : null}

              {/* ── metadata ── */}
              <div className="designs-meta">
                {asset.metadata?.theme ? (
                  <div className="designs-meta-row">
                    <span className="designs-meta-key">主題</span>
                    <span className="designs-meta-val">{asset.metadata.theme}</span>
                  </div>
                ) : null}
                <div className="designs-meta-row">
                  <span className="designs-meta-key">模型</span>
                  <span className="designs-meta-val">{asset.metadata?.model_name ?? "—"} · {formatBytes(asset.byte_size)}</span>
                </div>
                <div className="designs-meta-row">
                  <span className="designs-meta-key">時間</span>
                  <span className="designs-meta-val">{new Date(asset.created_at).toLocaleString("zh-TW")}</span>
                </div>
              </div>

              {/* ── style chips: 畫家 / 媒材 / 風格 ── */}
              {(asset.metadata?.style_tags?.length ?? 0) > 0 ? (() => {
                const grouped = groupStyleTags(asset.metadata!.style_tags!);
                return (
                  <div className="designs-style-section">
                    {STYLE_KIND_ORDER.filter((k) => grouped[k].length > 0).map((k) => (
                      <div key={k} className="designs-style-row">
                        <span className="designs-style-kind">{k}</span>
                        {grouped[k].map((t) => (
                          <span key={t} className="designs-style-tag">
                            {shortStyleLabel(t)}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })() : null}

              {/* ── prompt toggle (collapsed by default) ── */}
              {asset.metadata?.prompt ? (() => {
                const expanded = expandedIds.has(asset.id);
                return (
                  <div className="designs-prompt-section">
                    <button
                      className="designs-prompt-btn"
                      onClick={() => toggleExpanded(asset.id)}
                    >
                      <span>{expanded ? "收合 prompt" : "Prompt"}</span>
                      <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
                    </button>
                    {/* Text stays hidden until expanded — keeps the card clean. */}
                    {expanded ? (
                      <div className="designs-prompt-text">
                        {asset.metadata.prompt}
                      </div>
                    ) : null}
                  </div>
                );
              })() : null}

            </div>
          );
        })}
      </div>

      {nextCursor && (
        <div className="designs-state">
          <button className="btn-secondary" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "載入中…" : "載入更多"}
          </button>
        </div>
      )}

      {/* ── ✨ Edge-mask editor modal ─────────────────────────────── */}
      {editAsset ? (
        <div className="designs-lightbox" onClick={closeEdgeEdit}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-background-primary, #1c1c1c)",
              border: "1px solid rgba(127,127,127,0.3)",
              borderRadius: 12,
              width: "min(1400px, 97vw)",
              height: "92vh",
              overflow: "hidden",
              padding: 14,
              display: "flex",
              flexDirection: "row",
              gap: 14,
            }}
          >
            {/* ── LEFT: big preview (原圖 + 套邊後) ── */}
            <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4, flex: "none" }}>原圖</div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={editAsset.object_url ?? ""} alt="原圖" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, display: "block" }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4, flex: "none" }}>套邊後（透明）</div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#fff",
                    backgroundImage:
                      "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0,0 10px,10px -10px,-10px 0px",
                    overflow: "hidden",
                  }}
                >
                  {editBusy ? (
                    <span style={{ fontSize: 13, color: "#333" }}>處理中…</span>
                  ) : editResult ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={editResult} alt="套邊後" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ fontSize: 13, color: "#555" }}>選右側的筆刷 →</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT: 工具列側欄 ── */}
            <div style={{ flex: "0 0 300px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, borderLeft: "1px solid rgba(127,127,127,0.2)", paddingLeft: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>✨ 改邊緣</span>
                <button className="designs-action-btn" style={{ marginLeft: "auto" }} onClick={closeEdgeEdit}>關閉 ✕</button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, flex: "none" }}>
                {editAsset.metadata?.card_name ?? editAsset.metadata?.subject ?? editAsset.metadata?.theme ?? "設計圖"} → 透明 PNG
              </div>

              {/* 筆刷格 — 填滿側欄高度，只有螢幕太矮才捲 */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(50px, 1fr))",
                  gap: 6,
                  alignContent: "start",
                }}
              >
                {edgePreviews.map((pv) => {
                  const active = editStyle === pv.id;
                  return (
                    <button
                      key={pv.id}
                      type="button"
                      title={pv.en}
                      disabled={editBusy}
                      onClick={() => void applyEdgeStyle(pv.id)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        padding: 3,
                        borderRadius: 8,
                        cursor: "pointer",
                        background: active ? "rgba(99,102,241,0.18)" : "rgba(127,127,127,0.06)",
                        border: `1px solid ${active ? "var(--accent)" : "rgba(127,127,127,0.25)"}`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pv.svg} alt={pv.zh} style={{ width: "100%", aspectRatio: "1", background: "#3a3a3a", borderRadius: 4 }} />
                      <span style={{ fontSize: 9, opacity: 0.8, lineHeight: 1.05, textAlign: "center" }}>{pv.zh}</span>
                    </button>
                  );
                })}
              </div>

              {editError ? <span style={{ fontSize: 12, color: "var(--red)", flex: "none" }}>套用失敗：{editError}</span> : null}

              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                <span style={{ fontSize: 11, opacity: 0.6 }}>強度</span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={1}
                  value={editAmount}
                  disabled={editBusy}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  onPointerUp={() => { if (editStyle) void applyEdgeStyle(editStyle); }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, opacity: 0.6, width: 36, textAlign: "right" }}>{editAmount}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
                <button
                  className="designs-action-btn"
                  disabled={!editResult || editSaving || !!editSavedUrl}
                  onClick={() => void saveEdged()}
                >
                  {editSavedUrl ? "已存回 ✓" : editSaving ? "儲存中…" : "存回 My Designs"}
                </button>
                {publishHref && <button
                  className="designs-action-btn"
                  disabled={!editResult || editSaving}
                  onClick={() => void goToProductFromEdit()}
                  style={{ borderColor: "var(--accent)" }}
                >
                  → 去建商品
                </button>}
                {editResult ? (
                  <button
                    className="designs-action-btn"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = editResult;
                      a.download = `${designBaseName(editAsset)}-edge.png`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }}
                  >
                    下載 PNG
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Zoom lightbox ─────────────────────────────────────────── */}
      {zoom ? (
        <div
          className="designs-lightbox"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom}
            alt="zoom"
            className="designs-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
