import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoopChart, TrendChart, loopLayout } from "./Charts";

describe("loop chart layout", () => {
  it("no box (150x44) reaches the centre title band for 2 to 6 nodes, and all stay inside the 460x250 picture", () => {
    const band = { x0: 230 - 60, x1: 230 + 60, y0: 104, y1: 146 };   // "R" + an 8-character name at 14px, and the short line under it
    for (let n = 2; n <= 6; n += 1) {
      for (const { cx, cy } of loopLayout(n)) {
        const box = { x0: cx - 75, x1: cx + 75, y0: cy - 22, y1: cy + 22 };
        const overlaps = box.x0 < band.x1 && box.x1 > band.x0 && box.y0 < band.y1 && box.y1 > band.y0;
        expect(overlaps, `n=${n} box at ${Math.round(cx)},${Math.round(cy)}`).toBe(false);
        expect(box.x0 >= 0 && box.x1 <= 460 && box.y0 >= 0 && box.y1 <= 250, `n=${n} inside`).toBe(true);
      }
    }
  });

  it("keeps the four-node loop title on one line by deriving its width from the rendered node centres", () => {
    const html = renderToStaticMarkup(<LoopChart loop={{
      kind: "reinforcing", name: "專家等答案迴路", reading: "越轉越強",
      nodes: ["a", "b", "c", "d"].map((id) => ({ id, text: `節點 ${id}`, citations: [] })),
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "a" }],
    }} />);
    const title = "R 專家等答案迴路（自我加強）";
    const beforeTitle = html.slice(0, html.indexOf(title));
    const titleBox = beforeTitle.slice(beforeTitle.lastIndexOf("<foreignObject"));
    expect(Number(titleBox.match(/width="([^"]+)"/)?.[1])).toBeGreaterThan(190);
    expect(titleBox).toContain('height="24"');
  });
});

describe("trend chart scale", () => {
  it("keeps every point inside the plot, negative values included (Codex ecbc5d71 F3)", () => {
    for (const values of [[6, 2], [-5, -2], [-3, 4], [0, 0]]) {
      const html = renderToStaticMarkup(<TrendChart series={[{ name: "x", unit: "u", points: values.map((value, index) => ({ label: `p${index}`, value, citation: "r/x/0" })) }]} cite={() => ""} />);
      const ys = (html.match(/points="([^"]+)"/)?.[1] ?? "").split(" ").map((pair) => Number(pair.split(",")[1]));
      expect(ys.length, String(values)).toBe(2);
      for (const y of ys) expect(y >= 20 && y <= 180, `${values}: y=${y}`).toBe(true);
    }
  });

  it("maps the axis maximum to the top grid coordinate", () => {
    const html = renderToStaticMarkup(<TrendChart series={[{ name: "x", unit: "人", points: [{ label: "前", value: 8, citation: "r/x/0" }, { label: "後", value: 0, citation: "r/x/1" }] }]} cite={() => ""} />);
    expect(html.match(/points="([^"]+)"/)?.[1].split(" ")[0].split(",")[1]).toBe("20");
  });

  it("expands the SVG view box enough for the widest right-axis tick label", () => {
    const html = renderToStaticMarkup(<TrendChart series={[
      { name: "人數", unit: "人", points: [{ label: "前", value: 8, citation: "r/x/0" }, { label: "後", value: 2, citation: "r/x/1" }] },
      { name: "時間", unit: "分鐘", points: [{ label: "前", value: 5, citation: "r/y/0" }, { label: "後", value: 2, citation: "r/y/1" }] },
    ]} cite={() => ""} />);
    const viewWidth = Number(html.match(/viewBox="0 0 ([^ ]+)/)?.[1]);
    expect(viewWidth).toBeGreaterThanOrEqual(467);
  });
});
