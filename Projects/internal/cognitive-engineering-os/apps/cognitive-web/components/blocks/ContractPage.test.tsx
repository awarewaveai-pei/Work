import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import type { Doc } from "../../lib/blocks";
import { ContractPage } from "./ContractPage";
import { HIDE_PLACES_WORDS, type Terms } from "./CollabPermissions";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const contract = (content: Terms, version = 1, at = "2026-10-03T08:00:00Z"): Doc<Terms> => ({ doc_id: "C1", kind: "collab_contract.terms", version, content, author: "user", block: "COLLAB_CONTRACT", at });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text)) as HTMLButtonElement;

/** The case's contract versions (none = no contract yet); the shell's own calls get their usual empty answers. */
async function mount(versions: Doc<Terms>[]) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    if (init?.method === "POST" || init?.method === "PUT") return { ...contract(JSON.parse(init.body as string).content, versions.length + 1), notices: [] };
    if (path.endsWith("/route")) return { purpose: null, package: null, blocks: [], done: [] };
    if (path.endsWith("/proposals")) return [];
    if (path.endsWith("/versions")) return versions;
    if (path.endsWith("/docs/collab_contract.terms")) return versions.slice(-1);
    return { project_id: "P", name: "要不要接案" };
  }) as never);
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<ContractPage projectId="P" />); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const sent = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === "POST" || init?.method === "PUT").map(([path, init]) => [init!.method, path, JSON.parse(init!.body as string)]);

describe("協作合約 page", () => {
  it("offers the five grantable permissions as chips and the places as its own switch, never as a sixth permission", async () => {
    const { host, done } = await mount([]);
    const chips = [...host.querySelectorAll("[aria-label='AI 的權限'] .chip")].map((chip) => chip.textContent);
    expect(chips).toEqual(["沒准：找外部資料（只引用有來源卡的）", "沒准：提出選項", "沒准：排序（只是參考）", "沒准：當反方", "沒准：給直接建議"]);
    expect(button(host, HIDE_PLACES_WORDS).getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("holding the places back is a change you can save: a first contract, then a new version that keeps what was granted", async () => {
    const first = await mount([]);
    expect(button(first.host, "存下來").disabled).toBe(true);   // nothing changed yet
    await act(async () => { button(first.host, HIDE_PLACES_WORDS).click(); });
    await act(async () => { button(first.host, "存下來").click(); });
    expect(sent()).toEqual([["POST", "/projects/P/docs/collab_contract.terms", { content: { hide_places: true } }]]);
    await first.done();

    const later = await mount([contract({ permissions: ["counter"] })]);
    await act(async () => { button(later.host, HIDE_PLACES_WORDS).click(); });
    await act(async () => { button(later.host, "存成新的一版").click(); });
    expect(sent()).toEqual([["POST", "/projects/P/docs/collab_contract.terms", { content: { hide_places: true } }], ["PUT", "/projects/P/docs/collab_contract.terms/C1", { content: { permissions: ["counter"], hide_places: true }, base_version: 1 }]]);
    await later.done();
  });

  it("lists every version with what it changed, the places switch included", async () => {
    const { host, done } = await mount([contract({ permissions: ["counter"] }), contract({ permissions: ["counter"], hide_places: true }, 2, "2026-10-03T09:00:00Z")]);
    const lines = [...host.querySelectorAll("li")].map((item) => item.textContent ?? "");
    expect(lines[0]).toContain("第 2 版");
    expect(lines[0]).toContain(`選了「${HIDE_PLACES_WORDS}」`);
    expect(lines[1]).toContain("准了「當反方」");
    await done();
  });
});
