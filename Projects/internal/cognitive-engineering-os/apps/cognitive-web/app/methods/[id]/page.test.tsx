import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../../lib/api";
import MethodPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "systems.iceberg_model" }) }));
vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

describe("first-use method page", () => {
  it("creates one project when none exists and never asks for a Project ID", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/methods/systems.iceberg_model/form") return { display: { name_zh: "冰山模型" }, form: { fields: [] } } as never;
      if (path === "/projects" && init?.method === "POST") return { project_id: "P1", name: "冰山模型 2026-09-25" } as never;
      if (path === "/projects") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<MethodPage />); });
    expect(host.textContent).toContain("冰山模型");
    expect(host.textContent).not.toContain("Project ID");
    expect(vi.mocked(apiFetch).mock.calls.filter(([path, init]) => path === "/projects" && init?.method === "POST")).toHaveLength(1);
    const created = vi.mocked(apiFetch).mock.calls.find(([path, init]) => path === "/projects" && init?.method === "POST");
    expect(JSON.parse(String(created?.[1]?.body)).name).toMatch(/^冰山模型 /);
    await act(async () => { root.unmount(); }); host.remove();
  });
});
