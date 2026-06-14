"use client";

import { useCallback, useEffect, useState } from "react";

interface DesignAsset {
  id: string;
  object_url: string | null;
  metadata: { prompt?: string | null; source?: string | null } | null;
}

interface VariantMapEntry {
  variationId: number;
  color: string;
  size: string;
}

type StepState = "idle" | "running" | "done" | "error";
type PrintMode = "original" | "resample" | "ai-enhance";

const SIZES = ["S", "M", "L", "XL", "2XL"];

const PRINT_MODE_LABEL: Record<PrintMode, string> = {
  original: "原圖（100% 忠實）",
  resample: "忠實放大（Lanczos，較軟）",
  "ai-enhance": "AI 增強（Real-ESRGAN，非 100% 忠實）",
};

export default function PublishWizard() {
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [mockupUrls, setMockupUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [retailPrice, setRetailPrice] = useState("24.99");
  const [plusPrice, setPlusPrice] = useState("26.99");

  const [printMode, setPrintMode] = useState<PrintMode>("original");
  const [upscale, setUpscale] = useState<{
    state: StepState;
    printFileUrl?: string;
    achievedPx?: number | null;
    dpi?: number;
    faithful?: boolean;
    meetsTarget?: boolean;
    error?: string;
  }>({ state: "idle" });
  const [productImg, setProductImg] = useState<{ state: StepState; url?: string; error?: string }>({ state: "idle" });
  const [create, setCreate] = useState<{
    state: StepState;
    productId?: number;
    editUrl?: string;
    variantMap?: VariantMapEntry[];
    error?: string;
  }>({ state: "idle" });
  const [sync, setSync] = useState<{ state: StepState; synced?: boolean; error?: string }>({ state: "idle" });
  const [link, setLink] = useState<{ state: StepState; linkedCount?: number; total?: number; faithful?: boolean; error?: string }>({ state: "idle" });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tools/designs", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; assets?: DesignAsset[] };
        if (json.ok) setDesigns((json.assets ?? []).filter((a) => a.object_url));
      } catch {
        /* gallery unavailable */
      }
    })();
  }, []);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/tools/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as Record<string, unknown> & { ok: boolean; error?: string };
  }, []);

  // Changing the design invalidates everything downstream (stale-print-file trap).
  useEffect(() => {
    setUpscale({ state: "idle" });
    setProductImg({ state: "idle" });
    setCreate({ state: "idle" });
    setSync({ state: "idle" });
    setLink({ state: "idle" });
  }, [designUrl]);
  // Changing the fidelity mode invalidates the print file (and the link bound to it).
  useEffect(() => {
    setUpscale({ state: "idle" });
    setLink({ state: "idle" });
  }, [printMode]);

  const runUpscale = useCallback(async () => {
    if (!designUrl) return;
    setUpscale({ state: "running" });
    const json = await post({ action: "upscale", designUrl, printMode });
    if (!json.ok) {
      setUpscale({ state: "error", error: json.error });
      return;
    }
    setUpscale({
      state: "done",
      printFileUrl: json.printFileUrl as string,
      achievedPx: json.achievedLongEdgePx as number | null,
      dpi: json.dpiAtFullPrint as number | undefined,
      faithful: Boolean(json.faithful),
      meetsTarget: Boolean(json.meetsTarget),
    });
  }, [designUrl, printMode, post]);

  const runProductImage = useCallback(async () => {
    if (!designUrl) return;
    setProductImg({ state: "running" });
    const json = await post({ action: "productimage", designUrl });
    if (!json.ok) {
      setProductImg({ state: "error", error: json.error });
      return;
    }
    const url = json.productImageUrl as string;
    // Replace the prior product image (each run mints a fresh UUID URL) — don't accumulate.
    setMockupUrls((prev) => {
      const without = productImg.url ? prev.filter((u) => u !== productImg.url) : prev;
      return without.includes(url) ? without : [...without, url];
    });
    setProductImg({ state: "done", url });
  }, [designUrl, productImg.url, post]);

  const runCreate = useCallback(async () => {
    setCreate({ state: "running" });
    const json = await post({
      action: "create",
      title,
      retailPrice,
      plusPrice,
      sizes: SIZES,
      mockupUrls,
    });
    if (!json.ok) {
      setCreate({ state: "error", error: json.error });
      return;
    }
    setCreate({
      state: "done",
      productId: json.product_id as number,
      editUrl: json.edit_url as string | undefined,
      variantMap: json.variantMap as VariantMapEntry[],
    });
  }, [title, retailPrice, plusPrice, mockupUrls, post]);

  const runStatus = useCallback(async () => {
    if (!create.productId) return;
    setSync({ state: "running" });
    const json = await post({ action: "status", wooProductId: create.productId });
    if (!json.ok) {
      setSync({ state: "error", error: json.error });
      return;
    }
    setSync({ state: "done", synced: Boolean(json.synced) });
  }, [create.productId, post]);

  const runLink = useCallback(async () => {
    if (!create.productId || !upscale.printFileUrl) return;
    setLink({ state: "running" });
    const json = await post({
      action: "link",
      wooProductId: create.productId,
      printFileUrl: upscale.printFileUrl,
      retailPrice,
      plusPrice,
      variantMap: create.variantMap ?? [],
    });
    if (!json.ok) {
      setLink({ state: "error", error: json.error });
      return;
    }
    // Carry the bound print file's faithfulness through so the success line can't
    // claim "100% 忠實" over an ai-enhance file (critic 2026-06-15).
    setLink({ state: "done", linkedCount: json.linkedCount as number, total: json.total as number, faithful: upscale.faithful });
  }, [create.productId, create.variantMap, upscale.printFileUrl, upscale.faithful, retailPrice, plusPrice, post]);

  const pill = (state: StepState) =>
    state === "done" ? "✅" : state === "running" ? "⏳" : state === "error" ? "❌" : "⬜";

  const toggleMockup = (url: string) => {
    setMockupUrls((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  };

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        串連：設計圖 → ① 產生印刷檔（預設<b>原圖 100% 忠實</b>，不改像素）→ ② 建 Woo <b>草稿</b>商品（白/黑 × {SIZES.join("/")}）→
        人工到後台 review 並 <b>publish</b>（Printful 只同步已發布商品，可先設「隱藏」）→ ③ 檢查同步 → ④ 綁定印刷檔 → 設為可見開賣。
      </p>

      {/* design + mockup pickers */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          ① 選<b>設計圖</b>（單選 — 會放大成印刷檔）；② 勾<b>商品照</b>（多選 — 上架用 mockup）
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 180, overflowY: "auto" }}>
          {designs.map((d) => {
            const isDesign = designUrl === d.object_url;
            const isMockup = mockupUrls.includes(d.object_url!);
            return (
              <div key={d.id} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.object_url!}
                  alt={d.metadata?.prompt ?? d.id}
                  title="左鍵=設為設計圖；勾選框=加入商品照"
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "contain",
                    background: "#111",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: isDesign ? "2px solid #4f8cff" : "2px solid transparent",
                  }}
                  onClick={() => setDesignUrl(d.object_url)}
                />
                <input
                  type="checkbox"
                  checked={isMockup}
                  onChange={() => toggleMockup(d.object_url!)}
                  style={{ position: "absolute", top: 2, right: 2 }}
                  title="加入商品照"
                />
              </div>
            );
          })}
        </div>
        {designs.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>圖庫是空的 — 先去 Studio/Mockup 存圖。</p> : null}
      </div>

      {/* form */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, flex: "1 1 280px" }}>
          商品名稱
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：Soulful Bloom Tee" />
        </label>
        <label style={{ fontSize: 13 }}>
          價格（S–XL）
          <input className="btn-secondary" style={{ width: 110, marginTop: 4 }} value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} />
        </label>
        <label style={{ fontSize: 13 }}>
          Plus 價（2XL+）
          <input className="btn-secondary" style={{ width: 110, marginTop: 4 }} value={plusPrice} onChange={(e) => setPlusPrice(e.target.value)} />
        </label>
      </div>

      {/* steps */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{pill(upscale.state)}</span>
          <label style={{ fontSize: 12 }}>
            印刷檔模式{" "}
            <select
              className="btn-secondary"
              value={printMode}
              onChange={(e) => setPrintMode(e.target.value as PrintMode)}
              style={{ fontSize: 12 }}
            >
              {(Object.keys(PRINT_MODE_LABEL) as PrintMode[]).map((m) => (
                <option key={m} value={m}>{PRINT_MODE_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <button className="btn-primary" disabled={!designUrl || upscale.state === "running"} onClick={() => void runUpscale()}>
            ① 產生印刷檔
          </button>
          {upscale.printFileUrl ? (
            <>
              <a href={upscale.printFileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>印刷檔 ↗</a>
              <span style={{ fontSize: 12, color: upscale.meetsTarget ? "#46a758" : "#f5a623" }}>
                {upscale.achievedPx ? `${upscale.achievedPx}px` : "尺寸未知"}
                {upscale.dpi ? ` · 滿版約 ${upscale.dpi} DPI` : ""}
                {upscale.faithful ? " · 100% 忠實" : " · AI 增強(非忠實)"}
                {upscale.meetsTarget ? " ✓ 達標(≥225 DPI)" : " ⚠ 未達 300DPI(滿版可能略軟；小尺寸印刷仍清晰)"}
              </span>
            </>
          ) : null}
          {upscale.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{upscale.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(productImg.state)}</span>
          <button className="btn-secondary" disabled={!designUrl || productImg.state === "running"} onClick={() => void runProductImage()}>
            ⊕ 把這張設計做成產品圖（加入商品照）
          </button>
          {productImg.state === "done" ? <span style={{ fontSize: 12, color: "#46a758" }}>已加入商品照 ✓（純圖案，忠實）</span> : null}
          {productImg.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{productImg.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(create.state)}</span>
          <button
            className="btn-primary"
            disabled={create.state === "running" || title.trim().length < 3}
            onClick={() => void runCreate()}
          >
            ② 建 Woo 草稿商品（wp-bridge）
          </button>
          {create.editUrl ? (
            <a href={create.editUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>後台編輯 ↗</a>
          ) : null}
          {create.productId ? <span style={{ fontSize: 12, opacity: 0.7 }}>product #{create.productId}</span> : null}
          {create.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{create.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(sync.state)}</span>
          <button className="btn-secondary" disabled={!create.productId || sync.state === "running"} onClick={() => void runStatus()}>
            ③ 檢查 Printful 同步
          </button>
          {sync.state === "done" ? (
            <span style={{ fontSize: 12 }}>
              {sync.synced ? "已同步 ✓ 可綁定" : "尚未同步 — 確認商品已在後台 publish（draft 不會同步），再稍候重按"}
            </span>
          ) : null}
          {sync.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{sync.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(link.state)}</span>
          <button
            className="btn-primary"
            disabled={!sync.synced || !upscale.printFileUrl || link.state === "running"}
            onClick={() => void runLink()}
          >
            ④ 綁定印刷檔（全部變體）
          </button>
          {link.state === "done" ? (
            <span style={{ fontSize: 12 }}>
              綁定 {link.linkedCount}/{link.total} ✓（印刷檔：{link.faithful ? "100% 忠實" : "AI 增強，非忠實"}）— 後台 review 後 publish 即可開賣
            </span>
          ) : null}
          {link.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{link.error}</span> : null}
        </div>
      </div>
    </div>
  );
}
