import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FacilitatePage } from "./FacilitatePage";
import { byText, click, field, mount, serve, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const DONTS = ["替參與者下結論", "要求參與者說出脆弱的事", "停止訊號出現了還繼續", "把服從或反抗當成錯"];
const STEPS = [
  { what: "先說明這一步要做什麼，再請參與者描述看得見的事件。", minutes: 3, dont: DONTS, stop_signals: ["參與者說想停下來。", "出現自傷、暴力或急性危機的訊號。"] },
  { what: "請參與者自己選一個想再看的模式，不替他說明原因。", minutes: 4, dont: DONTS, stop_signals: ["參與者不同意繼續這一步。"] },
];
const script = (id: string, over: Record<string, unknown> = {}) => ({ id, subject: id, subject_name: "冰山模型", version: 1, state: "reviewed", steps: STEPS,
  escalation: { who: "GOVERN", how: "交給 GOVERN，依參與者所在地提供求助資源與申訴管道。" }, usable: true, why_not: "", ...over });
const SCRIPTS = { donts: DONTS, version: "1", scripts: [script("systems.iceberg_model"), script("framing.problem_statement", { subject_name: "問題陳述", state: "draft", usable: false, why_not: "草稿" })] };
const GROUP = { group_id: "G1", name: "週六工作坊", purpose: "workshop", status: "open", my_role: "facilitator", my_review_state: "confirmed", members: [
  { identity_id: "F1", display_name: "林老師", role: "facilitator", review_state: "confirmed" },
  { identity_id: "P1", display_name: "小安", role: "participant", review_state: "confirmed" }, { identity_id: "P2", display_name: "小宇", role: "participant", review_state: "confirmed" }] };
const CONSENTED = { participants: [
  { identity_id: "P1", name: "小安", led: true, shared: [{ project_id: "C1", kind: "sense.card", title: "外化卡", doc_id: "D1", version: 1, content: { category: "事件", text: "房租漲了" }, author: "user", at: "2026-10-09T00:00:00Z" }] },
  { identity_id: "P2", name: "小宇", led: false, shared: [] }] };
const HELP = { notice: "這個平台幫你看見自己怎麼判斷，不是治療或諮商服務。遇到危機時，請找下面的專線或你身邊信任的人。", resources: [{ name: "安心專線", contact: "1925" }], fallback: null };
const FORBIDDEN = /分數|排名|名次|排行|評分|打分|等第|及格|\d+(?:\.\d+)?\s*分(?![鐘钟之])|\bscore|\brank|\bgrade|leaderboard|%/i;
const NO_FORBIDDEN_WORDS = (host: HTMLElement) => expect(host.textContent ?? "").not.toMatch(FORBIDDEN);

const doc = (kind: string, doc_id: string, content: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  ({ doc_id, kind, version: 1, content, author: "user", block: "FACILITATE", at: "2026-10-09T08:00:00Z", created_at: "2026-10-09T08:00:00Z", ...over });

async function group(routes: Record<string, unknown> = {}) {
  const calls = serve({ "/blocks/facilitate/scripts": SCRIPTS, "/groups/G1": GROUP, "/groups/G1/facilitate/consented": CONSENTED, "/groups/G1/facilitate/assignments": [], ...routes });
  const page = await mount(<FacilitatePage groupId="G1" />);
  return { ...page, calls };
}

const LESSONS = ["facilitator-how-to-lead", "facilitator-donts"].map((id, index) => ({ id, subject: "課堂反思", version: 2, state: "draft", minutes: 3, title: id === "facilitator-donts" ? "帶領時永遠不做的事" : "帶人想，但不替人想",
  text: "x", example: "x", teaches: ["x"], course: { package: "facilitator", order: index + 1 } }));

async function personal(routes: Record<string, unknown> = {}) {
  const calls = serve({ "/blocks/facilitate/scripts": SCRIPTS, "/facilitate/me": { facilitator: true, supervisor: true }, "/blocks/teach/lessons": LESSONS,
    "/blocks/teach/practice-cases": { cases: [{ id: "taiwan-central-weather", version: 2, title: "台灣的公開天氣公告", text: "練習閱讀一則天氣預報公告。", place: "台灣", source: { kind: "publisher", name: "中央氣象署", checked_on: "尚未查核" } }], place: null, fallback: false, message: "" },
    "/facilitate/supervisors": [], "/facilitate/feedback": [], "/facilitate/supervisees": [], "/groups": [], ...routes });
  const page = await mount(<FacilitatePage />);
  return { ...page, calls };
}

const donts = (host: HTMLElement) => host.querySelector('[aria-label="不能做的事"]')?.textContent ?? "";
const allDonts = (host: HTMLElement) => DONTS.every((text) => donts(host).includes(text));

describe("FACILITATE: leading a group", () => {
  it("keeps the four don'ts on screen the whole time: on arrival, on every step, after a stop, in the leader's own area too", async () => {
    const { host, done } = await group();
    expect(allDonts(host)).toBe(true);
    await click(byText(host, "button", "下一步"));
    expect(host.textContent).toContain("第 2 步／共 2 步");
    expect(allDonts(host)).toBe(true);
    await click(byText(host, "button", "參與者要停"));
    expect(allDonts(host)).toBe(true);
    await done();
    const own = await personal();
    expect(allDonts(own.host)).toBe(true);
    await own.done();
  });

  it("stops the step, lights up the stop signals and shows the escalation and the lines of help for that participant's place -- naming nobody", async () => {
    const { host, done, calls } = await group({ "POST /groups/G1/facilitate/stop": () => HELP });
    expect(host.querySelector('[aria-label="停止訊號"]')?.className).toBe("filled");
    await click(byText(host, "button", "參與者要停"));
    const signals = host.querySelector('[aria-label="停止訊號"]')!;
    expect(signals.className).toBe("cant");
    expect(signals.textContent).toContain("參與者說想停下來。");
    expect(byText(host, "button", "下一步")?.hasAttribute("disabled")).toBe(true);   // no going on while a participant has said stop
    expect(host.textContent).toContain("這一步先停下來。");
    expect(host.textContent).toContain("交給 安全、資料與治理，依參與者所在地提供求助資源與申訴管道。");
    await click(byText(host, "button", "小安"));
    expect(calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body])).toEqual([["/groups/G1/facilitate/stop", { participant: "P1" }]]);
    const stopBox = host.querySelectorAll(".cant")[1] as HTMLElement;
    expect(stopBox.textContent).toContain("安心專線");
    expect(stopBox.textContent).toContain("1925");
    expect(stopBox.textContent).not.toContain("小安");   // who asked to stop is not written back on the page
    await click(byText(host, "button", "回到帶領稿"));
    expect(host.querySelector('[aria-label="停止訊號"]')?.className).toBe("filled");
    expect(byText(host, "button", "下一步")?.hasAttribute("disabled")).toBe(false);
    await click(byText(host, "button", "參與者要停"));
    await click(byText(host, "button", "不點名"));
    expect(calls.filter((call) => call.method === "POST").at(-1)?.body).toEqual({});
    await done();
  });

  it("lists only what participants consented to show, by who, and fetches no case of theirs", async () => {
    const { host, done, calls } = await group();
    const text = host.textContent ?? "";
    expect(text).toContain("房租漲了");
    expect(text).toContain("外化卡");
    expect(text).toContain("小宇");
    expect(text).toContain("還沒有分享任何東西。");
    expect(text).toContain("寫了由你帶");
    expect(calls.filter((call) => call.path.startsWith("/projects"))).toEqual([]);
    expect(calls.filter((call) => call.path.includes("/collab") || call.path.includes("/appeals"))).toEqual([]);
    await done();
  });

  it("saves a log of what followed and what did not and why, then shows the AI's pointers tagged, with the line and the fixed sentence", async () => {
    const log = doc("facilitate.log", "L1", { group_id: "G1", script: "systems.iceberg_model", script_version: 1, followed: "開場說明了步驟。", deviated: [{ what: "我替他們總結了結論", why: "時間不夠" }] });
    const HANDBACK = "要不要改帶法，由你和督導決定。AI 只指出來。";
    const { host, done, calls } = await group({
      "POST /me/docs/facilitate.log": (call: Call) => ({ ...log, content: call.body.content, notices: [] }),
      "POST /me/ai/FACILITATE/point_at_deviations": () => ({ saved: doc("facilitate.pointers", "A1", { log: "L1", log_version: 1, handback: HANDBACK,
        pointers: [{ n: 2, line: "沒照稿：我替他們總結了結論（理由：時間不夠）", dont: DONTS[0], text: `這裡可能偏離「${DONTS[0]}」：這一行說你替參與者做了總結。` }] }, { author: "ai" }) }),
    });
    expect(byText(host, "button", "請 AI 指出可能偏離的地方")?.hasAttribute("disabled")).toBe(true);   // nothing saved yet
    await type(field(host, "log-followed"), "開場說明了步驟。");
    await click(byText(host, "button", "再加一項"));
    await type(field(host, "log-what-0"), "我替他們總結了結論");
    await type(field(host, "log-why-0"), "時間不夠");
    await click(byText(host, "button", "存紀錄"));
    expect(calls.find((call) => call.method === "POST" && call.path === "/me/docs/facilitate.log")?.body).toEqual({ content:
      { group_id: "G1", script: "systems.iceberg_model", script_version: 1, followed: "開場說明了步驟。", deviated: [{ what: "我替他們總結了結論", why: "時間不夠" }] } });
    await click(byText(host, "button", "請 AI 指出可能偏離的地方"));
    expect(calls.find((call) => call.path === "/me/ai/FACILITATE/point_at_deviations")?.body).toEqual({ context: { log: "L1" } });
    const text = host.textContent ?? "";
    expect(text).toContain("AI 寫的");
    expect(text).toContain("這裡可能偏離「替參與者下結論」");
    expect(text).toContain("沒照稿：我替他們總結了結論（理由：時間不夠）");
    expect(text).toContain(HANDBACK);
    NO_FORBIDDEN_WORDS(host);
    await done();
  });

  it("shows a group's unit-assigned supervisor to the leader, and never a select", async () => {
    const { host, done } = await group({ "/groups/G1/facilitate/assignments": [{ doc_id: "A1", supervisee: "F1", supervisee_name: "林老師", supervisor: "S1", supervisor_name: "陳督導", written_by_me: false, stands: true }] });
    expect(host.textContent).toContain("你的督導：陳督導");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("is never worded as a score, a rank or a share", async () => {
    const { host, done } = await group({ "POST /groups/G1/facilitate/stop": () => HELP });
    NO_FORBIDDEN_WORDS(host);
    await click(byText(host, "button", "參與者要停"));
    await click(byText(host, "button", "不點名"));
    NO_FORBIDDEN_WORDS(host);
    await done();
    const own = await personal({ "/facilitate/supervisors": [{ doc_id: "K1", supervisor: "S1", supervisor_name: "陳督導", assigned_by: "self", group_id: "", stands: true, written_by_me: true }],
      "/facilitate/feedback": [{ doc_id: "B1", supervisor_name: "陳督導", feedback: "下次先問問題。", at: "2026-10-09T08:00:00Z" }] });
    NO_FORBIDDEN_WORDS(own.host);
    expect(own.host.textContent).toContain("下次先問問題。");
    await own.done();
  });
});

describe("FACILITATE: the leader's own area", () => {
  it("lists the leaders I supervise, their logs and the appeals about them masked: a name only when the appeal is named", async () => {
    const appeal = (doc_id: string, named: boolean, extra: Record<string, unknown> = {}) => ({ doc_id, group_id: "G1", about_identity_id: "I2", text: `異議 ${doc_id}`, named, on: "2026-10-08", ...extra });
    const { host, done, calls } = await personal({
      "/facilitate/supervisees": [{ supervisee: "I2", name: "林老師", assigned_by: "self", group_id: "" }],
      "/facilitate/supervisees/I2/logs": [{ doc_id: "L1", version: 1, at: "2026-10-09T08:00:00Z", content: { group_id: "G1", script: "systems.iceberg_model", script_version: 1, followed: "照稿走完", deviated: [{ what: "跳過第二步", why: "時間不夠" }] } }],
      "/facilitate/supervisees/I2/appeals": [appeal("a1", false, { author_name: "不該出現的名字" }), appeal("a2", true, { author_name: "小安" })],
      "POST /me/docs/facilitate.supervision": (call: Call) => ({ ...doc("facilitate.supervision", "S1", call.body.content), notices: [] }),
    });
    await click(byText(host, "button", "林老師"));
    const text = host.textContent ?? "";
    expect(text).toContain("照稿做了：照稿走完");
    expect(text).toContain("沒照稿：跳過第二步（為什麼：時間不夠）");
    expect(text).toContain("異議 a1");
    expect(text).toContain("沒有具名");
    expect(text).not.toContain("不該出現的名字");   // an unnamed appeal shows no author, whatever the answer carried
    expect(text).toContain("具名：小安");
    expect(calls.filter((call) => call.path.startsWith("/projects") || call.path.startsWith("/groups/"))).toEqual([]);
    await type(field(host, "supervision-feedback"), "下次先問問題。");
    await click(byText(host, "button", "存回饋"));
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ content: { supervisee: "I2", feedback: "下次先問問題。" } });
    NO_FORBIDDEN_WORDS(host);
    await done();
  });

  it("finds a supervisor by address, practises with the AI participant (tagged) and links to the course", async () => {
    const { host, done, calls } = await personal({
      "POST /facilitate/supervisors": () => ({ doc_id: "K1", already: false }),
      "POST /me/ai/FACILITATE/play_participant": () => ({ saved: doc("facilitate.practice_reply", "R1", { script: "systems.iceberg_model", step: 1, reply: "我看到公告上寫了時間和地點。" }, { author: "ai" }) }),
    });
    expect(host.textContent).toContain("到「課程與演練」上課");
    expect(host.querySelector('a[href="/me/teach"]')).not.toBeNull();
    await type(field(host, "supervisor-email"), "s@example.com");
    await click(byText(host, "button", "請他當我的督導"));
    expect(calls.find((call) => call.path === "/facilitate/supervisors" && call.method === "POST")?.body).toEqual({ email: "s@example.com" });
    await type(field(host, "practice-say"), "請大家說說你們在公告上看到什麼。");
    await click(byText(host, "button", "說說看"));
    expect(calls.find((call) => call.path === "/me/ai/FACILITATE/play_participant")?.body).toEqual({ context:
      { script: "systems.iceberg_model", step: 1, practice_case: "taiwan-central-weather", say: "請大家說說你們在公告上看到什麼。", earlier: [] } });
    const text = host.textContent ?? "";
    expect(text).toContain("AI 扮演的練習參與者");
    expect(text).toContain("AI 寫的");
    expect(text).toContain("我看到公告上寫了時間和地點。");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });
});
