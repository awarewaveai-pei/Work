import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { ResultChoices } from "./ResultChoices";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(isCase: boolean, onErase = vi.fn()) {
  vi.mocked(apiFetch).mockResolvedValue({ project_id: "P1", name: "冰山模型", created_at: "2026-10-11T00:00:00Z", is_case: isCase } as never);
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<ResultChoices projectId="P1" onErase={onErase} />); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

describe("a 直接分析 result's three choices (ENTRY_SLICE1_CHECKLIST.md items 9-10)", () => {
  it("before its project is a case: open a case with it, keep it, or erase it for good", async () => {
    const onErase = vi.fn();
    const { host, done } = await mount(false, onErase);
    const links = [...host.querySelectorAll("#choices a")].map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([["用這份結果開案 →", "/projects/P1/start"], ["留在我的分析", "/projects#analyses"]]);
    expect(host.textContent).toContain("AI 做的");
    await act(async () => { (host.querySelector("#choices button") as HTMLButtonElement).click(); });
    expect(onErase).toHaveBeenCalledOnce();
    await done();
  });

  it("once its project is a case, nothing to choose", async () => {
    const { host, done } = await mount(true);
    expect(host.querySelector("#choices")).toBeNull();
    await done();
  });
});
