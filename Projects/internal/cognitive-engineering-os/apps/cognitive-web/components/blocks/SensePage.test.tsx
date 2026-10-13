import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { SensePage } from "./SensePage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.resetAllMocks(); });

// The list answers each record with its keys in the database's order (PostgreSQL jsonb: shorter keys first), not the save's.
const reordered = (content: Record<string, unknown>) => Object.fromEntries(Object.entries(content).sort(([a], [b]) => a.length - b.length || a.localeCompare(b)).reverse());
function server() {
  const store: Record<string, any[]> = {};
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (/^\/projects\/[^/]+$/.test(path)) return { project_id: "P1", name: "分潤", created_at: "x" } as never;
    const one = /\/docs\/([^/]+)(?:\/([^/]+))?$/.exec(path);
    if (one && method === "GET") return (store[one[1]] ?? []).map((doc) => ({ ...doc, content: reordered(doc.content) })) as never;
    if (one && method !== "GET") {
      const doc = { doc_id: one[2] ?? `${one[1]}-1`, kind: one[1], version: (store[one[1]]?.[0]?.version ?? 0) + 1, content: body.content, author: "user", block: "SENSE", at: "x" };
      store[one[1]] = [doc];
      return { ...doc, notices: [] } as never;
    }
    return [] as never;
  });
}

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const byText = (host: HTMLElement, selector: string, text: string) => [...host.querySelectorAll(selector)].find((node) => node.textContent?.trim() === text) as HTMLElement;
function type(element: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("外化：現在最強的情緒", () => {
  it("says 已存 once the emotion is saved, and that a change is not saved until it is", async () => {
    server();
    const { host, done } = await mount(<SensePage projectId="P1" />);
    const card = byText(host, "h2", "現在最強的情緒").closest(".card") as HTMLElement;
    expect(card.textContent).not.toContain("已存");
    await act(async () => { type(host.querySelector<HTMLInputElement>("#state-emotion")!, "委屈"); });
    await act(async () => { byText(card, "button", "中").click(); });
    await act(async () => { card.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await act(async () => { byText(card, "button", "存").click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(card.querySelector('[role="status"]')?.textContent).toBe("已存");
    await act(async () => { type(host.querySelector<HTMLInputElement>("#state-emotion")!, "生氣"); });
    expect(card.textContent).toContain("有還沒存的改動");
    expect(card.textContent).not.toContain("已存");
    await done();
  });
});
