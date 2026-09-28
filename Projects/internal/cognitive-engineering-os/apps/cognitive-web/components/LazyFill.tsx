"use client";

import { useState } from "react";
import React from "react";
import { apiFetch } from "../lib/api";
import { humanError } from "../lib/errors";
import { applyLazyLines, FormField } from "../lib/form-model";

export function LazyFill({ methodId, fields, state, onState, onSuggested }: { methodId: string; fields: FormField[]; state: Record<string, unknown>; onState: (state: Record<string, unknown>) => void; onSuggested?: (keys: string[]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  // I-15: the mock's 「手邊有一段描述？」 block (inside the input card, so no card of its own)
  return <div><p className="sub">貼上「欄位: 值」，先免費比對；只有不完整時才請 AI 起草。</p><textarea rows={4} aria-label="貼上一段描述" value={text} onChange={(event) => setText(event.target.value)} /><div className="btns mt6"><button type="button" className="btn" onClick={async () => { const result = applyLazyLines(text, fields, state); onState(result.state); if (result.missing.length === 0) { setMessage("已完成免費欄位比對"); return; } try { const response = await apiFetch<{ draft: Record<string, unknown> }>(`/ai/draft/method/${methodId}`, { method: "POST", body: JSON.stringify({ brief: text }) }); const drafted = response.draft ?? {}; onState({ ...result.state, ...drafted }); onSuggested?.(Object.keys(drafted)); setMessage(`AI 幫你起草了 ${Object.keys(drafted).length} 格；請逐格核對後再送出。`); } catch (error) { setMessage(`AI 起草沒有完成：${humanError(error)}`); } }}>比對並填入</button></div>{message && <p className="sub" role="status">{message}</p>}</div>;
}
