import React from "react";
import { lineHeight, useLines, Wrap } from "./svgtext";

// root_cause.five_whys's picture, drawn from the record alone (Wikipedia "Five whys"; Lean Enterprise Institute "5 Whys"):
// the cause you chose to drill into, then each why and its answer down to where you stopped, with the evidence each answer
// cites and the stop conditions you met. The number of steps is whatever the record holds -- five is not the point.
export type WhyStep = { step: number; question: string; answer: string; refs: string[] };
export type Chain = { target: string; statement?: string; steps: WhyStep[]; stops: string[] };

export function chainOf(record: Record<string, unknown> | undefined): Chain | null {
  const rows = record?.why_chain;
  if (!Array.isArray(rows) || typeof record?.target_hypothesis_id !== "string") return null;
  const steps = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof r.question === "string" && typeof r.answer === "string")
    .map((r) => ({ step: Number(r.step), question: r.question as string, answer: r.answer as string, refs: Array.isArray(r.supporting_evidence_refs) ? r.supporting_evidence_refs.filter((x): x is string => typeof x === "string") : [] }))
    .sort((a, b) => a.step - b.step);
  if (!steps.length) return null;
  const statement = typeof record.target_hypothesis_statement === "string" && record.target_hypothesis_statement.trim() ? record.target_hypothesis_statement : undefined;
  return { target: record.target_hypothesis_id as string, statement, steps, stops: Array.isArray(record.stop_conditions_met) ? record.stop_conditions_met.filter((x): x is string => typeof x === "string") : [] };
}

const W = 1070, BW = 860, X = (W - BW) / 2, PAD = 12, T = 15, B = 14, S = 13, ARROW = 46;

export function WhyChain({ chain, stopLabel = (value) => value }: { chain: Chain; stopLabel?: (value: string) => string }) {
  const linesFor = useLines();
  const inner = BW - 2 * PAD;
  const head = chain.statement ? `${chain.target}｜${chain.statement}` : `${chain.target}（這份紀錄沒有寫這個原因的內容）`;
  const box = (body: string, size: number) => PAD + lineHeight(T) + 4 + linesFor(body, inner, size) * lineHeight(size) + PAD;
  let y = 10;
  const headAt = y, headH = box(head, B); y += headH;
  const steps = chain.steps.map((s, i) => {
    const qLines = linesFor(`第 ${s.step} 問：${s.question}`, BW, B), qAt = y + 10;
    y = qAt + qLines * lineHeight(B) + ARROW - 20;
    const body = s.answer, at = y, h = box(body, B);
    y += h;
    return { s, qAt, qLines, at, h, body, last: i === chain.steps.length - 1 };
  });
  const stopText = chain.stops.length ? `停在這裡，因為：${chain.stops.map(stopLabel).join("、")}` : "這份紀錄沒有寫為什麼停在這裡。";
  const stopAt = y + 16, height = stopAt + linesFor(stopText, BW, S) * lineHeight(S) + 16;
  return <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`為什麼鏈：從 ${chain.target} 往下問了 ${chain.steps.length} 次`}>
    <rect x={X} y={headAt} width={BW} height={headH} rx="10" style={{ fill: "var(--soft)", stroke: "var(--line)" }} />
    <text x={X + PAD} y={headAt + PAD + T} fontSize={T} fontWeight="700">要追問的原因（從魚骨圖選的）</text>
    <Wrap x={X + PAD} y={headAt + PAD + lineHeight(T) + 4} width={inner} height={headH - 2 * PAD - lineHeight(T)} size={B}>{head}</Wrap>
    {steps.map(({ s, qAt, qLines, at, h, body, last }) => <g key={s.step} data-why={s.step}>
      <Wrap x={X} y={qAt} width={BW} height={qLines * lineHeight(B) + 2} size={B} bold className="a">第 {s.step} 問：{s.question}</Wrap>
      <line x1={W / 2} y1={qAt + qLines * lineHeight(B) + 2} x2={W / 2} y2={at - 8} className="axis" strokeWidth="2" />
      <path d={`M${W / 2 - 7},${at - 14} L${W / 2},${at - 2} L${W / 2 + 7},${at - 14} Z`} style={{ fill: "var(--axis)" }} />
      <rect x={X} y={at} width={BW} height={h} rx="10" className="node" style={{ stroke: last ? "var(--accent)" : "var(--line)", strokeWidth: last ? 2.5 : 1 }} />
      <text x={X + PAD} y={at + PAD + T} fontSize={T} fontWeight="700">{last ? "答：追到這裡（根本原因候選）" : "答"}</text>
      <text x={X + BW - PAD} y={at + PAD + T} fontSize={S} textAnchor="end" className={s.refs.length ? "a" : "m"}>{s.refs.length ? `依據 ${s.refs.join("、")}` : "這一步沒有附依據"}</text>
      <Wrap x={X + PAD} y={at + PAD + lineHeight(T) + 4} width={inner} height={h - 2 * PAD - lineHeight(T)} size={B}>{body}</Wrap>
    </g>)}
    <Wrap x={X} y={stopAt} width={BW} height={height - stopAt} size={S} className="m">{stopText}</Wrap>
  </svg>;
}
