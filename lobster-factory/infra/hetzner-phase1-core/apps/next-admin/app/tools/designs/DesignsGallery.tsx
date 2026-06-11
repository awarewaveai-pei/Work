"use client";

import { useCallback, useEffect, useState } from "react";

interface AssetMetadata {
  prompt?: string | null;
  model_name?: string | null;
  source?: string | null;
  card_name?: string | null;
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
type SourceFilter = "all" | "tarot" | "tarot-preview" | "pod-studio";

const SOURCE_CHIPS: { key: SourceFilter; label: string }[] = [
  { key: "all",          label: "全部" },
  { key: "tarot",        label: "Tarot 牌卡" },
  { key: "tarot-preview",label: "Tarot 風格預覽" },
  { key: "pod-studio",   label: "Studio" },
];

function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "tarot":         return "Tarot";
    case "tarot-preview": return "Tarot 預覽";
    case "pod-studio":    return "Studio";
    default:              return source ?? "—";
  }
}

function isTarot(source: string | null | undefined): boolean {
  return source === "tarot" || source === "tarot-preview";
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function DesignsGallery() {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>("all");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/tools/designs", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; assets?: DesignAsset[]; error?: string };
      if (!json.ok) {
        if (json.error === "pod_designs_disabled") {
          setState("disabled");
          return;
        }
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

  if (state === "disabled") {
    return (
      <p style={{ padding: 16, opacity: 0.7 }}>
        My Designs 尚未啟用 — 在伺服器設定 <code>POD_DESIGNS_ENABLED=true</code> 後生效。
      </p>
    );
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

  const visible = filter === "all" ? assets : assets.filter((a) => a.metadata?.source === filter);

  if (assets.length === 0) {
    return (
      <p style={{ padding: 16, opacity: 0.7 }}>
        還沒有已儲存的設計 — 生成器存圖後會出現在這裡。
      </p>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Source filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {SOURCE_CHIPS.map((chip) => {
          const count = chip.key === "all"
            ? assets.length
            : assets.filter((a) => a.metadata?.source === chip.key).length;
          if (chip.key !== "all" && count === 0) return null;
          return (
            <button
              key={chip.key}
              className={filter === chip.key ? "btn-primary" : "btn-secondary"}
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label} ({count})
            </button>
          );
        })}
        <button className="btn-secondary" style={{ fontSize: 12, marginLeft: "auto" }} onClick={() => void load()}>
          重新整理
        </button>
      </div>

      <div style={{ opacity: 0.6, fontSize: 12, marginBottom: 10 }}>
        顯示 {visible.length} / {assets.length} 張
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {visible.map((asset) => {
          const src = asset.metadata?.source;
          const cardAspect = isTarot(src) ? "2 / 3" : "1 / 1";
          return (
            <div key={asset.id} className="build-panel" style={{ padding: 10 }}>
              {/* Source chip */}
              <div style={{ fontSize: 11, marginBottom: 6 }}>
                <span
                  style={{
                    background: isTarot(src) ? "rgba(139,92,246,0.15)" : "rgba(59,130,246,0.15)",
                    color: isTarot(src) ? "#a78bfa" : "#60a5fa",
                    borderRadius: 4,
                    padding: "2px 7px",
                  }}
                >
                  {sourceLabel(src)}
                </span>
                {asset.metadata?.card_name ? (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>{asset.metadata.card_name}</span>
                ) : null}
              </div>

              {asset.object_url ? (
                <a href={asset.object_url} target="_blank" rel="noreferrer">
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
                </a>
              ) : (
                <div style={{ aspectRatio: cardAspect, background: "#111", borderRadius: 6 }} />
              )}

              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                {asset.metadata?.model_name ?? "—"} · {formatBytes(asset.byte_size)}
                <br />
                {new Date(asset.created_at).toLocaleString()}
              </div>

              {asset.metadata?.prompt ? (
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.55,
                    marginTop: 4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                  title={asset.metadata.prompt}
                >
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
    </div>
  );
}
