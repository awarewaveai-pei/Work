import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import { exportHref } from "../../lib/govern";
import { GovernPage, VersionsPage } from "./GovernPage";
import { HelpPage } from "./HelpPage";
import { SettingsPage } from "./SettingsPage";

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

// "METHOD path" -> the answer (a function gets the init); any other call fails the test loudly
function routes(table: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in table)) throw new Error(`unexpected call: ${key}`);
    const answer = table[key];
    return typeof answer === "function" ? (answer as (init?: RequestInit) => unknown)(init) : answer;
  }) as never);
}
const calls = (method: string, path: string) => vi.mocked(apiFetch).mock.calls.filter(([called, init]) => called === path && (init?.method ?? "GET") === method);

const NOTICE = "這個平台幫你看見自己怎麼判斷，不是治療或諮商服務。";
const TAIWAN = [{ name: "安心專線（衛福部，24 小時）", contact: "1925" }, { name: "Find A Helpline：依國家找免費、保密的求助專線", contact: "https://findahelpline.com" }];
const WORLD = [TAIWAN[1]];
const PHRASE = "刪除我的帳號";
const SUMMARY = {
  cases: [{ project_id: "P1", name: "合夥人改條件", created_at: "2026-10-03T00:00:00Z" }, { project_id: "P2", name: "搬家", created_at: "2026-10-03T00:01:00Z" }],
  personal_records: 3, workflows: 1, runs: 2, keeps: ["每個被刪掉的案子，留一筆「已抹除」。", "帳號本身留一個空殼，標成「已刪除」。"], phrase: PHRASE,
};
const doc = (kind: string, content: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ doc_id: `${kind}-1`, kind, version: 1, content, author: "system", block: "GOVERN", at: "2026-10-03T00:00:00Z", ...extra });

describe("設定：刪除帳號要確認兩次", () => {
  const settingsRoutes = (extra: Record<string, unknown> = {}) => ({
    "GET /govern/help": { notice: NOTICE, where: null, covered: false, resources: WORLD },
    "GET /me/docs/govern.location": [],
    "GET /govern/account": SUMMARY,
    ...extra,
  });

  it("the first button only opens the question: it says what goes and what stays, and nothing is deleted", async () => {
    routes(settingsRoutes());
    const { host, done } = await mount(<SettingsPage />);
    expect(host.textContent).toContain(NOTICE);
    expect(button(host, "永遠刪除")).toBeUndefined();
    await click(button(host, "我要刪除我的帳號"));
    expect(host.textContent).toContain("2 個案子：合夥人改條件、搬家");
    expect(host.textContent).toContain("3 筆你個人的紀錄、1 個自訂工作流、2 次工作流執行");
    expect(host.textContent).toContain("每個被刪掉的案子，留一筆「已抹除」。");
    expect(calls("POST", "/govern/account/erase")).toHaveLength(0);
    await done();
  });

  it("the second button waits for the exact phrase, and anything else deletes nothing", async () => {
    routes(settingsRoutes());
    const { host, done } = await mount(<SettingsPage />);
    await click(button(host, "我要刪除我的帳號"));
    const second = () => button(host, "永遠刪除") as HTMLButtonElement;
    expect(second().disabled).toBe(true);
    for (const wrong of ["刪除", "DELETE", "刪除我的帳戶"]) {
      await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, wrong); });
      expect(second().disabled).toBe(true);
      await click(second());
    }
    expect(calls("POST", "/govern/account/erase")).toHaveLength(0);
    await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, PHRASE); });
    expect(second().disabled).toBe(false);
    await done();
  });

  it("cancelling closes the question, and asking again starts with an empty box", async () => {
    routes(settingsRoutes());
    const { host, done } = await mount(<SettingsPage />);
    await click(button(host, "我要刪除我的帳號"));
    await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, PHRASE); });
    await click(button(host, "不刪了"));
    expect(host.querySelector("#erase-phrase")).toBeNull();
    await click(button(host, "我要刪除我的帳號"));
    expect((host.querySelector("#erase-phrase") as HTMLInputElement).value).toBe("");
    expect(calls("POST", "/govern/account/erase")).toHaveLength(0);
    await done();
  });

  it("typing the phrase and pressing the second button deletes once and leaves for the login page", async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    routes(settingsRoutes({ "POST /govern/account/erase": { cases: 2, runs: 2, records: 3, workflows: 1, tombstone: true, failed: [] } }));
    const { host, done } = await mount(<SettingsPage />);
    await click(button(host, "我要刪除我的帳號"));
    await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, PHRASE); });
    await click(button(host, "永遠刪除"));
    const posted = calls("POST", "/govern/account/erase");
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0][1]!.body as string)).toEqual({ confirm: PHRASE });
    expect(assign).toHaveBeenCalledWith("/login");
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
    await done();
  });

  it("when the account is gone but some files could not be deleted it says which instead of leaving silently", async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    const failed = [{ artifact_type: "image/png", error: "JSON_ARTIFACT_HASH_MISMATCH" }, { artifact_type: "image/png", error: "ARTIFACT_REFERENCE_MALFORMED" }];
    routes(settingsRoutes({ "POST /govern/account/erase": { cases: 1, runs: 1, records: 0, workflows: 0, tombstone: true, failed } }));
    const { host, done } = await mount(<SettingsPage />);
    await click(button(host, "我要刪除我的帳號"));
    await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, PHRASE); });
    await click(button(host, "永遠刪除"));
    expect(host.textContent).toContain("有 2 份 AI 產出的檔案沒能刪掉（image/png）");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
    await done();
  });

  it("a deletion stopped because something is still running says so, stays on the page and does not leave", async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    routes(settingsRoutes({ "POST /govern/account/erase": () => { throw new ApiError(409, "PROJECT_BUSY: a synthesis is still running"); } }));
    const { host, done } = await mount(<SettingsPage />);
    await click(button(host, "我要刪除我的帳號"));
    await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, PHRASE); });
    await click(button(host, "永遠刪除"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("還有東西在跑");
    expect(assign).not.toHaveBeenCalled();
    expect((button(host, "永遠刪除") as HTMLButtonElement).disabled).toBe(false);
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
    await done();
  });

  it("the phrase to type comes from the API, so the page and the server cannot disagree", async () => {
    routes(settingsRoutes({ "GET /govern/account": { ...SUMMARY, phrase: "另一句話" } }));
    const { host, done } = await mount(<SettingsPage />);
    await click(button(host, "我要刪除我的帳號"));
    expect(host.textContent).toContain("請照著打「另一句話」");
    await act(async () => { type(host.querySelector("#erase-phrase") as HTMLInputElement, PHRASE); });
    expect((button(host, "永遠刪除") as HTMLButtonElement).disabled).toBe(true);
    await done();
  });
});

describe("設定：你在哪裡、匯出、AI 解釋", () => {
  it("saves the place as the person's own document and shows the help for it", async () => {
    let held: unknown[] = [];
    let help = { notice: NOTICE, where: null as string | null, covered: false, resources: WORLD };
    routes({
      "GET /govern/help": () => help,
      "GET /me/docs/govern.location": () => held,
      "POST /me/docs/govern.location": (init?: RequestInit) => {
        const content = JSON.parse(init!.body as string).content;
        held = [doc("govern.location", content, { author: "user" })];
        help = { ...help, where: content.where, covered: true, resources: TAIWAN };
        return { ...(held[0] as object), notices: [] };
      },
    });
    const { host, done } = await mount(<SettingsPage />);
    expect(host.textContent).toContain("現在給你的是世界各地都能用的求助電話");
    await act(async () => { type(host.querySelector("#settings-where") as HTMLInputElement, "高雄"); });
    await click(button(host, "存起來"));
    expect(JSON.parse(calls("POST", "/me/docs/govern.location")[0][1]!.body as string)).toEqual({ content: { where: "高雄" } });
    expect(host.textContent).toContain("現在給你的是「高雄」的求助電話");
    expect(host.textContent).toContain("1925");
    expect(button(host, "存起來")).toHaveProperty("disabled", true);
    await done();
  });

  it("the export links point at the account and at nobody else's case", async () => {
    routes({ "GET /govern/help": { notice: NOTICE, where: null, covered: false, resources: WORLD }, "GET /me/docs/govern.location": [] });
    const { host, done } = await mount(<SettingsPage />);
    const hrefs = [...host.querySelectorAll("a[download]")].map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([exportHref(null, "md"), exportHref(null, "json")]);
    expect(hrefs.every((href) => href?.includes("/govern/export?format="))).toBe(true);
    expect(exportHref("P 1", "json")).toBe("/api/projects/P%201/govern/export?format=json");
    await done();
  });

  it("an AI explanation shows who wrote it, is not the person's record, and can be dropped", async () => {
    const explanation = { ...doc("govern.explanation", { explanation: "你在哪裡：這一項可以不填。" }, { author: "ai" }) };
    routes({
      "GET /govern/help": { notice: NOTICE, where: null, covered: false, resources: WORLD }, "GET /me/docs/govern.location": [],
      "POST /me/ai/GOVERN/explain": () => ({ saved: explanation, model: "m" }),
      "DELETE /me/docs/govern.explanation/govern.explanation-1": { status: "deleted" },
    });
    const { host, done } = await mount(<SettingsPage />);
    const ask = [...host.querySelectorAll("button")].find((item) => item.textContent === "請 AI 用白話說明這一項");
    await click(ask);
    expect(JSON.parse(calls("POST", "/me/ai/GOVERN/explain")[0][1]!.body as string)).toEqual({ context: { topic: "where" } });
    const shown = host.querySelector(".judge");
    expect(shown?.textContent).toContain("AI 寫的");
    expect(shown?.textContent).toContain("你在哪裡：這一項可以不填。");
    expect(shown?.textContent).toContain("不是你的紀錄");
    await click(button(host, "刪掉這段說明"));
    expect(calls("DELETE", "/me/docs/govern.explanation/govern.explanation-1")).toHaveLength(1);
    expect(host.querySelector(".judge")).toBeNull();
    await done();
  });
});

describe("求助", () => {
  it("shows the notice, the local lines first when the place is covered, and the world lines either way", async () => {
    routes({ "GET /govern/help": { notice: NOTICE, where: "台北", covered: true, resources: TAIWAN } });
    const { host, done } = await mount(<HelpPage />);
    expect(host.textContent).toContain(NOTICE);
    expect(host.textContent).toContain("你寫的地方：台北。這個地方有專屬的電話");
    expect([...host.querySelectorAll("li b")].map((item) => item.textContent).slice(0, 2)).toEqual([TAIWAN[0].name, TAIWAN[1].name]);
    expect(host.querySelector('a[href="https://findahelpline.com"]')?.getAttribute("rel")).toContain("noreferrer");
    expect((host.querySelector("#help-where") as HTMLInputElement).value).toBe("台北");
    await done();
  });

  it("looks up another place with the words typed, and says plainly when the place has no lines of its own yet", async () => {
    routes({
      "GET /govern/help": { notice: NOTICE, where: null, covered: false, resources: WORLD },
      "GET /govern/help?where=Paris": { notice: NOTICE, where: "Paris", covered: false, resources: WORLD },
    });
    const { host, done } = await mount(<HelpPage />);
    expect(button(host, "看這個地方的求助電話")).toHaveProperty("disabled", true);
    await act(async () => { type(host.querySelector("#help-where") as HTMLInputElement, "Paris"); });
    await click(button(host, "看這個地方的求助電話"));
    expect(calls("GET", "/govern/help?where=Paris")).toHaveLength(1);
    expect(host.textContent).toContain("你寫的地方：Paris。這個地方系統還沒有專屬的電話");
    await done();
  });
});

describe("GOVERN：這個案子的護欄和版本紀錄", () => {
  const shell = { "GET /projects/P1": { project_id: "P1", name: "合夥人改條件", created_at: "2026-10-03T00:00:00Z" }, "GET /projects/P1/proposals": [] };
  const guardrail = (guardrail: string, category: string, found_by: string, id: string) => doc("govern.guardrail", { guardrail, category, found_by }, { doc_id: id });

  it("lists each kind of risk with its guardrails and the block that found it, and nothing the person wrote", async () => {
    routes({
      ...shell,
      "GET /projects/P1/docs/govern.guardrail": [
        guardrail("require_sources", "法律", "SENSE", "g1"), guardrail("professional", "法律", "SENSE", "g2"), guardrail("wait_or_review", "法律", "SENSE", "g3"),
        guardrail("require_sources", "健康", "ASSEMBLER", "g4"),
      ],
      "GET /projects/P1/docs/govern.stop": [doc("govern.stop", { reason: "crisis", block: "SENSE" }, { doc_id: "s1" })],
    });
    const { host, done } = await mount(<GovernPage projectId="P1" />);
    const findings = [...host.querySelectorAll(".finding")];
    expect(findings.map((item) => item.querySelector("b")?.textContent)).toEqual(["健康", "法律"]);
    expect(findings[1].querySelectorAll("li")).toHaveLength(3);
    expect(findings[1].textContent).toContain("要求來源");
    expect(findings[1].textContent).toContain("外化發現");
    expect(findings[0].textContent).toContain("開案發現");
    expect(findings[0].textContent).toContain("系統");
    expect(host.textContent).toContain("AI 停下來的紀錄");
    expect(host.textContent).toContain("外化：出現危機的訊號");
    expect(host.querySelectorAll("a[download]")).toHaveLength(2);
    expect(host.querySelector("a[download]")?.getAttribute("href")).toBe(exportHref("P1", "md"));
    await done();
  });

  it("says so when the case has no guardrails", async () => {
    routes({ ...shell, "GET /projects/P1/docs/govern.guardrail": [], "GET /projects/P1/docs/govern.stop": [] });
    const { host, done } = await mount(<GovernPage projectId="P1" />);
    expect(host.textContent).toContain("這個案子現在沒有護欄。");
    expect(host.textContent).not.toContain("AI 停下來的紀錄");
    await done();
  });

  it("shows which model and which version of the instructions answered, and the rules in use", async () => {
    routes({
      ...shell,
      "GET /projects/P1/govern/versions": {
        ai_calls: [{ block: "SENSE", action: "mirror", model: "claude-opus-5-5", instructions_sha256: "0123456789abcdef".repeat(4), at: "2026-10-03T00:00:00Z" }],
        rules: [{ name: "ai_preamble", label: "給 AI 的共用指令", version: "aaaaaaaaaaaa" }, { name: "integrity", label: "完整性核心的規則", version: "v1-bbbbbbbbbbbb" }],
        kinds: [{ kind: "sense.card", block: "SENSE", title: "外化卡", definition: "cccccccccccc", documents: 2, versions: 5 }],
      },
    });
    const { host, done } = await mount(<VersionsPage projectId="P1" />);
    expect(host.textContent).toContain("這個案子的 AI 回答 1 次");
    expect(host.textContent).toContain("外化 · mirror");
    expect(host.textContent).toContain("模型 claude-opus-5-5");
    expect(host.querySelector("code")?.textContent).toBe("0123456789ab");
    expect(host.textContent).toContain("v1-bbbbbbbbbbbb");
    expect(host.textContent).toContain("2 份，共 5 版");
    expect(host.textContent).toContain("格子定義版本 cccccccccccc");
    await done();
  });

  it("another person's case is a plain error, not a page", async () => {
    routes({ "GET /projects/P1": () => { throw new ApiError(404, "PROJECT_NOT_FOUND: 'P1'"); }, "GET /projects/P1/proposals": [], "GET /projects/P1/govern/versions": () => { throw new ApiError(404, "PROJECT_NOT_FOUND: 'P1'"); } });
    const { host, done } = await mount(<VersionsPage projectId="P1" />);
    expect(host.textContent).toContain("找不到這個案子或分析");
    await done();
  });
});
