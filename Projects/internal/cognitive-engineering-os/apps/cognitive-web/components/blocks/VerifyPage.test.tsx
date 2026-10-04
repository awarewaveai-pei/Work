import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerifyPage, claimFromMap, mapClaimsToBring, pendingProposals, readingsFor, sentTo, type Claim, type Split } from "./VerifyPage";
import { byText, click, doc, labelled, mount, saved, serve, shell, type, type Call } from "./JudgmentTestKit";

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

  it("under two origins the summary hands back with the count, and going on is my choice", async () => {
    let asked = 0;
    const { host, done, calls } = await open({
      [`GET ${P}/docs/verify.claim`]: [doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" })], [`${P}/verify/ledger`]: { claims: [LINE], factcheck_asks: ["cofacts", "claimreview"], person_reads: [] },
      [`POST ${P}/ai/VERIFY/summary`]: () => (asked++ === 0 ? { handback: "有 1 個主張的獨立出處不到 2 個（各是 1 個）。AI 先停下來，由你決定要不要照樣請它摘要。" } : { saved: {} }),
    });
    expect(host.textContent).toContain("只有一個出處這樣說");
    await click(byText(host, "button", "請 AI 摘要"));
    expect(host.textContent).toContain("各是 1 個");
    await click(byText(host, "button", "照樣請 AI 摘要"));
    expect(posts(calls, `${P}/ai/VERIFY/summary`).map((call) => call.body.context)).toEqual([{}, { go_on: true }]);
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

describe("VERIFY ledger lines", () => {
  const CARD = { card: "K1", title: "央行新聞稿", source_id: "s1", snapshot: { sha256: "h1" } };
  const ledger = (line: Record<string, unknown>, routes: Record<string, unknown> = {}) => open({
    [`GET ${P}/docs/verify.claim`]: [doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" }, { version: (line.version as number) ?? 1 })],
    [`${P}/verify/ledger`]: { claims: [{ ...LINE, ...line }], factcheck_asks: ["claimreview"], person_reads: (line.person_reads as string[]) ?? [] }, [`${P}/evidence`]: { origins: [{ origin_id: "o:1", cards: [CARD] }] }, ...routes,
  });

  it("says what one origin says with the server's one rule, never a support line for an opposing origin", async () => {
    const { host, done } = await ledger({ support: [], oppose: ["o:1"], weak_line: "只有一個出處說不是這樣" });
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
