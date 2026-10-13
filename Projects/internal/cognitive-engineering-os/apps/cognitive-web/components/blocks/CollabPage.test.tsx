import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BADGE, CollabPage, WRITE_FIRST } from "./CollabPage";
import { byText, click, field, mount, serve, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const G = "/groups/G1";
const C = `${G}/collab`;
const item = (kind: string, doc_id: string, content: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  ({ doc_id, kind, version: 1, content, author: "user", at: "2026-10-08T08:00:00Z", mine: false, who: "乙", ...over });
const GROUP = { group_id: "G1", name: "第三位合夥人", purpose: "decision", status: "open", my_role: "participant", my_review_state: "confirmed",
  members: [{ identity_id: "I1", display_name: "甲", role: "convener", review_state: "confirmed" }, { identity_id: "I2", display_name: "乙", role: "participant", review_state: "confirmed" },
    { identity_id: "I3", display_name: "丁", role: "participant", review_state: "pending_review" }] };
const NO_AUTHORITY = { current: [], renegotiate: [] };
const INSUFFICIENT = { insufficient: true, why: "還不夠看出誰跟誰不同", held: ["丁"], heaviest_left_out: false, without_heaviest: { insufficient: true, why: "還不夠看出誰跟誰不同" } };
const KINDS = ["question", "position", "change", "interface_answers", "option", "stance", "reopen", "closing", "restatement", "confirm", "differences", "consequence", "review", "label", "place", "proposal"];
const THEIRS = item("collab.position", "P2", { round: 1, text: "乙的立場：先談錢" });

const BLIND = ["position", "change", "interface_answers"];
// The page asks one route (collab.py `page`); the test still writes each part as the route of its own name, and the page
// answer is built from them -- unfiltered, so what the page itself draws before I wrote mine is what is tested.
async function open(routes: Record<string, unknown> = {}) {
  const parts: Record<string, unknown> = { ...Object.fromEntries(KINDS.map((kind) => [`${C}/collab.${kind}`, []])), [G]: GROUP, [`${C}/view/dissent`]: [],
    [`${C}/view/authority`]: NO_AUTHORITY, [`${C}/view/agreement`]: INSUFFICIENT, [`${C}/view/shared`]: [], ...routes };
  const answer = (path: string) => { const hit = parts[path]; return typeof hit === "function" ? hit({ path, method: "GET" }) : hit; };
  const page = () => {
    const records = Object.fromEntries(KINDS.map((kind) => [`collab.${kind}`, answer(`${C}/collab.${kind}`) as Array<{ mine: boolean; content: { round?: number } }>]));
    const round = Math.max(1, ...records["collab.question"].map((item) => item.content.round ?? 1));
    const wrote = Object.fromEntries(BLIND.map((kind) => [`collab.${kind}`, records[`collab.${kind}`].some((item) => item.mine && item.content.round === round)]));
    return { group: answer(G), round, records, wrote, versions: {}, dissent: answer(`${C}/view/dissent`), authority: answer(`${C}/view/authority`),
      agreement: answer(`${C}/view/agreement`), shared: answer(`${C}/view/shared`) };
  };
  const calls = serve({ ...Object.fromEntries(Object.entries(parts).filter(([key]) => key.includes(" "))), [`${C}/page`]: page });
  const mounted = await mount(<CollabPage groupId="G1" />);
  return { ...mounted, calls };
}

describe("COLLAB: one group's page", () => {
  it("before saving my position nothing of theirs is drawn, even from a wrong answer; the whole page is one request", async () => {
    let positions: unknown[] = [THEIRS];   // a wrong server answer before I wrote mine: the page still draws nothing of it
    const { host, done, calls } = await open({
      [`${C}/collab.position`]: () => positions,
      [`POST ${C}/collab.position`]: (call: Call) => { positions = [THEIRS, item("collab.position", "P1", call.body.content, { mine: true, who: "你" })]; return { ...(positions[1] as object), notices: [] }; },
    });
    expect(host.textContent).toContain(WRITE_FIRST);
    expect(host.textContent).not.toContain("乙的立場");
    expect(calls.map((call) => call.path)).toEqual([`${C}/page`]);
    await type(field(host, "position-text"), "我的立場");
    await click(byText(host, "button", "存我的立場"));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`GET ${C}/page`, `POST ${C}/collab.position`, `GET ${C}/page`]);
    expect(host.textContent).toContain("乙的立場：先談錢");
    expect(host.querySelector("#position-text")).toBeNull();   // written: the others' are shown in its place
    await done();
  });

  it("carries the badge, never a count, a rank or a share next to an option, and lists who waits for the convener", async () => {
    const option = item("collab.option", "O1", { round: 1, text: "先試做三個月" });
    const stances = [item("collab.stance", "S1", { option: "O1", stance: "同意", reason: "可以試" }, { mine: true, who: "你" }),
      item("collab.stance", "S2", { option: "O1", stance: "異議", reason: "太短" }), item("collab.stance", "S3", { option: "O1", stance: "異議", reason: "風險高" }, { who: "丙" })];
    const { host, done } = await open({ [`${C}/collab.option`]: [option], [`${C}/collab.stance`]: stances,
      [`${C}/view/dissent`]: [{ doc_id: "D1", option: "O1", reason: "太短", who: "乙", mine: false, at: "x" }] });
    expect(host.textContent).toContain(BADGE);
    const text = host.textContent ?? "";
    for (const word of ["票", "排名", "分數", "%"]) expect(text).not.toContain(word);
    expect(text).not.toMatch(/異議\s*[:：]?\s*\d|\d+\s*(人|個)?\s*(同意|異議)/);
    expect(byText(host, "button", "異議")).toBeDefined();
    expect(byText(host, "button", "同意")).toBeDefined();
    expect(text).toContain("乙：異議。太短");
    expect(text).toContain("還在等召集人確認");
    expect(text).toContain("丁");
    expect(text).toContain("還不夠看出誰跟誰不同");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("taking back my share sends only my share; the page shows the recomputed authority and 範圍要重新談", async () => {
    let authority: unknown = { current: [{ to: "甲", to_me: false, scope: "談合約", grantors: ["你", "乙", "丙"], my_share: "A2" }], renegotiate: [] };
    const { host, done, calls } = await open({
      [`${C}/view/authority`]: () => authority,
      [`POST ${C}/collab.authority/A2/revoke`]: () => { authority = { current: [{ to: "甲", to_me: false, scope: "談合約", grantors: ["乙", "丙"], my_share: null }],
        renegotiate: [{ to: "甲", scope: "談合約", taken_back_by: "你", notice: "範圍要重新談", at: "x" }] }; return { notices: [] }; },
    });
    expect(host.textContent).toContain("甲代表 你、乙、丙：談合約");
    await click(byText(host, "button", "收回我那一份"));
    expect(calls.filter((call) => call.method === "POST" && call.path.includes("revoke")).map((call) => call.path)).toEqual([`${C}/collab.authority/A2/revoke`]);
    expect(host.textContent).toContain("甲代表 乙、丙：談合約");
    expect(host.textContent).toContain("範圍要重新談");
    await done();
  });

  it("lists a member's proposal as the words and who brought them, never the draft pointer into their case", async () => {
    const { host, done } = await open({ [`${C}/collab.proposal`]: [item("collab.proposal", "PR1", { express_draft: "DRAFT-9", text: "先談錢。\n再談時間。" })] });
    expect(byText(host, "h2", "提案")).toBeDefined();
    expect(host.textContent).toContain("先談錢。");
    expect(host.textContent).toContain("再談時間。");
    expect(host.textContent).toContain("乙交來的提案");
    expect(host.textContent).not.toContain("DRAFT-9");
    await done();
  });

  it("draws what the shared-records route returns (who, a title, its lines) and nothing when it returns none", async () => {
    const shared = [
      { who: "乙", title: "地圖", lines: ["事實：合約沒寫期限", "核心衝突：誰來負責收尾"] },
      { who: "丙", title: "查證判定", lines: ["存疑：只有一個出處"] },
    ];
    const withShared = await open({ [`${C}/view/shared`]: shared });
    const text = withShared.host.textContent ?? "";
    expect(byText(withShared.host, "h2", "分享給這個群組的紀錄")).toBeDefined();
    for (const line of ["乙分享的地圖", "事實：合約沒寫期限", "核心衝突：誰來負責收尾", "丙分享的查證判定", "存疑：只有一個出處"]) expect(text).toContain(line);
    await withShared.done();
    const none = await open();
    expect(byText(none.host, "h2", "分享給這個群組的紀錄")).toBeUndefined();
    await none.done();
  });

  it("a restatement of me is shown to me first, tagged AI, with 說錯了; reopening is always there", async () => {
    const { host, done, calls } = await open({
      [`${C}/collab.restatement`]: [item("collab.restatement", "R1", { position: "P2", text: "你要先把錢談清楚。" }, { author: "ai", who: "AI", mine: true })],
      [`POST ${C}/collab.confirm`]: (call: Call) => ({ ...item("collab.confirm", "K1", call.body.content, { mine: true }), notices: [] }),
    });
    expect(host.textContent).toContain("AI 寫的");
    expect(host.textContent).toContain("AI 轉述你的立場：你要先把錢談清楚。");
    expect(byText(host, "button", "要求重開")).toBeDefined();
    await click(byText(host, "button", "說錯了"));
    expect(calls.find((call) => call.method === "POST" && call.path === `${C}/collab.confirm`)?.body).toEqual({ content: { restatement: "R1", verdict: "說錯了" } });
    await done();
  });
});
