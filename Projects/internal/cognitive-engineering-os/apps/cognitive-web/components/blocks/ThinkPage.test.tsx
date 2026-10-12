import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import type { Author, Doc } from "../../lib/blocks";
import { NEXT_STEP, PHASES, ThinkPage, hasOwn, ownItem, phaseAt, pickHistory, splitOwn, thinkError, thinkStage, unchangedStreak, type Card, type PickHistory, type Reaction } from "./ThinkPage";

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
let ledger: unknown[] = [];

function serve(held: Record<string, unknown[]>) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    if (path === "/projects/P") return { project_id: "P", name: "要不要接案" };
    if (path === "/projects/P/evidence") return { origins: [], changed_marks: [], claims: ledger, calcs: [], min_origins: 2 };
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
  const card = (author: Author) => doc<Card>("think.card", "K", { claim: "先談條件", mechanism: "m", round: "R" }, author);
  const reaction = (n: number, content: Partial<Reaction>, at: string) => doc<Reaction>("think.reaction", "X", { card: "K", ...content }, "user", n, at);

  it("reads a pick from its reaction's versions: when it was put on, and whether the card is still the AI's words", () => {
    const picked = [reaction(1, { reaction: "共鳴" }, "2026-10-03T08:00:00Z"), reaction(2, { reaction: "共鳴", picked: true }, "2026-10-03T08:05:00Z"), reaction(3, { picked: true }, "2026-10-03T08:09:00Z")];
    expect(pickHistory(picked, card("ai"))).toEqual({ pickedAt: "2026-10-03T08:05:00Z", aiAsIs: true });   // the first time it was put on, not the latest save
    expect(pickHistory(picked, card("joint"))?.aiAsIs).toBe(false);   // you changed its words
    expect(pickHistory(picked, card("user"))?.aiAsIs).toBe(false);
    const takenBack = [...picked, reaction(4, { reaction: "共鳴" }, "2026-10-03T08:12:00Z")];
    expect(pickHistory(takenBack, card("ai"))).toBeNull();
    expect(pickHistory([...takenBack, reaction(5, { picked: true }, "2026-10-03T08:20:00Z")], card("ai"))?.pickedAt).toBe("2026-10-03T08:20:00Z");   // picked again = a new pick
    expect(pickHistory([], card("ai"))).toBeNull();
  });

  it("counts the latest picks in a row that are AI cards taken as they were; your own card or an edit breaks the run", () => {
    const aiAsIs = (pickedAt: string): PickHistory => ({ pickedAt, aiAsIs: true });
    const mine = (pickedAt: string): PickHistory => ({ pickedAt, aiAsIs: false });
    expect(unchangedStreak([])).toBe(0);
    expect(unchangedStreak([aiAsIs("2026-10-03T08:00:00Z"), aiAsIs("2026-10-03T08:10:00Z")])).toBe(2);
    expect(unchangedStreak([aiAsIs("2026-10-03T10:00:00Z"), mine("2026-10-03T09:00:00Z"), aiAsIs("2026-10-03T08:00:00Z")])).toBe(1);   // order is by when picked, not by the list
    expect(unchangedStreak([aiAsIs("2026-10-03T08:00:00Z"), aiAsIs("2026-10-03T08:10:00Z"), mine("2026-10-03T09:00:00Z")])).toBe(0);
  });
});

describe("refusals read as sentences", () => {
  it("turns the engine's THINK codes into plain words and leaves the rest to the shared messages", () => {
    expect(thinkError(new ApiError(400, "THINK_OWN_VERSION_REQUIRED: 先寫下你自己的版本"))).toContain("先寫下你自己的版本");
    expect(thinkError(new ApiError(502, "AI_ANSWER_INVALID: x"))).toContain("再按一次");
    expect(thinkError(new ApiError(403, "AI_PERMISSION_DENIED: counter"))).toContain("協作合約");
  });
});

describe("what the round asks for next (走查 2026-10-12 W7)", () => {
  const have = { round: true, ownSaved: true, cards: 0, answers: 0, picked: 0, ownCards: 0, reflected: false };
  it("names the first thing still missing, from what is saved, and every stage has a sentence", () => {
    expect(thinkStage({ ...have, round: false, ownSaved: false })).toBe("start");
    expect(thinkStage({ ...have, ownSaved: false })).toBe("own");
    expect(thinkStage(have)).toBe("ask");
    expect(thinkStage({ ...have, answers: 1 })).toBe("reply");
    expect(thinkStage({ ...have, cards: 4, picked: 2 })).toBe("pick");
    expect(thinkStage({ ...have, cards: 4, picked: 3, ownCards: 1 })).toBe("own-cards");
    expect(thinkStage({ ...have, cards: 6, picked: 3, ownCards: 2 })).toBe("reflect");
    expect(thinkStage({ ...have, cards: 6, picked: 3, ownCards: 2, reflected: true })).toBe("done");
    expect(Object.keys(NEXT_STEP).sort()).toEqual(["ask", "done", "own", "own-cards", "pick", "reflect", "reply", "start"]);
    expect(Object.values(NEXT_STEP).join("")).not.toMatch(/[A-Za-z_]{4,}/);   // plain Chinese, no ids
  });
});

describe("共思考 page：先看到下一步，其餘收起來", () => {
  const round = doc("think.round", "R1", { problem: "要不要接這個案子", own: ["觀察：他第三次改條件"] });
  const grants = { "collab_contract.terms": [doc("collab_contract.terms", "C", { permissions: ["counter", "propose_options", "direct_advice"] })] };
  const foldOf = (host: HTMLElement, title: string) => [...host.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent?.startsWith(title)) as HTMLDetailsElement | undefined;

  it("once your version is saved: the next step, three commands in sight; the timer, the other commands, the role-and-mode picker and the direct advice folded, all still on the page", async () => {
    serve({ "think.round": [round], ...grants });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    expect(host.querySelector(".card.cta")?.textContent).toBe(`下一步：${NEXT_STEP.ask}`);
    const outside = (selector: string) => [...host.querySelectorAll(selector)].filter((node) => !node.closest("details"));
    expect(outside(".mcards .mcard").map((card) => card.querySelector("b")?.textContent)).toEqual(["先幫我看見我在想什麼", "和我一起發散，但不要替我決定", "請當最強的反方"]);
    for (const title of ["25 分鐘計時", "更多做法（6 種）", "自己選角色和模式", "不想先寫，直接要建議"]) {
      const fold = foldOf(host, title);
      expect(fold, title).toBeDefined();
      expect(fold!.open, title).toBe(false);
    }
    expect([...host.querySelectorAll(".mcards .mcard")].filter((card) => card.textContent?.includes("模式：")).length).toBe(9);   // nothing removed: the nine start cards are all in the page
    expect(button(host, "用這個角色和模式開始")).toBeDefined();
    expect(button(host, "直接取得建議")).toBeDefined();
    expect(button(host, "開始計時")).toBeDefined();
    await done();
  });

  it("before your version is saved: the page asks for it, and the whole AI part is one folded line saying why it waits", async () => {
    serve({ "think.round": [doc("think.round", "R0", { problem: "要不要接這個案子" })], ...grants });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    expect(host.querySelector(".card.cta")?.textContent).toContain(NEXT_STEP.own);
    expect(host.querySelector("#problem")!.closest("details")).toBeNull();   // the writing is in sight
    const ai = foldOf(host, "請 AI 幫忙（先存下你的版本")!;
    expect(ai.open).toBe(false);
    expect(ai.contains(button(host, "直接取得建議"))).toBe(true);
    await done();
  });

  it("with cards on the page the next step counts the picks, and the later cards (criteria, together, how I thought) wait folded", async () => {
    const card = (id: string) => doc<Card>("think.card", id, { claim: `方向${id}`, mechanism: "m", round: "R1", sourced: "它自己說的" }, "ai");
    serve({ "think.round": [round], "think.card": [card("a"), card("b")], "think.reaction": [doc<Reaction>("think.reaction", "x-a", { card: "a", picked: true })], ...grants });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    expect(host.querySelector(".card.cta")?.textContent).toBe(`下一步：${NEXT_STEP.pick}（現在 1 / 3 張）`);
    for (const title of ["候選的判準", "這一輪放在一起看", "這次我是怎麼想的", "加一張你自己的卡", "你的問題和你自己的版本"]) expect(foldOf(host, title), title).toBeDefined();
    expect(foldOf(host, "你的問題和你自己的版本")!.open).toBe(false);
    await done();
  });
});

describe("共思考 page：兩張題目卡是系統的固定題目（不是 AI）", () => {
  const round = doc("think.round", "R1", { problem: "要不要接這個案子", own: ["觀察：他第三次改條件"], reflection: "我太快相信第一個想法" });
  const commandCard = (host: HTMLElement, title: string) => [...host.querySelectorAll(".mcard")].find((card) => card.querySelector("b")?.textContent === title) as HTMLElement;
  const asked = () => vi.mocked(apiFetch).mock.calls.filter(([path, init]) => String(path).includes("/ai/") || (init as RequestInit | undefined)?.method === "POST");

  it("shows the conclusion, grounds and what-would-change-it questions at once with the person's own version under the grounds, with no contract permission and no call to the AI", async () => {
    serve({ "think.round": [round] });   // no contract terms at all
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    const card = commandCard(host, "現在要求我自己下結論");
    expect(card.textContent).toContain("系統的固定題目，不是 AI，不扣點");
    const open = card.querySelector("button") as HTMLButtonElement;
    expect([open.textContent, open.disabled]).toEqual(["看這張題目卡", false]);
    await act(async () => { open.click(); });
    const shown = [...host.querySelectorAll(".card")].find((node) => node.querySelector("h2")?.textContent === "系統給你的題目")!;
    expect(shown.textContent).toContain("系統整理的，不是 AI 寫的，不扣點");
    for (const ask of ["你現在的結論是什麼？用你自己的話寫一句。", "你的依據是什麼？是你這一輪寫的哪幾條？", "什麼會改變它？看到什麼，你就會改變這個結論？"]) expect(shown.textContent).toContain(ask);
    expect(shown.textContent).toContain("觀察：他第三次改條件");
    await act(async () => { (shown.querySelector(".top button") as HTMLButtonElement).click(); });
    expect(host.textContent).not.toContain("系統給你的題目");
    expect(asked()).toEqual([]);
    await done();
  });

  it("lists what the round holds under the look-back questions: your first version, the cards you rewrote, your answers to the AI, what you picked, your reflection -- no grade", async () => {
    const cards = [doc<Card>("think.card", "a", { claim: "A", round: "R1" }, "ai"), doc<Card>("think.card", "b", { claim: "B", round: "R1" }, "joint"), doc<Card>("think.card", "c", { claim: "C", round: "R1" }, "user")];
    const reply = doc("think.reply", "RP1", { round: "R1", action: "mirror", role: "鏡子", sections: [], sourced: "它自己說的" }, "ai");
    serve({ "think.round": [round], "think.card": cards, "think.reaction": [doc<Reaction>("think.reaction", "x-a", { card: "a", picked: true })], "think.reply": [reply],
      "think.response": [doc("think.response", "rs", { reply: "RP1", version: 1, response: "改寫", note: "我的版本" })] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    await act(async () => { (commandCard(host, "回看我怎麼想").querySelector("button") as HTMLButtonElement).click(); });
    const shown = [...host.querySelectorAll(".judge")].find((node) => node.textContent?.includes("回看你怎麼想"))!.textContent ?? "";
    expect(shown).toContain("這一輪，你一開始先寫了什麼？");
    expect(shown).toContain("觀察：他第三次改條件");
    expect(shown).toContain("你改寫了 1 張 AI 給的卡。");
    expect(shown).toContain("AI 回給你的整理，你確認了 0 次、改寫了 1 次、說「不對」0 次。");
    expect(shown).toContain("你選了 1 張卡帶走，其中 1 張是 AI 的卡，你一個字沒改。");
    expect(shown).toContain("你寫的「這次我是怎麼想的」：我太快相信第一個想法");
    expect(shown).toContain("不是分數，也不跟任何人比");
    expect(asked()).toEqual([]);
    await done();
  });

  it("the role-and-mode picker reaches them too: 決策教練 with 只問問題 opens the conclusion card, and 後設學習教練 stays choosable with nothing granted", async () => {
    serve({ "think.round": [round] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    const roles = host.querySelector('[aria-label="AI 這一輪的角色"]')!;
    const mode = host.querySelector('[aria-label="模式"]')!;
    expect(([...roles.querySelectorAll("button")].find((item) => item.textContent === "後設學習教練") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { ([...roles.querySelectorAll("button")].find((item) => item.textContent === "後設學習教練") as HTMLButtonElement).click(); });
    await act(async () => { ([...mode.querySelectorAll("button")].find((item) => item.textContent === "鏡像") as HTMLButtonElement).click(); });
    await act(async () => { button(host, "用這個角色和模式開始").click(); });
    expect(host.textContent).toContain("系統給你的題目");
    expect(host.textContent).toContain("這一輪，你換過幾次想法？");
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => String(path).includes("/ai/"))).toBe(false);
    await done();
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

  const aiCard = (id: string, at = "R1") => doc<Card>("think.card", id, { claim: `方向${id}`, mechanism: "m", round: at, sourced: "它自己說的", method: "反向思考" }, "ai");
  const picked = (card: string) => doc<Reaction>("think.reaction", `x-${card}`, { card, reaction: "共鳴", picked: true });
  const cardOf = (host: HTMLElement, claim: string) => [...host.querySelectorAll(".mcards .mcard")].find((item) => item.textContent?.includes(claim)) as HTMLElement;

  it("an AI card resting on a checked claim says which one; the label is the one the system set", async () => {
    ledger = [{ claim_id: "C1", version: 1, text: "公會 2019 年改了範本", sentence: "可以查的事實", law: false, state: "有獨立出處支持", support: ["o:a"], oppose: [], stale: 0, few: true, verdict: { verdict: "採信", reason: "r", earlier: false }, usable: true },
              { claim_id: "C2", version: 1, text: "公會也改了第 8 條", sentence: "可以查的事實", law: false, state: "有獨立出處支持", support: ["o:a"], oppose: [], stale: 0, few: true, verdict: { verdict: "不採信", reason: "r", earlier: false }, usable: false }];
    try {
      const sourced = doc<Card>("think.card", "s1", { claim: "照公會範本談", mechanism: "m", round: "R1", sourced: "有來源", rests_on: "C1", method: "類比遷移" }, "ai");
      const gone = doc<Card>("think.card", "s2", { claim: "照舊範本談", mechanism: "m", round: "R1", sourced: "有來源", rests_on: "C9", method: "類比遷移" }, "ai");
      const distrusted = doc<Card>("think.card", "s3", { claim: "照第 8 條談", mechanism: "m", round: "R1", sourced: "有來源", rests_on: "C2", method: "類比遷移" }, "ai");
      serve({ "think.round": [round], "think.card": [sourced, gone, distrusted] });
      const mounted = await mount(<ThinkPage projectId="P" />);
      expect(cardOf(mounted.host, "照公會範本談").textContent).toContain("靠的是你查證過的：「公會 2019 年改了範本」");
      expect(cardOf(mounted.host, "照舊範本談").textContent).toContain("查證結果變了：這個主張已經刪掉了");
      expect(cardOf(mounted.host, "照舊範本談").textContent).not.toContain("有來源");   // the tag says the same as the line under it
      const later = cardOf(mounted.host, "照第 8 條談").textContent ?? "";
      expect(later).toContain("現在不能當事實");   // the person no longer trusts it: the card reads as 它自己說的 now
      expect(later).toContain("它自己說的");
      expect(later).not.toContain("有來源");
      await mounted.done();
    } finally { ledger = []; }
  });

  it("shows an AI card as the AI's with 「它自己說的」 even after you reacted to it, and stops a fourth pick in the round", async () => {
    serve({ "think.round": [round], "think.card": [aiCard("a"), aiCard("b"), aiCard("c"), aiCard("d")], "think.reaction": [picked("a"), picked("b"), picked("c")] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    const first = cardOf(host, "方向a");
    expect(first.textContent).toContain("AI 寫的");
    expect(first.textContent).not.toContain("AI 起草、你改過");
    expect(first.textContent).toContain("你選了這張");
    expect(first.textContent).toContain("它自己說的");
    expect(button(cardOf(host, "方向d"), "選這張帶走").disabled).toBe(true);
    expect(host.textContent).toContain("這一輪你選了 3 / 3 張");
    expect(host.textContent).toContain("你自己至少再加兩張：0 / 2");
    await done();
  });

  it("counts only this round's picks: three picks in an older round do not block this one", async () => {
    const older = doc("think.round", "R0", { problem: "上一次的問題" });
    serve({ "think.round": [older, round], "think.card": [aiCard("a", "R0"), aiCard("b", "R0"), aiCard("c", "R0"), aiCard("d")], "think.reaction": [picked("a"), picked("b"), picked("c")] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    expect(button(cardOf(host, "方向d"), "選這張帶走").disabled).toBe(false);
    expect(host.textContent).toContain("這一輪你選了 0 / 3 張");
    await done();
  });

  it("puts a pick on the card's one reaction, and takes the reaction away when nothing is left in it", async () => {
    serve({ "think.round": [round], "think.card": [aiCard("a")] });
    const mounted = await mount(<ThinkPage projectId="P" />);
    vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => (init ? { ...picked("a"), notices: [] } : [])) as never);
    await act(async () => { button(cardOf(mounted.host, "方向a"), "選這張帶走").click(); });
    const post = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect([post[0], JSON.parse(post[1]!.body as string)]).toEqual(["/projects/P/docs/think.reaction", { content: { card: "a", picked: true } }]);
    await mounted.done();
    serve({ "think.round": [round], "think.card": [aiCard("a")], "think.reaction": [doc<Reaction>("think.reaction", "x-a", { card: "a", picked: true })] });
    const taken = await mount(<ThinkPage projectId="P" />);
    await act(async () => { button(cardOf(taken.host, "方向a"), "取消選這張").click(); });
    expect(vi.mocked(apiFetch).mock.calls.some(([path, init]) => path === "/projects/P/docs/think.reaction/x-a" && init?.method === "DELETE")).toBe(true);
    await taken.done();
  });

  it("removes a card's reaction together with the card, so your reason does not outlive it", async () => {
    serve({ "think.round": [round], "think.card": [aiCard("a")], "think.reaction": [doc<Reaction>("think.reaction", "x-a", { card: "a", reason: "太貴了" })] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    await act(async () => { button(cardOf(host, "方向a"), "刪掉").click(); });
    const deleted = vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === "DELETE").map(([path]) => path);
    expect(deleted).toEqual(["/projects/P/docs/think.reaction/x-a", "/projects/P/docs/think.card/a"]);
    await done();
  });

  it("offers to lay a batch out only until the system has noted it laid out: deleted cards do not bring the button back", async () => {
    const batch = doc("think.batch", "B1", { round: "R1", action: "diverge", role: "發散夥伴", sourced: "它自己說的", cards: [{}] }, "ai");
    serve({ "think.round": [round], "think.batch": [batch] });
    const waiting = await mount(<ThinkPage projectId="P" />);
    expect(button(waiting.host, "展開成卡")).toBeTruthy();
    await waiting.done();
    serve({ "think.round": [round], "think.batch": [batch], "think.laid_out": [doc("think.laid_out", "N1", { batch: "B1" }, "system")] });
    const laid = await mount(<ThinkPage projectId="P" />);
    expect(button(laid.host, "展開成卡")).toBeUndefined();
    await laid.done();
  });

  it("shows the AI's caution beside its reflection, in the warn style, with the sections kept and no hand-back (走查 2026-10-12 W5)", async () => {
    const reply = doc("think.reply", "Y2", { round: "R1", action: "mirror", role: "鏡子", sections: [{ title: "事實", items: ["他改了條件"] }], caution: "合約條款這要請律師看。", sourced: "它自己說的" }, "ai");
    serve({ "think.round": [round], "think.reply": [reply] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    const shown = host.querySelector(".judge")!;
    expect(shown.textContent).toContain("他改了條件");
    const caution = [...shown.querySelectorAll("p.warn")].map((node) => node.textContent);
    expect(caution).toEqual(["AI 在整理旁邊提醒你：合約條款這要請律師看。"]);
    expect(shown.textContent).not.toContain("把控制交還給你");
    expect(button(host, "對，是這樣")).toBeDefined();   // the reflection is still the one to confirm or rewrite
    await done();
  });

  it("answers a reply with the version of it that is on the screen", async () => {
    const reply = doc("think.reply", "Y1", { round: "R1", action: "mirror", role: "鏡子", sections: [{ title: "事實", items: ["他改了條件"] }], sourced: "它自己說的" }, "ai", 3);
    serve({ "think.round": [round], "think.reply": [reply] });
    const { host, done } = await mount(<ThinkPage projectId="P" />);
    vi.mocked(apiFetch).mockImplementation((async (_path: string, init?: RequestInit) => (init ? { ...doc("think.response", "Z1", { reply: "Y1", version: 3, response: "確認" }), notices: [] } : [])) as never);
    await act(async () => { button(host, "對，是這樣").click(); });
    const post = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect([post[0], JSON.parse(post[1]!.body as string)]).toEqual(["/projects/P/docs/think.response", { content: { reply: "Y1", version: 3, response: "確認" } }]);
    await done();
  });
});
