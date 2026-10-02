import React from "react";
import { Wrap } from "./svgtext";

// delivery.risk_register's picture: probability (across) × impact (up) on a 5×5 grid, each risk placed in its cell from
// the record's own numbers (no model reading involved). A cell's zone comes from its two grades multiplied (1..25), the
// usual risk-matrix scoring; the record's exposure (probability × impact) is printed in the list under the picture.
export type Risk = { risk_id: string; description: string; probability: number; impact: number; exposure?: number };
export type Zone = "high" | "medium" | "low";

export const GRADES = 5;
export const gradeOf = (value: number) => Math.min(GRADES - 1, Math.max(0, Math.floor(value * GRADES)));   // 0..4; 1.0 is the top grade, not a sixth
export const zoneOf = (probabilityGrade: number, impactGrade: number): Zone => { const score = (probabilityGrade + 1) * (impactGrade + 1); return score >= 15 ? "high" : score >= 6 ? "medium" : "low"; };
export const ZONE_LABEL: Record<Zone, string> = { high: "紅區：先處理", medium: "黃區：盯著", low: "綠區：記著就好" };
const ZONE_FILL: Record<Zone, string> = { high: "var(--bad-bg)", medium: "color-mix(in srgb, var(--warn) 18%, var(--card))", low: "var(--good-bg)" };
const ZONE_STROKE: Record<Zone, string> = { high: "var(--bad)", medium: "var(--warn)", low: "var(--ok)" };
const BAND = ["0–0.2", "0.2–0.4", "0.4–0.6", "0.6–0.8", "0.8–1"];

export function risksOf(record: Record<string, unknown> | undefined): Risk[] {
  const risks = record?.risks;
  if (!Array.isArray(risks)) return [];
  const unit = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;   // false for NaN/Infinity too
  return risks.filter((r): r is Risk => !!r && typeof r === "object" && typeof (r as Risk).risk_id === "string" && typeof (r as Risk).description === "string"
    && unit((r as Risk).probability) && unit((r as Risk).impact) && ((r as Risk).exposure === undefined || unit((r as Risk).exposure)));
}

/** How many risks the record holds, usable or not -- the picture says when it drew fewer. */
export const riskCount = (record: Record<string, unknown> | undefined) => Array.isArray(record?.risks) ? record.risks.length : 0;

const LEFT = 110, TOP = 16, CELL_W = 188, CELL_H = 86, SIZE = 13;

export function RiskMatrix({ risks, total = risks.length }: { risks: Risk[]; total?: number }) {
  const cells = new Map<string, Risk[]>();
  for (const risk of risks) { const key = `${gradeOf(risk.probability)},${gradeOf(risk.impact)}`; cells.set(key, [...(cells.get(key) ?? []), risk]); }
  const width = LEFT + GRADES * CELL_W + 10, gridBottom = TOP + GRADES * CELL_H, height = gridBottom + 64;
  const ranked = [...risks].sort((a, b) => b.probability * b.impact - a.probability * a.impact);
  return <>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`風險矩陣：${risks.length} 個風險依機率與衝擊放進 5×5 格`}>
      {Array.from({ length: GRADES }, (_, p) => Array.from({ length: GRADES }, (_, i) => {
        const zone = zoneOf(p, i), x = LEFT + p * CELL_W, y = TOP + (GRADES - 1 - i) * CELL_H, inCell = cells.get(`${p},${i}`) ?? [];
        return <g key={`${p},${i}`} data-cell={`${p},${i}`} data-zone={zone}>
          <rect x={x} y={y} width={CELL_W} height={CELL_H} style={{ fill: ZONE_FILL[zone], stroke: ZONE_STROKE[zone] }} strokeWidth="1" />
          {inCell.length > 0 && <Wrap x={x + 8} y={y + 6} width={CELL_W - 16} height={CELL_H - 12} size={SIZE} bold>{inCell.map((risk) => risk.risk_id).join("、")}</Wrap>}
        </g>;
      }))}
      {BAND.map((band, g) => <React.Fragment key={band}>
        <text x={LEFT + g * CELL_W + CELL_W / 2} y={gridBottom + 20} fontSize="12" textAnchor="middle" className="m">{band}</text>
        <text x={LEFT - 10} y={TOP + (GRADES - 1 - g) * CELL_H + CELL_H / 2 + 4} fontSize="12" textAnchor="end" className="m">{band}</text>
      </React.Fragment>)}
      <text x={LEFT + (GRADES * CELL_W) / 2} y={gridBottom + 48} fontSize="14" fontWeight="700" textAnchor="middle">發生機率 →（越右越可能發生）</text>
      <text x="16" y={TOP + 14} fontSize="14" fontWeight="700">衝擊 ↑</text>
    </svg>
    {total > risks.length && <p className="mocknote" role="status">紀錄裡有 {total} 個風險，其中 {total - risks.length} 個的數字不完整（機率、衝擊要在 0 到 1 之間），沒有畫上去。</p>}
    <div className="legend"><span>每一格：機率等級 × 衝擊等級，紅區＝相乘 15 以上、黃區＝6 以上、綠區＝其餘</span><span>格子裡的編號：落在這一格的風險</span></div>
    <table data-visual="risk-list"><thead><tr><th>風險</th><th>機率</th><th>衝擊</th><th>曝險值（機率×衝擊）</th><th>落在</th></tr></thead>
      <tbody>{ranked.map((risk) => <tr key={risk.risk_id}><th>{risk.risk_id}｜{risk.description}</th><td>{risk.probability}</td><td>{risk.impact}</td><td>{Number((risk.exposure ?? risk.probability * risk.impact).toFixed(4))}</td><td>{ZONE_LABEL[zoneOf(gradeOf(risk.probability), gradeOf(risk.impact))]}</td></tr>)}</tbody>
    </table>
  </>;
}
