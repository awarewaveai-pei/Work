import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { LearnPage } from "./LearnPage";
import { byText, click, doc, field, labelled, mount, saved, serve, shell, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const P = "/projects/P1";
const INTAKE = doc("assembler.intake", "I1", { purpose: "複雜決策", question: "要不要拆夥", package: "個人複雜決策", done_when: "他願意簽新合約", blocks: ["DECIDE", "ACT", "LEARN"] });
const V1 = doc("decide.judgment", "J1", { conclusion: "先談一次", uncertainty: "不知道", change_condition: "沒有", confidence: 60, intensity_now: "強", next_step: "先談" });
const V2 = doc("decide.judgment", "J1", { conclusion: "先談兩次", uncertainty: "不知道", change_condition: "他願意寫進合約", confidence: 40, intensity_now: "中" }, { version: 2 });
const TASK = doc("act.task", "T1", { title: "跟他談", prediction: "我猜他會讓步一半", status: "進行中" });
const NOTE = doc("act.note", "N1", { task: "T1", happened: "他下個月又改條件", numbers: [{ name: "價格", value: 90, unit: "萬" }] });
const posts = (calls: Call[], path: string) => calls.filter((call) => call.method !== "GET" && call.path === path);
const chip = (host: Element, group: string, text: string) => byText(host.querySelector(`[aria-label="${group}"]`)!, "button", text);

async function open(routes: Record<string, unknown> = {}, intake = INTAKE) {
  const calls = serve({
    ...shell(), [`GET ${P}/docs/assembler.intake`]: [intake], [`GET ${P}/learn/moves`]: { moves: [] }, [`GET ${P}/learn/unused_blocks`]: { unused: [] }, "/me/learn/patterns": { hints: [] }, [`GET ${P}/act/reminders`]: [],
    [`GET ${P}/docs/decide.judgment`]: [V2], [`GET ${P}/docs/decide.judgment/J1/versions`]: [V1, V2], ...routes,
  });
  const page = await mount(<LearnPage projectId="P1" />);
  return { ...page, calls };
}

describe("LEARN 回顧校準", () => {
  it("puts the earlier judgment, the prediction and what happened side by side, and flags a 「沒有」 for the version chosen", async () => {
    const { host, done } = await open({ [`GET ${P}/docs/act.task`]: [TASK], [`GET ${P}/docs/act.note`]: [NOTE] });
    let text = host.textContent ?? "";
    expect(text).toContain("先談兩次");
    expect(text).toContain("信心 40%");
    expect(text).toContain("我猜他會讓步一半");
    expect(text).toContain("他下個月又改條件");
    expect(text).toContain("價格 90萬");
    expect(text).toContain("他願意簽新合約");   // the completion condition written at intake
    expect(host.querySelector(".tags")?.textContent ?? "").not.toContain("這一版不打算改");
    await click(chip(host, "回顧哪一版", "第 1 版"));
    text = host.textContent ?? "";
    expect(text).toContain("先談一次");
    expect(text).toContain("信心 60%");
    expect(text).toContain("這一版不打算改");
    await done();
  });

  it("will not save before I write what happened; then keeps process apart from luck, flags a wrong source and writes only what I filled", async () => {
    const { host, done, calls } = await open({
      [`POST ${P}/docs/learn.calibration`]: (call: Call) => saved("learn.calibration", "C1", call.body.content),
      [`POST ${P}/learn/history`]: { entry: {}, hints: [] },
      [`GET ${P}/learn/unused_blocks`]: { unused: [{ code: "GATHER", open: false }, { code: "COMPUTE", open: false }, { code: "TEACH", open: false }] },
    });
    const save = () => byText(host, "button", "存這次回顧") as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    await type(field(host, "outcome"), "他下個月又改條件");
    expect(save().disabled).toBe(false);
    await click(chip(host, "預測對上了嗎", "部分對上"));
    await type(field(host, "process"), "我先寫下了預測");
    await type(field(host, "luck"), "他剛好心情好");
    await type(field(host, "check-measured_right"), "我只看價格");
    await type(field(host, "trust-context"), "它不知道我們的交情");
    await type(labelled(host, "錯的出處 1"), "同業群組的說法");
    await type(labelled(host, "錯的出處 1 為什麼"), "後來查到是舊價格");
    await click(chip(host, "維持、出新版，還是換方法", "出新版判斷"));
    await type(field(host, "updated"), "如果他再改一次就退出");
    await click(chip(host, "下一輪要加的積木", "蒐集來源（第 2 步開）"));
    await click(save());
    const [call] = posts(calls, `${P}/docs/learn.calibration`);
    expect(call.body.content).toEqual({
      judgment_version: 2, outcome: "他下個月又改條件", prediction_result: "部分對上", process: "我先寫下了預測", luck: "他剛好心情好", review_checks: { measured_right: "我只看價格" },
      trust: { context: "它不知道我們的交情" }, wrong_sources: [{ source: "同業群組的說法", why: "後來查到是舊價格" }], decision: "出新版判斷", updated_conditions: "如果他再改一次就退出", next_blocks: ["GATHER"],
    });
    expect(posts(calls, `${P}/learn/history`)).toHaveLength(1);   // the case's line in my own history, written by the platform
    await done();
  });

  it("an unused block is chosen by a button that can be taken back; a block not open yet says which step opens it", async () => {
    const { host, done } = await open({ [`GET ${P}/learn/unused_blocks`]: { unused: [{ code: "ACT", open: true }, { code: "COMPUTE", open: false }] } });
    const group = host.querySelector('[aria-label="下一輪要加的積木"]')!;
    expect(group.textContent).toContain("計算與模擬（第 2 步開）");
    expect(byText(group, "button", "行動與觀察")).toBeDefined();   // open: no step shown
    await click(byText(group, "button", "行動與觀察"));
    expect(byText(group, "button", "行動與觀察")!.getAttribute("aria-pressed")).toBe("true");
    await click(byText(group, "button", "行動與觀察"));
    expect(byText(group, "button", "行動與觀察")!.getAttribute("aria-pressed")).toBe("false");
    await done();
  });

  it("lists what the AI said with its author and whether I took it; a rejected offer shows only my decision", async () => {
    const check = doc("decide.check", "K1", { reversibility: ["退出：簽了就退不回"] }, { author: "ai", block: "DECIDE" });
    const review = doc("decide.review", "R1", { check: "K1", version: 1, irreversible: ["退出：簽了就退不回"], hold: "先等一下" });
    const dropped = doc("sense.review", "S1", { mirror: "gone", version: 1, decision: "刪掉" });
    const { host, done } = await open({ [`GET ${P}/docs/decide.check`]: [check], [`GET ${P}/docs/decide.review`]: [review], [`GET ${P}/docs/sense.review`]: [dropped] });
    const rows = [...host.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");
    expect(rows.some((row) => row.includes("判斷：AI 的檢查") && row.includes("AI 寫的") && row.includes("你確認了 1 個不能反悔的地方，選了「先等一下」"))).toBe(true);
    expect(rows.some((row) => row.includes("你刪掉了 1 份") && row.includes("內容不留"))).toBe(true);
    await done();
  });

  it("lists my own moves with no number, grade or rank; the cross-case hint only says how often", async () => {
    const { host, done } = await open({
      [`GET ${P}/learn/moves`]: { moves: [{ item: "有沒有提出可被反駁的改變條件", seen: "你寫下了什麼會改變結論：「他願意寫進合約」。" }] },
      "/me/learn/patterns": { hints: ["你有 2 個案子，都是在情緒「強」的時候下的判斷。這只告訴你出現幾次，不是說對或錯。"] },
    });
    const card = [...host.querySelectorAll(".card")].find((item) => item.textContent?.includes("你自己做到的"))!;
    expect(card.textContent).toContain("有沒有提出可被反駁的改變條件");
    expect(card.textContent).toContain("不打分數、不排名、不跟別人比");
    expect(card.textContent).toContain("不是說對或錯");
    expect(card.textContent).not.toMatch(/\d+\s*分|排名第|等級/);
    await done();
  });

  it("with no ACT in the case I pick a day to come back; with ACT the page points to the task's due date", async () => {
    const revisit = doc("learn.revisit", "R1", { on: "2026-11-01" });
    const noAct = await open({ [`POST ${P}/docs/learn.revisit`]: (call: Call) => saved("learn.revisit", "R1", call.body.content) }, doc("assembler.intake", "I1", { ...INTAKE.content, blocks: ["SENSE", "DECIDE", "LEARN"] }));
    await type(field(noAct.host, "revisit"), "2026-11-01");
    await click(byText(noAct.host, "button", "記下這一天"));
    expect(posts(noAct.calls, `${P}/docs/learn.revisit`)[0].body).toEqual({ content: { on: "2026-11-01" } });
    await noAct.done();
    vi.resetAllMocks();
    const withAct = await open({ [`GET ${P}/docs/learn.revisit`]: [revisit] });
    expect(withAct.host.querySelector("#revisit")).toBeNull();
    expect(withAct.host.textContent).toContain("要延後回顧，到「行動與觀察」改任務的期限");
    await withAct.done();
  });

  it("the AI's comparison carries its author, two things done well and one to practise, and no verdict", async () => {
    const compare = doc("learn.compare", "P1", { side_by_side: "你預測他讓步一半；結果他又改了條件。", done_well: ["你先寫了預測", "你寫了什麼會改變結論"], practice: "下次先寫反例" }, { author: "ai", block: "LEARN" });
    let made = false;
    const { host, done, calls } = await open({ [`POST ${P}/ai/LEARN/compare`]: () => { made = true; return { saved: compare }; }, [`GET ${P}/docs/learn.compare`]: () => (made ? [compare] : []) });
    await click(chip(host, "回顧哪一版", "第 1 版"));
    await click(byText(host, "button", "請 AI 整理前後比較"));
    expect(posts(calls, `${P}/ai/LEARN/compare`)[0].body.context).toEqual({ judgment_version: 1 });   // the version the review is about, not whatever is newest
    expect(host.textContent).toContain("AI 寫的");
    expect(host.textContent).toContain("你先寫了預測");
    expect(host.textContent).toContain("下次可以練的一處：下次先寫反例");
    expect(host.textContent).toContain("不給分數、不排名、不改寫當初的紀錄，也不替你決定要不要修正");
    await done();
  });

  it("says in plain words when there is nothing to compare", async () => {
    const { host, done } = await open({ [`GET ${P}/docs/decide.judgment`]: [], [`GET ${P}/docs/decide.judgment/J1/versions`]: [], [`POST ${P}/ai/LEARN/compare`]: () => { throw new ApiError(400, "LEARN_NOTHING_TO_COMPARE: x"); } });
    expect((byText(host, "button", "請 AI 整理前後比較") as HTMLButtonElement).disabled).toBe(true);
    await done();
  });

  it("a habit worth keeping or changing is my own record across cases, with the case it came from", async () => {
    const { host, done, calls } = await open({ "POST /me/docs/learn.habit": (call: Call) => saved("learn.habit", "H1", call.body.content) });
    await type(field(host, "keep"), "先寫預測再看結果");
    await click(byText(host, "button", "記下來"));
    expect(posts(calls, "/me/docs/learn.habit")[0].body).toEqual({ content: { keep: "先寫預測再看結果", project: "P1" } });
    await done();
  });

  it("reopening a version's review shows what I wrote for that version", async () => {
    const earlier = doc("learn.calibration", "C1", { judgment_version: 1, outcome: "第一次回顧寫的", process: "做對了一件事" });
    const { host, done } = await open({ [`GET ${P}/docs/learn.calibration`]: [earlier] });
    expect(field(host, "outcome").value).toBe("");   // the latest version has no review yet
    await click(chip(host, "回顧哪一版", "第 1 版"));
    expect(field(host, "outcome").value).toBe("第一次回顧寫的");
    expect(byText(host, "button", "存修改")).toBeDefined();
    await done();
  });

  it("has no dropdown, and the daily card and practices are one link away", async () => {
    const { host, done } = await open();
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelector('a[href="/me/learn"]')).not.toBeNull();
    await done();
  });
});
