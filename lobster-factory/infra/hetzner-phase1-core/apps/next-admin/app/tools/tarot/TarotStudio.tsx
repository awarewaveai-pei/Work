"use client";

import { useEffect, useRef, useState } from "react";
import { roleHeader } from "../../../lib/ops-role";
import { TAROT_CARDS, PREVIEW_CARD, buildCardPrompt, STYLE_PRESETS, type TarotCard } from "./cards";

type GroupKey = "all" | "major" | "wands" | "cups" | "swords" | "pentacles";
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "major", label: "大阿卡納 22" },
  { key: "all", label: "全部 78 張" },
  { key: "wands", label: "權杖 14" },
  { key: "cups", label: "聖杯 14" },
  { key: "swords", label: "寶劍 14" },
  { key: "pentacles", label: "錢幣 14" },
];
function inGroup(card: TarotCard, key: GroupKey): boolean {
  return key === "all" ? true : card.type === key;
}
import { renderPrintCard, CARD_TEMPLATES, type CardTemplate } from "./renderPrintCard";
// type-only import (erased at build — does not pull the server lib into the client bundle);
// keeps the model union in sync with the server. maxRefs/cost stay local on purpose.
import type { TarotModel } from "../../../lib/tarot/image-gen";

type Mode = "text" | "image";

interface GenResponse {
  ok: boolean;
  image?: string;
  seed?: number | null;
  error?: string;
}

interface BatchItem {
  card: TarotCard;
  status: "idle" | "pending" | "done" | "error";
  url?: string;
  blob?: Blob;
  error?: string;
}

// Model menu, cheapest → priciest. costNt = rough NT$ per image (for the 78-card estimate).
// maxRefs = how many reference images this model actually consumes (0 = text-only).
const MODEL_OPTIONS: { value: TarotModel; label: string; costNt: number; maxRefs: number }[] = [
  { value: "flux-schnell", label: "FLUX schnell · 最省 ~NT$0.1/張（整套約 NT$8）", costNt: 0.1, maxRefs: 0 },
  { value: "openai-low", label: "gpt-image-1 低品質 · ~NT$0.5/張（整套約 NT$40）", costNt: 0.5, maxRefs: 5 },
  { value: "flux-dev", label: "FLUX dev · 品質好 ~NT$1/張（整套約 NT$80）", costNt: 1, maxRefs: 1 },
  { value: "openai-medium", label: "gpt-image-1 中品質 · ~NT$1.3/張（整套約 NT$100）", costNt: 1.3, maxRefs: 5 },
  { value: "openai-high", label: "gpt-image-1 高品質 · ~NT$5.5/張（整套約 NT$430）", costNt: 5.5, maxRefs: 5 },
];

function modelOption(m: TarotModel) {
  return MODEL_OPTIONS.find((o) => o.value === m) ?? MODEL_OPTIONS[0];
}

// Neutral gradient used to render template previews before the user has generated art.
const PLACEHOLDER_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0' stop-color='#c9b8f8'/><stop offset='1' stop-color='#6d4c91'/>" +
      "</linearGradient></defs><rect width='400' height='600' fill='url(#g)'/>" +
      "<text x='200' y='310' font-size='34' fill='white' text-anchor='middle' opacity='0.75'>樣式預覽</text></svg>",
  );

async function callGenerate(body: {
  model: TarotModel;
  prompt: string;
  referenceImages?: string[];
  seed?: number | null;
}): Promise<GenResponse> {
  const res = await fetch("/api/tools/tarot/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body: JSON.stringify(body),
  });
  return (await res.json()) as GenResponse;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

// Downscale an uploaded reference image to a small JPEG data URL. A style reference does not
// need full resolution, and keeping it small avoids the route's 10MB request-body limit
// (a few full-res photos would blow past it → truncated body → "invalid_json").
async function downscaleImageFile(file: File, maxDim = 1024, quality = 0.85): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl); // fall back to original if canvas unavailable
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = dataUrl;
  });
}

export default function TarotStudio() {
  const [model, setModel] = useState<TarotModel>("flux-schnell");
  const [mode, setMode] = useState<Mode>("text");
  const [group, setGroup] = useState<GroupKey>("major");
  const [template, setTemplate] = useState<CardTemplate>("gold");
  const [stylePrompt, setStylePrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null); // large-view modal
  const [templateThumbs, setTemplateThumbs] = useState<Record<string, string>>({});

  const doneCount = batch.filter((b) => b.status === "done").length;
  const maxRefs = modelOption(model).maxRefs;

  // The deck's style anchor: explicit uploads (capped to the model's limit), else the locked preview.
  // maxRefs === 0 (e.g. FLUX schnell) → no image is sent; style relies on prompt + seed.
  const lockedRefs: string[] =
    maxRefs === 0
      ? []
      : referenceImages.length > 0
        ? referenceImages.slice(0, maxRefs)
        : previewImage
          ? [previewImage]
          : [];

  // Revoke all card object URLs on unmount to avoid leaking blobs (78 + retries).
  const batchRef = useRef<BatchItem[]>([]);
  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);
  useEffect(
    () => () => {
      batchRef.current.forEach((it) => it.url && URL.revokeObjectURL(it.url));
    },
    [],
  );

  // Render a small preview of every template (using the user's art if available) so the
  // chooser shows the actual frame style, not just text.
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      const sample = previewImage ?? PLACEHOLDER_ART;
      const next: Record<string, string> = {};
      for (const t of CARD_TEMPLATES) {
        try {
          const blob = await renderPrintCard(PREVIEW_CARD, sample, t.key);
          const url = URL.createObjectURL(blob);
          made.push(url);
          next[t.key] = url;
        } catch {
          /* ignore a single template render failure */
        }
      }
      if (cancelled) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setTemplateThumbs((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [previewImage]);

  async function onAddReferences(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      // downscale each upload to a small JPEG so the request body stays well under the 10MB limit
      const added = await Promise.all(Array.from(files).map((f) => downscaleImageFile(f)));
      setReferenceImages((prev) => [...prev, ...added].slice(0, maxRefs || 5));
    } catch {
      setMessage("參考圖讀取失敗");
    }
  }

  function removeReference(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function generatePreview() {
    setMessage(null);
    if (mode === "image" && referenceImages.length === 0) {
      setMessage("以圖生圖模式請先上傳至少一張參考圖（或切到文字模式並填描述）");
      return;
    }
    // 風格描述為選填：只要有「上傳參考圖」或「至少 3 字描述」其一即可
    const hasStyle = stylePrompt.trim().length >= 3;
    const hasRef = mode === "image" && referenceImages.length > 0;
    if (!hasStyle && !hasRef) {
      setMessage("請填風格描述（至少 3 字），或在「以圖生圖」模式上傳參考圖當風格");
      return;
    }
    setPreviewBusy(true);
    setLocked(false);
    try {
      const resp = await callGenerate({
        model,
        prompt: buildCardPrompt(stylePrompt, PREVIEW_CARD),
        referenceImages: mode === "image" ? referenceImages.slice(0, maxRefs) : [],
        seed: null,
      });
      if (!resp.ok || !resp.image) {
        setMessage(`預覽生成失敗：${resp.error ?? "unknown"}`);
        return;
      }
      setPreviewImage(resp.image);
      setPreviewSeed(resp.seed ?? null);
    } catch (e) {
      setMessage(`預覽生成失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  function lockStyle() {
    if (!previewImage) return;
    setLocked(true);
    setBatch((prev) => {
      // re-lock after a prior batch: revoke old blob urls before resetting
      prev.forEach((it) => it.url && URL.revokeObjectURL(it.url));
      return TAROT_CARDS.map((card) => ({ card, status: "idle" }));
    });
    setMessage(null);
  }

  function patchItem(index: number, patch: Partial<BatchItem>) {
    setBatch((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function generateOne(card: TarotCard, index: number): Promise<void> {
    patchItem(index, { status: "pending", error: undefined });
    try {
      const resp = await callGenerate({
        model,
        prompt: buildCardPrompt(stylePrompt, card),
        referenceImages: lockedRefs, // consistent style anchor across the deck (where the model supports it)
        seed: previewSeed, // FLUX reproducibility; ignored by openai
      });
      if (!resp.ok || !resp.image) {
        patchItem(index, { status: "error", error: resp.error ?? "unknown" });
        return;
      }
      const blob = await renderPrintCard(card, resp.image, template);
      const url = URL.createObjectURL(blob);
      // revoke any prior url for this slot (retry case) before replacing
      setBatch((prev) =>
        prev.map((it, i) => {
          if (i !== index) return it;
          if (it.url) URL.revokeObjectURL(it.url);
          return { ...it, status: "done", blob, url, error: undefined };
        }),
      );
    } catch (e) {
      patchItem(index, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Generate only the cards in the currently-selected group (大牌 / 全部 / 單一牌組).
  async function generateGroup() {
    const targets = batch.map((it, i) => ({ i, card: it.card })).filter(({ card }) => inGroup(card, group));
    if (targets.length === 0) return;
    const opt = modelOption(model);
    const estNt = Math.round(targets.length * opt.costNt);
    const mins = Math.max(1, Math.round((targets.length * 20) / 60));
    const label = GROUPS.find((g) => g.key === group)?.label ?? "";
    const ok = window.confirm(
      `即將生成 ${targets.length} 張（${label}，${model}）。\n` +
        `預估費用約 NT$${estNt}，約 ${mins} 分鐘，請保持此分頁開啟。\n\n確定開始？`,
    );
    if (!ok) return;
    setBatchBusy(true);
    setMessage(null);
    try {
      for (const t of targets) {
        await generateOne(t.card, t.i);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  // Generate (or regenerate) a single card — fast, no confirm.
  async function generateSingle(index: number) {
    if (batchBusy) return;
    setBatchBusy(true);
    setMessage(null);
    try {
      await generateOne(batch[index].card, index);
    } finally {
      setBatchBusy(false);
    }
  }

  async function downloadZip() {
    const done = batch.filter((b) => b.status === "done" && b.blob);
    if (done.length === 0) {
      setMessage("還沒有可下載的牌卡");
      return;
    }
    setZipBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const it of batch) {
        if (it.status === "done" && it.blob) {
          const safe = it.card.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
          zip.file(`${String(it.card.id).padStart(2, "0")}_${safe}.png`, it.blob);
        }
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tarot-deck-print.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(`打包失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>🔮 塔羅牌印刷檔生成工具</h1>
      <p className="form-hint" style={{ marginBottom: 20 }}>
        先設計一張風格樣本 → 鎖定風格 → 整套 78 張同風格生成 → 下載印刷檔 PNG（70×120mm @300DPI 含出血）。
      </p>

      {message && (
        <div className="form-message" style={{ marginBottom: 16 }}>
          {message}
        </div>
      )}

      {/* ── Step 1: style design ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 14px" }}>Step 1 · 風格設計</h2>

        <div className="form-row">
          <label className="form-label">圖片模型（價格由低到高）</label>
          <select className="form-select" value={model} onChange={(e) => setModel(e.target.value as TarotModel)} disabled={locked}>
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="form-hint">
            📎 參考圖容量：
            {maxRefs === 0
              ? "此模型不吃參考圖（純文字生圖；要用上傳圖請改 FLUX dev = 1 張，或 gpt-image-1 = 最多 5 張）"
              : `此模型最多吃 ${maxRefs} 張參考圖`}
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">生成模式</label>
          <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={locked}>
            <option value="text">文字生圖（純描述）</option>
            <option value="image">以圖生圖 / 上傳風格參考圖</option>
          </select>
        </div>

        {mode === "image" && (
          <div className="form-row">
            <label className="form-label">參考圖（風格參考，可多張）</label>
            {maxRefs === 0 ? (
              <div className="form-hint" style={{ color: "var(--yellow)" }}>
                ⚠ 目前模型不吃參考圖。改選 FLUX dev（1 張）或 gpt-image-1（最多 5 張）才會用到上傳圖。
              </div>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="form-input"
                  disabled={locked || referenceImages.length >= maxRefs}
                  onChange={(e) => {
                    void onAddReferences(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="form-hint">
                  已上傳 {referenceImages.length} / {maxRefs} 張
                  {referenceImages.length >= maxRefs ? "（已達此模型上限）" : ""}
                </div>
              </>
            )}
            {referenceImages.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {referenceImages.map((src, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`ref ${i + 1}`} style={{ height: 90, borderRadius: 6, border: "1px solid var(--card-border)" }} />
                    {!locked && (
                      <button
                        onClick={() => removeReference(i)}
                        title="移除"
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          lineHeight: "20px",
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="form-row">
          <label className="form-label">風格描述{mode === "image" && referenceImages.length > 0 ? "（選填，已上傳參考圖可留空）" : ""}</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {STYLE_PRESETS.map((p) => (
              <button
                key={p.en}
                type="button"
                disabled={locked}
                onClick={() =>
                  setStylePrompt((prev) => {
                    const t = prev.trim();
                    return t ? `${t}, ${p.en}` : p.en;
                  })
                }
                title={`插入「${p.en}」`}
                style={{
                  padding: "4px 10px",
                  borderRadius: 14,
                  fontSize: 12,
                  cursor: locked ? "default" : "pointer",
                  border: "1px solid var(--card-border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  opacity: locked ? 0.5 : 1,
                }}
              >
                {p.zh} <span style={{ opacity: 0.6 }}>{p.en}</span>
              </button>
            ))}
          </div>
          <textarea
            className="form-textarea"
            placeholder="點上方按鈕快速插入，或自行輸入英文風格詞（FLUX 對英文最準）。例：Van Gogh oil painting, mystical atmosphere"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            disabled={locked}
          />
          <div className="form-hint">
            這段風格會套用到整套 78 張牌。中文風格詞會自動轉成英文（免費）；要最準請用英文。風格不夠強時改用 FLUX dev 模型（吃 prompt 更準）。
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">外框顏色（正式塔羅版式 · 上羅馬數字／中圖像／下牌名 · 三色直線外框）</label>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {CARD_TEMPLATES.map((t) => {
              const active = template === t.key;
              return (
                <div
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  style={{ cursor: "pointer", textAlign: "center", width: 129 }}
                >
                  {templateThumbs[t.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={templateThumbs[t.key]}
                      alt={t.label}
                      style={{
                        width: 129,
                        height: 213,
                        borderRadius: 6,
                        objectFit: "cover",
                        border: active ? "3px solid #6366f1" : "1px solid var(--card-border)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 129,
                        height: 213,
                        borderRadius: 6,
                        border: "1px solid var(--card-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        opacity: 0.5,
                      }}
                    >
                      …
                    </div>
                  )}
                  <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.3, color: active ? "#4338ca" : "var(--text-muted)" }}>
                    {t.label}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="form-hint">每張下載的牌都會套這個框 + 自動加牌名。生成預覽後，這裡會用你的圖顯示各模板樣式。</div>
        </div>

        <button className="btn-primary" onClick={generatePreview} disabled={previewBusy || locked}>
          {previewBusy ? "生成中…" : previewImage ? "重新生成預覽" : "生成風格預覽"}
        </button>

        {previewImage && (
          <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImage} alt="preview" style={{ width: 300, borderRadius: 10, border: "1px solid var(--card-border)" }} />
            <div>
              <div className="form-hint" style={{ marginBottom: 8 }}>
                預覽牌：{PREVIEW_CARD.name}
                {previewSeed != null ? ` · seed ${previewSeed}` : ""}
              </div>
              {!locked ? (
                <button className="btn-primary" onClick={lockStyle}>
                  ✓ 鎖定這個風格，進入整套生成
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => setLocked(false)}>
                  解除鎖定，重新設計
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2 + 3: per-group / per-card generation + download ──── */}
      {locked &&
        (() => {
          const groupItems = batch.map((it, i) => ({ it, i })).filter(({ it }) => inGroup(it.card, group));
          const groupDone = groupItems.filter(({ it }) => it.status === "done").length;
          return (
            <div className="card">
              <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Step 2 · 分組 / 單張生成與下載</h2>

              {/* group filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {GROUPS.map((g) => {
                  const active = group === g.key;
                  return (
                    <button
                      key={g.key}
                      onClick={() => setGroup(g.key)}
                      disabled={batchBusy}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: batchBusy ? "default" : "pointer",
                        border: `1px solid ${active ? "#6366f1" : "var(--card-border)"}`,
                        background: active ? "#eef2ff" : "transparent",
                        color: active ? "#4338ca" : "var(--text-muted)",
                      }}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <button className="btn-primary" onClick={generateGroup} disabled={batchBusy}>
                  {batchBusy ? `生成中… ${groupDone}/${groupItems.length}` : `生成這組 ${groupItems.length} 張`}
                </button>
                <button className="btn-secondary" onClick={downloadZip} disabled={zipBusy || doneCount === 0}>
                  {zipBusy ? "打包中…" : `下載 ZIP（全部 ${doneCount} 張）`}
                </button>
                <span className="form-hint">
                  這組 {groupDone}/{groupItems.length}　·　全部 {doneCount}/{TAROT_CARDS.length}
                </span>
              </div>
              <div className="form-hint" style={{ marginBottom: 12 }}>
                💡 點<b>已完成</b>的卡 = 看大圖（裡面可重新生成）。點<b>空白卡</b> = 生成那一張。建議先生一張看滿不滿意再「生成這組」。
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {groupItems.map(({ it, i }) => (
                  <div
                    key={it.card.id}
                    title={`${it.card.name}${it.error ? ` — ${it.error}` : ""}`}
                    onClick={() => {
                      if (batchBusy) return;
                      if (it.status === "done") setViewIndex(i);
                      else generateSingle(i);
                    }}
                    style={{
                      width: 132,
                      height: 219,
                      borderRadius: 8,
                      border: `1px solid ${it.card.colors[0]}55`,
                      background: it.card.colors[1],
                      position: "relative",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: it.card.colors[0],
                      textAlign: "center",
                      cursor: batchBusy ? "default" : "pointer",
                      opacity: batchBusy && it.status !== "pending" ? 0.6 : 1,
                    }}
                  >
                    {it.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.url} alt={it.card.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : it.status === "pending" ? (
                      <span>⏳ 生成中…</span>
                    ) : it.status === "error" ? (
                      <span>
                        ⚠️ 失敗
                        <br />
                        點擊重試
                      </span>
                    ) : (
                      <span style={{ padding: 6 }}>
                        {it.card.name}
                        <br />
                        <span style={{ opacity: 0.6 }}>（點擊生成）</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      {/* large-view modal */}
      {viewIndex != null && batch[viewIndex]?.url && (
        <div
          onClick={() => setViewIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={batch[viewIndex].url}
              alt={batch[viewIndex].card.name}
              style={{ maxHeight: "78vh", maxWidth: "90vw", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn-primary"
                disabled={batchBusy}
                onClick={() => {
                  const idx = viewIndex;
                  if (idx != null) void generateSingle(idx);
                }}
              >
                {batchBusy ? "生成中…" : "🔄 重新生成這張"}
              </button>
              <button className="btn-secondary" onClick={() => setViewIndex(null)}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
