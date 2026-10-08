import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { ExpressPage } from "./ExpressPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const P = "/projects/P";
const record = (kind: string, id: string, content: Record<string, unknown>) => ({ doc_id: id, kind, version: 1, content, author: "user" as const, block: kind.split(".")[0].toUpperCase(), at: "2026-10-08T00:00:00Z" });
const selected = record("sense.card", "S1", { text: "我看到團隊需要先說清楚。", confidence_text: "我有七成把握", uncertainty_text: "還沒問過另一方。" });
const claim = record("verify.claim", "C1", { text: "這是還沒查證的主張。" });
const draft = (sentences = [{ text: "AI 先整理了一句。", refs: [{ kind: "sense.card", doc_id: "S1" }], unchecked: true, author: "ai" as const }]) => record("express.draft", "D1", {
  format: "簡短說明", reader: "團隊", sentences, confidence_text: "我有七成把握", uncertainty_text: "還沒問過另一方。",
});

let currentSelection: any[] = [];
let currentDraft: any[] = [];
let writes: Array<{ path: string; method: string; body?: any }> = [];

function setup(config: { selection?: any[]; drafts?: any[] } = {}) {
  currentSelection = config.selection ?? [];
  currentDraft = config.drafts ?? [];
  writes = [];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ path, method, body });
    if (path === `${P}`) return { project_id: "P", name: "測試案子" } as never;
    if (path === `${P}/route`) return { purpose: null, package: null, blocks: [], done: [] } as never;
    if (path === `${P}/express/formats`) return { formats: [{ name: "簡短說明", sections: ["重點"], reader: "團隊" }] } as never;
    if (path === `${P}/express/selection` && method === "GET") return currentSelection as never;
    if (path === `${P}/express/selection` && method === "POST") {
      const saved = { ...record("express.selection", "SEL1", body.content), notices: [] };
      currentSelection = [saved];
      return saved as never;
    }
    if (path === `${P}/express/selection/SEL1` && method === "PUT") {
      const saved = { ...record("express.selection", "SEL1", body.content), version: 2, notices: [] };
      currentSelection = [saved];
      return saved as never;
    }
    if (path === `${P}/express/drafts` && method === "GET") return currentDraft as never;
    if (path === `${P}/express/drafts/D1` && method === "GET") return currentDraft[0] as never;
    if (path === `${P}/express/outline`) return { nodes: [{ refs: [{ kind: "sense.card", doc_id: "S1" }], record: { kind: "sense.card", title: "感受", content: { text: "我看到團隊需要先說清楚。" } } }] } as never;
    if (path.includes("/docs/") && method === "GET") {
      const kind = decodeURIComponent(path.split("/docs/")[1].split("/")[0]);
      return [selected, claim].filter((item) => item.kind === kind) as never;
    }
    if (path.includes("/docs/express.draft/D1") && method === "PUT") {
      const saved = { ...draft(body.content.sentences), version: 2, content: body.content };
      currentDraft = [saved];
      return saved as never;
    }
    if (path.endsWith("/ai/EXPRESS/draft_from_outline")) {
      const saved = { ...draft(), author: "ai", notices: [] };
      currentDraft = [saved];
      return { saved } as never;
    }
    if (path.endsWith("/ai/EXPRESS/adjust_for_reader")) return { saved: currentDraft[0] } as never;
    throw new Error(`unexpected ${method} ${path}`);
  });
}

async function openPage(config: { selection?: any[]; drafts?: any[] } = {}) {
  setup(config);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<ExpressPage projectId="P" />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  currentSelection = [];
  currentDraft = [];
});

describe("EXPRESS page", () => {
  it("renders unchecked and AI sentence marks, confidence, sources, and no dropdown", async () => {
    const selection = { ...record("express.selection", "SEL1", { items: [{ project_id: "P", kind: "sense.card", doc_id: "S1" }], format: "簡短說明", reader: "團隊" }), notices: [] };
    const { host, done } = await openPage({ selection: [selection], drafts: [draft()] });
    expect(host.textContent).toContain("還沒查證");
    expect(host.textContent).toContain("AI 撰寫");
    expect([...host.querySelectorAll(".judge .tags")].some((tags) => tags.textContent?.includes("還沒查證"))).toBe(true);
    expect(host.textContent).toContain("我有七成把握");
    expect(host.textContent).toContain("還沒問過另一方");
    expect(host.querySelector("select")).toBeNull();
    const source = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("來源：")) as HTMLButtonElement;
    await act(async () => { source.click(); });
    expect(host.textContent).toContain("我看到團隊需要先說清楚");
    await done();
  });

  it("requires a second confirmation click before sending an unchecked draft", async () => {
    const selection = { ...record("express.selection", "SEL1", { items: [{ project_id: "P", kind: "sense.card", doc_id: "S1" }], format: "簡短說明", reader: "團隊" }), notices: [] };
    const { host, done } = await openPage({ selection: [selection], drafts: [draft()] });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["draft"]) })));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const send = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "送出" || button.textContent === "我知道了，仍要送出") as HTMLButtonElement;
    await act(async () => { send().click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(host.textContent).toContain("我知道了，仍要送出");
    await act(async () => { send().click(); });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({ acknowledge_unchecked: true, version: 1 });
    await done();
  });

  it("posts only checked case records as express.selection", async () => {
    const { host, done } = await openPage();
    await act(async () => { (host.querySelector('[aria-label="給誰看"] .chip') as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('[aria-label="輸出格式"] .chip') as HTMLButtonElement).click(); });
    const checkbox = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((item) => item.parentElement?.textContent?.includes("感受"))!;
    await act(async () => { checkbox.click(); });
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "存下選擇")!.click(); });
    const save = writes.find((write) => write.path === `${P}/express/selection` && write.method === "POST");
    expect(save?.body.content.items).toEqual([{ project_id: "P", kind: "sense.card", doc_id: "S1" }]);
    await done();
  });
});
