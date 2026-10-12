import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { VerifyPage, claimFromMap, liveOf, lookupLine, mapClaimsToBring, messageOffers, ofVersion, pendingProposals, readingsFor, sentTo, type Claim, type Message, type Split } from "./VerifyPage";
import { byText, click, doc, field, labelled, mount, saved, serve, shell, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const P = "/projects/P1";
const MESSAGE = "【緊急】央行宣布下週起每天只能領一萬元！不轉就來不及，快轉給家人！";
const SPEC = {
  forms: ["訊息", "截圖文字", "連結"], sentence_kinds: ["可以查的事實", "對事實的解釋", "價值判斷", "叫你去做的事"], checkable: "可以查的事實", stances: ["支持", "反對", "無關", "看不出"],
  verdicts: ["採信", "存疑", "不採信"], asks: ["轉傳"], spread: [{ key: "spread", question: "這則訊息怎麼傳開" }], check_questions: ["量是自然的嗎？"], angles: ["primary", "news"], min_origins: 2,
  law_unconfirmed: "未確認", techniques: { title: "操弄手法清單", version: "1", maintainer: "平台", items: [] },
  factcheck_dbs: { title: "查核資料庫名單", version: "3", maintainer: "平台", dbs: { cofacts: { name: "Cofacts 真的假的", by: "志工" }, claimreview: { name: "全球查核結果公開資料檔", by: "各查核組織" } } },
  search_by: ["Serper", "Brave"],
};
const MSG = doc("verify.message", "M1", { text: MESSAGE, form: "訊息", sha256: "a".repeat(64) });
const FIRST = doc("verify.first", "F1", { message: "M1", reaction: "有點慌", confidence: 60 });
const SPLIT = doc<Split>("verify.split", "S1", { message: "M1", claims: [{ text: "央行宣布下週起每天只能領一萬元", sentence: "可以查的事實" }, { text: "快轉給家人", sentence: "叫你去做的事" }] }, { author: "ai" });
const LINE = {
  claim_id: "C1", version: 1, text: "央行宣布下週起每天只能領一萬元", sentence: "可以查的事實", law: false, state: "有獨立出處支持", support: ["o:1"], oppose: [], stale: 0, few: true, verdict: null,
  message: "M1", from: "訊息", law_state: null, needs_alternative: false, earlier: [], three: { found: true, independent: 1, independent_enough: false, stands: [] }, search: null, lookup: null, weak_line: "只有一個出處這樣說",
  said: "只有一個出處這樣說；獨立出處要 2 個以上才算數", next: [],
};
const posts = (calls: Call[], path: string) => calls.filter((call) => call.method !== "GET" && call.path === path);

async function open(routes: Record<string, unknown> = {}) {
  const calls = serve({ ...shell(), "/blocks/verify/spec": SPEC, [`${P}/evidence`]: { origins: [] }, [`${P}/verify/ledger`]: { claims: [], factcheck_asks: ["cofacts", "claimreview"], person_reads: [] }, ...routes });
  const page = await mount(<VerifyPage projectId="P1" />);
  return { ...page, calls };
}

describe("VERIFY 查證主張", () => {
  it("a pasted message goes to VERIFY's own route, never to /sources: it would support itself", async () => {
    const { host, done, calls } = await open({ [`POST ${P}/verify/messages`]: (call: Call) => saved("verify.message", "M1", { ...call.body, sha256: "a".repeat(64) }) });
    await type(labelled(host, "訊息原文"), MESSAGE);
    await click(byText(host, "button", "存這則訊息"));
    expect(posts(calls, `${P}/verify/messages`)[0].body).toEqual({ text: MESSAGE, form: "訊息" });
    expect(calls.some((call) => call.path.includes("/sources"))).toBe(false);
    await done();
  });

  it("before the first reaction only the message and 先停一下 show; the reaction and confidence are mine to save", async () => {
    const { host, done, calls } = await open({ [`GET ${P}/docs/verify.message`]: [MSG], [`POST ${P}/docs/verify.first`]: (call: Call) => saved("verify.first", "F1", call.body.content) });
    const text = host.textContent ?? "";
    expect(text).toContain("先停一下");
    for (const hidden of ["查查核資料庫", "請 AI 提拆法", "請 AI 找手法"]) expect(byText(host, "button", hidden)).toBeUndefined();
    const save = () => byText(host, "button", "存我的第一反應") as HTMLButtonElement;
    await type(labelled(host, "第一反應"), "有點慌");
    expect(save().disabled).toBe(true);   // the confidence too
    await click(byText(host.querySelector('[aria-label="信心有多少"]')!, "button", "60%"));
    await click(save());
    expect(posts(calls, `${P}/docs/verify.first`)[0].body.content).toEqual({ message: "M1", reaction: "有點慌", confidence: 60 });
    await done();
  });

  it("after the first reaction: an AI proposal becomes a claim only when I confirm it, naming the proposal", async () => {
    const { host, done, calls } = await open({
      [`GET ${P}/docs/verify.message`]: [MSG], [`GET ${P}/docs/verify.first`]: [FIRST], [`GET ${P}/docs/verify.split`]: [SPLIT],
      [`POST ${P}/docs/verify.claim`]: (call: Call) => saved("verify.claim", "C1", call.body.content),
    });
    expect(host.textContent).toContain("你的第一反應：有點慌（信心 60%）");
    expect(host.textContent).toContain("AI 寫的");
    await click(byText(host, "button", "確認"));
    expect(posts(calls, `${P}/docs/verify.claim`)[0].body.content).toEqual({ text: "央行宣布下週起每天只能領一萬元", sentence: "可以查的事實", from: "訊息", message: "M1", proposal: "S1#0" });
    await done();
  });

  it("the summary of the ledger and what to check next are the system's own sentences with no AI button; a summary and a list the AI saved before still show", async () => {
    const line = { ...LINE, next: ["別的地方怎麼報：找別家的報導", "最早的原文在哪裡：找最早的出處"] };
    const oldSummary = doc("verify.summary", "U1", { lines: [{ claim: "C1", claim_version: 1, line: "帳本上有一個出處支持它" }], overview: "AI 以前的總覽" }, { author: "ai" });
    const oldNext = doc("verify.next", "N1", { items: ["去問當事人"], question: "誰先說的？" }, { author: "ai" });
    const { host, done, calls } = await open({
      [`GET ${P}/docs/verify.claim`]: [doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" }), doc<Claim>("verify.claim", "C2", { text: "快轉給家人", sentence: "叫你去做的事", from: "訊息", message: "M1" })],
      [`${P}/verify/ledger`]: { claims: [line, { ...LINE, claim_id: "C2", text: "快轉給家人", sentence: "叫你去做的事", state: "不是查得了的句子", few: false, said: "這是叫你去做的事，不是查得了的句子，帳本不算它的出處", next: [] }],
        overview: "帳本上共有 2 個主張，其中 1 個是查得了的事實。這 1 個裡，0 個有 2 個以上的獨立出處，1 個不到。帳本只數出處，不說哪個主張是真的或假的。", factcheck_asks: [], person_reads: [] },
      [`GET ${P}/docs/verify.summary`]: [oldSummary], [`GET ${P}/docs/verify.next`]: [oldNext],
    });
    const text = host.textContent ?? "";
    expect(text).toContain("系統整理的，不是 AI 寫的，不扣點");
    expect(text).toContain("央行宣布下週起每天只能領一萬元：只有一個出處這樣說；獨立出處要 2 個以上才算數");
    expect(text).toContain("快轉給家人：這是叫你去做的事，不是查得了的句子，帳本不算它的出處");
    expect(text).toContain("帳本上共有 2 個主張，其中 1 個是查得了的事實。");
    expect(text).toContain("別的地方怎麼報：找別家的報導");
    expect(text).toContain("最早的原文在哪裡：找最早的出處");
    expect(text).toContain("以前 AI 摘要的");
    expect(text).toContain("AI 以前的總覽");
    expect(text).toContain("去問當事人");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent).filter((label) => /請 AI 摘要|請 AI 提還該查什麼/.test(label ?? ""))).toEqual([]);
    expect(calls.filter((call) => call.method !== "GET" && call.path.includes("/ai/"))).toEqual([]);
    await done();
  });

  it("a fact-checker's result is shown as who judged it, with the attribution collect sent, never as the platform's verdict", async () => {
    const result = doc("verify.factcheck", "X1", { message: "M1", place: "台灣", dbs: [
      { db: "claimreview", state: "查到", attribution: "查核結果來自各查核組織。", hits: [{ source_id: "s2", publisher: "台灣事實查核中心", judged_as: "錯誤", date: "2026-05-01", url: "https://tfc-taiwan.org.tw/articles/1", local: true, claim: "銀行下週起每日提款上限兩萬" }] },
      { db: "cofacts", state: "查到", attribution: "資料來自 Cofacts 真的假的（cofacts.tw），以 CC BY-SA 4.0 授權。", hits: [{ source_id: "s1", publisher: "Cofacts 志工", judged_as: "含有不實訊息", date: "2026-09-30", url: "https://cofacts.tw/article/a1", local: true }] },
      { db: "google", state: "無法檢查", why: "找資料的服務這次沒有回應", attribution: "", hits: [] }] }, { author: "system" });
    const { host, done } = await open({ [`GET ${P}/docs/verify.message`]: [MSG], [`GET ${P}/docs/verify.first`]: [FIRST], [`GET ${P}/docs/verify.factcheck`]: [result] });
    const text = host.textContent ?? "";
    expect(text).toContain("誰判的：Cofacts 志工（當地）；判定：含有不實訊息");
    expect(text).toContain("不是平台的結論");
    expect(text).toContain("CC BY-SA 4.0");
    expect(text).toContain("google：無法檢查（找資料的服務這次沒有回應）");
    expect(text).toContain("他們查的說法：銀行下週起每日提款上限兩萬；誰判的：台灣事實查核中心（當地）；判定：錯誤");   // the reviewed claim comes from the record, never from the source's text
    expect(text).toContain(sentTo(SPEC as never, ["cofacts", "claimreview"]));
    expect(text).toContain("由它去問：Cofacts 真的假的、全球查核結果公開資料檔。");
    expect(text).not.toContain("蒐集器");   // one term for the service on every page
    await done();
  });
});

describe("VERIFY starts from the card that made SENSE propose it (走查 2026-10-12 W9)", () => {
  const CARD = doc("sense.card", "K1", { category: "事件", text: "他還說「同業都這樣改」" });
  const PROPOSAL = (propose: string, source?: string) => doc("assembler.proposal.sense", "PR1", { propose, why: "w", ...(source ? { source } : {}) }, { author: "system" });

  it("offers the card a VERIFY proposal names, once per card; a deleted card, another block's proposal, or a card already saved as a message is not offered", () => {
    expect(messageOffers([PROPOSAL("VERIFY", "K1")], [CARD], [])).toEqual([{ id: "K1", text: "他還說「同業都這樣改」" }]);
    expect(messageOffers([PROPOSAL("VERIFY", "K1"), { ...PROPOSAL("VERIFY", "K1"), doc_id: "PR2" }], [CARD], [])).toHaveLength(1);
    expect(messageOffers([PROPOSAL("VERIFY", "K9")], [CARD], [])).toEqual([]);
    expect(messageOffers([PROPOSAL("THINK", "K1")], [CARD], [])).toEqual([]);
    expect(messageOffers([PROPOSAL("VERIFY")], [CARD], [])).toEqual([]);
    expect(messageOffers([PROPOSAL("VERIFY", "K1")], [CARD], [MSG, doc<Message>("verify.message", "M2", { text: " 他還說「同業都這樣改」 ", form: "訊息", sha256: "b".repeat(64) })])).toEqual([]);
  });

  it("shows the card's words with one button that only puts them in the message box; the person edits and saves", async () => {
    const { host, done, calls } = await open({ [`GET ${P}/docs/assembler.proposal.sense`]: [PROPOSAL("VERIFY", "K1")], [`GET ${P}/docs/sense.card`]: [CARD], [`POST ${P}/verify/messages`]: (call: Call) => saved("verify.message", "M1", { ...call.body, sha256: "a".repeat(64) }) });
    expect(host.textContent).toContain("你在「外化」寫的一張卡裡，有別人的說法");
    expect(host.querySelector(".judge .tnote")?.textContent).toBe("他還說「同業都這樣改」");
    expect(labelled(host, "訊息原文").value).toBe("");
    expect(posts(calls, `${P}/verify/messages`)).toHaveLength(0);
    await click(byText(host, "button", "用這句當要查的訊息"));
    expect(labelled(host, "訊息原文").value).toBe("他還說「同業都這樣改」");
    expect(posts(calls, `${P}/verify/messages`)).toHaveLength(0);   // nothing is saved by the offer itself
    await type(labelled(host, "訊息原文"), "他還說「同業都這樣改」（我改過）");
    await click(byText(host, "button", "存這則訊息"));
    expect(posts(calls, `${P}/verify/messages`)[0].body).toEqual({ text: "他還說「同業都這樣改」（我改過）", form: "訊息" });
    await done();
  });

  it("offers nothing when no proposal names a card", async () => {
    const { host, done } = await open({ [`GET ${P}/docs/sense.card`]: [CARD] });
    expect(byText(host, "button", "用這句當要查的訊息")).toBeUndefined();
    await done();
  });
});

describe("VERIFY 去查 shows how far the search is (走查 2026-10-12 W10)", () => {
  const RUN = "RUN1";
  const LINE_RUNNING = { ...LINE, lookup: { run: RUN, status: "running", angles: ["primary"] } };
  const claimDoc = doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" });
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();
  const later = (n: number) => new Date(Date.now() + n * 60000).toISOString();

  it("reads the run at once and says how long it has run, when it ends at the latest and how many pages at most -- the words GATHER uses", async () => {
    const { host, done, calls } = await open({
      [`GET ${P}/docs/verify.claim`]: [claimDoc], [`${P}/verify/ledger`]: { claims: [LINE_RUNNING], factcheck_asks: [], person_reads: [] },
      [`GET ${P}/collections/${RUN}`]: { status: "running", requested_at: minutesAgo(7), deadline_at: later(8), max_fetches: 200 },
    });
    const line = [...host.querySelectorAll("span.sub")].find((node) => node.textContent?.includes("上次："))!.textContent!;
    expect(line).toContain("系統正在找");
    expect(line).toContain("已經過了 7 分鐘");
    expect(line).toContain("最晚再 8 分鐘會結束");
    expect(line).toContain("最多抓 200 頁");
    expect(line).toContain("找完，結果會寫進這個主張的帳本");
    expect(line).not.toContain("來源總覽");   // that is GATHER's page, not this one
    expect(calls.filter((call) => call.path === `${P}/collections/${RUN}`)).toHaveLength(1);
    await done();
  });

  it("when the progress cannot be read it says so, and keeps the last reading it had", async () => {
    let answer: () => unknown = () => { throw new ApiError(503, "COLLECT_DOWN"); };
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const { host, done } = await open({
        [`GET ${P}/docs/verify.claim`]: [claimDoc], [`${P}/verify/ledger`]: { claims: [LINE_RUNNING], factcheck_asks: [], person_reads: [] },
        [`GET ${P}/collections/${RUN}`]: () => answer(),
      });
      const line = () => [...host.querySelectorAll("span.sub")].find((node) => node.textContent?.includes("上次："))!.textContent!;
      expect(line()).toContain("讀不到進度");
      expect(line()).not.toContain("還在找");
      answer = () => ({ status: "running", requested_at: minutesAgo(2), deadline_at: later(10), max_fetches: 100 });
      await act(async () => { vi.advanceTimersByTime(15000); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(line()).toContain("最多抓 100 頁");
      answer = () => { throw new ApiError(503, "COLLECT_DOWN"); };
      await act(async () => { vi.advanceTimersByTime(15000); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(line()).toContain("最多抓 100 頁");   // one failed read does not wipe what was known
      await done();
    } finally { vi.useRealTimers(); }
  });

  it("shows the search result's why as the engine sent it: the engine's name once, no name or 無法檢查 added in front of it (走查 2026-10-12 W11)", async () => {
    const why = "Brave：這個搜尋引擎回了錯誤（HTTP 422）；Serper：找過沒有找到";
    const { host, done } = await open({
      [`GET ${P}/docs/verify.claim`]: [claimDoc],
      [`${P}/verify/ledger`]: { claims: [{ ...LINE, lookup: { run: RUN, status: "completed", angles: [] }, search: { state: "無法檢查", why } }], factcheck_asks: [], person_reads: [] },
    });
    const line = [...host.querySelectorAll("span.sub")].find((node) => node.textContent?.includes("結果："))!.textContent!;
    expect(line).toBe(`　結果：無法檢查（${why}）`);
    expect(line).not.toMatch(/Brave Brave|Brave：Brave|無法檢查：/);
    await done();
  });

  it("before the first read it says only 還在找; a finished or failed search is not asked about", async () => {
    expect(lookupLine(undefined, Date.now())).toBe("還在找");
    const { host, done, calls } = await open({
      [`GET ${P}/docs/verify.claim`]: [claimDoc], [`${P}/verify/ledger`]: { claims: [{ ...LINE, lookup: { run: RUN, status: "completed", angles: [] } }], factcheck_asks: [], person_reads: [] },
    });
    expect(host.textContent).toContain("上次：跑完了");
    expect(calls.some((call) => call.path.includes("/collections/"))).toBe(false);
    await done();
  });

  it("asks again every 15 seconds while it runs, and when it ends the page reloads once -- not on every later poll", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      let status = "running";
      const { host, done, calls } = await open({
        [`GET ${P}/docs/verify.claim`]: [claimDoc], [`${P}/verify/ledger`]: { claims: [LINE_RUNNING], factcheck_asks: [], person_reads: [] },
        [`GET ${P}/collections/${RUN}`]: () => ({ status, requested_at: minutesAgo(1), deadline_at: later(14), max_fetches: 200 }),
      });
      const tick = async () => { await act(async () => { vi.advanceTimersByTime(15000); }); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
      const asked = () => calls.filter((call) => call.path === `${P}/collections/${RUN}`).length;
      const ledgers = () => calls.filter((call) => call.path === `${P}/verify/ledger`).length;
      expect([asked(), ledgers()]).toEqual([1, 1]);
      await tick();
      expect([asked(), ledgers()]).toEqual([2, 1]);   // still running: a read, no reload
      status = "completed";
      await tick();
      expect([asked(), ledgers()]).toEqual([3, 2]);   // ended: one reload
      await tick();
      expect(ledgers()).toBe(2);   // the ledger here still says running; the page does not reload every 15 seconds for it
      await done();
    } finally { vi.useRealTimers(); }
  });
});

describe("VERIFY ledger lines", () => {
  const CARD = { card: "K1", title: "央行新聞稿", source_id: "s1", snapshot: { sha256: "h1" } };
  const ledger = (line: Record<string, unknown>, routes: Record<string, unknown> = {}) => open({
    [`GET ${P}/docs/verify.claim`]: [doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" }, { version: (line.version as number) ?? 1 })],
    [`${P}/verify/ledger`]: { claims: [{ ...LINE, ...line }], factcheck_asks: ["claimreview"], person_reads: (line.person_reads as string[]) ?? [] }, [`${P}/evidence`]: { origins: [{ origin_id: "o:1", cards: [CARD] }] }, ...routes,
  });

  it("says what one origin says with the server's one rule, never a support line for an opposing origin", async () => {
    const { host, done } = await ledger({ support: [], oppose: ["o:1"], weak_line: "只有一個出處說不是這樣", said: "只有一個出處說不是這樣；獨立出處要 2 個以上才算數" });
    expect(host.textContent).toContain("獨立出處不到 2 個：只有一個出處說不是這樣。");
    expect(host.textContent).not.toContain("只有一個出處這樣說");
    await done();
  });

  it("a fact-check card is never offered to the AI; reading it myself shows the record's words; the claim's look-up says where the words go", async () => {
    const HIT = { card: "K2", title: "TFC 的查核：錯誤", url: "https://tfc-taiwan.org.tw/articles/1#factcheck-claimreview-ab", source_id: "s2", snapshot: { sha256: "h2" } };
    const record = doc("verify.factcheck", "X1", { message: "M1", dbs: [{ db: "claimreview", state: "查到", attribution: "查核結果來自各查核組織。", hits: [
      { source_id: "s2", publisher: "台灣事實查核中心", judged_as: "錯誤", date: "2026-05-01", url: "https://tfc-taiwan.org.tw/articles/1", local: true, claim: "銀行下週起停止營業", license: "CC BY 4.0" }] }] }, { author: "system" });
    const { host, done } = await ledger({ person_reads: ["K2"] }, { [`${P}/evidence`]: { origins: [{ origin_id: "o:1", cards: [CARD] }, { origin_id: "o:2", cards: [HIT] }] }, [`GET ${P}/docs/verify.factcheck`]: [record] });
    const forAi = host.querySelector('[aria-label="給 AI 讀的來源卡"]')!;
    expect([byText(forAi, "button", "央行新聞稿") !== undefined, byText(forAi, "button", HIT.title)]).toEqual([true, undefined]);
    expect(host.textContent).not.toContain("他們查的說法");
    await click(byText(host.querySelector('[aria-label="讀哪一張"]')!, "button", HIT.title)!);
    expect(host.textContent).toContain("他們查的說法：銀行下週起停止營業；誰判的：台灣事實查核中心（當地）；判定：錯誤；2026-05-01；授權：CC BY 4.0");   // from the record, never the source's text
    expect(host.textContent).toContain(`「查查核資料庫」：${sentTo(SPEC as never, ["claimreview"])}`);
    await done();
  });

  it("the look-up notice names only the databases asked for where I am, and 去查 says where the claim goes", async () => {
    const { host, done } = await ledger({}, { [`POST ${P}/verify/claims/C1/search`]: { plan: { seeds: 1, max_queries: 16, max_fetches: 200 }, confirm_required: true } });
    const text = host.textContent ?? "";
    expect(text).toContain("「查查核資料庫」：按下去，這段字會送到找資料的服務，由它去問：全球查核結果公開資料檔。");   // outside Taiwan: never Cofacts
    expect(text).not.toContain("由它去問：Cofacts");
    await click(byText(host, "button", "去查（先看計畫）")!);
    expect(host.textContent).toContain("確認後，這個主張會送到找資料的服務，由它用 Serper、Brave 去搜尋。");
    await done();
  });

  it("a page only I read (the server's list) is never offered to the AI", async () => {
    const ARTICLE = { card: "K3", title: "查核報告：錯誤", url: "https://factcheck.example/a", source_id: "s3", snapshot: { sha256: "h3" }, found_by: { by: "系統找的", angle: "factcheck" } };
    const { host, done } = await ledger({ person_reads: ["K3"] }, { [`${P}/evidence`]: { origins: [{ origin_id: "o:1", cards: [CARD] }, { origin_id: "o:3", cards: [ARTICLE] }] } });
    const forAi = host.querySelector('[aria-label="給 AI 讀的來源卡"]')!;
    expect([byText(forAi, "button", "央行新聞稿") !== undefined, byText(forAi, "button", ARTICLE.title)]).toEqual([true, undefined]);
    expect(byText(host.querySelector('[aria-label="讀哪一張"]')!, "button", ARTICLE.title)).toBeDefined();   // I read it myself
    await done();
  });

  it("after the claim changed, the old version's fact-check result and summary line are not shown as current", async () => {
    const old = doc("verify.factcheck", "X1", { claim: "C1", claim_version: 1, dbs: [{ db: "claimreview", state: "查到", attribution: "a", hits: [
      { source_id: "s2", publisher: "台灣事實查核中心", judged_as: "錯誤", date: "", url: "https://tfc-taiwan.org.tw/articles/1", local: true }] }] }, { author: "system" });
    const summary = doc("verify.summary", "U1", { lines: [{ claim: "C1", claim_version: 1, line: "帳本上有一個出處支持它" }] }, { author: "ai" });
    const { host, done } = await ledger({ version: 2 }, { [`GET ${P}/docs/verify.factcheck`]: [old], [`GET ${P}/docs/verify.summary`]: [summary] });
    expect(host.textContent).not.toContain("誰判的：台灣事實查核中心");
    expect(host.textContent).not.toContain("帳本上有一個出處支持它");
    await done();
  });

  it("after the claim changed, an old stance does not count as read: confirming the new reading edits it", async () => {
    const reading = doc("verify.reading", "R2", { readings: [{ claim: "C1", claim_version: 2, card: "K1", snapshot: "h1", reads_as: "反對", quote: "本行從未宣布每日提款上限" }] }, { author: "ai" });
    const old = doc("verify.stance", "S1", { claim: "C1", claim_version: 1, card: "K1", snapshot: "h1", stance: "反對" });
    const { host, done, calls } = await ledger({ version: 2, few: false }, {
      [`GET ${P}/docs/verify.reading`]: [reading], [`GET ${P}/docs/verify.stance`]: [old], [`POST ${P}/verify/stances`]: { notices: [] },
    });
    expect(host.textContent).not.toContain("你讀過了");
    await click(byText(host, "button", "照這樣記"));
    expect(posts(calls, `${P}/verify/stances`)[0].body).toEqual({ content: { claim: "C1", claim_version: 2, card: "K1", snapshot: "h1", stance: "反對", reading: "R2", quote: "本行從未宣布每日提款上限" }, doc_id: "S1", base_version: 1 });
    await done();
  });

  it("after the claim changed, my old stance and verdict are not shown under the new version; judging it again edits the old verdict", async () => {
    // Codex VERIFY r5 F3: stance and verdict props were filtered by claim id only, so version 1's reading and 存疑 sat
    // on version 2's line as if they were about the new words.
    const stance = doc("verify.stance", "S1", { claim: "C1", claim_version: 1, card: "K1", snapshot: "h1", stance: "反對", quote: "本行從未宣布每日提款上限" });
    const verdict = doc("verify.verdict", "V1", { claim: "C1", claim_version: 1, verdict: "存疑", reason: "舊的理由" });
    const { host, done, calls } = await ledger({ version: 2, stale: 1, verdict: { verdict: "存疑", reason: "舊的理由", earlier: true } }, {
      [`GET ${P}/docs/verify.stance`]: [stance], [`GET ${P}/docs/verify.verdict`]: [verdict], [`PUT ${P}/docs/verify.verdict/V1`]: (call: Call) => saved("verify.verdict", "V1", call.body.content),
    });
    expect(host.textContent).not.toContain("「本行從未宣布每日提款上限」");
    expect(host.textContent).toContain("1 筆讀法是舊版的，不算");
    expect(host.textContent).toContain("你判的是這個主張的舊版");
    const verdicts = host.querySelector('[aria-label="採信、存疑或不採信"]')!;
    expect([...verdicts.querySelectorAll("button")].map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(labelled(host, "一句理由").value).toBe("");
    await click(byText(verdicts, "button", "採信"));
    await type(labelled(host, "一句理由"), "新版有兩個出處");
    await click(byText(host, "button", "存判定"));
    const [put] = calls.filter((call) => call.method === "PUT" && call.path === `${P}/docs/verify.verdict/V1`);
    expect(put.body).toEqual({ content: { claim: "C1", claim_version: 2, verdict: "採信", reason: "新版有兩個出處" }, base_version: 1 });
    await done();
  });

  it("editing the claim on the page clears the verdict I had picked for its old words", async () => {
    let version = 1;
    const claim = () => [doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" }, { version })];
    const verdict = doc("verify.verdict", "V1", { claim: "C1", claim_version: 1, verdict: "存疑", reason: "舊的理由" });
    const { host, done } = await open({
      [`GET ${P}/docs/verify.claim`]: () => claim(), [`GET ${P}/docs/verify.verdict`]: [verdict],
      [`${P}/verify/ledger`]: () => ({ claims: [{ ...LINE, version, verdict: { verdict: "存疑", reason: "舊的理由", earlier: version !== 1 } }], factcheck_asks: [], person_reads: [] }),
      [`PUT ${P}/docs/verify.claim/C1`]: (call: Call) => { version = 2; return saved("verify.claim", "C1", call.body.content); },
    });
    const pressed = () => [...host.querySelector('[aria-label="採信、存疑或不採信"]')!.querySelectorAll("button")].filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.textContent);
    expect(pressed()).toEqual(["存疑"]);   // judged for these words
    await click(byText(host, "button", "改主張"));
    await type(field(host, "claim-reason"), "原文是兩萬");
    await click(byText(host, "button", "存這個主張"));
    expect([pressed(), labelled(host, "一句理由").value]).toEqual([[], ""]);
    await done();
  });

  it("my stance read from the card's older page is not shown as my reading of it", async () => {
    const stance = doc("verify.stance", "S1", { claim: "C1", claim_version: 1, card: "K1", snapshot: "old-page", stance: "反對", quote: "本行從未宣布每日提款上限" });
    const { host, done } = await ledger({ stale: 1 }, { [`GET ${P}/docs/verify.stance`]: [stance] });
    expect(host.textContent).not.toContain("「本行從未宣布每日提款上限」");
    await done();
  });
});

describe("VERIFY: every record about a claim is read for one version (gate)", () => {
  it("only ofVersion and liveOf read records by claim id, and liveOf feeds only the edit props", () => {
    // A new reader filtering by claim id alone is how F3 came back after round 4 fixed readings and fact-checks: make it
    // go through ofVersion (shown) or, to edit the one live record, liveOf -- and say so here.
    const source = readFileSync(path.resolve(process.cwd(), "components/blocks/VerifyPage.tsx"), "utf8");
    expect(source.match(/content\.claim\s*===/g)).toHaveLength(2);   // the two helpers' bodies
    expect([...source.matchAll(/(\w+)=\{liveOf\(/g)].map((match) => match[1]).sort()).toEqual(["stances", "verdict"]);
    expect(source.match(/liveOf\(/g)).toHaveLength(2);   // those two props are its only calls
    const records = [doc("verify.stance", "A", { claim: "C1", claim_version: 1 }), doc("verify.stance", "B", { claim: "C1", claim_version: 2 }), doc("verify.stance", "C", { claim: "C2", claim_version: 2 })];
    expect([ofVersion(records, "C1", 2).map((item) => item.doc_id), liveOf(records, "C1").map((item) => item.doc_id)]).toEqual([["B"], ["A", "B"]]);
  });
});

describe("VERIFY helpers", () => {
  it("lists only the AI proposals and MAP claims not brought in yet, and keeps a law claim's details", () => {
    const claim = doc<Claim>("verify.claim", "C1", { text: "x", sentence: "可以查的事實", from: "訊息", message: "M1", proposal: "S1#0" });
    expect(pendingProposals(SPLIT, [claim]).map((item) => item.index)).toEqual([1]);
    const map = { claims: [{ id: "c1", text: "公會改了合約範本", kind: "事實" }, { id: "c2", text: "依民法", kind: "法律", jurisdiction: "台灣" }, { id: "c3", text: "不該這樣", kind: "價值" }] };
    expect(mapClaimsToBring(map, [doc<Claim>("verify.claim", "C2", { text: "公會改了合約範本", sentence: "可以查的事實", from: "MAP", map_claim: "c1" })]).map((item) => item.id)).toEqual(["c2"]);
    expect(claimFromMap(map.claims[1], "可以查的事實")).toEqual({ text: "依民法", sentence: "可以查的事實", from: "MAP", map_claim: "c2", law: true, jurisdiction: "台灣", limitation: "", law_source: "" });
  });

  it("keeps the latest AI reading per card for the claim's current version only", () => {
    const older = doc("verify.reading", "R1", { readings: [{ claim: "C1", claim_version: 1, card: "K1", snapshot: "s", reads_as: "支持" }, { claim: "C1", claim_version: 0, card: "K2", snapshot: "s", reads_as: "反對" }] });
    const newer = doc("verify.reading", "R2", { readings: [{ claim: "C1", claim_version: 1, card: "K1", snapshot: "s", reads_as: "看不出" }] });
    expect(readingsFor([older, newer], "C1", 1)).toEqual([{ claim: "C1", claim_version: 1, card: "K1", snapshot: "s", reads_as: "看不出", reading: "R2" }]);
  });
});
