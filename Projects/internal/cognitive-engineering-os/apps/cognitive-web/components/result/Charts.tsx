import React from "react";
import { linesFor, lineHeight, textWidth, Wrap } from "./svgtext";

// ③ of docs/mockups/iceberg-result-mock.html: each chart answers one question and says how to read it, what it shows
// and where it comes from. A: the numbers your record states (the interpretation's `trend`; its gate checks every value
// against the cited line). B: the feedback loop the interpretation found (`loop`, every node cited). C: the iceberg
// model's own leverage pattern -- method knowledge, never your data. No text in them is ever cut: it wraps and the
// drawing grows (svgtext.tsx).
export type TrendSeries = { name: string; unit: string; points: Array<{ label: string; value: number; citation: string }> };
export type Loop = { kind: "reinforcing" | "balancing"; name: string; reading: string; nodes: Array<{ id: string; text: string; citations: string[] }>; edges: Array<{ from: string; to: string }> };

const COLOURS = ["#1f5fbf", "#b25e09"];
const tidy = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function TrendChart({ series, cite }: { series: TrendSeries[]; cite: (id: string) => string }) {
  const labels = [...new Set(series.flatMap((line) => line.points.map((point) => point.label)))];
  const slot = labels.length > 1 ? 350 / (labels.length - 1) : 350;
  const x = (label: string) => 50 + (labels.length > 1 ? labels.indexOf(label) * slot : 175);
  // each series on its own axis (left: the first, right: the second) from min(0, its lowest) to its highest
  const low = series.map((line) => Math.min(0, ...line.points.map((point) => point.value)));
  const nice = (value: number) => { if (value <= 0) return 1; const power = 10 ** Math.floor(Math.log10(value)); return ([1, 2, 4, 5, 8, 10].find((k) => k * power >= value) ?? 10) * power; };   // 6 -> 8, 35 -> 40: round ticks (the mock's 8 人 / 40 分)
  const top = series.map((line, index) => nice(Math.max(...line.points.map((point) => point.value), low[index] + 1)));
  const y = (value: number, index: number) => 180 - ((value - low[index]) / (top[index] - low[index])) * 160;
  const labelLines = Math.max(...labels.map((label) => linesFor(label, Math.min(slot, 90), 11)));
  const foot = `每個點都來自你填的內容 ${series.flatMap((line) => line.points.map((point) => cite(point.citation))).filter((v, i, all) => v && all.indexOf(v) === i).join("")}${series.length > 1 ? "；兩線同時變化不代表因果。" : ""}`;
  const footLines = linesFor(foot, 400, 11);
  const footTop = 186 + labelLines * lineHeight(11) + 6;
  const height = footTop + footLines * lineHeight(11) + 8;
  const ticks = (index: number) => [top[index], (top[index] + low[index]) / 2, low[index]];
  const rightTickLabels = series[1] ? ticks(1).map((value) => `${tidy(value)} ${series[1].unit}`) : [];
  const viewWidth = rightTickLabels.length ? Math.max(460, 424 + Math.ceil(Math.max(...rightTickLabels.map((label) => textWidth(label, 11)))) + 8) : 460;
  return <svg viewBox={`0 0 ${viewWidth} ${height}`} role="img" aria-label={`${series.map((line) => line.name).join("與")}的變化`}>
    <line x1="50" y1="20" x2="50" y2="180" className="axis" /><line x1="50" y1="180" x2="420" y2="180" className="axis" />
    <g fontSize="11" className="m">
      {ticks(0).map((value, index) => <text key={index} x="46" textAnchor="end" y={[24, 104, 184][index]}>{tidy(value)} {series[0].unit}</text>)}
      {series[1] && ticks(1).map((value, index) => <text key={index} x="424" y={[24, 104, 184][index]}>{tidy(value)} {series[1].unit}</text>)}
    </g>
    {labels.map((label) => <Wrap key={label} x={x(label) - Math.min(slot, 90) / 2} y={186} width={Math.min(slot, 90)} height={labelLines * lineHeight(11) + 2} size={11} className="m" align="center">{label}</Wrap>)}
    {series.map((line, index) => <polyline key={line.name} points={line.points.map((point) => `${x(point.label)},${y(point.value, index)}`).join(" ")} fill="none" stroke={COLOURS[index]} strokeWidth="3" strokeDasharray={index ? "6 4" : undefined} />)}
    {series.map((line, index) => { const first = line.points[0], last = line.points[line.points.length - 1]; const text = `${line.name} ${tidy(first.value)} → ${tidy(last.value)} ${line.unit}`;
      const ax = Math.min(250, Math.max(55, x(last.label) - 130)), ay = Math.min(146, Math.max(20, y(last.value, index) + (index ? -34 : 8)));   // beside its own line's last point
      return <Wrap key={line.name} x={ax} y={ay} width={200} height={linesFor(text, 200, 12) * lineHeight(12) + 2} size={12} bold className={index ? "warn" : "a"}>{text}</Wrap>; })}
    <Wrap x={50} y={footTop} width={400} height={footLines * lineHeight(11) + 2} size={11} className="m">{foot}</Wrap>
  </svg>;
}

// Box centres for a loop of n nodes: half a step off the clock positions, so four boxes sit at the corners (the mock)
// and none sits at 3 or 9 o'clock beside the title. The ring widens with the boxes it has to hold.
export function loopLayout(n: number, rx = 150, ry = 78, cx = 230, cy = 118): Array<{ cx: number; cy: number }> {
  return Array.from({ length: n }, (_, index) => { const angle = (2 * Math.PI * index) / n + Math.PI / n; return { cx: cx + rx * Math.sin(angle), cy: cy - ry * Math.cos(angle) }; });
}

const BOX_W = 170, BOX_TEXT = 12.5;

export function LoopChart({ loop, dashed = new Set<string>() }: { loop: Loop; dashed?: Set<string> }) {
  const n = loop.nodes.length;   // 2-6 (schema)
  const lines = new Map(loop.nodes.map((node) => [node.id, linesFor(node.text, BOX_W - 16, BOX_TEXT) + (dashed.has(node.id) ? 1 : 0)]));   // a belief node carries its （信念層） line
  const boxH = (id: string) => 14 + (lines.get(id) ?? 1) * lineHeight(BOX_TEXT);
  const tallest = Math.max(...loop.nodes.map((node) => boxH(node.id)));
  const rx = n > 4 ? 230 : 190, ry = 78 + Math.max(0, tallest - 44) / 2 + (n > 4 ? 30 : 0);   // room in the middle for the title and its two notes
  const width = 2 * rx + BOX_W + 30, cx = width / 2, cy = ry + tallest / 2 + 10;
  const height = 2 * ry + tallest + 24;
  const layout = loopLayout(n, rx, ry, cx, cy);
  const where = new Map(loop.nodes.map((node, index) => [node.id, layout[index]]));
  // When every box clears the central text band vertically (the four-node diamond), use the actual left/right centre
  // span. Other layouts retain the inner-edge width so a title can never grow into a box sitting beside it.
  const centreSpan = Math.max(...layout.map((point) => point.cx)) - Math.min(...layout.map((point) => point.cx)) - 20;
  const centreW = layout.every((point) => Math.abs(point.cy - cy) > tallest / 2 + 34) ? centreSpan : 2 * rx - BOX_W - 20;
  const title = `${loop.kind === "reinforcing" ? "R" : "B"} ${loop.name}（${loop.kind === "reinforcing" ? "自我加強" : "自我平衡"}）`;
  const note1 = "箭頭 = 前者讓後者更嚴重", note2 = loop.kind === "reinforcing" ? "轉一圈回到起點，所以越轉越強" : "轉一圈回到起點，會被拉回來";
  const titleH = linesFor(title, centreW, 16) * lineHeight(16) + 2, noteH = (linesFor(note1, centreW, 11) + linesFor(note2, centreW, 11)) * lineHeight(11) + 2;
  const titleTop = cy - (titleH + noteH) / 2;
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${loop.name.replace(/迴路$/, "")}因果迴路`}>
    <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#245b8a" /></marker></defs>
    <g fill="none" stroke="#245b8a" strokeWidth="2" markerEnd="url(#arr)">{loop.edges.map((edge, index) => {
      const a = where.get(edge.from)!, b = where.get(edge.to)!; const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // leave each box before the arrow starts / ends: the distance to its own edge along the arrow's direction
      const pad = (id: string) => Math.min(Math.abs((BOX_W / 2) / (ux || 1e-9)), Math.abs((boxH(id) / 2) / (uy || 1e-9))) + 4;
      const s = pad(edge.from), t = pad(edge.to);
      return <path key={index} d={`M${a.cx + ux * s},${a.cy + uy * s} L${b.cx - ux * t},${b.cy - uy * t}`} stroke={dashed.has(edge.from) ? "#b25e09" : undefined} />; })}</g>
    <g className="node" stroke="#5a93c4" strokeWidth="1.5">{loop.nodes.map((node) => { const p = where.get(node.id)!; return <rect key={node.id} x={p.cx - BOX_W / 2} y={p.cy - boxH(node.id) / 2} width={BOX_W} height={boxH(node.id)} rx="8" stroke={dashed.has(node.id) ? "#b25e09" : undefined} strokeDasharray={dashed.has(node.id) ? "5 3" : undefined} />; })}</g>
    {loop.nodes.map((node) => { const p = where.get(node.id)!; return <Wrap key={node.id} x={p.cx - BOX_W / 2 + 8} y={p.cy - boxH(node.id) / 2 + 7} width={BOX_W - 16} height={boxH(node.id) - 8} size={BOX_TEXT} align="center" className={dashed.has(node.id) ? "warn" : undefined}>{node.text}{dashed.has(node.id) ? <><br /><span style={{ fontSize: 10.5 }}>（信念層）</span></> : null}</Wrap>; })}
    <Wrap x={cx - centreW / 2} y={titleTop} width={centreW} height={titleH} size={16} bold align="center" className="a">{title}</Wrap>
    <Wrap x={cx - centreW / 2} y={titleTop + titleH} width={centreW} height={noteH} size={11} align="center" className="m">{note1}<br />{note2}</Wrap>
  </svg>;
}

// The iceberg model's pattern (Anderson & Johnson): the deeper the layer, the harder to change and the longer it lasts.
const LEVERAGE: Array<[string, number, number, string]> = [["事件", 60, 60, "當次有效"], ["模式", 120, 120, "提早看到"], ["結構", 180, 260, "切斷迴路，持久"], ["心智模型", 300, 330, "最難、最慢，但最根本"]];

export function LeverageChart() {
  return <svg viewBox="0 0 460 210" role="img" aria-label="四層改變難度與效果持久度對比">
    <g fontSize="12.5">{LEVERAGE.map(([name], index) => <text key={name} x="10" y={42 + 40 * index}>{name}</text>)}</g>
    <g>{LEVERAGE.map(([name, hard, lasting], index) => <React.Fragment key={name}><rect x="90" y={28 + 40 * index} width={hard} height="9" fill="#9ca3af" /><rect x="90" y={39 + 40 * index} width={lasting} height="9" fill="#1f5fbf" /></React.Fragment>)}</g>
    <g fontSize="11" className="m">{LEVERAGE.map(([name, , , note], index) => <text key={name} x={[156, 216, 356, 300][index]} y={[36, 76, 127, 145][index]}>{note}</text>)}</g>   {/* the mock's label positions */}
    <g fontSize="11"><rect x="90" y="185" width="12" height="9" fill="#9ca3af" /><text x="106" y="193" className="m">改變難度</text><rect x="180" y="185" width="12" height="9" fill="#1f5fbf" /><text x="196" y="193" className="m">效果與持久度</text></g>
  </svg>;
}
