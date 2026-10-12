import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import { GatherPage, pastedSeed, runLine, searchSeed, type Overview } from "./GatherPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const CELL = { state: "查不到", why: "這一頁沒寫" };
const card = (id: string, extra: Record<string, unknown> = {}) => ({
  card: id, version: 1, source_id: `s-${id}`, url: `https://${id}.example.com/a`, title: `頁面 ${id}`, aside: "", found_by: { by: "系統找的", provider: "serper", lang: "zh" },
  cells: Object.fromEntries(["operator", "registered", "country", "language", "original", "first_seen", "stance", "affiliation", "party_relation", "outlet_exists"].map((key) => [key, CELL])),
  lists: [], snapshot: { sha256: "a".repeat(64), fetched_at: "2026-10-04T00:00:00Z" }, mine: {}, ...extra,
});
function overview(patch: Partial<Overview> = {}): Overview {
  return {
    origins: [{ origin_id: "o:1", cards: [card("a"), card("b")], how: "同一篇", pending: false, aside: false, counts: true, mark: null, wrong_in_review: [] }],
    changed_marks: [], counted: 1, min_origins: 2, aside: 0, data_classification: "Confidential", card_limit: { max: 800, cards: 2, uncarded: 0, notice: "" },
    channels: { engines: [{ key: "serper", name: "Serper（Google 的結果）" }], languages: [{ key: "zh", name: "中文" }], blocked: [{ provider: "brave", lang: "zh", state: "no_key", why: "平台還沒有這個搜尋引擎的金鑰", says: "Brave：平台還沒有這個搜尋引擎的金鑰" }],
                short: ["只用了 1 家搜尋引擎（Serper（Google 的結果））"], ask: [], looked: true },
    distribution: { engine: { "Serper（Google 的結果）": 2 }, language: { 查不到: 2 }, country: { 查不到: 2 } },
    rules: [{ name: "gather.grouping", title: "分組規則", version: "1", maintainer: "平台", items: { rules: ["同一篇：…"] } }],
    words: { cells: [{ key: "operator", label: "誰辦的" }, { key: "registered", label: "何時開始存在" }], states: ["查到", "查不到", "無法檢查"], marks: ["採用", "存疑", "不用"],
             applies: ["適用", "不適用", "不確定"], found_by: ["系統找的", "我貼的"], own: "我自己說的，還沒有外部出處", someone_said: "有人這樣說",
             angles: [{ key: "primary", name: "原始文件與官方公告" }, { key: "news", name: "報導" }, { key: "factcheck", name: "查核" }, { key: "precedent", name: "前例" }, { key: "field", name: "到過現場的人" }, { key: "opposite", name: "相反的說法" }, { key: "origin", name: "最早的出處" }],
             overridable: ["operator", "registered", "lists"], providers: [{ key: "serper", name: "Serper（Google 的結果）" }, { key: "brave", name: "Brave" }] },
    ...patch,
  };
}

/** A small stand-in for the API: documents by kind; the collection service is not configured (503 on confirm); ``runs``
 *  answers GET /collections/{run} with that run's status. */
function server(view: Overview, initial: Record<string, any[]> = {}, runs: Record<string, string> = {}) {
  const store: Record<string, any[]> = Object.fromEntries(Object.entries(initial).map(([kind, contents]) => [kind, contents.map((content, index) => ({ doc_id: `${kind}-${index + 1}`, kind, version: 1, content, author: "user", block: "GATHER", at: "2026-10-04T08:00:00Z" }))]));
  const writes: Array<{ method: string; path: string; body: any }> = [];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ method, path, body });
    if (path === "/projects/P1/gather") return view as never;
    if (path.endsWith("/proposals")) return [] as never;
    if (path === "/projects/P1") return { project_id: "P1", name: "續約", created_at: "2026-10-04T08:00:00Z" } as never;
    if (path === "/projects/P1/collections") {
      if (body.confirm) throw new ApiError(503, "COLLECTION_SERVICE_UNCONFIGURED: COLLECT_RESEARCH_RUNS_TOKEN is not set");
      return { plan: { seeds: body.seeds.length, max_queries: 16, max_fetches: 200 }, confirm_required: true } as never;
    }
    const run = /^\/projects\/P1\/collections\/([^/]+)$/.exec(path);
    if (run && method === "GET" && runs[run[1]]) return { status: runs[run[1]] } as never;
    if (path === "/projects/P1/sources" && method === "POST") return { source_id: "s-new" } as never;
    const one = /\/docs\/([^/]+)(?:\/([^/]+))?$/.exec(path);
    if (one && method === "GET") return (store[one[1]] ?? []) as never;
    if (one && method === "POST") {
      const doc = { doc_id: `${one[1]}-${(store[one[1]] ?? []).length + 1}`, kind: one[1], version: 1, content: body.content, author: "user", block: "GATHER", at: "2026-10-04T09:00:00Z" };
      store[one[1]] = [...(store[one[1]] ?? []), doc];
      return { ...doc, notices: [] } as never;
    }
    if (one && method === "DELETE") {
      store[one[1]] = (store[one[1]] ?? []).filter((doc) => doc.doc_id !== one[2]);
      return { status: "deleted" } as never;
    }
    if (one && method === "PUT") {
      const found = store[one[1]].find((doc) => doc.doc_id === one[2]);
      Object.assign(found, { version: found.version + 1, content: body.content });
      return { ...found, notices: [] } as never;
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
  return { store, writes };
}

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const byText = (host: HTMLElement, selector: string, text: string) => [...host.querySelectorAll(selector)].find((node) => node.textContent?.trim() === text);
async function type(element: Element | null, value: string) {
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  const proto = field instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("蒐集來源", () => {
  it("sends a search and a pasted URL in the collector's shape (wire v2)", () => {
    expect(searchSeed("1234567890", " 公會有沒有改合約 ", ["primary", "news"], ["serper", "brave"])).toEqual({
      uri: "entity://claim/12345678", meta: { kind: "claim", entityName: "公會有沒有改合約", angles: ["primary", "news"], languages: ["zh", "en"], providers: ["serper", "brave"] } });
    expect(searchSeed("x", "a".repeat(300), ["origin"], ["serper"]).meta.entityName).toHaveLength(200);
    expect(pastedSeed(" https://a.example.com/x ")).toEqual({ uri: "https://a.example.com/x", meta: { pasted: true } });
  });

  it("shows the plan before searching, keeps the question, and says plainly that the search service is not connected here", async () => {
    const { writes } = server(overview());
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    await type(host.querySelector("#gather-question"), "公會有沒有改合約");
    await click(byText(host, '[aria-label="用哪些搜尋引擎"] button', "Brave"));   // 你可以關掉某個搜尋管道
    await click(byText(host, "button", "去找"));
    expect(writes.map((write) => [write.method, write.path, write.body?.confirm])).toEqual([["POST", "/projects/P1/docs/gather.ask", undefined], ["POST", "/projects/P1/collections", undefined]]);
    expect(writes[1].body.seeds[0].meta).toMatchObject({ kind: "claim", entityName: "公會有沒有改合約", languages: ["zh", "en"], providers: ["serper"] });
    const plan = host.querySelector('[aria-label="會怎麼找"]')?.textContent ?? "";
    expect(plan).toContain("最多 16 組查詢");
    expect(plan).toContain("上一次真的用上：Serper（Google 的結果）。Brave：平台還沒有這個搜尋引擎的金鑰。");   // the channels' real state, not a fixed claim
    expect(host.textContent).not.toContain("兩家搜尋引擎");
    await click(byText(host, "button", "確定去找"));
    expect(writes.at(-1)!.body.confirm).toBe(true);
    expect(host.querySelector(".error")?.textContent).toBe("這裡還沒接上找資料的服務，系統現在不能去找。你可以自己貼網址或檔案。");
    expect(host.textContent).toContain("還沒去找");
    await done();
  });

  it("keeps my own words apart: they never go to the sources, and a file needs who published it", async () => {
    const { writes } = server(overview());
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    await type(host.querySelector('textarea[aria-label="我自己說的，還沒有外部出處"]'), "我聽同業說公會要改合約");
    await click([...host.querySelectorAll("button")].find((button) => button.textContent === "存" && !button.hasAttribute("disabled")));
    expect(writes.map((write) => write.path)).toEqual(["/projects/P1/docs/gather.own"]);
    await type(host.querySelector("#gather-file-title"), "會員信");
    await type(host.querySelector("#gather-file-text"), "公會說第七條要改");
    expect((byText(host, "button", "存這份檔案") as HTMLButtonElement).disabled).toBe(true);   // 沒有出處 = 我自己說的
    await type(host.querySelector("#gather-file-venue"), "某產業公會，2026 年 9 月寄給會員");
    await click(byText(host, "button", "存這份檔案"));
    expect(writes.at(-1)).toMatchObject({ method: "POST", path: "/projects/P1/sources", body: { title: "會員信", venue: "某產業公會，2026 年 9 月寄給會員", data_classification: "Confidential", media_type: "text/plain" } });
    expect(writes.filter((write) => write.path.endsWith("/sources")).every((write) => write.body.content !== "我聽同業說公會要改合約")).toBe(true);
    await done();
  });

  it("stops under two origins and with too few channels, and lets me go on", async () => {
    server(overview());
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    const stop = host.querySelector(".card.accent[role=status]")!;
    expect(stop.textContent).toContain("找到 1 個獨立出處，不到 2 個");
    expect(stop.textContent).toContain("管道不足：只用了 1 家搜尋引擎");
    expect(host.textContent).toContain("Brave：平台還沒有這個搜尋引擎的金鑰。");
    expect(host.textContent).not.toContain("無法檢查：Brave");
    await click(byText(stop as HTMLElement, "button", "照樣繼續"));
    expect(host.textContent).toContain("你選了照樣繼續");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("shows a channel's sentence as the engine sent it: the engine's name once, and nothing put in front of it (走查 2026-10-12 W11)", async () => {
    const says = "Brave：這個搜尋引擎回了錯誤（HTTP 422）";
    server(overview({ channels: { engines: [{ key: "serper", name: "Serper（Google 的結果）" }], languages: [{ key: "zh", name: "中文" }],
      blocked: [{ provider: "brave", lang: "zh", state: "unreachable", why: "這個搜尋引擎回了錯誤（HTTP 422）", says }], short: [], ask: [], looked: true } }));
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    const lines = [...host.querySelectorAll("p.warn")].map((node) => node.textContent);
    expect(lines).toContain(`${says}。`);
    expect(host.textContent).not.toContain("無法檢查：Brave");
    expect(host.textContent).not.toContain("Brave Brave");
    expect((host.textContent ?? "").split("Brave：").length - 1).toBe(1);   // said once on the overview
    await done();
  });

  it("stops under two origins after a search that finished with nothing, never before any search ran", async () => {
    const empty = overview({ origins: [], counted: 0, channels: { engines: [{ key: "serper", name: "Serper（Google 的結果）" }, { key: "brave", name: "Brave" }],
      languages: [{ key: "zh", name: "中文" }, { key: "en", name: "英文" }], blocked: [], short: [], ask: [], looked: true } });
    const ask = { text: "公會有沒有改合約", angles: ["primary"], run: "r1" };
    for (const [status, shown] of [["completed", true], ["failed", true], ["running", false]] as const) {
      server(empty, { "gather.ask": [ask] }, { r1: status });
      const { host, done } = await mount(<GatherPage projectId="P1" />);
      expect(host.querySelector(".card.accent[role=status]")?.textContent ?? "", status).toBe(shown ? "系統先停在這裡，由你決定找到 0 個獨立出處，不到 2 個。很多網頁可能出自同一個地方。再去找照樣繼續" : "");
      await done();
    }
    server(overview({ origins: [], counted: 0, channels: { engines: [], languages: [], blocked: [], short: [], ask: [], looked: false } }));
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    expect(host.querySelector(".card.accent[role=status]")).toBeNull();   // nothing searched yet: nothing to stop on
    await done();
  });

  it("marks a group of pages together with a reason", async () => {
    const { writes } = server(overview());
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    await click(byText(host, "button", "標這個出處"));
    await click(byText(host, '[aria-label="採用、存疑或不用"] button', "存疑"));
    await type(host.querySelector("#reason-o\\:1"), "兩頁都沒寫誰辦的");
    await click(byText(host, "button", "存標記"));
    expect(writes.at(-1)).toMatchObject({ method: "POST", path: "/projects/P1/docs/gather.mark", body: { content: { origin: "o:1", cards: ["a", "b"], mark: "存疑", reason: "兩頁都沒寫誰辦的" } } });
    await done();
  });

  it("lists my splits and lets me take one back", async () => {
    const { writes } = server(overview(), { "gather.split": [{ cards: ["b"], reason: "改寫過，不是同一篇" }] });
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    expect(host.textContent).toContain("頁面 b（改寫過，不是同一篇）");
    await click(byText(host, "button", "取消拆開"));
    expect(writes.at(-1)).toMatchObject({ method: "DELETE", path: "/projects/P1/docs/gather.split/gather.split-1" });
    expect(host.textContent).not.toContain("取消拆開");
    await done();
  });

  it("says when the case holds the most source cards it can", async () => {
    server(overview({ card_limit: { max: 800, cards: 800, uncarded: 3, notice: "這個案子的來源卡已經到上限 800 張，之後存進來的網頁沒有做卡" } }));
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    expect(host.querySelector(".warn[role=status]")?.textContent).toBe("這個案子的來源卡已經到上限 800 張，之後存進來的網頁沒有做卡；現在有 3 頁沒有做卡，不算進出處。");
    await done();
  });
});

describe("蒐集來源：找的時候說得出知道的，來源卡先給找到的（走查 2026-10-11 B5、B6）", () => {
  it("while a search runs, says only what the server reports: how long since it was sent, when it ends at the latest, how many pages at most", () => {
    const now = Date.parse("2026-10-11T08:07:30Z");
    const run = { status: "running", requested_at: "2026-10-11T08:00:00+00:00", deadline_at: "2026-10-11T08:15:00+00:00", max_fetches: 200 };
    expect(runLine(run, now)).toBe("系統正在找。已經過了 7 分鐘。最晚再 8 分鐘會結束。最多抓 200 頁。找完，來源會出現在下面的「來源總覽」。");
    expect(runLine({ ...run, status: "requested" }, Date.parse("2026-10-11T08:00:20Z"))).toMatch(/^已經送出，等找資料的服務接手。已經過了不到 1 分鐘。/);
    expect(runLine({ ...run, status: "completed" }, now)).toBe("找完了");
    expect(runLine({ status: "" }, now)).toBe("讀不到進度");
    expect(runLine(undefined, now)).toBe("讀不到進度");
    expect(runLine({ status: "running" }, now)).toBe("系統正在找。找完，來源會出現在下面的「來源總覽」。");   // nothing invented when the server says nothing
  });

  it("shows a card's found cells first and folds every 查不到／無法檢查 cell into one line that opens to all of them", async () => {
    const found = card("a", { cells: { operator: { state: "查到", value: "某產業公會" }, registered: CELL } });
    server(overview({ origins: [{ origin_id: "o:1", cards: [found], how: "單獨", pending: false, aside: false, counts: true, mark: null, wrong_in_review: [] }] }));
    const { host, done } = await mount(<GatherPage projectId="P1" />);
    const box = host.querySelector(".mcard")!;
    const table = box.querySelector(":scope > table.plan")!;
    expect(table.textContent).toContain("誰辦的查到：某產業公會");
    expect(table.textContent).not.toContain("何時開始存在");
    const fold = box.querySelector("details.dir")!;
    expect(fold.querySelector("summary")?.textContent).toBe("另有 1 項查不到或無法檢查");
    expect(fold.textContent).toContain("何時開始存在查不到：這一頁沒寫");   // nothing left out, only folded
    await done();
  });
});
