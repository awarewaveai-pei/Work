"use client";

import React, { useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "../../lib/api";
import { HowTo } from "./HowTo";
import { MethodVisual } from "./MethodVisual";

type Finding = { id: string; title: string; text: string; citations: string[]; confidence: { level: string; reason: string }; revision_conditions?: Array<{ text: string; would_change: string }> };
type Step = { method_id?: string; answers?: string; deepens?: string; prefill?: Record<string, string>; needs_input?: string[]; yields?: string; est_cost?: string };
type Interpretation = { interpretation_id: string; method_id: string; findings: Finding[]; summary?: string; visual: { kind: string; bindings: Record<string, unknown> }; next_methods?: string[]; next_steps?: Step[]; recommendations?: Array<{ action?: string; citations?: string[] }>; gaps?: Array<{ text?: string; needed_evidence?: string }>; data_thickness?: Record<string, { own_statements?: number; external_sources?: number }>; provenance: Record<string, unknown>; model: string; usage: Record<string, number> };
type ManifestItem = { id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string };
type Gate = { gate_id: string; status: string; evidence?: unknown };
type Props = { result: Interpretation; record?: Record<string, unknown>; manifest?: ManifestItem[]; gateResults?: Gate[]; display?: { name_zh?: string; blurb_zh?: string }; children?: ReactNode };   // children: the run form, shown under the header (plan U14)

const SKELETON: Record<string, [string, string]> = {
  "0": ["先看狀態、能回答與不能回答的範圍。", "先確認本次解讀的工具與資料範圍。"],
  "1": ["先讀一句結論，再逐句核對發現的信心與引註。", "若結論和你的經驗不同，留在下方人工判斷。"],
  "2": ["圖形每個單位對應一個可查的輸入路徑。", "確認每個單位放在對的位置。"],
  "3": ["圖表只呈現本次 record 支持的結構。", "不要把圖形當成自動決策。"],
  "4": ["逐單位看問題、原文、發現與資料厚度。", "找出最薄的單位，補上缺的資料。"],
  "5": ["把共同方向與證據缺口放在一起看。", "標出需要改判的條件。"],
  "5b": ["解決方案在後續階段才正式比較。", "先保留你自己的判斷。"],
  "6": ["下一步是候選路線，預填只來自已知資料。", "核對預填欄，紅色的欄位要你自己填。"],
  "7": ["每個 [n] 都指向一筆 manifest 路徑或來源。", "點回原文核對，不要只看 AI 摘要。"],
  "8": ["來源與閘門結果保留在這裡，專家 JSON 可展開。", "用你的話選同意、部分同意或不同意。"],
};
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) { const [read, act] = SKELETON[id]; return <section className="card section" data-section={id}><h2>{title}</h2><HowTo read={read} act={act} />{children}</section>; }
function recordValue(record: Record<string, unknown>, id: string): unknown {
  if (!id.startsWith("r/")) return undefined;
  let value: unknown = record;
  for (const part of id.slice(2).split("/")) value = Array.isArray(value) ? value[Number(part)] : value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  return value;
}
function printable(value: unknown): string { return typeof value === "string" ? value : value === undefined ? "未提供" : JSON.stringify(value); }

export function ResultPage({ result, record = {}, manifest = [], gateResults = [], display, children }: Props) {
  const [judgment, setJudgment] = useState("");
  const [judgmentText, setJudgmentText] = useState("");
  const [judgmentError, setJudgmentError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const findings = result.findings ?? [];
  const citationIds = [...new Set([...findings.flatMap((item) => item.citations), ...(result.recommendations ?? []).flatMap((item) => item.citations ?? [])])];
  const citationNumber = new Map(citationIds.map((id, index) => [id, index + 1]));
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const resolved = (id: string) => { const fromRecord = recordValue(record, id); const item = manifestById.get(id); return fromRecord === undefined ? item?.value ?? item?.sha256 ?? "來源尚未載入" : printable(fromRecord); };
  const levels = Array.isArray(result.visual?.bindings?.levels) ? result.visual.bindings.levels as Array<{ path?: string }> : [];
  const thickness = Object.entries(result.data_thickness ?? {});
  const title = display?.name_zh ?? result.method_id;
  return <div className="result-page">
    <div className="card section" data-section="0"><div className="top"><h1>{title}分析</h1><button type="button" className="howto secondary" onClick={() => setGuideOpen(!guideOpen)}>怎麼用？先看讀圖說明</button></div><div className="status"><span>AI 草稿・尚未核准</span><span>資料 {Object.keys(record).length} 欄</span><span>約 {result.usage?.input_tokens ?? 0} input tokens</span></div><HowTo read={SKELETON["0"][0]} act={SKELETON["0"][1]} />{guideOpen && <p role="note">依序讀結論、結構圖、逐單位解讀、下一步與引註；最後由你判斷。</p>}<p className="lead">{display?.blurb_zh ?? result.summary ?? findings[0]?.text ?? "這是一份待人工核對的分析草稿。"}</p><p className="can"><strong>能回答：</strong>這筆方法紀錄支持哪些發現。</p><p className="cant"><strong>不能回答：</strong>紀錄之外的事實、未驗證的數字或自動核准。</p><div className="todos"><p className="todo">① 讀一句結論與引註</p><p className="todo">② 對照圖形和原始輸入</p><p className="todo">③ 看總結、下一步與人工判斷</p></div><p>只有 30 秒？先讀 ① 的結論，再看引註。</p><p className="terms">四個詞：發現・引註・資料厚度・人工判斷</p></div>
    {children}
    <Section id="1" title="① 一句結論與發現"><p className="lead">{result.summary ?? findings.map((item) => item.text).join(" ")}</p><div className="grid">{findings.map((finding) => <article className="card" key={finding.id}><h3>{finding.title}</h3><p>{finding.text}</p><p>信心：{finding.confidence.level} — {finding.confidence.reason}</p><p>{finding.citations.map((id) => <a href={`#citation-${citationNumber.get(id)}`} key={id}>[{citationNumber.get(id)}] </a>)}</p>{(finding.revision_conditions ?? []).map((condition, index) => <p key={index}>改判條件：{condition.text}；{condition.would_change}</p>)}</article>)}</div></Section>
    <Section id="2" title="② 結構圖"><MethodVisual kind={result.visual.kind} bindings={result.visual.bindings} /></Section>
    <Section id="3" title="③ 圖表分析"><p>原生圖形：{result.visual.kind}。每一個綁定只指向本次 manifest，不表示額外推測。</p></Section>
    <Section id="4" title="④ 逐單位解讀"><div className="grid">{levels.length ? levels.map((level, index) => <article className="card layer" key={index}><h3>第 {index + 1} 層</h3><p>這層問什麼：{["發生了什麼？", "有什麼重複模式？", "什麼結構製造模式？", "什麼信念維持結構？"][index] ?? "這個單位說明什麼？"}</p><p>你填的：{resolved(String(level.path ?? ""))}</p><p>引註路徑：<code>{level.path}</code></p></article>) : <p>本方法以 {result.visual.kind} 原生圖形呈現；請對照上圖的每個單位。</p>}</div></Section>
    <Section id="5" title="⑤ 總結與資料缺口"><p>{result.summary ?? findings.map((item) => item.text).join(" ")}</p>{(result.gaps ?? []).map((gap, index) => <p key={index}>缺口：{gap.text}；需要：{gap.needed_evidence}</p>)}<h3>⑥ 理解層次對照表</h3><table><thead><tr><th>單位</th><th>你填的句數</th><th>外部來源</th></tr></thead><tbody>{thickness.map(([unit, value]) => <tr key={unit}><th>{unit}</th><td>{value.own_statements ?? 0}</td><td>{value.external_sources ?? 0}</td></tr>)}</tbody></table></Section>
    <Section id="5b" title="⑦ 解決方案"><p>解決方案比較將在 P4 提供；本次只列分析與下一步候選，不替你做決策。</p></Section>
    <Section id="6" title="⑧ 下一步"><div className="grid next-steps">{(result.next_steps ?? []).map((step, index) => { const prefill = Object.fromEntries(Object.entries(step.prefill ?? {}).map(([key, id]) => [key, recordValue(record, id) ?? manifestById.get(id)?.value ?? ""])); return <article className="card next-step" key={index}><h3>{step.method_id ?? "下一步"}</h3><p>{step.yields}</p><p>已帶入 {Object.keys(prefill).length} 欄</p>{Object.entries(prefill).map(([key, value]) => <p key={key}>{key}：{printable(value)}</p>)}{(step.needs_input ?? []).map((key) => <p className="error" key={key}>還要你填：{key}</p>)}{step.method_id && <button type="button" onClick={() => { sessionStorage.setItem(`cos:prefill:${step.method_id}`, JSON.stringify(prefill)); window.location.href = `/methods/${encodeURIComponent(step.method_id!)}`; }}>開啟預填表單</button>}</article>; })}</div>{!(result.next_steps ?? []).length && <p>這次沒有建議下一步；不繼續也可以。</p>}</Section>
    <Section id="7" title="⑨ 引註與來源"><ol>{citationIds.map((id) => <li key={id} id={`citation-${citationNumber.get(id)}`} data-source={id}><strong>[{citationNumber.get(id)}]</strong> <code>{id}</code> — {resolved(id)}</li>)}</ol></Section>
    <section className="card section" data-section="8"><h2>來源標記與人工判斷</h2><HowTo read={SKELETON["8"][0]} act={SKELETON["8"][1]} /><div className="meta-bar"><span>Provenance：{String(result.provenance?.authorship_state ?? "AI_GENERATED")}</span><span>模型：{result.model}</span><span>閘門：{gateResults.map((gate) => `${gate.gate_id} ${gate.status}`).join("、") || "未提供"}</span></div><label htmlFor="judgment-text">你的判斷</label><textarea id="judgment-text" value={judgmentText} onChange={(event) => setJudgmentText(event.target.value)} /><div className="grid btns">{([ ["agree", "同意"], ["partial", "部分同意"], ["disagree", "不同意"] ] as const).map(([stance, label]) => <button type="button" className={`judgment-button ${judgment === stance ? "" : "secondary"}`} key={stance} onClick={async () => { setJudgmentError(""); try { await apiFetch(`/interpretations/${result.interpretation_id}/judgment`, { method: "POST", body: JSON.stringify({ stance, text: judgmentText }) }); setJudgment(stance); } catch (failure) { setJudgmentError(failure instanceof Error ? failure.message : "送出失敗"); } }}>{label}</button>)}</div>{judgmentError && <p role="alert">判斷送出失敗：{judgmentError}</p>}<details><summary>專家模式：完整 JSON 與閘門結果</summary><pre>{JSON.stringify({ result, gateResults, manifest }, null, 2)}</pre></details></section>
  </div>;
}
