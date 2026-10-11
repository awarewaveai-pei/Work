"use client";

// Two analyses of one project side by side (到期重跑並比較, 依原因重做): headline and one-liner, findings, where to act
// first, the metrics' now and target, the judgment and the approval of each. Both come from GET /interpretations/{id}.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { analysisHref, projectHref } from "../lib/catalog";
import { humanError } from "../lib/errors";
import { STANCE, type Approval } from "../lib/projects";
import { formatTime } from "../lib/time";
import type { InterpretationStatus } from "./RunPage";

type Row = { label: string; cell: (item: InterpretationStatus) => React.ReactNode };
type Metric = { name: string; now: string; target: string };

export function ComparePage({ projectId, a, b, names = {} }: { projectId: string; a: string; b: string; names?: Record<string, string> }) {
  const [pair, setPair] = useState<[InterpretationStatus, InterpretationStatus] | null>(null);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<InterpretationStatus>(`/interpretations/${encodeURIComponent(a)}`), apiFetch<InterpretationStatus>(`/interpretations/${encodeURIComponent(b)}`)])
      .then(([first, second]) => { if (!active) return; if (first.project_id !== projectId || second.project_id !== projectId) setError("這兩次分析不都在這個專案裡。"); else if (first.status !== "DONE" || second.status !== "DONE") setError("兩次都要分析完成才能比較。"); else setPair([first, second]); })
      .catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [projectId, a, b]);
  if (error) return <><div className="crumbs"><Link href="/projects">我的案子</Link> › <Link href={projectHref(projectId)}>這個專案</Link> › 比較</div><div className="card"><p className="error">{error}</p></div></>;
  if (!pair) return <div className="card"><p>載入中…</p></div>;
  // N-67: two independent metric lists read as two different tools' outputs; one row per metric NAME, present on
  // either side, keeps 現在/目標 for the same thing on the same row so "有沒有往目標走" is a left-to-right read.
  const metricsOf = (item: InterpretationStatus): Metric[] => item.result.solutions?.metrics ?? [];
  const metricNames = [...new Set([...metricsOf(pair[0]), ...metricsOf(pair[1])].map((metric) => metric.name))];
  const metricCell = (item: InterpretationStatus, name: string) => { const metric = metricsOf(item).find((entry) => entry.name === name); return metric ? `${metric.now} → ${metric.target}` : "—"; };
  const rows: Row[] = [
    { label: "分析時間", cell: (item) => formatTime(item.created_at) },
    { label: "標題句", cell: (item) => item.result.headline ?? "—" },
    { label: "一句話", cell: (item) => item.result.summary ?? "—" },
    { label: "發現", cell: (item) => <ol>{(item.result.findings ?? []).map((finding: { id: string; title: string; confidence?: { level: string } }) => <li key={finding.id}>{finding.title}{finding.confidence ? `（信心：${{ high: "高", mid: "中", low: "低" }[finding.confidence.level] ?? finding.confidence.level}）` : ""}</li>)}</ol> },
    { label: "建議先出手", cell: (item) => item.result.focus?.why ?? "—" },
    ...metricNames.map((name): Row => ({ label: `指標：${name}`, cell: (item) => metricCell(item, name) })),
    { label: "明天就做", cell: (item) => item.result.solutions?.first_step ?? "—" },
    { label: "你的判斷", cell: (item) => (item.judgment ? `${STANCE[item.judgment.stance]}${item.judgment.text ? `：${item.judgment.text}` : ""}` : "尚未填") },
    { label: "核准", cell: (item) => (item.approval?.decision === "approve" ? `已核准（${item.approval.by_name ?? ""}）` : item.approval?.decision === "return" ? `已退回：${item.approval.reason ?? ""}` : "尚未核准") },
  ];
  // N-67: the how-to line already told the user what to do next (核准新的一次／回到 ⑦ 重選方案) but had no buttons for either.
  const approve = async () => {
    setApproving(true); setApproveError("");
    try {
      const saved = await apiFetch<Approval>(`/interpretations/${encodeURIComponent(b)}/approval`, { method: "POST", body: JSON.stringify({ decision: "approve", reason: "" }) });
      setPair([pair[0], { ...pair[1], approval: saved }]);
    } catch (reason) { setApproveError(humanError(reason)); }
    finally { setApproving(false); }
  };
  return <>
    <div className="crumbs"><Link href="/projects">我的案子</Link> › <Link href={projectHref(projectId)}>這個專案</Link> › 比較</div>
    <div className="card">
      <div className="top"><h1>兩次分析並排比較</h1></div>
      <div className="sub">工具：{names[pair[0].method_id ?? ""] ?? pair[0].method_id}</div>
      <div className="how"><b>怎麼讀</b>左邊是前一次，右邊是新的一次；一列一個項目。<b>你要做的</b>看指標有沒有往目標走；改善了就核准新的一次，沒改善回到 ⑦ 重選方案。</div>
      <div className="scroll-x"><table>
        <thead><tr><th></th><th><Link href={analysisHref(projectId, a)}>前一次 →</Link></th><th><Link href={analysisHref(projectId, b)}>新的一次 →</Link></th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th>{row.label}</th><td>{row.cell(pair[0])}</td><td>{row.cell(pair[1])}</td></tr>)}</tbody>
      </table></div>
      <div className="btns mt10">
        <button type="button" className="btn primary" disabled={approving || pair[1].approval?.decision === "approve"} onClick={approve}>核准新的一次</button>
        <Link className="btn ghost" href={`${analysisHref(projectId, b)}#solution`}>回到 ⑦ 重選方案 →</Link>
      </div>
      {approveError && <p className="error" role="alert">{approveError}</p>}
    </div>
  </>;
}
