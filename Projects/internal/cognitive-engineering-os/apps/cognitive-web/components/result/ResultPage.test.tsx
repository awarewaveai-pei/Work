import { renderToStaticMarkup } from "react-dom/server";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../fixtures/iceberg-interpretation.json";
import record from "../../fixtures/payload-systems.iceberg_model.json";
import { apiFetch } from "../../lib/api";
import { ResultPage } from "./ResultPage";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

describe("ResultPage", () => {
  it("renders the locked result sections and the checker accepts actual HTML", () => {
    const html = renderToStaticMarkup(<ResultPage result={fixture} record={record} />);
    for (let index = 0; index < 9; index += 1) {
      expect(html).toContain(`data-section=\"${index}\"`);
    }
    expect(html).toContain('data-section="5b"');
    expect((html.match(/how-to/g) ?? []).length).toBe(10);
    expect(html).not.toContain("<select");
    expect(html).toContain('data-visual="layered"');
    expect(html).toContain("Release incidents increased");
    expect(html).toContain('data-source="r/events/0"');
    const artifact = path.resolve(process.cwd(), ".artifacts/iceberg-result.html");
    mkdirSync(path.dirname(artifact), { recursive: true });
    writeFileSync(artifact, html);
    const checker = path.resolve(process.cwd(), "../../docs/mockups/check-mocks.py");
    expect(execFileSync("python", [checker, "--page", "result", artifact], { encoding: "utf8" })).toContain("green");
    writeFileSync(artifact, html.replace(/<section[^>]*data-section="5b"[\s\S]*?<\/section>/, ""));
    const mutation = spawnSync("python", [checker, "--page", "result", artifact], { encoding: "utf8" });
    expect(mutation.status).toBe(1);
    expect(mutation.stdout).toContain("result-sections");
    writeFileSync(artifact, html);
  });
  it("shows three judgment labels and reports API failure", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("network down"));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ResultPage result={fixture} />); });
    const labels = [...host.querySelectorAll(".judgment-button")].map((button) => button.textContent);
    expect(labels).toEqual(["同意", "部分同意", "不同意"]);
    await act(async () => { (host.querySelector(".judgment-button") as HTMLButtonElement)?.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("network down");
    expect(apiFetch).toHaveBeenCalledWith(`/interpretations/${fixture.interpretation_id}/judgment`, expect.objectContaining({ body: JSON.stringify({ stance: "agree", text: "" }) }));
    await act(async () => { root.unmount(); });
    host.remove();
  });
  it("renders Eisenhower fixture as a quadrant", () => {
    const eisenhower = { ...fixture, method_id: "decision.eisenhower_matrix", visual: { kind: "quadrant", bindings: { items: "r/tasks", x: "r/tasks/0/urgency", y: "r/tasks/0/importance" } } };
    expect(renderToStaticMarkup(<ResultPage result={eisenhower} />)).toContain('data-visual="quadrant"');
  });
  it("shows prefilled next-step count and marks missing fields", () => {
    const next = { ...fixture, next_steps: [{ method_id: "systems.leverage_point_analysis", prefill: { events: "r/events" }, needs_input: ["objective"], yields: "Leverage points" }] };
    const html = renderToStaticMarkup(<ResultPage result={next} record={record} />);
    expect(html).toContain("已帶入 1 欄");
    expect(html).toContain("還要你填：objective");
    expect(html).toContain("Release incidents increased");
  });
  it("renders finding-level revision conditions from the typed contract", () => {
    const withCondition = { ...fixture, findings: [{ ...fixture.findings[0], revision_conditions: [{ text: "New evidence", would_change: "Confidence level" }] }] };
    const html = renderToStaticMarkup(<ResultPage result={withCondition} record={record} />);
    expect(html).toContain("改判條件：New evidence；Confidence level");
  });
});
