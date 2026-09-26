import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrendChart, loopLayout } from "./Charts";

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
});

describe("trend chart scale", () => {
  it("keeps every point inside the plot, negative values included (Codex ecbc5d71 F3)", () => {
    for (const values of [[6, 2], [-5, -2], [-3, 4], [0, 0]]) {
      const html = renderToStaticMarkup(<TrendChart series={[{ name: "x", unit: "u", points: values.map((value, index) => ({ label: `p${index}`, value, citation: "r/x/0" })) }]} cite={() => ""} />);
      const ys = (html.match(/points="([^"]+)"/)?.[1] ?? "").split(" ").map((pair) => Number(pair.split(",")[1]));
      expect(ys.length, String(values)).toBe(2);
      for (const y of ys) expect(y >= 30 && y <= 180, `${values}: y=${y}`).toBe(true);
    }
  });
});
