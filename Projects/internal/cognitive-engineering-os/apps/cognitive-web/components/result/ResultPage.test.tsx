import { renderToStaticMarkup } from "react-dom/server";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtureJson from "../../fixtures/iceberg-interpretation.json";
import record from "../../fixtures/payload-systems.iceberg_model.json";
import { apiFetch } from "../../lib/api";
import { MethodForm } from "../MethodForm";
import { RunInputCard } from "../RunPage";
import { ResultPage } from "./ResultPage";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

describe("ResultPage", () => {
  const fixture = fixtureJson as unknown as React.ComponentProps<typeof ResultPage>["result"];
  it("renders the mock's cards in order and the checker accepts the actual HTML (with and without a lesson)", () => {
    const html = renderToStaticMarkup(<ResultPage result={fixture} record={record} />);
    expect([...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1])).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "approve"]);
    expect((html.match(/class="how"/g) ?? []).length).toBe(10);
    expect(html).not.toContain("<select");
    expect(html).toContain('data-visual="layered"');
    expect(html).toContain("Release incidents increased");
    expect(html).toContain('data-source="r/events/0"');
    const artifact = path.resolve(process.cwd(), ".artifacts/iceberg-result.html");
    mkdirSync(path.dirname(artifact), { recursive: true });
    const checker = path.resolve(process.cwd(), "../../docs/mockups/check-mocks.py");
    const check = (page: string, ...extra: string[]) => { writeFileSync(artifact, page); return spawnSync("python", [checker, "--page", "result", artifact, ...extra], { encoding: "utf8" }); };
    expect(check(html).stdout).toContain("green");
    const missing = check(html.replace('data-section="7"', 'data-section="7x"'));   // a card lost
    expect([missing.status, missing.stdout.includes("result-sections")]).toEqual([1, true]);
    const elsewhere = check(html.replace('data-visual="layered"', 'data-was="layered"').replace('data-section="approve"', 'data-section="approve" data-visual="placeholder"'));   // a marker outside card 2 is not a picture
    expect([elsewhere.status, elsewhere.stdout.includes("card 2 must hold")]).toEqual([1, true]);
    const noGuide = check(html.replace(/<p class="terms">[^<]*<\/p>/, ""));      // no lesson: the reading guide is on the page
    expect([noGuide.status, noGuide.stdout.includes("[U14]")]).toEqual([1, true]);
    // with a lesson (plan U14): the guide lives in the lesson's 看懂結果 tab, the page links there and teaches nothing itself
    const lesson = "/learn/systems.iceberg_model";
    const withLesson = renderToStaticMarkup(<ResultPage result={fixture} record={record} lesson={lesson} />);
    expect(withLesson).not.toContain('class="todos"');
    expect(check(withLesson, "--lesson", lesson).stdout).toContain("green");
    const teaching = check(withLesson.replace('<div class="how">', '<div class="todos"><p class="todo">x</p></div><div class="how">'), "--lesson", lesson);
    expect([teaching.status, teaching.stdout.includes("is teaching")]).toEqual([1, true]);
    const unlinked = check(withLesson.split(`${lesson}#panel-read`).join("/elsewhere"), "--lesson", lesson);
    expect([unlinked.status, unlinked.stdout.includes("reading tab")]).toEqual([1, true]);
    writeFileSync(artifact, html);
  });
  it("the iceberg picture is the iceberg's alone: another layered tool shows its own layers, and the iceberg shows your input per layer", () => {
    const loop = { ...fixture, method_id: "systems.causal_loop_diagram", visual: { kind: "layered", bindings: { levels: [{ label: "增強迴路", path: "r/events/0" }] } } };
    const other = renderToStaticMarkup(<ResultPage result={loop} record={record} display={{ name_zh: "因果回饋圖" }} />);
    expect(other).not.toContain("冰山模型四層圖");
    expect(other).toContain('aria-label="因果回饋圖分層圖"');
    expect(other).toContain(">增強迴路</text>");
    const fields = [{ key: "events", kind: "list", label: "① 事件：發生了什麼？" }, { key: "patterns", kind: "list", label: "② 模式：以前發生過嗎？" }];
    const berg = renderToStaticMarkup(<ResultPage result={fixture} record={{ ...record, patterns: ["每期第 4 次起下降", "線上更低"] }} fields={fields} />);
    expect(berg).toContain("① 事件｜現在發生了什麼？");   // the layer's own question (the mock), wrapped text, never cut
    expect(berg).toContain("每期第 4 次起下降；線上更低");   // an unbound layer still shows what you filled in
    expect(berg).not.toMatch(/…/);
    const whole = renderToStaticMarkup(<ResultPage result={{ ...fixture, visual: { kind: "layered", bindings: { levels: [{ label: "事件", path: "r/events" }] } } }} record={{ events: ["第一件", "第二件"] }} fields={fields} />);
    expect(whole).toContain("第一件；第二件");   // a binding to a whole list reads as its items, never as JSON
    expect(whole).not.toContain('["第一件"');
    const artifact = path.resolve(process.cwd(), ".artifacts/layered-other.html");
    mkdirSync(path.dirname(artifact), { recursive: true });
    writeFileSync(artifact, other);
    const checker = path.resolve(process.cwd(), "../../docs/mockups/check-mocks.py");
    expect(spawnSync("python", [checker, "--page", "result", artifact], { encoding: "utf8" }).stdout).toContain("green");
    writeFileSync(artifact, other.replace('data-method="systems.causal_loop_diagram"', 'data-method="systems.iceberg_model"'));
    const wrong = spawnSync("python", [checker, "--page", "result", artifact], { encoding: "utf8" });
    expect([wrong.status, wrong.stdout.includes("layered iceberg SVG missing")]).toEqual([1, true]);
  });
  it("the result page sections of schema 1.1.0 render as the mock: layer readings, ★ focus, three charts, solutions, metrics", () => {
    const fields = ["events", "patterns", "structures", "mental_models"].map((key, index) => ({ key, kind: "list", label: `${"①②③④"[index]} ${["事件", "模式", "結構", "心智模型"][index]}：問題 ${index + 1}？` }));
    const rec = { events: ["第 6 次只有 2 位；第 1 次是 6 位"], patterns: ["每期第 4 次起下降"], structures: ["帶領者先講，說明佔 35 分鐘"], mental_models: ["專家比較懂"] };
    const detailed = {
      ...fixture, summary: "分享變少是流程造成的。",
      findings: [{ id: "F1", title: "流程", text: "先講讓分享變少。", citations: ["r/structures/0"], confidence: { level: "mid", reason: "一句紀錄" } }],
      visual: { kind: "layered", bindings: { levels: [{ label: "事件", path: "r/events" }, { label: "結構", path: "r/structures" }] } },
      units: [{ path: "r/structures", meaning: "等答案迴路", action: "參與者先說", effect: "持久", leverage: "high", citations: ["r/structures/0"] }],
      focus: { path: "r/structures", why: "切斷迴路第一環" }, priority: "先改流程，再談角色。",
      solutions: { options: [{ name: "甲 只多鼓勵", what: "開場鼓勵", takes: "當次", cost: "低", durability: "低", risk: "退縮", advice: "只當急救", paths: ["r/events"] }, { name: "乙 改流程", what: "參與者先說", takes: "一期", cost: "中", durability: "高", risk: "被改回", advice: "先做", paths: ["r/structures"] }],
        first_step: "下次先讓參與者說 3 分鐘。", horizon: "90 天", signoff: "帶領者團隊", plan: [{ when: "第 1 週", action: "補數據", owner: "帶領者", proof: "有基準值", target: "第 2 週前" }],
        metrics: [{ name: "主動分享人數", now: "2 人", now_citation: "r/events/0", target: "6 人", when: "一期" }] },
      loop: { kind: "reinforcing", name: "等答案迴路", reading: "越轉越安靜", nodes: [{ id: "a", text: "帶領者先講", citations: ["r/structures/0"] }, { id: "b", text: "參與者等答案", citations: ["r/events/0"] }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] },
      trend: { reading: "人數一路掉", series: [{ name: "主動分享", unit: "人", points: [{ label: "第 1 次", value: 6, citation: "r/events/0" }, { label: "第 6 次", value: 2, citation: "r/events/0" }] }] },
      data_thickness: { events: { own_statements: 1, external_sources: 0 }, structures: { own_statements: 1, external_sources: 0 } },
      headline: "團體反思主動分享變少", next_methods: ["systems.leverage_point_analysis", "root_cause.five_whys"],
      next_steps: [{ method_id: "systems.leverage_point_analysis", answers: "算每個出手點的力道", deepens: "三個出手點的力道", prefill: { events: "r/events/0" }, needs_input: ["difficulty"], yields: "槓桿表", est_cost: "low" },
                   { method_id: "root_cause.five_whys", answers: "驗證根因", deepens: "再問五次為什麼", prefill: {}, needs_input: ["why"], yields: "根因鏈", est_cost: "low" }],
    };
    // the run form the page keeps above the result (RunPage's input card), for the parity gate's input card
    const inputCard = <RunInputCard numeral="四"><MethodForm fields={fields} state={{}} onState={() => undefined} onSubmit={() => undefined} onFill={() => undefined} onClear={() => undefined} /></RunInputCard>;
    const html = renderToStaticMarkup(<ResultPage result={detailed as unknown as React.ComponentProps<typeof ResultPage>["result"]} record={rec} fields={fields} lesson="/learn/systems.iceberg_model" display={{ name_zh: "冰山模型", name_en: "Iceberg Model" }} lessons={{ "systems.leverage_point_analysis": "/learn/systems.leverage_point_analysis" }} names={{ "systems.leverage_point_analysis": "槓桿點分析", "root_cause.five_whys": "五個為什麼" }}>{inputCard}</ResultPage>);
    for (const text of ["<b>一句話：</b>分享變少是流程造成的。", "<b>這代表</b><span>等答案迴路", '<span class="lever high">槓桿：高</span>', "<b>對應方案</b><span>⑦ 乙「改流程」★ 本次建議</span>",
      '<span style="display:inline-block"> ★ 建議先出手</span>', '<td>結構 ★</td><td>設計 Design</td><td>現在→未來</td>', 'aria-label="主動分享的變化"', 'aria-label="等答案因果迴路"', 'aria-label="四層改變難度與效果持久度對比"',
      "<b>如果只做一件事，明天就做</b>下次先讓參與者說 3 分鐘。", '<span class="goal">目標 6 人（待你確認）</span>', "<b>建議順序：先第 3 層</b>先改流程，再談角色。"]) expect(html).toContain(text);
    expect(html).not.toContain("這次的分析沒有產出");   // every section is there
    const artifact = path.resolve(process.cwd(), ".artifacts/iceberg-detail.html");
    mkdirSync(path.dirname(artifact), { recursive: true });
    writeFileSync(artifact, html);
    const checker = path.resolve(process.cwd(), "../../docs/mockups/check-mocks.py");
    const parity = spawnSync("python", [checker, "--page", "result", artifact, "--lesson", "/learn/systems.iceberg_model", "--parity"], { encoding: "utf8" }).stdout;
    expect(parity, parity).toContain("green");   // every heading, strip, label, caption and button of the mock is on the page
    // and the gate sees a missing button or a changed heading (mutations: red)
    for (const [what, mutate] of [["a missing button", (page: string) => page.replace(">匯出 PDF<", "><")], ["a changed heading", (page: string) => page.replace("⑧ 下一步：你在這條路的哪裡、接著做什麼", "⑧ 下一步")], ["a lost row label", (page: string) => page.replaceAll("<b>對應方案</b>", "<b>方案</b>")]] as const) {
      const broken = path.resolve(process.cwd(), ".artifacts/iceberg-detail-broken.html");
      writeFileSync(broken, mutate(html));
      expect(spawnSync("python", [checker, "--page", "result", broken, "--lesson", "/learn/systems.iceberg_model", "--parity"], { encoding: "utf8" }).stdout, what).toContain("[parity]");
    }
    // a section the gate dropped says so in plain words; one the model never produced says that instead
    const gates = [{ gate_id: "detail_integrity", status: "PASS", evidence: { problems: {}, dropped: { trend: ["trend value 7 is not stated in r/events/0"] } } }];
    const without = renderToStaticMarkup(<ResultPage result={{ ...detailed, trend: undefined, solutions: undefined } as unknown as React.ComponentProps<typeof ResultPage>["result"]} record={rec} fields={fields} gateResults={gates} />);
    expect(without).toContain("圖 A 趨勢：這次的趨勢圖有數字對不上你填的內容，所以不畫。");
    expect(without).toContain("這次的分析沒有產出方案比較與行動計畫。");
    expect(without).toContain("數字與環節都有出處 ✓");
  });
  it("shows a visible reason when saving tasks is unavailable and renders the gate table", () => {
    const noProject = renderToStaticMarkup(<ResultPage result={{ ...fixture, solutions: { options: [], first_step: "x", plan: [] } } as any} />);
    expect(noProject).toContain("先把分析存進專案，才能把行動計畫存成任務。");
    const withGate = renderToStaticMarkup(<ResultPage result={fixture} gateResults={[{ gate_id: "citation_integrity", status: "PASS", evidence: { cited: 1 } }]} />);
    expect(withGate).toContain("<th>閘門</th>");
    expect(withGate).toContain("引註完整");
  });
  it("shows three judgment labels and reports API failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("network down"));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ResultPage result={fixture} />); });
    const labels = [...host.querySelectorAll(".judgment-button")].map((button) => button.textContent);
    expect(labels).toEqual(["同意", "部分同意", "不同意"]);
    await act(async () => { (host.querySelector(".judgment-button") as HTMLButtonElement)?.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("network down");
    expect(apiFetch).toHaveBeenCalledWith(`/interpretations/${fixture.interpretation_id}/judgment`, expect.objectContaining({ body: JSON.stringify({ stance: "agree", text: "" }) }));
    await act(async () => { root.unmount(); });
    host.remove();
  });
  it("renders Eisenhower fixture as a quadrant", () => {
    const eisenhower = { ...fixture, method_id: "decision.eisenhower_matrix", visual: { kind: "quadrant", bindings: { items: "r/tasks", x: "r/tasks/0/urgency", y: "r/tasks/0/importance" } } };
    expect(renderToStaticMarkup(<ResultPage result={eisenhower} />)).toContain('data-visual="quadrant"');
  });
  it("shows prefilled next-step count and marks missing fields", () => {
    const next = { ...fixture, next_steps: [{ method_id: "systems.leverage_point_analysis", prefill: { events: "r/events" }, needs_input: ["objective"], yields: "Leverage points" }] };
    const html = renderToStaticMarkup(<ResultPage result={next} record={record} />);
    expect(html).toContain("自動填 1 個欄位");
    expect(html).toContain('<span class="need">還要你填 1 個</span>：objective');
    expect(html).toContain("Release incidents increased");
    expect(html).toContain('<a class="btn primary" href="/methods/systems.leverage_point_analysis/run">用這次的資料開始</a>');   // the run page reads the prefill
  });
  it("with a lesson, the header opens it in a new tab; without one it opens the tool page", () => {
    const withLesson = renderToStaticMarkup(<ResultPage result={fixture} lesson="/learn/systems.iceberg_model" />);
    expect(withLesson).toContain('<div class="top"><h1>systems.iceberg_model分析<span>：Release incidents recur</span></h1><a class="howto" href="/learn/systems.iceberg_model" target="_blank" rel="noopener">怎麼用？先上 5 分鐘的課 ↗</a></div>');
    expect(renderToStaticMarkup(<ResultPage result={fixture} />)).toContain('<a class="howto" href="/methods/systems.iceberg_model">它做什麼？</a>');
  });
  it("renders finding-level revision conditions from the typed contract", () => {
    const withCondition = { ...fixture, findings: [{ ...fixture.findings[0], revision_conditions: [{ text: "New evidence", would_change: "Confidence level" }] }] };
    const html = renderToStaticMarkup(<ResultPage result={withCondition} record={record} />);
    expect(html).toContain("<span>① New evidence → Confidence level</span>");
  });

  it("a finding that cites the same line twice shows its [n] once, without React's duplicate-key error", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const id = fixture.findings[0].citations[0];
    const twice = { ...fixture, findings: [{ ...fixture.findings[0], citations: [id, id] }] };
    const html = renderToStaticMarkup(<ResultPage result={twice} record={record} />);
    const finding = html.split('<div class="finding">')[1].split("</div>")[0];
    expect(finding.match(/href="#citation-/g)).toHaveLength(1);
    expect(errors.mock.calls.filter(([message]) => String(message).includes("same key"))).toEqual([]);
    errors.mockRestore();
  });
});
