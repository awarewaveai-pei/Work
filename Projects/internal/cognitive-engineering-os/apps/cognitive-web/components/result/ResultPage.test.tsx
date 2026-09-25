import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/iceberg-interpretation.json";
import { ResultPage } from "./ResultPage";

describe("ResultPage", () => {
  it("renders the nine locked result sections and no select control", () => {
    const html = renderToStaticMarkup(<ResultPage result={fixture} />);
    for (let index = 0; index < 9; index += 1) {
      expect(html).toContain(`data-section=\"${index}\"`);
    }
    expect((html.match(/class=\"how-to\"/g) ?? []).length).toBe(9);
    expect(html).not.toContain("<select");
    expect(html).toContain('data-visual="layered"');
  });
});
