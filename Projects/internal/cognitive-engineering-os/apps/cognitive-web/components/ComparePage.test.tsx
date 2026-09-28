import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api";
import { ComparePage } from "./ComparePage";

vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

const analysis = (id: string, overrides: Record<string, unknown> = {}) => ({
  interpretation_id: id, project_id: "P1", method_id: "systems.iceberg_model", status: "DONE", created_at: "2026-09-26T10:00:00Z",
  result: { headline: `headline ${id}`, summary: `summary ${id}`, findings: [], solutions: {} }, ...overrides,
});

describe("ComparePage", () => {
  it("has no approve/reselect buttons before N-67 -- both now exist and post to the new analysis (b)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/interpretations/B/approval" && init?.method === "POST") return { decision: "approve", at: "2026-09-26T12:00:00Z", by_name: "A" } as never;
      if (path === "/interpretations/A") return analysis("A") as never;
      if (path === "/interpretations/B") return analysis("B") as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ComparePage projectId="P1" a="A" b="B" />);
    const approveButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "核准新的一次");
    expect(approveButton).toBeTruthy();
    expect(host.querySelector('a[href="/projects/P1/analyses/B#solution"]')?.textContent).toBe("回到 ⑦ 重選方案 →");
    await act(async () => { approveButton!.click(); await Promise.resolve(); });
    const posted = vi.mocked(apiFetch).mock.calls.find(([path, init]) => path === "/interpretations/B/approval" && init?.method === "POST");
    expect(posted).toBeTruthy();
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({ decision: "approve" });
    expect(host.textContent).toContain("已核准");
    await finish();
  });

  it("aligns metrics by name across both sides instead of two independent lists (N-67)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/interpretations/A") return analysis("A", { result: { findings: [], solutions: { metrics: [{ name: "主動分享人數", now: "2 人", target: "6 人" }] } } }) as never;
      if (path === "/interpretations/B") return analysis("B", { result: { findings: [], solutions: { metrics: [{ name: "主動分享人數", now: "4 人", target: "6 人" }, { name: "逾期任務數", now: "3", target: "0" }] } } }) as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ComparePage projectId="P1" a="A" b="B" />);
    const rows = [...host.querySelectorAll("tbody tr")];
    const shared = rows.find((row) => row.querySelector("th")?.textContent === "指標：主動分享人數")!;
    expect([...shared.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual(["2 人 → 6 人", "4 人 → 6 人"]);
    const onlyOnB = rows.find((row) => row.querySelector("th")?.textContent === "指標：逾期任務數")!;
    expect([...onlyOnB.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual(["—", "3 → 0"]);   // A never had this metric
    await finish();
  });
});
