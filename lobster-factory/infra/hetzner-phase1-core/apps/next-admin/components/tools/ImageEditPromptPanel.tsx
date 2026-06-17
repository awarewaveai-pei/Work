"use client";

import { useMemo, useState } from "react";
import { AI_TEXT_MODEL_GROUPS, AI_TEXT_MODELS, DEFAULT_AI_TEXT_MODEL, type AiTextModel } from "@/lib/ai/text-model-options";
import { roleHeader } from "@/lib/ops-role";
import { modelSupportsRefs, type AspectRatio, type StudioModel } from "@/lib/studio/model-options";

interface EditPromptResponse {
  ok: boolean;
  editPlan?: { editPrompt?: string };
  error?: string;
}

interface GenerateResponse {
  ok: boolean;
  image?: string;
  seed?: number | null;
  error?: string;
}

export interface EditedImageMeta {
  prompt: string;
  model: StudioModel;
  seed: number | null;
}

export interface ImageEditPromptPanelProps {
  sourceImage?: string | null;
  currentPrompt: string;
  imageModel: StudioModel;
  target: string;
  generateEndpoint?: string;
  aspectRatio?: AspectRatio;
  printQuality?: boolean;
  styleAnchor?: Record<string, unknown>;
  title?: string;
  onEditedImage: (image: string, meta: EditedImageMeta) => void;
}

const FALLBACK_REF_MODEL: StudioModel = "flux-dev";

export default function ImageEditPromptPanel({
  sourceImage,
  currentPrompt,
  imageModel,
  target,
  generateEndpoint = "/api/tools/studio/generate",
  aspectRatio,
  printQuality,
  styleAnchor,
  title = "AI 修圖 prompt",
  onEditedImage,
}: ImageEditPromptPanelProps) {
  const [aiModel, setAiModel] = useState<AiTextModel>(DEFAULT_AI_TEXT_MODEL);
  const [instruction, setInstruction] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const editModel = useMemo<StudioModel>(
    () => (modelSupportsRefs(imageModel) ? imageModel : FALLBACK_REF_MODEL),
    [imageModel],
  );
  const canGenerate = Boolean(sourceImage && editPrompt.trim());

  async function suggestEditPrompt() {
    if (!sourceImage) {
      setMessage("請先生成一張圖片");
      return;
    }
    if (!instruction.trim()) {
      setMessage("請先寫你想怎麼修改這張圖");
      return;
    }
    setPromptBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tools/studio/edit-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({
          aiModel,
          editInstruction: instruction.trim(),
          currentPrompt,
          sourceImage,
          imageModel: editModel,
          target,
          styleAnchor,
        }),
      });
      const data = (await res.json()) as EditPromptResponse;
      if (!data.ok || !data.editPlan?.editPrompt) {
        setMessage(`AI 修圖 prompt 生成失敗：${data.error ?? "unknown"}`);
        return;
      }
      setEditPrompt(data.editPlan.editPrompt);
    } catch (err) {
      setMessage(`AI 修圖 prompt 生成失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPromptBusy(false);
    }
  }

  async function generateEditedImage() {
    if (!sourceImage) {
      setMessage("請先生成一張圖片");
      return;
    }
    if (!editPrompt.trim()) {
      setMessage("請先產生或填入修圖 prompt");
      return;
    }
    setGenerateBusy(true);
    setMessage(null);
    try {
      const res = await fetch(generateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({
          model: editModel,
          prompt: editPrompt.trim(),
          referenceImages: [sourceImage],
          seed: null,
          aspectRatio,
          printQuality: printQuality === true,
        }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!data.ok || !data.image) {
        setMessage(`修改版生成失敗：${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      onEditedImage(data.image, { prompt: editPrompt.trim(), model: editModel, seed: data.seed ?? null });
    } catch (err) {
      setMessage(`修改版生成失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerateBusy(false);
    }
  }

  return (
    <div style={{ width: 320, border: "1px solid var(--card-border)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div className="form-row" style={{ marginBottom: 8 }}>
        <label className="form-label">AI 模型</label>
        <select
          className="form-select"
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value as AiTextModel)}
          disabled={promptBusy || generateBusy}
        >
          {AI_TEXT_MODEL_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {AI_TEXT_MODELS.filter((m) => m.group === g).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="form-row" style={{ marginBottom: 8 }}>
        <label className="form-label">想怎麼改</label>
        <textarea
          className="form-textarea"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例：背景改成日出，人物、構圖和畫風都不要變"
          disabled={promptBusy || generateBusy}
          style={{ minHeight: 70 }}
        />
      </div>
      <button className="btn-secondary" onClick={suggestEditPrompt} disabled={promptBusy || generateBusy || !instruction.trim()}>
        {promptBusy ? "AI 生成中…" : "AI 產生修圖 prompt"}
      </button>
      <div className="form-row" style={{ marginTop: 8, marginBottom: 8 }}>
        <label className="form-label">修圖 prompt</label>
        <textarea
          className="form-textarea"
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          placeholder="AI 產生後可手動微調"
          disabled={generateBusy}
          style={{ minHeight: 92 }}
        />
      </div>
      <button className="btn-primary" onClick={generateEditedImage} disabled={generateBusy || !canGenerate}>
        {generateBusy ? "生成修改版中…" : "用這個 prompt 修改圖片"}
      </button>
      <div className="form-hint" style={{ marginTop: 8 }}>
        修改版會用目前圖片當參考圖；生成模型：{editModel}
        {editModel !== imageModel ? "（目前模型不吃參考圖，已自動改用可參考圖片的模型）" : ""}
      </div>
      {message ? <div className="form-hint" style={{ color: "#e5484d", marginTop: 8 }}>{message}</div> : null}
    </div>
  );
}
