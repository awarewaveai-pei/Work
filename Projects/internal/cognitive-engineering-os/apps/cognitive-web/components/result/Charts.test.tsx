import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoopChart, TrendChart } from "./Charts";
import { lineHeight } from "./svgtext";

describe("loop chart layout", () => {
  const loopOf = (n: number, text = (i: number) => `節點 ${i}`) => ({
    kind: "reinforcing" as const, name: "等答案迴路", reading: "越轉越強",
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, text: text(i), citations: [] })),
    edges: Array.from({ length: n }, (_, i) => ({ from: `n${i}`, to: `n${(i + 1) % n}` })),
  });
  const boxes = (html: string) => [...html.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="8"/g)].map((m) => m.slice(1, 5).map(Number));
  const viewBox = (html: string) => (html.match(/viewBox="0 0 ([^ ]+) ([^"]+)"/) ?? []).slice(1).map(Number);

  it("the rendered loop (P-17): for 2 to 6 nodes, long texts too, no box overlaps another or the centre title, all inside the picture", () => {
    for (let n = 2; n <= 6; n += 1) {
      for (const text of [(i: number) => `節點 ${i}`, (i: number) => `帶領者先講作品的意義，參與者等答案 ${i}`]) {
        const html = renderToStaticMarkup(<LoopChart loop={loopOf(n, text)} />);
        const [w, h] = viewBox(html);
        const rects = boxes(html);
        expect(rects.length).toBe(n);
        const titleBox = html.slice(html.lastIndexOf("<foreignObject", html.indexOf("R 等答案迴路")), html.indexOf("R 等答案迴路"));
        const [tx, ty, tw] = ["x", "y", "width"].map((k) => Number(titleBox.match(new RegExp(` ${k}="([^"]+)"`))?.[1]));
        for (const [x, y, bw, bh] of rects) {
          expect(x >= 0 && y >= 0 && x + bw <= w && y + bh <= h, `n=${n} box inside`).toBe(true);
          expect(x + bw <= tx || x >= tx + tw || y + bh <= ty || y >= ty + 22, `n=${n} box clear of the title`).toBe(true);
        }
        for (let a = 0; a < rects.length; a += 1) for (let b = a + 1; b < rects.length; b += 1) {
          const [ax, ay, aw, ah] = rects[a], [bx, by, bw, bh] = rects[b];
          expect(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `n=${n} boxes ${a},${b} apart`).toBe(true);
        }
      }
    }
  });

  it("after mount a box is as tall as the browser wraps its text, not the estimate (P-16)", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {   // the probe reports five wrapped lines
      return this.getAttribute("aria-hidden") === "true" && this.parentElement === document.body ? ({ height: 5 * lineHeight(12.5) } as DOMRect) : original.call(this);
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<LoopChart loop={loopOf(4)} />); });
      const heights = [...host.querySelectorAll("rect[rx='8']")].map((rect) => Number(rect.getAttribute("height")));
      expect(heights).toEqual(Array(4).fill(14 + 5 * lineHeight(12.5)));   // the estimate for 「節點 0」 is one line (44)
    } finally {
      await act(async () => { root.unmount(); });
      HTMLElement.prototype.getBoundingClientRect = original;
      host.remove();
    }
  });

  it("the four-node loop is the mock's (C3-17): 460x250-ish, 150x44 boxes clockwise from the top-left in arrow order", () => {
    const loop = loopOf(4);
    loop.nodes = [loop.nodes[0], loop.nodes[2], loop.nodes[1], loop.nodes[3]];   // listed out of order: placed by the arrows
    const html = renderToStaticMarkup(<LoopChart loop={loop} />);
    expect(viewBox(html)[0]).toBe(460);
    expect(boxes(html).map(([x, y, w, h]) => [Math.round(x), Math.round(y), w, h])).toEqual([[20, 30, 150, 44], [290, 150, 150, 44], [290, 30, 150, 44], [20, 150, 150, 44]]);
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
