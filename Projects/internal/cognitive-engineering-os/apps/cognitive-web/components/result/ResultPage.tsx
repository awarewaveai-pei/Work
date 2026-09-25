"use client";

import { useState } from "react";
import React from "react";
import type { ReactNode } from "react";
import { apiFetch } from "../../lib/api";
import { HowTo } from "./HowTo";
import { MethodVisual } from "./MethodVisual";

type Interpretation = { interpretation_id: string; method_id: string; findings: Array<{ id: string; title: string; text: string; citations: string[]; confidence: { level: string; reason: string } }>; visual: { kind: string; bindings: Record<string, unknown> }; next_methods?: string[]; next_steps?: Array<Record<string, unknown>>; recommendations?: Array<Record<string, unknown>>; gaps?: Array<Record<string, unknown>>; provenance: Record<string, unknown>; model: string; usage: Record<string, number> };

function Section({ id, read, act, children }: { id: string; read: string; act: string; children: ReactNode }) { return <section className="section" data-section={id}><HowTo read={read} act={act} />{children}</section>; }

export function ResultPage({ result }: { result: Interpretation }) {
  const [judgment, setJudgment] = useState("");
  const findings = result.findings ?? [];
  return <div>
    <Section id="0" read="先看一句話與資料狀態。" act="確認這次分析回答的是你的問題。"><h2>{result.method_id}</h2><p className="muted">AI 草稿／{result.model}／輸入 {result.usage?.input_tokens ?? 0} tokens</p></Section>
    <Section id="1" read="逐張看發現與信心。" act="點開每個引註，回到原始資料核對。"><div className="grid">{findings.map((finding) => <article className="card" key={finding.id}><h3>{finding.title}</h3><p>{finding.text}</p><p className="muted">信心：{finding.confidence.level} — {finding.confidence.reason}</p><p>{finding.citations.map((citation) => <a href={`#citation-${citation}`} key={citation}>[{citation}] </a>)}</p></article>)}</div></Section>
    <Section id="2" read="圖形的每個單位都對應 record path。" act="不要把圖形當成自動決策。"><MethodVisual kind={result.visual.kind} bindings={result.visual.bindings} /></Section>
    <Section id="3" read="這是本方法原生視覺，不是額外推測。" act="比較圖形和上面的文字是否一致。"><p>視覺原語：{result.visual.kind}</p></Section>
    <Section id="4" read="總結每個 finding 的共同方向。" act="標出你要進一步查證的地方。"><p>{findings.map((item) => item.text).join(" ")}</p></Section>
    <Section id="5" read="下一步是候選，不是命令。" act="選一個你願意補資料的方法。"><ul>{(result.next_steps ?? []).map((step, index) => <li key={index}>{String(step.method_id ?? "下一步")}：{String(step.yields ?? "補充分析")}</li>)}</ul></Section>
    <Section id="6" read="解決方案在 P4 才會正式生成。" act="此階段先保留人工判斷。"><p className="muted">解決方案比較尚未啟用。</p></Section>
    <Section id="7" read="引註是 prompt manifest 的實際路徑。" act="回到來源確認範圍與時間。"><ul>{findings.flatMap((item) => item.citations).map((citation) => <li id={`citation-${citation}`} key={citation}>{citation}</li>)}</ul></Section>
    <Section id="8" read="最後看 AI 狀態與人工判斷。" act="接受、要求修改或拒絕這次解讀。"><p>Provenance：{String(result.provenance?.authorship_state ?? "AI_GENERATED")}</p><div className="grid">{["accept", "revise", "reject"].map((stance) => <button type="button" className={judgment === stance ? "" : "secondary"} key={stance} onClick={async () => { setJudgment(stance); await apiFetch(`/interpretations/${result.interpretation_id}/judgment`, { method: "POST", body: JSON.stringify({ stance, note: "user judgment" }) }).catch(() => undefined); }}>{stance}</button>)}</div></Section>
  </div>;
}
