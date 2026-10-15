"use client";

import React, { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ResultChoices } from "./ResultChoices";
import { apiFetch } from "../../lib/api";
import { analysisHref, compareHref, projectHref, runHref, toolHref, toolLabel } from "../../lib/catalog";
import { fieldKey, type FormField } from "../../lib/form-model";
import { costLine, daysOf, holderWord, plusDays, STANCE, thisHolder, todayIso, type Approval, type Estimate, type Rerun, type Stance, type Task, runMinutes } from "../../lib/projects";
import { fieldAt, plain, recordValue, shownPath } from "../../lib/record";
import { formatTime } from "../../lib/time";
import { RunHeader } from "../RunHeader";
import { LoopChart, OWN_CHARTS, TrendChart, type Loop, type TrendSeries } from "./Charts";
import { HowTo } from "./HowTo";
import { MethodVisual, recordPicture, type Unit } from "./MethodVisual";
import { KNOWLEDGE_GAPS, NO_LESSON, UNIT_FACTS } from "../../lib/toolsheets.generated";
import { unitFields as unitFieldsOf } from "../../lib/units";

// The result, card by card as docs/mockups/iceberg-result-mock.html (① conclusion … ⑨ citations, then the approve
// card), filled only from what the interpretation returns (schema method-interpretation 1.2.0). A section the
// interpretation did not produce, or whose sources failed its gate (detail_integrity evidence.dropped / .removed), says
// so; nothing is made up. data-section = the card's number (0 = header, "approve" = the last card); check-mocks.py
// --page result compares the cards' headings, labels and buttons with the mock's.
type Finding = { id: string; title: string; text: string; citations: string[]; confidence: { level: string; reason: string }; revision_conditions?: Array<{ text: string; would_change: string }> };
type Step = { method_id?: string; answers?: string; deepens?: string; prefill?: Record<string, string>; needs_input?: string[]; yields?: string; est_cost?: string; short?: string; on_path?: boolean; why?: string };
type Thickness = { verdict: "enough" | "thin" | "thinnest" | "empty"; note?: string; fill_by?: string };
type UnitReading = { path: string; brief?: string; meaning: string; action: string; step?: string; effect: string; leverage: "low" | "mid" | "high" | "max"; citations: string[]; thickness?: Thickness };
type Solutions = {
  options: Array<{ name: string; what: string; takes: string; cost: string; durability: string; risk: string; advice: string; paths: string[] }>;
  first_step: string; recommended?: string; horizon?: string; long_horizon?: Span; signoff?: string;
  plan?: Array<{ when: string; action: string; owner: string; proof: string; target: string; phase?: "short" | "long"; options?: string[] }>;
  metrics?: Array<{ name: string; now: string; now_citation?: string; target: string; when: string }>;
};
// ⑦ B (1.4.0): the long plan's span, the AI's suggestion first; the short plan is always the first month
type Span = "month" | "quarter" | "year";
const SPAN_MONTHS: Record<Span, number> = { month: 1, quarter: 3, year: 12 };
const SPAN_LABEL: Record<Span, string> = { month: "月", quarter: "季", year: "年" };
const OPTION_MARKS = "甲乙丙丁戊";
/** The date `months` from today, YYYY-MM-DD (local), for a long plan row's suggested due date. */
function plusMonths(months: number): string {
  const date = new Date(); date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** A long-plan month in the unit the user picked, with the month itself: 4 in a quarter -> 第 2 季（第 4 個月）. */
const spanLabel = (months: number, span: Span) => (span === "month" ? `第 ${months} 個月` : `第 ${Math.ceil(months / SPAN_MONTHS[span])} ${SPAN_LABEL[span]}（第 ${months} 個月）`);
/** 「第 2 到 4 週」 -> 4: the week a short row ends in (null when it names no week). */
const lastWeek = (when: string) => { const numbers = when.match(/\d+/g); return numbers ? Number(numbers[numbers.length - 1]) : null; };
type PlanRow = { key: string; group: "short" | "long" | "track"; when: string; action: string; options: string[]; owner: string; due: string; proof: string; target: string };
type PlanEdit = { owner?: string; due?: string; target?: string };

type Interpretation = {
  interpretation_id: string; method_id: string; findings: Finding[]; visual: { kind: string; bindings: Record<string, unknown> };
  next_methods?: string[]; next_steps?: Step[]; recommendations?: Array<{ action?: string; expected?: string; citations?: string[] }>;
  gaps?: Array<{ text?: string; needed_evidence?: string; path?: string; citations?: string[] }>; data_thickness?: Record<string, { own_statements?: number; external_sources?: number }>;
  picture_units?: Array<{ path: string; label: string; members: string[]; own_statements: number }>;   // 1.5.0, server-written
  headline?: string; summary?: string; units?: UnitReading[]; focus?: { path: string; why: string }; priority?: string; solutions?: Solutions;
  diagnosis?: { title: string; text: string; citations: string[] }; priority_short?: string;
  loop?: Loop; trend?: { question?: string; reading: string; series: TrendSeries[] };
  provenance: Record<string, unknown>; model: string; usage: Record<string, number>;
};
type ManifestItem = { id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string; title?: string };
type Gate = { gate_id: string; status: string; evidence?: unknown };
type Props = {
  result: Interpretation; record?: Record<string, unknown>; manifest?: ManifestItem[]; gateResults?: Gate[];
  recordGates?: Gate[];            // the method's own gates on the record (層序…), stored with the analysis
  display?: { name_zh?: string; name_en?: string; blurb_zh?: string };
  children?: ReactNode;            // the run form, kept under the header (plan U14)
  lesson?: string | null;          // the tool's lesson page, when it has one
  lessons?: Record<string, string>;   // every tool's lesson page, for the next-step cards
  fields?: FormField[];            // the run form's fields: a layer's question is its field's label
  names?: Record<string, string>;  // tool id -> name, for the next steps
  stepForms?: Record<string, FormField[]>;   // a next step's target method_id -> its own run form's fields (N-13/N-14: what
                                              // it can honestly carry and what it still needs, by the TARGET's real fields and Chinese labels)
  family?: string | null;          // the tool's family, for the tool line
  project?: { id: string; name: string; isCase?: boolean };   // the case or analysis this analysis is saved in
  analyzedAt?: string;             // when it finished (UTC ISO)
  judgment?: { stance: Stance; text: string } | null;   // the judgment saved with it, if any
  approval?: Approval | null;      // the latest 核准／退回 decision saved with it
  costTwd?: number | null;         // what it cost, from the API's price table
  oldVersion?: boolean;            // made before the result page had its sections: offer a rerun
  compareWith?: string | null;     // the analysis this one redoes or reruns: offer the comparison
  onRedo?: (reason: string) => void;   // 退回 → 依原因重做: the run page prepares the next run
  demo?: boolean;                  // the read-only 示範分析: nothing writes; a button that would says so (N-78)
};

const CONFIDENCE: Record<string, [string, string]> = { high: ["high", "高"], mid: ["mid", "中"], medium: ["mid", "中"], low: ["low", "低"] };
const LEVER: Record<string, string> = { low: "低", mid: "中低", high: "高", max: "最高" };   // the mock's four levels
// The approve bar shows the mock's four checks, each read from a real evaluation (N-39/N-40/N-42/N-43); every gate,
// these and the rest, is listed in the expert table. A check that was not run is not shown -- never a ✓ by default.
function approveChecks(gates: Gate[], recordGates: Gate[]): Array<{ label: string; ok: boolean; tip: string }> {
  const find = (list: Gate[], id: string) => list.find((gate) => gate.gate_id === id);
  const passed = (gate?: Gate) => gate?.status === "PASS" || gate?.status === "NOT_APPLICABLE";
  const citation = find(gates, "citation_integrity");
  const order = find(recordGates, "top_down_completeness");
  const preset = find(gates, "no_preset_conclusion");
  const unsupported = Number((citation?.evidence as { unsupported?: number } | undefined)?.unsupported ?? 0);
  return [
    ...(citation ? [{ label: "來源", ok: passed(citation) && unsupported === 0, tip: "每一句主張都有 [n]" }] : []),
    ...(order ? [{ label: "層序", ok: passed(order), tip: "沒有跳層：有模式才寫結構、有結構才寫心智模型" }]
      : recordGates.length ? [{ label: "方法檢查", ok: recordGates.every(passed), tip: recordGates.map((gate) => gate.gate_id).join("、") }] : []),
    ...(citation ? [{ label: "引註完整", ok: passed(citation), tip: "每個 [n] 都找得到來源" }] : []),
    ...(preset ? [{ label: "無預設結論", ok: passed(preset), tip: "沒有把 AI 的話當成你的結論；你的判斷欄還在" }] : []),
  ];
}

// Words the mock defines on hover (M-16): one table, applied to a layer's reading wherever the word appears.
const GLOSSARY: Array<[string, string]> = [["同步不等於因果", "兩件事一起發生，不等於一件造成另一件"], ["迴路", "A 造成 B，B 又回頭讓 A 更嚴重"]];
export function withDefinitions(text: string): ReactNode {
  const pattern = new RegExp(`(${GLOSSARY.map(([word]) => word).join("|")})`);
  return text.split(pattern).map((part, index) => { const found = GLOSSARY.find(([word]) => word === part); return found ? <dfn key={index} title={found[1]}>{part}</dfn> : part; });
}

const GATE_LABEL: Record<string, string> = { citation_integrity: "引註完整", next_methods_resolvable: "下一步都找得到", visual_bindings_resolvable: "圖都指向你的資料", detail_integrity: "數字與環節都有出處" };
const GATE_TIP: Record<string, string> = { citation_integrity: "每個發現的 [n] 都找得到來源，發現裡的數字都是你填過的", next_methods_resolvable: "⑧ 的每個工具都存在、都能帶入", visual_bindings_resolvable: "② 的每一層都對到你填的內容", detail_integrity: "指標的現況數字有出處、迴路每一環都有出處且接得起來；對不上的已拿掉並在該卡說明" };
const PICTURE: Record<string, string> = { layered: "你的問題在每一層各是什麼", quadrant: "每一項落在哪一格" };
const COST: Record<string, string> = { S: "小", M: "中", L: "大", XS: "很小", XL: "很大", low: "低", medium: "中", high: "高" };   // the model's size codes, spelled out
const NUMERAL = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九"];
const ownLetter = (index: number) => String.fromCharCode(67 + index);   // ③: A trend, B loop, then the tool's own charts C, D…
const UNSPECIFIED_EVIDENCE = new Set(["未指定；需使用者補充證據", "Not specified; user must supply evidence"]);
// a section the gate dropped says why in plain words (the evidence itself stays in the expert JSON)
const DROPPED: Record<string, string> = {
  trend: "這次的趨勢圖有數字對不上你填的內容，所以不畫。", loop: "這次找到的因果迴路有環節沒有出處或接不起來，所以不畫。",
  units: "這次的逐層解讀有地方沒有出處，所以只列你填的內容。", solutions: "這次的方案草稿有數字或對應沒有出處，所以不顯示。",
  focus: "這次建議先出手的位置沒有出處，所以不標。", summary: "", priority: "",
};
const WORKFLOW_NOT_BUILT = "把建議的步驟串成一條工作流，一次跑完：工作流逐站頁還在做（計畫 P3）。現在先按每張卡的「用這次的資料開始」，一步一步跑，每一步都會停下來給你確認。";
const CASE_NOT_BUILT = (rerunLabel: string) => `案例庫還沒做：到期時問你「改善了沒」、改善了記進案例庫，這兩步還不會自動發生。現在按「${rerunLabel}」排到期重跑，到期時你自己比較；沒改善就回到上面的 A 表重選。`;

const dots = (n: number) => "●".repeat(Math.min(n, 3)) + "○".repeat(Math.max(0, 3 - n));
const keyOf = (path: string) => path.split("/")[1] ?? path;

function Card({ id, title, read, act, className = "card", anchor, children }: { id: string; title: string; read: string; act: string; className?: string; anchor?: string; children: ReactNode }) {
  return <div className={className} id={anchor} data-section={id}><h2>{title}</h2><HowTo read={read} act={act} />{children}</div>;
}

export function ResultPage({ result, record = {}, manifest = [], gateResults = [], recordGates = [], display, children, lesson = null, lessons = {}, fields = [], names = {}, stepForms = {}, family = null, project, analyzedAt, judgment: savedJudgment = null, approval: savedApproval = null, costTwd = null, oldVersion = false, compareWith = null, onRedo, demo = false }: Props) {
  const [judgment, setJudgment] = useState<string>(savedJudgment?.stance ?? "");
  const [judgmentText, setJudgmentText] = useState(savedJudgment?.text ?? "");
  const [savedText, setSavedText] = useState(savedJudgment?.text ?? "");   // your words are saved with the stance, and again when they change
  const [judgmentError, setJudgmentError] = useState("");
  const [judgmentNotice, setJudgmentNotice] = useState("");   // role=status: "先選…" when text has no stance yet (N-62), or "已存（time）" after a save
  const [judgmentStanceRequired, setJudgmentStanceRequired] = useState(false);   // role=alert: 核准／退回 stopped because the words have no stance (C1-11)
  const [approval, setApproval] = useState<Approval | null>(savedApproval);
  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState("");
  const [planNote, setPlanNote] = useState("");
  // ⑦ B: owner, due date and target are the user's (D16): the AI's suggestion is a placeholder until 「填入建議」 copies it in
  const [planEdits, setPlanEdits] = useState<Record<string, PlanEdit>>({});
  const [planError, setPlanError] = useState("");
  const [rerunDue, setRerunDue] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>(() => (result.solutions?.recommended ? [result.solutions.recommended] : []));   // ⑦ A: options picked, several at once (M-76)
  const [span, setSpan] = useState<Span>(() => result.solutions?.long_horizon ?? "quarter");   // ⑦ B: the long plan's span
  const [projectAnalyses, setProjectAnalyses] = useState<Array<{ interpretation_id: string; method_id?: string | null; status: string }>>([]);   // ⑧: what the project already ran
  const [savedTasks, setSavedTasks] = useState<Task[] | null>(null);       // this project's tasks already on file, so ⑦ never saves the same plan twice (M-73)
  const [savedReruns, setSavedReruns] = useState<Rerun[] | null>(null);    // this project's rerun reminders already on file, so ⑦ never double-books one (M-79)
  const [estimates, setEstimates] = useState<Record<string, Estimate>>({});
  const findings = result.findings ?? [];
  const readings = result.units ?? [];
  const solutions = result.solutions;
  const detail = (gateResults.find((gate) => gate.gate_id === "detail_integrity")?.evidence ?? {}) as { dropped?: Record<string, string[]>; removed?: Record<string, string[]> };
  const dropped = detail.dropped ?? {};
  const removed = detail.removed ?? {};
  const missing = (section: string, what: string) => (dropped[section] && DROPPED[section]) || (oldVersion ? `舊版分析沒有${what}；重跑一次就會有。` : `這次的分析沒有產出${what}。`);
  const checks = approveChecks(gateResults, recordGates);
  const lostCount = Object.keys(dropped).length + Object.values(removed).reduce((sum, notes) => sum + notes.length, 0);
  // the tool's own units (lessons data, units.items[].result: what each asks, shows, when, how you act there), as form fields
  const unitFacts = UNIT_FACTS[result.method_id];
  const knowledgeGaps = KNOWLEDGE_GAPS[result.method_id] ?? NO_LESSON;   // I11: a tool whose knowledge is incomplete says what it lacks
  const factsOf = (path: string) => unitFacts?.find((unit) => unit.key === keyOf(path));
  const unitFields = unitFieldsOf(result.method_id, fields);
  // every [n] on the page, in reading order: findings, recommendations, the per-layer readings, the loop, the trend, the metrics,
  // and the tool's units themselves (the mock numbers every layer, cited or not)
  const pictureUnits = unitFields.length ? [] : result.picture_units ?? [];   // a tool whose picture has its own units (bones, whys, bars)
  const layerPaths = [...unitFields.map((field) => `r/${field.key}`), ...pictureUnits.map((unit) => unit.path)];
  const citationIds = [...new Set([
    ...findings.flatMap((item) => item.citations), ...(result.recommendations ?? []).flatMap((item) => item.citations ?? []),
    ...readings.flatMap((item) => item.citations), ...(result.loop?.nodes ?? []).flatMap((node) => node.citations),
    ...(result.trend?.series ?? []).flatMap((series) => series.points.map((point) => point.citation)),
    ...(solutions?.metrics ?? []).flatMap((metric) => (metric.now_citation ? [metric.now_citation] : [])),
    ...(result.next_steps ?? []).flatMap((step) => Object.values(step.prefill ?? {})),
    ...(result.diagnosis?.citations ?? []), ...(result.gaps ?? []).flatMap((gap) => gap.citations ?? []),
    ...(result.loop?.feeders ?? []).flatMap((feeder) => feeder.citations),
    ...layerPaths,
  ])];
  const citationNumber = new Map(citationIds.map((id, index) => [id, index + 1]));
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const resolved = (cited: string) => { const id = shownPath(fields, cited); const fromRecord = recordValue(record, id); const item = manifestById.get(cited); return fromRecord === undefined ? item?.value ?? item?.sha256 ?? "來源尚未載入" : plain(fromRecord, fieldAt(fields, id)); };
  // N-32/P-29: an external source cites by title, linking to its actual content -- not its id and a sha256, which
  // told the reader nothing. A source the model never returned a title for (older data) still shows its id, honestly.
  const sourceCitation = (id: string) => {
    const item = manifestById.get(id);
    if (item?.kind !== "project_source") return null;
    const label = item.title || id;
    return project ? <a href={`/api/projects/${encodeURIComponent(project.id)}/sources/${encodeURIComponent(item.source_id ?? "")}/content`} target="_blank" rel="noreferrer">{label}</a> : label;
  };
  // a sentence that cites the same line twice shows its [n] once
  const cites = (ids: string[] = []) => [...new Set(ids)].filter((id) => citationNumber.has(id)).map((id) => <cite key={id}><a href={`#citation-${citationNumber.get(id)}`}>[{citationNumber.get(id)}]</a></cite>);
  const citeText = (id: string) => (citationNumber.has(id) ? `［${citationNumber.get(id)}］` : "");
  // what a whole field is cited as: the analysis cites the field or its lines (r/events or r/events/0)
  const citedUnder = (path: string) => citationIds.filter((id) => id === path || id.startsWith(`${path}/`));
  const fieldOf = (path: string) => fields.find((field) => field.key === keyOf(path));
  const inputName = (path: string) => (fieldOf(path)?.label ?? keyOf(path)).split("：")[0].replace(/^[①-⑳]\s*/, "");
  const question = (path: string) => { const label = fieldOf(path)?.label; return label?.includes("：") ? label.split("：").slice(1).join("：") : label ?? keyOf(path); };
  // an option belongs to the deepest layer it acts on (the mock names 丙 on layer 4, not on 3 and 4); options are labelled 甲乙丙 in order
  const optionHome = (option: { paths: string[] }) => Math.max(-1, ...option.paths.map(layerIndex));
  const optionsFor = (path: string) => (solutions?.options ?? []).filter((option) => optionHome(option) === layerIndex(path));
  const optionName = (option: { name: string }) => option.name.replace(/^[甲乙丙丁戊]\s*/, "") || option.name;   // a bare 「乙」 keeps its name rather than none
  const optionLabel = (option: { name: string }) => OPTION_MARKS[(solutions?.options ?? []).indexOf(option as never)] ?? "";
  const optionTag = (option: { name: string }) => `${optionLabel(option)}「${optionName(option)}」`;
  const drawn = recordPicture(result.method_id, record);   // a picture drawn from the record names its own card ②, and says what ③④⑥ need of it
  const ownCharts = OWN_CHARTS[result.method_id] ?? [];
  const externalSourceCount = (reading?: UnitReading) => new Set(
    (reading?.citations ?? []).filter((id) => manifestById.get(id)?.kind === "project_source"),
  ).size;
  const levels = Array.isArray(result.visual?.bindings?.levels) ? result.visual.bindings.levels as Array<{ label?: string; path?: string }> : [];
  // the units, top to bottom: a tool whose form fields are its units has them in form order (a layer the model did not
  // bind still shows what you filled in); a tool whose picture has its own units has the server's list (picture_units:
  // each covers its member ids, so a reading or a citation of any member belongs to it); any other layered tool's are the
  // layers the model bound. `key` names a unit in data_thickness and the thickness lines.
  type Layer = { key: string; path: string; label: string; members?: string[]; own?: number };
  const layers: Layer[] = unitFields.length
    ? unitFields.map((field) => ({ key: String(field.key), path: String(levels.find((item) => keyOf(String(item.path ?? "")) === field.key)?.path ?? `r/${field.key}`), label: factsOf(`r/${field.key}`)?.title ?? String(field.label ?? field.key) }))
    : pictureUnits.length ? pictureUnits.map((unit) => ({ key: unit.path, path: unit.path, label: unit.label, members: unit.members, own: unit.own_statements }))
    : levels.map((level) => ({ key: keyOf(String(level.path ?? "")), path: String(level.path ?? ""), label: level.label ?? inputName(String(level.path ?? "")) }));
  const owns = (layer: Layer, id: string) => (layer.members ? layer.members.some((member) => id === member || id.startsWith(`${member}/`)) : keyOf(id) === layer.key);
  const layerIndex = (id: string) => layers.findIndex((layer) => owns(layer, id));
  const readingAt = (index: number) => (index < 0 ? undefined : readings.find((item) => layerIndex(item.path) === index));
  const readingOf = (path: string) => readingAt(layerIndex(path));
  const focusAt = result.focus ? layerIndex(result.focus.path) : -1;
  const U = drawn?.unit ?? "層";   // what one unit is called: 層, 根骨, 步, 項, 段
  const layered = !pictureUnits.length;   // units ordered by depth (layers): the deepest is the root; a picture's units (bones, bars…) are not
  const citedIn = (layer: Layer) => (layer.members ? citationIds.filter((id) => layer.members!.some((member) => id === member || id.startsWith(`${member}/`))) : citedUnder(layer.path));
  const filledIn = (layer: Layer) => (layer.members ? layer.members.map(resolved).join("；") : resolved(layer.path));
  const layerName = (layer: Layer) => (layer.members ? layer.label : inputName(layer.path));
  const factTable = layers.length > 0 && layers.every((layer) => factsOf(layer.path));   // ⑥ gets its 出手方式／時間取向 columns
  const layerNumbers = (ids: string[]) => [...new Set(ids.map(layerIndex).filter((index) => index >= 0))].sort().map((index) => index + 1);
  const layerNote = (ids: string[]) => { const numbers = layerNumbers(ids); return numbers.length ? `（第 ${numbers.join("、")} ${U}）` : ""; };
  const units: Unit[] = layers.map((layer, index) => { const reading = readingAt(index); return { key: layer.key, label: layer.label, question: fieldOf(layer.path)?.label ?? inputName(layer.path), text: filledIn(layer), brief: reading?.brief, step: reading?.step, cite: citationNumber.get(citedIn(layer)[0] ?? ""), focus: focusAt === index }; });
  const order = (unit: string) => { const at = fields.findIndex((field) => field.key === unit); return at < 0 ? fields.length : at; };
  const thickness: Array<[string, { own_statements?: number }]> = pictureUnits.length ? layers.map((layer) => [layer.key, { own_statements: layer.own ?? 0 }])
    : Object.entries(result.data_thickness ?? {}).sort(([a], [b]) => order(a) - order(b));
  const countOf = (unit: string) => thickness.find(([key]) => key === unit)?.[1].own_statements ?? 0;
  const own = thickness.reduce((sum, [, v]) => sum + (v.own_statements ?? 0), 0);
  const sources = manifest.filter((item) => item.kind === "project_source").length;
  const counts = thickness.map(([, value]) => value.own_statements ?? 0);
  const least = counts.length ? Math.min(...counts) : 0;
  const thinnest = thickness.length > 1 && counts.filter((count) => count === least).length === 1 ? thickness[counts.indexOf(least)] : null;   // a tie names no thinnest layer
  const filled = thickness.filter(([, v]) => (v.own_statements ?? 0) > 0).length;
  const layerNo = (unit: string) => { const index = layers.findIndex((layer) => layer.key === unit); return index >= 0 ? `第 ${index + 1} ${U}` : inputName(`r/${unit}`); };
  const VERDICT: Record<Thickness["verdict"], string> = { enough: "夠用", thin: "薄", thinnest: "最薄", empty: "空白，列成證據缺口" };
  const thicknessOf = (unit: string) => { const index = layers.findIndex((layer) => layer.key === unit); return (index >= 0 ? readingAt(index) : readings.find((item) => keyOf(item.path) === unit))?.thickness; };
  const verdict = (unit: string) => { const count = countOf(unit); const own = thicknessOf(unit)?.verdict;
    return count === 0 ? "空白，列成證據缺口" : own ? VERDICT[own] : thinnest && thinnest[0] === unit && thickness.length > 1 ? "最薄" : "夠用"; };
  const thicknessNote = (unit: string) => { const t = thicknessOf(unit); return `${t?.note ? `（${t.note}）` : ""}${t?.fill_by ? `，⑧ ${toolLabel(names, t.fill_by)}可補` : ""}`; };
  const recommendedOption = (option: { name: string }) => solutions?.recommended === option.name;
  const conditions = findings.flatMap((finding) => finding.revision_conditions ?? []);
  const steps = (result.next_steps ?? []).filter((step) => step.method_id);
  // the recommended path (schema 1.3.0 on_path, at most two); without the flag the first two steps; the others are alternatives on the cards
  const pathSteps = steps.some((step) => step.on_path) ? steps.filter((step) => step.on_path).slice(0, 2) : steps.slice(0, 2);
  // the step whose yields names data/evidence, for "要提高" (N-34); with none of those, the most-worth-doing step (steps[0])
  const dataStep = steps.find((step) => /資料|數字|來源|證據/.test(step.yields ?? "")) ?? steps[0];
  const name = display?.name_zh ?? toolLabel(names, result.method_id);
  const tokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
  const focusLayer = focusAt >= 0 ? layers[focusAt] : undefined;
  const focusReading = readingAt(focusAt);
  const focusIndex = focusAt;
  // the deepest layer you actually wrote something in (own_statements > 0), for "根在第 M 層"; -1 when every layer is blank
  const rootLayerIndex = !layered ? -1 : (() => { for (let index = layers.length - 1; index >= 0; index -= 1) { if (countOf(layers[index].key) > 0) return index; } return -1; })();
  // where the problem sits (N-03/N-07): the journey pill and the ⑧ lead state a position, not the headline/summary, once there is a focus
  const position = focusIndex >= 0 ? `問題在第 ${focusIndex + 1} ${U}${rootLayerIndex >= 0 && rootLayerIndex !== focusIndex ? `、根在第 ${rootLayerIndex + 1} ${U}` : ""}` : null;
  // a next step's target form (N-13/N-14): known only once RunPage has fetched it; unknown target = trust the model's data as before
  const stepFieldsOf = (methodId: string) => stepForms[methodId];
  const stepFieldKeys = (methodId: string) => { const target = stepFieldsOf(methodId); return target ? new Set(target.map(fieldKey)) : null; };
  const stepFieldLabel = (methodId: string, key: string) => { const target = stepFieldsOf(methodId); const match = target?.find((candidate) => fieldKey(candidate) === key); if (match) return match.label ?? key; return target ? key : (key.startsWith("r/") ? inputName(key) : key); };
  const horizonDays = daysOf(solutions?.horizon);
  const weekRow = (when: string) => /^\s*\d+(\s*(到|[–~-])\s*\d+)?\s*$/.test(when) || /週|周/.test(when);   // 1 到 2, 3 到 4, 5, 第 1 週
  const planInWeeks = (solutions?.plan ?? []).length > 0 && (solutions?.plan ?? []).every((row) => weekRow(row.when));   // the mock's plan is laid out in weeks; a plan in other units keeps its own column name
  const layerCount = layers.length ? `${NUMERAL[layers.length] ?? layers.length}${U}` : `逐${U}`;
  const deepest = layered ? layers.length - 1 : -1;
  const beliefNodes = new Set((result.loop?.feeders ?? []).length ? [] : (result.loop?.nodes ?? []).filter((node) => node.citations.length > 0 && node.citations.every((id) => layerIndex(id) === deepest) && deepest >= 2).map((node) => node.id));
  const chartCount = [result.trend, result.loop].filter(Boolean).length + ownCharts.length;
  // a chart's units: where the tool's registration homes it, else the units it cites
  const chartNote = (chart: "trend" | "loop", cited: string[]) => layerNote(drawn?.homes ? drawn.homes[chart].map((key) => `r/${key}`) : cited);
  const loopCites = new Set((result.loop?.nodes ?? []).flatMap((node) => node.citations));
  const loopFindings = findings.map((finding, index) => index + 1).filter((number) => findings[number - 1].citations.some((id) => loopCites.has(id)));
  const saveJudgment = async (stance: Stance, text: string) => {
    await apiFetch(`/interpretations/${result.interpretation_id}/judgment`, { method: "POST", body: JSON.stringify({ stance, text }) });
    setSavedText(text);
    setJudgmentNotice(`已存（${formatTime(new Date().toISOString()).slice(11)}）`);
  };
  // typed words with no stance are never silently dropped: they stay unsaved and the user is told why (N-62)
  const saveJudgmentText = async () => {
    if (judgmentText === savedText) return;
    if (!judgment) { setJudgmentNotice("先選同意／部分同意／不同意，這段話才會存起來。"); return; }
    await saveJudgment(judgment as Stance, judgmentText);
  };
  const removedNote = (section: string, what: string) => (removed[section]?.length ? <p className="sub mt6 mb0">{removed[section].length} 個{what}沒有出處，已拿掉（專家模式有細節）。</p> : null);
  const missingLayerReading = removed.units?.length ? `這一${U}的解讀沒有出處，已拿掉` : `這次的分析沒有寫這一${U}`;
  const gapNeed = (needed?: string) => needed && !UNSPECIFIED_EVIDENCE.has(needed) ? `（需要：${needed}）` : "";
  const gapSeparator = (previous?: string) => previous && !/[。！？；.!?;]\s*$/.test(previous) ? "；" : "";
  const gapText = (result.gaps ?? []).map((gap, index) => `${index ? gapSeparator(result.gaps?.[index - 1]?.text) : ""}${gap.text ?? ""}`).join("");
  const expertSummary = {
    id: result.interpretation_id,
    generated_by_method: result.method_id,
    gate_results: gateResults.map(({ gate_id, status, evidence }) => ({ gate_id, status, evidence: evidence ?? {} })),
    interpretation: { layers: layers.length, findings: findings.length, gaps: (result.gaps ?? []).length, next_methods: (result.next_methods ?? []).length },
  };

  useEffect(() => {   // what each next step would cost (花錢前先講), from the API's estimate for that tool
    let active = true;
    Promise.all(steps.map((step) => apiFetch<Estimate>(`/methods/${encodeURIComponent(step.method_id!)}/estimate`).then((estimate) => [step.method_id!, estimate] as const).catch(() => null)))
      .then((pairs) => { if (active) setEstimates(Object.fromEntries(pairs.flatMap((pair) => (pair ? [pair] : [])))); });
    return () => { active = false; };
  }, [result.interpretation_id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // what this project already holds, so ⑦ never lets the same plan be saved twice or a rerun be double-booked (M-73, M-79)
    if (!project) return;
    let active = true;
    Promise.all([apiFetch<Task[]>(`/projects/${encodeURIComponent(project.id)}/tasks`), apiFetch<Rerun[]>(`/projects/${encodeURIComponent(project.id)}/reruns`)])
      .then(([existingTasks, existingReruns]) => { if (active) { setSavedTasks(existingTasks); setSavedReruns(existingReruns); } })
      .catch(() => undefined);
    apiFetch<Array<{ interpretation_id: string; method_id?: string | null; status: string }>>(`/projects/${encodeURIComponent(project.id)}/analyses`)
      .then((list) => { if (active && Array.isArray(list)) setProjectAnalyses(list); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [project?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (work: () => Promise<void>) => { setActionError(""); try { await work(); } catch (failure) { setActionError(failure instanceof Error ? failure.message : "沒有成功"); } };
  const plan = async (work: () => Promise<void>) => { setPlanError(""); try { await work(); } catch (failure) { setPlanError(failure instanceof Error ? failure.message : "沒有成功"); } };   // ⑦'s own errors show in ⑦
  const rerunLabel = `${horizonDays ? `${horizonDays} 天後` : "到期"}重跑本分析並比較`;
  const kpiNow = (now: string) => now.replace(/^現在\s*/, "");
  const kpiTarget = (target: string) => target.replace(/^目標\s*/, "").replace(/（待你?確認）$/, "");
  const phased = (solutions?.plan ?? []).some((row) => row.phase);
  const serves = (row: { options?: string[] }) => !row.options?.length || row.options.some((name) => chosen.includes(name));   // a row naming no option serves every option
  const shortRows = (solutions?.plan ?? []).filter((row) => (row.phase ?? "short") === "short" && serves(row));
  const longRows = (solutions?.plan ?? []).filter((row) => row.phase === "long" && serves(row));
  const planRows: PlanRow[] = [
    ...shortRows.map((row, index) => ({ key: `s${(solutions?.plan ?? []).indexOf(row)}`, group: "short" as const, when: row.when, action: row.action, options: row.options ?? [], owner: row.owner, due: plusDays(7 * (lastWeek(row.when) ?? (phased ? 4 : index + 1))), proof: row.proof, target: kpiTarget(row.target) })),
    ...longRows.map((row, index) => { const months = 1 + Math.round(((index + 1) * SPAN_MONTHS[span]) / longRows.length);
      return { key: `l${(solutions?.plan ?? []).indexOf(row)}`, group: "long" as const, when: spanLabel(months, span), action: row.action, options: row.options ?? [], owner: row.owner, due: plusMonths(months), proof: row.proof, target: kpiTarget(row.target) }; }),
    ...(solutions?.metrics ?? []).map((metric, index) => ({ key: `m${index}`, group: "track" as const, when: phased ? spanLabel(1 + SPAN_MONTHS[span], span) : metric.when, action: `追蹤：${metric.name}`, options: [], owner: "", due: phased ? plusMonths(1 + SPAN_MONTHS[span]) : "", proof: metric.name, target: kpiTarget(metric.target) })),
  ];
  const planValue = (row: PlanRow, field: keyof PlanEdit) => planEdits[row.key]?.[field] ?? "";
  const editPlan = (row: PlanRow, field: keyof PlanEdit, value: string) => setPlanEdits((current) => ({ ...current, [row.key]: { ...current[row.key], [field]: value } }));
  const fillSuggestions = () => setPlanEdits((current) => Object.fromEntries(planRows.map((row) => [row.key, { owner: current[row.key]?.owner || row.owner, due: current[row.key]?.due || row.due, target: current[row.key]?.target || row.target }])));
  const tasksReady = planRows.length > 0 && planRows.every((row) => planValue(row, "owner").trim() && planValue(row, "due") && planValue(row, "target").trim());
  const decide = (decision: "approve" | "return", reason = "") => {
    setActionError("");
    if (judgmentText.trim() && !judgment) { setJudgmentStanceRequired(true); return undefined; }   // never silently drop the words (C1-11)
    return act(async () => {
      await saveJudgmentText();   // 填了會和這頁一起存
      const saved = await apiFetch<Approval>(`/interpretations/${encodeURIComponent(result.interpretation_id)}/approval`, { method: "POST", body: JSON.stringify({ decision, reason }) });
      setApproval(saved); setReturning(false);
    });
  };
  const savedTaskCount = (savedTasks ?? []).filter((task) => task.interpretation_id === result.interpretation_id).length;
  const openRerun = (savedReruns ?? []).find((item) => item.interpretation_id === result.interpretation_id && !item.fulfilled_by) ?? null;
  const saveTasks = () => plan(async () => {
    if (!project || !tasksReady) return;
    const tasks = planRows.map((row) => ({ when: row.when, title: row.action, owner: planValue(row, "owner").trim(), due: planValue(row, "due"), proof: row.proof, target: planValue(row, "target").trim() }));
    const option = chosen.length && solutions ? solutions.options.filter((item) => chosen.includes(item.name)).map(optionName).join("、") : undefined;
    const saved = await apiFetch<Task[]>(`/projects/${encodeURIComponent(project.id)}/tasks`, { method: "POST", body: JSON.stringify({ interpretation_id: result.interpretation_id, option, tasks }) });
    setSavedTasks(saved);
    setPlanNote(`已存成 ${tasks.length} 個任務；到期會在${thisHolder(project.isCase)}的頁面和「我的案子」提醒你，每個任務都能寫紀錄。`);
  });
  const scheduleRerun = () => plan(async () => {
    if (!rerunDue) return;
    const rerun = await apiFetch<Rerun>(`/interpretations/${encodeURIComponent(result.interpretation_id)}/rerun`, { method: "POST", body: JSON.stringify({ due: rerunDue }) });
    setSavedReruns((current) => [...(current ?? []), rerun]);
    setRerunDue(null); setPlanNote(`已排在 ${rerun.due}：到期時${thisHolder(project?.isCase)}的頁面和「我的案子」會提醒你更新數字重跑，跑完把兩次並排比較。`);
  });
  // onlyAnalysis: from 這份結果要怎麼處理 (shown while not a case); the server refuses it if the project became a case since
  // this page loaded (PROJECT_IS_A_CASE). 刪除案子／刪除分析 deletes this project whatever it is.
  const erase = (onlyAnalysis: boolean) => act(async () => {
    if (!project) return;
    if (!window.confirm(`刪除${holderWord(project.isCase)}「${project.name}」？來源與所有產出一起刪掉，留一筆「已抹除」。這不能復原。`)) return;
    await apiFetch(`/projects/${encodeURIComponent(project.id)}${onlyAnalysis ? "?only=analysis" : ""}`, { method: "DELETE" });
    window.location.assign("/projects");
  });
  const approvalText = approval?.decision === "approve" ? `已核准（${approval.by_name ?? ""}，${formatTime(approval.at)}）` : approval?.decision === "return" ? `已退回（${formatTime(approval.at)}）：${approval.reason ?? ""}` : "AI 推論，尚未經人核准";

  // demo: a click on anything that would write is stopped here, once, before any handler runs (PDF, 選這條 and links still work)
  const [demoNote, setDemoNote] = useState("");
  const blockInDemo = (event: React.MouseEvent) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || button.hasAttribute("data-demo-ok")) return;
    event.preventDefault(); event.stopPropagation();
    setDemoNote(`這是示範分析：不能核准、存任務、排提醒或寫判斷。用你自己的案例在「${name}」跑一次，這些按鈕就都能用。`);
  };
  return <div className="result-page" onClickCapture={demo ? blockInDemo : undefined}>
    {demo && <div className="finding warn" role="status"><b>示範分析（免費，不花錢）</b>這是示範案例的一次真實分析，給你先看終點。要分析你自己的案例：<Link href={`/methods/${encodeURIComponent(result.method_id)}/run`}>到「{display?.name_zh ?? toolLabel(names, result.method_id)}」填你的格子 →</Link>{demoNote && <><br />{demoNote}</>}</div>}
    <RunHeader methodId={result.method_id} name={name} nameEn={display?.name_en} family={family} headline={result.headline} lesson={lesson} project={project} analyzedAt={analyzedAt} guide count={fields.length} status={<>
      <span className="pill">{approval?.decision === "approve" ? "已核准" : approval?.decision === "return" ? "已退回・待重做" : "AI 草稿・尚未核准"}</span>
      {knowledgeGaps.length > 0 && <span className="pill">知識不足：缺 {knowledgeGaps.join("、")}</span>}
      <span>資料：你填的 {own} 段話・外部來源 {sources} 筆</span>
      {thickness.length > 1 && <span>{layerCount}完整度 {filled}/{thickness.length}{thinnest ? `（${layerNo(thinnest[0])}最薄：只有 ${thinnest[1].own_statements ?? 0} 句）` : ""}</span>}
      <span>{costLine(tokens, costTwd)}</span>
    </>} />
    {children}

    <Card id="1" className="card accent" anchor="result" title="① 結論（文字分析）" read={`先看一句話，再看${findings.length ? `${NUMERAL[findings.length] ?? findings.length}個` : ""}發現各自的信心。`} act="在最下面寫你自己的判斷。">
      {oldVersion && <div className="finding warn"><b>這次是舊版分析</b>只有結論、下一步和引註，沒有一句話、逐層解讀、圖和方案。上面的格子已帶回你填的內容；按「執行分析」用新版重跑一次，會存在同一個地方，當作新的一次分析。</div>}
      {result.summary && <p className="lead mt0"><b>一句話：</b>{result.summary}</p>}
      {findings.map((finding, index) => { const [cls, zh] = CONFIDENCE[finding.confidence?.level] ?? ["mid", finding.confidence?.level ?? "未標"]; return <div className="finding" key={finding.id}><b>發現 {index + 1}｜{finding.title}<span className={`conf ${cls}`}>信心：{zh}——{finding.confidence?.reason}</span></b>{finding.text} {cites(finding.citations)}</div>; })}
      {((result.recommendations ?? []).some((item) => item.action) || (result.gaps ?? []).length > 0) && <p className="mt6 mb0">
        {(result.recommendations ?? []).some((item) => item.action) && <><b>建議：</b>{(result.recommendations ?? []).filter((item) => item.action).map((item, index) => <span key={index}>{index ? "；" : ""}{item.action} {cites(item.citations)}</span>)}{(result.gaps ?? []).length > 0 ? "。" : ""}</>}
        {gapText && <><b>證據缺口：</b>{gapText}{/[。！？.!?]\s*$/.test(gapText) ? "" : "。"}</>}
      </p>}
      {conditions.length > 0 && <div className="finding warn"><b>改判條件（出現這些證據，結論要改）</b>{conditions.map((condition, index) => <span key={index}>{"①②③④⑤⑥⑦⑧⑨"[index] ?? `${index + 1}.`} {condition.text} → {condition.would_change}{index < conditions.length - 1 ? "；" : ""}</span>)}</div>}
      <div className="judge"><b>你的判斷（你的原話才是記錄；上面 AI 寫的只是附掛）</b>
        <div className="btns">{(Object.keys(STANCE) as Stance[]).map((key) => <button type="button" key={key} className={`btn judgment-button${judgment === key ? " primary" : ""}`} aria-pressed={judgment === key} onClick={async () => { setJudgmentError(""); setJudgmentStanceRequired(false); try { await saveJudgment(key, judgmentText); setJudgment(key); } catch (failure) { setJudgmentError(failure instanceof Error ? failure.message : "送出失敗"); } }}>{STANCE[key]}</button>)}</div>
        <textarea aria-label="你的判斷" placeholder="你怎麼看？哪裡對、哪裡不對、你手上有什麼上面沒看到的證據？" value={judgmentText} onChange={(event) => { setJudgmentText(event.target.value); setJudgmentNotice(""); setJudgmentStanceRequired(false); }} onBlur={() => { saveJudgmentText().catch((failure) => setJudgmentError(failure instanceof Error ? failure.message : "送出失敗")); }} />
        <div className="sub mt4">沒填也能核准；填了會和這頁一起存。</div>
        {judgmentNotice && <p className="sub mt4" role="status">{judgmentNotice}</p>}
        {judgmentStanceRequired && <p role="alert">先選同意／部分同意／不同意，這段話才會存起來，再按核准或退回。</p>}
        <p className="print-only">你的判斷：{judgment ? STANCE[judgment as Stance] : "尚未填"}{judgmentText ? `：${judgmentText}` : ""}</p>
        {judgmentError && <p role="alert">判斷送出失敗：{judgmentError}</p>}
      </div>
    </Card>

    <Card id="2" title={`② ${drawn?.heading ?? `${name}圖`}：${drawn?.caption ?? PICTURE[result.visual.kind] ?? "你的資料放在圖上的哪裡"}`} read={focusLayer ? `${layered ? "從上往下；" : ""}★ 是建議先出手的${U}。` : "圖上每一個位置都對應你填的一段。"} act={layers.length ? `看你填的${NUMERAL[layers.length] ?? ""}段話有沒有放錯${U}。` : "看你填的內容有沒有放錯位置。"}>
      <MethodVisual kind={result.visual.kind} bindings={result.visual.bindings} methodId={result.method_id} name={name} units={units} record={record} fields={fields} />
      {thickness.length > 0 && <div className="thick"><b>資料厚度</b>（你填了多少）：{thickness.map(([unit, value]) => `${layerNo(unit)} ${dots(value.own_statements ?? 0)}${thicknessOf(unit)?.note ? `（${thicknessOf(unit)!.note}）` : thinnest && thinnest[0] === unit && thickness.length > 1 ? `（最薄：只有 ${value.own_statements ?? 0} 句）` : ""}`).join("　")}。薄的{U}，結論的信心就低。</div>}
      {removedNote("units", `${U}的解讀`)}
    </Card>

    <Card id="3" title={`③ 圖表分析（${NUMERAL[chartCount] ?? chartCount}張圖各回答一個問題）`} read="每張圖回答一個問題，讀法寫在圖下。" act="不用做；圖 A 沒畫出來時，是你填的內容裡同一件事的數字不到兩個。">
      <div className="charts">
        {result.trend && <figure>
          <figcaption><b>圖 A｜趨勢：{result.trend.question ?? "真的在變嗎？"}</b>{chartNote("trend", result.trend.series.flatMap((series) => series.points.map((point) => point.citation)))}</figcaption>
          <TrendChart series={result.trend.series} cite={citeText} />
          <div className="read"><b>怎麼看：</b>左軸是{result.trend.series[0].name}（實線）{result.trend.series[1] ? `，右軸是${result.trend.series[1].name}（虛線）` : ""}；橫軸是你寫下的時間點。<b>看到：</b>{result.trend.reading}{result.trend.series.length > 1 && <><b>注意：</b>同時發生不等於一個造成另一個。</>}<b>來源：</b>{cites(result.trend.series.flatMap((series) => series.points.map((point) => point.citation)))}</div>
        </figure>}
        {result.loop && <figure>
          <figcaption><b>圖 B｜因果迴路：是什麼在推？</b>{chartNote("loop", result.loop.nodes.flatMap((node) => node.citations))}</figcaption>
          <LoopChart loop={result.loop} dashed={beliefNodes} />
          <div className="read"><b>怎麼看：</b>{NUMERAL[result.loop.nodes.length] ?? result.loop.nodes.length}個方框繞一圈是迴路，箭頭方向是「誰讓誰更嚴重」{beliefNodes.size ? "；虛線框是信念層在餵它" : ""}。<b>看到：</b>{result.loop.reading}<b>來源：</b>{cites(result.loop.nodes.flatMap((node) => node.citations))}{loopFindings.length ? `、${loopFindings.map((number) => `發現 ${number}`).join("、")}` : ""}</div>
        </figure>}
        {ownCharts.map((chart, index) => <figure key={chart.shows}>
          <figcaption><b>圖 {ownLetter(index)}｜{chart.title}</b>{chart.scope}</figcaption>
          {chart.draw()}
          <div className="read"><b>怎麼看：</b>{chart.how}<b>看到：</b>{chart.saw}{focusLayer ? `這次建議先出手的是「${factsOf(focusLayer.path)?.short ?? focusLayer.label}」：${result.focus?.why}` : ""}<b>來源：</b>{chart.source}，不是你的資料。</div>
        </figure>)}
      </div>
      {!result.trend && <p className="sub mt8 mb0">圖 A 趨勢：{dropped.trend ? DROPPED.trend : "這次沒有畫：分析沒有從你填的內容裡挑出同一件事在兩個時間點的數字；有的話，回上面把它們寫在同一格再執行。"}{removed.trend?.length ? "（有數字對不上你填的內容，已拿掉）" : ""}</p>}
      {!result.loop && <p className="sub mt8 mb0">圖 B 因果迴路：{missing("loop", "有出處的因果迴路")}</p>}
      <p className="sub mt8 mb0">{NUMERAL[chartCount] ?? chartCount}張圖各自對應{drawn?.parts ?? "圖上的一格或幾格"}；圖 A 用你的數字，圖 B 由分析結果生成{ownCharts.map((chart, index) => `，圖 ${ownLetter(index)} 是${chart.source}`).join("")}。</p>
    </Card>

    <Card id="4" title={layered ? `④ 由上往下${layerCount}解讀（每張卡同一格式）` : `④ ${layerCount}逐一解讀（每張卡同一格式）`} read={`${layers.length ? `${NUMERAL[layers.length] ?? layers.length}張` : "每張"}卡同一格式，${layered ? "由上往下" : "照圖上的順序"}。`} act={`找出資料最薄的一${U}，之後補。`}>
      {layers.length ? layers.map((layer, index) => { const reading = readingAt(index); const unit = layer.key; const facts = factsOf(layer.path); const opts = optionsFor(layer.path);
        return <div className={`layer l${Math.min(index + 1, 4)} card ${index === layers.length - 1 ? "mb0" : "mb12"}`} key={index}>
          <div className="head"><h3>第 {index + 1} {U}／{layers.length}：{layer.label}</h3>{facts && <span className="meta">{facts.seen} ・ 時間：{facts.time} ・ 出手方式：{facts.mode}</span>}</div>
          <div className="row"><b>這{U}問</b><span className="q">{facts?.ask4 ?? question(layer.path)}</span></div>
          <div className="row"><b>你填的</b><span>{filledIn(layer)} {cites(citedIn(layer))}</span></div>
          <div className="row"><b>這代表</b>{reading ? <span>{withDefinitions(reading.meaning)} {cites(reading.citations)}</span> : <span className="sub">{missingLayerReading}</span>}</div>
          <div className="row"><b>在這{U}出手</b>{reading ? <span>{reading.action}{/[。！？]$/.test(reading.action) ? "" : "。"}<b>效果</b>：{reading.effect}<span className={`lever ${reading.leverage}`}>槓桿：{LEVER[reading.leverage] ?? reading.leverage}</span></span> : <span className="sub">{missingLayerReading}</span>}</div>
          <div className="row"><b>對應方案</b><span>{opts.length ? opts.map((option) => `⑦ ${optionTag(option)}${solutions?.recommended && recommendedOption(option) ? "★ 本次建議" : ""}`).join("、") : drawn?.homes?.trend.includes(unit) && solutions?.metrics?.length ? "⑦ C 的追蹤指標（不是方案，是量法）" : solutions ? `—（⑦ 沒有方案在這${U}出手）` : "這次沒有方案草稿"}{solutions?.recommended ? "" : focusAt === index ? (opts.length ? "★ 本次建議" : `　★ 本次建議先在這${U}出手`) : ""}</span></div>
          <div className="row"><b>資料厚度</b><span>你填 {countOf(unit)} 句・外部 {externalSourceCount(reading)} 筆 → {verdict(unit) === "最薄" || verdict(unit) === "薄" ? <span className="warn">{verdict(unit)}</span> : verdict(unit)}{thicknessNote(unit)}</span></div>
        </div>; }) : <p className="mb0">這個工具的結果是一張圖，不分層；請對照上面的圖逐項看。</p>}
    </Card>

    <Card id="5" title={focusLayer ? `⑤ 總結：在哪一${U}出手` : "⑤ 總結"} read={`三句話：問題在哪、先做哪${U}、還缺什麼。`} act="手上有缺口的資料，就回上面補、再執行。">
      {result.diagnosis ? <div className="finding"><b>主要發現：{result.diagnosis.title}</b>{result.diagnosis.text} {cites(result.diagnosis.citations)}</div>
        : <div className="finding"><b>主要發現</b>{result.summary ?? findings.map((item) => item.title || item.text).join("；")}</div>}
      {result.priority ? <div className="finding"><b>建議順序{result.priority_short ? `：${result.priority_short}` : focusLayer ? `：先第 ${focusAt + 1} ${U}` : ""}</b>{result.priority}</div> : <div className="finding"><b>建議順序</b>{missing("priority", "出手順序")}</div>}
      {(result.gaps ?? []).length > 0 ? <div className="finding warn"><b>證據缺口（老實說）</b>{(result.gaps ?? []).map((gap, index) => <span key={index}>{index ? gapSeparator(result.gaps?.[index - 1]?.text) : ""}{gap.path ? `「${inputName(gap.path)}」` : ""}{gap.text}{gapNeed(gap.needed_evidence)}{gap.citations?.length ? <> {cites(gap.citations)}</> : null}</span>)}</div> : <div className="finding warn"><b>證據缺口（老實說）</b>這次分析沒有列出缺口；沒有外部來源時，結論全靠你填的內容。</div>}
    </Card>

    <Card id="6" title={`⑥ ${drawn?.table?.title ?? "對照表"}`} read={focusLayer ? `一列一${U}，★ 是建議先出手的列。` : "一列一個你填的欄位。"} act={solutions ? `${layers.length ? `${NUMERAL[layers.length] ?? layers.length}列` : "每一列"}都要有人負責，填在 ⑦ B 表。` : "看哪一列最薄，就先補那一列。"}>
      <div className="scroll-x"><table>
        <thead><tr>{factTable ? <><th>層</th><th>出手方式</th><th>時間取向</th></> : <th>{layered ? "欄位" : U}</th>}<th>這一{U}問的問題</th><th>你的案例</th><th>建議動作</th></tr></thead>
        <tbody>{layers.map((layer, index) => { const facts = factTable ? factsOf(layer.path) : undefined; const star = focusAt === index ? " ★" : ""; const reading = readingAt(index);
          return <tr key={index}>{facts ? <><td>{facts.short}{star}</td><td>{facts.mode}</td><td>{facts.when}</td></> : <td>{layerName(layer)}{star}</td>}<td>{facts?.asks ?? question(layer.path)}</td><td>{reading?.brief ?? filledIn(layer)} {cites(citedIn(layer))}</td><td>{reading?.step ?? reading?.action ?? "—"}</td></tr>; })}</tbody>
      </table></div>
      {drawn?.table && <p className="sub mt8 mb0">{drawn.table.note}</p>}
    </Card>

    <Card id="7" className="card okline" anchor="solution" title="⑦ 解決方案：從分析到行動（選方案 → 行動計畫 → 追蹤驗證）" read={`A 選方案（可複選）、B 短期一個月＋長期一${SPAN_LABEL[span]}、C ${solutions?.metrics?.length ? `${NUMERAL[solutions.metrics.length] ?? solutions.metrics.length}個數字盯著` : "這次沒有指標"}。`} act={solutions ? "選方案、按「填入建議」再改，存成任務。" : "這次沒有方案草稿；先用 ① 的建議和 ⑧ 的下一步。"}>
      {solutions ? <>
        <h3 className="mt6 mb8">A. 選方案：{NUMERAL[solutions.options.length] ?? solutions.options.length}條路比一比（可複選）</h3>
        <div className="scroll-x"><table>
          <thead><tr><th>方案</th><th>做什麼</th><th>見效</th><th>成本</th><th>持久度</th><th>風險</th><th>建議</th></tr></thead>
          <tbody>{solutions.options.map((option, index) => <tr key={index}><td>{optionLabel(option)} {optionName(option)}<br /><button type="button" className="btn mt4" data-demo-ok aria-pressed={chosen.includes(option.name)} onClick={() => setChosen((current) => (current.includes(option.name) ? current.filter((name) => name !== option.name) : [...current, option.name]))}>{chosen.includes(option.name) ? "已選 ✓" : "選這條"}</button></td><td>{option.what}{option.paths.length ? `（第 ${layerNumbers(option.paths).join("、")} ${U}）` : ""}</td><td>{option.takes}</td><td>{option.cost}</td><td>{option.durability}</td><td>{option.risk}</td><td>{recommendedOption(option) ? <b>{option.advice}</b> : option.advice}</td></tr>)}</tbody>
        </table></div>
        <div className="finding mt12"><b>如果只做一件事，明天就做</b>{solutions.first_step}</div>
        {(solutions.plan ?? []).length > 0 && <>
          <h3 className="mt14 mb8">B. 行動計畫：短期一個月＋長期一{SPAN_LABEL[span]}（AI 起草；負責人、期限、目標由你定）</h3>
          <div className="btns mb8"><span className="sub">長期要看多久：</span>{(["month", "quarter", "year"] as Span[]).map((choice) => <button type="button" key={choice} className="btn" data-demo-ok aria-pressed={span === choice} onClick={() => setSpan(choice)}>一{SPAN_LABEL[choice]}{solutions.long_horizon === choice ? "（AI 建議）" : ""}</button>)}<button type="button" className="btn" data-demo-ok onClick={fillSuggestions}>填入建議（之後可改）</button></div>
          {!chosen.length && <p className="sub">先在 A 選一條或幾條方案；計畫只列你選的方案的步驟和共用的步驟。</p>}
          <div className="scroll-x"><table className="plan">
            <thead><tr><th>時間</th><th>方案</th><th>行動</th><th>負責人</th><th>期限</th><th>怎麼證明有效</th><th>目標</th></tr></thead>
            <tbody>{(["short", "long", "track"] as const).map((group) => { const rows = planRows.filter((row) => row.group === group); return rows.length ? <React.Fragment key={group}>
              <tr className="group"><td colSpan={7}>{group === "short" ? (phased ? "短期：第一個月（每週一步）" : `行動計畫${solutions.horizon ? `（${solutions.horizon}）` : ""}`) : group === "long" ? `長期：之後一${SPAN_LABEL[span]}` : "追蹤：C 的指標"}</td></tr>
              {rows.map((row) => <tr key={row.key}><td>{row.when}</td><td>{row.options.length ? row.options.map((name) => { const option = solutions.options.find((item) => item.name === name); return option ? `${optionLabel(option)} ${optionName(option)}` : name; }).join("、") : "共用"}</td><td>{row.action}</td>
                <td><input aria-label={`負責人：${row.action}`} value={planValue(row, "owner")} placeholder={row.owner ? `建議：${row.owner}` : "你填"} onChange={(event) => editPlan(row, "owner", event.target.value)} /></td>
                <td><input aria-label={`期限：${row.action}`} type="date" value={planValue(row, "due")} min={todayIso()} title={row.due ? `建議：${row.due}` : undefined} onChange={(event) => editPlan(row, "due", event.target.value)} /></td>
                <td>{row.proof}</td>
                <td><input aria-label={`目標：${row.action}`} value={planValue(row, "target")} placeholder={row.target ? `建議：${row.target}` : "你填"} onChange={(event) => editPlan(row, "target", event.target.value)} /></td></tr>)}
            </React.Fragment> : null; })}
              <tr><td>{phased ? spanLabel(1 + SPAN_MONTHS[span], span) : horizonDays ? `${Math.ceil(horizonDays / 7)} 週` : solutions.horizon ? "到期" : "之後"}</td><td>全部</td><td>用新資料重跑本分析，比較前後（同一個地方）</td><td>你＋系統提醒</td><td>—</td><td>{(solutions.metrics ?? []).length ? `上面${NUMERAL[(solutions.metrics ?? []).length] ?? (solutions.metrics ?? []).length}個指標` : "—"}</td><td>{(solutions.metrics ?? []).length ? "見 C" : "—"}</td></tr></tbody>
          </table></div>
        </>}
        {solutions.signoff && <p className="sub mt6 mb0">需要誰點頭：{solutions.signoff}</p>}
        {(solutions.metrics ?? []).length > 0 && <>
          <h3 className="mt14 mb8">C. 追蹤驗證：{NUMERAL[(solutions.metrics ?? []).length] ?? (solutions.metrics ?? []).length}個指標{solutions.horizon ? `，${solutions.horizon}後重跑並比較` : ""}</h3>
          <div className="kpis">{(solutions.metrics ?? []).map((metric, index) => <div className="kpi" key={index}><b>{metric.name}</b><span className="now">現在 {kpiNow(metric.now)}{metric.now_citation ? <> {cites([metric.now_citation])}</> : null}</span><span className="goal">目標 {kpiTarget(metric.target)}（待你確認）</span><span className="when">{metric.when}</span></div>)}</div>
        </>}
        {removedNote("solutions", "指標或對應")}
        <div className="btns mt10">
          {project && savedTaskCount > 0 ? (
            <Link className="btn" href={projectHref(project.id)}>已存成 {savedTaskCount} 個任務，到{holderWord(project.isCase)}頁看</Link>
          ) : (
            <button type="button" className="btn primary" title={!project ? "先把分析存起來" : !planRows.length ? "這次沒有行動計畫" : undefined} onClick={saveTasks} disabled={!project || !tasksReady}>把行動計畫存成任務，設提醒</button>
          )}
          {openRerun ? (
            <span className="btn" aria-disabled="true">已排在 {openRerun.due} 重跑</span>
          ) : (
            <button type="button" className="btn" onClick={() => { setPlanNote(""); setPlanError(""); setRerunDue(horizonDays ? plusDays(horizonDays) : ""); }}>{rerunLabel}</button>
          )}
          <button type="button" className="btn" onClick={() => setPlanNote(CASE_NOT_BUILT(rerunLabel))}>改善了就記進案例庫；沒改善回到 A 重選</button>
        </div>
        {project && !savedTaskCount && planRows.length > 0 && !tasksReady && <p className="sub mb0">每一列都要有負責人、期限、目標才能存成任務；按「填入建議」先帶入 AI 的建議，再改成你的。</p>}
        {rerunDue !== null && <div className="mt10">
          <label className="sub">到期日 <input aria-label="重跑到期日" type="date" value={rerunDue} min={todayIso()} onChange={(event) => setRerunDue(event.target.value)} /></label>
          <div className="btns mt6"><button type="button" className="btn primary" onClick={scheduleRerun} disabled={!rerunDue}>排提醒</button><button type="button" className="btn ghost" onClick={() => setRerunDue(null)}>取消</button></div>
        </div>}
        {planNote && <p className={planNote.startsWith("案例庫") ? "mocknote" : "finding ok mt10"} role="status">{planNote}{planNote.startsWith("案例庫") && <> <a className="btn ghost" href="#solution">回到 A 重選</a></>}</p>}
        {!project && <p className="sub mb0">先把分析存起來，才能把行動計畫存成任務。</p>}
        {project && !(solutions.plan ?? []).length && <p className="sub mb0">這次沒有行動計畫，暫時沒有可存成任務的內容。</p>}
        {planError && <p className="error" role="alert">沒有成功：{planError}</p>}
        <p className="sub mt8 mb0">工具負責想清楚、排出來、盯著看；動手做事的是人。到期時系統提醒你用新資料重跑這一頁、把前後放在一起比較；目標數字由你定，AI 不替你定。</p>
      </> : <p className="sub mb0">{missing("solutions", "方案比較與行動計畫")}</p>}
    </Card>

    <Card id="8" title="⑧ 下一步：你在這條路的哪裡、接著做什麼" read="旅程列是你在哪；每張卡寫做了會得到什麼、要你再填什麼。" act="選一張，或都不選。">
      <div className="journey"><span className="done">✓ {name}{position ? `：${position}` : result.headline ? `：${result.headline}` : result.summary ? `：${result.summary}` : ""}</span>{pathSteps.map((step, index) => <React.Fragment key={index}><i>→</i><span className={index === 0 ? "mcard" : undefined}>{index === 0 ? "下一步：" : "之後："}{toolLabel(names, step.method_id!)}{step.short ? `（${step.short}）` : step.answers && !steps.some((other) => other.short) ? `（${step.answers}）` : ""}</span></React.Fragment>)}{solutions && <><i>→</i><span>最後：⑦ 解決方案定案與追蹤</span></>}</div>
      {steps.length > 0 && <p className="lead mt6 mb0">{position ? `你已經知道${position}。` : result.summary ? `你已經知道${result.summary}${/[。！？.!?]\s*$/.test(result.summary) ? "" : "。"}` : ""}<b>最值得的下一步是「{toolLabel(names, pathSteps[0].method_id!)}」{pathSteps[0].why ? `，因為${pathSteps[0].why.replace(/[。.]$/, "")}` : ""}</b>{pathSteps[0].deepens ? `：${pathSteps[0].deepens}` : ""}。<b>不做下一步也可以</b>：{solutions ? "⑦ 的方案已經能用。" : "① 的建議已經能用。"}</p>}
      <div className="mcards next-steps">{steps.map((step, index) => {
        const targetKeys = stepFieldKeys(step.method_id!);   // the target's real fields, once known (N-13); unknown = trust the model
        const prefillEntries = Object.entries(step.prefill ?? {}).filter(([key]) => !targetKeys || targetKeys.has(key));
        const values = Object.fromEntries(prefillEntries.map(([key, id]) => [key, recordValue(record, id) ?? manifestById.get(id)?.value ?? ""]));
        const carried = prefillEntries.map(([, id]) => id);
        const needs = (step.needs_input ?? []).filter((need) => !targetKeys || targetKeys.has(need));
        const estimate = estimates[step.method_id!];
        const lessonHref = lessons[step.method_id!];
        // N-20/N-21/N-45: the run page coerces `values` to each target field's kind and marks `needs` red until filled;
        // `from` says which analysis this came from and whether it was approved (核准 可被下一步引用)
        // a new page (operator 2026-09-29) has its own sessionStorage: the carry-over goes through localStorage, and the run
        // page moves it into its own session at once (RunPage: stale after 10 minutes)
        const carryPrefill = () => { try { localStorage.setItem(`cos:prefill:${step.method_id}`, JSON.stringify({ values, needs, from: { name, approved: approval?.decision === "approve" }, at: Date.now() })); } catch { /* private mode: the tool opens empty */ } };
        const doneBefore = projectAnalyses.find((item) => item.method_id === step.method_id && item.status === "DONE" && item.interpretation_id !== result.interpretation_id);
        return <div className={`mcard next-step${index === 0 ? " now" : ""}`} key={index}>
          <div><b><Link href={toolHref(step.method_id!)}>{toolLabel(names, step.method_id!)}</Link></b>{index === 0 && <span className="tag">本工具建議的下一步</span>}</div>
          {step.answers && <div><span className="k">回答什麼：</span>{step.answers}</div>}
          <div><span className="k">帶入什麼：</span>{carried.length ? <>你填的{[...new Set(carried.map(inputName))].join("、")} {cites(carried)} → 自動填 {carried.length} 個欄位；</> : "沒有能帶入的欄位；"}<span className="need">還要你填 {needs.length} 個</span>{needs.length ? `：${needs.map((need) => stepFieldLabel(step.method_id!, need)).join("、")}` : ""}。</div>
          {step.yields && <div><span className="k">會得到：</span>{step.yields}</div>}
          <div className="k">{estimate ? `${runMinutes(estimate)}・${costLine(estimate.tokens, estimate.twd).replace(/^約 \S+ tokens・?/, "") || `約 ${Math.round(estimate.tokens / 1000)}k tokens`}` : step.est_cost ? `預估成本：${COST[step.est_cost] ?? step.est_cost}` : ""}</div>
          {doneBefore && project && <div className="k">{thisHolder(project.isCase)}已經做過：<a href={analysisHref(project.id, doneBefore.interpretation_id)} target="_blank" rel="noopener">看那次結果 ↗</a></div>}
          <div className="btns"><a className={index === 0 ? "btn primary" : "btn"} href={runHref(step.method_id!, project?.id)} target="_blank" rel="noopener" onClick={carryPrefill}>用這次的資料開始 ↗</a>{lessonHref ? <a className="btn" href={lessonHref} target="_blank" rel="noopener">第一次用？先看 5 分鐘的課 ↗</a> : <a className="btn" href={toolHref(step.method_id!, project?.id)} target="_blank" rel="noopener" onClick={carryPrefill}>第一次用？先看它做什麼 ↗</a>}</div>
        </div>; })}</div>
      {!steps.length && <p className="mb0">這次沒有建議下一步；不繼續也可以。</p>}
      <div className="btns mt12">
        {steps.length > 0 && <button type="button" className="btn" onClick={() => setNote(WORKFLOW_NOT_BUILT)}>看{NUMERAL[steps.length] ?? steps.length}步的建議順序，自己一步步做<small>串成一次跑完的工作流還在做（計畫 P3）</small></button>}
        <a className="btn" href={project ? `/analyze?project=${encodeURIComponent(project.id)}#ask` : "/analyze#ask"}>不確定選哪個？描述你想知道什麼<small>系統幫你挑，最多三個建議</small></a>
        {solutions && <a className="btn" href="#solution">分析已經夠了，直接去 ⑦ 解決方案</a>}
        <a className="btn ghost" href="#approve">都不做，先核准存檔（⑨ 下方）</a>
      </div>
      {note && <p className="mocknote" role="status">{note}</p>}
      <p className="sub mt8 mb0">每一張都列出會帶入什麼、還要你填什麼；按下去在新分頁開預填好的表單，你確認才執行、才花錢。③ 已經畫出的圖（迴路、趨勢{ownCharts.map((chart) => `、${chart.short}`).join("")}）和{project ? thisHolder(project.isCase) : "這裡"}做過的工具不再推薦。</p>
    </Card>

    <Card id="9" title="⑨ 引註（每個 [n] 都指向一段可查的來源）" read="[n] 是那句話的來源。" act="引錯了，按下方「退回並說原因」。">
      <ol className="src">{citationIds.map((id) => { const source = sourceCitation(id); return <li key={id} id={`citation-${citationNumber.get(id)}`} data-source={id}>{id.startsWith("r/") ? <>你的輸入・{inputName(id)}：「{resolved(id)}」</> : source ? <>外部來源・{source}</> : <>外部來源・{id}：「{resolved(id)}」</>}</li>; })}</ol>
      {sources === 0 && <div className="finding warn"><b>本次沒有外部來源</b>結論全部建立在你填的{layers.length ? `${NUMERAL[layers.length] ?? layers.length}段話` : "內容"}上，所以信心最高只到「中」。要提高：{project ? <Link href={`${projectHref(project.id)}#sources`}>補上真實數字或外部資料</Link> : "補上真實數字或外部資料"}{dataStep ? `，或先在 ⑧ 用「${toolLabel(names, dataStep.method_id!)}」往下挖` : ""}。</div>}
    </Card>

    <div className="card" id="approve" data-section="approve">
      <div className="meta-bar">
        <span>這一頁是 <b>{approvalText}</b></span>
        <span>模型 <b>{result.model}</b></span>
        <span>費用 <b>{costLine(tokens, costTwd)}</b></span>
        <span>檢查 {checks.length ? checks.map((check) => <b key={check.label} className={check.ok ? "ok" : "warn"} title={check.tip}>{check.label} {check.ok ? "✓" : "✗"} </b>) : <b>未提供</b>}{lostCount > 0 && <b className="warn" title="沒有出處或對不上你填的內容，已拿掉；各卡有說明">已拿掉 {lostCount} 項 </b>}</span>
        <span>你的判斷 <b>{judgment ? STANCE[judgment as Stance] : "尚未填"}</b>（① 下方）</span>
      </div>
      <div className="sub mt8"><b>核准</b> = 這頁成為正式紀錄，可匯出、可被下一步引用；<b>退回</b> = 寫原因後重做，這一版保留；<b>刪除{holderWord(project?.isCase)}</b> = 來源與所有產出一起刪掉，留一筆「已抹除」。這頁只有你的租戶看得到。</div>
      <div className="btns mt12">
        <button type="button" className="btn primary" onClick={() => decide("approve")} disabled={approval?.decision === "approve"}>{approval?.decision === "approve" ? "已核准，存進紀錄" : "核准，存進紀錄"}</button>
        <button type="button" className="btn" onClick={() => { setReturning(true); setReturnReason(approval?.decision === "return" ? approval.reason ?? "" : ""); }}>退回並說原因</button>
        <button type="button" className="btn" data-demo-ok onClick={() => { const was = document.title; document.title = `${name}分析${result.headline ? `：${result.headline}` : ""}`; window.addEventListener("afterprint", () => { document.title = was; }, { once: true }); window.print(); }}>匯出 PDF</button>
        {project && <button type="button" className="btn ghost" onClick={() => erase(false)}>刪除{holderWord(project.isCase)}</button>}
        <a className="btn ghost" href="#expert" onClick={() => { const fold = document.getElementById("expert") as HTMLDetailsElement | null; if (fold) fold.open = true; }}>專家模式：閘門表與 JSON</a>
        {compareWith && project && <Link className="btn" href={compareHref(project.id, compareWith, result.interpretation_id)}>和上一版並排比較 →</Link>}
      </div>
      {returning && <div className="mt10">
        <textarea aria-label="退回的原因" placeholder="哪裡不對？AI 會依你寫的原因重做，這一版保留。" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} />
        <div className="btns mt6"><button type="button" className="btn primary" onClick={() => decide("return", returnReason)} disabled={!returnReason.trim()}>送出退回</button><button type="button" className="btn ghost" onClick={() => setReturning(false)}>取消</button></div>
      </div>}
      {approval?.decision === "return" && onRedo && <p className="mocknote" role="status">已退回：{approval.reason}　<button type="button" className="btn primary" onClick={() => onRedo(approval.reason ?? "")}>依原因重做</button></p>}
      {actionError && <p className="error" role="alert">沒有成功：{actionError}</p>}
      <details className="mt10" id="expert"><summary>專家模式（今天你看到的那一層，收起來但還在）</summary>
        <table><thead><tr><th>閘門</th><th>狀態</th><th>證據</th></tr></thead><tbody>{gateResults.map((gate) => <tr key={gate.gate_id}><td>{GATE_LABEL[gate.gate_id] ?? gate.gate_id}</td><td className={gate.status === "PASS" ? "ok" : "warn"}>{gate.status}</td><td><code>{JSON.stringify(gate.evidence ?? {})}</code></td></tr>)}</tbody></table>
        <pre>{JSON.stringify(expertSummary, null, 2)}</pre>
        <details><summary>完整 JSON</summary><pre>{JSON.stringify({ result, gateResults, manifest }, null, 2)}</pre></details>
      </details>
    </div>
    {project && !demo && <ResultChoices projectId={project.id} onErase={() => erase(true)} />}
    {project && <p className="sub mt8"><Link href={projectHref(project.id)}>← 回{holderWord(project.isCase)}「{project.name}」</Link></p>}
  </div>;
}
