"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APPAREL_PRINT_DESTINATIONS } from "@/lib/studio/apparel-print-destinations";
import { POD_PRODUCT_MODELS, podModelById } from "@/lib/studio/pod-catalog-config";
import { bucketDownloadHref } from "@/lib/storage/download-href";
import { SeoCheckPanel } from "@/app/(shell)/tools/content/SeoCheckPanel";
import type { RankMathReport, RankMathCheck } from "@/lib/seo/rankmath-checker";

interface DesignAsset {
  id: string;
  object_url: string | null;
  metadata: { prompt?: string | null; source?: string | null } | null;
}

interface VariantMapEntry {
  variationId: number;
  color: string;
  // Printful colour name + hex echoed by `create` — pfcreate binds on printfulColor (unique per product).
  printfulColor?: string;
  colorHex?: string;
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


// Suggested retail = 2× wholesale cost (≈50% gross margin), rounded down to a .99 charm price.
// A starting point the operator can override — NOT a hard rule (shipping/fees are separate).
const suggestRetail = (cost: number): string => Math.max(0.99, Math.ceil(cost * 2) - 0.01).toFixed(2);

export default function PublishWizard() {
  // Split the picker by source group so the two actions never share one flooded list:
  //   designAssets → 設計圖 (印刷檔來源, single-select)   mockupAssets → 商品照 (gallery, multi-select)
  // Each is fetched with its own ?group= so the 60-row cap applies per-group — a tarot-flooded
  // gallery can no longer bury mockups out of the 商品照 picker (the洗版 bug we hit live).
  const [designAssets, setDesignAssets] = useState<DesignAsset[]>([]);
  const [mockupAssets, setMockupAssets] = useState<DesignAsset[]>([]);
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [mockupUrls, setMockupUrls] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  // Which T-shirt model to publish (pod-catalog-config). Drives colours (Woo variants) + Printful binding.
  const [catalogProductId, setCatalogProductId] = useState<number>(POD_PRODUCT_MODELS[0].catalogProductId);
  // Multi-client (#6): which configured WooCommerce site to publish to. "" = default site.
  const [bridgeClients, setBridgeClients] = useState<{ id: string; name: string; baseUrl: string }[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [retailPrice, setRetailPrice] = useState("24.99");
  const [plusPrice, setPlusPrice] = useState("26.99");
  const [keywordHint, setKeywordHint] = useState("");
  const [copyInstructions, setCopyInstructions] = useState("");
  // Printful wholesale cost per tier (standard S–XL + plus 2XL) → live profit/margin before publishing.
  const [pricing, setPricing] = useState<{
    state: StepState;
    currency?: string;
    standardCost?: number;
    plusCost?: number;
    standardSize?: string;
    plusSize?: string;
    error?: string;
  }>({ state: "idle" });
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
    printFilePdfUrl?: string;
    achievedPx?: number | null;
    dpi?: number;
    faithful?: boolean;
    meetsTarget?: boolean;
    error?: string;
  }>({ state: "idle" });
  const [productImg, setProductImg] = useState<{ state: StepState; url?: string; error?: string }>({ state: "idle" });
  const [flatlayBg, setFlatlayBg] = useState("#f5f3ee");
  // Optional decorative background (a My Designs image with NO artwork) composited under the design —
  // "" = solid colour only. The backend already accepts + allowlist-validates bgUrl (route.ts flatlay).
  const [flatlayBgUrl, setFlatlayBgUrl] = useState<string>("");
  const [flatlay, setFlatlay] = useState<{ state: StepState; url?: string; error?: string }>({ state: "idle" });
  // Per-colour variation images (Printful colour NAME → My Designs URL) for the STEP-WISE path: the
  // one-click runAll builds its own local map, but manual ② create had none → variants showed no colour
  // image (A2). Populated by runColorMockups, consumed by runCreate. Reset when design/model changes.
  const [colorMockups, setColorMockups] = useState<Record<string, string>>({});
  const [colorGen, setColorGen] = useState<{ state: StepState; stage?: string; count?: number; swatches?: number; error?: string }>({ state: "idle" });
  // Latest derived-image URLs, readable inside the design-change effect without making them deps.
  const lastProductUrlRef = useRef<string | null>(null);
  useEffect(() => { lastProductUrlRef.current = productImg.url ?? null; }, [productImg.url]);
  const lastFlatlayUrlRef = useRef<string | null>(null);
  useEffect(() => { lastFlatlayUrlRef.current = flatlay.url ?? null; }, [flatlay.url]);
  // Live snapshot of the operator's mockup picks — runAll reads THIS (not its frozen closure) so a
  // checkbox toggled during the multi-minute run is still reflected in the published gallery.
  const mockupUrlsRef = useRef<string[]>(mockupUrls);
  useEffect(() => { mockupUrlsRef.current = mockupUrls; }, [mockupUrls]);
  // URLs the LAST one-click run auto-generated (per-colour swatches + flat/model shots). A repeated run
  // drops these before folding in the operator's manual picks, so the gallery doesn't accumulate a fresh
  // ~20-image set every retry (critic 2026-06-23). Reset when the design changes.
  const lastAutoGalleryRef = useRef<string[]>([]);
  // Synchronous re-entrancy latch for runAll — closes the check-then-act gap that the async
  // `busy`-disabled button leaves open (a within-tick double-click would otherwise start two
  // parallel publish chains → duplicate Woo products, since `create` is not idempotent).
  const runAllLatch = useRef(false);
  // Same synchronous latch for the A2 per-colour step. runColorMockups and runAll BOTH write
  // lastAutoGalleryRef + mockupUrls, so they must be mutually exclusive — else an interleaving corrupts
  // the anti-accumulation invariant (critic 2026-06-24). Each guards on BOTH latches; the buttons also
  // cross-disable reactively (busy ↔ colorGen.state).
  const colorGenLatch = useRef(false);
  const [create, setCreate] = useState<{
    state: StepState;
    productId?: number;
    editUrl?: string;
    // The client the product was actually created on (echoed by the route). pfcreate MUST namespace its
    // Printful externalId with THIS — not the live `clientId` state — so a mid-flow site switch can't
    // bind a Printful product to the wrong client's Woo store (critic 2026-06-23, P4-fulfilment guard).
    clientId?: string;
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
  // One-click orchestrator state. runAll runs every step in sequence (print file → product image →
  // flat-lay → AI copy → Woo product → Printful native), threading each step's RESULT through LOCAL
  // variables — React state is async, so later steps cannot read the state earlier ones just set
  // (the stale-closure trap the per-step run* functions avoid by being clicked one at a time).
  const [allRun, setAllRun] = useState<{ state: StepState; stage?: string; error?: string }>({ state: "idle" });

  useEffect(() => {
    void (async () => {
      try {
        // Two grouped fetches: 設計圖 art for the print-file source, mockups for the商品照 gallery.
        // Each pages on its own (PAGE_SIZE, lib/studio/designs-list.ts), so neither starves the other (per-group洗版 fix).
        const [dRes, mRes] = await Promise.all([
          fetch("/api/tools/designs?group=design", { cache: "no-store" }),
          fetch("/api/tools/designs?group=mockup", { cache: "no-store" }),
        ]);
        const dJson = (await dRes.json()) as { ok: boolean; assets?: DesignAsset[] };
        const mJson = (await mRes.json()) as { ok: boolean; assets?: DesignAsset[] };
        if (dJson.ok) setDesignAssets((dJson.assets ?? []).filter((a) => a.object_url));
        if (mJson.ok) setMockupAssets((mJson.assets ?? []).filter((a) => a.object_url));
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

  // Load the configured publish clients (#6). The selector only appears when >1 site is configured;
  // with a single site the default is used silently (original behaviour).
  useEffect(() => {
    void (async () => {
      const json = await post({ action: "clients" });
      if (json.ok && Array.isArray(json.clients)) {
        setBridgeClients(json.clients as { id: string; name: string; baseUrl: string }[]);
      }
    })();
  }, [post]);

  // Generate the Printful OFFICIAL mockup for ONE colour (faithful — real garment + real model shown in
  // THAT colour, via Printful's mockup generator) then persist the Printful CDN image to My Designs.
  // Returns the saved url or null. This is what makes the swatch show the right colour garment.
  const genColorMockup = useCallback(async (colorHex: string, refDesignUrl: string): Promise<{ swatch: string | null; gallery: string[] } | null> => {
    try {
      // Natural dims so Printful preserves aspect ratio (else square fallback squishes tall art).
      const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const im = new window.Image();
        im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight });
        im.onerror = () => resolve(null);
        im.src = refDesignUrl;
      });
      const mRes = await fetch("/api/tools/studio/mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: refDesignUrl, productId: catalogProductId, colorHex, ...(dims ? { imageWidth: dims.width, imageHeight: dims.height } : {}) }),
      });
      const m = (await mRes.json()) as {
        ok: boolean;
        mockup_url?: string;
        mockups?: Array<{ url: string; group: string; view: string; lifestyle?: boolean }>;
      };
      if (!m.ok || !m.mockup_url) return null;
      const views = m.mockups ?? [];
      // SWATCH (the colour's variation image): prefer a real-MODEL straight front — the customer sees the
      // model wearing THAT colour on the swatch. Straight "Front" beats a 3/4 model front; fall back to
      // the clean flat front (mockup_url) when this product returns no model shots.
      const modelFronts = views.filter((v) => v.lifestyle && /front/i.test(v.view) && !/back/i.test(v.view));
      const swatchSource = (modelFronts.find((v) => /^front$/i.test(v.view)) ?? modelFronts[0])?.url ?? m.mockup_url;
      // EXTRA gallery view (#2, refined 2026-06-24 — operator: "每個顏色穿模特各 1 個 + 平拍"): per colour
      // we keep exactly TWO images — the model wearing THAT colour (the swatch above, a real-model front)
      // + ONE clean flat-lay. NO extra model angles (4 colours × many angles would flood the gallery).
      // back views excluded. Printful returns both from the SAME mockup task we already ran (no extra gen).
      // If this colour has no model shot, swatch falls back to the flat front and the flat extra dedups
      // away → that colour shows a single flat image.
      const flatFront = views.find((v) => !v.lifestyle && /front/i.test(v.view) && !/back/i.test(v.view))?.url;
      const extraSources: string[] = [];
      const seen = new Set<string>([swatchSource]);
      const add = (u?: string) => { if (u && !seen.has(u)) { seen.add(u); extraSources.push(u); } };
      add(flatFront);
      // Persist swatch + each extra to My Designs (parallel). A failed save drops that ONE image only —
      // never aborts the colour (best-effort, same spirit as the all-mockups-fail fallback in runAll).
      const save = async (sourceUrl: string): Promise<string | null> => {
        try {
          const sRes = await fetch("/api/tools/designs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceUrl, source: "printful-mockup", prompt: "[auto-colour-mockup]" }),
          });
          const s = (await sRes.json()) as { ok: boolean; asset?: { object_url?: string } };
          return s.ok ? (s.asset?.object_url ?? null) : null;
        } catch {
          return null;
        }
      };
      const [swatch, ...extras] = await Promise.all([save(swatchSource), ...extraSources.map(save)]);
      const gallery = [swatch, ...extras].filter((u): u is string => Boolean(u));
      return { swatch: swatch ?? null, gallery };
    } catch {
      return null;
    }
  }, [catalogProductId]);

  // Changing the design invalidates everything downstream (stale-print-file trap).
  // Deliberate asymmetry: we clear AUTO-DERIVED images (productimage/flatlay — baked from the old
  // design, so definitely stale) but PRESERVE the operator's manually-picked library mockups — a
  // hand-chosen product photo may still be valid and only the operator knows. They can ✕-remove any
  // that no longer fit from the 已選 gallery row (critic Minor — documenting the intent).
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
    lastAutoGalleryRef.current = [];
    setColorMockups({});
    setColorGen({ state: "idle" });
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
  // Switching the T-shirt model invalidates every variant-bound step — a stale variantMap from the
  // previous model (its colours/SKUs) must NOT be carried into pfcreate, which would try to bind the
  // old model's colours against the newly-selected product (critic Phase 1b). Force a re-create.
  // Switching the model OR the target client invalidates every variant-bound step — a product created
  // on the old site/model must not be carried into pfcreate against the new selection.
  useEffect(() => {
    setCreate({ state: "idle" });
    setSync({ state: "idle" });
    setLink({ state: "idle" });
    setPfcreate({ state: "idle" });
    // Switching the model changes the colour set → the per-colour images are stale; clear them.
    setColorMockups({});
    setColorGen({ state: "idle" });
  }, [catalogProductId, clientId]);
  // Fetch the chosen model's Printful wholesale cost (standard + plus tier) so the form shows live
  // profit. Cancellable so a fast model switch can't land a stale product's cost on the new selection.
  useEffect(() => {
    let cancelled = false;
    setPricing({ state: "running" });
    void (async () => {
      const json = await post({ action: "pricing", catalogProductId });
      if (cancelled) return;
      if (!json.ok) {
        setPricing({ state: "error", error: json.error });
        return;
      }
      const p = json.pricing as { currency: string; standardCost: number; plusCost: number; standardSize: string; plusSize: string };
      setPricing({ state: "done", currency: p.currency, standardCost: p.standardCost, plusCost: p.plusCost, standardSize: p.standardSize, plusSize: p.plusSize });
    })();
    return () => { cancelled = true; };
  }, [catalogProductId, post]);

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
      printFilePdfUrl: json.printFilePdfUrl as string | undefined,
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
    const json = await post({ action: "flatlay", designUrl, bgColor: flatlayBg, ...(flatlayBgUrl ? { bgUrl: flatlayBgUrl } : {}) });
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
  }, [designUrl, flatlayBg, flatlayBgUrl, flatlay.url, post]);

  // A2: generate per-colour Printful product images (model + flat-lay) for the STEP-WISE flow, so a
  // manually-built draft (②) also gets colour variation images. Reuses genColorMockup (the shared heavy
  // logic); the thin per-colour loop mirrors runAll's but is kept SEPARATE so this never destabilises the
  // one-click critical path. Stores the colour→swatch map in state + folds the shots into the gallery.
  const runColorMockups = useCallback(async () => {
    // Mutually exclusive with runAll — both write lastAutoGalleryRef/mockupUrls. `busy` (runAll running)
    // also disables this button reactively; the two latches close the within-tick check-then-act gap
    // (the same hardening runAll has via runAllLatch — critic 2026-06-24).
    if (!designUrl || colorGen.state === "running" || colorGenLatch.current || runAllLatch.current) return;
    const model = podModelById(catalogProductId);
    const colors = model?.colors ?? [];
    if (colors.length === 0) return;
    colorGenLatch.current = true;
    try {
      setColorGen({ state: "running" });
      const map: Record<string, string> = {};
      const gallery: string[] = [];
      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        setColorGen({ state: "running", stage: `${c.label}（${i + 1}/${colors.length}）` });
        const r = await genColorMockup(c.hex, designUrl);
        if (r) {
          if (r.swatch) map[c.printfulName] = r.swatch;
          gallery.push(...r.gallery);
        }
      }
      setColorMockups(map);
      // Drop the previous auto-generated set before folding manual picks back in (same anti-accumulation
      // rule as runAll's lastAutoGalleryRef).
      const priorManual = mockupUrlsRef.current.filter((u) => !lastAutoGalleryRef.current.includes(u));
      setMockupUrls(Array.from(new Set([...gallery, ...priorManual])));
      lastAutoGalleryRef.current = gallery;
      setColorGen(
        gallery.length > 0
          ? { state: "done", count: gallery.length, swatches: Object.keys(map).length }
          : { state: "error", error: "每色 mockup 全失敗（Printful 暫時無回應？）" },
      );
    } finally {
      colorGenLatch.current = false;
    }
  }, [designUrl, colorGen.state, catalogProductId, genColorMockup]);

  const runCopy = useCallback(async (fixHints?: string[]): Promise<{ ok: boolean; error?: string; message?: string }> => {
    const isFix = Array.isArray(fixHints) && fixHints.length > 0;
    // Initial generation: show the spinner pill (panel hidden until done). A fix re-gen keeps the
    // existing report on screen — the panel's own "AI 修正中…" flag signals progress — then swaps the
    // fresh report in place (don't blank to "running", which would unmount the panel mid-fix).
    if (!isFix) setCopy({ state: "running" });
    const design = designAssets.find((d) => d.object_url === designUrl);
    const json = await post({
      action: "copy",
      designPrompt: design?.metadata?.prompt ?? undefined,
      subject: title.trim() || undefined,
      productType: "tshirt",
      focusKeywordHint: keywordHint.trim() || undefined,
      instructions: copyInstructions.trim() || undefined,
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
  }, [designAssets, designUrl, title, keywordHint, copyInstructions, post]);

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
      clientId,
      catalogProductId,
      title,
      retailPrice,
      plusPrice,
      sizes: SIZES,
      mockupUrls,
      // Per-colour variation images (A2) — present only if the operator ran 「生成每色商品圖」first;
      // empty {} otherwise (variants then fall back to the gallery main image, the old behaviour).
      ...(Object.keys(colorMockups).length > 0 ? { colorMockups } : {}),
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
      clientId: json.clientId as string | undefined,
      variantMap: json.variantMap as VariantMapEntry[],
      // Surface the source-side "SKU map dropped" signal so the native path can refuse and steer to legacy.
      variantMapDropped: Boolean(json.variantMapDropped),
    });
  }, [clientId, catalogProductId, title, retailPrice, plusPrice, mockupUrls, colorMockups, copy, post]);

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
      // Use the clientId `create` actually used (echoed), not the live selector — guards against a
      // mid-flow site switch namespacing the Printful product against the wrong site (critic 2026-06-23).
      clientId: create.clientId ?? clientId,
      catalogProductId,
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
  }, [clientId, create.clientId, create.productId, create.variantMap, upscale.printFileUrl, upscale.faithful, title, retailPrice, plusPrice, mockupUrls, pfcreate.state, catalogProductId, post]);

  // 🚀 ONE-CLICK: print file → product image → flat-lay → AI copy → Woo product → Printful native, in
  // sequence, aborting on the first hard failure. Each step's payload MIRRORS its run* function above;
  // results are threaded through LOCAL vars (not state) so a later step never reads a stale closure.
  // Each step also updates its own state so the existing pills + success lines render as it progresses.
  const runAll = useCallback(async () => {
    if (!designUrl || title.trim().length < 3 || runAllLatch.current || colorGenLatch.current) return;
    runAllLatch.current = true;
    try {
    // 1) print file (faithful upscale)
    setAllRun({ state: "running", stage: "① 產生印刷檔" });
    setUpscale({ state: "running" });
    const up = await post({ action: "upscale", designUrl, printMode });
    if (!up.ok) {
      setUpscale({ state: "error", error: up.error });
      setAllRun({ state: "error", stage: "① 印刷檔", error: up.error });
      return;
    }
    const printFileUrl = up.printFileUrl as string;
    const faithful = Boolean(up.faithful);
    setUpscale({
      state: "done",
      printFileUrl,
      printFilePdfUrl: up.printFilePdfUrl as string | undefined,
      achievedPx: up.achievedLongEdgePx as number | null,
      dpi: up.dpiAtFullPrint as number | undefined,
      faithful,
      meetsTarget: Boolean(up.meetsTarget),
    });

    // 2) per-colour Printful OFFICIAL mockups — for each colour of the chosen model, generate the real
    //    Printful mockup (faithful garment + model in THAT colour) and save it. Each becomes the colour's
    //    variation image (swatch → right colour) AND a gallery image. First colour = Woo main image.
    const model = podModelById(catalogProductId);
    const colors = model?.colors ?? [];
    const colorMockups: Record<string, string> = {};
    const galleryMockups: string[] = [];
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i];
      setAllRun({ state: "running", stage: `生成 ${c.label} Printful 商品圖（平拍＋模特，${i + 1}/${colors.length}）` });
      const r = await genColorMockup(c.hex, designUrl);
      if (r) {
        // swatch = this colour's variation image; gallery = swatch + flat-lay + model shots (#2).
        if (r.swatch) colorMockups[c.printfulName] = r.swatch;
        galleryMockups.push(...r.gallery);
      }
    }
    // All mockups failing must NOT abort the publish — the print file is already made and the design
    // original is a valid product image. Fall back to it (best-effort) rather than blocking on a
    // transient Printful-mockup outage.
    if (galleryMockups.length === 0) {
      setAllRun({ state: "running", stage: "每色 mockup 全失敗 — 改用設計圖原稿續行" });
    }

    // gallery: per-colour Printful mockups (first colour = main image) + design original + the operator's
    // MANUAL picks. We DROP the previous one-click run's auto-generated mockups (tracked in
    // lastAutoGalleryRef) before folding picks in, so a re-run on the same design replaces — not stacks —
    // the auto set (critic 2026-06-23: a retry would otherwise pile a fresh ~20-image set on the old one).
    const priorManual = mockupUrlsRef.current.filter((u) => !lastAutoGalleryRef.current.includes(u));
    const gallery = Array.from(new Set([...galleryMockups, designUrl, ...priorManual]));
    lastAutoGalleryRef.current = galleryMockups;
    setMockupUrls(gallery);

    // 4) AI SEO/GEO copy — BEST EFFORT (a copy failure must not abort the publish; create tolerates
    // an absent description/seo and falls back to boilerplate).
    setAllRun({ state: "running", stage: "AI 文案（可略）" });
    setCopy({ state: "running" });
    let shortDescription: string | undefined;
    let bullets: string[] | undefined;
    let seo: { focus_keyword?: string; title?: string; description?: string } | undefined;
    const design = designAssets.find((d) => d.object_url === designUrl);
    const cp = await post({
      action: "copy",
      designPrompt: design?.metadata?.prompt ?? undefined,
      subject: title.trim() || undefined,
      productType: "tshirt",
      focusKeywordHint: keywordHint.trim() || undefined,
      instructions: copyInstructions.trim() || undefined,
    });
    if (cp.ok) {
      const c = cp.copy as {
        productTitle: string; focusKeyword: string; metaTitle: string;
        metaDescription: string; shortDescriptionHtml: string; bullets: string[];
      };
      setCopy({
        state: "done",
        focusKeyword: c.focusKeyword,
        metaTitle: c.metaTitle,
        metaDescription: c.metaDescription,
        shortDescriptionHtml: c.shortDescriptionHtml,
        bullets: c.bullets,
        rankMath: cp.rankMath as RankMathReport | undefined,
      });
      shortDescription = c.shortDescriptionHtml;
      bullets = c.bullets;
      seo = c.focusKeyword ? { focus_keyword: c.focusKeyword, title: c.metaTitle, description: c.metaDescription } : undefined;
    } else {
      setCopy({ state: "error", error: cp.error }); // non-fatal — publish continues without SEO copy
    }

    // 5) Woo product (draft) via wp-bridge — variable product + gallery images + variants/SKUs + SEO
    setAllRun({ state: "running", stage: "建 Woo 商品" });
    setCreate({ state: "running" });
    const cr = await post({
      action: "create",
      clientId,
      catalogProductId,
      title,
      retailPrice,
      plusPrice,
      sizes: SIZES,
      mockupUrls: gallery,
      colorMockups,
      shortDescription,
      bullets,
      seo,
    });
    if (!cr.ok) {
      setCreate({ state: "error", error: cr.error });
      setAllRun({ state: "error", stage: "建 Woo 商品", error: cr.error });
      return;
    }
    const productId = cr.product_id as number;
    const variantMap = cr.variantMap as VariantMapEntry[];
    setCreate({
      state: "done",
      productId,
      editUrl: cr.edit_url as string | undefined,
      clientId: cr.clientId as string | undefined,
      variantMap,
      variantMapDropped: Boolean(cr.variantMapDropped),
    });
    if (!hasUsablePfMap(variantMap)) {
      // Woo returned a different variation count than the plan → no SKU map → native path can't bind.
      setAllRun({
        state: "error",
        stage: "上 Printful",
        error: "Woo 變體數與計畫不符，SKU 對照表未產生 — Woo 商品已建好，請用下方分步「🚀 ③」重試或重建草稿。",
      });
      return;
    }

    // 6) Printful native — one call: create product + bind every variant + upload print file
    setAllRun({ state: "running", stage: "上 Printful native" });
    setPfcreate({ state: "running" });
    const pf = await post({
      action: "pfcreate",
      // Namespace with the clientId `create` echoed (same value this closure used) — keep create↔pfcreate
      // in lockstep so the Printful externalId can't point at the wrong client's Woo store.
      clientId: cr.clientId ?? clientId,
      catalogProductId,
      wooProductId: productId,
      title,
      printFileUrl,
      retailPrice,
      plusPrice,
      variantMap,
      mockupUrls: gallery,
    });
    if (!pf.ok) {
      setPfcreate({ state: "error", error: pf.error, retryable: Boolean(pf.retryable) });
      setAllRun({ state: "error", stage: "上 Printful native", error: pf.error });
      return;
    }
    setPfcreate({
      state: "done",
      syncProductId: pf.syncProductId as number,
      variantCount: pf.variantCount as number,
      alreadyExisted: Boolean(pf.alreadyExisted),
      faithful,
    });

    setAllRun({ state: "done" });
    } finally {
      runAllLatch.current = false;
    }
  }, [clientId, designUrl, title, printMode, designAssets, keywordHint, copyInstructions, retailPrice, plusPrice, catalogProductId, genColorMockup, post]);

  const busy = allRun.state === "running";

  // Filename stem for downloaded print files — slugify the product name (ASCII only; the proxy
  // re-sanitises server-side). Falls back to a generic stem when the name is blank/non-ASCII.
  const printFileSlug =
    title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "print-file";

  // Live profit against the Printful wholesale cost. profit = retail − cost; margin = profit / retail.
  const cur = pricing.currency ?? "USD";
  const profitOf = (retail: string, cost?: number): { profit: number; margin: number } | null => {
    const r = Number(retail);
    if (cost == null || !Number.isFinite(r) || r <= 0) return null;
    return { profit: r - cost, margin: ((r - cost) / r) * 100 };
  };
  const stdProfit = profitOf(retailPrice, pricing.standardCost);
  const plusProfit = profitOf(plusPrice, pricing.plusCost);
  const applySuggestedPricing = () => {
    if (busy || pricing.state !== "done") return;
    if (pricing.standardCost != null) setRetailPrice(suggestRetail(pricing.standardCost));
    if (pricing.plusCost != null) setPlusPrice(suggestRetail(pricing.plusCost));
  };

  const pill = (state: StepState) =>
    state === "done" ? "✅" : state === "running" ? "⏳" : state === "error" ? "❌" : "⬜";

  const toggleMockup = (url: string) => {
    if (busy) return; // never mutate the gallery mid-publish
    setMockupUrls((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  };

  // The gallery's FIRST entry is Woo's featured image (pod-product.ts:100 → ProductCreator.php
  // set_image_id). "設為主圖" therefore = move this url to index 0; it also adds it if not yet picked.
  const setAsMain = (url: string) => {
    if (busy) return;
    setMockupUrls((prev) => [url, ...prev.filter((u) => u !== url)]);
  };
  const removeFromGallery = (url: string) => {
    if (busy) return;
    setMockupUrls((prev) => prev.filter((u) => u !== url));
  };

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        <b>🚀 一鍵</b>：選設計圖 + 款式 → 自動 產印刷檔 + <b>每色 Printful 商品圖</b>（每色：模特 1＋平拍 1）+ <b>尺寸表</b> + AI 文案
        → 建 Woo <b>草稿</b>（該款多色 × {SIZES.join("/")}）+ Printful native 綁變體＋傳設計稿（hex 對應，<b>免後台手動匯入</b>）→ 後台 review 後 publish 開賣。
      </p>

      {/* ① 設計圖 picker — 印刷檔來源，單選。只顯示「設計圖」類（mockup 移到 ②，不再擠一起）。
          勾選框讓設計圖原稿也能當一張商品圖（使用者要的 gallery「設計圖 1 張」）。 */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          ① 選<b>設計圖</b>（單選 — 會放大成印刷檔）
          <span style={{ opacity: 0.6 }}>　·　只顯示設計圖類；勾選框可把原稿也加進商品照</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 180, overflowY: "auto" }}>
          {designAssets.map((d) => {
            const isDesign = designUrl === d.object_url;
            const isMockup = mockupUrls.includes(d.object_url!);
            return (
              <div key={d.id} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.object_url!}
                  alt={d.metadata?.prompt ?? d.id}
                  title="左鍵=設為設計圖（印刷檔來源）；勾選框=加入商品照"
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "contain",
                    background: "#111",
                    borderRadius: 6,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.55 : 1,
                    border: isDesign ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                  onClick={() => { if (!busy) setDesignUrl(d.object_url); }}
                />
                <input
                  type="checkbox"
                  checked={isMockup}
                  disabled={busy}
                  onChange={() => toggleMockup(d.object_url!)}
                  style={{ position: "absolute", top: 2, right: 2 }}
                  title="加入商品照"
                />
                {/* When a design原稿 is also checked into the gallery it shows in BOTH sections;
                    this badge makes that duplication read as intentional (critic Minor). */}
                {isMockup ? (
                  <span style={{ position: "absolute", bottom: 2, left: 2, fontSize: 9, background: "var(--green)", color: "var(--btn-primary-text)", padding: "0 3px", borderRadius: 3 }}>已加入商品照</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {designAssets.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>沒有設計圖 — 先去 Studio / Canvas 生成設計並存到 My Designs。</p> : null}
      </div>

      {/* ② 商品照 picker — 上架 gallery，多選 + 設主圖。只顯示「Mockup」類（模特／平拍／合成）。
          已選列把 gallery 排序攤開，第一張 = Woo 主圖（pod-product.ts:100），可一鍵改主圖／移除。 */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          ② 選<b>商品照</b>（多選 — 上架商品圖庫）
          <span style={{ opacity: 0.6 }}>　·　只顯示 Mockup 類（模特／平拍／裝飾合成）</span>
        </div>

        {/* 已選 gallery：順序 = 上架順序，第一張 = 主圖。★ 設主圖 / ✕ 移除 */}
        {mockupUrls.length > 0 ? (
          <div style={{ marginBottom: 8, padding: 8, background: "#0c0c0c", borderRadius: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              已選 {mockupUrls.length} 張 ·{" "}
              <b style={{ color: "var(--yellow)" }}>★ 第一張 = 主圖（上架封面）</b>，其餘進 product gallery
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {mockupUrls.map((url, i) => {
                const isMain = i === 0;
                return (
                  <div key={url} style={{ position: "relative", width: 60 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`商品照 ${i + 1}`}
                      style={{
                        width: 60, height: 60, objectFit: "contain", background: "#111", borderRadius: 6,
                        border: isMain ? "2px solid var(--yellow)" : "2px solid var(--border)",
                      }}
                    />
                    {isMain ? (
                      <span style={{ position: "absolute", top: 0, left: 0, fontSize: 9, background: "var(--yellow)", color: "var(--text-primary)", padding: "0 3px", borderTopLeftRadius: 6, borderBottomRightRadius: 6 }}>主圖</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAsMain(url)}
                        title="設為主圖（移到第一張）"
                        style={{ position: "absolute", top: 0, left: 0, fontSize: 9, lineHeight: 1.5, padding: "0 3px", cursor: busy ? "not-allowed" : "pointer", background: "var(--code-bg)", color: "var(--yellow)", border: "none", borderTopLeftRadius: 6, borderBottomRightRadius: 6 }}
                      >★主圖</button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeFromGallery(url)}
                      title="從商品照移除"
                      style={{ position: "absolute", top: 0, right: 0, fontSize: 10, lineHeight: 1.3, width: 16, height: 16, cursor: busy ? "not-allowed" : "pointer", background: "rgba(0,0,0,0.65)", color: "var(--red)", border: "none", borderRadius: 3 }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 從 Mockup 庫挑（勾選 = 加入商品照） */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 180, overflowY: "auto" }}>
          {mockupAssets.map((d) => {
            const isMockup = mockupUrls.includes(d.object_url!);
            return (
              <div key={d.id} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={d.object_url!}
                  alt={d.metadata?.prompt ?? d.id}
                  title="勾選框=加入商品照"
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "contain",
                    background: "#111",
                    borderRadius: 6,
                    opacity: busy ? 0.55 : 1,
                    border: isMockup ? "2px solid var(--green)" : "2px solid transparent",
                  }}
                />
                <input
                  type="checkbox"
                  checked={isMockup}
                  disabled={busy}
                  onChange={() => toggleMockup(d.object_url!)}
                  style={{ position: "absolute", top: 2, right: 2 }}
                  title="加入商品照"
                />
              </div>
            );
          })}
        </div>
        {mockupAssets.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>沒有商品照 — 先去 <b>Mockup 工具</b>生模特／平拍／裝飾照並「存到 My Designs」，這裡就會出現。</p> : null}
      </div>

      {/* form */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Multi-client (#6): pick which client's WooCommerce site this draft goes to. Only shown when
            more than one bridge client is configured — a single-site setup uses the default silently. */}
        {bridgeClients.length > 1 ? (
          <label style={{ fontSize: 13, flex: "1 1 100%" }}>
            🏬 發佈到（客戶站）
            <select
              className="btn-secondary"
              style={{ width: "100%", marginTop: 4 }}
              value={clientId}
              disabled={busy}
              onChange={(e) => setClientId(e.target.value)}
            >
              {bridgeClients.map((c) => (
                <option key={c.id || "default"} value={c.id}>{c.name}（{c.baseUrl.replace(/^https?:\/\//, "")}）</option>
              ))}
            </select>
            <span style={{ fontSize: 11, opacity: 0.6, display: "block", marginTop: 2 }}>
              不同客戶 = 不同 WooCommerce 站；草稿會建到所選站的後台。切換會清掉已建草稿狀態。
            </span>
          </label>
        ) : null}
        <label style={{ fontSize: 13, flex: "1 1 280px" }}>
          商品名稱
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：Soulful Bloom Tee" />
        </label>
        <label style={{ fontSize: 13, flex: "1 1 280px" }}>
          款式 T-shirt（決定顏色 + Printful 綁定）
          <select
            className="btn-secondary"
            style={{ width: "100%", marginTop: 4 }}
            value={catalogProductId}
            disabled={busy}
            onChange={(e) => setCatalogProductId(Number(e.target.value))}
          >
            {POD_PRODUCT_MODELS.map((m) => (
              <option key={m.catalogProductId} value={m.catalogProductId}>
                {m.displayName}（{m.sleeve === "long" ? "長袖" : "短袖"}）
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, opacity: 0.6, display: "block", marginTop: 2 }}>
            顏色：{(POD_PRODUCT_MODELS.find((m) => m.catalogProductId === catalogProductId)?.colors ?? []).map((c) => c.label).join("、")}
          </span>
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

      {/* 💰 利潤試算 — Printful 履約底價 vs 售價，發佈前就知道賺多少 */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b>💰 利潤試算</b>
          {pricing.state === "running" ? <span style={{ opacity: 0.6 }}>讀取 Printful 底價中…</span> : null}
          {pricing.state === "error" ? (
            <span style={{ color: "var(--yellow)" }}>無法取得 Printful 底價（{pricing.error}）— 仍可手動定價</span>
          ) : null}
          {pricing.state === "done" ? (
            <button className="btn-secondary" type="button" disabled={busy} onClick={applySuggestedPricing} title="以 2× 底價（約 50% 毛利）自動帶入售價，可再改">
              套用建議售價（2×底價）
            </button>
          ) : null}
        </div>
        {pricing.state === "done" ? (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
            {/* Standard tier */}
            <div style={{ background: "#0c0c0c", borderRadius: 6, padding: "8px 12px", minWidth: 200 }}>
              <div style={{ opacity: 0.7, fontSize: 12 }}>標準碼 S–XL（樣本 {pricing.standardSize}）</div>
              <div>底價 {cur} {pricing.standardCost?.toFixed(2)} · 售價 {cur} {retailPrice}</div>
              {stdProfit ? (
                <div style={{ color: stdProfit.profit > 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  利潤 {cur} {stdProfit.profit.toFixed(2)} · 毛利 {stdProfit.margin.toFixed(0)}%
                  {stdProfit.profit <= 0 ? " ⚠ 虧本" : ""}
                </div>
              ) : <div style={{ opacity: 0.6 }}>售價無效</div>}
            </div>
            {/* Plus tier */}
            <div style={{ background: "#0c0c0c", borderRadius: 6, padding: "8px 12px", minWidth: 200 }}>
              <div style={{ opacity: 0.7, fontSize: 12 }}>加大碼 2XL+（樣本 {pricing.plusSize}）</div>
              <div>底價 {cur} {pricing.plusCost?.toFixed(2)} · 售價 {cur} {plusPrice}</div>
              {plusProfit ? (
                <div style={{ color: plusProfit.profit > 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  利潤 {cur} {plusProfit.profit.toFixed(2)} · 毛利 {plusProfit.margin.toFixed(0)}%
                  {plusProfit.profit <= 0 ? " ⚠ 虧本" : ""}
                </div>
              ) : <div style={{ opacity: 0.6 }}>售價無效</div>}
            </div>
          </div>
        ) : null}
        <div style={{ opacity: 0.55, fontSize: 11, marginTop: 6 }}>
          底價 = Printful 單面 DTG 履約成本（不含運費 / 金流手續費）。建議售價僅起點，請依市場與成本自行調整。
        </div>
      </div>

      {/* AI product copy — SEO / GEO / AEO / RankMath */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span>{pill(copy.state)}</span>
        <label style={{ fontSize: 12, flex: "1 1 220px" }}>
          焦點關鍵字（可留空，AI 自選）
          <input className="btn-secondary" style={{ width: "100%", marginTop: 4 }} value={keywordHint} onChange={(e) => setKeywordHint(e.target.value)} placeholder="例：spiritual lotus t-shirt" />
        </label>
        <label style={{ fontSize: 12, flex: "1 1 100%" }}>
          文案指示／品牌語氣（可留空 — 覆寫預設的語氣、語言、品牌；安全規則不受影響）
          <textarea
            className="btn-secondary"
            style={{ width: "100%", marginTop: 4, minHeight: 52, resize: "vertical", fontFamily: "inherit" }}
            value={copyInstructions}
            onChange={(e) => setCopyInstructions(e.target.value)}
            placeholder="例：用繁體中文寫；語氣俏皮溫暖；強調環保水性墨、適合送禮；品牌叫 Soulful Expression"
          />
        </label>
        <button className="btn-secondary" disabled={busy || copy.state === "running"} onClick={() => void runCopy()}>
          {copy.state === "running" ? "生成文案中…" : "AI 生成 SEO 文案（標題＋描述＋RankMath meta）"}
        </button>
        {copy.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{copy.error}</span> : null}
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

      {/* 🚀 ONE-CLICK — runs every step in sequence. The individual step buttons below stay for
          partial re-runs / advanced control, but this is the primary path. */}
      <div className="build-panel" style={{ padding: 14, marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn-primary"
          style={{ fontSize: 15, padding: "10px 18px" }}
          disabled={!designUrl || title.trim().length < 3 || busy || colorGen.state === "running"}
          onClick={() => void runAll()}
          title="一次跑完：產生印刷檔 → 商品圖 → 合成平拍圖 → AI 文案 → 建 Woo 草稿（含全部圖）→ 上 Printful native（建品＋綁變體＋印刷檔）"
        >
          🚀 全部一鍵完成（印刷檔＋AI 批次商品圖＋文案＋Woo＋Printful native）
        </button>
        {busy ? <span style={{ fontSize: 13, color: "var(--accent-text)" }}>⏳ {allRun.stage}…</span> : null}
        {allRun.state === "done" ? (
          <span style={{ fontSize: 13, color: "var(--green)" }}>✅ 全部完成：Woo 草稿 + Printful native 都建好了（含全部商品圖）— 後台 review 後 publish 即可開賣</span>
        ) : null}
        {allRun.state === "error" ? (
          <span style={{ fontSize: 13, color: "var(--red)" }}>❌ 卡在「{allRun.stage}」：{allRun.error}（下方可從該步分步續做）</span>
        ) : null}
        {!designUrl || title.trim().length < 3 ? (
          <span style={{ fontSize: 11, opacity: 0.6 }}>需先選一張設計圖 + 填商品名稱（≥3 字）</span>
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
          <button className="btn-primary" disabled={busy || !designUrl || upscale.state === "running"} onClick={() => void runUpscale()}>
            ① 產生印刷檔
          </button>
          {upscale.printFileUrl ? (
            <>
              <a href={bucketDownloadHref(upscale.printFileUrl, `${printFileSlug}-print.png`)} download style={{ fontSize: 12, fontWeight: 600 }}>⬇ 下載 PNG（300DPI）</a>
              {upscale.printFilePdfUrl ? (
                <a href={bucketDownloadHref(upscale.printFilePdfUrl, `${printFileSlug}-print.pdf`)} download style={{ fontSize: 12, fontWeight: 600 }}>⬇ 下載 PDF（300DPI）</a>
              ) : null}
              <span style={{ fontSize: 12, color: upscale.meetsTarget ? "var(--green)" : "var(--yellow)" }}>
                {upscale.achievedPx ? `${upscale.achievedPx}px` : "尺寸未知"}
                {upscale.achievedPx ? `（300DPI ≈ ${(upscale.achievedPx / 300).toFixed(1)}in 長邊）` : ""}
                {upscale.dpi ? ` · 滿版 16in 約 ${upscale.dpi} DPI` : ""}
                {upscale.faithful ? " · 100% 忠實" : " · AI 增強(非忠實)"}
                {upscale.meetsTarget ? " ✓ 達標(≥225 DPI)" : " ⚠ 未達滿版 300DPI(可印至上方 300DPI 尺寸；滿版會略軟)"}
              </span>
            </>
          ) : null}
          {upscale.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{upscale.error}</span> : null}
        </div>

        {/* Phase 3: two fulfilment routes for the same faithful print file */}
        {upscale.printFileUrl ? (
          <div style={{ fontSize: 11, opacity: 0.85, paddingLeft: 26, display: "flex", flexDirection: "column", gap: 3 }}>
            <span>🌎 {APPAREL_PRINT_DESTINATIONS.printful.note}</span>
            <span>
              🇹🇼 {APPAREL_PRINT_DESTINATIONS["tw-local"].note}{" "}
              {/* Same-origin proxy adds Content-Disposition: attachment → a real one-click download
                  (the cross-origin R2 URL would otherwise just open a tab). */}
              <a href={bucketDownloadHref(upscale.printFileUrl, `${printFileSlug}-print.png`)} download style={{ fontWeight: 600 }}>
                ⬇ PNG
              </a>
              {upscale.printFilePdfUrl ? (
                <>
                  {" · "}
                  <a href={bucketDownloadHref(upscale.printFilePdfUrl, `${printFileSlug}-print.pdf`)} download style={{ fontWeight: 600 }}>
                    ⬇ PDF
                  </a>
                </>
              ) : null}
              {upscale.faithful ? "" : "（注意：目前是 AI 增強檔，非 100% 忠實）"}
            </span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(productImg.state)}</span>
          <button className="btn-secondary" disabled={busy || !designUrl || productImg.state === "running"} onClick={() => void runProductImage()}>
            ⊕ 把這張設計做成產品圖（加入商品照）
          </button>
          {productImg.state === "done" ? <span style={{ fontSize: 12, color: "var(--green)" }}>已加入商品照 ✓（純圖案，忠實）</span> : null}
          {productImg.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{productImg.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{pill(flatlay.state)}</span>
          <button className="btn-secondary" disabled={busy || !designUrl || flatlay.state === "running"} onClick={() => void runFlatlay()}>
            ⊕ 真實平拍（設計 overlay 到背景，忠實）
          </button>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            背景色
            <input type="color" value={flatlayBg} onChange={(e) => setFlatlayBg(e.target.value)} style={{ width: 32, height: 24, padding: 0, border: "none", background: "none" }} />
          </label>
          {/* C8: optional decorative background image from My Designs (no artwork). "" = solid colour. */}
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            裝飾底圖
            <select
              className="btn-secondary"
              value={flatlayBgUrl}
              disabled={busy}
              onChange={(e) => setFlatlayBgUrl(e.target.value)}
              style={{ fontSize: 12, maxWidth: 200 }}
              title="選一張無圖案的背景圖墊在設計下（先在 Studio / Canvas 生成）"
            >
              <option value="">（純色背景）</option>
              {Array.from(new Map([...mockupAssets, ...designAssets].filter((a) => a.object_url).map((a) => [a.object_url!, a])).values()).map((a) => (
                <option key={a.id} value={a.object_url!}>{(a.metadata?.prompt ?? a.id).slice(0, 28)}</option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 11, opacity: 0.55 }}>底圖優先於背景色；要新背景先去 Studio 生無圖案的圖</span>
          {flatlay.state === "done" ? <span style={{ fontSize: 12, color: "var(--green)" }}>已加入商品照 ✓（真實設計，非 AI 重繪）</span> : null}
          {flatlay.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{flatlay.error}</span> : null}
        </div>

        {/* A2: per-colour product images for the STEP-WISE path. One-click runAll does this automatically;
            this button lets a manual ②-create also get colour variation images (model + flat per colour). */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{pill(colorGen.state)}</span>
          <button
            className="btn-secondary"
            disabled={busy || !designUrl || colorGen.state === "running"}
            onClick={() => void runColorMockups()}
            title="為所選款式每個顏色各生 1 模特 + 1 平拍，並設為該色變體圖（手動分步建草稿時用；一鍵已自動含）"
          >
            ⊕ 生成每色商品圖（模特＋平拍）
          </button>
          {colorGen.state === "running" ? <span style={{ fontSize: 12, color: "var(--accent-text)" }}>⏳ {colorGen.stage}…</span> : null}
          {colorGen.state === "done" ? <span style={{ fontSize: 12, color: "var(--green)" }}>已生成 {colorGen.count} 張商品圖，其中 {colorGen.swatches} 張設為各色變體圖 ✓</span> : null}
          {colorGen.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{colorGen.error}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{pill(create.state)}</span>
          <button
            className="btn-primary"
            disabled={busy || create.state === "running" || title.trim().length < 3}
            onClick={() => void runCreate()}
          >
            ② 建 Woo 草稿商品（wp-bridge）
          </button>
          {create.editUrl ? (
            <a href={create.editUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>後台編輯 ↗</a>
          ) : null}
          {create.productId ? <span style={{ fontSize: 12, opacity: 0.7 }}>product #{create.productId}</span> : null}
          {create.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{create.error}</span> : null}
        </div>

        {/* ③ Native store ONE-CLICK full automation — the primary path. One API call creates the
            Printful product, binds every variant, AND uploads the print file. No dashboard import. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{pill(pfcreate.state)}</span>
          <button
            className="btn-primary"
            disabled={busy || !create.productId || !upscale.printFileUrl || !hasUsablePfMap(create.variantMap) || pfcreate.state === "running"}
            onClick={() => void runPfcreate()}
            title="一次建立 Printful 商品 + 綁定所有變體 + 上傳印刷檔（native store，全自動，免後台手動匯入）"
          >
            🚀 ③ 一鍵上 Printful（native 全自動：建品＋綁變體＋印刷檔）
          </button>
          {pfcreate.state === "done" ? (
            <span style={{ fontSize: 12, color: "var(--green)" }}>
              {pfcreate.alreadyExisted ? "已存在（冪等命中）" : "已建立"} ✓ Printful #{pfcreate.syncProductId} · {pfcreate.variantCount} 變體已綁印刷檔（{pfcreate.faithful ? "100% 忠實" : "AI 增強，非忠實"}）— 免手動匯入
            </span>
          ) : null}
          {pfcreate.error ? (
            <span style={{ color: "var(--red)", fontSize: 12 }}>
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
          <div style={{ fontSize: 11, color: "var(--yellow)", paddingLeft: 26 }}>
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
              <button className="btn-secondary" disabled={busy || !create.productId || sync.state === "running"} onClick={() => void runStatus()}>
                ③ 檢查 Printful 同步
              </button>
              {sync.state === "done" ? (
                <span style={{ fontSize: 12 }}>
                  {sync.synced ? "已同步 ✓ 可綁定" : "尚未同步 — 確認商品已在後台 publish（draft 不會同步），再稍候重按"}
                </span>
              ) : null}
              {sync.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{sync.error}</span> : null}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span>{pill(link.state)}</span>
              <button
                className="btn-primary"
                disabled={busy || !sync.synced || !upscale.printFileUrl || link.state === "running"}
                onClick={() => void runLink()}
              >
                ④ 綁定印刷檔（全部變體）
              </button>
              {link.state === "done" ? (
                <span style={{ fontSize: 12 }}>
                  綁定 {link.linkedCount}/{link.total} ✓（印刷檔：{link.faithful ? "100% 忠實" : "AI 增強，非忠實"}）— 後台 review 後 publish 即可開賣
                </span>
              ) : null}
              {link.error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{link.error}</span> : null}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
