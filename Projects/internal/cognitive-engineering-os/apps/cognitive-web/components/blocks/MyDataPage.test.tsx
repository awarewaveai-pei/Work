import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { RESEARCH_SENTENCE } from "../../lib/govern";
import { NoRecordSwitch } from "./GovernPage";
import { MyDataPage } from "./MyDataPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); };
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
function routes(table: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in table)) throw new Error(`unexpected call: ${key}`);
    const answer = table[key];
    return typeof answer === "function" ? (answer as (init?: RequestInit) => unknown)(init) : answer;
  }) as never);
}
const calls = (method: string, path: string) => vi.mocked(apiFetch).mock.calls.filter(([called, init]) => called === path && (init?.method ?? "GET") === method);
const doc = (kind: string, id: string, content: Record<string, unknown>) => ({ doc_id: id, kind, version: 1, content, author: "user", block: "SENSE", at: "2026-10-08T00:00:00Z" });
const consent = (id: string, withdrawn = false) => ({ doc_id: id, version: withdrawn ? 2 : 1, at: "2026-10-08T00:00:00Z", created_at: "2026-10-08T00:00:00Z",
  content: { purpose: "group", target: "G1", items: [{ project_id: "P1", kind: "sense.card", doc_id: "c1" }], follow_versions: true, withdrawn } });
const FORBIDDEN = /分數|排名|名次|等級|評分|score|rank/i;

function base(extra: Record<string, unknown> = {}) {
  let held = [consent("k1")];
  return {
    "GET /projects": [{ project_id: "P1", name: "搬家" }],
    "GET /groups": [{ group_id: "G1", name: "週六工作坊", purpose: "workshop", my_role: "participant" }],
    "GET /me/consents": () => held,
    "POST /me/consents/k1/withdraw": () => { held = [consent("k1", true)]; return held[0]; },
    "GET /me/appeals": [], "GET /govern/appeals": [],
    "GET /govern/account": { cases: [{ project_id: "P1", name: "搬家", created_at: "x" }], personal_records: 1, workflows: 0, runs: 0, keeps: ["帳號留一個空殼。"], phrase: "刪除我的帳號" },
    "GET /projects/P1/docs/sense.card": [doc("sense.card", "c1", { text: "房租漲了" }), doc("sense.card", "c2", { text: "房東要賣房" })],
    "GET /projects/P1/docs/map.map": [], "GET /projects/P1/docs/think.card": [],
    "GET /groups/G1": { members: [{ identity_id: "F1", display_name: "林老師", role: "facilitator" }, { identity_id: "ME", display_name: "我", role: "participant" }] },
    ...extra,
  };
}

describe("我的資料：同意", () => {
  it("withdraw sends the request and the list updates", async () => {
    routes(base());
    const { host, done } = await mount(<MyDataPage />);
    expect(host.textContent).toContain("群組「週六工作坊」 看得到 1 份");
    await click(button(host, "撤回"));
    expect(calls("POST", "/me/consents/k1/withdraw")).toHaveLength(1);
    expect(host.textContent).toContain("你現在沒有分享任何東西。");
    await done();
  });

  it("a new consent lists items per case as checkboxes, has no share-all control, and previews what and who before saving", async () => {
    routes(base({ "POST /me/consents": (init?: RequestInit) => ({ ...consent("k2"), content: JSON.parse(init!.body as string) }) }));
    const { host, done } = await mount(<MyDataPage />);
    await click(button(host, "給群組"));
    await click([...host.querySelectorAll("button")].find((item) => item.textContent === "群組「週六工作坊」"));
    const boxes = [...host.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes.map((box) => box.parentElement?.textContent?.trim())).toEqual(["外化卡：房租漲了", "外化卡：房東要賣房"]);
    expect(host.textContent).not.toMatch(/全部分享|全選|分享全部|share all/i);
    expect(boxes.every((box) => !box.checked)).toBe(true);
    await click(boxes[0]);
    await click(button(host, "看一下要分享什麼"));
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("群組「週六工作坊」 會看得到這 1 份");
    expect(dialog?.textContent).toContain("搬家 · 外化卡：房租漲了");
    expect(calls("POST", "/me/consents")).toHaveLength(0);
    await click(button(host, "確定分享"));
    expect(JSON.parse(calls("POST", "/me/consents")[0][1]!.body as string)).toEqual({ purpose: "group", target: "G1", items: [{ project_id: "P1", kind: "sense.card", doc_id: "c1" }], follow_versions: true });
    await done();
  });
});

describe("我的資料：申訴、研究、匯出", () => {
  it("an appeal is anonymous by default and sends named only when the person turns it on", async () => {
    routes(base({ "POST /me/appeals": { doc_id: "a1" } }));
    const { host, done } = await mount(<MyDataPage />);
    await click([...host.querySelectorAll("button")].find((item) => item.textContent === "週六工作坊"));
    await click(button(host, "林老師"));
    expect((host.querySelector("#appeal-named") as HTMLInputElement).checked).toBe(false);
    expect(host.textContent).toContain("你說的那位帶領的人，什麼都看不到");
    await act(async () => { type(host.querySelector("#appeal-text") as HTMLTextAreaElement, "一直打斷我"); });
    await click(button(host, "送出申訴"));
    expect(JSON.parse(calls("POST", "/me/appeals")[0][1]!.body as string)).toEqual({ group_id: "G1", about_identity_id: "F1", text: "一直打斷我", named: false });
    await done();
  });

  it("the research section says the file is not a guarantee and asks to remove names first; no select, no score words", async () => {
    routes(base());
    const { host, done } = await mount(<MyDataPage />);
    expect(host.textContent).toContain(RESEARCH_SENTENCE);
    expect(host.textContent).toContain("不保證別人認不出是誰");
    expect(host.textContent).toContain("請先把你寫的人名刪掉或改掉");
    expect(host.textContent).not.toContain("匿名");
    expect(host.innerHTML).not.toContain("<select");
    expect(host.textContent).not.toMatch(FORBIDDEN);
    expect(host.textContent).toContain("帳號留一個空殼。");
    await done();
  });
});

describe("不留紀錄", () => {
  const intake = { ...doc("assembler.intake", "i1", { purpose: "複雜決策", question: "要不要搬", package: "個人複雜決策", no_record: false }), block: "ASSEMBLER" };
  it("the warning is on the page before the switch exists, and turning it on saves the intake", async () => {
    let answerSpec: (value: unknown) => void = () => {};
    routes({
      "GET /blocks/govern/spec": () => new Promise((resolve) => { answerSpec = resolve; }),
      "GET /projects/P1/docs/assembler.intake": [intake],
      "PUT /projects/P1/docs/assembler.intake/i1": (init?: RequestInit) => ({ ...intake, version: 2, content: JSON.parse(init!.body as string).content, notices: [] }),
    });
    const { host, done } = await mount(<NoRecordSwitch projectId="P1" />);
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();   // no switch before the words
    await act(async () => { answerSpec({ no_record: { label: "不留紀錄", warning: "關掉之後整個案子會刪掉，不能匯出" }, resources: {} }); });
    expect(host.textContent).toContain("關掉之後整個案子會刪掉，不能匯出");
    await click(host.querySelector('input[type="checkbox"]'));
    expect(JSON.parse(calls("PUT", "/projects/P1/docs/assembler.intake/i1")[0][1]!.body as string).content.no_record).toBe(true);
    expect(button(host, "結束這個案子")).toBeDefined();
    expect(host.textContent).not.toMatch(FORBIDDEN);
    await done();
  });
});
