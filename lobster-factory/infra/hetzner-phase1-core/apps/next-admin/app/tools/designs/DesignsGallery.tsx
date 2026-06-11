"use client";

import { useCallback, useEffect, useState } from "react";

interface DesignAsset {
  id: string;
  object_key: string;
  object_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
  metadata: { prompt?: string | null; model_name?: string | null } | null;
}

type LoadState = "loading" | "ready" | "error" | "disabled";

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

  useEffect(() => {
    void load();
  }, [load]);

  const copyUrl = useCallback(async (asset: DesignAsset) => {
    if (!asset.object_url) return;
    try {
      await navigator.clipboard.writeText(asset.object_url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable (http / permissions) — UI just skips the toast */
    }
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
  if (assets.length === 0) {
    return (
      <p style={{ padding: 16, opacity: 0.7 }}>
        還沒有已儲存的設計 — 生成器存圖後會出現在這裡。
      </p>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ opacity: 0.7 }}>{assets.length} 張設計（最新在前）</span>
        <button className="btn-secondary" onClick={() => void load()}>重新整理</button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {assets.map((asset) => (
          <div key={asset.id} className="build-panel" style={{ padding: 10 }}>
            {asset.object_url ? (
              <a href={asset.object_url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.object_url}
                  alt={asset.metadata?.prompt ?? asset.object_key}
                  loading="lazy"
                  style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "#111", borderRadius: 6 }}
                />
              </a>
            ) : (
              <div style={{ aspectRatio: "1 / 1", background: "#111", borderRadius: 6 }} />
            )}
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6, wordBreak: "break-all" }}>
              {asset.metadata?.model_name ?? "—"} · {formatBytes(asset.byte_size)} ·{" "}
              {new Date(asset.created_at).toLocaleString()}
            </div>
            {asset.metadata?.prompt ? (
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.6,
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
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => void copyUrl(asset)}>
                {copiedId === asset.id ? "已複製 ✓" : "複製 URL"}
              </button>
              {asset.object_url ? (
                <a className="btn-secondary" style={{ fontSize: 12 }} href={asset.object_url} download>
                  下載
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
