import React from "react";
import { lineHeight, useLines, Wrap } from "./svgtext";

// root_cause.pareto's picture, drawn from the record's computed ranking (ASQ Pareto chart procedure): bars longest first,
// the left scale running to the total so it sits exactly opposite 100% on the right, the cumulative line, and -- only when
// you set one -- the threshold and the causes it marks as the vital few. 80/20 is not a law: the record's own numbers decide.
export type Rank = { hypothesis_id: string; metric_value: number; share_of_total_percent: number; cumulative_share_percent: number };
export type Pareto = { metric: string; ranks: Rank[]; statements: Record<string, string>; threshold?: number; vitalFew: string[] };

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
export function paretoOf(record: Record<string, unknown> | undefined): Pareto | null {
  const ranking = record?.ranking;
  if (!Array.isArray(ranking)) return null;
  const ranks = ranking.filter((r): r is Rank => !!r && typeof r === "object" && typeof (r as Rank).hypothesis_id === "string"
    && num((r as Rank).metric_value) && num((r as Rank).share_of_total_percent) && num((r as Rank).cumulative_share_percent));
  if (!ranks.length || ranks.length !== ranking.length || ranks.every((r) => r.metric_value === 0)) return null;   // nothing counted: the builder refuses it too (PARETO_RANKING_ZERO_TOTAL)
  const statements: Record<string, string> = {};
  for (const c of Array.isArray(record?.causes) ? record.causes : []) {
    if (c && typeof c === "object" && typeof (c as { hypothesis_id?: unknown }).hypothesis_id === "string" && typeof (c as { statement?: unknown }).statement === "string") statements[(c as { hypothesis_id: string }).hypothesis_id] = (c as { statement: string }).statement;
  }
  const set = record?.threshold_status === "OPERATOR_SET" && num(record?.vital_few_threshold_percent);
  return { metric: typeof record?.metric_name === "string" ? record.metric_name : "", ranks, statements,
    threshold: set ? (record!.vital_few_threshold_percent as number) : undefined,
    vitalFew: set && Array.isArray(record?.vital_few_hypothesis_ids) ? record!.vital_few_hypothesis_ids.filter((x): x is string => typeof x === "string") : [] };
}

const W = 1070, L = 70, R = 990, TOP = 30, PLOT_H = 280, S = 13;

export function ParetoChart({ pareto }: { pareto: Pareto }) {
  const linesFor = useLines();
  const n = pareto.ranks.length, slot = (R - L) / n, barW = Math.min(110, slot * 0.66), bottom = TOP + PLOT_H;
  const total = pareto.ranks.reduce((sum, r) => sum + r.metric_value, 0);
  const yOf = (value: number) => bottom - (value / total) * PLOT_H, yPct = (pct: number) => bottom - (pct / 100) * PLOT_H;
  const label = (r: Rank) => `${r.hypothesis_id} ${pareto.statements[r.hypothesis_id] ?? ""}`.trim();
  const labelH = Math.max(...pareto.ranks.map((r) => linesFor(label(r), slot - 8, S))) * lineHeight(S);
  const height = bottom + 14 + labelH + 30;
  const points = pareto.ranks.map((r, i) => [L + slot * (i + 0.5), yPct(r.cumulative_share_percent)] as const);
  const ticks = [0, 25, 50, 75, 100];
  return <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`柏拉圖：${n} 個原因由多到少排列，加上累積百分比線`}>
    {ticks.map((pct) => <g key={pct}>
      <line x1={L} y1={yPct(pct)} x2={R} y2={yPct(pct)} className="axis" opacity="0.35" />
      <text x={L - 8} y={yPct(pct) + 4} fontSize="12" textAnchor="end" className="m">{Math.round((pct / 100) * total * 10) / 10}</text>
      <text x={R + 8} y={yPct(pct) + 4} fontSize="12" className="m">{pct}%</text>
    </g>)}
    {pareto.ranks.map((r, i) => { const vital = pareto.vitalFew.includes(r.hypothesis_id), x = L + slot * (i + 0.5) - barW / 2;
      return <g key={r.hypothesis_id} data-bar={r.hypothesis_id} data-vital={vital ? "yes" : "no"}>
        <rect x={x} y={yOf(r.metric_value)} width={barW} height={bottom - yOf(r.metric_value)} style={{ fill: vital ? "var(--accent)" : "var(--axis)" }} />
        {bottom - yOf(r.metric_value) >= 24   // inside the bar's top: the first bar's top is its own cumulative point, a label above would sit on the line
          ? <text x={x + barW / 2} y={yOf(r.metric_value) + 17} fontSize="13" fontWeight="700" textAnchor="middle" style={{ fill: "var(--bg)" }}>{r.metric_value}</text>
          : <text x={x + barW / 2} y={yOf(r.metric_value) - 6} fontSize="12" textAnchor="middle">{r.metric_value}</text>}
        <Wrap x={L + slot * i + 4} y={bottom + 10} width={slot - 8} height={labelH + 2} size={S} align="center">{label(r)}</Wrap>
      </g>; })}
    <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none" style={{ stroke: "var(--warn)" }} strokeWidth="2.5" />
    {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" style={{ fill: "var(--warn)" }} />)}
    {pareto.threshold !== undefined && <>
      <line x1={L} y1={yPct(pareto.threshold)} x2={R} y2={yPct(pareto.threshold)} style={{ stroke: "var(--bad)" }} strokeDasharray="6 5" strokeWidth="1.5" />
      <text x={L + 6} y={yPct(pareto.threshold) - 6} fontSize="12" className="warn">門檻 {pareto.threshold}%（你定的）</text>
    </>}
    <line x1={L} y1={bottom} x2={R} y2={bottom} className="axis" />
    <text x={L - 8} y={TOP - 12} fontSize="12" textAnchor="end" className="m">數量</text>
    <text x={R + 8} y={TOP - 12} fontSize="12" className="m">累積</text>
    <Wrap x={L} y={height - 26} width={R - L} height={22} size={12} className="m">{pareto.metric}{pareto.threshold === undefined ? "；門檻還沒定，所以沒有標出關鍵少數" : "；深色＝關鍵少數（累積到門檻為止），灰色＝其餘；橘線＝累積百分比"}</Wrap>
  </svg>;
}
