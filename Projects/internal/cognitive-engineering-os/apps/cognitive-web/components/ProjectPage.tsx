"use client";

// One project (我的專案 › name): what it is, every analysis in it newest first -- each opens its own result page -- and
// how many sources it holds. While an analysis runs, the list refreshes itself.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { analysisHref, runHref, toolHref } from "../lib/catalog";
import { STANCE, STATUS, type Analysis, type Project } from "../lib/projects";
import { formatTime } from "../lib/time";

const OPEN: Record<Analysis["status"], string> = { DONE: "看結果 →", PENDING: "看進度 →", FAILED: "看原因 →" };

export function ProjectPage({ projectId, names = {} }: { projectId: string; names?: Record<string, string> }) {
  const [project, setProject] = useState<Project | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [sources, setSources] = useState<number | null>(null);
  const [error, setError] = useState("");
  const base = `/projects/${encodeURIComponent(projectId)}`;

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<Project>(base), apiFetch<Analysis[]>(`${base}/analyses`), apiFetch<unknown[]>(`${base}/sources`)])
      .then(([found, list, held]) => { if (active) { setProject(found); setAnalyses(list); setSources(held.length); } })
      .catch((reason) => { if (active) setError(reason instanceof ApiError && reason.status === 404 ? "找不到這個專案：可能已經刪除，或不在你的帳號裡。" : String(reason)); });
    return () => { active = false; };
  }, [base]);

  const running = Boolean(analyses?.some((item) => item.status === "PENDING"));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      Promise.all([apiFetch<Project>(base), apiFetch<Analysis[]>(`${base}/analyses`)]).then(([found, list]) => { setProject(found); setAnalyses(list); }).catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [base, running]);

  if (error) return <><div className="crumbs"><Link href="/projects">我的專案</Link></div><div className="card"><p className="error">{error}</p></div></>;
  if (!project || !analyses) return <div className="card"><p>載入中…</p></div>;
  const latest = analyses[0];
  const methods = project.methods ?? [];
  return <>
    <div className="crumbs"><Link href="/projects">我的專案</Link> › {project.name}</div>
    <div className="card">
      <div className="top"><h1>{project.name}</h1></div>
      {project.purpose && <div className="sub">{project.purpose}</div>}
      <div className="status">
        <span className="pill">{latest ? STATUS[latest.status] : "還沒分析"}</span>
        <span>建立 {formatTime(project.created_at)}</span>
        <span>最後更新 {formatTime(project.updated_at ?? project.created_at)}</span>
        <span>分析 {analyses.length} 次</span>
        <span>來源 {sources ?? 0} 筆</span>
      </div>
      <div className="how"><b>怎麼讀</b>這個專案做過的每一次分析，新的在上面；時間是你這裡的時間，到分鐘。<b>你要做的</b>按「看結果」打開那一次的完整結果；要改內容再分析，按下面的按鈕，新的一次也存在這個專案。</div>
    </div>
    <div className="card">
      <h2>這個專案的分析<small>{analyses.length ? `${analyses.length} 次，新的在上面` : "還沒有"}</small></h2>
      {analyses.length ? <div className="scroll-x">
        <table>
          <thead><tr><th>開始</th><th>工具</th><th>狀態</th><th>你的判斷</th><th></th></tr></thead>
          <tbody>{analyses.map((item) => <tr key={item.interpretation_id}>
            <td>{formatTime(item.requested_at)}</td>
            <td>{item.method_id ? <Link href={toolHref(item.method_id)}>{names[item.method_id] ?? item.method_id}</Link> : "—"}</td>
            <td>{STATUS[item.status]}{item.status === "DONE" && item.finished_at ? `（${formatTime(item.finished_at).slice(11)} 完成）` : ""}{item.status === "FAILED" && item.error ? <details><summary>原因</summary>{item.error}</details> : null}</td>
            <td>{item.judgment ? STANCE[item.judgment] : "尚未填"}</td>
            <td><Link className={`btn${item === latest && item.status === "DONE" ? " primary" : ""}`} href={analysisHref(project.project_id, item.interpretation_id)}>{OPEN[item.status]}</Link></td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="sub">這個專案還沒有分析。</p>}
      <div className="btns mt10">
        {methods.map((id) => <Link key={id} className="btn" href={runHref(id, project.project_id)}>在這個專案再用「{names[id] ?? id}」分析一次</Link>)}
        {!methods.length && <Link className="btn" href="/methods">到「工具」挑一個開始（會開一個新專案）</Link>}
      </div>
    </div>
  </>;
}
