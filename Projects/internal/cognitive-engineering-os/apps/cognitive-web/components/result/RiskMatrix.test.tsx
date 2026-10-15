import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MethodVisual, recordPicture } from "./MethodVisual";
import { gradeOf, risksOf, zoneOf } from "./RiskMatrix";

const record = { risks: [
  { risk_id: "R1", description: "主要供應商斷貨", probability: 0.9, impact: 0.95, exposure: 0.855, owner: "採購", control: "第二供應商", trigger: "交期延誤 > 2 週" },
  { risk_id: "R2", description: "新人訓練不足", probability: 0.5, impact: 0.3, exposure: 0.15, owner: "HR", control: "師徒制", trigger: "錯誤率上升" },
  { risk_id: "R3", description: "機房停電", probability: 0.05, impact: 0.1, exposure: 0.005, owner: "IT", control: "UPS", trigger: "停電" },
] };

describe("risk matrix (delivery.risk_register)", () => {
  it("grades a value into 5 bands; 1.0 is the top band, not a sixth", () => {
    expect([0, 0.19, 0.2, 0.59, 0.8, 1].map(gradeOf)).toEqual([0, 0, 1, 2, 4, 4]);
  });

  it("zones by grade product: 15+ red, 6+ yellow, else green", () => {
    expect(zoneOf(4, 4)).toBe("high");
    expect(zoneOf(2, 4)).toBe("high");     // 3 × 5 = 15
    expect(zoneOf(1, 2)).toBe("medium");   // 2 × 3 = 6
    expect(zoneOf(0, 4)).toBe("low");      // 1 × 5 = 5
  });

  it("puts each risk in the cell its own numbers place it, and lists the riskiest first", () => {
    const html = renderToStaticMarkup(<MethodVisual kind="table" bindings={{}} methodId="delivery.risk_register" record={record} />);
    expect(html).toContain('data-visual="risk-matrix"');
    expect((html.match(/data-cell=/g) ?? []).length).toBe(25);
    const cell = (p: number, i: number) => html.slice(html.indexOf(`data-cell="${p},${i}"`), html.indexOf("</g>", html.indexOf(`data-cell="${p},${i}"`)));
    expect(cell(4, 4)).toContain("R1");
    expect(cell(4, 4)).toContain('data-zone="high"');
    expect(cell(2, 1)).toContain("R2");
    expect(cell(0, 0)).toContain("R3");
    expect(cell(0, 0)).toContain('data-zone="low"');
    const list = html.slice(html.indexOf('data-visual="risk-list"'));
    expect(list.indexOf("R1｜")).toBeLessThan(list.indexOf("R2｜"));
    expect(list.indexOf("R2｜")).toBeLessThan(list.indexOf("R3｜"));
    expect(list).toContain("紅區：先處理");
  });

  it("is only drawn for the risk register, and only from usable numbers", () => {
    expect(renderToStaticMarkup(<MethodVisual kind="table" bindings={{ a: "r/x" }} methodId="decision.eisenhower_matrix" record={record} />)).not.toContain("risk-matrix");
    expect(renderToStaticMarkup(<MethodVisual kind="table" bindings={{ a: "r/x" }} methodId="delivery.risk_register" record={{}} />)).toContain('data-visual="table"');
    expect(risksOf({ risks: [{ risk_id: "X", description: "", probability: 1.5, impact: 0.2 }, { risk_id: "Y", description: "", probability: "0.3", impact: 0.2 },
      { risk_id: "Z", description: {}, probability: 0.3, impact: 0.2 }, { risk_id: "W", description: "", probability: 0.3, impact: 0.2, exposure: "0.06" }] })).toEqual([]);
    expect(recordPicture("delivery.risk_register", {})).toBeUndefined();
    expect(recordPicture("delivery.risk_register", record)?.caption).toContain("機率×衝擊");
  });

  it("says how many risks it could not draw instead of dropping them silently", () => {
    const html = renderToStaticMarkup(<MethodVisual kind="table" bindings={{}} methodId="delivery.risk_register" record={{ risks: [...record.risks, { risk_id: "R9", description: "壞資料", probability: 2, impact: 0.5 }] }} />);
    expect(html).toContain("紀錄裡有 4 個風險，其中 1 個");
  });
});
