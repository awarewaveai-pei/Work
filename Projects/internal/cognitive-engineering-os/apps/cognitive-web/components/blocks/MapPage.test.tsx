import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import type { MapContent, MapSpec } from "../../lib/map";
import { MapPage } from "./MapPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const SPEC: MapSpec = {
  layers: [
    { key: "facts", name: "事實", question: "到底發生了什麼？", output: "可觀察事件、資料與來源" },
    { key: "interpretations", name: "解釋", question: "同一事實有哪些理解？", output: "目前敘事、替代敘事、推論鏈" },
    { key: "interests", name: "利益", question: "每個角色真正想要或害怕什麼？", output: "誘因、損失、隱性動機" },
    { key: "structure", name: "結構", question: "規則、角色、權力、資源怎麼配置？", output: "權責圖、資訊不對稱、制度限制" },
    { key: "core", name: "核心矛盾", question: "哪個上游問題不解，其他都只是症狀？", output: "核心衝突假設" },
    { key: "intervention", name: "介入", question: "最小且槓桿最高的改變是什麼？", output: "可逆試驗、介入方案、風險" },
  ],
  claim_kinds: [
    { kind: "事實", needs: "要可追溯的證據與查證", details: [{ key: "evidence", label: "證據，或怎麼查證" }] },
    { kind: "法律", needs: "要標適用法域、時效、來源", details: [{ key: "jurisdiction", label: "適用法域" }, { key: "limitation", label: "時效" }, { key: "source", label: "來源" }] },
    { kind: "價值", needs: "要說清楚依據的原則", details: [] },
    { kind: "文化宗教", needs: "當事人的理解放在前面", details: [{ key: "own_understanding", label: "你自己怎麼理解" }] },
  ],
  unwinnable: { questions: [{ q: 0, question: "目標是不是大到到過現場的人都不敢這樣寫？", example: "英國的例子" }], answers: ["是", "否", "不確定"], reasons: ["我支持的政府貪腐到失去正當性", "鄰國支持我的對手"], reasons_reading: "我們的解讀，不是 Farrell 說的：兩個都不是多投入就能解決的。", source: "題目出自 Theo Farrell 談英國在阿富汗作戰的講稿。" },
};
const TOOLS = [
  { method_id: "systems.iceberg_model", name: "冰山模型", family: "systems", family_zh: "系統思考", version: "1.0.0", used: false },
  { method_id: "root_cause.fishbone", name: "魚骨圖", family: "root_cause", family_zh: "根因分析", version: "1.2.0", used: true },
];

type Stored = { doc_id: string; kind: string; version: number; content: any; author: string; block: string; at: string };
/** A small stand-in for the API: documents by kind, a save is the next version, the rest answers what the page asks. */
function server(initial: Record<string, any[]>) {
  const store: Record<string, Stored[]> = Object.fromEntries(Object.entries(initial).map(([kind, contents]) => [kind, contents.map((content, index) => ({ doc_id: `${kind}-${index + 1}`, kind, version: content.__version ?? 1, content: (({ __version, ...rest }) => rest)(content), author: "user", block: "MAP", at: "2026-10-03T08:00:00Z" }))]));
  const writes: Array<{ method: string; path: string; body: any }> = [];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ method, path, body });
    if (path === "/blocks/map/spec") return SPEC as never;
    if (path.endsWith("/map/methods")) return TOOLS as never;
    if (path.endsWith("/proposals")) return [] as never;
    if (/^\/projects\/[^/]+$/.test(path)) return { project_id: "P1", name: "續約", created_at: "2026-10-03T08:00:00Z" } as never;
    const versions = /\/docs\/([^/]+)\/([^/]+)\/versions$/.exec(path);
    if (versions) return (store[versions[1]] ?? []).filter((doc) => doc.doc_id === versions[2]) as never;
    const one = /\/docs\/([^/]+)(?:\/([^/]+))?$/.exec(path);
    if (one && method === "GET") return (store[one[1]] ?? []) as never;
    if (one && method === "POST") {
      const doc = { doc_id: `${one[1]}-${(store[one[1]] ?? []).length + 1}`, kind: one[1], version: 1, content: body.content, author: "user", block: "MAP", at: "2026-10-03T09:00:00Z" };
      store[one[1]] = [...(store[one[1]] ?? []), doc];
      return { ...doc, notices: [] } as never;
    }
    if (one && method === "PUT") {
      const found = store[one[1]].find((doc) => doc.doc_id === one[2])!;
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
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); };
const byText = (host: HTMLElement, selector: string, text: string) => [...host.querySelectorAll(selector)].find((node) => node.textContent?.includes(text));
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const FACT = { id: "f1", text: "合夥人第三次改條件", by: "user", sources: 0, self_said: true };
const OUTSIDE = { id: "f2", text: "網路上說同業都這樣改", by: "user", sources: 1, self_said: false };

describe("拆解", () => {
  it("shows the six layers with the question each answers and what it hands over, and no dropdown anywhere", async () => {
    server({});
    const { host, done } = await mount(<MapPage projectId="P1" />);
    const stations = [...host.querySelectorAll(".station")];
    expect(stations).toHaveLength(6);
    expect(stations[0].textContent).toContain("到底發生了什麼？");
    expect(stations[0].textContent).toContain("這一層要交出：可觀察事件、資料與來源");
    expect(stations[4].textContent).toContain("哪個上游問題不解，其他都只是症狀？");
    expect(host.querySelector("select")).toBeNull();
    expect(stations.every((station) => station.querySelector('a[href$="/context#layer-' + station.id.replace("layer-", "") + '"]'))).toBe(true);   // the lens opens from every layer
    await done();
  });

  it("says a fact you wrote has no outside source yet, flags one with a single source, and tells you the AI held it back", async () => {
    server({ "map.map": [{ layers: { facts: [FACT, OUTSIDE] } }] });
    const { host, done } = await mount(<MapPage projectId="P1" />);
    const facts = host.querySelector("#layer-facts")!;
    expect(facts.textContent).toContain("我自己說的，還沒有外部出處");
    expect(facts.textContent).toContain("只有 1 個出處");
    expect(facts.textContent).toContain("AI 沒有用它們");
    expect(facts.querySelector(".card.accent")?.textContent).toContain("網路上說同業都這樣改");
    expect(facts.querySelector(".card.accent")?.textContent).not.toContain("合夥人第三次改條件");
    await done();
  });

  it("puts a card in the layer you pick as a copy, and the save is the next version of the one map", async () => {
    const { writes } = server({ "map.map": [{ layers: { facts: [FACT] } }], "sense.card": [{ category: "恐懼", text: "我怕他生氣" }] });
    const { host, done } = await mount(<MapPage projectId="P1" />);
    expect(host.textContent).toContain("1 張還沒放");
    await click(byText(host, ".mcard .chips button", "利益"));
    expect(host.textContent).toContain("有還沒存的改動");
    await click(byText(host, "button", "存成新的一版"));
    const put = writes.find((write) => write.method === "PUT" && write.path.endsWith("/docs/map.map/map.map-1"))!;
    expect(put.body.base_version).toBe(1);
    const saved = put.body.content as MapContent;
    expect(saved.layers?.interests).toEqual([expect.objectContaining({ text: "我怕他生氣", by: "user", card: "sense.card-1" })]);
    expect(saved.layers?.facts).toEqual([FACT]);   // what was there is kept
    await done();
  });

  it("keeps the tool you picked with its version, offers only tools not used in this case, and marks the reading after Farrell's two reasons as ours", async () => {
    const { writes } = server({});
    const { host, done } = await mount(<MapPage projectId="P1" />);
    const chips = [...host.querySelectorAll('[aria-label="可以選的拆法"] button')].map((chip) => chip.textContent);
    expect(chips).toEqual(["冰山模型"]);   // 魚骨圖 was used in this case
    expect(host.querySelector("#unwinnable")?.textContent).toContain("我們的解讀，不是 Farrell 說的");
    await click(byText(host, '[aria-label="可以選的拆法"] button', "冰山模型"));
    await click(byText(host, "button", "存第一版"));
    const saved = writes.find((write) => write.method === "POST" && write.path.endsWith("/docs/map.map"))!.body.content as MapContent;
    expect([saved.method, saved.method_id, saved.method_version]).toEqual(["冰山模型", "systems.iceberg_model", "1.0.0"]);
    await done();
  });

  it("brings each ticked facet's two answers to the structure and the core-conflict layers, and no unticked one", async () => {
    server({ "context.notes": [{ facets: [{ facet: "文化", relevant: true, defines_normal: "重人情", is_cause: "可能是" }, { facet: "宗教", relevant: false }] }] });
    const { host, done } = await mount(<MapPage projectId="P1" />);
    for (const key of ["structure", "core"]) {
      expect(host.querySelector(`#layer-${key}`)?.textContent).toContain("重人情");
      expect(host.querySelector(`#layer-${key}`)?.textContent).not.toContain("宗教");
    }
    expect(host.querySelector("#layer-facts")?.textContent).not.toContain("重人情");
    await done();
  });

  it("keeps the core conflict a plain box only you write", async () => {
    const { writes } = server({});
    const { host, done } = await mount(<MapPage projectId="P1" />);
    const box = host.querySelector<HTMLTextAreaElement>("#core-conflict")!;
    expect(host.querySelector("#layer-core")?.textContent).toContain("只有你寫。AI 不替你決定。");
    await act(async () => { type(box, "我們對合作的期待不同"); });
    await click(byText(host, "button", "存第一版"));
    expect(writes.find((write) => write.method === "POST" && write.path.endsWith("/docs/map.map"))?.body.content.core_conflict).toBe("我們對合作的期待不同");
    expect(byText(host, "#layer-core button", "AI")).toBeUndefined();
    await done();
  });

  it("asks a culture or religion line for your own understanding before it counts as a claim", async () => {
    const { writes } = server({
      "map.map": [{ layers: { interpretations: [{ id: "i9", text: "他們的傳統不准這樣", by: "user" }] } }],
      "map.claim_proposal": [{ proposals: [{ item: "i9", kind: "文化宗教" }] }],
    });
    const { host, done } = await mount(<MapPage projectId="P1" />);
    const confirm = byText(host, "button", "確認成主張") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await act(async () => { type(host.querySelector<HTMLTextAreaElement>("#own-i9")!, "在我們家這是長輩的規矩"); });
    expect((byText(host, "button", "確認成主張") as HTMLButtonElement).disabled).toBe(false);
    await click(byText(host, "button", "確認成主張"));
    await click(byText(host, "button", "存成新的一版"));
    const saved = writes.find((write) => write.method === "PUT")!.body.content as MapContent;
    expect(saved.claims).toEqual([expect.objectContaining({ kind: "文化宗教", by: "ai", item: "i9", details: { own_understanding: "在我們家這是長輩的規矩" } })]);
    const review = writes.find((write) => write.path.endsWith("/docs/map.review"))!;
    expect(review.body.content).toEqual({ suggestion: "map.claim_proposal-1", version: 1, key: "i9", decision: "採用" });
    await done();
  });

  it("marks a law claim 未確認 until it has its 法域、時效 and 來源", async () => {
    server({ "map.map": [{ layers: { facts: [FACT] }, claims: [{ id: "c1", text: "他能不能自己改合約", kind: "法律", by: "user", item: "f1" }] }] });
    const { host, done } = await mount(<MapPage projectId="P1" />);
    expect(host.textContent).toContain("未確認");
    await act(async () => { type(host.querySelector<HTMLInputElement>("#c1-jurisdiction")!, "某國"); type(host.querySelector<HTMLInputElement>("#c1-limitation")!, "三年"); type(host.querySelector<HTMLInputElement>("#c1-source")!, "民法第 1 條"); });
    expect(host.querySelector(".tags")?.textContent).not.toContain("未確認");
    await done();
  });

  it("puts two versions side by side after a method is changed", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === "/blocks/map/spec") return SPEC as never;
      if (path.endsWith("/map/methods")) return TOOLS as never;
      if (path.endsWith("/proposals")) return [] as never;
      if (/^\/projects\/[^/]+$/.test(path)) return { project_id: "P1", name: "續約", created_at: "x" } as never;
      if (path.endsWith("/versions")) return [
        { doc_id: "m", kind: "map.map", version: 1, content: { method: "冰山模型", layers: { facts: [FACT] } }, author: "user", block: "MAP", at: "2026-10-03T08:00:00Z" },
        { doc_id: "m", kind: "map.map", version: 2, content: { method: "利害關係人圖", layers: { interests: [{ id: "x", text: "客戶要穩定", by: "user" }] } }, author: "user", block: "MAP", at: "2026-10-03T09:00:00Z" },
      ] as never;
      if (path.endsWith("/docs/map.map")) return [{ doc_id: "m", kind: "map.map", version: 2, content: { method: "利害關係人圖", layers: { interests: [{ id: "x", text: "客戶要穩定", by: "user" }] } }, author: "user", block: "MAP", at: "2026-10-03T09:00:00Z" }] as never;
      return [] as never;
    });
    const { host, done } = await mount(<MapPage projectId="P1" />);
    const table = host.querySelector("table")!;
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([" ", "第 1 版", "第 2 版"]);
    const cells = [...table.querySelectorAll("tbody tr")].find((row) => row.querySelector("td")?.textContent === "拆法")!.querySelectorAll("td");
    expect([cells[1].textContent, cells[2].textContent]).toEqual(["冰山模型", "利害關係人圖"]);
    await done();
  });
});
