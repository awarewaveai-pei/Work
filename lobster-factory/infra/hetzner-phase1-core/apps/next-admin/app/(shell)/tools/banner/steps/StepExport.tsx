"use client";
import { useState } from "react";
import { CANVAS_STAFF_HREF, canvasTarget, openInCanvas } from "@/components/tools/canvas-handoff";
import { useDoorHref } from "@/app/DoorContext";
import { saveDesign, urlToBlob } from "@/lib/studio/design-upload";
import { buildBannerPsd, buildBannerSvg, rasterize } from "../banner-layers";
import { aiBgPromptOf, presetLabel, selectedSizes, variantOf } from "../banner-state";
import { EXPORT_FORMATS, bannerLayers, bytesToDataUrl, downloadUrl, encodeDesign, exportToPng, exportToPsd, exportToSvg, pngOfPixels, sizeFileName, textDataUrl, type ExportFormat } from "./export-files";
import type { StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

export default function StepExport({ slot, s, setS, saveOrg }: StepCtx & { slot: StepSlot; saveOrg: string | null }) {
  const [targetKb, setTargetKb] = useState("");
  const canvasHref = useDoorHref(CANVAS_STAFF_HREF);
  const vectorHref = useDoorHref(canvasTarget(".svg").staffHref);
  const [lossyNote, setLossyNote] = useState<string | null>(null);
  const designsHref = useDoorHref("/tools/designs");
  const effectiveBgPrompt = aiBgPromptOf(s);
  // ── C5: every picked size at once ──
  const picked = selectedSizes(s);
  const [multiFormat, setMultiFormat] = useState<ExportFormat>("png");
  const [multiBusy, setMultiBusy] = useState<string | null>(null);
  const [multiNote, setMultiNote] = useState<string | null>(null);
  async function handleDownloadAll() {
    setMultiNote(null);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const kb = Number(targetKb), notes: string[] = [];
      for (const [i, k] of picked.entries()) {
        setMultiBusy(`打包中 ${i + 1}/${picked.length}…`);
        const out = await encodeDesign(variantOf(s, k), multiFormat, Number.isFinite(kb) && kb > 0 ? kb : null);
        zip.file(sizeFileName(k, multiFormat), await urlToBlob(out.url));
        if (out.note) notes.push(`${presetLabel(k)}：${out.note}`);
      }
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      downloadUrl(url, `banner-${picked.length}-sizes.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (notes.length) setMultiNote(notes.join("\n"));
    } catch (err) {
      setMultiNote(err instanceof Error ? err.message : String(err));
    } finally {
      setMultiBusy(null);
    }
  }
  async function handleSaveAll() {
    setMultiNote(null);
    try {
      for (const [i, k] of picked.entries()) {
        setMultiBusy(`存到我的設計 ${i + 1}/${picked.length}…`);
        const v = variantOf(s, k);
        const res = await saveDesign(await urlToBlob(await exportToPng(v)), {
          source: "banner", prompt: v.headline || undefined, modelName: v.bgMode === "ai" ? v.aiBgModel : undefined, subject: k,
        }, { organizationId: saveOrg ?? undefined });
        if (!res.ok) throw new Error(`${presetLabel(k)}：${(res as { ok: false; error: string }).error}`);
      }
      setMultiNote(`✓ ${picked.length} 個尺寸都已存到我的設計`);
    } catch (err) {
      setMultiNote(err instanceof Error ? err.message : String(err));
    } finally {
      setMultiBusy(null);
    }
  }

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
      {picked.length > 1 && (
        <div data-testid="banner-multi-export" style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>全部 {picked.length} 個尺寸</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12 }}>格式</span>
            {EXPORT_FORMATS.map((f) => (
              <button key={f.key} className={multiFormat === f.key ? "btn btn-primary" : "btn btn-ghost"} data-testid={`banner-multi-format-${f.key}`}
                style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setMultiFormat(f.key)}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn btn-primary" disabled={!!multiBusy || s.generating || s.productRemoving} onClick={() => void handleDownloadAll()} data-testid="banner-multi-download">
              全部下載（zip）
            </button>
            <button className="btn btn-ghost" disabled={!!multiBusy || s.generating || s.productRemoving} onClick={() => void handleSaveAll()} data-testid="banner-multi-save">
              全部存到我的設計
            </button>
          </div>
          <p className="form-hint" style={{ margin: "6px 0 0" }}>JPG／WebP 的「目標 KB」沿用下面的設定。下面的單張按鈕只輸出正在編輯的尺寸。</p>
          {(multiBusy || multiNote) && <p className="form-hint" style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{multiBusy ?? multiNote}</p>}
        </div>
      )}
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
