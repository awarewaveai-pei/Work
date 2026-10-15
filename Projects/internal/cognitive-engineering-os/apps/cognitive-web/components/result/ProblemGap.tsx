import React from "react";
import { lineHeight, useLines, Wrap } from "./svgtext";

// framing.problem_statement's picture, drawn from the record alone: where you are (現況) and where you want to be (期望),
// the gap between them, what it costs, who it touches and what the statement leaves out (Wikipedia "Problem statement":
// ideal / reality / consequences; Juran: facts only, no cause, no solution).
export type ProblemContent = { current_state: string; expected_state: string; gap: string; impact?: string; affected_stakeholders?: string[]; scope_non_goals?: string };

const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
export function problemOf(record: Record<string, unknown> | undefined): ProblemContent | null {
  const c = record?.content as Record<string, unknown> | undefined;
  if (!c || !text(c.current_state) || !text(c.expected_state) || !text(c.gap)) return null;
  return {
    current_state: c.current_state as string, expected_state: c.expected_state as string, gap: c.gap as string,
    impact: text(c.impact) ? (c.impact as string) : undefined,
    affected_stakeholders: Array.isArray(c.affected_stakeholders) ? c.affected_stakeholders.filter(text) as string[] : undefined,
    scope_non_goals: text(c.scope_non_goals) ? (c.scope_non_goals as string) : undefined,
  };
}

const W = 1070, PAD = 14, BOX_W = 440, LEFT = 20, RIGHT = W - 20 - BOX_W, T = 15, B = 14, S = 13;

export function ProblemGap({ content }: { content: ProblemContent }) {
  const linesFor = useLines();
  const inner = BOX_W - 2 * PAD, wide = W - 40 - 2 * PAD;
  const boxH = PAD + lineHeight(T) + 6 + Math.max(linesFor(content.current_state, inner, B), linesFor(content.expected_state, inner, B)) * lineHeight(B) + PAD;
  const band = (body: string) => PAD + Math.max(linesFor(body, wide, B), 1) * lineHeight(B) + PAD;
  const top = 34;
  const gapY = top + boxH + 26, gapH = band(`差距：${content.gap}`);
  const impactY = gapY + gapH + 12, impactH = content.impact ? band(`影響：${content.impact}`) : 0;
  const who = content.affected_stakeholders?.length ? `受影響的人：${content.affected_stakeholders.join("、")}` : "";
  const notes = [who, content.scope_non_goals ? `這份陳述不談：${content.scope_non_goals}` : ""].filter(Boolean);
  let y = impactY + impactH + (impactH ? 14 : 2);
  const rows = notes.map((note) => { const at = y; y += linesFor(note, W - 40, S) * lineHeight(S) + 6; return { note, at }; });
  const height = y + 10, mid = top + boxH / 2;
  return <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="問題陳述圖：現況、期望與兩者之間的差距">
    <text x={LEFT} y="20" fontSize="13" className="m">你現在在這裡</text>
    <text x={RIGHT} y="20" fontSize="13" className="m">你想到這裡</text>
    {([[LEFT, "現況", content.current_state], [RIGHT, "期望", content.expected_state]] as const).map(([x, label, body]) => <g key={label}>
      <rect x={x} y={top} width={BOX_W} height={boxH} rx="10" className="node" style={{ stroke: "var(--line)" }} />
      <text x={x + PAD} y={top + PAD + T} fontSize={T} fontWeight="700">{label}</text>
      <Wrap x={x + PAD} y={top + PAD + lineHeight(T) + 6} width={inner} height={boxH - PAD - lineHeight(T) - 6} size={B}>{body}</Wrap>
    </g>)}
    <line x1={LEFT + BOX_W + 12} y1={mid} x2={RIGHT - 18} y2={mid} style={{ stroke: "var(--warn)" }} strokeWidth="3" />
    <path d={`M${RIGHT - 18},${mid - 9} L${RIGHT - 4},${mid} L${RIGHT - 18},${mid + 9} Z`} style={{ fill: "var(--warn)" }} />
    <text x={(LEFT + BOX_W + RIGHT) / 2} y={mid - 12} fontSize={T} fontWeight="700" textAnchor="middle" className="warn">差距</text>
    <rect x={LEFT} y={gapY} width={W - 40} height={gapH} rx="10" style={{ fill: "var(--bad-bg)", stroke: "var(--warn)" }} />
    <Wrap x={LEFT + PAD} y={gapY + PAD} width={wide} height={gapH - 2 * PAD} size={B}><b>差距：</b>{content.gap}</Wrap>
    {content.impact && <>
      <rect x={LEFT} y={impactY} width={W - 40} height={impactH} rx="10" style={{ fill: "var(--soft)", stroke: "var(--line)" }} />
      <Wrap x={LEFT + PAD} y={impactY + PAD} width={wide} height={impactH - 2 * PAD} size={B}><b>影響：</b>{content.impact}</Wrap>
    </>}
    {rows.map(({ note, at }) => <Wrap key={note} x={LEFT} y={at} width={W - 40} height={linesFor(note, W - 40, S) * lineHeight(S) + 2} size={S} className="m">{note}</Wrap>)}
  </svg>;
}
