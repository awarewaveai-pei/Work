import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { IntakePage } from "./IntakePage";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects/new", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

describe("開一個新案子 (/projects/new, Codex review 2026-10-11 F1)", () => {
  it("creates nothing until 開案; then one project and its 開案資料, and a failed save reuses that project", async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = [];
    let intakeFails = true;
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = init?.method ?? "GET";
      calls.push({ path: String(path), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === "/projects" && method === "POST") return { project_id: "P1", name: "要不要續約", created_at: "2026-10-11T00:00:00Z" } as never;
      if (String(path).includes("/docs/assembler.intake") && method === "POST") {
        if (intakeFails) { intakeFails = false; throw new Error("network"); }
        return { doc_id: "D1", kind: "assembler.intake", content: {}, notices: [] } as never;
      }
      return [] as never;
    });
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<IntakePage question="要不要續約" />); });
    expect(host.querySelector("h1")?.textContent).toBe("開一個新案子");
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);   // opening the page writes nothing
    await act(async () => { ([...host.querySelectorAll("button.chip")][0] as HTMLButtonElement).click(); });
    const open = () => [...host.querySelectorAll("button")].find((item) => item.textContent === "開案") as HTMLButtonElement;
    await act(async () => { open().click(); });
    await act(async () => { open().click(); });
    expect(calls.filter((call) => call.path === "/projects" && call.method === "POST")).toHaveLength(1);
    expect((calls.find((call) => call.method === "POST")!.body as { purpose: string }).purpose).toBe("要不要續約");
    expect(calls.filter((call) => call.path === "/projects/P1/docs/assembler.intake" && call.method === "POST")).toHaveLength(2);
    expect(window.location.pathname).toBe("/projects/P1/start");
    await act(async () => { root.unmount(); }); host.remove();
  });
});
