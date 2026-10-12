import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import { ASKED, PRE_CHECKS, STOP_QUESTIONS } from "../../lib/decide";
import { DecidePage } from "./DecidePage";
import { byText, click, doc, field, mount, saved, serve, shell, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const P = "/projects/P1";
const INTAKE = doc("assembler.intake", "I1", { purpose: "複雜決策", question: "要不要拆夥", package: "個人複雜決策", affected: ["合夥人"], blocks: ["SENSE", "MAP", "DECIDE", "ACT", "LEARN"] });
const LEAN = { uncertainty: "不知道他的成本", change_condition: "他願意寫進合約", confidence: 50, intensity_now: "中", deciders: "我", affected: ["合夥人"] };
const JUDGMENT = doc("decide.judgment", "J1", LEAN);
const posts = (calls: Call[], path: string) => calls.filter((call) => call.method !== "GET" && call.path === path);
const chip = (host: Element, group: string, text: string) => byText(host.querySelector(`[aria-label="${group}"]`)!, "button", text);

async function open(routes: Record<string, unknown> = {}) {
  const calls = serve({ ...shell(), [`GET ${P}/docs/assembler.intake`]: [INTAKE], ...routes });
  const page = await mount(<DecidePage projectId="P1" />);
  return { ...page, calls };
}

describe("DECIDE 判斷", () => {
  it("shows every cell, the four stop questions, the four checks and the eight the system asks about; no dropdown", async () => {
    const { host, done } = await open();
    const text = host.textContent ?? "";
    for (const item of STOP_QUESTIONS) expect(text).toContain(item.question);
    for (const item of PRE_CHECKS) expect(text).toContain(item.question);
    for (const item of ASKED) expect(host.querySelector(`[aria-label="${item.who}有沒有影響"]`)).not.toBeNull();
    expect(host.querySelector("select")).toBeNull();
    expect(text).toContain("AI 只檢查你寫得清不清楚");
    await done();
  });

  it("will not save until the intensity and the three required cells are filled; then saves what the system listed apart from what I added", async () => {
    const { host, done, calls } = await open({ [`POST ${P}/docs/decide.judgment`]: (call: Call) => saved("decide.judgment", "J1", call.body.content) });
    const save = () => byText(host, "button", "存這一版") as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    await click(chip(host, "現在的強度", "中"));
    await type(field(host, "uncertainty"), "不知道他的成本");
    await type(field(host, "change"), "他願意寫進合約");
    expect(save().disabled).toBe(true);   // still no confidence
    await type(field(host, "confidence"), "50");
    expect(save().disabled).toBe(false);
    await click(chip(host, "家庭有沒有影響", "有"));
    await type(host.querySelector<HTMLInputElement>('[aria-label="家庭怎麼影響"]')!, "媽媽很擔心");
    await type(field(host, "added"), "同學的意見\n\n某個群組");
    await click(save());
    const [call] = posts(calls, `${P}/docs/decide.judgment`);
    const content = call.body.content;
    expect(content).toMatchObject({ uncertainty: "不知道他的成本", change_condition: "他願意寫進合約", confidence: 50, intensity_now: "中", affected: ["合夥人"], influences_added: ["同學的意見", "某個群組"] });
    expect(content.influences_asked).toEqual([{ who: "家庭", answer: "有", note: "媽媽很擔心" }]);
    expect(content.influences_listed.map((item: { kind: string }) => item.kind)).toEqual(["ai", "platform"]);   // listed by the system, kept apart from influences_added
    expect(content).not.toHaveProperty("revision_reason");
    expect(content).not.toHaveProperty("conclusion");   // nothing is filled in for the person
    await done();
  });

  it("says 這次沒做查證／計算 only when nothing was checked or calculated; then shows the results and brings a checked fact in", async () => {
    const empty = await open();
    expect(empty.host.textContent).toContain("這次沒做查證");
    expect(empty.host.textContent).toContain("這次沒做計算");
    await empty.done();
    const claims = [
      { claim_id: "C1", version: 1, text: "公會 2019 年改了範本", sentence: "可以查的事實", law: false, state: "有獨立出處支持", support: ["o:a", "o:b"], oppose: [], stale: 0, few: false, verdict: { verdict: "採信", reason: "兩個出處", earlier: false }, usable: true },
      { claim_id: "C2", version: 1, text: "同業都這樣改", sentence: "可以查的事實", law: false, state: "查不到", support: [], oppose: [], stale: 0, few: true, verdict: { verdict: "不採信", reason: "沒有出處", earlier: false }, usable: false },
    ];
    const calcs = [{ run_id: "R1", version: 1, at: "2026-10-04T01:00:00Z", label: "計算結果", algorithm: { id: "feasibility.break_even", version: "1", name: "損益平衡" }, inputs: [], result: { range: { low: 4, high: 6, unit: "件／月" } }, thin_inputs: [], adopt: null }];
    const { host, done } = await open({ [`${P}/evidence`]: { origins: [], changed_marks: [], claims, calcs, min_origins: 2 } });
    const text = host.textContent ?? "";
    expect(text).not.toContain("這次沒做查證");
    expect(text).not.toContain("這次沒做計算");
    expect(text).toContain("有獨立出處支持：2 個出處支持、0 個反對；你判定「採信」");
    expect(text).toContain("計算結果（損益平衡）：4～6 件／月");
    await click(byText(host, "button", "把查過的主張帶進來"));
    expect((host.querySelector('[aria-label="事實 1"]') as HTMLInputElement).value).toBe("公會 2019 年改了範本");   // 不採信 is not offered as a fact
    expect(host.querySelector('[aria-label="事實 2"]')).toBeNull();
    expect(host.textContent).toContain("2 個獨立出處");
    await done();
  });

  it("brings a linked map fact in with the count the server gives now, not the one the map stored", async () => {
    const origin = (id: string, card: string, counts: boolean) => ({ origin_id: id, how: "單獨", pending: false, aside: false, counts, mark: null,
      cards: [{ card, version: 1, source_id: card, url: "https://x.example", title: card, aside: "", found_by: { by: "系統找的" }, cells: {}, mine: {} }] });
    const map = doc("map.map", "M1", { layers: { facts: [{ text: "公會 2019 年改了範本", sources: 2, self_said: false, cards: ["k1", "k2"] }] } });
    const { host, done } = await open({ [`GET ${P}/docs/map.map`]: [map], [`${P}/evidence`]: { origins: [origin("o:1", "k1", true), origin("o:2", "k2", false)], changed_marks: [], claims: [], calcs: [], min_origins: 2 } });
    await click(byText(host, "button", "把地圖上的事實帶進來"));
    expect(host.textContent).toContain("只靠 1 個出處");
    expect(host.textContent).toContain("「公會 2019 年改了範本」：只靠 1 個出處");   // the influence list reads the same live count
    await done();
  });

  it("a map fact already on the card says when its sources changed, and loses its count when I change its words", async () => {
    const origin = (id: string, card: string, counts: boolean) => ({ origin_id: id, how: "單獨", pending: false, aside: false, counts, mark: null,
      cards: [{ card, version: 1, source_id: card, url: "https://x.example", title: card, aside: "", found_by: { by: "系統找的" }, cells: {}, mine: {} }] });
    const held = { ...JUDGMENT, content: { ...LEAN, facts: [{ text: "公會 2019 年改了範本", sources: 2, self_said: false, cards: ["k1", "k2"] }] } };
    const { host, done } = await open({ [`GET ${P}/docs/decide.judgment`]: [held], [`${P}/evidence`]: { origins: [origin("o:1", "k1", true), origin("o:2", "k2", false)], changed_marks: [], claims: [], calcs: [], min_origins: 2 } });
    expect(host.textContent).toContain("出處數變了：現在 1 個獨立出處");
    expect(host.textContent).toContain("「公會 2019 年改了範本」：只靠 1 個出處");   // the influence list reads it as it is now, before any refresh
    await click(byText(host, "button", "照現在的出處數更新"));
    expect(host.textContent).toContain("只靠 1 個出處");
    await type(host.querySelector('[aria-label="事實 1"]') as HTMLInputElement, "公會改過範本吧");
    expect(host.textContent).toContain("我自己說的，還沒有外部出處");
    await done();
  });

  it("keeps 這次沒做查證 while VERIFY has only listed sentences nobody looked for", async () => {
    const listed = [{ claim_id: "C1", version: 1, text: "同業都這樣改", sentence: "可以查的事實", law: false, state: "還沒查", support: [], oppose: [], stale: 0, few: true, verdict: null, usable: false }];
    const { host, done } = await open({ [`${P}/evidence`]: { origins: [], changed_marks: [], claims: listed, calcs: [], min_origins: 2 } });
    expect(host.textContent).toContain("這次沒做查證");
    expect(host.textContent).not.toContain("你在「查證主張」查過的");
    await done();
  });

  it("a fact brought from VERIFY says when the ledger changed, carries its opposition, and becomes my own say when I change its words", async () => {
    const now = { claim_id: "C1", version: 2, text: "公會 2019 年改了範本", sentence: "可以查的事實", law: false, state: "兩邊都有", support: ["o:a", "o:b"], oppose: ["o:c"], stale: 0, few: false, verdict: { verdict: "存疑", reason: "有人反對", earlier: false }, usable: true };
    const held = { ...JUDGMENT, content: { ...LEAN, facts: [{ text: "公會 2019 年改了範本", sources: 2, self_said: false, claim: "C1", claim_version: 1 }] } };
    const { host, done } = await open({ [`GET ${P}/docs/decide.judgment`]: [held], [`${P}/evidence`]: { origins: [], changed_marks: [], claims: [now], calcs: [], min_origins: 2 } });
    expect(host.textContent).toContain("查證結果變了：這個主張在查證那一步改過了");
    await click(byText(host, "button", "照現在的查證結果更新"));
    expect(host.textContent).toContain("2 個獨立出處支持、1 個反對");   // the opposition is on the card, as a warning
    expect(host.textContent).not.toContain("查證結果變了");
    await type(host.querySelector('[aria-label="事實 1"]') as HTMLInputElement, "公會改了範本，我記得是 2019");
    expect(host.textContent).toContain("我自己說的，還沒有外部出處");   // my words now: the claim's count does not stay with them
    await done();
  });

  it("flags 「沒有」 as 這一版不打算改 and accepts it", async () => {
    const { host, done } = await open();
    const flagged = () => host.querySelector("p.warn")?.textContent ?? "";
    expect(flagged()).not.toContain("這一版不打算改");
    await type(field(host, "change"), "沒有");
    expect(flagged()).toContain("這一版不打算改");
    await type(field(host, "change"), "沒有，除非他道歉");
    expect(flagged()).not.toContain("這一版不打算改");
    await done();
  });

  it("a new version needs its reason, and a person added on the card is written back to the intake", async () => {
    const { host, done, calls } = await open({
      [`GET ${P}/docs/decide.judgment`]: [JUDGMENT],
      [`PUT ${P}/docs/decide.judgment/J1`]: (call: Call) => saved("decide.judgment", "J1", call.body.content),
      [`PUT ${P}/docs/assembler.intake/I1`]: (call: Call) => saved("assembler.intake", "I1", call.body.content),
    });
    const save = () => byText(host, "button", "存成第 2 版") as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    expect(host.textContent).toContain("出新的一版，要寫這一版為什麼改");
    await type(field(host, "affected"), "合夥人\n員工");
    await type(field(host, "reason"), "他回信了");
    await click(save());
    const [update] = posts(calls, `${P}/docs/decide.judgment/J1`);
    expect(update.body).toMatchObject({ base_version: 1, content: { revision_reason: "他回信了", affected: ["合夥人", "員工"] } });
    const [intake] = posts(calls, `${P}/docs/assembler.intake/I1`);
    expect(intake.body.content.affected).toEqual(["合夥人", "員工"]);
    expect(intake.body.content.question).toBe("要不要拆夥");   // the rest of the intake is carried as it was
    await done();
  });

  it("「現在我要自己下結論」 seals the version being written and turns the AI check off", async () => {
    const seals: unknown[] = [];
    const { host, done, calls } = await open({
      [`GET ${P}/docs/decide.judgment`]: [JUDGMENT],
      [`GET ${P}/docs/decide.seal`]: () => seals,
      [`POST ${P}/docs/decide.seal`]: (call: Call) => { const made = saved("decide.seal", "S1", call.body.content); seals.push(made); return made; },
    });
    const check = () => byText(host, "button", "請 AI 檢查") as HTMLButtonElement;
    expect(check().disabled).toBe(false);
    await click(byText(host, "button", "現在我要自己下結論"));
    expect(posts(calls, `${P}/docs/decide.seal`)[0].body).toEqual({ content: { for_version: 2 } });
    expect(check().disabled).toBe(true);
    expect(host.textContent).toContain("這一版 AI 不再給新答案");
    await done();
  });

  it("with no judgment saved yet the AI cannot be asked", async () => {
    const { host, done } = await open();
    expect((byText(host, "button", "請 AI 檢查") as HTMLButtonElement).disabled).toBe(true);
    await done();
  });

  it("a game marked unsolvable lists 退出、止損、換目標 and one click adds it to the options", async () => {
    const map = doc("map.map", "M1", { unwinnable: true, method: "冰山模型", layers: { facts: [] } });
    const { host, done } = await open({ [`GET ${P}/docs/map.map`]: [map] });
    expect(host.textContent).toContain("你在「拆解」把這個局標成解不了");
    await click(chip(host, "解不了的局的出路", "止損"));
    expect(field(host, "options").value).toBe("止損");
    await click(chip(host, "解不了的局的出路", "止損"));
    await click(chip(host, "解不了的局的出路", "退出"));
    expect(field(host, "options").value).toBe("止損\n退出");   // each once
    await done();
  });

  it("shows my intensity from 外化 and nothing of its cards; only a card that is on the map is read, and only a voice", async () => {
    const map = doc("map.map", "M1", { method: "冰山模型", layers: { interests: [{ id: "a", text: "他怕賠錢", card: "c2" }] } });
    const { host, done } = await open({
      [`GET ${P}/docs/sense.state`]: [doc("sense.state", "S1", { emotion: "憤怒", intensity: "強" })],
      [`GET ${P}/docs/sense.card`]: [doc("sense.card", "c1", { category: "恐懼", text: "我怕被騙" }), doc("sense.card", "c2", { category: "別人的聲音", text: "朋友說他不可靠", from_whom: "同學" }), doc("sense.card", "c3", { category: "別人的聲音", text: "網路上有人說要退出" })],
      [`GET ${P}/docs/map.map`]: [map],
    });
    const text = host.textContent ?? "";
    expect(text).toContain("你在「外化」標的強度是：強");
    expect(text).not.toContain("憤怒");
    expect(text).not.toContain("我怕被騙");
    expect(text).not.toContain("網路上有人說要退出");   // a voice, but not on the map
    expect(text).toContain("別人的聲音：「朋友說他不可靠」（來自：同學）");
    expect(text).toContain("這次用的拆法：冰山模型");
    await done();
  });

  it("advises deferring the irreversible when I say 強, and lists the facilitator only when the case has one", async () => {
    const { host, done } = await open({ [`GET ${P}/docs/assembler.intake`]: [doc("assembler.intake", "I1", { ...INTAKE.content, blocks: ["DECIDE", "FACILITATE"] })] });
    expect(host.textContent).toContain("帶領：有人帶這個案子");
    expect(host.textContent).not.toContain("建議把不能反悔的決定延後");
    await click(chip(host, "現在的強度", "強"));
    expect(host.textContent).toContain("建議把不能反悔的決定延後");
    await done();
  });

  it("the AI's check carries its author; what cannot be undone is mine to confirm, and under the guardrail I must wait or ask for a review first", async () => {
    const check = doc("decide.check", "K1", { reversibility: ["退出：簽了就退不回"], gaps: ["替代假設"], question: "你最怕什麼？" }, { author: "ai", block: "DECIDE" });
    const { host, done, calls } = await open({
      [`GET ${P}/docs/decide.judgment`]: [JUDGMENT], [`GET ${P}/docs/decide.check`]: [check],
      [`GET ${P}/docs/govern.guardrail`]: [doc("govern.guardrail", "G1", { guardrail: "wait_or_review", category: "法律", found_by: "DECIDE" }, { author: "system" })],
      [`POST ${P}/docs/decide.review`]: (call: Call) => saved("decide.review", "R1", call.body.content),
    });
    expect(host.textContent).toContain("AI 寫的");
    expect(host.textContent).toContain("退出：簽了就退不回");
    const confirm = () => byText(host, "button", "存我的確認") as HTMLButtonElement;
    await click(host.querySelector('input[type="checkbox"]'));
    expect(host.textContent).toContain("請先等一下，或請人覆核");
    expect(confirm().disabled).toBe(true);
    await click(chip(host, "先等一下或請人覆核", "請人覆核"));
    await type(host.querySelector<HTMLInputElement>('[aria-label="請誰覆核"]')!, "律師朋友");
    expect(confirm().disabled).toBe(false);
    await click(confirm());
    expect(posts(calls, `${P}/docs/decide.review`)[0].body.content).toEqual({ check: "K1", version: 1, irreversible: ["退出：簽了就退不回"], hold: "請人覆核", reviewer: "律師朋友" });
    await done();
  });

  it("without the guardrail the confirmation needs no hold", async () => {
    const check = doc("decide.check", "K1", { reversibility: ["退出：簽了就退不回"] }, { author: "ai", block: "DECIDE" });
    const { host, done } = await open({ [`GET ${P}/docs/decide.judgment`]: [JUDGMENT], [`GET ${P}/docs/decide.check`]: [check] });
    await click(host.querySelector('input[type="checkbox"]'));
    expect(host.textContent).not.toContain("請先等一下，或請人覆核");
    expect((byText(host, "button", "存我的確認") as HTMLButtonElement).disabled).toBe(false);
    await done();
  });

  it("reads every version and lines two of them up, marking what changed", async () => {
    const v1 = doc("decide.judgment", "J1", { ...LEAN, conclusion: "先談一次" });
    const v2 = doc("decide.judgment", "J1", { ...LEAN, conclusion: "先談一次", confidence: 40, revision_reason: "他回信了" }, { version: 2 });
    const { host, done } = await open({ [`GET ${P}/docs/decide.judgment`]: [v2], [`GET ${P}/docs/decide.judgment/J1/versions`]: [v1, v2] });
    expect(host.textContent).toContain("兩個版本並排看");
    const rows = [...host.querySelectorAll("tbody tr")].map((row) => row.textContent);
    expect(rows.find((row) => row?.startsWith("信心"))).toContain("（改了）");
    expect(rows.find((row) => row?.startsWith("暫定結論"))).not.toContain("（改了）");
    await done();
  });

  it("「現在先不決定」 is a record I can take back", async () => {
    const pauses: unknown[] = [];
    const { host, done, calls } = await open({
      [`GET ${P}/docs/decide.pause`]: () => pauses,
      [`POST ${P}/docs/decide.pause`]: (call: Call) => { const made = saved("decide.pause", "Z1", call.body.content); pauses.push(made); return made; },
      [`DELETE ${P}/docs/decide.pause/Z1`]: () => { pauses.length = 0; return { status: "deleted" }; },
    });
    await type(field(host, "pause-why"), "還在等他回信");
    await click(byText(host, "button", "現在先不決定"));
    expect(posts(calls, `${P}/docs/decide.pause`)[0].body).toEqual({ content: { why: "還在等他回信" } });
    expect(host.textContent).toContain("你選了「現在先不決定」");
    await click(byText(host, "button", "撤回，繼續寫"));
    expect(host.textContent).not.toContain("你選了「現在先不決定」");
    expect(apiFetch).toHaveBeenCalled();
    await done();
  });
});

describe("DECIDE 判斷：第一次來的人先看到六樣（走查 2026-10-11 B2、B3、A8）", () => {
  it("keeps the intensity, the conclusion, the three required cells and the next step out of any fold; folds the rest under named lines", async () => {
    const { host, done } = await open();
    for (const id of ["conclusion", "uncertainty", "change", "confidence", "next"]) expect(field(host, id).closest("details"), id).toBeNull();
    expect(host.querySelector('[aria-label="現在的強度"]')?.closest("details")).toBeNull();
    const folds = [...host.querySelectorAll("details.dir > summary")].map((summary) => summary.textContent);
    expect(folds).toEqual([
      expect.stringContaining("這次可能在影響你的"), expect.stringContaining("依據：問題怎麼定義"), expect.stringContaining("選項"),
      expect.stringContaining("什麼時候停止分析？四題（4 格"), expect.stringContaining("下決定前，先問自己四題（4 格"), expect.stringContaining("誰有決定權、誰會受影響"),
    ]);
    for (const id of ["problem", "assumptions", "alt", "criteria", "options", "deciders"]) expect(field(host, id).closest("details.dir"), id).not.toBeNull();
    await done();
  });

  it("puts each of the four checks' war example behind 看例子 and names where the questions come from", async () => {
    const { host, done } = await open();
    const examples = [...host.querySelectorAll("details")].filter((item) => item.querySelector("summary")?.textContent === "看例子");
    expect(examples.map((item) => item.querySelector(".hint")?.textContent)).toEqual(PRE_CHECKS.map((item) => item.example));
    expect(examples.every((item) => !item.open)).toBe(true);
    expect(host.textContent).toContain("這四題來自 Theo Farrell 談英國在阿富汗作戰的講稿");
    await done();
  });

  it("shows the server's refusal under the save button, not at the end of the page", async () => {
    const { host, done } = await open({ [`POST ${P}/docs/decide.judgment`]: () => { throw new ApiError(400, "DOC_FIELD_REQUIRED: uncertainty"); } });
    await click(chip(host, "現在的強度", "中"));
    await type(field(host, "uncertainty"), "不知道");
    await type(field(host, "change"), "沒有");
    await type(field(host, "confidence"), "50");
    const save = byText(host, "button", "存這一版")!;
    await click(save);
    const alert = save.closest(".btns")!.nextElementSibling;
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toBe("還有必填的格子沒填。");
    await done();
  });
});
