"use client";

import React, { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { runHref, toolHref } from "../../lib/catalog";
import type { FormField } from "../../lib/form-model";
import { STANCE, type Stance } from "../../lib/projects";
import { plain, recordValue } from "../../lib/record";
import { RunHeader } from "../RunHeader";
import { LeverageChart, LoopChart, TrendChart, type Loop, type TrendSeries } from "./Charts";
import { HowTo } from "./HowTo";
import { ICEBERG_LAYERS, MethodVisual, type Unit } from "./MethodVisual";

// The result, card by card as docs/mockups/iceberg-result-mock.html (① conclusion … ⑨ citations, then the approve
// card), filled only from what the interpretation returns (schema method-interpretation 1.1.0). A section the
// interpretation did not produce, or whose sources failed its gate (detail_integrity evidence.dropped), says so; nothing
// is made up. data-section = the card's number (0 = header, "approve" = the last card); check-mocks.py --page result.
type Finding = { id: string; title: string; text: string; citations: string[]; confidence: { level: string; reason: string }; revision_conditions?: Array<{ text: string; would_change: string }> };
type Step = { method_id?: string; answers?: string; deepens?: string; prefill?: Record<string, string>; needs_input?: string[]; yields?: string; est_cost?: string };
type UnitReading = { path: string; meaning: string; action: string; effect: string; leverage: "low" | "mid" | "high"; citations: string[] };
type Solutions = {
  options: Array<{ name: string; what: string; takes: string; cost: string; durability: string; risk: string; advice: string; paths: string[] }>;
  first_step: string; plan?: Array<{ when: string; action: string; owner: string; proof: string; target: string }>;
  metrics?: Array<{ name: string; now: string; now_citation?: string; target: string; when: string }>;
};
type Interpretation = {
  interpretation_id: string; method_id: string; findings: Finding[]; visual: { kind: string; bindings: Record<string, unknown> };
  next_methods?: string[]; next_steps?: Step[]; recommendations?: Array<{ action?: string; expected?: string; citations?: string[] }>;
  gaps?: Array<{ text?: string; needed_evidence?: string }>; data_thickness?: Record<string, { own_statements?: number; external_sources?: number }>;
  summary?: string; units?: UnitReading[]; focus?: { path: string; why: string }; priority?: string; solutions?: Solutions;
  loop?: Loop; trend?: { reading: string; series: TrendSeries[] };
  provenance: Record<string, unknown>; model: string; usage: Record<string, number>;
};
type ManifestItem = { id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string };
type Gate = { gate_id: string; status: string; evidence?: unknown };
type Props = {
  result: Interpretation; record?: Record<string, unknown>; manifest?: ManifestItem[]; gateResults?: Gate[];
  display?: { name_zh?: string; name_en?: string; blurb_zh?: string };
  children?: ReactNode;            // the run form, kept under the header (plan U14)
  lesson?: string | null;          // the tool's lesson page, when it has one
  fields?: FormField[];            // the run form's fields: a layer's question is its field's label
  names?: Record<string, string>;  // tool id -> name, for the next steps
  project?: { id: string; name: string };   // the project this analysis is saved in
  analyzedAt?: string;             // when it finished (UTC ISO)
  judgment?: { stance: Stance; text: string } | null;   // the judgment saved with it, if any
};

const CONFIDENCE: Record<string, [string, string]> = { high: ["high", "高"], mid: ["mid", "中"], medium: ["mid", "中"], low: ["low", "低"] };
const LEVER: Record<string, string> = { low: "低", mid: "中", high: "高" };
const GATE_LABEL: Record<string, string> = { citation_integrity: "引註完整", next_methods_resolvable: "下一步都找得到", visual_bindings_resolvable: "圖都指向你的資料", detail_integrity: "數字與環節都有出處" };
const PICTURE: Record<string, string> = { layered: "你的問題在每一層各是什麼", quadrant: "每一項落在哪一格" };
const COST: Record<string, string> = { S: "小", M: "中", L: "大", XS: "很小", XL: "很大", low: "低", medium: "中", high: "高" };   // the model's size codes, spelled out
// a section the gate dropped says why in plain words (the evidence itself stays in the expert JSON)
const DROPPED: Record<string, string> = {
  trend: "這次的趨勢圖有數字對不上你填的內容，所以不畫。", loop: "這次找到的因果迴路有環節沒有出處或接不起來，所以不畫。",
  units: "這次的逐層解讀有地方沒有出處，所以只列你填的內容。", solutions: "這次的方案草稿有數字或對應沒有出處，所以不顯示。",
  focus: "這次建議先出手的位置沒有出處，所以不標。", summary: "", priority: "",
};
const NOT_BUILT = "核准存檔、退回重做、匯出 PDF 還在做；這次分析已經存在專案裡，隨時可以回來看。";
const PLAN_NOT_BUILT = "把計畫存成任務、到期自動重跑還在做；計畫已經跟這次分析一起存在專案裡。";

const dots = (n: number) => "●".repeat(Math.min(n, 3)) + "○".repeat(Math.max(0, 3 - n));
const keyOf = (path: string) => path.split("/")[1] ?? path;

function Card({ id, title, read, act, className = "card", anchor, children }: { id: string; title: string; read: string; act: string; className?: string; anchor?: string; children: ReactNode }) {
  return <div className={className} id={anchor} data-section={id}><h2>{title}</h2><HowTo read={read} act={act} />{children}</div>;
}

export function ResultPage({ result, record = {}, manifest = [], gateResults = [], display, children, lesson = null, fields = [], names = {}, project, analyzedAt, judgment: saved = null }: Props) {
  const [judgment, setJudgment] = useState<string>(saved?.stance ?? "");
  const [judgmentText, setJudgmentText] = useState(saved?.text ?? "");
  const [judgmentError, setJudgmentError] = useState("");
  const [note, setNote] = useState("");
  const [planNote, setPlanNote] = useState("");
  const findings = result.findings ?? [];
  const readings = result.units ?? [];
  const solutions = result.solutions;
  const dropped = ((gateResults.find((gate) => gate.gate_id === "detail_integrity")?.evidence ?? {}) as { dropped?: Record<string, string[]> }).dropped ?? {};
  const missing = (section: string, what: string) => (dropped[section] && DROPPED[section]) || `這次的分析沒有產出${what}。`;
  // every [n] on the page, in reading order: findings, recommendations, the per-layer readings, the loop, the trend, the metrics
  const citationIds = [...new Set([
    ...findings.flatMap((item) => item.citations), ...(result.recommendations ?? []).flatMap((item) => item.citations ?? []),
    ...readings.flatMap((item) => item.citations), ...(result.loop?.nodes ?? []).flatMap((node) => node.citations),
    ...(result.trend?.series ?? []).flatMap((series) => series.points.map((point) => point.citation)),
    ...(solutions?.metrics ?? []).flatMap((metric) => (metric.now_citation ? [metric.now_citation] : [])),
  ])];
  const citationNumber = new Map(citationIds.map((id, index) => [id, index + 1]));
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const resolved = (id: string) => { const fromRecord = recordValue(record, id); const item = manifestById.get(id); return fromRecord === undefined ? item?.value ?? item?.sha256 ?? "來源尚未載入" : plain(fromRecord); };
  // a sentence that cites the same line twice shows its [n] once
  const cites = (ids: string[] = []) => [...new Set(ids)].filter((id) => citationNumber.has(id)).map((id) => <cite key={id}><a href={`#citation-${citationNumber.get(id)}`}>[{citationNumber.get(id)}]</a></cite>);
  const citeText = (id: string) => (citationNumber.has(id) ? `［${citationNumber.get(id)}］` : "");
  // what a whole field is cited as: the analysis cites the field or its lines (r/events or r/events/0)
  const citedUnder = (path: string) => citationIds.filter((id) => id === path || id.startsWith(`${path}/`));
  const fieldOf = (path: string) => fields.find((field) => field.key === keyOf(path));
  const inputName = (path: string) => (fieldOf(path)?.label ?? keyOf(path)).split("：")[0];
  const question = (path: string) => { const label = fieldOf(path)?.label; return label?.includes("：") ? label.split("：").slice(1).join("：") : label ?? keyOf(path); };
  const readingOf = (path: string) => readings.find((item) => keyOf(item.path) === keyOf(path));
  const focusKey = result.focus ? keyOf(result.focus.path) : null;
  const optionsFor = (path: string) => (solutions?.options ?? []).filter((option) => option.paths.some((p) => keyOf(p) === keyOf(path)));
  const iceberg = result.method_id === "systems.iceberg_model";
  const levels = Array.isArray(result.visual?.bindings?.levels) ? result.visual.bindings.levels as Array<{ label?: string; path?: string }> : [];
  // the layers, top to bottom: the iceberg's are its four form fields in order (a layer the model did not bind still shows
  // what you filled in); any other layered tool's are the layers the model bound
  const layers: Array<{ path: string; label: string }> = iceberg && fields.length
    ? fields.map((field, index) => ({ path: String(levels.find((item) => keyOf(String(item.path ?? "")) === field.key)?.path ?? `r/${field.key}`), label: ICEBERG_LAYERS[index]?.name ?? String(field.label ?? field.key) }))
    : levels.map((level) => ({ path: String(level.path ?? ""), label: level.label ?? inputName(String(level.path ?? "")) }));
  const units: Unit[] = layers.map((layer) => ({ label: layer.label, question: fieldOf(layer.path)?.label ?? inputName(layer.path), text: resolved(layer.path), cite: citationNumber.get(citedUnder(layer.path)[0] ?? ""), focus: focusKey === keyOf(layer.path) }));
  const order = (unit: string) => { const at = fields.findIndex((field) => field.key === unit); return at < 0 ? fields.length : at; };
  const thickness = Object.entries(result.data_thickness ?? {}).sort(([a], [b]) => order(a) - order(b));
  const own = thickness.reduce((sum, [, v]) => sum + (v.own_statements ?? 0), 0);
  const sources = manifest.filter((item) => item.kind === "project_source").length;
  const thinnest = thickness.length > 1 ? thickness.reduce((a, b) => ((b[1].own_statements ?? 0) < (a[1].own_statements ?? 0) ? b : a)) : null;
  const filled = thickness.filter(([, v]) => (v.own_statements ?? 0) > 0).length;
  const conditions = findings.flatMap((finding) => finding.revision_conditions ?? []);
  const steps = (result.next_steps ?? []).filter((step) => step.method_id);
  const name = display?.name_zh ?? result.method_id;
  const tokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
  const stance = STANCE;
  const focusLayer = layers.find((layer) => keyOf(layer.path) === focusKey);

  return <div className="result-page">
    <RunHeader methodId={result.method_id} name={name} nameEn={display?.name_en} lesson={lesson} project={project} analyzedAt={analyzedAt} guide status={<>
      <span className="pill">AI 草稿・尚未核准</span>
      <span>資料：你填的 {own} 段話・外部來源 {sources} 筆</span>
      {thickness.length > 1 && <span>完整度 {filled}/{thickness.length}{thinnest ? `（${inputName(`r/${thinnest[0]}`)} 最薄：${thinnest[1].own_statements ?? 0} 句）` : ""}</span>}
      <span>約 {Math.max(1, Math.round(tokens / 1000))}k tokens</span>
    </>} />
    {children}

    <Card id="1" className="card accent" anchor="result" title="① 結論（文字分析）" read={`先看一句話，再看${findings.length ? ` ${findings.length} 個` : ""}發現各自的信心。`} act="在這張卡最下面寫你自己的判斷。">
      {result.summary && <p className="lead mt0"><b>一句話：</b>{result.summary}</p>}
      {findings.map((finding, index) => { const [cls, zh] = CONFIDENCE[finding.confidence?.level] ?? ["mid", finding.confidence?.level ?? "未標"]; return <div className="finding" key={finding.id}><b>發現 {index + 1}｜{finding.title}<span className={`conf ${cls}`}>信心：{zh}——{finding.confidence?.reason}</span></b>{finding.text} {cites(finding.citations)}</div>; })}
      {(result.recommendations ?? []).some((item) => item.action) && <p className="mt6 mb0"><b>建議：</b>{(result.recommendations ?? []).filter((item) => item.action).map((item, index) => <span key={index}>{index ? "；" : ""}{item.action}{item.expected ? `（預期：${item.expected}）` : ""} {cites(item.citations)}</span>)}</p>}
      {conditions.length > 0 && <div className="finding warn"><b>改判條件（出現這些證據，結論要改）</b>{conditions.map((condition, index) => <span key={index}>{"①②③④⑤⑥⑦⑧⑨"[index] ?? `${index + 1}.`} {condition.text} → {condition.would_change}{index < conditions.length - 1 ? "；" : ""}</span>)}</div>}
      <div className="judge"><b>你的判斷（你的原話才是記錄；上面 AI 寫的只是附掛）</b>
        <div className="btns">{(Object.keys(stance) as Array<keyof typeof stance>).map((key) => <button type="button" key={key} className={`btn judgment-button${judgment === key ? " primary" : ""}`} aria-pressed={judgment === key} onClick={async () => { setJudgmentError(""); try { await apiFetch(`/interpretations/${result.interpretation_id}/judgment`, { method: "POST", body: JSON.stringify({ stance: key, text: judgmentText }) }); setJudgment(key); } catch (failure) { setJudgmentError(failure instanceof Error ? failure.message : "送出失敗"); } }}>{stance[key]}</button>)}</div>
        <textarea aria-label="你的判斷" placeholder="你怎麼看？哪裡對、哪裡不對、你手上有什麼上面沒看到的證據？" value={judgmentText} onChange={(event) => setJudgmentText(event.target.value)} />
        <div className="sub mt4">先寫原話再按一個判斷，兩個會一起存進這次分析。</div>
        {judgmentError && <p role="alert">判斷送出失敗：{judgmentError}</p>}
      </div>
    </Card>

    <Card id="2" title={`② ${name}圖：${PICTURE[result.visual.kind] ?? "你的資料放在圖上的哪裡"}`} read={focusLayer ? "從上往下；★ 是建議先出手的一層。" : "圖上每一個位置都對應你填的一段。"} act="看你填的內容有沒有放錯位置。">
      <MethodVisual kind={result.visual.kind} bindings={result.visual.bindings} methodId={result.method_id} name={name} units={units} />
      {thickness.length > 0 && <div className="thick"><b>資料厚度</b>（你填了多少）：{thickness.map(([unit, value]) => `${inputName(`r/${unit}`)} ${dots(value.own_statements ?? 0)}`).join("　")}。薄的地方，結論的信心就低。</div>}
    </Card>

    <Card id="3" title="③ 圖表分析（每張圖回答一個問題）" read="每張圖回答一個問題，讀法寫在圖下。" act="不用做。">
      <div className="charts">
        {result.trend && <figure>
          <figcaption><b>圖 A｜趨勢：真的在變嗎？</b></figcaption>
          <TrendChart series={result.trend.series} cite={citeText} />
          <div className="read"><b>怎麼看：</b>橫軸是你寫下的時間點，線上的每個數字都出自你填的內容。<b>看到：</b>{result.trend.reading}<b>注意：</b>兩件事同時變化，不等於一件造成另一件。<b>來源：</b>{cites(result.trend.series.flatMap((series) => series.points.map((point) => point.citation)))}</div>
        </figure>}
        {result.loop && <figure>
          <figcaption><b>圖 B｜因果迴路：是什麼在推？</b></figcaption>
          <LoopChart loop={result.loop} />
          <div className="read"><b>怎麼看：</b>方框繞一圈是一條迴路，箭頭是「前者讓後者更嚴重」。<b>看到：</b>{result.loop.reading}<b>來源：</b>{cites(result.loop.nodes.flatMap((node) => node.citations))}</div>
        </figure>}
        {iceberg && <figure>
          <figcaption><b>圖 C｜槓桿對比：在哪一層出手最值得？</b>（四層）</figcaption>
          <LeverageChart />
          <div className="read"><b>怎麼看：</b>灰條是改變難度，藍條是效果與持久，越下面的層兩條都越長。<b>看到：</b>{focusLayer ? `這次建議先出手的是「${ICEBERG_LAYERS[layers.indexOf(focusLayer)]?.short ?? focusLayer.label}」：${result.focus?.why}` : "越往下越難改，改了也越持久。"}<b>來源：</b>冰山模型本身的介入模式，不是你的資料。</div>
        </figure>}
      </div>
      {!result.trend && <p className="sub mt8 mb0">趨勢圖：{missing("trend", "可以畫的數字（你填的內容裡至少要有兩個同一件事的數字）")}</p>}
      {!result.loop && <p className="sub mt8 mb0">因果迴路：{missing("loop", "有出處的因果迴路")}</p>}
    </Card>

    <Card id="4" title="④ 由上往下逐層解讀（每張卡同一格式）" read="每張卡同一格式，由上往下。" act="找出資料最薄的一層，之後補。">
      {layers.length ? layers.map((layer, index) => { const reading = readingOf(layer.path); const unit = keyOf(layer.path); const facts = iceberg ? ICEBERG_LAYERS[index] : undefined; const opts = optionsFor(layer.path);
        return <div className={`layer l${Math.min(index + 1, 4)} card ${index === layers.length - 1 ? "mb0" : "mb12"}`} key={index}>
          <div className="head"><h3>第 {index + 1} 層／{layers.length}：{layer.label}</h3>{facts && <span className="meta">{facts.seen} ・ 時間：{facts.time} ・ 出手方式：{facts.mode}</span>}</div>
          <div className="row"><b>這層問</b><span className="q">{question(layer.path)}</span></div>
          <div className="row"><b>你填的</b><span>{resolved(layer.path)} {cites(citedUnder(layer.path))}</span></div>
          {reading && <div className="row"><b>這代表</b><span>{reading.meaning} {cites(reading.citations)}</span></div>}
          {reading && <div className="row"><b>在這層出手</b><span>{reading.action}。<b>效果</b>：{reading.effect}<span className={`lever ${reading.leverage}`}>槓桿：{LEVER[reading.leverage] ?? reading.leverage}</span></span></div>}
          {(opts.length > 0 || focusKey === unit) && <div className="row"><b>對應方案</b><span>{opts.map((option) => `⑦ ${option.name}`).join("、")}{focusKey === unit ? `${opts.length ? " " : ""}★ 本次建議` : ""}</span></div>}
          <div className="row"><b>資料厚度</b><span>你填 {result.data_thickness?.[unit]?.own_statements ?? 0} 句・外部 {result.data_thickness?.[unit]?.external_sources ?? 0} 筆</span></div>
        </div>; }) : <p className="mb0">這個工具的結果是一張圖，不分層；請對照上面的圖逐項看。</p>}
      {layers.length > 0 && !readings.length && <p className="sub mt8 mb0">{missing("units", "每一層「這代表什麼、在這層怎麼出手」的解讀")}</p>}
    </Card>

    <Card id="5" title={focusLayer ? "⑤ 總結：在哪一層出手" : "⑤ 總結"} read="問題在哪、先做什麼、還缺什麼證據。" act="手上有缺口的資料，就回上面補、再執行。">
      <div className="finding"><b>主要發現</b>{result.summary ?? findings.map((item) => item.title || item.text).join("；")}</div>
      {result.priority && <div className="finding"><b>建議順序</b>{result.priority}</div>}
      {(result.gaps ?? []).length > 0 && <div className="finding warn"><b>證據缺口（老實說）</b>{(result.gaps ?? []).map((gap, index) => <span key={index}>{index ? "；" : ""}{gap.text}{gap.needed_evidence ? `（需要：${gap.needed_evidence}）` : ""}</span>)}</div>}
    </Card>

    <Card id="6" title={iceberg ? "⑥ 理解層次對照表（改編自 Anderson & Johnson）" : "⑥ 對照表"} read={focusLayer ? "一列一層，★ 是建議先出手的列。" : "一列一個你填的欄位。"} act={solutions ? "每一列都要有人負責，填在 ⑦ 的行動計畫。" : "看哪一列最薄，就先補那一列。"}>
      <div className="scroll-x"><table>
        <thead><tr>{iceberg ? <><th>層</th><th>出手方式</th><th>時間取向</th></> : <th>欄位</th>}<th>這一層問的問題</th><th>你的案例</th><th>建議動作</th></tr></thead>
        <tbody>{layers.map((layer, index) => { const facts = iceberg ? ICEBERG_LAYERS[index] : undefined; const star = focusKey === keyOf(layer.path) ? " ★" : "";
          return <tr key={index}>{facts ? <><td>{facts.short}{star}</td><td>{facts.mode}</td><td>{facts.when}</td></> : <td>{inputName(layer.path)}{star}</td>}<td>{question(layer.path)}</td><td>{resolved(layer.path)} {cites(citedUnder(layer.path))}</td><td>{readingOf(layer.path)?.action ?? "—"}</td></tr>; })}</tbody>
      </table></div>
      {iceberg && <p className="sub mt8 mb0">越往下一列：出手越慢、越難，但改變越根本。四列都要有人負責，不是只選一列。</p>}
    </Card>

    <Card id="7" className="card okline" anchor="solution" title="⑦ 解決方案：從分析到行動（選方案 → 行動計畫 → 追蹤驗證）" read="A 選一條路、B 排成計畫、C 用幾個數字盯著。" act={solutions ? "選方案、填負責人和期限、確認目標數字。" : "這次沒有方案草稿；先用 ① 的建議和 ⑧ 的下一步。"}>
      {solutions ? <>
        <h3 className="mt6 mb8">A. 選方案：{solutions.options.length} 條路比一比</h3>
        <div className="scroll-x"><table>
          <thead><tr><th>方案</th><th>做什麼</th><th>見效</th><th>成本</th><th>持久度</th><th>風險</th><th>建議</th></tr></thead>
          <tbody>{solutions.options.map((option, index) => <tr key={index}><td>{option.name}</td><td>{option.what}</td><td>{option.takes}</td><td>{option.cost}</td><td>{option.durability}</td><td>{option.risk}</td><td>{option.advice}</td></tr>)}</tbody>
        </table></div>
        <div className="finding mt12"><b>如果只做一件事，明天就做</b>{solutions.first_step}</div>
        {(solutions.plan ?? []).length > 0 && <>
          <h3 className="mt14 mb8">B. 行動計畫（AI 起草；負責人與期限請你確認）</h3>
          <div className="scroll-x"><table>
            <thead><tr><th>時間</th><th>行動</th><th>負責<span className="sub">（待確認）</span></th><th>怎麼證明有效</th><th>目標<span className="sub">（待你確認）</span></th></tr></thead>
            <tbody>{(solutions.plan ?? []).map((row, index) => <tr key={index}><td>{row.when}</td><td>{row.action}</td><td>{row.owner}</td><td>{row.proof}</td><td>{row.target}</td></tr>)}</tbody>
          </table></div>
        </>}
        {(solutions.metrics ?? []).length > 0 && <>
          <h3 className="mt14 mb8">C. 追蹤驗證：{(solutions.metrics ?? []).length} 個指標</h3>
          <div className="kpis">{(solutions.metrics ?? []).map((metric, index) => <div className="kpi" key={index}><b>{metric.name}</b><span className="now">現在 {metric.now}{metric.now_citation ? <> {cites([metric.now_citation])}</> : null}</span><span className="goal">目標 {metric.target}（待你確認）</span><span className="when">{metric.when}</span></div>)}</div>
        </>}
        <div className="btns mt10">
          <button type="button" className="btn primary" onClick={() => setPlanNote(PLAN_NOT_BUILT)}>把行動計畫存成任務，設提醒</button>
          <button type="button" className="btn" onClick={() => setPlanNote(PLAN_NOT_BUILT)}>到期自動重跑本分析並比較</button>
        </div>
        {planNote && <p className="mocknote" role="status">{planNote}</p>}
        <p className="sub mt8 mb0">工具負責想清楚、排出來、盯著看；動手做事的是人。目標數字由你定，AI 不替你定。</p>
      </> : <p className="sub mb0">{missing("solutions", "方案比較與行動計畫")}</p>}
    </Card>

    <Card id="8" title="⑧ 下一步：接著做什麼" read="每張卡寫做了會得到什麼、要你再填什麼。" act="選一張，或都不選。">
      <div className="journey"><span className="done">✓ {name}{result.summary ? `：${Array.from(result.summary).slice(0, 18).join("")}${Array.from(result.summary).length > 18 ? "…" : ""}` : ""}</span>{steps.map((step, index) => <React.Fragment key={index}><i>→</i><span className={index === 0 ? "mcard" : undefined}>{index === 0 ? "下一步：" : "也可以："}{names[step.method_id!] ?? step.method_id}</span></React.Fragment>)}{solutions && <><i>→</i><span>最後：⑦ 方案定案與追蹤</span></>}</div>
      <div className="mcards next-steps">{steps.map((step, index) => {
        const prefill = Object.fromEntries(Object.entries(step.prefill ?? {}).map(([key, id]) => [key, recordValue(record, id) ?? manifestById.get(id)?.value ?? ""]));
        const needs = step.needs_input ?? [];
        return <div className={`mcard next-step${index === 0 ? " now" : ""}`} key={index}>
          <div><b><Link href={toolHref(step.method_id!)}>{names[step.method_id!] ?? step.method_id}</Link></b>{index === 0 && <span className="tag">建議的下一步</span>}</div>
          {step.answers && <div><span className="k">回答什麼：</span>{step.answers}</div>}
          <div><span className="k">帶入什麼：</span>已帶入 {Object.keys(prefill).length} 欄；<span className="need">還要你填 {needs.length} 個</span>{needs.length ? `：${needs.map((need) => (need.startsWith("r/") ? inputName(need) : need)).join("、")}` : ""}</div>
          {step.yields && <div><span className="k">會得到：</span>{step.yields}</div>}
          {step.est_cost && <div className="k">預估成本：{COST[step.est_cost] ?? step.est_cost}</div>}
          <div className="btns"><a className={index === 0 ? "btn primary" : "btn"} href={runHref(step.method_id!)} onClick={() => sessionStorage.setItem(`cos:prefill:${step.method_id}`, JSON.stringify(prefill))}>用這次的資料開始</a></div>
        </div>; })}</div>
      {!steps.length && <p className="mb0">這次沒有建議下一步；不繼續也可以。</p>}
      <div className="btns mt12">
        <a className="btn" href="/#ask">不確定選哪個？描述你想知道什麼<small>系統幫你挑，最多三個建議</small></a>
        {solutions && <a className="btn" href="#solution">分析已經夠了，直接去 ⑦ 解決方案</a>}
      </div>
    </Card>

    <Card id="9" title="⑨ 引註（每個 [n] 都指向一段可查的來源）" read="[n] 是那句話的來源。" act="引錯了，在 ① 寫下你的判斷。">
      <ol className="src">{citationIds.map((id) => <li key={id} id={`citation-${citationNumber.get(id)}`} data-source={id}>{id.startsWith("r/") ? `你的輸入・${inputName(id)}` : `外部來源・${id}`}：「{resolved(id)}」</li>)}</ol>
      {sources === 0 && <div className="finding warn"><b>本次沒有外部來源</b>結論全部建立在你填的內容上；補上真實數字或外部資料，信心才會提高。</div>}
    </Card>

    <div className="card" id="approve" data-section="approve">
      <div className="meta-bar">
        <span>這一頁是 <b>AI 推論，尚未經人核准</b></span>
        <span>模型 <b>{result.model}</b></span>
        <span>用量 <b>約 {tokens.toLocaleString("en-US")} tokens</b></span>
        <span>檢查 {gateResults.length ? gateResults.map((gate) => <b key={gate.gate_id} className={gate.status === "PASS" ? "ok" : "warn"}>{GATE_LABEL[gate.gate_id] ?? gate.gate_id} {gate.status === "PASS" ? "✓" : "✗"} </b>) : <b>未提供</b>}</span>
        <span>你的判斷 <b>{judgment ? stance[judgment as keyof typeof stance] : "尚未填"}</b>（① 下方）</span>
      </div>
      <div className="sub mt8"><b>核准</b> = 這頁成為專案的正式紀錄；<b>退回</b> = 寫原因後重做，這一版保留。這頁只有你的租戶看得到。</div>
      <div className="btns mt12">
        <button type="button" className="btn primary" onClick={() => setNote(NOT_BUILT)}>核准，存進專案</button>
        <button type="button" className="btn" onClick={() => setNote(NOT_BUILT)}>退回並說原因</button>
        <button type="button" className="btn" onClick={() => setNote(NOT_BUILT)}>匯出 PDF</button>
        <a className="btn ghost" href="#expert">專家模式：閘門表與 JSON</a>
      </div>
      {note && <p className="mocknote" role="status">{note}</p>}
      <details className="mt10" id="expert"><summary>專家模式：完整 JSON 與閘門結果</summary><pre>{JSON.stringify({ result, gateResults, manifest }, null, 2)}</pre></details>
    </div>
  </div>;
}
