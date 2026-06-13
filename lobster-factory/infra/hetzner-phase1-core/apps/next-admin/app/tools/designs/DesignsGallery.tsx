"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STYLE_PRESETS } from "../tarot/cards";

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

interface DesignAsset {
  id: string;
  object_key: string;
  object_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
  metadata: AssetMetadata | null;
}

type LoadState = "loading" | "ready" | "error" | "disabled";
type SortOrder = "desc" | "asc";
type TimeRange = "all" | "today" | "week" | "month";

const MODEL_LABELS: Record<string, string> = {
  "flux-schnell": "FLUX schnell",
  "flux-dev": "FLUX dev",
  "flux-2-max": "FLUX 2 Max",
  "ideogram-v2a-turbo": "Ideogram v2a Turbo",
  "ideogram-v3-balanced": "Ideogram v3 Balanced",
  "ideogram-v4-turbo": "Ideogram v4 Turbo",
  "ideogram-v4-quality": "Ideogram v4 Quality",
  "ideogram-character": "Ideogram Character",
  "seedream-4.5": "Seedream 4.5",
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-pro": "Nano Banana Pro",
  "imagen-4": "Imagen 4",
  "openai-low": "GPT-Image-1 低",
  "openai-medium": "GPT-Image-1 中",
  "openai-high": "GPT-Image-1 高",
};

const TOOL_GROUP_LABELS: Record<string, string> = {
  tarot: "Tarot",
  studio: "Studio",
  mockup: "Mockup",
};

const SOURCE_SUBTYPE: Record<string, string> = {
  "tarot-preview": "預覽",
  "tarot-compare": "比較",
  tarot: "牌卡",
};

const PRODUCT_LABELS: Record<string, string> = {
  "tarot-card": "塔羅牌",
  tshirt: "T-shirt",
  hoodie: "Hoodie",
  mug: "Mug",
  poster: "Poster",
  sticker: "Sticker",
  "mockup-composite": "商品合成",
};

function toolGroup(source: string | null | undefined): string {
  if (!source) return "unknown";
  if (source === "tarot" || source === "tarot-preview" || source === "tarot-compare") return "tarot";
  if (source === "pod-studio") return "studio";
  if (source === "mockup") return "mockup";
  return source;
}

function assetProduct(asset: DesignAsset): string | null {
  const src = asset.metadata?.source;
  if (src === "tarot" || src === "tarot-preview" || src === "tarot-compare") return "tarot-card";
  if (src === "pod-studio") return asset.metadata?.product_type ?? null;
  if (src === "mockup") return "mockup-composite";
  return null;
}

function isTarotSrc(source: string | null | undefined): boolean {
  return source === "tarot" || source === "tarot-preview" || source === "tarot-compare";
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

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
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
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
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
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, opacity: 0.55, minWidth: 36 }}>{label}</span>
      {visible.map((o) => (
        <button
          key={o.key}
          className={value === o.key ? "btn-primary" : "btn-secondary"}
          style={{ fontSize: 11, padding: "3px 10px" }}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.key !== "all" && <span style={{ opacity: 0.6, marginLeft: 4 }}>({o.count})</span>}
        </button>
      ))}
    </div>
  );
}

export default function DesignsGallery() {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/tools/designs", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; assets?: DesignAsset[]; error?: string };
      if (!json.ok) {
        if (json.error === "pod_designs_disabled") { setState("disabled"); return; }
        setErrorMessage(json.error ?? "unknown_error");
        setState("error");
        return;
      }
      setAssets(json.assets ?? []);
      setState("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 300_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [load]);

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
      } else {
        alert(`刪除失敗：${json.error ?? "unknown"}`);
      }
    } catch {
      alert("刪除失敗：網路錯誤");
    } finally {
      setDeletingId(null);
    }
  }, []);


  /* Single-image download — the <a download> attribute is ignored for cross-origin R2 URLs
     (browser opens the image instead), so fetch the bytes and save a blob with our own filename.
     Falls back to opening in a new tab if the fetch is blocked. Same pattern as bulkDownload. */
  const downloadOne = useCallback(async (asset: DesignAsset) => {
    if (!asset.object_url) return;
    setDownloadingId(asset.id);
    try {
      const res = await fetch(asset.object_url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      downloadBlob(blob, `${designBaseName(asset)}.${assetExtension(asset)}`);
    } catch {
      // R2 fetch blocked (CORS / network) — fall back to opening, but say so: opening ≠ saving.
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

  /* ─── derive filter option lists ─── */
  const modelOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const k = a.metadata?.model_name;
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return [
      { key: "all", label: "全部", count: total },
      ...Object.keys(MODEL_LABELS).map((k) => ({
        key: k,
        label: MODEL_LABELS[k],
        count: counts[k] ?? 0,
      })),
    ];
  }, [assets]);

  const productOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const k = assetProduct(a);
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return [
      { key: "all", label: "全部", count: total },
      ...Object.entries(counts).map(([k, n]) => ({
        key: k,
        label: PRODUCT_LABELS[k] ?? k,
        count: n,
      })),
    ];
  }, [assets]);

  const themeOptions = useMemo(() => {
    const vals = unique(assets.map((a) => a.metadata?.theme).filter((t): t is string => !!t));
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const k = a.metadata?.theme;
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    return [
      { key: "all", label: "全部", count: vals.length > 0 ? assets.filter((a) => a.metadata?.theme).length : 0 },
      ...vals.map((v) => ({ key: v, label: v, count: counts[v] ?? 0 })),
    ];
  }, [assets]);

  const brandOptions = useMemo(() => {
    const vals = unique(assets.map((a) => a.metadata?.brand).filter((b): b is string => !!b));
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const k = a.metadata?.brand;
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    return [
      { key: "all", label: "全部", count: vals.length > 0 ? assets.filter((a) => a.metadata?.brand).length : 0 },
      ...vals.map((v) => ({ key: v, label: v, count: counts[v] ?? 0 })),
    ];
  }, [assets]);

  /* ─── apply filters + sort ─── */
  const visible = useMemo(() => {
    const now = new Date();
    const cutoff: Date | null =
      filterTime === "today" ? startOfDay(now)
      : filterTime === "week" ? startOfWeek(now)
      : filterTime === "month" ? startOfMonth(now)
      : null;

    const filtered = assets.filter((a) => {
      if (filterModel !== "all" && a.metadata?.model_name !== filterModel) return false;
      if (filterProduct !== "all" && assetProduct(a) !== filterProduct) return false;
      if (filterTheme !== "all" && a.metadata?.theme !== filterTheme) return false;
      if (filterBrand !== "all" && a.metadata?.brand !== filterBrand) return false;
      if (cutoff && new Date(a.created_at) < cutoff) return false;
      return true;
    });

    return sortOrder === "asc" ? [...filtered].reverse() : filtered;
  }, [assets, filterModel, filterProduct, filterTheme, filterBrand, filterTime, sortOrder]);

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
    if (failed > 0) alert(`${failed} 張刪除失敗（${done} 張成功）`);
  }, [visible, selectedIds]);

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
          const res = await fetch(asset.object_url!, { cache: "no-store" });
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

  /* ─── early returns ─── */
  if (state === "disabled") {
    return <p style={{ padding: 16, opacity: 0.7 }}>My Designs 尚未啟用 — 伺服器設定 <code>POD_DESIGNS_ENABLED=true</code> 後生效。</p>;
  }
  if (state === "error") {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "#e5484d" }}>載入失敗：{errorMessage}</p>
        <button className="btn-secondary" onClick={() => void load()}>重試</button>
      </div>
    );
  }
  if (state === "loading") {
    return <p style={{ padding: 16, opacity: 0.7 }}>載入中…</p>;
  }

  if (assets.length === 0) {
    return <p style={{ padding: 16, opacity: 0.7 }}>還沒有已儲存的設計 — 生成後會自動出現在這裡。</p>;
  }

  const hasProducts = productOptions.some((o) => o.key !== "all" && o.count > 0);
  const hasThemes = themeOptions.some((o) => o.key !== "all" && o.count > 0);
  const hasBrands = brandOptions.some((o) => o.key !== "all" && o.count > 0);

  return (
    <div style={{ padding: 16 }}>
      {/* ── Filter panel ─────────────────────────────────────────── */}
      <div className="build-panel" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Chips label="模型" options={modelOptions} value={filterModel} onChange={setFilterModel} showEmpty />
        {hasProducts && (
          <Chips label="產品" options={productOptions} value={filterProduct} onChange={setFilterProduct} />
        )}
        {hasThemes && (
          <Chips label="主題" options={themeOptions} value={filterTheme} onChange={setFilterTheme} />
        )}
        {hasBrands && (
          <Chips label="品牌" options={brandOptions} value={filterBrand} onChange={setFilterBrand} />
        )}

        {/* Time + sort row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, opacity: 0.55, minWidth: 36 }}>時間</span>
          {(["all", "today", "week", "month"] as TimeRange[]).map((k) => {
            const lbl = k === "all" ? "全部" : k === "today" ? "今天" : k === "week" ? "本週" : "本月";
            return (
              <button
                key={k}
                className={filterTime === k ? "btn-primary" : "btn-secondary"}
                style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={() => setFilterTime(k)}
              >
                {lbl}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, opacity: 0.55 }}>排序</span>
          <button
            className={sortOrder === "desc" ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 11, padding: "3px 10px" }}
            onClick={() => setSortOrder("desc")}
          >
            新→舊
          </button>
          <button
            className={sortOrder === "asc" ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 11, padding: "3px 10px" }}
            onClick={() => setSortOrder("asc")}
          >
            舊→新
          </button>
          <button className="btn-secondary" style={{ fontSize: 11, marginLeft: 8 }} onClick={() => void load()}>
            重新整理
          </button>
        </div>
      </div>

      {/* ── Bulk action toolbar ───────────────────────────────────── */}
      {(() => {
        const selectedVisible = visible.filter((a) => selectedIds.has(a.id));
        const visibleSelected = selectedVisible.length;
        const downloadableSelected = selectedVisible.filter((a) => a.object_url).length;
        const allVisibleSelected = visibleSelected === visible.length && visible.length > 0;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ opacity: 0.6, fontSize: 12 }}>顯示 {visible.length} / {assets.length} 張</span>
            <span style={{ flex: 1 }} />
            <button
              className="btn-secondary"
              style={{ fontSize: 11 }}
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
                className="btn-secondary"
                style={{ fontSize: 11 }}
                disabled={bulkDownloading || bulkDeleting || downloadableSelected === 0}
                onClick={() => void bulkDownload()}
              >
                {bulkDownloading ? `打包中 ${bulkDownloadDone}/${bulkDownloadTotal}` : `下載 ${downloadableSelected} 張`}
              </button>
            )}
            {visibleSelected > 0 && (
              <button
                className="btn-secondary"
                style={{ fontSize: 11, color: "#f87171" }}
                disabled={bulkDeleting || bulkDownloading}
                onClick={() => void bulkDelete()}
              >
                {bulkDeleting ? "刪除中…" : `刪除 ${visibleSelected} 張`}
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {visible.map((asset) => {
          const src = asset.metadata?.source;
          const grp = toolGroup(src);
          const cardAspect = isTarotSrc(src) ? "2 / 3" : "1 / 1";
          const subtype = SOURCE_SUBTYPE[src ?? ""] ?? "";
          const product = assetProduct(asset);
          const isSelected = selectedIds.has(asset.id);
          return (
            <div
              key={asset.id}
              className="build-panel"
              style={{
                padding: 10,
                outline: isSelected ? "2px solid #5855d0" : "none",
                outlineOffset: 2,
              }}
            >
              {/* badges + checkbox row */}
              <div style={{ fontSize: 11, marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(asset.id)}
                  style={{ marginRight: 2, cursor: "pointer" }}
                />
                <span style={{
                  background: grp === "tarot" ? "rgba(139,92,246,0.15)" : grp === "studio" ? "rgba(59,130,246,0.15)" : "rgba(16,185,129,0.12)",
                  color: grp === "tarot" ? "#a78bfa" : grp === "studio" ? "#60a5fa" : "#34d399",
                  borderRadius: 4, padding: "2px 7px",
                }}>
                  {TOOL_GROUP_LABELS[grp] ?? grp}
                  {subtype ? <span style={{ opacity: 0.7, marginLeft: 4 }}>{subtype}</span> : null}
                </span>
                {product && product !== "tarot-card" ? (
                  <span style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", borderRadius: 4, padding: "2px 7px" }}>
                    {PRODUCT_LABELS[product] ?? product}
                  </span>
                ) : null}
                {asset.metadata?.brand ? (
                  <span style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", borderRadius: 4, padding: "2px 7px" }}>
                    {asset.metadata.brand}
                  </span>
                ) : null}
                {asset.metadata?.card_name ? (
                  <span style={{ opacity: 0.65 }}>{asset.metadata.card_name}</span>
                ) : null}
              </div>

              {asset.object_url ? (
                <button
                  style={{ display: "block", width: "100%", background: "none", border: "none", padding: 0, cursor: "zoom-in" }}
                  onClick={() => setZoom(asset.object_url!)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.object_url}
                    alt={asset.metadata?.card_name ?? asset.metadata?.prompt ?? asset.object_key}
                    loading="lazy"
                    style={{
                      width: "100%",
                      aspectRatio: cardAspect,
                      objectFit: "contain",
                      background: "#111",
                      borderRadius: 6,
                    }}
                  />
                </button>
              ) : (
                <div style={{ aspectRatio: cardAspect, background: "#111", borderRadius: 6 }} />
              )}

              {asset.metadata?.theme ? (
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 5 }}>主題：{asset.metadata.theme}</div>
              ) : null}

              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                {asset.metadata?.model_name ?? "—"} · {formatBytes(asset.byte_size)}
                <br />
                {new Date(asset.created_at).toLocaleString("zh-TW")}
              </div>

              {/* picked style chips — 畫家 / 媒材 / 風格 (so she can reference + reuse later) */}
              {(asset.metadata?.style_tags?.length ?? 0) > 0 ? (() => {
                const grouped = groupStyleTags(asset.metadata!.style_tags!);
                return (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    {STYLE_KIND_ORDER.filter((k) => grouped[k].length > 0).map((k) => (
                      <div key={k} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 10, opacity: 0.5, minWidth: 30 }}>{k}</span>
                        {grouped[k].map((t) => (
                          <span
                            key={t}
                            style={{ fontSize: 10, background: "rgba(139,92,246,0.12)", color: "#a78bfa", borderRadius: 4, padding: "1px 6px" }}
                          >
                            {shortStyleLabel(t)}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })() : null}

              {asset.metadata?.prompt ? (() => {
                const expanded = expandedIds.has(asset.id);
                return (
                  <div style={{ marginTop: 4 }}>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 10, padding: "1px 6px" }}
                      onClick={() => toggleExpanded(asset.id)}
                    >
                      {expanded ? "收合 prompt ▴" : "Prompt ▾"}
                    </button>
                    {/* Text stays hidden until expanded — keeps the card clean. */}
                    {expanded ? (
                      <div
                        style={{
                          fontSize: 11, opacity: 0.5, marginTop: 4,
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}
                      >
                        {asset.metadata.prompt}
                      </div>
                    ) : null}
                  </div>
                );
              })() : null}

              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => void copyUrl(asset)}>
                  {copiedId === asset.id ? "已複製 ✓" : "複製 URL"}
                </button>
                {asset.object_url ? (
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 11 }}
                    disabled={downloadingId === asset.id}
                    onClick={() => void downloadOne(asset)}
                  >
                    {downloadingId === asset.id ? "下載中…" : "下載"}
                  </button>
                ) : null}
                <button
                  className="btn-secondary"
                  style={{ fontSize: 11, marginLeft: "auto", color: "#f87171" }}
                  disabled={deletingId === asset.id}
                  onClick={() => void deleteAsset(asset)}
                >
                  {deletingId === asset.id ? "刪除中…" : "刪除"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Zoom lightbox ─────────────────────────────────────────── */}
      {zoom ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, cursor: "zoom-out",
          }}
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom}
            alt="zoom"
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
