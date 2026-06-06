"use client";

import { useEffect, useRef, useState } from "react";
import { roleHeader } from "../../../lib/ops-role";
import { TAROT_CARDS, PREVIEW_CARD, buildCardPrompt, type TarotCard } from "./cards";

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
import { renderPrintCard } from "./renderPrintCard";
// type-only import (erased at build — does not pull the server lib into the client bundle);
// keeps the model union in sync with the server. img2img/cost stay local on purpose.
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
// img2img = whether the model uses an uploaded reference image for style transfer.
const MODEL_OPTIONS: { value: TarotModel; label: string; costNt: number; img2img: boolean }[] = [
  { value: "flux-schnell", label: "FLUX schnell · 最省 ~NT$0.1/張（整套約 NT$8）", costNt: 0.1, img2img: false },
  { value: "openai-low", label: "gpt-image-1 低品質 · ~NT$0.5/張（整套約 NT$40）", costNt: 0.5, img2img: true },
  { value: "flux-dev", label: "FLUX dev · 品質好 ~NT$1/張（整套約 NT$80）", costNt: 1, img2img: true },
  { value: "openai-medium", label: "gpt-image-1 中品質 · ~NT$1.3/張（整套約 NT$100）", costNt: 1.3, img2img: true },
  { value: "openai-high", label: "gpt-image-1 高品質 · ~NT$5.5/張（整套約 NT$430）", costNt: 5.5, img2img: true },
];

function modelOption(m: TarotModel) {
  return MODEL_OPTIONS.find((o) => o.value === m) ?? MODEL_OPTIONS[0];
}

async function callGenerate(body: {
  model: TarotModel;
  prompt: string;
  referenceImage?: string | null;
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

export default function TarotStudio() {
  const [model, setModel] = useState<TarotModel>("flux-schnell");
  const [mode, setMode] = useState<Mode>("text");
  const [group, setGroup] = useState<GroupKey>("major");
  const [stylePrompt, setStylePrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewSeed, setPreviewSeed] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const doneCount = batch.filter((b) => b.status === "done").length;

  const lockedRef = referenceImage ?? previewImage;

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

  async function onPickReference(file: File | null) {
    if (!file) {
      setReferenceImage(null);
      return;
    }
    try {
      setReferenceImage(await readFileAsDataUrl(file));
    } catch {
      setMessage("參考圖讀取失敗");
    }
  }

  async function generatePreview() {
    setMessage(null);
    if (mode === "image" && !referenceImage) {
      setMessage("以圖生圖模式請先上傳一張參考圖（或切到文字模式並填描述）");
      return;
    }
    // 風格描述為選填：只要有「上傳參考圖」或「至少 3 字描述」其一即可
    const hasStyle = stylePrompt.trim().length >= 3;
    const hasRef = mode === "image" && !!referenceImage;
    if (!hasStyle && !hasRef) {
      setMessage("請填風格描述（至少 3 字），或在「以圖生圖」模式上傳一張參考圖當風格");
      return;
    }
    setPreviewBusy(true);
    setLocked(false);
    try {
      const resp = await callGenerate({
        model,
        prompt: buildCardPrompt(stylePrompt, PREVIEW_CARD),
        referenceImage: mode === "image" ? referenceImage : null,
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
        referenceImage: lockedRef, // enforce one consistent style across the deck (where the model supports img2img)
        seed: previewSeed, // FLUX reproducibility; ignored by openai
      });
      if (!resp.ok || !resp.image) {
        patchItem(index, { status: "error", error: resp.error ?? "unknown" });
        return;
      }
      const blob = await renderPrintCard(card, resp.image);
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
          {mode === "image" && !modelOption(model).img2img && (
            <div className="form-hint" style={{ color: "var(--yellow)" }}>
              ⚠ 此模型（{model}）不吃上傳參考圖，風格只靠「文字描述 + 固定 seed」維持一致；要用上傳圖當風格請選 FLUX dev 或 gpt-image-1。
            </div>
          )}
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
            <label className="form-label">參考圖（上傳）</label>
            <input
              type="file"
              accept="image/*"
              className="form-input"
              disabled={locked}
              onChange={(e) => onPickReference(e.target.files?.[0] ?? null)}
            />
            {referenceImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={referenceImage} alt="reference" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8 }} />
            )}
          </div>
        )}

        <div className="form-row">
          <label className="form-label">風格描述{mode === "image" && referenceImage ? "（選填，已上傳參考圖可留空）" : ""}</label>
          <textarea
            className="form-textarea"
            placeholder="例：中世紀彩色鉛筆塔羅插畫，暖色仿古紙質感，金色裝飾邊框，神秘氛圍"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            disabled={locked}
          />
          <div className="form-hint">這段風格會套用到整套 78 張牌。上傳參考圖時可留空（以圖為準）。</div>
        </div>

        <button className="btn-primary" onClick={generatePreview} disabled={previewBusy || locked}>
          {previewBusy ? "生成中…" : previewImage ? "重新生成預覽" : "生成風格預覽"}
        </button>

        {previewImage && (
          <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImage} alt="preview" style={{ width: 200, borderRadius: 10, border: "1px solid var(--card-border)" }} />
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

      {/* ── Step 2 + 3: batch + download ──────────────────────── */}
      {locked && (
        <div className="card">
          <h2 style={{ fontSize: 15, margin: "0 0 14px" }}>Step 2 · 整套生成與下載</h2>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <button className="btn-primary" onClick={generateBatch} disabled={batchBusy}>
              {batchBusy ? `生成中… ${doneCount}/${TAROT_CARDS.length}` : `生成整套 ${TAROT_CARDS.length} 張`}
            </button>
            <button className="btn-secondary" onClick={downloadZip} disabled={zipBusy || doneCount === 0}>
              {zipBusy ? "打包中…" : `下載 ZIP（${doneCount} 張）`}
            </button>
            <span className="form-hint">完成 {doneCount} / {TAROT_CARDS.length}</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {batch.map((it, i) => (
              <div
                key={it.card.id}
                title={`${it.card.name}${it.error ? ` — ${it.error}` : ""}`}
                style={{
                  width: 78,
                  height: 130,
                  borderRadius: 6,
                  border: `1px solid ${it.card.colors[0]}55`,
                  background: it.card.colors[1],
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  color: it.card.colors[0],
                  textAlign: "center",
                  cursor: it.status === "error" ? "pointer" : "default",
                }}
                onClick={it.status === "error" ? () => retryCard(i) : undefined}
              >
                {it.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt={it.card.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : it.status === "pending" ? (
                  <span>⏳</span>
                ) : it.status === "error" ? (
                  <span>⚠️<br />重試</span>
                ) : (
                  <span style={{ padding: 4 }}>{it.card.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
