import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api";
import { RunPage } from "./RunPage";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

describe("run page", () => {
  it("creates one project when none exists and never asks for a Project ID", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/methods/systems.iceberg_model/form") return { display: { name_zh: "冰山模型" }, form: { fields: [] } } as never;
      if (path === "/projects" && init?.method === "POST") return { project_id: "P1", name: "冰山模型 2026-09-25" } as never;
      if (path === "/projects") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<RunPage methodId="systems.iceberg_model" lesson={null} />); });
    expect(host.textContent).toContain("冰山模型");
    expect(host.textContent).not.toContain("Project ID");
    expect(vi.mocked(apiFetch).mock.calls.filter(([path, init]) => path === "/projects" && init?.method === "POST")).toHaveLength(1);
    const created = vi.mocked(apiFetch).mock.calls.find(([path, init]) => path === "/projects" && init?.method === "POST");
    expect(JSON.parse(String(created?.[1]?.body)).name).toMatch(/^冰山模型 /);
    expect(host.querySelector(".top a.howto")?.getAttribute("href")).toBe("/methods/systems.iceberg_model");   // no lesson: the tool page
    await act(async () => { root.unmount(); }); host.remove();
  });

  it("a tool with a lesson: the header and the reading line open it in a new tab (mock run page header)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/methods/systems.iceberg_model/form") return { display: { name_zh: "冰山模型", name_en: "Iceberg Model" }, form: { fields: [] } } as never;
      if (path === "/projects") return [{ project_id: "P1", name: "團體反思" }] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<RunPage methodId="systems.iceberg_model" lesson="/learn/systems.iceberg_model" />); });
    const howto = host.querySelector(".top a.howto")!;
    expect([howto.getAttribute("href"), howto.getAttribute("target"), howto.textContent]).toEqual(["/learn/systems.iceberg_model", "_blank", "怎麼用？先上 5 分鐘的課 ↗"]);
    expect(host.querySelector('.how a[href="/learn/systems.iceberg_model#panel-read"]')?.getAttribute("target")).toBe("_blank");
    expect(host.querySelector(".crumbs")?.textContent).toBe("我的專案 › 冰山模型分析");
    expect(host.querySelector(".sub")?.textContent).toBe("工具：冰山模型 Iceberg Model");
    await act(async () => { root.unmount(); }); host.remove();
  });
});
