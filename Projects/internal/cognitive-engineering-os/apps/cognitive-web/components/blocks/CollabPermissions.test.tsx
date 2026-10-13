import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import type { Doc } from "../../lib/blocks";
import { CaseContract, GRANTABLE_WORDS, HIDE_PLACES_WORDS, PlacesToggle, describeChange, type Terms } from "./CollabPermissions";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const doc = (content: Terms, version = 1): Doc<Terms> => ({ doc_id: "C1", kind: "collab_contract.terms", version, content, author: "user", block: "COLLAB_CONTRACT", at: "2026-10-03T08:00:00Z" });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text)) as HTMLButtonElement;

describe("協作合約: each change is a version you can read", () => {
  it("names what a version granted, took back, wrote and changed", () => {
    expect(describeChange(null, { permissions: ["counter"], scope: "比較" })).toEqual(["准了「當反方」", "寫了「這次做什麼、決定到哪裡」"]);
    expect(describeChange({ permissions: ["counter", "rank"], handback: "累了就停" }, { permissions: ["counter"], handback: "累了就找人" })).toEqual(["收回「排序（只是參考）」", "改了「交還控制的條件」"]);
    expect(describeChange({ permissions: ["counter"] }, { permissions: ["counter"] })).toEqual([]);
  });

  it("names the switch that holds the places back, and says nothing while it stays as it was", () => {
    expect(describeChange(null, { hide_places: true })).toEqual([`選了「${HIDE_PLACES_WORDS}」`]);
    expect(describeChange({ hide_places: true }, {})).toEqual([`不再選「${HIDE_PLACES_WORDS}」`]);
    expect(describeChange({ hide_places: true }, { hide_places: true, handback: "累了就停" })).toEqual(["寫了「交還控制的條件」"]);
    expect(describeChange(null, { hide_places: false })).toEqual([]);
  });

  it("holding the places back is not a permission you grant: no chip for it among the six that were", () => {
    expect(Object.keys(GRANTABLE_WORDS)).not.toContain("use_location");
    expect(Object.keys(GRANTABLE_WORDS)).toHaveLength(5);
  });
});

describe("PlacesToggle", () => {
  it("is one visible button that says where it stands and flips on a press", async () => {
    const calls: boolean[] = [];
    const off = await mount(<PlacesToggle value={false} onChange={(next) => calls.push(next)} />);
    const toggle = off.host.querySelector("button") as HTMLButtonElement;
    expect([toggle.getAttribute("aria-pressed"), toggle.textContent]).toEqual(["false", `沒選：${HIDE_PLACES_WORDS}`]);
    await act(async () => { toggle.click(); });
    expect(calls).toEqual([true]);
    expect(off.host.querySelector("select")).toBeNull();
    await off.done();
    const on = await mount(<PlacesToggle value={true} onChange={(next) => calls.push(next)} />);
    expect((on.host.querySelector("button") as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { (on.host.querySelector("button") as HTMLButtonElement).click(); });
    expect(calls).toEqual([true, false]);
    await on.done();
  });
});

describe("CollabPermissions", () => {
  it("shows what the AI may do in one line, and says so when nothing extra was granted", async () => {
    vi.mocked(apiFetch).mockResolvedValue([doc({ permissions: ["counter", "propose_options"] })] as never);
    const first = await mount(<CaseContract projectId="P" block="SENSE" />);
    expect(first.host.textContent).toContain("AI 現在能做：整理、提問、指出還缺什麼；你另外准了：提出選項、當反方");   // in the card's order, not the order they were granted
    expect(first.host.querySelector("a")?.getAttribute("href")).toBe("/projects/P/contract");
    await first.done();
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    const none = await mount(<CaseContract projectId="P" block="SENSE" />);
    expect(none.host.textContent).toContain("其他的你還沒准");
    expect(none.host.textContent).not.toContain("不讓它知道發生地");
    await none.done();
    vi.mocked(apiFetch).mockResolvedValue([doc({ permissions: ["counter"], hide_places: true })] as never);
    const hidden = await mount(<CaseContract projectId="P" block="SENSE" />);
    expect(hidden.host.textContent).toContain("你不讓它知道發生地和你在哪裡。");
    await hidden.done();
  });
});

describe("AskBeforeBlock", () => {
  it("asks once per block for a case, then stays out of the way", async () => {
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    const first = await mount(<CaseContract projectId="ASK-1" block="THINK" />);
    expect(first.host.textContent).toContain("進「共思考」之前，要改 AI 能做什麼嗎？");
    expect([...first.host.querySelectorAll(".chip")].map((chip) => chip.textContent)).toEqual(["沒准：提出選項", "沒准：當反方", "沒准：給直接建議"]);   // only what THINK's turns ask for
    await act(async () => { button(first.host, "不改，繼續").click(); });
    expect(first.host.querySelector("[role=region]")).toBeNull();
    await first.done();
    const again = await mount(<CaseContract projectId="ASK-1" block="THINK" />);
    expect(again.host.querySelector("[role=region]")).toBeNull();
    await again.done();
    const other = await mount(<CaseContract projectId="ASK-1" block="DECIDE" />);
    expect(other.host.textContent).toContain("進「判斷」之前");
    await other.done();
  });

  it("saves a changed permission as the contract's next version, then continues; the line says so at once", async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === "POST" ? { ...doc({ permissions: ["counter"] }), notices: [] } : []) as never);
    const { host, done } = await mount(<CaseContract projectId="ASK-2" block="THINK" />);
    await act(async () => { button(host, "當反方").click(); });
    await act(async () => { button(host, "存下來，繼續").click(); });
    const post = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/projects/ASK-2/docs/collab_contract.terms");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ content: { permissions: ["counter"] } });
    expect(host.querySelector("[role=region]")).toBeNull();
    expect(host.textContent).toContain("你另外准了：當反方");   // 2026-10-13: the line kept 「其他的你還沒准」 until a reload
    await done();
  });
});
