import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../fixtures/iceberg-interpretation.json";
import { apiFetch } from "../../lib/api";
import { ResultPage } from "./ResultPage";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

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
  it("shows three judgment labels and reports API failure", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("network down"));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ResultPage result={fixture} />); });
    const labels = [...host.querySelectorAll("button")].map((button) => button.textContent);
    expect(labels).toEqual(["同意", "部分同意", "不同意"]);
    await act(async () => { host.querySelector("button")?.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("network down");
    expect(apiFetch).toHaveBeenCalledWith(`/interpretations/${fixture.interpretation_id}/judgment`, expect.objectContaining({ body: JSON.stringify({ stance: "agree", text: "" }) }));
    await act(async () => { root.unmount(); });
    host.remove();
  });
});
