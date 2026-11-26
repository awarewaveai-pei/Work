"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useCanvasReturn } from "@/components/tools/useCanvasReturn";
import { BANNER_RETURN_TOOL, applyBannerCanvasReturn } from "./banner-canvas-return";
import { renderBannerLayers, type ElemBox, type ElemKey } from "./banner-layers";
import { useBrandKit } from "./kit/useBrandKit";
import {
  BANNER_FONTS_CSS, INIT, PRESETS, RATIO_PRESET, TEMPLATES, clearDesign, clearSizeTweak, designSig, editingSizeOf, enterSize, isUntouched, leaveSize,
  presetLabel, selectedSizes, templatePatch, variantOf,
  type BannerStaffApi, type PresetKey, type State,
} from "./banner-state";
import { thumbOf } from "./steps/export-files";
import { stepRef, stepsFor, type StepSlot } from "./steps/order";
import StepStart from "./steps/StepStart";
import StepAi from "./steps/StepAi";
import StepTemplate from "./steps/StepTemplate";
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

/** The size strip under the preview: a fixed height (thumbnail + label + header line) so preview + strip fit the window. */
const THUMB_H = 64;
const STRIP_H = 132;

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

  // ── C5: the picked sizes' thumbnails (the strip under the preview) ──
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
  const editing = editingSizeOf(s);

  // the background picture is placed on the preview: drag = move, Ctrl/⌘ + wheel or a trackpad pinch (ctrlKey) = zoom.
  // A plain wheel scrolls the page. Non-passive so the zoom gesture does not also zoom the browser page.
  const bgMovable = (s.bgMode === "upload" || s.bgMode === "ai") && !!s.bgImage;
  useEffect(() => {
    const el = previewImgRef.current;
    if (!el || !bgMovable) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
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
  // the left column (preview card + size strip) never runs past the window: the preview gives up the strip's height
  const previewMaxH = `calc(100vh - ${230 + (multi ? STRIP_H + 16 : 0)}px)`;
  // 清除設計: the cleared state itself, so the note shows until the next change (or 復原)
  const [cleared, setCleared] = useState<State | null>(null);
  const busy = s.generating || s.designing || s.productRemoving || s.saving || s.copyGenerating;
  const ctx = { s, set, setS };
  const renderStep = (slot: StepSlot) => {
    switch (slot.key) {
      case "start": return staff && <StepStart slot={slot} setS={setS} staff={staff} brand={brand} saveOrg={saveOrg} setSaveOrg={setSaveOrg}
        saveOrgName={saveOrgName} setSaveOrgName={setSaveOrgName} />;
      case "ai": return staff && <StepAi slot={slot} {...ctx} staff={staff} brand={brand} saveOrg={saveOrg} saveOrgRef={saveOrgRef} />;
      case "template": return <StepTemplate slot={slot} {...ctx} />;
      case "size": return <StepSize slot={slot} {...ctx} />;
      case "text": return <StepText slot={slot} {...ctx} />;
      case "canvas": return <StepCanvas slot={slot} {...ctx} />;
      case "marketing": return <StepMarketing slot={slot} {...ctx} />;
      case "style": return <StepStyle slot={slot} {...ctx} sRef={sRef} brand={brand} />;
      case "export": return <StepExport slot={slot} {...ctx} saveOrg={saveOrg} />;
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
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: "2px 9px" }} data-testid="banner-clear"
                  disabled={busy || designSig(clearDesign(s)) === designSig(s)} title="回到空白設計（保留客戶與已選尺寸）"
                  onClick={() => { const next = clearDesign(s); setCleared(next); setS(next); }}>清除設計</button>
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
                  width: 720, maxWidth: "100%", aspectRatio: `${p.w} / ${p.h}`, maxHeight: previewMaxH, minHeight: 160,
                  display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 16,
                  border: "1px dashed var(--border)", borderRadius: 6, color: "var(--text-muted)", fontSize: 14,
                }}>
                  {staff ? `先在${stepRef("ai", true)}輸入主題，再按 ✨ AI 一鍵設計` : `先在${stepRef("text", false)}輸入標題，或在${stepRef("canvas", false)}放背景與產品圖`}
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
                  style={{ display: "block", maxWidth: "100%", maxHeight: previewMaxH, width: "auto", height: "auto",
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
            {cleared === s && (
              <p className="form-hint" role="status" data-testid="banner-cleared" style={{ margin: "8px 0 0" }}>已清除，可按「↩ 復原」找回。</p>
            )}
          </div>

          {multi && (
            <div className="card" data-testid="banner-multi-card"
              style={{ height: STRIP_H, boxSizing: "border-box", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, minHeight: 24 }}>
                <b style={{ flexShrink: 0 }}>{picked.length} 個尺寸</b>
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {s.editingSize ? `單獨微調 ${PRESETS[s.editingSize.key].ratio}：位置、字級、對齊只改這張` : "點縮圖單獨微調那個尺寸"}
                </span>
                {Object.keys(s.sizeOverrides[editing] ?? {}).length > 0 && (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "1px 6px", flexShrink: 0 }} data-testid="banner-multi-clear-tweak"
                    onClick={() => setS((prev) => ({ ...clearSizeTweak(prev, editing), saved: false }))}>清除這張的微調</button>
                )}
                {s.editingSize && (
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: "1px 8px", flexShrink: 0, marginLeft: "auto" }} data-testid="banner-multi-done"
                    onClick={() => setS((prev) => ({ ...leaveSize(prev), saved: false }))}>完成，回主尺寸</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", flex: 1, minHeight: 0, alignItems: "stretch" }}>
                {picked.map((k) => {
                  const tweaked = Object.keys(s.sizeOverrides[k] ?? {}).length > 0;
                  return (
                    <button key={k} type="button" className="choice-card" aria-pressed={editing === k} data-testid={`banner-multi-thumb-${k}`}
                      style={{ width: "auto", flexShrink: 0, padding: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                      onClick={() => setS((prev) => ({ ...enterSize(prev, k), saved: false }))} title="點一下單獨微調這個尺寸">
                      {thumbs[k]
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={thumbs[k]} alt={PRESETS[k].ratio} style={{ display: "block", height: THUMB_H, width: "auto" }} />
                        : <span style={{ display: "flex", alignItems: "center", height: THUMB_H, fontSize: 11 }}>產生中…</span>}
                      <span style={{ fontSize: 11 }}><b>{PRESETS[k].ratio}</b>{tweaked ? "・已微調" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
