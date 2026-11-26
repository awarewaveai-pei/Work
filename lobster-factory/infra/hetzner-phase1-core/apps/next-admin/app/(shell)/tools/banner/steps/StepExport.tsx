"use client";
import { useState } from "react";
import { CANVAS_STAFF_HREF, canvasTarget, openInCanvas } from "@/components/tools/canvas-handoff";
import { useDoorHref } from "@/app/DoorContext";
import { saveDesign, urlToBlob } from "@/lib/studio/design-upload";
import { buildBannerPsd, buildBannerSvg, rasterize } from "../banner-layers";
import { aiBgPromptOf } from "../banner-state";
import { bannerLayers, bytesToDataUrl, downloadUrl, encodeDesign, exportToPng, exportToPsd, exportToSvg, pngOfPixels, textDataUrl } from "./export-files";
import type { StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

export default function StepExport({ slot, s, setS, saveOrg, targetKb, setTargetKb }: StepCtx & {
  slot: StepSlot; saveOrg: string | null; targetKb: string; setTargetKb(v: string): void;
}) {
  const canvasHref = useDoorHref(CANVAS_STAFF_HREF);
  const vectorHref = useDoorHref(canvasTarget(".svg").staffHref);
  const [lossyNote, setLossyNote] = useState<string | null>(null);
  const designsHref = useDoorHref("/tools/designs");
  const effectiveBgPrompt = aiBgPromptOf(s);

  async function handleSave() {
    setS((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const png = await exportToPng(s);
      const res = await saveDesign(await urlToBlob(png), {
        source:    "banner",
        prompt:    s.headline || (s.bgMode === "ai" ? effectiveBgPrompt : undefined) || undefined,
        modelName: s.bgMode === "ai" ? s.aiBgModel : undefined,
        subject:   s.preset,
      }, { organizationId: saveOrg ?? undefined });
      if (!res.ok) throw new Error((res as { ok: false; error: string }).error);
      setS((prev) => ({ ...prev, saving: false, saved: true }));
    } catch (err) {
      setS((prev) => ({ ...prev, saving: false, error: String(err) }));
    }
  }

  async function handleDownload() {
    try {
      downloadUrl(await exportToPng(s), `banner-${s.preset}.png`);
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  // JPG / WebP: 目標 KB empty = quality 0.92; filled = squeezed to <= that size (lossyNote says when it could not be).
  async function handleDownloadLossy(kind: "jpg" | "webp") {
    setLossyNote(null);
    try {
      const kb = Number(targetKb);
      const out = await encodeDesign(s, kind, Number.isFinite(kb) && kb > 0 ? kb : null);
      downloadUrl(out.url, `banner-${s.preset}.${kind}`);
      if (out.note) setLossyNote(out.note);
    } catch (err) {
      setLossyNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDownloadPsd() {
    try {
      downloadUrl(bytesToDataUrl(await exportToPsd(s), "image/vnd.adobe.photoshop"), `banner-${s.preset}.psd`);
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  async function handleDownloadSvg() {
    try {
      downloadUrl(textDataUrl(await exportToSvg(s), "image/svg+xml"), `banner-${s.preset}.svg`);
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  // 專業版: PhotoCraft opens the layered PSD (type layers stay editable text), VectorCraft the layered SVG.
  async function handleOpenInPhotoPro() {
    if (!canvasHref) return;
    try {
      const raster = rasterize(await bannerLayers(s));
      const png = pngOfPixels(raster.composite);
      const base = `banner-${s.preset}`;
      void openInCanvas(png, base, canvasHref, { url: bytesToDataUrl(buildBannerPsd(raster), "image/vnd.adobe.photoshop"), name: `${base}.psd` });
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  async function handleOpenInVectorPro() {
    if (!vectorHref) return;
    try {
      const raster = rasterize(await bannerLayers(s));
      const png = pngOfPixels(raster.composite);
      const base = `banner-${s.preset}`;
      void openInCanvas(png, base, vectorHref, { url: textDataUrl(buildBannerSvg(raster, pngOfPixels), "image/svg+xml"), name: `${base}.svg` });
    } catch (err) {
      setS((prev) => ({ ...prev, error: String(err) }));
    }
  }

  return (
    <StepCard title={slot.title} step={slot.no} icon="📦" summary={s.saved ? "✓ 已存到圖庫" : "圖庫 · PNG / JPG / WebP / PSD / SVG"}>
      <div style={{ marginTop: 8 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleSave}
          disabled={s.saving || s.generating || s.productRemoving}>
          {s.saving ? "儲存中…" : s.saved ? "✓ 已存到圖庫" : "存到圖庫"}
        </button>
        <button className="btn btn-ghost" onClick={handleDownload}
          disabled={s.generating || s.productRemoving}>
          下載 PNG
        </button>
      </div>
      {/* JPG / WebP: optional size target (KB); PNG is lossless, so it has none */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={() => void handleDownloadLossy("jpg")} data-testid="banner-download-jpg"
          disabled={s.generating || s.productRemoving}>
          下載 JPG
        </button>
        <button className="btn btn-ghost" onClick={() => void handleDownloadLossy("webp")} data-testid="banner-download-webp"
          disabled={s.generating || s.productRemoving}>
          下載 WebP
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          目標
          <input className="form-input" type="number" min={1} step={1} inputMode="numeric" placeholder="不限"
            value={targetKb} onChange={(e) => { setTargetKb(e.target.value); setLossyNote(null); }}
            style={{ width: 80, fontSize: 12 }} data-testid="banner-target-kb" />
          KB
        </label>
      </div>
      <p className="form-hint" style={{ margin: "4px 0 0" }}>目標空白＝畫質 92%；填了就壓到不超過這個大小。</p>
      {lossyNote && <p className="form-hint" style={{ margin: "4px 0 0", color: "var(--badge-red-text)" }}>{lossyNote}</p>}
      {/* editable layers: text stays text (PSD type layers / SVG <text>) */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={() => void handleDownloadPsd()} data-testid="banner-download-psd"
          disabled={s.generating || s.productRemoving}>
          下載 PSD（可編輯圖層）
        </button>
        <button className="btn btn-ghost" onClick={() => void handleDownloadSvg()} data-testid="banner-download-svg"
          disabled={s.generating || s.productRemoving}>
          下載 SVG（可編輯圖層）
        </button>
      </div>
      {(canvasHref || vectorHref) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {canvasHref && <button className="btn btn-ghost" onClick={() => void handleOpenInPhotoPro()} data-testid="banner-open-photo-pro"
            disabled={s.generating || s.productRemoving}>
            在修圖（專業版）開啟
          </button>}
          {vectorHref && <button className="btn btn-ghost" onClick={() => void handleOpenInVectorPro()} data-testid="banner-open-vector-pro"
            disabled={s.generating || s.productRemoving}>
            在向量（專業版）開啟
          </button>}
        </div>
      )}
      {s.saved && (
        <p className="form-hint" style={{ marginTop: 8, color: "var(--badge-green-text)" }}>
          ✓ 已儲存至 {designsHref ? <a href={designsHref} style={{ color: "var(--badge-green-text)" }}>My Designs</a> : "My Designs"}
        </p>
      )}
    </StepCard>
  );
}
