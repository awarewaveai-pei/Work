"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useCanvasReturn } from "@/components/tools/useCanvasReturn";
import { BANNER_RETURN_TOOL, applyBannerCanvasReturn } from "./banner-canvas-return";
import { renderBannerLayers, type ElemBox, type ElemKey } from "./banner-layers";
import { useBrandKit } from "./kit/useBrandKit";
import { saveDesign, urlToBlob } from "@/lib/studio/design-upload";
import {
  BANNER_FONTS_CSS, INIT, PRESETS, RATIO_PRESET, TEMPLATES, clearSizeTweak, designSig, enterSize, isUntouched, leaveSize,
  presetLabel, selectedSizes, templatePatch, variantOf,
  type BannerStaffApi, type PresetKey, type State,
} from "./banner-state";
import { EXPORT_FORMATS, downloadUrl, encodeDesign, exportToPng, sizeFileName, thumbOf, type ExportFormat } from "./steps/export-files";
import { stepRef, stepsFor, type StepSlot } from "./steps/order";
import StepStart from "./steps/StepStart";
import StepSize from "./steps/StepSize";
import StepText from "./steps/StepText";
import StepCanvas from "./steps/StepCanvas";
import StepMarketing from "./steps/StepMarketing";
import StepStyle from "./steps/StepStyle";
import StepExport from "./steps/StepExport";


// ---------------------------------------------------------------------------
// Canvas export — single source of truth (preview renders this too). The drawing lives in banner-layers.ts as one
// canvas per part; the PNG draws the same parts on one canvas (flat), the PSD / SVG keep them apart (text stays editable).
// ---------------------------------------------------------------------------

/** The preview: the flat PNG plus where each element landed (hit-testing for dragging). */
async function renderPreview(state: State): Promise<{ url: string; boxes: Partial<Record<ElemKey, ElemBox>> }> {
  const doc = await renderBannerLayers(state, PRESETS[state.preset], { flat: true });
  return { url: doc.layers[0].canvas.toDataURL("image/png"), boxes: doc.boxes };
}
/** Topmost first: what a click on the preview grabs. */
const HIT_ORDER: readonly ElemKey[] = ["badge", "logo", "cta", "trust", "price", "subtext", "headline", "product"];
/** Snap lines (shares of the canvas): centre and thirds. */
const SNAP_AT = [1 / 3, 0.5, 2 / 3];
const SNAP_DIST = 0.015;
const snap = (v: number) => {
  const hit = SNAP_AT.find((a) => Math.abs(v - a) < SNAP_DIST);
  return hit === undefined ? { v, line: null } : { v: hit, line: hit };
};

/** Desktop width: the preview stays in view (sticky) while the controls scroll; narrower, it sits above them. */
function useWide(minPx = 960): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minPx}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [minPx]);
  return wide;
}

export default function BannerStudio({ staff }: { staff?: BannerStaffApi }) {
  const [targetKb, setTargetKb] = useState("");
  const [s, setS]         = useState<State>(INIT);
  // 傳回 (C8.3): decide from the latest render and place the image at once (the dock waits ~2 s for the ack).
  const sRef = useRef(s);
  sRef.current = s;
  // dragging the background picture on the preview (pointer start + the offsets then); while set the preview renders at once
  const bgDragRef = useRef<{ x: number; y: number; bx: number; by: number; w: number; h: number } | null>(null);
  // C4: an element being dragged (pointer start, its centre then as a canvas share, the preview's on-screen size)
  const elemDragRef = useRef<{ key: ElemKey; x: number; y: number; cx: number; cy: number; w: number; h: number } | null>(null);
  const [previewBoxes, setPreviewBoxes] = useState<Partial<Record<ElemKey, ElemBox>>>({});
  const [guides, setGuides] = useState<{ key: ElemKey; v: number | null; h: number | null } | null>(null);
  const [hoverHit, setHoverHit] = useState<ElemKey | null>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  useCanvasReturn(BANNER_RETURN_TOOL, (slot, image) => {
    if (!applyBannerCanvasReturn(sRef.current, slot, image)) return false;
    setS((prev) => applyBannerCanvasReturn(prev, slot, image) ?? prev);
    return true;
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // self-hosted fonts: one stylesheet; each finished font load re-renders the preview (the first draw may be a fallback)
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    if (!document.querySelector(`link[href="${BANNER_FONTS_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = BANNER_FONTS_CSS;
      link.onload = () => setFontEpoch((e) => e + 1);
      document.head.appendChild(link);
    }
    const bump = () => setFontEpoch((e) => e + 1);
    document.fonts?.addEventListener?.("loadingdone", bump);
    return () => document.fonts?.removeEventListener?.("loadingdone", bump);
  }, []);

  const set = useCallback(<K extends keyof State>(key: K, val: State[K]) =>
    setS((prev) => ({ ...prev, [key]: val, saved: key === "saved" ? (val as boolean) : false, error: null }))
  , []);

  const p        = PRESETS[s.preset];

  // Live preview renders the REAL exportToPng output (single source of truth — preview
  // always matches the downloaded PNG). Debounced so typing stays smooth; images are cached.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      renderPreview(s).then(({ url, boxes }) => { if (!cancelled) { setPreviewUrl(url); setPreviewBoxes(boxes); } }).catch(() => { /* mid-edit, ignore */ });
    }, bgDragRef.current || elemDragRef.current ? 16 : 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [s, fontEpoch]);

  // Card R3: opened from the video editor or a site's intro setting (/tools/banner?ratio=16:9&title=...&template=opener-center
  // &org=<uuid>): that video's shape, its title as the headline, the opener layout, and the organization 存到我的設計 saves
  // into (staff work for a customer; the designs route checks access). Read once; unknown values are ignored.
  const [saveOrg, setSaveOrg] = useState<string | null>(null);
  const [saveOrgName, setSaveOrgName] = useState<string | null>(null);
  const wide = useWide();
  // C8: the brand kit of the organization this banner is saved for (null = own / default organization)
  const brand = useBrandKit(saveOrg);
  const saveOrgRef = useRef(saveOrg);
  saveOrgRef.current = saveOrg;
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const org = q.get("org") ?? "";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org)) setSaveOrg(org);
    const preset = RATIO_PRESET[q.get("ratio") ?? ""], title = (q.get("title") ?? "").trim().slice(0, 80);
    const t = TEMPLATES.find((x) => x.group === "opener" && x.key === q.get("template"));
    if (!preset && !title && !t) return;
    setS((prev) => ({ ...prev, ...(t ? { brandBar: false, balanceTitle: false, ...templatePatch(t, preset ?? prev.preset) } : {}), ...(preset ? { preset } : {}), ...(title ? { headline: title } : {}) }));
  }, []);

  // ── undo / redo (Banner's whole design is ONE serializable State; unchanged image
  //    strings are shared by reference across snapshots, so history is memory-cheap) ──
  const historyRef  = useRef<State[]>([INIT]);
  const histIdxRef  = useRef(0);
  const restoringRef = useRef(false);
  const [, bumpHist] = useState(0);
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return; }
    const t = setTimeout(() => {
      const hist = historyRef.current;
      const cur = hist[histIdxRef.current];
      if (cur && designSig(cur) === designSig(s)) return;
      const next = hist.slice(0, histIdxRef.current + 1);
      next.push(s);
      while (next.length > 25) next.shift();
      historyRef.current = next;
      histIdxRef.current = next.length - 1;
      bumpHist((v) => v + 1);
    }, 500);
    return () => clearTimeout(t);
  }, [s]);
  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    restoringRef.current = true;
    setS(historyRef.current[histIdxRef.current]);
    bumpHist((v) => v + 1);
  }, []);
  const redo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current += 1;
    restoringRef.current = true;
    setS(historyRef.current[histIdxRef.current]);
    bumpHist((v) => v + 1);
  }, []);
  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  // ── C5: every chosen size at once ──
  const [multiFormat, setMultiFormat] = useState<ExportFormat>("png");
  const [multiBusy, setMultiBusy] = useState<string | null>(null);
  const [multiNote, setMultiNote] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Partial<Record<PresetKey, string>>>({});
  useEffect(() => {
    const sel = selectedSizes(s);
    if (sel.length < 2) { setThumbs({}); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const out: Partial<Record<PresetKey, string>> = {};
      for (const k of sel) {
        try { out[k] = await thumbOf(variantOf(s, k)); } catch { /* mid-edit */ }
        if (cancelled) return;
      }
      setThumbs(out);
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [s, fontEpoch]);
  const picked = selectedSizes(s);
  const multi = picked.length > 1;
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
        if (out.note) notes.push(`${PRESETS[k].ratio}：${out.note}`);
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
        if (!res.ok) throw new Error(`${PRESETS[k].ratio}：${(res as { ok: false; error: string }).error}`);
      }
      setMultiNote(`✓ ${picked.length} 個尺寸都已存到我的設計`);
    } catch (err) {
      setMultiNote(err instanceof Error ? err.message : String(err));
    } finally {
      setMultiBusy(null);
    }
  }

  // the background picture is placed on the preview: drag = move, wheel = zoom (a non-passive listener, so the page
  // does not scroll while zooming)
  const bgMovable = (s.bgMode === "upload" || s.bgMode === "ai") && !!s.bgImage;
  useEffect(() => {
    const el = previewImgRef.current;
    if (!el || !bgMovable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setS((prev) => ({ ...prev, bgImgScale: Math.min(3, Math.max(0.5, prev.bgImgScale * Math.exp(-e.deltaY * 0.0015))), saved: false, error: null }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bgMovable, previewUrl]);
  const clampOff = (v: number) => Math.max(-1.5, Math.min(1.5, v));
  /** The element under a point of the preview (canvas pixels), topmost first. */
  const hitAt = (e: React.PointerEvent<HTMLImageElement>): ElemKey | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * p.w, y = ((e.clientY - r.top) / r.height) * p.h;
    return HIT_ORDER.find((k) => { const b = previewBoxes[k]; return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }) ?? null;
  };
  const endDrag = () => { bgDragRef.current = null; elemDragRef.current = null; setGuides(null); };
  const hasPositions = Object.keys(s.positions).length > 0;
  // C13: nothing designed yet (no words, pictures, button, badge or logo) -> a line of guidance instead of an empty canvas
  const blank = isUntouched(s) && !s.designing;
  const ctx = { s, set, setS };
  const renderStep = (slot: StepSlot) => {
    switch (slot.key) {
      case "size": return <StepSize slot={slot} {...ctx} />;
      case "text": return <StepText slot={slot} {...ctx} />;
      case "canvas": return <StepCanvas slot={slot} {...ctx} />;
      case "marketing": return <StepMarketing slot={slot} {...ctx} />;
      case "style": return <StepStyle slot={slot} {...ctx} sRef={sRef} brand={brand} staff={staff} />;
      case "export": return <StepExport slot={slot} {...ctx} saveOrg={saveOrg} targetKb={targetKb} setTargetKb={setTargetKb} />;
    }
  };

  return (
    <div className="page">
      <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>🖼 橫幅</h2>
      <p className="form-hint" style={{ marginBottom: 20 }}>
        WP 網站 + 社交平台 · AI 文案 + 產品圖去背 + AI 背景 · 匯出高解析 PNG
      </p>

      {s.error && (
        <div className="form-message" style={{ marginBottom: 16, color: "var(--badge-red-text)" }}>
          ⚠ {s.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── Controls (right side) ── */}
        <div style={{ order: 2, flex: "1 1 340px", maxWidth: wide ? 420 : "100%", minWidth: 0,
          display: "flex", flexDirection: "column", gap: 16 }}>

          {staff && (
            <StepStart s={s} set={set} setS={setS} staff={staff} brand={brand} saveOrg={saveOrg} setSaveOrg={setSaveOrg}
              saveOrgName={saveOrgName} setSaveOrgName={setSaveOrgName} saveOrgRef={saveOrgRef} />
          )}

          {stepsFor(!!staff).map((slot) => <Fragment key={slot.key}>{renderStep(slot)}</Fragment>)}

        </div>

        {/* ── Preview (left side, sticky) ── */}
        <div style={{
          order: 1, flex: "1.7 1 520px", minWidth: 0,
          ...(wide ? { position: "sticky" as const, top: 16, alignSelf: "flex-start" } : {}),
        }}>

          {/* Preview */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>
                預覽 · {presetLabel(s.preset)}
                <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12, marginLeft: 6 }}>{p.w}×{p.h}</span>
              </h2>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "2px 9px" }}
                  disabled={!canUndo} onClick={undo} title="復原">↩ 復原</button>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "2px 9px" }}
                  disabled={!canRedo} onClick={redo} title="重做">↪ 重做</button>
                {hasPositions && (
                  <button className="btn btn-ghost" style={{ fontSize: 13, padding: "2px 9px" }} data-testid="banner-auto-layout"
                    onClick={() => setS((prev) => ({ ...prev, positions: {}, saved: false, error: null }))}>回到自動排版</button>
                )}
              </div>
            </div>
            <div style={{
              display: blank ? "block" : "inline-block", maxWidth: "100%", minHeight: previewUrl || blank ? undefined : 240,
              position: "relative", borderRadius: 6, overflow: "hidden",
              background: "var(--chip-surface)",
            }}>
              {blank && (
                <div data-testid="banner-empty-hint" style={{
                  width: 720, maxWidth: "100%", aspectRatio: `${p.w} / ${p.h}`, maxHeight: "calc(100vh - 230px)", minHeight: 160,
                  display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 16,
                  border: "1px dashed var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 14,
                }}>
                  {staff ? "先在「開始」輸入主題，再按 ✨ AI 一鍵設計" : `先在${stepRef("text", false)}輸入標題，或在${stepRef("canvas", false)}放背景與產品圖`}
                </div>
              )}
              {previewUrl && !blank && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="banner preview" ref={previewImgRef} draggable={false} data-testid="banner-preview"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const key = hitAt(e);
                    if (key) {
                      // an element: drag it (its box centre, snapping to the centre / thirds lines)
                      const b = previewBoxes[key]!;
                      elemDragRef.current = { key, x: e.clientX, y: e.clientY, cx: (b.x + b.w / 2) / p.w, cy: (b.y + b.h / 2) / p.h, w: r.width, h: r.height };
                      setGuides({ key, v: null, h: null });
                    } else if (bgMovable) {
                      bgDragRef.current = { x: e.clientX, y: e.clientY, bx: s.bgImgX, by: s.bgImgY, w: r.width, h: r.height };
                    } else return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    e.preventDefault();
                  }}
                  onPointerMove={(e) => {
                    const el = elemDragRef.current;
                    if (el) {
                      const x = snap(Math.max(0, Math.min(1, el.cx + (e.clientX - el.x) / el.w)));
                      const y = snap(Math.max(0, Math.min(1, el.cy + (e.clientY - el.y) / el.h)));
                      setGuides({ key: el.key, v: x.line, h: y.line });
                      setS((prev) => ({ ...prev, positions: { ...prev.positions, [el.key]: { x: x.v, y: y.v } }, saved: false, error: null }));
                      return;
                    }
                    const d = bgDragRef.current;
                    if (!d) { setHoverHit(hitAt(e)); return; }
                    setS((prev) => ({ ...prev, bgImgX: clampOff(d.bx + (e.clientX - d.x) / d.w), bgImgY: clampOff(d.by + (e.clientY - d.y) / d.h), saved: false, error: null }));
                  }}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onPointerLeave={() => setHoverHit(null)}
                  style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 230px)", width: "auto", height: "auto",
                    cursor: hoverHit || guides ? "move" : bgMovable ? "grab" : undefined, touchAction: "none" }} />
              )}
              {previewUrl && !blank && guides && (
                // C4 drag guides: a 10% grid, the thirds, the centre; the line the element snapped to and its box highlighted
                <svg viewBox={`0 0 ${p.w} ${p.h}`} preserveAspectRatio="none" data-testid="banner-drag-guides"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  {Array.from({ length: 9 }, (_, i) => (i + 1) / 10).map((f) => (
                    <g key={f} stroke="rgba(255,255,255,0.18)" strokeWidth={p.w / 900}>
                      <line x1={f * p.w} y1={0} x2={f * p.w} y2={p.h} /><line x1={0} y1={f * p.h} x2={p.w} y2={f * p.h} />
                    </g>
                  ))}
                  {SNAP_AT.map((f) => (
                    <g key={`s${f}`} stroke="rgba(255,255,255,0.5)" strokeWidth={p.w / 600} strokeDasharray={`${p.w / 120} ${p.w / 160}`}>
                      <line x1={f * p.w} y1={0} x2={f * p.w} y2={p.h} /><line x1={0} y1={f * p.h} x2={p.w} y2={f * p.h} />
                    </g>
                  ))}
                  <g stroke="var(--accent)" strokeWidth={p.w / 300}>
                    {guides.v !== null && <line x1={guides.v * p.w} y1={0} x2={guides.v * p.w} y2={p.h} />}
                    {guides.h !== null && <line x1={0} y1={guides.h * p.h} x2={p.w} y2={guides.h * p.h} />}
                  </g>
                  {previewBoxes[guides.key] && (() => { const b = previewBoxes[guides.key]!; return (
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--accent)" strokeWidth={p.w / 500} />
                  ); })()}
                </svg>
              )}
              {(s.generating || s.productRemoving || s.designing) && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--btn-primary-text)", fontSize: 14,
                }}>
                  {s.productRemoving ? "去背中…" : s.designing ? "AI 設計中…" : "AI 生成中…"}
                </div>
              )}
            </div>
            {s.editingSize && (
              <div className="form-message" style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span>正在單獨微調 {PRESETS[s.editingSize.key].ratio}：這時改的位置、字級、對齊只套這個尺寸；文字、顏色、圖片仍是全部一起改。</span>
                <button className="btn btn-primary" style={{ fontSize: 12 }} data-testid="banner-multi-done"
                  onClick={() => setS((prev) => ({ ...leaveSize(prev), saved: false }))}>完成，回主尺寸</button>
              </div>
            )}
          </div>

          {multi && (
            <div className="card" style={{ marginBottom: 16 }} data-testid="banner-multi-card">
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>多尺寸 · {picked.length} 個</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {picked.map((k) => {
                  const editing = s.editingSize ? s.editingSize.key === k : s.preset === k;
                  const tweaked = Object.keys(s.sizeOverrides[k] ?? {}).length > 0;
                  return (
                    <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                      <button className={editing ? "btn btn-primary" : "btn btn-ghost"} data-testid={`banner-multi-thumb-${k}`}
                        style={{ padding: 4, height: "auto" }} onClick={() => setS((prev) => ({ ...enterSize(prev, k), saved: false }))}
                        title="點一下單獨微調這個尺寸">
                        {thumbs[k]
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={thumbs[k]} alt={PRESETS[k].ratio} style={{ display: "block", maxWidth: 160, maxHeight: 160 }} />
                          : <span style={{ display: "block", width: 120, height: 80, fontSize: 11 }}>產生中…</span>}
                      </button>
                      <span style={{ fontSize: 12 }}>
                        <b>{PRESETS[k].ratio}</b>{tweaked ? "・已微調" : ""}{editing ? "・編輯中" : ""}
                      </span>
                      {tweaked && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "1px 6px" }}
                          onClick={() => setS((prev) => ({ ...clearSizeTweak(prev, k), saved: false }))}>清除微調</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
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
              <p className="form-hint" style={{ margin: "6px 0 0" }}>JPG／WebP 的「目標 KB」沿用匯出區的設定。</p>
              {(multiBusy || multiNote) && <p className="form-hint" style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{multiBusy ?? multiNote}</p>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
