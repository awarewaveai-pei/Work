import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import { ComputePage, draftFor, flipWords, fromRequest, refusal, toRequest, type Run, type Spec } from "./ComputePage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const OWN = "我自己說的，還沒有外部出處";
const SPEC: Spec = {
  ruleset: { name: "compute.algorithms", version: "1", fingerprint: "f", title: "算法", maintainer: "平台（第 2 步）" },
  types: { money: { unit: "元", fixed_unit: false, same_unit: true }, percent: { unit: "%", fixed_unit: true }, years: { unit: "年", fixed_unit: true, integer: true } },
  algorithms: [
    { id: "npv", name: "淨現值", label: "計算結果", formula: "淨現值 = …", result: { name: "淨現值", unit: "money" }, sides: ["淨現值大於 0", "淨現值是 0 或更少"],
      inputs: [{ key: "initial", name: "一開始投入的金額", type: "money" }, { key: "yearly", name: "之後每年的淨收入", type: "money" }, { key: "years", name: "年數", type: "years" }, { key: "rate", name: "折現率", type: "percent" }] },
    { id: "cost_benefit", name: "成本效益", label: "計算結果", formula: "淨效益 = …", result: { name: "淨效益", unit: "money" }, sides: ["a", "b"], extras: ["not_priced", "who_bears"],
      inputs: [{ key: "yearly_benefit", name: "每年的效益", type: "money" }] },
    { id: "monte_carlo", name: "蒙地卡羅", label: "模擬結果", formula: "抽很多次", result: { name: "加起來的結果", unit: "money" }, sides: ["一半以上", "不到一半"],
      inputs: [{ key: "item", name: "要加起來的一項", type: "money", repeat: [1, 6], spread: true }, { key: "threshold", name: "你要的最低結果", type: "money", scenarios: false }] },
  ],
  scenarios: ["樂觀", "一般", "悲觀"], base: "一般", own_words: OWN, min_origins: 2, labels: ["計算結果", "模擬結果"], adopt: ["採用", "不採用"],
  parts: ["資料支持", "推論", "法律／程序條件", "價值選擇", "創意假設"], not_priced_sides: ["成本", "效益"], not_prediction: "模擬不是預測", uncomputable: "算不出來",
};
const RUN: Run = {
  run_id: "R1", at: "2026-10-04T08:00:00Z", question: "拆夥後六個月的收入", label: "模擬結果", algorithm: { id: "monte_carlo", version: "1", name: "蒙地卡羅" }, formula: "抽很多次",
  inputs: [{ key: "item", name: "接案收入", value: 300000, unit: "元", cards: ["C1"], own: false }, { key: "threshold", name: "你要的最低結果", value: 150000, unit: "元", own: true }],
  scenarios: { 樂觀: { 接案收入: 420000, 你要的最低結果: 150000 }, 一般: { 接案收入: 300000, 你要的最低結果: 150000 }, 悲觀: { 接案收入: 120000, 你要的最低結果: 150000 } },
  result: { what: "加起來的結果", unit: "元", range: { low: 180000, high: 380000, unit: "元" }, simulation: { runs: 10000, value: 280000, mean: 279000, chance: 0.83, threshold: 150000, side: "一半以上" } },
  flip: { input: "接案收入", base: 300000, at: 170000, from: "一半以上", to: "不到一半", change: -0.4333, each: [] },
  rules: { version: "1" }, request: "Q1", thin_inputs: ["接案收入"], adopt: null,
  sourcing: [{ input: "接案收入", own: false, origins: 1, words: "只有 1 個算數的獨立出處（要 2 個）" }, { input: "你要的最低結果", own: true, origins: 0, words: OWN }],
  weakest: `結果不會比最弱的那個數字更可靠。最弱的是「你要的最低結果」：${OWN}。`,
};

function server(answers: { explain?: Array<Record<string, unknown>> } = {}) {
  const writes: Array<{ method: string; path: string; body: any }> = [];
  const explain = [...(answers.explain ?? [])];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ method, path, body });
    if (path === "/blocks/compute/spec") return SPEC as never;
    if (path.endsWith("/evidence")) return { origins: [{ origin_id: "o:1", counts: true, cards: [{ card: "C1", title: "公會公告" }] }] } as never;
    if (path.endsWith("/compute/runs")) return [RUN] as never;
    if (path.endsWith("/proposals")) return [] as never;
    if (path.endsWith("/route")) return { purpose: null, package: null, blocks: [], done: [] } as never;
    if (/^\/projects\/[^/]+$/.test(path)) return { project_id: "P1", name: "拆夥", created_at: "2026-10-04T08:00:00Z" } as never;
    if (path.includes("/docs/") && method === "GET") return [] as never;
    if (path.endsWith("/ai/COMPUTE/explain")) return (explain.shift() ?? {}) as never;
    return [] as never;
  });
  return { writes };
}

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const byText = (host: HTMLElement, selector: string, text: string) => [...host.querySelectorAll(selector)].find((node) => node.textContent?.includes(text));

describe("計算與模擬：送出去的內容", () => {
  it("sends every number as typed, a blank one as null for the server to name, and sources only where they belong", () => {
    const draft = draftFor(SPEC, SPEC.algorithms[0], "開工作室划不划算");
    draft.inputs[0] = { ...draft.inputs[0], value: "100000" };
    draft.inputs[1] = { ...draft.inputs[1], value: "30000", own: false, cards: ["C1"], scenarios: { 悲觀: "15000", 樂觀: "" } };
    const sent = toRequest(SPEC, draft);
    expect(sent.inputs.map((row) => [row.name, row.value, row.unit, row.own, row.cards])).toEqual([
      ["一開始投入的金額", 100000, "元", true, undefined], ["之後每年的淨收入", 30000, "元", false, ["C1"]], ["年數", null, "年", true, undefined], ["折現率", null, "%", true, undefined]]);
    expect(sent.scenarios).toEqual({ 悲觀: { 之後每年的淨收入: 15000 } });
    expect("who_bears" in sent).toBe(false);
    expect(fromRequest(SPEC, sent).inputs[1]).toEqual({ ...draft.inputs[1], scenarios: { 悲觀: "15000" } });
    expect(toRequest(SPEC, { ...draftFor(SPEC, SPEC.algorithms[1]), who_bears: " 我 " }).who_bears).toBe("我");
    expect(draftFor(SPEC, SPEC.algorithms[2]).inputs.map((row) => row.key)).toEqual(["item", "threshold"]);
  });

  it("shows the server's plain words for a refused number, and never a code for anything else", () => {
    expect(refusal(new ApiError(400, "COMPUTE_INPUT_REFUSED: 悲觀情境：每單位的毛利是 0 或負的：做越多賠越多，永遠打不平。"))).toBe("悲觀情境：每單位的毛利是 0 或負的：做越多賠越多，永遠打不平。");
    expect(refusal(new ApiError(409, "COMPUTE_ADOPT_ALREADY_GIVEN: x"))).not.toMatch(/[A-Z]{2,}_/);
  });

  it("says which number alone flips the result, and that a simulation moves an item as a whole", () => {
    expect(flipWords(RUN)).toBe("只改「接案收入」（這一項的樂觀、一般、悲觀一起移）：從 300,000 元 變成大約 170,000 元（少 43%），結果就從「一半以上」變成「不到一半」。其他數字都不動。");
    expect(flipWords({ ...RUN, flip: { input: null, from: "一半以上", why: "結果都沒有翻過來。", each: [] } })).toBe("結果都沒有翻過來。");
  });
});

describe("計算與模擬：頁面", () => {
  it("labels a simulation, says it is not a prediction, shows each number's source and the weakest one, with no dropdown", async () => {
    server();
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    const run = host.querySelectorAll(".judge")[0];
    expect(run.textContent).toContain("模擬結果");
    expect(run.textContent).toContain("模擬不是預測");
    expect(run.textContent).toContain("只有 1 個算數的獨立出處（要 2 個）");
    expect(run.textContent).toContain(RUN.weakest);
    expect(run.textContent).toContain("180,000 到 380,000 元");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("shows the AI's hand-back and goes on only when you press 仍然繼續", async () => {
    const { writes } = server({ explain: [{ handback: "「接案收入」只有 1 個算數的獨立出處（要 2 個）。AI 先停下來，由你決定。" }, { saved: { doc_id: "E1" } }] });
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    await click(byText(host, "button", "請 AI 用白話解釋"));
    expect(host.textContent).toContain("AI 先停下來");
    await click(byText(host, "button", "仍然繼續"));
    const asked = writes.filter((write) => write.path.endsWith("/ai/COMPUTE/explain")).map((write) => write.body.context);
    expect(asked).toEqual([{ run: "R1" }, { run: "R1", go_on: true }]);
    expect(host.textContent).not.toContain("仍然繼續");
    await done();
  });
});
