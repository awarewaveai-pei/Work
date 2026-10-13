import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import type { ContextSpec, Notes } from "../../lib/context";
import type { MapSpec } from "../../lib/map";
import { ContextPage } from "./ContextPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.resetAllMocks(); window.location.hash = ""; });

const SPEC: ContextSpec = {
  version: "2026-10-03.1",
  facets: [{ facet: "文化", definition: "什麼被當成理所當然；傳統內部也有不同的聲音" }, { facet: "法律", definition: "適用哪裡的法律、時效、來源" }, { facet: "經濟", definition: "就業、物價、貧富" }],
  facet_questions: [{ key: "defines_normal", question: "它怎麼界定這裡的「正常、正確、允許」？" }, { key: "is_cause", question: "它是不是造成這件事的原因之一？" }],
  checks: [
    { key: "rights_duties", question: "誰有權決定、誰負什麼義務、這樣正不正當", how: "寫下：誰有權利、誰有義務，和它正當的條件。" },
    { key: "norm_origin", question: "這條規範從哪來、誰定的、誰傳下來、誰受益", how: "寫下：這條規範的來源。" },
    { key: "claim_kind", question: "它是事實、法律條件，還是價值", how: "這一項在拆解的主張欄做。" },
    { key: "stance", question: "你是真心認同、暫時遵守、仍有保留，還是沒看見別的可能", how: "寫下：暫定的立場。" },
  ],
  stances: ["真心認同", "暫時遵守", "仍有保留", "沒看見別的可能"],
  own_first: { facets: ["文化", "宗教"], note: "先寫你自己怎麼理解。傳統內部也有不同的詮釋；你的理解放在平台的任何說法之前。" },
  public_issue: { package: "公共議題判斷", questions: ["個體判斷權與制度決策權在哪裡相遇？", "制度何時有正當理由限制個體選擇？", "誰來判斷「共同利益」？", "如果制度必須保有權威，如何避免權威變成認知上的接管？", "如果個體必須保有自主，如何避免自主變成拒絕一切共同責任？"] },
};
const MAP_SPEC: MapSpec = {
  layers: [{ key: "facts", name: "事實", question: "q", output: "o" }, { key: "structure", name: "結構", question: "q", output: "o" }],
  category_layer: {},
  claim_kinds: [{ kind: "法律", needs: "", details: [{ key: "jurisdiction", label: "適用法域" }, { key: "limitation", label: "時效" }, { key: "source", label: "來源" }] }],
  unwinnable: { questions: [], answers: [], reasons: [], reasons_reading: "", source: "" },
};

type Stored = { doc_id: string; kind: string; version: number; content: any; author: string; block: string; at: string };
/** GET /projects/{id}/context/claims as the engine answers it (kinds/context.py case_claims, claim_counts). */
const NO_CLAIMS = { claims: [], counts: { 事實: 0, 法律: 0, 價值: 0, 文化宗教: 0, 其他: 0 } };
function server(initial: Record<string, any[]>, claimed: unknown = NO_CLAIMS) {
  const store: Record<string, Stored[]> = Object.fromEntries(Object.entries(initial).map(([kind, contents]) => [kind, contents.map((content, index) => ({ doc_id: `${kind}-${index + 1}`, kind, version: 1, content, author: "user", block: "CONTEXT", at: "2026-10-03T08:00:00Z" }))]));
  const writes: Array<{ method: string; path: string; body: any }> = [];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ method, path, body });
    if (path === "/blocks/context/spec") return SPEC as never;
    if (path === "/blocks/map/spec") return MAP_SPEC as never;
    if (path.endsWith("/proposals")) return [] as never;
    if (path.endsWith("/context/claims")) { if (claimed instanceof Error) throw claimed; return claimed as never; }
    if (/^\/projects\/[^/]+$/.test(path)) return { project_id: "P1", name: "續約", created_at: "x" } as never;
    if (path.endsWith("/ai/CONTEXT/point_facets")) {
      const doc = { doc_id: "context.pointers-1", kind: "context.pointers", version: 1, content: { facets: [{ facet: "經濟", why: "你寫到續約的錢" }] }, author: "ai", block: "CONTEXT", at: "2026-10-03T09:00:00Z" };
      store["context.pointers"] = [doc];
      return { saved: doc } as never;
    }
    const one = /\/docs\/([^/]+)(?:\/([^/]+))?$/.exec(path);
    if (one && method === "GET") return (store[one[1]] ?? []) as never;
    if (one && method === "POST") {
      const doc = { doc_id: `${one[1]}-1`, kind: one[1], version: 1, content: body.content, author: "user", block: "CONTEXT", at: "x" };
      store[one[1]] = [doc];
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

describe("規範與脈絡", () => {
  it("lists every facet with its one-line meaning, asks the two questions only for a facet you ticked, and has no dropdown", async () => {
    server({});
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    const cards = [...host.querySelectorAll("#facet-文化, #facet-法律, #facet-經濟")];
    expect(cards.map((card) => card.querySelector("b")?.textContent)).toEqual(["文化", "法律", "經濟"]);
    expect(cards[0].textContent).toContain("傳統內部也有不同的聲音");
    expect(host.querySelectorAll("textarea[id$='defines_normal']")).toHaveLength(0);
    await click(byText(cards[0] as HTMLElement, "button", "有關"));
    expect(host.querySelector("#文化-defines_normal")).not.toBeNull();
    expect(host.querySelector("#文化-is_cause")).not.toBeNull();
    expect(host.querySelector("#經濟-is_cause")).toBeNull();
    const card = (name: string) => host.querySelector(`#facet-${name}`) as HTMLElement;   // a facet marked 有關 moves out of 其他面向: ask for it again
    expect(card("文化").textContent).toContain("先寫你自己怎麼理解");   // 文化: your own understanding first
    await click(byText(card("經濟"), "button", "有關"));
    expect(card("經濟").textContent).not.toContain("先寫你自己怎麼理解");   // 經濟: no such note
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("saves the notes as the next version with the version of the facet list they were written with", async () => {
    const { writes } = server({ "context.notes": [{ facets: [{ facet: "文化", relevant: true }] }] });
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    await act(async () => { type(host.querySelector<HTMLTextAreaElement>("#文化-defines_normal")!, "重人情"); });
    await click(byText(host, "button", "存成新的一版"));
    const put = writes.find((write) => write.method === "PUT")!;
    expect(put.body.base_version).toBe(1);
    expect(put.body.content).toEqual({ facets: [{ facet: "文化", relevant: true, defines_normal: "重人情" }], facets_version: "2026-10-03.1" });
    await done();
  });

  it("offers the places the intake wrote, picks none for you, and a law claim without its source is 未確認", async () => {
    server({
      "assembler.intake": [{ question: "q", happened_in: ["高雄"], you_are_in: "東京" }],
    }, { claims: [{ id: "c1", text: "他能不能自己改合約", kind: "法律", from: "MAP", missing: ["時效", "來源"] }], counts: { ...NO_CLAIMS.counts, 法律: 1 } });
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    const chips = [...host.querySelectorAll('[aria-label="適用哪裡的法律"] button')];
    expect(chips.map((chip) => chip.textContent)).toEqual(["高雄", "東京"]);
    expect(chips.every((chip) => chip.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(host.textContent).toContain("他能不能自己改合約");
    expect(host.textContent).toContain("未確認");
    expect(host.textContent).toContain("還缺：時效、來源");
    expect(host.textContent).toContain("有法律主張，但還沒標適用哪裡的法律");
    await done();
  });

  it("counts and lists the case's claims from the server's one set -- MAP's and VERIFY's together -- and says plainly what a law claim lacks (走查 2026-10-12 W15)", async () => {
    server({}, {
      claims: [
        { id: "c1", text: "他能不能自己改合約", kind: "法律", from: "MAP", missing: [] },
        { id: "v1", text: "公會規定要三十天前通知", kind: "法律", from: "VERIFY", missing: ["適用法域", "時效"] },
        { id: "v2", text: "對方說同業都這樣改", kind: "事實", from: "VERIFY", missing: [] },
        { id: "v3", text: "這樣不公平", kind: "", from: "VERIFY", missing: [] },
      ],
      counts: { 事實: 1, 法律: 2, 價值: 0, 文化宗教: 0, 其他: 1 },
    });
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    const items = [...host.querySelectorAll("ul.check > li")].map((item) => item.textContent);
    expect(items).toHaveLength(2);   // only the 法律 ones are listed here
    expect(items[0]).toContain("法域、時效、來源都寫了");
    expect(items[1]).toContain("公會規定要三十天前通知");
    expect(items[1]).toContain("未確認");
    expect(items[1]).toContain("還缺：適用法域、時效。到查證主張補。");
    expect(host.querySelector('ul.check li:nth-child(2) a')?.getAttribute("href")).toBe("/projects/P1/verify");
    expect(host.textContent).toContain("目前標了：事實 1、法律 2、價值 0、文化宗教 0；還沒歸進這四種的 1 個。");
    expect(host.textContent).toContain("有法律主張，但還沒標適用哪裡的法律");
    await done();
  });

  it("says so when the case's claims cannot be read, instead of showing zero of everything", async () => {
    server({}, new ApiError(500, "INTERNAL"));
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    expect(host.textContent).toContain("這個案子的主張這次讀不到");
    expect(host.textContent).toContain("主張的數目這次讀不到");
    expect(host.textContent).not.toContain("事實 0");
    await done();
  });

  it("shows the public-issue questions only for that package", async () => {
    server({ "assembler.intake": [{ question: "q", package: "個人複雜決策" }] });
    const first = await mount(<ContextPage projectId="P1" />);
    expect(first.host.querySelector("#pub-1")).toBeNull();
    await first.done();
    server({ "assembler.intake": [{ question: "q", package: "公共議題判斷" }] });
    const second = await mount(<ContextPage projectId="P1" />);
    expect(second.host.querySelectorAll("[id^='pub-']")).toHaveLength(5);
    // 2026-10-13: the operator's plain wording is what is asked, the original under it
    const field = second.host.querySelector("#pub-1")!.closest(".field")!;
    expect(field.querySelector("label")?.textContent).toBe("1. 個人的判斷與共同的規則，該如何取得平衡？");
    expect(field.querySelector(".hint")?.textContent).toBe("原題：個體判斷權與制度決策權在哪裡相遇？");
    await second.done();
  });

  it("the AI only points, and a facet you answer is not pointed at again", async () => {
    const { writes } = server({ "assembler.intake": [{ question: "要不要續約" }] });
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    await click(byText(host, "button", "請 AI 提醒還沒看的面向"));
    expect(writes.find((write) => write.path.endsWith("/ai/CONTEXT/point_facets"))).toBeDefined();
    const judge = host.querySelector(".judge")!;
    expect(judge.textContent).toContain("AI 寫的");
    expect(judge.textContent).toContain("你寫到續約的錢");
    await click(byText(judge as HTMLElement, "button", "無關"));
    expect(host.querySelector(".judge")).toBeNull();
    expect(byText(host.querySelector("#facet-經濟") as HTMLElement, "button", "無關")?.getAttribute("aria-pressed")).toBe("true");
    await done();
  });

  it("shows the facets you marked 有關 and the ones you added; the rest wait in 其他面向, none removed (走查 2026-10-12 W14)", async () => {
    server({ "context.notes": [{ facets: [{ facet: "文化", relevant: true }, { facet: "經濟", relevant: false }, { facet: "戰爭", relevant: true, custom: true, definition: "自己加的" }] }] });
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    const fold = [...host.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent === "其他面向（2 個）") as HTMLDetailsElement;
    expect(fold).toBeDefined();
    expect(fold.open).toBe(false);
    const shown = [...host.querySelectorAll(".mcards")].filter((list) => !fold.contains(list)).flatMap((list) => [...list.querySelectorAll(":scope > .mcard")].map((card) => card.querySelector("b")?.textContent));
    expect(shown).toEqual(["文化", "戰爭你加的"]);
    expect([...fold.querySelectorAll(".mcard b")].map((name) => name.textContent)).toEqual(["法律", "經濟"]);   // undecided and 無關, still there
    await click(byText(fold.querySelector("#facet-法律") as HTMLElement, "button", "有關"));
    expect(fold.querySelector("#facet-法律")).toBeNull();
    expect((host.querySelector("#facet-法律") as HTMLElement).closest("details")).toBeNull();   // it moved up, with its two questions
    expect(host.querySelector("#法律-defines_normal")).not.toBeNull();
    await done();
  });

  it("with nothing marked yet, says so and keeps every facet reachable under 其他面向", async () => {
    server({});
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    expect(host.textContent).toContain("還沒有標「有關」的面向");
    const fold = [...host.querySelectorAll("details")].find((item) => item.querySelector("summary")?.textContent === "其他面向（3 個）")!;
    expect(fold.querySelectorAll(".mcard")).toHaveLength(3);
    await done();
  });

  it("tells you which layer of the map you came from", async () => {
    window.location.hash = "#layer-structure";
    server({});
    const { host, done } = await mount(<ContextPage projectId="P1" />);
    expect(host.querySelector(".finding")?.textContent).toContain("拆解的「結構」那一層");
    await done();
  });
});
