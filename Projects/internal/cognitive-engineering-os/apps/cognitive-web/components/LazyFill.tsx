"use client";

import { useState } from "react";
import React from "react";
import { apiFetch } from "../lib/api";
import { applyLazyLines, FormField } from "../lib/form-model";

export function LazyFill({ methodId, fields, state, onState, onSuggested }: { methodId: string; fields: FormField[]; state: Record<string, unknown>; onState: (state: Record<string, unknown>) => void; onSuggested?: (keys: string[]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  return <div className="card"><h3>懶人填寫</h3><p className="muted">貼上「欄位: 值」，先免費比對；只有不完整時才請 AI 起草。</p><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /><button type="button" className="secondary" onClick={async () => { const result = applyLazyLines(text, fields, state); onState(result.state); if (result.missing.length === 0) { setMessage("已完成免費欄位比對"); return; } try { const response = await apiFetch<{ draft: Record<string, unknown> }>(`/ai/draft/method/${methodId}`, { method: "POST", body: JSON.stringify({ brief: text }) }); const drafted = response.draft ?? {}; onState({ ...result.state, ...drafted }); onSuggested?.(Object.keys(drafted)); setMessage(`AI_SUGGESTED：已填入 ${Object.keys(drafted).length} 欄；請逐欄確認後再送出。`); } catch (error) { setMessage(`AI 草稿未完成：${String(error)}`); } }} >比對並填入</button>{message && <p className="muted">{message}</p>}</div>;
}
