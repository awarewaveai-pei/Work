// Test helpers for the DECIDE, ACT and LEARN page tests: mount a page, type and click like a person, and answer the API from a table.
// A test file mocks ../../lib/api itself (vi.mock is hoisted per file) and calls serve() with its routes.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import type { Doc } from "../../lib/blocks";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export async function mount(element: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

/** The React-controlled way to type: the native setter, then the event React listens for. */
export async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
export const click = async (element: Element | null | undefined) => {
  if (!element) throw new Error("nothing to click");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
export const byText = (host: Element, tag: string, text: string): HTMLElement | undefined => [...host.querySelectorAll<HTMLElement>(tag)].find((element) => element.textContent?.trim() === text);
export const field = (host: Element, id: string) => host.querySelector<HTMLInputElement & HTMLTextAreaElement>(`#${id}`)!;
export const labelled = (host: Element, label: string) => host.querySelector<HTMLInputElement & HTMLTextAreaElement>(`[aria-label="${label}"]`)!;

export type Call = { path: string; method: string; body?: any };
type Answer = unknown | ((call: Call) => unknown);

/** Answer apiFetch from ``routes`` ("GET /path" or "/path"); an unlisted document list is empty, anything else unlisted is a 404. Returns every call made. */
export function serve(routes: Record<string, Answer>): Call[] {
  const calls: Call[] = [];
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    const call: Call = { path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined };
    calls.push(call);
    const bare = path.split("?")[0];
    const hit = routes[`${call.method} ${bare}`] ?? routes[bare];
    if (hit !== undefined) return typeof hit === "function" ? (hit as (call: Call) => unknown)(call) : hit;
    if (call.method === "GET" && bare.includes("/docs/")) return [];
    throw new ApiError(404, "DOC_KIND_UNKNOWN: not served in this test");
  }) as typeof apiFetch);
  return calls;
}

export const doc = <C,>(kind: string, doc_id: string, content: C, over: Partial<Doc<C>> = {}): Doc<C> => ({
  doc_id, kind, version: 1, content, author: "user", block: "X", at: "2026-10-03T08:00:00Z", created_at: "2026-10-03T08:00:00Z", ...over,
});
export const saved = <C,>(kind: string, doc_id: string, content: C, notices: unknown[] = []) => ({ ...doc(kind, doc_id, content), notices });

export const shell = (projectId = "P1") => ({
  [`/projects/${projectId}`]: { project_id: projectId, name: "合夥案", created_at: "2026-10-01T08:00:00Z" },
  [`/projects/${projectId}/proposals`]: [],
  [`/projects/${projectId}/evidence`]: { origins: [], changed_marks: [], claims: [], calcs: [], min_origins: 2 },
});
