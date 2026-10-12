import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { REVIEW_CHECKS } from "../../lib/learn";
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

  it("a wrong source found in this case is picked by its origin, so GATHER can show it there; one not found is written", async () => {
    const card = { card: "K1", version: 1, source_id: "S1", url: "https://consult.example/post", title: "顧問公司的文章", aside: "", found_by: { by: "系統找的" }, cells: {}, mine: {} };
    const origin = { origin_id: "o:abc", cards: [card], how: "單獨", pending: false, aside: false, counts: true, mark: null };
    const { host, done, calls } = await open({
      [`POST ${P}/docs/learn.calibration`]: (call: Call) => saved("learn.calibration", "C1", call.body.content),
      [`POST ${P}/learn/history`]: { entry: {}, hints: [] },
      [`${P}/evidence`]: { origins: [origin], changed_marks: [], claims: [], calcs: [], min_origins: 2 },
    });
    await type(field(host, "outcome"), "他下個月又改條件");
    await click(chip(host, "錯的出處 1 是哪一個", "顧問公司的文章｜consult.example"));
    expect(labelled(host, "錯的出處 1").value).toBe("");   // the picked origin is shown by its chip, not as an id
    await type(labelled(host, "錯的出處 1 為什麼"), "它在賣顧問服務");
    await click(byText(host, "button", "存這次回顧"));
    const [call] = posts(calls, `${P}/docs/learn.calibration`);
    expect(call.body.content.wrong_sources).toEqual([{ source: "顧問公司的文章｜consult.example", why: "它在賣顧問服務", cards: ["K1"] }]);   // by its pages: a regroup does not lose it
    await done();
  });

  it("a second press takes a picked origin back, and typing a name instead drops its cards", async () => {
    const card = { card: "K1", version: 1, source_id: "S1", url: "https://consult.example/post", title: "顧問公司的文章", aside: "", found_by: { by: "系統找的" }, cells: {}, mine: {} };
    const origin = { origin_id: "o:abc", cards: [card], how: "單獨", pending: false, aside: false, counts: true, mark: null };
    const { host, done, calls } = await open({
      [`POST ${P}/docs/learn.calibration`]: (call: Call) => saved("learn.calibration", "C1", call.body.content),
      [`POST ${P}/learn/history`]: { entry: {}, hints: [] },
      [`${P}/evidence`]: { origins: [origin], changed_marks: [], claims: [], calcs: [], min_origins: 2 },
    });
    await type(field(host, "outcome"), "他下個月又改條件");
    const pick = () => chip(host, "錯的出處 1 是哪一個", "顧問公司的文章｜consult.example")!;
    await click(pick());
    expect(pick().getAttribute("aria-pressed")).toBe("true");
    await click(pick());
    expect(pick().getAttribute("aria-pressed")).toBe("false");   // taken back
    await click(pick());
    await type(labelled(host, "錯的出處 1"), "朋友轉傳的截圖");
    expect(pick().getAttribute("aria-pressed")).toBe("false");   // a typed name is not that origin
    await click(byText(host, "button", "存這次回顧"));
    const [call] = posts(calls, `${P}/docs/learn.calibration`);
    expect(call.body.content.wrong_sources).toEqual([{ source: "朋友轉傳的截圖" }]);
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

  it("the side-by-side is the system's own table with no AI button; a comparison the AI saved before still shows with its author, two things done well and one to practise, and no verdict", async () => {
    const compare = doc("learn.compare", "P1", { side_by_side: "你預測他讓步一半；結果他又改了條件。", done_well: ["你先寫了預測", "你寫了什麼會改變結論"], practice: "下次先寫反例" }, { author: "ai", block: "LEARN" });
    const { host, done, calls } = await open({ [`GET ${P}/docs/learn.compare`]: [compare] });
    const text = host.textContent ?? "";
    expect(text).toContain("系統整理的，不是 AI 寫的，不扣點");
    expect(text).toContain("這張表是系統照你的紀錄排的");
    expect(text).toContain("以前 AI 整理的前後比較");
    expect(text).toContain("AI 寫的");
    expect(text).toContain("你先寫了預測");
    expect(text).toContain("下次可以練的一處：下次先寫反例");
    expect(text).toContain("不給分數、不排名、不改寫當初的紀錄，也不替你決定要不要修正");
    expect([...host.querySelectorAll("button")].some((node) => /請 AI/.test(node.textContent ?? ""))).toBe(false);
    expect(calls.filter((call) => call.method !== "GET" && call.path.includes("/ai/"))).toEqual([]);
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

describe("LEARN 回顧校準：第一次來的人先看到三樣（走查 2026-10-11 B2、B3）", () => {
  it("keeps what happened, whether the prediction held and your decision out of any fold; folds the rest under named lines", async () => {
    const { host, done } = await open();
    expect(field(host, "outcome").closest("details")).toBeNull();
    for (const group of ["預測對上了嗎", "維持、出新版，還是換方法"]) expect(host.querySelector(`[aria-label="${group}"]`)?.closest("details"), group).toBeNull();
    const review = [...host.querySelectorAll(".card.cta details.dir > summary")].map((summary) => summary.textContent);
    expect(review).toEqual([expect.stringContaining("回頭看細一點"), expect.stringContaining("還信不信 AI？五個面向"), expect.stringContaining("當時哪個出處錯了"), expect.stringContaining("下一輪要加哪一塊")]);
    for (const id of ["missed", "step", "direction", "process", "luck", "delegate"]) expect(field(host, id).closest("details.dir"), id).not.toBeNull();
    await done();
  });

  it("puts each review check's war example behind 看例子 and names where the questions come from", async () => {
    const { host, done } = await open();
    const examples = [...host.querySelectorAll("details")].filter((item) => item.querySelector("summary")?.textContent === "看例子");
    expect(examples.map((item) => item.querySelector(".hint")?.textContent)).toEqual(REVIEW_CHECKS.map((item) => item.example));
    expect(examples.every((item) => !item.open)).toBe(true);
    expect(host.textContent).toContain("這四題來自 Theo Farrell 談英國在阿富汗作戰的講稿");
    await done();
  });
});
