import React from "react";
import { lineHeight, useLines, Wrap } from "./svgtext";

// root_cause.fishbone's picture, drawn from the record alone (ASQ fishbone procedure): the problem at the head on the
// right, the spine, one bone per category (in the order you named them), each bone's candidate causes along it. Every
// cause is still a hypothesis -- the picture says so; validating it is the five whys' or the Pareto's job.
export type Cause = { id: string; statement: string; category?: string };
export type Bone = { category: string; causes: Cause[] };

export function bonesOf(record: Record<string, unknown> | undefined): Bone[] {
  const hypotheses = record?.hypotheses;
  if (!Array.isArray(hypotheses)) return [];
  const bones = new Map<string, Cause[]>();
  for (const h of hypotheses) {
    if (!h || typeof h !== "object" || typeof (h as Cause).id !== "string" || typeof (h as Cause).statement !== "string" || !(h as Cause).statement.trim()) continue;
    const category = typeof (h as Cause).category === "string" && (h as Cause).category!.trim() ? (h as Cause).category!.trim() : "未分類";
    bones.set(category, [...(bones.get(category) ?? []), h as Cause]);
  }
  return [...bones].map(([category, causes]) => ({ category, causes }));
}

const W = 1070, HEAD_W = 230, HEAD_X = W - 20 - HEAD_W, T = 15, S = 13, GAP = 34;

export function Fishbone({ bones, problem }: { bones: Bone[]; problem?: string }) {
  const linesFor = useLines();
  const cols = Math.max(1, Math.ceil(bones.length / 2)), colW = (HEAD_X - 40) / cols, textW = colW - 34;
  const blockH = (bone: Bone) => lineHeight(T) + 4 + bone.causes.reduce((sum, c) => sum + linesFor(`${c.id} ${c.statement}`, textW, S) * lineHeight(S) + 4, 0);
  const top = bones.filter((_, i) => i % 2 === 0), bottom = bones.filter((_, i) => i % 2 === 1);
  const topH = Math.max(0, ...top.map(blockH)), bottomH = Math.max(0, ...bottom.map(blockH));
  const head = problem?.trim() || "問題陳述（這份紀錄沒有寫問題本身）";
  const headH = Math.max(90, 28 + lineHeight(T) + linesFor(head, HEAD_W - 24, S) * lineHeight(S));
  const spine = 26 + Math.max(topH + GAP, headH / 2), height = spine + Math.max(bottomH + GAP, headH / 2) + 40;
  return <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`魚骨圖：${bones.length} 個類別的可能原因，指向右邊的問題`}>
    <line x1="20" y1={spine} x2={HEAD_X} y2={spine} className="axis" strokeWidth="3" />
    <rect x={HEAD_X} y={spine - headH / 2} width={HEAD_W} height={headH} rx="10" style={{ fill: "var(--bad-bg)", stroke: "var(--bad)" }} />
    <text x={HEAD_X + 12} y={spine - headH / 2 + 12 + T} fontSize={T} fontWeight="700">問題（魚頭）</text>
    <Wrap x={HEAD_X + 12} y={spine - headH / 2 + 16 + lineHeight(T)} width={HEAD_W - 24} height={headH - 28 - lineHeight(T)} size={S}>{head}</Wrap>
    {bones.map((bone, i) => {
      const col = Math.floor(i / 2), up = i % 2 === 0, x = 30 + col * colW, h = blockH(bone);
      const y = up ? spine - GAP - h : spine + GAP;
      let at = y + lineHeight(T) + 4;
      return <g key={bone.category} data-bone={bone.category}>
        <line x1={x + 8} y1={up ? y + h : y} x2={x + colW - 14} y2={spine} className="axis" strokeWidth="2" />
        <text x={x + 14} y={y + T} fontSize={T} fontWeight="700" className="a">{bone.category}</text>
        {bone.causes.map((cause) => { const lines = linesFor(`${cause.id} ${cause.statement}`, textW, S), from = at; at += lines * lineHeight(S) + 4;
          return <Wrap key={cause.id} x={x + 14} y={from} width={textW} height={lines * lineHeight(S) + 2} size={S}><b>{cause.id}</b> {cause.statement}</Wrap>; })}
      </g>;
    })}
    <text x="20" y={height - 14} fontSize="12" className="m">每一根骨頭是一類原因；上面的原因都還是假設，要用「五個為什麼」或「柏拉圖」驗證。</text>
  </svg>;
}
