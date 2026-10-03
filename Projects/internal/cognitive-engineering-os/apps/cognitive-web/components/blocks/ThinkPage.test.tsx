import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import type { Author, Doc } from "../../lib/blocks";
import { PHASES, ThinkPage, hasOwn, ownItem, phaseAt, pickHistory, splitOwn, thinkError, unchangedStreak, type Card, type PickHistory } from "./ThinkPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent === text) as HTMLButtonElement;
const doc = <C,>(kind: string, doc_id: string, content: C, author: Author = "user", version = 1, at = "2026-10-03T08:00:00Z"): Doc<C> => ({ doc_id, kind, version, content, author, block: "THINK", at });

/** The case's documents by kind; anything else the shell asks for is an empty answer. */
function serve(held: Record<string, unknown[]>) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    if (path === "/projects/P") return { project_id: "P", name: "要不要接案" };
    const match = /^\/projects\/P\/docs\/([^/]+)$/.exec(path);
    if (match && !init) return held[match[1]] ?? [];
    return [];
  }) as never);
}

describe("the 25-minute round", () => {
  it("falls in the specs seven phases and stays in the last one after the time is up", () => {
    const minute = (value: number) => phaseAt(value * 60);
    expect([0, 2.99, 3, 5.99, 6, 10.99, 11, 14.99, 15, 19.99, 20, 22.99, 23, 24.99, 25, 90].map(minute)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6]);
    expect(phaseAt(-5)).toBe(0);
    expect(PHASES.map((phase) => phase.name)).toEqual(["先有自己的版本", "鏡像", "發散", "挑戰", "建立判準", "人做選擇", "回看自己怎麼想"]);
  });
});

describe("your own version", () => {
  it("counts an item only when something follows its label, as the engine does", () => {
    expect(splitOwn(ownItem("觀察", " 他改了條件 "))).toEqual({ type: "觀察", text: "他改了條件" });
    expect(splitOwn("隨便寫")).toEqual({ type: "", text: "隨便寫" });
    expect(hasOwn(undefined)).toBe(false);
    expect(hasOwn([])).toBe(false);
    expect(hasOwn(["觀察：", "我不知道：  "])).toBe(false);
    expect(hasOwn(["觀察：", "我不知道：他想不想談"])).toBe(true);
  });
});

describe("accepting the AI's cards unchanged", () => {
  const text = { claim: "先談條件", mechanism: "m", benefit: "b", risk: "r", assumption: "a", round: "R" };
  const version = (author: Author, n: number, content: Partial<Card>, at: string) => doc<Card>("think.card", "K", { ...text, ...content }, author, n, at);

  it("reads a pick's history from its versions: when picked, who first wrote it, whether a word changed", () => {
    const untouched = [version("ai", 1, {}, "2026-10-03T08:00:00Z"), version("joint", 2, { reaction: "共鳴", picked: true }, "2026-10-03T08:05:00Z")];
    expect(pickHistory(untouched)).toEqual({ pickedAt: "2026-10-03T08:05:00Z", firstAuthor: "ai", changed: false });
    const edited = [...untouched, version("joint", 3, { reaction: "共鳴", picked: true, claim: "先談條件，再談期限" }, "2026-10-03T08:09:00Z")];
    expect(pickHistory(edited)?.changed).toBe(true);
    expect(pickHistory([version("user", 1, { picked: true }, "2026-10-03T08:01:00Z")])).toEqual({ pickedAt: "2026-10-03T08:01:00Z", firstAuthor: "user", changed: false });
    expect(pickHistory([version("ai", 1, {}, "2026-10-03T08:00:00Z")])).toBeNull();
  });

  it("counts the latest picks in a row that are AI cards taken as they were; your own card or an edit breaks the run", () => {
    const aiAsIs = (pickedAt: string): PickHistory => ({ pickedAt, firstAuthor: "ai", changed: false });
    const mine: PickHistory = { pickedAt: "2026-10-03T09:00:00Z", firstAuthor: "user", changed: false };
    expect(unchangedStreak([])).toBe(0);
    expect(unchangedStreak([aiAsIs("2026-10-03T08:00:00Z"), aiAsIs("2026-10-03T08:10:00Z")])).toBe(2);
    expect(unchangedStreak([aiAsIs("2026-10-03T10:00:00Z"), mine, aiAsIs("2026-10-03T08:00:00Z")])).toBe(1);   // order is by when picked, not by the list
    expect(unchangedStreak([aiAsIs("2026-10-03T08:00:00Z"), { ...aiAsIs("2026-10-03T08:10:00Z"), changed: true }])).toBe(0);
    expect(unchangedStreak([aiAsIs("2026-10-03T08:00:00Z"), aiAsIs("2026-10-03T08:10:00Z"), mine])).toBe(0);
  });
});

describe("refusals read as sentences", () => {
  it("turns the engine's THINK codes into plain words and leaves the rest to the shared messages", () => {
    expect(thinkError(new ApiError(400, "THINK_OWN_VERSION_REQUIRED: 先寫下你自己的版本"))).toContain("先寫下你自己的版本");
    expect(thinkError(new ApiError(502, "AI_ANSWER_INVALID: x"))).toContain("再按一次");
    expect(thinkError(new ApiError(403, "AI_PERMISSION_DENIED: counter"))).toContain("協作合約");
  });
});

describe("共思考 page", () => {
  const round = doc("think.round", "R1", { problem: "要不要接這個案子", own: ["觀察：他第三次改條件"] });

  it("keeps the AI out until your own version is saved, and says so", async () => {
    serve({ "think.round": [doc("think.round", "R0", { problem: "要不要接這個案子" })], "collab_contract.terms": [doc("collab_contract.terms", "C", { permissions: ["counter", "propose_options", "direct_advice"] })] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    expect(host.textContent).toContain("先寫你自己的版本（至少一項）並存下來，AI 才會回。");
    const starts = [...host.querySelectorAll(".mcards .mcard")].filter((card) => card.textContent?.includes("模式：")).map((card) => (card.querySelector("button") as HTMLButtonElement).disabled);   // the nine start cards, not the overview's
    expect(starts).toEqual(Array(9).fill(true));
    expect(button(host, "直接取得建議").disabled).toBe(false);   // 除非你明確選「直接取得建議」
    await done();
  });

  it("offers only the turns the contract grants; the always-allowed ones need nothing", async () => {
    serve({ "think.round": [round], "collab_contract.terms": [doc("collab_contract.terms", "C", { permissions: ["propose_options"] })] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    const cards = Object.fromEntries([...host.querySelectorAll(".mcards .mcard")].map((card) => [card.querySelector("b")!.textContent, card]));
    const enabled = (title: string) => !(cards[title].querySelector("button") as HTMLButtonElement).disabled;
    expect(enabled("先幫我看見我在想什麼")).toBe(true);
    expect(enabled("幫我看這個選擇跟我有什麼關係")).toBe(true);
    expect(enabled("和我一起發散，但不要替我決定")).toBe(true);
    expect(enabled("請當最強的反方")).toBe(false);
    expect(cards["請當最強的反方"].textContent).toContain("協作合約沒有准「當反方」");
    expect(button(host, "直接取得建議").disabled).toBe(true);
    await done();
  });

  it("asks the engine with the round, then lays out a batch of cards", async () => {
    serve({ "think.round": [round], "collab_contract.terms": [doc("collab_contract.terms", "C", { permissions: ["propose_options"] })] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
      if (path === "/projects/P/ai/THINK/diverge") return { saved: doc("think.batch", "B1", { round: "R1", cards: [{}] }, "ai") };
      return init ? { created: 1 } : [];
    }) as never);
    await act(async () => { button([...host.querySelectorAll(".mcard")].find((card) => card.textContent?.includes("和我一起發散")) as HTMLElement, "開始").click(); });
    const calls = vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([path, init]) => [path, JSON.parse(init!.body as string)]);
    expect(calls).toContainEqual(["/projects/P/ai/THINK/diverge", { context: { round: "R1" } }]);
    expect(calls).toContainEqual(["/projects/P/think/expand", { batch: "B1" }]);
    await done();
  });

  it("shows an AI card with its author and 「它自己說的」, and limits what you take along to three", async () => {
    const aiCard = (id: string, picked = false) => doc<Card>("think.card", id, { claim: `方向${id}`, mechanism: "m", round: "R1", sourced: "它自己說的", method: "反向思考", ...(picked ? { picked: true } : {}) }, "ai");
    serve({ "think.round": [round], "think.card": [aiCard("a", true), aiCard("b", true), aiCard("c", true), aiCard("d")] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    const fourth = [...host.querySelectorAll(".mcards .mcard")].find((card) => card.textContent?.includes("方向d"))!;
    expect(fourth.textContent).toContain("AI 寫的");
    expect(fourth.textContent).toContain("它自己說的");
    expect((button(fourth as HTMLElement, "選這張帶走")).disabled).toBe(true);
    expect(host.textContent).toContain("你選了 3 / 3 張");
    expect(host.textContent).toContain("你自己至少再加兩張：0 / 2");
    await done();
  });
});
