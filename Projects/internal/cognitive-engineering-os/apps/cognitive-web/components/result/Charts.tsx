import React from "react";

// ③ of docs/mockups/iceberg-result-mock.html: each chart answers one question and says how to read it, what it shows
// and where it comes from. A: the numbers your record states (the interpretation's `trend`; its gate checks every value
// against the cited line). B: the feedback loop the interpretation found (`loop`, every node cited). C: the iceberg
// model's own leverage pattern -- method knowledge, never your data.
export type TrendSeries = { name: string; unit: string; points: Array<{ label: string; value: number; citation: string }> };
export type Loop = { kind: "reinforcing" | "balancing"; name: string; reading: string; nodes: Array<{ id: string; text: string; citations: string[] }>; edges: Array<{ from: string; to: string }> };

const cut = (text: string, max: number) => (Array.from(text).length > max ? Array.from(text).slice(0, max).join("") + "…" : text);
const COLOURS = ["#1f5fbf", "#b25e09"];

export function TrendChart({ series, cite }: { series: TrendSeries[]; cite: (id: string) => string }) {
  const labels = [...new Set(series.flatMap((line) => line.points.map((point) => point.label)))];
  const x = (label: string) => 50 + (labels.length > 1 ? (labels.indexOf(label) * 350) / (labels.length - 1) : 175);
  // each series on its own scale from min(0, its lowest) to its highest: negatives stay inside the plot
  const low = series.map((line) => Math.min(0, ...line.points.map((point) => point.value)));
  const top = series.map((line, index) => Math.max(...line.points.map((point) => point.value), low[index] + 1));
  const y = (value: number, index: number) => 180 - ((value - low[index]) / (top[index] - low[index])) * 150;
  return <svg viewBox="0 0 460 230" role="img" aria-label={`${series.map((line) => line.name).join("與")}的變化`}>
    <line x1="50" y1="20" x2="50" y2="180" className="axis" /><line x1="50" y1="180" x2="420" y2="180" className="axis" />
    <g fontSize="11" className="m">
      <text x="8" y="34">{top[0]} {series[0].unit}</text><text x="8" y="184">{low[0]}</text>
      {series[1] && <text x="426" y="34">{top[1]} {series[1].unit}</text>}
      {labels.map((label) => <text key={label} x={x(label) - 14} y="198">{cut(label, 5)}</text>)}
    </g>
    {series.map((line, index) => <polyline key={line.name} points={line.points.map((point) => `${x(point.label)},${y(point.value, index)}`).join(" ")} fill="none" stroke={COLOURS[index]} strokeWidth="3" strokeDasharray={index ? "6 4" : undefined} />)}
    <g fontSize="12" fontWeight="700">{series.map((line, index) => { const first = line.points[0], last = line.points[line.points.length - 1];
      return <text key={line.name} className={index ? "warn" : "a"} x={index ? 180 : 270} y={index ? 42 : 165}>{cut(line.name, 8)} {first.value} → {last.value} {line.unit}</text>; })}</g>
    <text x="50" y="222" fontSize="11" className="m">每個點都來自你填的內容 {series.flatMap((line) => line.points.map((point) => cite(point.citation))).filter((v, i, all) => v && all.indexOf(v) === i).join("")}</text>
  </svg>;
}

// Box centres for a loop of n nodes: half a step off the clock positions, so four boxes sit at the corners (the mock)
// and none sits at 3 or 9 o'clock beside the title.
export function loopLayout(n: number): Array<{ cx: number; cy: number }> {
  return Array.from({ length: n }, (_, index) => { const angle = (2 * Math.PI * index) / n + Math.PI / n; return { cx: 230 + 150 * Math.sin(angle), cy: 118 - 78 * Math.cos(angle) }; });
}

export function LoopChart({ loop }: { loop: Loop }) {
  const n = loop.nodes.length;   // 2-6 (schema); with the title at most 8 characters, no box reaches the centre band (Charts.test.tsx)
  const layout = loopLayout(n);
  const where = new Map(loop.nodes.map((node, index) => [node.id, layout[index]]));
  return <svg viewBox="0 0 460 250" role="img" aria-label={`${loop.name}因果迴路`}>
    <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#245b8a" /></marker></defs>
    <g fill="none" stroke="#245b8a" strokeWidth="2" markerEnd="url(#arr)">{loop.edges.map((edge, index) => {
      const a = where.get(edge.from)!, b = where.get(edge.to)!; const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
      const pad = (ux: number, uy: number) => Math.min(Math.abs(75 / (ux || 1e-9)), Math.abs(22 / (uy || 1e-9))) + 4;   // leave the box before the arrow starts
      const ux = dx / len, uy = dy / len, s = pad(ux, uy);
      return <path key={index} d={`M${a.cx + ux * s},${a.cy + uy * s} L${b.cx - ux * s},${b.cy - uy * s}`} />; })}</g>
    <g className="node" stroke="#5a93c4" strokeWidth="1.5">{loop.nodes.map((node) => { const p = where.get(node.id)!; return <rect key={node.id} x={p.cx - 75} y={p.cy - 22} width="150" height="44" rx="8" />; })}</g>
    <g fontSize="12.5" textAnchor="middle">{loop.nodes.map((node) => { const p = where.get(node.id)!; return <text key={node.id} x={p.cx} y={p.cy + 5}>{cut(node.text, 11)}</text>; })}</g>
    <text x="230" y="124" fontSize="14" fontWeight="700" textAnchor="middle" className="a">{loop.kind === "reinforcing" ? "R" : "B"} {cut(loop.name, 8)}</text>
    <text x="230" y="141" fontSize="11" textAnchor="middle" className="m">{loop.kind === "reinforcing" ? "自我加強：越轉越強" : "自我平衡：會被拉回來"}</text>
  </svg>;
}

// The iceberg model's pattern (Anderson & Johnson): the deeper the layer, the harder to change and the longer it lasts.
const LEVERAGE: Array<[string, number, number, string]> = [["事件", 60, 60, "當次有效"], ["模式", 120, 120, "提早看到"], ["結構", 180, 260, "改了就持久"], ["心智模型", 300, 330, "最難、最慢，但最根本"]];

export function LeverageChart() {
  return <svg viewBox="0 0 460 210" role="img" aria-label="四層改變難度與效果持久度對比">
    <g fontSize="12.5">{LEVERAGE.map(([name], index) => <text key={name} x="10" y={42 + 40 * index}>{name}</text>)}</g>
    <g>{LEVERAGE.map(([name, hard, lasting], index) => <React.Fragment key={name}><rect x="90" y={28 + 40 * index} width={hard} height="9" fill="#9ca3af" /><rect x="90" y={39 + 40 * index} width={lasting} height="9" fill="#1f5fbf" /></React.Fragment>)}</g>
    <g fontSize="11" className="m">{LEVERAGE.map(([name, , , note], index) => <text key={name} x={[156, 216, 356, 300][index]} y={[36, 76, 127, 145][index]}>{note}</text>)}</g>   {/* the mock's label positions */}
    <g fontSize="11"><rect x="90" y="185" width="12" height="9" fill="#9ca3af" /><text x="106" y="193" className="m">改變難度</text><rect x="180" y="185" width="12" height="9" fill="#1f5fbf" /><text x="196" y="193" className="m">效果與持久度</text></g>
  </svg>;
}
