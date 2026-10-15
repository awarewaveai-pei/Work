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
import { DescribeFirst, RunInputCard, SaveTo } from "../RunPage";
import { ResultPage, withDefinitions } from "./ResultPage";
import { OWN_CHARTS } from "./Charts";
import { RESULT_PAGE_SHOWS } from "../../lib/toolsheets.generated";
import { formIsUnits, unitFields } from "../../lib/units";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
// the React-controlled-input way to type: set the value through the native setter, then fire the event React listens for
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

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
    expect(other).toContain("知識不足：缺 M1、M2、M4–M8（這個工具還沒有課）");   // I11: a tool without a lesson says so at the top
    const fields = [{ key: "events", kind: "list", label: "① 事件：發生了什麼？" }, { key: "patterns", kind: "list", label: "② 模式：以前發生過嗎？" }];
    const berg = renderToStaticMarkup(<ResultPage result={fixture} record={{ ...record, patterns: ["每期第 4 次起下降", "線上更低"] }} fields={fields} />);
    expect(berg).toContain("① 事件｜現在發生了什麼？");   // the layer's own question (the mock), wrapped text, never cut
    expect(berg).toContain("每期第 4 次起下降；線上更低");   // an unbound layer still shows what you filled in
    expect(berg).not.toMatch(/…/);
    expect(berg).not.toContain("知識不足");   // the iceberg's knowledge is complete
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
  it("a tool without the iceberg's registration gets all nine sections and no iceberg words; ③'s own charts match result-page-shows.yaml (template §12)", async () => {
    const demo = (await import("../../fixtures/demo/systems.iceberg_model.edd.json")).default as unknown as { result: React.ComponentProps<typeof ResultPage>["result"] };
    const fields = [{ key: "problem_summary", kind: "text", label: "問題一句" }, { key: "hypotheses", kind: "list", label: "可能的原因" }];
    // the demo's AI text names the iceberg once; renamed, so any iceberg word left on the page is one the code wrote
    const fish = JSON.parse(JSON.stringify({ ...demo.result, method_id: "root_cause.fishbone", visual: { kind: "tree", bindings: {} } }).replaceAll("冰山", "魚骨")) as typeof demo.result;
    const rec = { problem_summary: "分享從 6 人掉到 2 人", hypotheses: [{ id: "H1", statement: "帶領者先講意義", category: "人" }] };
    const html = renderToStaticMarkup(<ResultPage result={fish} record={rec} fields={fields} display={{ name_zh: "魚骨圖" }} />);
    expect([...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1])).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "approve"]);
    expect(html).toContain('data-visual="fishbone"');
    for (const text of ["⑥ 對照表", "③ 圖表分析（兩張圖各回答一個問題）", "兩張圖各自對應圖上的一格或幾格；圖 A 用你的數字，圖 B 由分析結果生成。"]) expect(html).toContain(text);
    for (const text of ["冰山", "Anderson", "圖 C", "四列", "⑦ C 的追蹤指標"]) expect(html, text).not.toContain(text);
    const artifact = path.resolve(process.cwd(), ".artifacts/fishbone-result.html");
    mkdirSync(path.dirname(artifact), { recursive: true });
    writeFileSync(artifact, html);
    const checked = spawnSync("python", [path.resolve(process.cwd(), "../../docs/mockups/check-mocks.py"), "--page", "result", artifact], { encoding: "utf8" }).stdout;
    expect(checked, checked).toContain("green");
    expect(unitFields("root_cause.fishbone", fields)).toEqual([]);   // its run form is not layered
    const berg = ["events", "patterns", "structures", "mental_models"].map((key) => ({ key }));
    expect(unitFields("systems.iceberg_model", [...berg, { key: "extra" }])).toHaveLength(4);
    expect([formIsUnits("systems.iceberg_model", berg), formIsUnits("systems.iceberg_model", [...berg, { key: "extra" }])]).toEqual([true, false]);   // one non-unit field keeps required checks
    expect(Object.fromEntries(Object.entries(OWN_CHARTS).map(([methodId, charts]) => [methodId, charts.map((chart) => chart.shows)]))).toEqual(RESULT_PAGE_SHOWS);
    // the demo's read-only note names the tool it is
    vi.mocked(apiFetch).mockResolvedValue({} as never);
    const { host, done } = await mount(<ResultPage demo result={fish} record={rec} fields={fields} display={{ name_zh: "魚骨圖" }} />);
    await act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent === "核准，存進紀錄")!.click(); });
    expect(host.textContent).toContain("用你自己的案例在「魚骨圖」跑一次");
    await done();
  });
  it("a tool whose picture has its own units gets one ④ card and one ⑥ row per unit; a reading or citation of any member belongs to its unit (template §15.1 item 2)", async () => {
    const demo = (await import("../../fixtures/demo/systems.iceberg_model.edd.json")).default as unknown as { result: React.ComponentProps<typeof ResultPage>["result"] };
    // the record and units of tests/unit/test_picture_units.py (the server's picture_units for this record)
    const rec = { problem_summary: "分享從 6 人掉到 2 人", hypotheses: [{ id: "H1", statement: "帶領者先講意義", category: "人" }, { id: "H2", statement: "", category: "人" },
      { id: "H3", statement: "線上場關鏡頭", category: "環境" }, { id: "H4", statement: "分享時間不夠", category: "人" }] };
    const pictureUnits = [{ path: "r/hypotheses/0", label: "人", members: ["r/hypotheses/0", "r/hypotheses/3"], own_statements: 2 }, { path: "r/hypotheses/2", label: "環境", members: ["r/hypotheses/2"], own_statements: 1 }];
    const unitReading = (path: string, meaning: string, citations: string[]) => ({ path, brief: meaning.slice(0, 6), meaning, action: "先驗證", step: "先驗證", effect: "知道是不是它", leverage: "mid" as const, citations });
    const fish = JSON.parse(JSON.stringify({ ...demo.result, method_id: "root_cause.fishbone", visual: { kind: "table", bindings: {} }, picture_units: pictureUnits,
      units: [unitReading("r/hypotheses/0", "人這根骨有兩個原因。", ["r/hypotheses/3/statement"]), unitReading("r/hypotheses/2", "環境只有一個原因。", ["r/hypotheses/2/statement"])],
      focus: { path: "r/hypotheses/3", why: "兩個原因都在這裡" }, solutions: undefined, diagnosis: undefined, priority_short: undefined }).replaceAll("冰山", "魚骨")) as typeof demo.result;   // the AI's own words (問題在第3層…根在第4層) are not the page's
    const html = renderToStaticMarkup(<ResultPage result={fish} record={rec} display={{ name_zh: "魚骨圖" }} />);
    expect(html).not.toContain("不分層");
    for (const text of ["<h3>第 1 根骨／2：人</h3>", "<h3>第 2 根骨／2：環境</h3>", "<b>這根骨問</b>", "<b>在這根骨出手</b>", "人這根骨有兩個原因。", "環境只有一個原因。", "你填 2 句", "你填 1 句", "<td>人 ★</td>", "<td>環境</td>", "⑤ 總結：在哪一根骨出手"]) expect(html, text).toContain(text);
    expect(html.match(/<h3>第 \d 根骨／2/g)).toHaveLength(2);
    expect(html).toMatch(/帶領者先講意義[^<]*分享時間不夠/);   // the bone's 你填的 reads both of its causes
    for (const text of ["第 1 層", "第 2 層", "這層問", "在這層出手", "由上往下", "根在第", "<th>欄位</th>"]) expect(html, text).not.toContain(text);   // the unit word is the tool's own; bones have no depth
    expect(html).toContain("<th>根骨</th>");
    const artifact = path.resolve(process.cwd(), ".artifacts/fishbone-units.html");
    mkdirSync(path.dirname(artifact), { recursive: true });
    writeFileSync(artifact, html);
    const checked = spawnSync("python", [path.resolve(process.cwd(), "../../docs/mockups/check-mocks.py"), "--page", "result", artifact], { encoding: "utf8" }).stdout;
    expect(checked, checked).toContain("green");
  });
  it("uses layer keys for iceberg facts, counts only that layer's external citations, and makes no unbuilt-form promise", () => {
    const sparse = {
      ...fixture,
      visual: { kind: "layered", bindings: { levels: [{ label: "事件", path: "r/events" }, { label: "結構", path: "r/structures" }] } },
    };
    const sparseHtml = renderToStaticMarkup(<ResultPage result={sparse} record={record} />);
    expect(sparseHtml).toContain('<h3>第 2 層／2：結構</h3><span class="meta">看不見 ・ 時間：現在到未來 ・ 出手方式：設計 Design</span>');
    expect(sparseHtml).toContain("<td>結構</td><td>設計 Design</td><td>現在→未來</td>");

    const sourced = {
      ...fixture,
      data_thickness: { events: { own_statements: 1, external_sources: 2 } },
      units: [{ ...fixture.units![0], citations: ["r/events/0", "source:S1", "source:S1"] }],
    };
    const sourcedHtml = renderToStaticMarkup(<ResultPage result={sourced} record={record} manifest={[
      { id: "source:S1", kind: "project_source", value: "來源一" },
      { id: "source:S2", kind: "project_source", value: "來源二" },
    ]} />);
    expect(sourcedHtml).toContain("你填 1 句・外部 1 筆");

    const nonNumeric = { ...fixture, next_steps: [{ ...fixture.next_steps![0], yields: "根因鏈" }] };
    const nonNumericHtml = renderToStaticMarkup(<ResultPage result={nonNumeric} record={record} />);
    expect(nonNumericHtml).toContain("⑦ 的方案已經能用。");
    expect(nonNumericHtml).not.toContain("差別是有沒有數字撐它");
    expect(nonNumericHtml).not.toContain("欄位會標紅");
  });

  it("cites an external source by its title, linking to its content -- not its id and a sha256 (N-32/P-29)", () => {
    const withSource = { ...fixture, findings: [{ ...fixture.findings[0], citations: ["source:S1"] }] };
    const linked = renderToStaticMarkup(<ResultPage result={withSource} record={record} project={{ id: "P1", name: "示範專案" }} manifest={[
      { id: "source:S1", kind: "project_source", source_id: "S1", title: "客戶訪談逐字稿", sha256: "abc" },
    ]} />);
    expect(linked).toContain('<a href="/api/projects/P1/sources/S1/content" target="_blank" rel="noreferrer">客戶訪談逐字稿</a>');
    expect(linked).not.toContain("外部來源・source:S1");

    // no project prop yet (transient state): still the title, just not a link nobody could open
    const noProject = renderToStaticMarkup(<ResultPage result={withSource} record={record} manifest={[
      { id: "source:S1", kind: "project_source", source_id: "S1", title: "客戶訪談逐字稿" },
    ]} />);
    expect(noProject).toContain("外部來源・客戶訪談逐字稿");
    expect(noProject).not.toContain('href="/api/projects/');

    // older data with no stored title: the id shows, honestly, rather than a fabricated label
    const noTitle = renderToStaticMarkup(<ResultPage result={withSource} record={record} manifest={[
      { id: "source:S1", kind: "project_source", source_id: "S1", sha256: "abc" },
    ]} />);
    expect(noTitle).toContain("外部來源・source:S1");
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
        first_step: "下次先讓參與者說 3 分鐘。", horizon: "90 天", signoff: "帶領者團隊", recommended: "乙 改流程", long_horizon: "quarter",   // 1.4.0: a short and a long plan
        plan: [{ when: "第 1 週", action: "補數據", owner: "帶領者", proof: "有基準值", target: "第 2 週前", phase: "short", options: ["乙 改流程"] },
               { when: "第 2 季", action: "改角色定義", owner: "課程負責人", proof: "契約改版", target: "定稿", phase: "long", options: ["乙 改流程"] }],
        metrics: [{ name: "主動分享人數", now: "2 人", now_citation: "r/events/0", target: "6 人", when: "一期" }] },
      loop: { kind: "reinforcing", name: "等答案迴路", reading: "越轉越安靜", nodes: [{ id: "a", text: "帶領者先講", citations: ["r/structures/0"] }, { id: "b", text: "參與者等答案", citations: ["r/events/0"] }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] },
      trend: { reading: "人數一路掉", series: [{ name: "主動分享", unit: "人", points: [{ label: "第 1 次", value: 6, citation: "r/events/0" }, { label: "第 6 次", value: 2, citation: "r/events/0" }] }] },
      data_thickness: { events: { own_statements: 1, external_sources: 0 }, structures: { own_statements: 1, external_sources: 0 } },
      headline: "團體反思主動分享變少", next_methods: ["systems.leverage_point_analysis", "root_cause.five_whys"],
      next_steps: [{ method_id: "systems.leverage_point_analysis", answers: "算每個出手點的力道", deepens: "三個出手點的力道", prefill: { events: "r/events/0" }, needs_input: ["difficulty"], yields: "槓桿表", est_cost: "low" },
                   { method_id: "root_cause.five_whys", answers: "驗證根因", deepens: "再問五次為什麼", prefill: {}, needs_input: ["why"], yields: "根因鏈", est_cost: "low" }],
    };
    // the run form the page keeps above the result (RunPage's input card), for the parity gate's input card
    const inputCard = <RunInputCard numeral="四"><DescribeFirst methodId="systems.iceberg_model" fields={fields} state={{}} onState={() => undefined} /><SaveTo project={{ id: "P1", name: "WuSheng 團體反思・第三期" }} name="冰山模型" customName="" onName={() => undefined} /><MethodForm fields={fields} state={{}} onState={() => undefined} onSubmit={() => undefined} onFill={() => undefined} onClear={() => undefined} /></RunInputCard>;
    const html = renderToStaticMarkup(<ResultPage result={detailed as unknown as React.ComponentProps<typeof ResultPage>["result"]} project={{ id: "P1", name: "WuSheng 團體反思・第三期" }} record={rec} fields={fields} lesson="/learn/systems.iceberg_model" display={{ name_zh: "冰山模型", name_en: "Iceberg Model" }} lessons={{ "systems.leverage_point_analysis": "/learn/systems.leverage_point_analysis" }} names={{ "systems.leverage_point_analysis": "槓桿點分析", "root_cause.five_whys": "五個為什麼" }}>{inputCard}</ResultPage>);
    for (const text of ["<b>一句話：</b>分享變少是流程造成的。", '<b>這代表</b><span>等答案<dfn title="A 造成 B，B 又回頭讓 A 更嚴重">迴路</dfn>', '<span class="lever high">槓桿：高</span>', "<b>對應方案</b><span>⑦ 乙「改流程」★ 本次建議</span>",
      '<span style="display:inline-block"> ★ 建議先出手</span>', '<td>結構 ★</td><td>設計 Design</td><td>現在→未來</td>', 'aria-label="主動分享的變化"', 'aria-label="等答案因果迴路"', 'aria-label="四層改變難度與效果持久度對比"',
      "<b>如果只做一件事，明天就做</b>下次先讓參與者說 3 分鐘。", '<span class="goal">目標 6 人（待你確認）</span>', "<b>建議順序：先第 3 層</b>先改流程，再談角色。"]) expect(html).toContain(text);
    expect(html.match(/<b>這代表<\/b>/g)).toHaveLength(4);
    expect(html.match(/<b>在這層出手<\/b>/g)).toHaveLength(4);
    expect(html.match(/這次的分析沒有寫這一層/g)).toHaveLength(6);
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
    expect(without).toContain("已拿掉 1 項");   // a dropped section is never a ✓ on the approve bar (N-43)

    const removedUnit = renderToStaticMarkup(<ResultPage result={{ ...detailed, units: [] } as unknown as React.ComponentProps<typeof ResultPage>["result"]} record={rec} fields={fields} gateResults={[{ gate_id: "detail_integrity", status: "PASS", evidence: { removed: { units: ["units[0] cites an unknown source; removed"] } } }]} />);
    expect(removedUnit.match(/這一層的解讀沒有出處，已拿掉/g)).toHaveLength(8);
  });
  it("shows a visible reason when saving tasks is unavailable and renders the gate table", () => {
    const noProject = renderToStaticMarkup(<ResultPage result={{ ...fixture, solutions: { options: [], first_step: "x", plan: [] } } as any} />);
    expect(noProject).toContain("先把分析存起來，才能把行動計畫存成任務。");
    const withGate = renderToStaticMarkup(<ResultPage result={fixture} gateResults={[{ gate_id: "citation_integrity", status: "PASS", evidence: { cited: 1 } }]} />);
    expect(withGate).toContain("<th>閘門</th>");
    expect(withGate).toContain("引註完整");
  });
  it("the approve bar shows the mock's four checks from real evaluations, and old analyses are told by their gates", () => {
    const fixture = fixtureJson as unknown as React.ComponentProps<typeof ResultPage>["result"];
    const gates = [
      { gate_id: "citation_integrity", status: "PASS", evidence: { claims: 2, cited: 2, unsupported: 0 } },
      { gate_id: "visual_bindings_resolvable", status: "PASS", evidence: {} },
      { gate_id: "next_methods_resolvable", status: "PASS", evidence: {} },
      { gate_id: "detail_integrity", status: "PASS", evidence: { dropped: {}, removed: {} } },
      { gate_id: "no_preset_conclusion", status: "PASS", evidence: {} },
    ];
    const html = renderToStaticMarkup(<ResultPage result={fixture} record={record} gateResults={gates} recordGates={[{ gate_id: "top_down_completeness", status: "PASS" }]} />);
    const bar = html.slice(html.indexOf('class="meta-bar"'), html.indexOf("你的判斷 <b>"));
    for (const check of ["來源 ✓", "層序 ✓", "引註完整 ✓", "無預設結論 ✓"]) expect(bar).toContain(check);
    expect(bar).not.toContain("圖都指向你的資料");   // the other gates live in the expert table
    const failing = renderToStaticMarkup(<ResultPage result={fixture} record={record} gateResults={[{ ...gates[0], evidence: { claims: 2, cited: 1, unsupported: 1 } }]} recordGates={[{ gate_id: "top_down_completeness", status: "FAIL" }]} />);
    expect(failing).toContain("來源 ✗");
    expect(failing).toContain("層序 ✗");
    expect(failing).not.toContain("無預設結論");   // not run = not shown, never a default ✓
  });

  it("a layer's reading defines the mock's words on hover (M-16)", () => {
    const html = renderToStaticMarkup(<>{withDefinitions("這是等答案的迴路；同步不等於因果。")}</>);
    expect(html).toContain('<dfn title="A 造成 B，B 又回頭讓 A 更嚴重">迴路</dfn>');
    expect(html).toContain('<dfn title="兩件事一起發生，不等於一件造成另一件">同步不等於因果</dfn>');
  });

  it("schema 1.3.0 reaches the page: diagnosis, short order, a layer's verdict and who fills it, the recommended option, what a gap is about, the loop's feeder", () => {
    const fields = ["events", "patterns", "structures", "mental_models"].map((key, index) => ({ key, kind: "list", label: `${"①②③④"[index]} ${["事件", "模式", "結構", "心智模型"][index]}：問題？` }));
    const rec = { events: ["第 6 次只有 2 位"], patterns: [], structures: ["帶領者先講"], mental_models: ["專家比較懂"] };
    const result = {
      ...(fixtureJson as object), summary: "x",
      findings: [{ id: "F1", title: "流程", text: "先講。", citations: ["r/structures/0"], confidence: { level: "mid", reason: "一句" } }],
      visual: { kind: "layered", bindings: { levels: [{ label: "事件", path: "r/events" }, { label: "模式", path: "r/patterns" }, { label: "結構", path: "r/structures" }, { label: "心智模型", path: "r/mental_models" }] } },
      units: [{ path: "r/events", meaning: "警訊", action: "鼓勵", effect: "當次", leverage: "low", citations: ["r/events/0"], thickness: { verdict: "thin", note: "沒有逐次數字", fill_by: "systems.causal_loop_diagram" } }],
      diagnosis: { title: "問題在第 3 層，根在第 4 層", text: "流程讓人等答案。", citations: ["r/structures/0"] }, priority: "先改流程。", priority_short: "先第 3 層，同時準備第 4 層",
      solutions: { options: [{ name: "只多鼓勵", what: "鼓勵", takes: "當次", cost: "低", durability: "低", risk: "退縮", advice: "只當急救", paths: ["r/events"] }, { name: "改流程", what: "改順序", takes: "一期", cost: "中", durability: "高", risk: "被改回", advice: "先做這條", paths: ["r/structures"] }], first_step: "x", recommended: "改流程" },
      gaps: [{ text: "沒有逐次人數", needed_evidence: "每次紀錄", path: "r/patterns", citations: ["r/events/0"] }],
      loop: { kind: "reinforcing", name: "等答案迴路", reading: "x", nodes: [{ id: "a", text: "帶領者先講", citations: ["r/structures/0"] }, { id: "b", text: "參與者等答案", citations: ["r/events/0"] }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
        feeders: [{ id: "f1", text: "紀錄表只問洞察", citations: ["r/mental_models/0"], to: "a" }] },
      data_thickness: { events: { own_statements: 1 }, patterns: { own_statements: 0 }, structures: { own_statements: 1 }, mental_models: { own_statements: 1 } },
    };
    const html = renderToStaticMarkup(<ResultPage result={result as unknown as React.ComponentProps<typeof ResultPage>["result"]} record={rec} fields={fields} names={{ "systems.causal_loop_diagram": "因果回饋圖" }} />);
    expect(html).toContain("<b>主要發現：問題在第 3 層，根在第 4 層</b>流程讓人等答案。");
    expect(html).toContain("<b>建議順序：先第 3 層，同時準備第 4 層</b>");
    expect(html).toContain('<span class="warn">薄</span>（沒有逐次數字），⑧ 因果回饋圖可補');
    expect(html).toContain("第 1 層 ●○○（沒有逐次數字）");
    expect(html).toContain("<td><b>先做這條</b></td>");
    expect(html).toContain("⑦ 乙「改流程」★ 本次建議");
    expect(html).not.toContain("⑦ 甲「只多鼓勵」★");   // the focus layer's option does not get the ★ once a recommendation is named
    expect(html).toContain("「模式」沒有逐次人數");
    expect(html).toContain('stroke="#b25e09" stroke-width="1.5" stroke-dasharray="5 3"');   // the feeder: a dashed box outside the ring
    expect(html).toContain("紀錄表只問洞察");
  });

  it("the 示範分析 is the real result page, read-only: a writing button says it is a demo and calls nothing (N-78)", async () => {
    const demo = (await import("../../fixtures/demo/systems.iceberg_model.edd.json")).default as unknown as { result: React.ComponentProps<typeof ResultPage>["result"]; record: Record<string, unknown>; manifest: never[]; gateResults: never[]; fields: never[] };
    vi.mocked(apiFetch).mockResolvedValue({} as never);   // reads (the next steps' estimates) may happen; writes may not
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ResultPage demo result={demo.result} record={demo.record} manifest={demo.manifest} gateResults={demo.gateResults} fields={demo.fields} />); });
    expect(host.textContent).toContain("示範分析（免費，不花錢）");
    const approve = [...host.querySelectorAll("button")].find((b) => b.textContent === "核准，存進紀錄")!;
    await act(async () => { approve.click(); });
    expect(vi.mocked(apiFetch).mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "DELETE")).toBe(false);
    expect(host.textContent).toContain("這是示範分析：不能核准");
    await act(async () => { root.unmount(); }); host.remove();
  });

  it("⑧'s journey is the recommended path by short names, and the lead says why the first step (N-04/N-05/N-08)", () => {
    const step = (method_id: string, extra: object) => ({ method_id, answers: "一個很長的回答什麼句子", deepens: "d", prefill: {}, needs_input: [], yields: "y", est_cost: "S", ...extra });
    const result = { ...(fixtureJson as object), next_methods: ["a.one", "b.two", "c.three"],
      next_steps: [step("a.one", { short: "驗證迴路", on_path: true, why: "⑦ 的方案建立在這個迴路上。" }), step("b.two", { short: "另一條", on_path: false }), step("c.three", { short: "排序", on_path: true })] };
    const html = renderToStaticMarkup(<ResultPage result={result as unknown as React.ComponentProps<typeof ResultPage>["result"]} record={record} names={{ "a.one": "因果回饋圖", "b.two": "五個為什麼", "c.three": "槓桿點分析" }} />);
    const journey = html.slice(html.indexOf('class="journey"'), html.indexOf("</div>", html.indexOf('class="journey"')));
    expect(journey).toContain("下一步：因果回饋圖（驗證迴路）");
    expect(journey).toContain("之後：槓桿點分析（排序）");
    expect(journey).not.toContain("五個為什麼");            // an alternative stays on its card, not on the path
    expect(journey).not.toContain("一個很長的回答什麼句子");  // the short name, not the long answer
    expect(html).toContain("<b>最值得的下一步是「因果回饋圖」，因為⑦ 的方案建立在這個迴路上</b>");
  });

  it("要提高 opens the project's sources card (N-34)", () => {
    const html = renderToStaticMarkup(<ResultPage result={fixture} record={record} project={{ id: "P1", name: "x" }} />);
    expect(html).toContain('<a href="/projects/P1#sources">補上真實數字或外部資料</a>');
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
  it("⑦ a task already saved for this analysis shows a link instead of the button, and an open rerun disables its button (M-73, M-79)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P1/tasks") return [{ task_id: "T1", interpretation_id: fixture.interpretation_id, title: "x", owner: "A", due: "2030-01-01", proof: "", target: "", when: "", created_at: "2026-09-28T00:00:00Z", done: false, done_at: null }] as never;
      if (path === "/projects/P1/reruns") return [{ rerun_id: "R1", interpretation_id: fixture.interpretation_id, method_id: fixture.method_id, due: "2030-02-01", scheduled_at: "2026-09-28T00:00:00Z", fulfilled_by: null, fulfilled_at: null }] as never;
      return [] as never;
    });
    const { host, done: finish } = await mount(<ResultPage result={fixture} project={{ id: "P1", name: "P" }} />);
    expect(host.textContent).toContain("已存成 1 個任務，到分析頁看");
    expect(host.textContent).not.toContain("把行動計畫存成任務，設提醒");
    expect(host.textContent).toContain("已排在 2030-02-01 重跑");
    await finish();
  });
  it("⑦ options are picked several at once, 填入建議 fills every row it can, and saving sends the chosen options (M-75, M-76, operator 2026-09-29)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (init?.method === "POST" && path === "/projects/P1/tasks") return [{ task_id: "T1" }] as never;
      return [] as never;   // GET tasks/reruns/analyses on mount, and the next-step estimates: nothing saved yet
    });
    const { host, done: finish } = await mount(<ResultPage result={fixture} project={{ id: "P1", name: "P" }} />);
    const choose = () => [...host.querySelectorAll("button")].filter((b) => b.textContent === "選這條" || b.textContent === "已選 ✓");
    expect(choose()).toHaveLength(2);
    await act(async () => { choose()[1].click(); });
    await act(async () => { choose()[0].click(); });   // a second option: both stay chosen
    expect(choose().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    const save = () => [...host.querySelectorAll("button")].find((b) => b.textContent === "把行動計畫存成任務，設提醒") as HTMLButtonElement;
    expect(save().disabled).toBe(true);   // owner, due and target are the user's: nothing is filled until asked
    await act(async () => { ([...host.querySelectorAll("button")].find((b) => b.textContent === "填入建議（之後可改）") as HTMLButtonElement).click(); });
    const rows = [...host.querySelectorAll("table.plan tbody tr")].filter((row) => row.querySelector('input[aria-label^="負責人"]'));
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain("追蹤：Incident count");
    expect((rows[0].querySelector('input[aria-label^="負責人"]') as HTMLInputElement).value).toBe("Team");   // the AI's suggestion, now editable
    expect((rows[0].querySelector('input[aria-label^="期限"]') as HTMLInputElement).value).not.toBe("");
    expect(save().disabled).toBe(true);   // the metric row has no suggested owner: still the user's to fill
    await act(async () => { setValue(rows[1].querySelector('input[aria-label^="負責人"]') as HTMLInputElement, "Ops"); });
    await act(async () => { setValue(rows[1].querySelector('input[aria-label^="期限"]') as HTMLInputElement, "2030-01-01"); });
    await act(async () => { save().click(); });
    const [, init] = vi.mocked(apiFetch).mock.calls.find(([p, i]) => p === "/projects/P1/tasks" && i?.method === "POST")!;
    const body = JSON.parse(String(init!.body));
    expect(body.option).toBe("Observe、Change flow");
    expect(body.tasks.map((task: { owner: string }) => task.owner)).toEqual(["Team", "Ops"]);
    await finish();
  });
  it("⑦ B lists only the chosen options' steps, short then long, and the long plan follows the span the user picks (1.4.0)", async () => {
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    const [first, second] = fixture.solutions!.options;
    const phased = { ...fixture, solutions: { ...fixture.solutions!, long_horizon: "year" as const, plan: [
      { when: "第 1 週", action: "試行新順序", owner: "帶領者", proof: "紀錄", target: "不低於上次", phase: "short" as const, options: [first.name] },
      { when: "第 2 年", action: "改訓練教材", owner: "訓練負責人", proof: "新教材", target: "定稿", phase: "long" as const, options: [second.name] },
    ] } };
    const { host, done: finish } = await mount(<ResultPage result={phased} project={{ id: "P1", name: "P" }} />);
    const plan = () => host.querySelector("table.plan")!.textContent ?? "";
    expect(host.textContent).toContain("先在 A 選一條或幾條方案");
    expect(plan()).not.toContain("試行新順序");
    await act(async () => { ([...host.querySelectorAll("button")].filter((b) => b.textContent === "選這條")[1]).click(); });
    expect(plan()).toContain("改訓練教材");
    expect(plan()).not.toContain("試行新順序");   // an option not chosen keeps its steps out
    expect(plan()).toContain("長期：之後一年");
    expect(plan()).toContain("第 2 年（第 13 個月）");   // the unit the user picked, with the month (Codex 2026-09-29)
    await act(async () => { ([...host.querySelectorAll("button")].find((b) => b.textContent === "一季") as HTMLButtonElement).click(); });
    expect(plan()).toContain("第 2 季（第 4 個月）");
    expect([...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("一年"))!.textContent).toBe("一年（AI 建議）");
    await finish();
  });
  it("judgment words with no stance are never silently dropped: a nudge on blur, a block on 核准, 已存 once a stance is chosen (C1-11, N-62)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: "recorded", stance: "agree" } as never);
    const { host, done: finish } = await mount(<ResultPage result={fixture} />);
    const textarea = host.querySelector('textarea[aria-label="你的判斷"]') as HTMLTextAreaElement;
    await act(async () => { textarea.focus(); setValue(textarea, "x"); });
    await act(async () => { textarea.blur(); });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("先選同意／部分同意／不同意");
    expect(vi.mocked(apiFetch).mock.calls.some(([p]) => String(p).includes("/judgment"))).toBe(false);   // the words stayed unsaved rather than being silently dropped
    const approveButton = [...host.querySelectorAll("button")].find((b) => b.textContent === "核准，存進紀錄") as HTMLButtonElement;
    await act(async () => { approveButton.click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("先選同意／部分同意／不同意");
    expect(vi.mocked(apiFetch).mock.calls.some(([p]) => String(p).includes("/approval"))).toBe(false);
    await act(async () => { (host.querySelector(".judgment-button") as HTMLButtonElement).click(); });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("已存");
    await finish();
  });
  it("renders Eisenhower fixture as a quadrant", () => {
    const eisenhower = { ...fixture, method_id: "decision.eisenhower_matrix", visual: { kind: "quadrant", bindings: { items: "r/tasks", x: "r/tasks/0/urgency", y: "r/tasks/0/importance" } } };
    expect(renderToStaticMarkup(<ResultPage result={eisenhower} />)).toContain('data-visual="quadrant"');
  });
  it("shows prefilled next-step count and marks missing fields, without a target form to check against", () => {
    const next = { ...fixture, next_steps: [{ method_id: "systems.leverage_point_analysis", prefill: { events: "r/events" }, needs_input: ["objective"], yields: "Leverage points" }] };
    const html = renderToStaticMarkup(<ResultPage result={next} record={record} />);
    expect(html).toContain("自動填 1 個欄位");
    expect(html).toContain('<span class="need">還要你填 1 個</span>：objective');   // unknown target form: the old raw-key fallback
    expect(html).toContain("Release incidents increased");
    expect(html).toContain('<a class="btn primary" href="/methods/systems.leverage_point_analysis/run" target="_blank" rel="noopener">用這次的資料開始 ↗</a>');   // a new page; the run page reads the prefill
  });
  it("against the target's own form, resolves needs_input to its Chinese label and drops a prefill key that is not one of its real fields (N-13/N-14)", () => {
    const next = { ...fixture, next_steps: [{ method_id: "systems.leverage_point_analysis", prefill: { events: "r/events", bogus: "r/events" }, needs_input: ["objective"], yields: "Leverage points" }] };
    const stepForms = { "systems.leverage_point_analysis": [{ key: "events", kind: "list", label: "事件" }, { key: "objective", kind: "text", label: "目標" }] };
    const html = renderToStaticMarkup(<ResultPage result={next} record={record} stepForms={stepForms} />);
    const card8 = html.slice(html.indexOf('data-section="8"'), html.indexOf('data-section="9"'));
    expect(card8).toContain("自動填 1 個欄位");   // "bogus" is not a real field of the target: not counted (would be 2 if it were)
    expect(card8).toContain('<span class="need">還要你填 1 個</span>：目標');
    expect(card8).not.toContain("objective");   // the raw needs_input key never reaches the card; only the expert-mode JSON keeps it verbatim
  });
  it("states where the problem sits (第 N 層) in the journey pill and the ⑧ lead, instead of repeating the headline/summary, once there is a focus (N-03/N-07)", () => {
    const fields = ["events", "patterns", "structures", "mental_models"].map((key, index) => ({ key, kind: "list", label: `${"①②③④"[index]} ${["事件", "模式", "結構", "心智模型"][index]}：問題 ${index + 1}？` }));
    const positioned = { ...fixture, focus: { path: "r/structures", why: "切斷迴路" }, data_thickness: { events: { own_statements: 1 }, mental_models: { own_statements: 1 } } };
    const html = renderToStaticMarkup(<ResultPage result={positioned} record={record} fields={fields} names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(html).toContain('<span class="done">✓ 冰山模型：問題在第 3 層、根在第 4 層</span>');
    const lead = html.match(/<p class="lead mt6 mb0">([\s\S]*?)<\/p>/)![1];
    expect(lead.startsWith("你已經知道問題在第 3 層、根在第 4 層。")).toBe(true);
    expect(lead).not.toContain(positioned.summary);
    // no focus: falls back to the headline, as before
    const noFocus = renderToStaticMarkup(<ResultPage result={{ ...fixture, focus: undefined }} record={record} fields={fields} names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(noFocus).toContain(`<span class="done">✓ 冰山模型：${fixture.headline}</span>`);
  });
  it("card 8's actions carry the project through, and the workflow-chaining button no longer claims to run it (N-22/N-23/N-24)", () => {
    const withProject = renderToStaticMarkup(<ResultPage result={fixture} record={record} project={{ id: "P1", name: "團體反思" }} />);
    expect(withProject).toContain('href="/methods/systems.leverage_point_analysis?project=P1" target="_blank" rel="noopener">第一次用？先看它做什麼 ↗');
    expect(withProject).toContain('href="/analyze?project=P1#ask"');
    const noProject = renderToStaticMarkup(<ResultPage result={fixture} record={record} />);
    expect(noProject).toContain('href="/analyze#ask"');
    expect(noProject).not.toContain("?project=");
    expect(noProject).toContain('<button type="button" class="btn">看一步的建議順序，自己一步步做<small>串成一次跑完的工作流還在做（計畫 P3）</small></button>');
    expect(noProject).not.toContain("把建議的");   // the old "把建議的N步...一次跑完" claim is gone
  });
  it("names the next step whose yields mention data for 要提高, not always steps[0] (N-34)", () => {
    const twoSteps = { ...fixture, next_steps: [
      { ...fixture.next_steps![0], method_id: "root_cause.five_whys", yields: "根因鏈" },
      { ...fixture.next_steps![0], method_id: "systems.leverage_point_analysis", yields: "槓桿點與外部資料佐證" },
    ] };
    const html = renderToStaticMarkup(<ResultPage result={twoSteps} record={record} names={{ "root_cause.five_whys": "五個為什麼", "systems.leverage_point_analysis": "槓桿點分析" }} />);
    expect(html).toContain("或先在 ⑧ 用「槓桿點分析」往下挖");
    expect(html).not.toContain("或先在 ⑧ 用「五個為什麼」往下挖");
  });
  it("⑧ says when this project already ran a tool, with a link to that result (operator 2026-09-29)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => (path === "/projects/P1/analyses" ? [{ interpretation_id: "INTERP-OLD", method_id: "systems.leverage_point_analysis", status: "DONE" }] : []) as never);
    const { host, done: finish } = await mount(<ResultPage result={fixture} record={record} project={{ id: "P1", name: "P" }} />);
    const card = host.querySelector(".next-step")!;
    expect(card.textContent).toContain("這份分析已經做過");
    expect(card.querySelector('a[href="/projects/P1/analyses/INTERP-OLD"]')?.getAttribute("target")).toBe("_blank");
    await finish();
  });
  it("carries the approval state into the ⑧ prefill it hands to the new page through localStorage (N-45)", async () => {
    localStorage.clear();
    vi.mocked(apiFetch).mockRejectedValue(new Error("no estimate in this test"));
    const next = { ...fixture, next_steps: [{ method_id: "systems.leverage_point_analysis", prefill: { events: "r/events" }, needs_input: [], yields: "x" }] };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ResultPage result={next} record={record} names={{ "systems.iceberg_model": "冰山模型" }} approval={{ decision: "approve", at: "2026-01-01T00:00:00Z" }} />); });
    const link = host.querySelector<HTMLAnchorElement>(".next-step a.btn.primary")!;
    link.addEventListener("click", (event) => event.preventDefault());   // jsdom would otherwise try (and fail) to follow the real href
    await act(async () => { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    const stored = JSON.parse(localStorage.getItem("cos:prefill:systems.leverage_point_analysis")!);
    expect(stored.from).toEqual({ name: "冰山模型", approved: true });
    expect(stored.values).toEqual({ events: ["Release incidents increased"] });
    expect(typeof stored.at).toBe("number");   // the run page ignores a hand-over older than 10 minutes
    await act(async () => { root.unmount(); });
    host.remove();
    localStorage.clear();
  });
  it("with a lesson, the header opens it in a new tab; without one it opens the tool page", () => {
    const withLesson = renderToStaticMarkup(<ResultPage result={fixture} lesson="/learn/systems.iceberg_model" names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(withLesson).toContain('<div class="top"><h1>冰山模型分析<span>：Release incidents recur</span></h1><a class="howto" href="/learn/systems.iceberg_model" target="_blank" rel="noopener">怎麼用？先上 5 分鐘的課 ↗</a></div>');
    expect(renderToStaticMarkup(<ResultPage result={fixture} />)).toContain('<a class="howto" href="/methods/systems.iceberg_model">它做什麼？</a>');
  });
  it("renders finding-level revision conditions from the typed contract", () => {
    const withCondition = { ...fixture, findings: [{ ...fixture.findings[0], revision_conditions: [{ text: "New evidence", would_change: "Confidence level" }] }] };
    const html = renderToStaticMarkup(<ResultPage result={withCondition} record={record} />);
    expect(html).toContain("<span>① New evidence → Confidence level</span>");
  });

  it("omits the unspecified evidence sentinel and does not add a separator after sentence punctuation", () => {
    const html = renderToStaticMarkup(<ResultPage result={{ ...fixture, gaps: [
      { text: "第一個缺口。", needed_evidence: "未指定；需使用者補充證據" },
      { text: "第二個缺口", needed_evidence: "逐次觀察紀錄" },
    ] }} record={record} />);
    expect(html).not.toContain("（需要：未指定；需使用者補充證據）");
    expect(html).not.toContain("第一個缺口。；");
    expect(html).toContain("第二個缺口（需要：逐次觀察紀錄）");
  });

  it("shows a compact expert summary first and preserves the complete JSON in a nested disclosure", () => {
    const gates = [{ gate_id: "citation_integrity", status: "PASS", evidence: { cited: 1 } }];
    const html = renderToStaticMarkup(<ResultPage result={fixture} record={record} manifest={[{ id: "source-1", value: "完整資料" }]} gateResults={gates} />);
    const decode = (value: string) => value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    const blocks = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => JSON.parse(decode(match[1])) as Record<string, unknown>);
    expect(blocks).toHaveLength(2);
    expect(Object.keys(blocks[0])).toEqual(["id", "generated_by_method", "gate_results", "interpretation"]);
    expect(blocks[0]).toMatchObject({ id: fixture.interpretation_id, generated_by_method: fixture.method_id, gate_results: [{ gate_id: "citation_integrity", status: "PASS", evidence: { cited: 1 } }] });
    expect(blocks[1]).toMatchObject({ result: { interpretation_id: fixture.interpretation_id }, manifest: [{ id: "source-1", value: "完整資料" }] });
    expect(html).toContain("<summary>完整 JSON</summary>");
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

  it("這份結果要怎麼處理's 永久刪除 asks the server for an analysis only; 刪除分析 deletes whatever it is (Codex review 2026-10-11 round 3)", async () => {
    const deletes: string[] = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") { deletes.push(String(path)); return {} as never; }
      return (String(path) === "/projects/P1" ? { project_id: "P1", name: "示範專案", created_at: "2026-10-11T00:00:00Z", is_case: false } : []) as never;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { host, done } = await mount(<ResultPage result={fixture} record={record} project={{ id: "P1", name: "示範專案" }} />);
    const location = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...location, assign: vi.fn() } });
    try {
      await act(async () => { ([...host.querySelectorAll("#choices button")].find((item) => item.textContent === "永久刪除") as HTMLButtonElement).click(); });
      await act(async () => { ([...host.querySelectorAll("button")].find((item) => item.textContent === "刪除分析") as HTMLButtonElement).click(); });
      expect(deletes).toEqual(["/projects/P1?only=analysis", "/projects/P1"]);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: location });
      confirm.mockRestore();
      await done();
    }
  });
});
