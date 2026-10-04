import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VerifyPage, claimFromMap, mapClaimsToBring, pendingProposals, readingsFor, type Claim, type Split } from "./VerifyPage";
import { byText, click, doc, labelled, mount, saved, serve, shell, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const P = "/projects/P1";
const MESSAGE = "【緊急】央行宣布下週起每天只能領一萬元！不轉就來不及，快轉給家人！";
const SPEC = {
  forms: ["訊息", "截圖文字", "連結"], sentence_kinds: ["可以查的事實", "對事實的解釋", "價值判斷", "叫你去做的事"], checkable: "可以查的事實", stances: ["支持", "反對", "無關", "看不出"],
  verdicts: ["採信", "存疑", "不採信"], asks: ["轉傳"], spread: [{ key: "spread", question: "這則訊息怎麼傳開" }], check_questions: ["量是自然的嗎？"], angles: ["primary", "news"], min_origins: 2,
  law_unconfirmed: "未確認", techniques: { title: "操弄手法清單", version: "1", maintainer: "平台", items: [] },
  factcheck_dbs: { title: "查核資料庫名單", version: "2", maintainer: "平台", dbs: { cofacts: { name: "Cofacts 真的假的", by: "志工" }, claimreview: { name: "全球查核結果公開資料檔", by: "各查核組織" } } },
};
const MSG = doc("verify.message", "M1", { text: MESSAGE, form: "訊息", sha256: "a".repeat(64) });
const FIRST = doc("verify.first", "F1", { message: "M1", reaction: "有點慌", confidence: 60 });
const SPLIT = doc<Split>("verify.split", "S1", { message: "M1", claims: [{ text: "央行宣布下週起每天只能領一萬元", sentence: "可以查的事實" }, { text: "快轉給家人", sentence: "叫你去做的事" }] }, { author: "ai" });
const LINE = {
  claim_id: "C1", version: 1, text: "央行宣布下週起每天只能領一萬元", sentence: "可以查的事實", law: false, state: "有獨立出處支持", support: ["o:1"], oppose: [], stale: 0, few: true, verdict: null,
  message: "M1", from: "訊息", law_state: null, needs_alternative: false, earlier: [], three: { found: true, independent: 1, independent_enough: false, stands: [] }, search: null, lookup: null,
};
const posts = (calls: Call[], path: string) => calls.filter((call) => call.method !== "GET" && call.path === path);

async function open(routes: Record<string, unknown> = {}) {
  const calls = serve({ ...shell(), "/blocks/verify/spec": SPEC, [`${P}/evidence`]: { origins: [] }, [`${P}/verify/ledger`]: { claims: [] }, ...routes });
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
      [`GET ${P}/docs/verify.claim`]: [doc<Claim>("verify.claim", "C1", { text: LINE.text, sentence: LINE.sentence, from: "訊息", message: "M1" })], [`${P}/verify/ledger`]: { claims: [LINE] },
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
      { db: "cofacts", state: "查到", attribution: "資料來自 Cofacts 真的假的（cofacts.tw），以 CC BY-SA 4.0 授權。", hits: [{ source_id: "s1", publisher: "Cofacts 志工", judged_as: "含有不實訊息", date: "2026-09-30", url: "https://cofacts.tw/article/a1", local: true }] },
      { db: "claimreview", state: "無法檢查", why: "蒐集器這次沒有回應", attribution: "", hits: [] }] }, { author: "system" });
    const { host, done } = await open({ [`GET ${P}/docs/verify.message`]: [MSG], [`GET ${P}/docs/verify.first`]: [FIRST], [`GET ${P}/docs/verify.factcheck`]: [result] });
    const text = host.textContent ?? "";
    expect(text).toContain("誰判的：Cofacts 志工（當地）；判定：含有不實訊息");
    expect(text).toContain("不是平台的結論");
    expect(text).toContain("CC BY-SA 4.0");
    expect(text).toContain("全球查核結果公開資料檔：無法檢查（蒐集器這次沒有回應）");
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
