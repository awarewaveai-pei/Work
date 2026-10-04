import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../lib/api";
import { ComputePage, draftFor, flipWords, fmt, fromRun, refusal, toRequest, type Run, type Spec } from "./ComputePage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const OWN = "我自己說的，還沒有外部出處";
const YEARLY = "之後每年的淨收入";
const SPEC: Spec = {
  ruleset: { name: "compute.algorithms", version: "2", fingerprint: "f", title: "算法", maintainer: "平台（第 2 步）" },
  types: { money: { unit: "元", fixed_unit: false, same_unit: true }, percent: { unit: "%", fixed_unit: true }, years: { unit: "年", fixed_unit: true, integer: true } },
  algorithms: [
    { id: "npv", name: "淨現值", label: "計算結果", formula: "淨現值 = …", result: { name: "淨現值", unit: "money" }, sides: ["淨現值大於 0", "淨現值是 0 或更少"],
      inputs: [{ key: "initial", name: "一開始投入的金額", type: "money" }, { key: "yearly", name: YEARLY, type: "money" }, { key: "years", name: "年數", type: "years" }, { key: "rate", name: "折現率", type: "percent" }] },
    { id: "cost_benefit", name: "成本效益", label: "計算結果", formula: "淨效益 = …", result: { name: "淨效益", unit: "money" }, sides: ["a", "b"], extras: ["not_priced", "who_bears"],
      inputs: [{ key: "yearly_benefit", name: "每年的效益", type: "money" }] },
    { id: "monte_carlo", name: "蒙地卡羅", label: "模擬結果", formula: "抽很多次", result: { name: "加起來的結果", unit: "money" }, sides: ["一半以上", "不到一半"],
      inputs: [{ key: "item", name: "要加起來的一項", type: "money", repeat: [1, 6], spread: true }, { key: "threshold", name: "你要的最低結果", type: "money", scenarios: false }] },
  ],
  scenarios: ["樂觀", "一般", "悲觀"], base: "一般", own_words: OWN, min_origins: 2, labels: ["計算結果", "模擬結果"], adopt: ["採用", "不採用"],
  parts: ["資料支持", "推論", "法律／程序條件", "價值選擇", "創意假設"], not_priced_sides: ["成本", "效益"], not_prediction: "模擬不是預測",
};
const SIMULATION: Run = {
  run_id: "R1", at: "2026-10-04T08:00:00Z", question: "拆夥後六個月的收入", label: "模擬結果", algorithm: { id: "monte_carlo", version: "2", name: "蒙地卡羅" }, formula: "抽很多次",
  inputs: [{ key: "item", name: "接案收入", value: 300000, unit: "元", cards: ["C1"], own: false }, { key: "threshold", name: "你要的最低結果", value: 150000, unit: "元", own: true }],
  scenarios: { 樂觀: { 接案收入: 420000, 你要的最低結果: 150000 }, 一般: { 接案收入: 300000, 你要的最低結果: 150000 }, 悲觀: { 接案收入: 120000, 你要的最低結果: 150000 } },
  result: { what: "加起來的結果", unit: "元", range: { low: 180000, high: 380000, unit: "元" },
    simulation: { runs: 10000, value: 280000, mean: 279000, chance: 0.83, threshold: 150000, side: "一半以上", assumes: "每一項各抽各的，假設它們不會一起變好或變壞。", every: { 樂觀: 420000, 悲觀: 120000 } } },
  flip: { input: "接案收入", base: 300000, at: 170000, from: "一半以上", to: "不到一半", change: -0.4333, each: [] },
  rules: { version: "2" }, request: "Q0", thin_inputs: ["接案收入"], adopt: null,
  sourcing: [{ input: "接案收入", own: false, origins: 1, words: "只有 1 個算數的獨立出處（要 2 個）" }, { input: "你要的最低結果", own: true, origins: 0, words: OWN }],
  weakest: `結果不會比最弱的那個數字更可靠。最弱的是「你要的最低結果」：${OWN}。`,
};
const npvRun = (runId: string, yearly: number, extra: Partial<Run> = {}): Run => ({
  run_id: runId, at: "2026-10-04T08:00:00Z", question: "開工作室划不划算", label: "計算結果", algorithm: { id: "npv", version: "2", name: "淨現值" }, formula: "淨現值 = …",
  inputs: [{ key: "initial", name: "一開始投入的金額", value: 100000, unit: "元", own: true }, { key: "yearly", name: YEARLY, value: yearly, unit: "元", own: true },
    { key: "years", name: "年數", value: 5, unit: "年", own: true }, { key: "rate", name: "折現率", value: 5, unit: "%", own: true }],
  scenarios: Object.fromEntries(["樂觀", "一般", "悲觀"].map((name) => [name, { 一開始投入的金額: 100000, [YEARLY]: name === "悲觀" ? 15000 : yearly, 年數: 5, 折現率: 5 }])),
  result: { what: "淨現值", unit: "元", range: { low: -35057, high: 29884, unit: "元" },
    by_scenario: { 樂觀: { value: 29884, side: "淨現值大於 0" }, 一般: { value: 29884, side: "淨現值大於 0" }, 悲觀: { value: -35057, side: "淨現值是 0 或更少" } } },
  flip: { input: YEARLY, base: yearly, at: 23097, from: "淨現值大於 0", to: "淨現值是 0 或更少", change: -0.23, each: [] },
  rules: { version: "2" }, request: "Q1", thin_inputs: [], adopt: null, sourcing: [], weakest: "", ...extra,
});

function server(runs: Run[], answers: { explain?: Array<Record<string, unknown>> } = {}, docs: Record<string, any[]> = {}) {
  const writes: Array<{ method: string; path: string; body: any }> = [];
  const explain = [...(answers.explain ?? [])];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ method, path, body });
    if (path === "/blocks/compute/spec") return SPEC as never;
    if (path.endsWith("/evidence")) return { origins: [{ origin_id: "o:1", counts: true, cards: [{ card: "C1", title: "公會公告" }] }] } as never;
    if (path.endsWith("/compute/runs")) return runs as never;
    if (path.endsWith("/proposals")) return [] as never;
    if (path.endsWith("/route")) return { purpose: null, package: null, blocks: [], done: [] } as never;
    if (/^\/projects\/[^/]+$/.test(path)) return { project_id: "P1", name: "拆夥", created_at: "2026-10-04T08:00:00Z" } as never;
    const kind = /\/docs\/([^/]+)/.exec(path)?.[1];
    if (kind && method === "GET") return (docs[kind] ?? []) as never;
    if (kind && method === "PUT") return { doc_id: "Q1", kind, version: 3, content: body.content, author: "user", block: "COMPUTE", at: "", notices: [] } as never;
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
const runCard = (host: HTMLElement, question: string, yearly: string) => [...host.querySelectorAll(".judge")].find((node) => node.textContent?.includes(question) && node.textContent?.includes(yearly))!;

describe("計算與模擬：送出去的內容", () => {
  it("sends every number as typed, a blank one as null for the server to name, and sources only where they belong", () => {
    const draft = draftFor(SPEC, SPEC.algorithms[0], "開工作室划不划算");
    draft.inputs[0] = { ...draft.inputs[0], value: "100000" };
    draft.inputs[1] = { ...draft.inputs[1], value: "30000", own: false, cards: ["C1"], scenarios: { 悲觀: "15000", 樂觀: "" } };
    const sent = toRequest(SPEC, draft);
    expect(sent.inputs.map((row) => [row.name, row.value, row.unit, row.own, row.cards])).toEqual([
      ["一開始投入的金額", 100000, "元", true, undefined], [YEARLY, 30000, "元", false, ["C1"]], ["年數", null, "年", true, undefined], ["折現率", null, "%", true, undefined]]);
    expect(sent.scenarios).toEqual({ 悲觀: { [YEARLY]: 15000 } });
    expect("who_bears" in sent || "from_run" in sent).toBe(false);
    expect(toRequest(SPEC, { ...draftFor(SPEC, SPEC.algorithms[1]), who_bears: " 我 " }).who_bears).toBe("我");
    expect(draftFor(SPEC, SPEC.algorithms[2]).inputs.map((row) => row.key)).toEqual(["item", "threshold"]);
  });

  it("rebuilds a rerun from the run's own record, naming the run it starts from", () => {
    const sent = toRequest(SPEC, fromRun(npvRun("R7", 30000)));
    expect(sent.inputs[1]).toEqual({ key: "yearly", name: YEARLY, value: 30000, unit: "元", own: true });
    expect(sent.scenarios).toEqual({ 悲觀: { [YEARLY]: 15000 } });   // a scenario equal to 一般 is the same as none
    expect([sent.algorithm, sent.question, sent.from_run]).toEqual(["npv", "開工作室划不划算", "R7"]);
    expect(toRequest(SPEC, fromRun(SIMULATION)).scenarios).toEqual({ 樂觀: { 接案收入: 420000 }, 悲觀: { 接案收入: 120000 } });   // never the threshold's three equal values
  });

  it("shows the server's plain words for a refused number, and never a code for anything else", () => {
    expect(refusal(new ApiError(400, "COMPUTE_INPUT_REFUSED: 至少一個數字要寫樂觀或悲觀時的值。"))).toBe("至少一個數字要寫樂觀或悲觀時的值。");
    expect(refusal(new ApiError(409, "COMPUTE_ADOPT_ALREADY_GIVEN: x"))).not.toMatch(/[A-Z]{2,}_/);
  });

  it("says which number alone flips the result, moves only an item as a whole, and says when the result sits on the line", () => {
    expect(flipWords(SIMULATION, SPEC)).toBe("只改「接案收入」（這一項的樂觀、一般、悲觀一起移）：從 300,000 元 變成大約 170,000 元（少 43%），結果就從「一半以上」變成「不到一半」。其他數字都不動。");
    const threshold = { ...SIMULATION, flip: { ...SIMULATION.flip, input: "你要的最低結果", base: 150000, at: 280000, change: 0.8667 } };
    expect(flipWords(threshold, SPEC)).not.toContain("一起移");
    expect(flipWords(npvRun("R1", 100, { flip: { input: YEARLY, base: 100, at: 100.000006, from: "淨現值是 0 或更少", to: "淨現值大於 0", change: 0, each: [] } }), SPEC))
      .toBe(`結果就在線上：「${YEARLY}」稍微一動，結果就從「淨現值是 0 或更少」變成「淨現值大於 0」。`);
    expect(flipWords({ ...SIMULATION, flip: { input: null, from: "一半以上", why: "結果離那條線太近。", each: [] } }, SPEC)).toBe("結果離那條線太近。");
    expect([fmt(0.00083447), fmt(1234.567), fmt(0), fmt(null)]).toEqual(["0.000834", "1,234.57", "0", "—"]);
  });
});

describe("計算與模擬：頁面", () => {
  it("labels a simulation, shows what it assumes and every item at its 悲觀 and 樂觀, each number's source and the weakest one, with no dropdown", async () => {
    server([SIMULATION]);
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    const run = host.querySelectorAll(".judge")[0];
    expect(run.textContent).toContain("模擬結果");
    expect(run.textContent).toContain("模擬不是預測");
    expect(run.textContent).toContain("每一項各抽各的，假設它們不會一起變好或變壞。");
    expect(run.textContent).toContain("每一項都在悲觀時，加起來是 120,000 元");
    expect(run.textContent).toContain("每一項都在樂觀時，加起來是 420,000 元");
    expect(run.textContent).toContain("只有 1 個算數的獨立出處（要 2 個）");
    expect(run.textContent).toContain(SIMULATION.weakest);
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("shows a scenario that never breaks even as its words, not a number, and where a number stopped being computable", async () => {
    const run = npvRun("R1", 30000, {
      result: { what: "淨現值", unit: "元", range: { low: null, high: null, unit: "元" }, by_scenario: { 樂觀: { value: null, side: "沒達到", words: "之後每年沒有淨收入" }, 一般: { value: null, side: "沒達到", words: "之後每年沒有淨收入" }, 悲觀: { value: null, side: "沒達到", words: "之後每年沒有淨收入" } } },
      flip: { input: null, from: "沒達到", why: "結果都沒有翻過來。", each: [{ input: "一開始投入的金額", base: 100000, at: null, stop: 0 }] },
    });
    server([run]);
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    expect(host.textContent).toContain("沒有數字：每個情境都落在線的同一邊");
    expect(host.textContent).toContain("之後每年沒有淨收入");
    expect(host.textContent).toContain("「一開始投入的金額」改到 0 就算不出來了；在那之前結果沒有翻過來。");
    await done();
  });

  it("reruns an old run with that run's numbers, not the request's latest ones", async () => {
    const request = { doc_id: "Q1", kind: "compute.request", version: 2, content: toRequest(SPEC, fromRun(npvRun("R2", 20000))), author: "user", block: "COMPUTE", at: "" };
    const { writes } = server([npvRun("R1", 30000), npvRun("R2", 20000, { rerun_of: "R1" })], {}, { "compute.request": [request] });
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    await click([...runCard(host, "開工作室", "30,000").querySelectorAll("button")].find((node) => node.textContent === "用同樣的數字再算一次"));
    const put = writes.find((write) => write.method === "PUT")!;
    expect(put.path).toMatch(/\/docs\/compute\.request\/Q1$/);
    expect(put.body.base_version).toBe(2);
    expect(put.body.content.inputs[1].value).toBe(30000);
    expect(put.body.content.from_run).toBe("R1");
    await click([...runCard(host, "開工作室", "30,000").querySelectorAll("button")].find((node) => node.textContent === "改輸入再算"));
    expect((host.querySelector("#value-1") as HTMLInputElement).value).toBe("30000");
    await done();
  });

  it("draws every AI explanation beside the system's own 模擬不是預測 line -- on a plain run, a rerun and an adopted run", async () => {
    // No word filter stops every forecast (STEP2_CHECKLIST KNOWN LIMIT); this line is the guarantee, so no explanation may render without it.
    const explanation = (run: string) => ({ doc_id: `E-${run}`, kind: "compute.explanation", version: 1, author: "ai", block: "COMPUTE", at: "",
      content: { run, points: [{ part: "推論", text: "悲觀情境下淨現值是負的。" }], influential: YEARLY, rests_on: [YEARLY] } });
    const runs = [npvRun("R1", 30000), npvRun("R2", 20000, { rerun_of: "R1" }), npvRun("R3", 25000, { adopt: { adopt: "採用", reason: "數字有出處" } })];
    server(runs, {}, { "compute.explanation": runs.map((run) => explanation(run.run_id)) });
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    const boxes = [...host.querySelectorAll(".finding")].filter((node) => node.textContent?.includes("AI 認為最影響結果的"));
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box.textContent).toContain("模擬不是預測，計算也不是：算出來的不等於會發生。");
    await done();
  });

  it("shows the AI's hand-back, goes on only when you press 仍然繼續, and says 模擬不是預測 beside every explanation", async () => {
    const explained = { doc_id: "E1", kind: "compute.explanation", version: 1, author: "ai", block: "COMPUTE", at: "",
      content: { run: "R9", points: [{ part: "推論", text: "悲觀情境下淨現值是負的。" }], influential: YEARLY, rests_on: [YEARLY] } };
    const { writes } = server([SIMULATION, npvRun("R9", 30000)], { explain: [{ handback: "「接案收入」只有 1 個算數的獨立出處（要 2 個）。AI 先停下來，由你決定。" }, { saved: { doc_id: "E2" } }] },
      { "compute.explanation": [explained] });
    const { host, done } = await mount(<ComputePage projectId="P1" />);
    expect(runCard(host, "開工作室", "30,000").textContent).toContain("模擬不是預測，計算也不是：算出來的不等於會發生。");
    await click([...runCard(host, "拆夥後", "300,000").querySelectorAll("button")].find((node) => node.textContent === "請 AI 用白話解釋"));
    expect(host.textContent).toContain("AI 先停下來");
    await click([...host.querySelectorAll("button")].find((node) => node.textContent === "仍然繼續"));
    const asked = writes.filter((write) => write.path.endsWith("/ai/COMPUTE/explain")).map((write) => write.body.context);
    expect(asked).toEqual([{ run: "R1" }, { run: "R1", go_on: true }]);
    expect(host.textContent).not.toContain("仍然繼續");
    await done();
  });
});
