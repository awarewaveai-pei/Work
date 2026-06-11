"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface AssetMetadata {
  prompt?: string | null;
  model_name?: string | null;
  source?: string | null;
  card_name?: string | null;
  product_type?: string | null;
  theme?: string | null;
  brand?: string | null;
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

const TOOL_LABELS: Record<string, string> = {
  tarot: "Tarot 牌卡",
  "tarot-preview": "Tarot 預覽",
  "tarot-compare": "Tarot 比較",
  "pod-studio": "Studio",
  mockup: "Mockup",
};

const PRODUCT_LABELS: Record<string, string> = {
  tshirt: "T-shirt",
  hoodie: "Hoodie",
  mug: "Mug",
  poster: "Poster",
  sticker: "Sticker",
};

function toolLabel(source: string | null | undefined): string {
  return TOOL_LABELS[source ?? ""] ?? source ?? "—";
}

function isTarot(source: string | null | undefined): boolean {
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

/* ─── Filter chips ──────────────────────────────────────────────── */
function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string; count: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.every((o) => o.key !== "all" && o.count === 0)) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, opacity: 0.55, minWidth: 36 }}>{label}</span>
      {options.map((o) => {
        if (o.key !== "all" && o.count === 0) return null;
        return (
          <button
            key={o.key}
            className={value === o.key ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 11, padding: "3px 10px" }}
            onClick={() => onChange(o.key)}
          >
            {o.label}
            {o.key !== "all" && <span style={{ opacity: 0.6, marginLeft: 4 }}>({o.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function DesignsGallery() {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  /* filters */
  const [filterTool, setFilterTool] = useState("all");
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

  const copyUrl = useCallback(async (asset: DesignAsset) => {
    if (!asset.object_url) return;
    try {
      await navigator.clipboard.writeText(asset.object_url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable */ }
  }, []);

  /* ─── derive filter option lists from actual data ─── */
  const toolOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const k = a.metadata?.source ?? "unknown";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return [
      { key: "all", label: "全部", count: assets.length },
      ...Object.entries(counts).map(([k, n]) => ({ key: k, label: toolLabel(k), count: n })),
    ];
  }, [assets]);

  const productOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const k = a.metadata?.product_type;
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
    return [
      { key: "all", label: "全部", count: Object.values(counts).reduce((s, n) => s + n, 0) },
      ...Object.entries(counts).map(([k, n]) => ({ key: k, label: PRODUCT_LABELS[k] ?? k, count: n })),
    ];
  }, [assets]);

  const themeOptions = useMemo(() => {
    const vals = unique(
      assets.map((a) => a.metadata?.theme).filter((t): t is string => !!t)
    );
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
    const vals = unique(
      assets.map((a) => a.metadata?.brand).filter((b): b is string => !!b)
    );
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
      if (filterTool !== "all" && (a.metadata?.source ?? "unknown") !== filterTool) return false;
      if (filterProduct !== "all" && a.metadata?.product_type !== filterProduct) return false;
      if (filterTheme !== "all" && a.metadata?.theme !== filterTheme) return false;
      if (filterBrand !== "all" && a.metadata?.brand !== filterBrand) return false;
      if (cutoff && new Date(a.created_at) < cutoff) return false;
      return true;
    });

    return sortOrder === "asc"
      ? [...filtered].reverse()
      : filtered;
  }, [assets, filterTool, filterProduct, filterTheme, filterBrand, filterTime, sortOrder]);

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
        <Chips label="工具" options={toolOptions} value={filterTool} onChange={setFilterTool} />
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

      <div style={{ opacity: 0.6, fontSize: 12, marginBottom: 10 }}>
        顯示 {visible.length} / {assets.length} 張
      </div>

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {visible.map((asset) => {
          const src = asset.metadata?.source;
          const cardAspect = isTarot(src) ? "2 / 3" : "1 / 1";
          return (
            <div key={asset.id} className="build-panel" style={{ padding: 10 }}>
              {/* badges row */}
              <div style={{ fontSize: 11, marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                <span style={{
                  background: isTarot(src) ? "rgba(139,92,246,0.15)" : "rgba(59,130,246,0.15)",
                  color: isTarot(src) ? "#a78bfa" : "#60a5fa",
                  borderRadius: 4, padding: "2px 7px",
                }}>
                  {toolLabel(src)}
                </span>
                {asset.metadata?.product_type ? (
                  <span style={{ background: "rgba(16,185,129,0.12)", color: "#34d399", borderRadius: 4, padding: "2px 7px" }}>
                    {PRODUCT_LABELS[asset.metadata.product_type] ?? asset.metadata.product_type}
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

              {asset.metadata?.prompt ? (
                <div style={{
                  fontSize: 11, opacity: 0.5, marginTop: 4,
                  display: "-webkit-box", WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical", overflow: "hidden",
                }} title={asset.metadata.prompt}>
                  {asset.metadata.prompt}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => void copyUrl(asset)}>
                  {copiedId === asset.id ? "已複製 ✓" : "複製 URL"}
                </button>
                {asset.object_url ? (
                  <a className="btn-secondary" style={{ fontSize: 11 }} href={asset.object_url} download>
                    下載
                  </a>
                ) : null}
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
