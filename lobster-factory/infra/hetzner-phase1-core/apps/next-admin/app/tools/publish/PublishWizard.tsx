"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APPAREL_PRINT_DESTINATIONS } from "@/lib/studio/apparel-print-destinations";
import { SeoCheckPanel } from "@/app/tools/content/SeoCheckPanel";
import type { RankMathReport, RankMathCheck } from "@/lib/seo/rankmath-checker";

interface DesignAsset {
  id: string;
  object_url: string | null;
  metadata: { prompt?: string | null; source?: string | null } | null;
}

interface VariantMapEntry {
  variationId: number;
  color: string;
  size: string;
  // Echoed by `create` — the authoritative SKU (P4 join key) + price that pfcreate consumes verbatim.
  sku: string;
  price: string;
}

type StepState = "idle" | "running" | "done" | "error";
type PrintMode = "original" | "resample" | "ai-enhance";

const SIZES = ["S", "M", "L", "XL", "2XL"];

const PRINT_MODE_LABEL: Record<PrintMode, string> = {
  original: "原圖（100% 忠實）",
  resample: "忠實放大（Lanczos，較軟）",
  "ai-enhance": "AI 增強（Real-ESRGAN，非 100% 忠實）",
};

// Mirror the backend pfcreate vmap filter (route.ts:444-452 + PRICE_RE :79): a usable native-path map
// needs ≥1 entry AND every entry carries a non-empty SKU + a well-formed price. Sharing ONE predicate
// front↔back keeps the 🚀 button's disabled state aligned with the 400 (variantMap_required) contract even
// if buildVariantPlan changes its price/SKU format later (critic 2026-06-15 — hidden-coupling guard).
const PF_PRICE_RE = /^\d+(\.\d{1,2})?$/;
const hasUsablePfMap = (vmap?: VariantMapEntry[]): boolean =>
  Array.isArray(vmap) &&
  vmap.length > 0 &&
  vmap.every((m) => typeof m?.sku === "string" && m.sku.length > 0 && typeof m?.price === "string" && PF_PRICE_RE.test(m.price));

export default function PublishWizard() {
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [mockupUrls, setMockupUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [retailPrice, setRetailPrice] = useState("24.99");
  const [plusPrice, setPlusPrice] = useState("26.99");
  const [keywordHint, setKeywordHint] = useState("");
  // AI SEO/GEO/AEO/RankMath product copy (Phase 4).
  const [copy, setCopy] = useState<{
    state: StepState;
    focusKeyword?: string;
    metaTitle?: string;
    metaDescription?: string;
    shortDescriptionHtml?: string;
    bullets?: string[];
    // Full 16-check RankMath report (6 blog-only checks marked N/A) → rendered in <SeoCheckPanel>.
    // Score/grade are read from rankMath directly — no separate mirror fields (avoids drift).
    rankMath?: RankMathReport;
    error?: string;
  }>({ state: "idle" });
  // Latest copy snapshot for the never-regress AI-fix compare (avoids a stale closure over `copy`).
  const copyRef = useRef(copy);
  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

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
  const [flatlayBg, setFlatlayBg] = useState("#f5f3ee");
  const [flatlay, setFlatlay] = useState<{ state: StepState; url?: string; error?: string }>({ state: "idle" });
  // Latest derived-image URLs, readable inside the design-change effect without making them deps.
  const lastProductUrlRef = useRef<string | null>(null);
  useEffect(() => { lastProductUrlRef.current = productImg.url ?? null; }, [productImg.url]);
  const lastFlatlayUrlRef = useRef<string | null>(null);
  useEffect(() => { lastFlatlayUrlRef.current = flatlay.url ?? null; }, [flatlay.url]);
  const [create, setCreate] = useState<{
    state: StepState;
    productId?: number;
    editUrl?: string;
    variantMap?: VariantMapEntry[];
    // Woo returned a different variation_id count than our plan → SKU map dropped at the source.
    // The native one-click path needs the SKU map, so surface this and steer to the legacy fallback.
    variantMapDropped?: boolean;
    error?: string;
  }>({ state: "idle" });
  const [sync, setSync] = useState<{ state: StepState; synced?: boolean; error?: string }>({ state: "idle" });
  const [link, setLink] = useState<{ state: StepState; linkedCount?: number; total?: number; faithful?: boolean; error?: string }>({ state: "idle" });
  // Native store one-click: create Printful product + bind every variant + print file in ONE call
  // (replaces the status→link dance, which only ever worked via manual dashboard import on the Woo store).
  const [pfcreate, setPfcreate] = useState<{
    state: StepState;
    syncProductId?: number;
    variantCount?: number;
    alreadyExisted?: boolean;
    // Captured at create-time so the success line can't claim "100% 忠實" over an ai-enhance file
    // (same trap runLink guards against — upscale.faithful could drift; the reset effects keep it honest).
    faithful?: boolean;
    retryable?: boolean;
    error?: string;
  }>({ state: "idle" });

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
    // Drop the previous design's product image from the picker (it's stale now).
    const stale = lastProductUrlRef.current;
    if (stale) setMockupUrls((prev) => prev.filter((u) => u !== stale));
    lastProductUrlRef.current = null;
    setProductImg({ state: "idle" });
    const staleFlat = lastFlatlayUrlRef.current;
    if (staleFlat) setMockupUrls((prev) => prev.filter((u) => u !== staleFlat));
    lastFlatlayUrlRef.current = null;
    setFlatlay({ state: "idle" });
    setCopy({ state: "idle" });
    setCreate({ state: "idle" });
    setSync({ state: "idle" });
    setLink({ state: "idle" });
    setPfcreate({ state: "idle" });
  }, [designUrl]);
  // Changing the fidelity mode invalidates the print file (and anything bound to it).
  useEffect(() => {
    setUpscale({ state: "idle" });
    setLink({ state: "idle" });
    setPfcreate({ state: "idle" });
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

  // Faithful flat-lay: the REAL design composited on a background (no AI redraw).
  const runFlatlay = useCallback(async () => {
    if (!designUrl) return;
    setFlatlay({ state: "running" });
    const json = await post({ action: "flatlay", designUrl, bgColor: flatlayBg });
    if (!json.ok) {
      setFlatlay({ state: "error", error: json.error });
      return;
    }
    const url = json.flatlayUrl as string;
    setMockupUrls((prev) => {
      const without = flatlay.url ? prev.filter((u) => u !== flatlay.url) : prev;
      return without.includes(url) ? without : [...without, url];
    });
    setFlatlay({ state: "done", url });
  }, [designUrl, flatlayBg, flatlay.url, post]);

  const runCopy = useCallback(async (fixHints?: string[]): Promise<{ ok: boolean; error?: string; message?: string }> => {
    const isFix = Array.isArray(fixHints) && fixHints.length > 0;
    // Initial generation: show the spinner pill (panel hidden until done). A fix re-gen keeps the
    // existing report on screen — the panel's own "AI 修正中…" flag signals progress — then swaps the
    // fresh report in place (don't blank to "running", which would unmount the panel mid-fix).
    if (!isFix) setCopy({ state: "running" });
    const design = designs.find((d) => d.object_url === designUrl);
    const json = await post({
      action: "copy",
      designPrompt: design?.metadata?.prompt ?? undefined,
      subject: title.trim() || undefined,
      productType: "tshirt",
      focusKeywordHint: keywordHint.trim() || undefined,
      ...(isFix ? { fixHints } : {}),
    });
    if (!json.ok) {
      if (!isFix) setCopy({ state: "error", error: json.error });
      return { ok: false, error: json.error };
    }
    const c = json.copy as {
      productTitle: string; focusKeyword: string; metaTitle: string;
      metaDescription: string; shortDescriptionHtml: string; bullets: string[];
    };
    const rm = json.rankMath as RankMathReport | undefined;
    // Never-regress guard (fix path only): a fix is a full re-roll, so a fresh generation is stochastic.
    // Rule: adopt the re-roll ONLY when it scores STRICTLY higher than what's on screen — equal or lower
    // keeps the current copy. (Equal score = no improvement, so don't churn the operator's copy for a
    // wash.) Capture the on-screen score BEFORE mutating, via copyRef (the `copy` closure is stale inside
    // this useCallback). (-1 prevScore = first fix / no baseline → always adopt.)
    const prevScore = isFix ? copyRef.current.rankMath?.score ?? -1 : -1;
    const newScore = rm?.score ?? -1;
    if (isFix && prevScore >= 0 && newScore <= prevScore) {
      return {
        ok: true,
        message: `重生${newScore < 0 ? "未取得分數" : ` ${newScore} 分`}未超過原版，保留 ${prevScore} 分`,
      };
    }
    // Fill the product title if the operator left it blank — never overwrite their input.
    setTitle((prev) => (prev.trim().length === 0 ? c.productTitle : prev));
    setCopy({
      state: "done",
      focusKeyword: c.focusKeyword,
      metaTitle: c.metaTitle,
      metaDescription: c.metaDescription,
      shortDescriptionHtml: c.shortDescriptionHtml,
      bullets: c.bullets,
      rankMath: rm,
    });
    // Reached only on a strictly-better re-roll (or the first generation with no prior baseline).
    if (isFix) {
      return { ok: true, message: prevScore < 0 ? undefined : `${prevScore} → ${newScore} ↑` };
    }
    return { ok: true };
  }, [designs, designUrl, title, keywordHint, post]);

  // Product AI-fix: regenerate the copy, feeding the failed checks' suggestions back as hints. Product
  // copy is structured (6 fields), so the fix is a re-generate — NOT the Markdown /api/content/seo-fix
  // rewrite path (that endpoint only handles free-form blog articles).
  const fixCopy = useCallback(
    async (failed: RankMathCheck[]): Promise<{ ok: boolean; error?: string; message?: string }> => {
      const hints = failed.map((c) => c.suggestion || c.label).filter((h) => h.length > 0);
      if (hints.length === 0) return { ok: true };
      return runCopy(hints);
    },
    [runCopy],
  );

  const runCreate = useCallback(async () => {
    setCreate({ state: "running" });
    const json = await post({
      action: "create",
      title,
      retailPrice,
      plusPrice,
      sizes: SIZES,
      mockupUrls,
      // AI copy (Phase 4) — short description body + bullets + RankMath SEO meta.
      shortDescription: copy.shortDescriptionHtml,
      bullets: copy.bullets,
      seo: copy.focusKeyword
        ? { focus_keyword: copy.focusKeyword, title: copy.metaTitle, description: copy.metaDescription }
        : undefined,
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
      // Surface the source-side "SKU map dropped" signal so the native path can refuse and steer to legacy.
      variantMapDropped: Boolean(json.variantMapDropped),
    });
  }, [title, retailPrice, plusPrice, mockupUrls, copy, post]);

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

  // Native full-auto: one call creates the Printful product, binds every catalog variant, AND uploads
  // the print file — no dashboard import, no "is it synced yet?" polling. Consumes create's variantMap
  // verbatim (authoritative SKUs) and the upscaled print file. Replaces runStatus + runLink.
  const runPfcreate = useCallback(async () => {
    if (!create.productId || !upscale.printFileUrl) return;
    // Backend rejects a variantMap whose entries lack a usable SKU/price with 400 (variantMap_required);
    // mirror that exact contract here so the button never fires a guaranteed-to-fail call with a misleading
    // error. Also block double-submit.
    if (!hasUsablePfMap(create.variantMap)) return;
    if (pfcreate.state === "running") return;
    setPfcreate({ state: "running" });
    const json = await post({
      action: "pfcreate",
      wooProductId: create.productId,
      title,
      printFileUrl: upscale.printFileUrl,
      retailPrice,
      plusPrice,
      variantMap: create.variantMap ?? [],
      mockupUrls,
    });
    if (!json.ok) {
      setPfcreate({ state: "error", error: json.error, retryable: Boolean(json.retryable) });
      return;
    }
    setPfcreate({
      state: "done",
      syncProductId: json.syncProductId as number,
      variantCount: json.variantCount as number,
      alreadyExisted: Boolean(json.alreadyExisted),
      faithful: upscale.faithful,
    });
  }, [create.productId, create.variantMap, upscale.printFileUrl, upscale.faithful, title, retailPrice, plusPrice, mockupUrls, pfcreate.state, post]);

  const pill = (state: StepState) =>
    state === "done" ? "✅" : state === "running" ? "⏳" : state === "error" ? "❌" : "⬜";

  const toggleMockup = (url: string) => {
    setMockupUrls((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  };

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        串連：設計圖 → ① 產生印刷檔（預設<b>原圖 100% 忠實</b>，不改像素）→ ② 建 Woo <b>草稿</b>商品（白/黑 × {SIZES.join("/")}）→
        ③ <b>🚀 一鍵上 Printful</b>（native store 全自動：一次建品＋綁所有變體＋上傳印刷檔，<b>免後台手動匯入</b>）→ 後台 review 後 publish 開賣。
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

      {/* AI product copy — SEO / GEO / AEO / RankMath */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>{pill(copy.state)}</span>
        <label style={{ fontSize: 12, flex: "1 1 220px" }}>
          焦點關鍵字（可留空，AI 自選）
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={keywordHint} onChange={(e) => setKeywordHint(e.target.value)} placeholder="例：spiritual lotus t-shirt" />
        </label>
        <button className="btn-secondary" disabled={copy.state === "running"} onClick={() => void runCopy()}>
          {copy.state === "running" ? "生成文案中…" : "AI 生成 SEO 文案（標題＋描述＋RankMath meta）"}
        </button>
        {copy.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{copy.error}</span> : null}
        {copy.state === "done" && copy.rankMath ? (
          <div style={{ flexBasis: "100%" }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              建立草稿（②）時會自動帶入短描述 + RankMath meta（焦點字／SEO 標題／描述）。下方為完整
              RankMath / SEO / GEO / AEO 檢測（長文專屬項標「不適用」，分數只計商品適用項）；
              失敗項可按「🤖 AI 自動修正 SEO」重新生成文案：
            </span>
            <SeoCheckPanel
              report={copy.rankMath}
              loading={false}
              focusKeyword={copy.focusKeyword}
              seoTitle={copy.metaTitle}
              metaDescription={copy.metaDescription}
              onFix={fixCopy}
            />
          </div>
        ) : null}
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

        {/* Phase 3: two fulfilment routes for the same faithful print file */}
        {upscale.printFileUrl ? (
          <div style={{ fontSize: 11, opacity: 0.85, paddingLeft: 26, display: "flex", flexDirection: "column", gap: 3 }}>
            <span>🌎 {APPAREL_PRINT_DESTINATIONS.printful.note}</span>
            <span>
              🇹🇼 {APPAREL_PRINT_DESTINATIONS["tw-local"].note}{" "}
              {/* R2 is cross-origin → the download attr is ignored by browsers; open in a tab and 另存 instead. */}
              <a href={upscale.printFileUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                開啟台灣印刷檔（右鍵另存）↗
              </a>
              {upscale.faithful ? "" : "（注意：目前是 AI 增強檔，非 100% 忠實）"}
            </span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(productImg.state)}</span>
          <button className="btn-secondary" disabled={!designUrl || productImg.state === "running"} onClick={() => void runProductImage()}>
            ⊕ 把這張設計做成產品圖（加入商品照）
          </button>
          {productImg.state === "done" ? <span style={{ fontSize: 12, color: "#46a758" }}>已加入商品照 ✓（純圖案，忠實）</span> : null}
          {productImg.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{productImg.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{pill(flatlay.state)}</span>
          <button className="btn-secondary" disabled={!designUrl || flatlay.state === "running"} onClick={() => void runFlatlay()}>
            ⊕ 真實平拍（設計 overlay 到背景，忠實）
          </button>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            背景色
            <input type="color" value={flatlayBg} onChange={(e) => setFlatlayBg(e.target.value)} style={{ width: 32, height: 24, padding: 0, border: "none", background: "none" }} />
          </label>
          <span style={{ fontSize: 11, opacity: 0.6 }}>（要 AI 裝飾背景：先在 Studio 生成無圖案的背景圖，之後版本可選為底）</span>
          {flatlay.state === "done" ? <span style={{ fontSize: 12, color: "#46a758" }}>已加入商品照 ✓（真實設計，非 AI 重繪）</span> : null}
          {flatlay.error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{flatlay.error}</span> : null}
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

        {/* ③ Native store ONE-CLICK full automation — the primary path. One API call creates the
            Printful product, binds every variant, AND uploads the print file. No dashboard import. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{pill(pfcreate.state)}</span>
          <button
            className="btn-primary"
            disabled={!create.productId || !upscale.printFileUrl || !hasUsablePfMap(create.variantMap) || pfcreate.state === "running"}
            onClick={() => void runPfcreate()}
            title="一次建立 Printful 商品 + 綁定所有變體 + 上傳印刷檔（native store，全自動，免後台手動匯入）"
          >
            🚀 ③ 一鍵上 Printful（native 全自動：建品＋綁變體＋印刷檔）
          </button>
          {pfcreate.state === "done" ? (
            <span style={{ fontSize: 12, color: "#46a758" }}>
              {pfcreate.alreadyExisted ? "已存在（冪等命中）" : "已建立"} ✓ Printful #{pfcreate.syncProductId} · {pfcreate.variantCount} 變體已綁印刷檔（{pfcreate.faithful ? "100% 忠實" : "AI 增強，非忠實"}）— 免手動匯入
            </span>
          ) : null}
          {pfcreate.error ? (
            <span style={{ color: "#e5484d", fontSize: 12 }}>
              {pfcreate.error}{pfcreate.retryable ? "（可重試）" : ""}
            </span>
          ) : null}
        </div>
        {!create.productId || !upscale.printFileUrl ? (
          <div style={{ fontSize: 11, opacity: 0.6, paddingLeft: 26 }}>
            需先完成 ① 產生印刷檔 + ② 建 Woo 草稿商品，才能一鍵上架。
          </div>
        ) : create.variantMapDropped || !hasUsablePfMap(create.variantMap) ? (
          // create 成功但 Woo 回傳的 variation_id 數與計畫不符 → SKU 對照表在源頭被丟棄，native 路徑無 SKU 可綁。
          <div style={{ fontSize: 11, color: "#f5a623", paddingLeft: 26 }}>
            ⚠ 建立草稿時 Woo 回傳的變體數與計畫不符，SKU 對照表未產生，無法走一鍵 native 路徑。
            請改用下方「進階：舊 Woo store 手動同步路徑」，或重新建立草稿商品（②）。
          </div>
        ) : null}

        {/* Legacy fallback: the Woo-platform store manual sync dance — demoted (it requires a human
            dashboard import and never achieved full automation; the native path above supersedes it). */}
        <details style={{ paddingLeft: 26 }}>
          <summary style={{ fontSize: 11, opacity: 0.6, cursor: "pointer" }}>
            進階：舊 Woo store 手動同步路徑（③ 檢查同步 / ④ 綁定）
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
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
        </details>
      </div>
    </div>
  );
}
