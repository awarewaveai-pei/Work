import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { ActPage } from "./ActPage";
import { byText, click, doc, field, labelled, mount, saved, serve, shell, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const P = "/projects/P1";
const INTAKE = doc("assembler.intake", "I1", { purpose: "複雜決策", question: "要不要拆夥", package: "個人複雜決策", affected: ["合夥人"], blocks: ["DECIDE", "ACT", "LEARN"] });
const JUDGMENT = doc("decide.judgment", "J1", { uncertainty: "不知道", change_condition: "他願意寫進合約", confidence: 50, intensity_now: "中", next_step: "這週先跟他談一次條件" });
const TASK = doc("act.task", "T1", { title: "跟他談一次條件", prediction: "我猜他會讓步一半", due: "2026-10-20", status: "進行中", owner: "我" });
const posts = (calls: Call[], path: string) => calls.filter((call) => call.method !== "GET" && call.path === path);
const chip = (host: Element, group: string, text: string) => byText(host.querySelector(`[aria-label="${group}"]`)!, "button", text);
const area = (host: Element, label: string) => [...host.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))!.querySelector("textarea")!;

async function open(routes: Record<string, unknown> = {}) {
  const calls = serve({ ...shell(), [`GET ${P}/docs/assembler.intake`]: [INTAKE], [`GET ${P}/act/reminders`]: [], ...routes });
  const page = await mount(<ActPage projectId="P1" />);
  return { ...page, calls };
}

describe("ACT 行動與觀察", () => {
  it("shows what VERIFY checked and COMPUTE calculated before I write my prediction, and says a simulation is not a prediction", async () => {
    const claims = [{ claim_id: "C1", version: 1, text: "下週起每天只能領一萬元", sentence: "可以查的事實", law: false, state: "查不到", support: [], oppose: [], stale: 0, few: true, verdict: { verdict: "不採信", reason: "沒有官方出處", earlier: false } }];
    const calcs = [{ run_id: "R1", version: 1, at: "2026-10-04T01:00:00Z", label: "模擬結果", algorithm: { id: "computation.monte_carlo", version: "1", name: "蒙地卡羅" }, inputs: [], result: { range: { low: -2, high: 5, unit: "萬" } }, thin_inputs: ["月營收"], adopt: { adopt: "採用", reason: "範圍夠用" } }];
    const { host, done } = await open({ ["/projects/P1/evidence"]: { origins: [], changed_marks: [], claims, calcs, min_origins: 2 } });
    const text = host.textContent ?? "";
    expect(text).toContain("查不到：0 個出處支持、0 個反對（出處不到 2 個）；你判定「不採信」");
    expect(text).toContain("模擬結果（蒙地卡羅）：-2～5 萬；月營收的出處不到 2 個；你採用");
    expect(text).toContain("模擬不是預測");
    await done();
  });

  it("starts a task card from the judgment's one sentence; the prediction is required before it is saved", async () => {
    const { host, done, calls } = await open({ [`GET ${P}/docs/decide.judgment`]: [JUDGMENT], [`POST ${P}/docs/act.task`]: (call: Call) => saved("act.task", "T1", call.body.content) });
    expect(host.textContent).toContain("你在「判斷」寫的下一步：這週先跟他談一次條件");
    await click(byText(host, "button", "用這一句開任務卡"));
    expect(field(host, "task-title").value).toBe("這週先跟他談一次條件");
    const save = byText(host, "button", "存這張任務卡") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await type(field(host, "task-prediction"), "我猜他會讓步一半");
    await type(field(host, "task-stop"), "他再改一次就不談了");
    await click(chip(host, "第一個月之後的節奏", "季"));
    expect(save.disabled).toBe(false);
    await click(save);
    expect(posts(calls, `${P}/docs/act.task`)[0].body.content).toEqual({
      title: "這週先跟他談一次條件", from_next_step: "這週先跟他談一次條件", prediction: "我猜他會讓步一半", stop_condition: "他再改一次就不談了", long_rhythm: "季", status: "未開始",
    });
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("under the guardrail an action marked irreversible waits for my choice: wait, have it reviewed, or go ahead", async () => {
    const guardrail = doc("govern.guardrail", "G1", { guardrail: "wait_or_review", category: "金錢", found_by: "ACT" }, { author: "system" });
    const { host, done, calls } = await open({ [`GET ${P}/docs/govern.guardrail`]: [guardrail], [`POST ${P}/docs/act.task`]: (call: Call) => saved("act.task", "T1", call.body.content) });
    await type(field(host, "task-title"), "跟銀行借款");
    await type(field(host, "task-prediction"), "他們會核准一半");
    const save = byText(host, "button", "存這張任務卡") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await click(chip(host, "能不能反悔", "不能反悔"));
    expect(save.disabled).toBe(true);
    expect(host.textContent).toContain("請先等一下，或請人覆核");
    await click(chip(host, "先等一下或請人覆核", "我想過了，照做"));
    expect(save.disabled).toBe(false);
    await click(save);
    expect(posts(calls, `${P}/docs/act.task`)[0].body.content).toMatchObject({ irreversible: true, hold: "我想過了，照做" });
    await done();
  });

  it("a step marked irreversible offers the hold choice even with no guardrail yet; the server's refusal for high-risk words is said in plain words and can be answered", async () => {
    let refuse = true;
    const { host, done, calls } = await open({
      [`POST ${P}/docs/act.task`]: (call: Call) => { if (refuse && !call.body.content.hold) throw new ApiError(400, "ACT_HOLD_REQUIRED: this step cannot be undone and touches something high-risk"); return saved("act.task", "T1", call.body.content); },
    });
    await type(field(host, "task-title"), "跟銀行借款");
    await type(field(host, "task-prediction"), "他們會核准一半");
    expect(host.querySelector('[aria-label="先等一下或請人覆核"]')).toBeNull();   // an undoable step: no question
    await click(chip(host, "能不能反悔", "不能反悔"));
    expect(host.querySelector('[aria-label="先等一下或請人覆核"]')).not.toBeNull();
    expect((byText(host, "button", "存這張任務卡") as HTMLButtonElement).disabled).toBe(false);   // no guardrail the page knows of: the server decides
    await click(byText(host, "button", "存這張任務卡"));
    expect(host.querySelector(".error")?.textContent).toContain("先選「先等一下」、「請人覆核」，或「我想過了，照做」");
    expect(host.querySelector(".error")?.textContent).not.toMatch(/ACT_HOLD_REQUIRED|API/);
    refuse = false;
    await click(chip(host, "先等一下或請人覆核", "先等一下"));
    await click(byText(host, "button", "存這張任務卡"));
    expect(posts(calls, `${P}/docs/act.task`).at(-1)!.body.content).toMatchObject({ irreversible: true, hold: "先等一下" });
    await done();
  });

  it("an action that can be undone is never held, guardrail or not", async () => {
    const guardrail = doc("govern.guardrail", "G1", { guardrail: "wait_or_review", category: "金錢", found_by: "ACT" }, { author: "system" });
    const { host, done } = await open({ [`GET ${P}/docs/govern.guardrail`]: [guardrail] });
    await type(field(host, "task-title"), "約時間");
    await type(field(host, "task-prediction"), "他會回");
    await click(chip(host, "能不能反悔", "能反悔"));
    expect((byText(host, "button", "存這張任務卡") as HTMLButtonElement).disabled).toBe(false);
    await done();
  });

  it("a status button is one save; the history folds a run of quick flips and keeps every one to expand", async () => {
    const at = (minute: number) => `2026-10-03T08:0${minute}:00Z`;
    const versions = [doc("act.task", "T1", { ...TASK.content, status: undefined }, { version: 1, at: at(0) }), doc("act.task", "T1", { ...TASK.content, status: "進行中" }, { version: 2, at: at(1) }),
      doc("act.task", "T1", { ...TASK.content, status: "完成" }, { version: 3, at: at(2) }), doc("act.task", "T1", { ...TASK.content, status: "進行中" }, { version: 4, at: at(3) })];
    const { host, done, calls } = await open({
      [`GET ${P}/docs/act.task`]: [TASK], [`GET ${P}/docs/act.task/T1/versions`]: versions,
      [`PUT ${P}/docs/act.task/T1`]: (call: Call) => saved("act.task", "T1", call.body.content),
    });
    await click(chip(host, "狀態", "完成"));
    expect(posts(calls, `${P}/docs/act.task/T1`)[0].body).toMatchObject({ base_version: 1, content: { status: "完成", title: "跟他談一次條件" } });
    const details = host.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
    const lines = [...host.querySelectorAll(".tnote")].filter((line) => line.textContent?.includes("第"));
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain("第 4 版");
    expect(lines[0].textContent).toContain("中間還有 3 次很快的改動");
    await done();
  });

  it("a note has the four cells and up to five numbers; only what I wrote is sent", async () => {
    const { host, done, calls } = await open({ [`GET ${P}/docs/act.task`]: [TASK], [`POST ${P}/docs/act.note`]: (call: Call) => saved("act.note", "N1", call.body.content) });
    const save = byText(host, "button", "存這一筆") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await type(area(host, "實際狀況"), "他讓步了");
    await type(labelled(host, "數字 1 的名稱"), "價格");
    await type(labelled(host, "數字 1 的值"), "90");
    await type(labelled(host, "數字 1 的單位"), "萬");
    await click(save);
    expect(posts(calls, `${P}/docs/act.note`)[0].body.content).toEqual({ task: "T1", happened: "他讓步了", numbers: [{ name: "價格", value: 90, unit: "萬" }] });
    await done();
  });

  it("draws a trend only for a number written twice; one written once says so", async () => {
    const notes = [doc("act.note", "N1", { task: "T1", numbers: [{ name: "價格", value: 90, unit: "萬" }, { name: "訂單", value: 3 }] }, { at: "2026-10-08T08:00:00Z" }),
      doc("act.note", "N2", { task: "T1", numbers: [{ name: "價格", value: 80, unit: "萬" }] }, { at: "2026-10-15T08:00:00Z" })];
    const { host, done } = await open({ [`GET ${P}/docs/act.task`]: [TASK], [`GET ${P}/docs/act.note`]: notes });
    const figures = [...host.querySelectorAll("figure")];
    expect(figures).toHaveLength(2);
    const price = figures.find((item) => item.textContent?.includes("價格"))!;
    expect(price.querySelector("polyline")?.getAttribute("points")).toBeTruthy();
    expect(price.textContent).toContain("90萬 → 80萬");
    const orders = figures.find((item) => item.textContent?.includes("訂單"))!;
    expect(orders.querySelector("polyline")).toBeNull();
    expect(orders.textContent).toContain("只記了一次，還看不出趨勢");
    await done();
  });

  it("lists what I ticked on each task, who is affected and where my numbers went, made by the system with no AI button; an AI record saved before still shows", async () => {
    const task = { ...TASK, content: { ...TASK.content, irreversible: true, hold: "請人覆核" } };
    const notes = [doc("act.note", "N1", { task: "T1", numbers: [{ name: "價格", value: 90, unit: "萬" }, { name: "訂單", value: 3 }] }, { at: "2026-10-08T08:00:00Z" }),
      doc("act.note", "N2", { task: "T1", numbers: [{ name: "價格", value: 80, unit: "萬" }] }, { at: "2026-10-15T08:00:00Z" })];
    const oldFlag = doc("act.flag", "F1", { irreversible: ["跟他談一次條件：話說出口收不回"] }, { author: "ai", block: "ACT" });
    const { host, done, calls } = await open({ [`GET ${P}/docs/act.task`]: [task], [`GET ${P}/docs/act.note`]: notes, [`GET ${P}/docs/act.flag`]: [oldFlag] });
    const text = host.textContent ?? "";
    expect(text).toContain("系統整理的，不是 AI 寫的，不扣點");
    expect(text).toContain("跟他談一次條件：不能反悔；你選了「請人覆核」");
    expect(text).toContain("合夥人");
    expect(text).toContain("「跟他談一次條件」的「價格」：從 90萬 到 80萬，少了 10萬；2026-10-08 到 2026-10-15 記了 2 次。");
    expect(text).toContain("「跟他談一次條件」的「訂單」：只記了一次");
    expect(text).toContain("以前 AI 整理的");
    expect(text).toContain("話說出口收不回");
    expect([...host.querySelectorAll("button")].map((button) => button.textContent).filter((label) => /哪裡不能反悔|整理數字|趨勢/.test(label ?? ""))).toEqual([]);
    expect(calls.filter((call) => call.method !== "GET" && call.path.includes("/ai/"))).toEqual([]);
    await done();
  });

  it("shows what the engine says is due, and the rhythm of each task in words", async () => {
    const { host, done } = await open({
      [`GET ${P}/docs/act.task`]: [{ ...TASK, content: { ...TASK.content, long_rhythm: "年" } }],
      [`GET ${P}/act/reminders`]: [{ block: "ACT", kind: "note", since: "2026-10-08", text: "該記一筆觀察了：跟他談一次條件", scope: "case", path: `${P}/act` }],
    });
    expect(host.textContent).toContain("該記一筆觀察了：跟他談一次條件");
    expect(host.querySelector(`a[href="${P}/act"]`)).not.toBeNull();
    expect(host.textContent).toContain("前 4 週每週記一次，之後每年記一次。");
    await done();
  });

  it("the AI's split is the AI's, offered for me to pick; without the contract's permission the page says so", async () => {
    const split = doc("act.split", "S1", { options: [{ step: "先傳訊息約時間", why_small: "只是約", reversible: true, undo: "取消約" }, { step: "直接簽約", reversible: false }] }, { author: "ai", block: "ACT" });
    let granted = false;
    const { host, done } = await open({
      [`GET ${P}/docs/decide.judgment`]: [JUDGMENT],
      [`POST ${P}/ai/ACT/split`]: () => { if (!granted) throw new ApiError(403, "AI_PERMISSION_DENIED: 協作合約沒有准「提出選項」"); return { saved: split }; },
      [`GET ${P}/docs/act.split`]: () => (granted ? [split] : []),
    });
    await click(byText(host, "button", "請 AI 拆成更小、能反悔的步驟"));
    expect(host.querySelector(".error")?.textContent).toContain("協作合約沒有准 AI 做這件事");
    granted = true;
    await click(byText(host, "button", "請 AI 拆成更小、能反悔的步驟"));
    expect(host.textContent).toContain("AI 寫的");
    expect(host.textContent).toContain("取消約");
    expect(host.textContent).toContain("不能反悔");
    await click(byText(host, "button", "用這一步開任務卡"));
    expect(field(host, "task-title").value).toBe("先傳訊息約時間");
    await done();
  });

  it("a person who turns up at this step is written back to the intake, once", async () => {
    const { host, done, calls } = await open({ [`PUT ${P}/docs/assembler.intake/I1`]: (call: Call) => saved("assembler.intake", "I1", call.body.content) });
    await type(field(host, "more-person"), " 員工 ");
    await click(byText(host, "button", "補進開案資料"));
    expect(posts(calls, `${P}/docs/assembler.intake/I1`)[0].body).toMatchObject({ base_version: 1, content: { affected: ["合夥人", "員工"], question: "要不要拆夥" } });
    await done();
  });

  it("asks \"whose wish\" before acting, and names the public-issue steps for a public issue", async () => {
    const { host, done } = await open({ [`GET ${P}/docs/assembler.intake`]: [doc("assembler.intake", "I1", { ...INTAKE.content, purpose: "公共議題判斷", package: "公共議題判斷" })] });
    expect(host.textContent).toContain("這正好是誰希望我做的");
    expect(host.textContent).toContain("投票、發言、連署、不轉傳");
    await done();
  });
});
