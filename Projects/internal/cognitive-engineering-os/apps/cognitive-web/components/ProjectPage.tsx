"use client";

// One project (我的專案 › name): what it is, every analysis in it newest first -- each opens its own result page -- its
// tasks (⑦ 存成任務) with their due dates, its rerun reminders (到期重跑並比較), and how many sources it holds. While an
// analysis runs, the list refreshes itself.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { analysisHref, compareHref, runHref, toolHref } from "../lib/catalog";
import { STANCE, STATUS, standing, todayIso, type Analysis, type Project, type Rerun, type Task } from "../lib/projects";
import { formatTime } from "../lib/time";

const OPEN: Record<Analysis["status"], string> = { DONE: "看結果 →", PENDING: "看進度 →", FAILED: "看原因 →" };

export function ProjectPage({ projectId, names = {} }: { projectId: string; names?: Record<string, string> }) {
  const [project, setProject] = useState<Project | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reruns, setReruns] = useState<Rerun[]>([]);
  const [sources, setSources] = useState<number | null>(null);
  const [error, setError] = useState("");
  const base = `/projects/${encodeURIComponent(projectId)}`;

  const load = () => Promise.all([apiFetch<Project>(base), apiFetch<Analysis[]>(`${base}/analyses`), apiFetch<Task[]>(`${base}/tasks`), apiFetch<Rerun[]>(`${base}/reruns`)])
    .then(([found, list, held, due]) => { setProject(found); setAnalyses(list); setTasks(held); setReruns(due); });
  useEffect(() => {
    let active = true;
    Promise.all([load(), apiFetch<unknown[]>(`${base}/sources`).then((held) => { if (active) setSources(held.length); })])
      .catch((reason) => { if (active) setError(reason instanceof ApiError && reason.status === 404 ? "找不到這個專案：可能已經刪除，或不在你的帳號裡。" : String(reason)); });
    return () => { active = false; };
  }, [base]);   // eslint-disable-line react-hooks/exhaustive-deps

  const running = Boolean(analyses?.some((item) => item.status === "PENDING"));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { load().catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [base, running]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <><div className="crumbs"><Link href="/projects">我的專案</Link></div><div className="card"><p className="error">{error}</p></div></>;
  if (!project || !analyses) return <div className="card"><p>載入中…</p></div>;
  const latest = analyses[0];
  const methods = project.methods ?? [];
  const today = todayIso();
  const openTasks = tasks.filter((task) => !task.done);
  const dueReruns = reruns.filter((item) => !item.fulfilled_by && item.due <= today);
  const mark = async (task: Task, done: boolean) => { try { await apiFetch(`${base}/tasks/${encodeURIComponent(task.task_id)}`, { method: "POST", body: JSON.stringify({ done }) }); await load(); } catch (reason) { setError(String(reason)); } };
  return <>
    <div className="crumbs"><Link href="/projects">我的專案</Link> › {project.name}</div>
    <div className="card">
      <div className="top"><h1>{project.name}</h1></div>
      {project.purpose && <div className="sub">{project.purpose}</div>}
      <div className="status">
        <span className="pill">{standing(latest)}</span>
        <span>建立 {formatTime(project.created_at)}</span>
        <span>最後更新 {formatTime(project.updated_at ?? project.created_at)}</span>
        <span>分析 {analyses.length} 次</span>
        <span>任務 {openTasks.length} 個進行中{openTasks.some((task) => task.due && task.due < today) ? `・${openTasks.filter((task) => task.due && task.due < today).length} 個逾期` : ""}</span>
        <span>來源 {sources ?? 0} 筆</span>
      </div>
      <div className="how"><b>怎麼讀</b>這個專案走到哪：每一次分析（新的在上面）、存下來的任務、到期要重跑的提醒；時間是你這裡的時間，到分鐘。<b>你要做的</b>按「看結果」打開那一次的完整結果；到期的提醒按「重跑並比較」；做完的任務打勾。</div>
      {dueReruns.map((item) => <div className="finding warn" key={item.rerun_id}><b>到期了（{item.due}）：用新資料重跑並比較</b>打開 {formatTime(item.scheduled_at).slice(0, 10)} 排的那一次分析，更新格子裡的數字，按「執行分析」；跑完兩次會並排比較。<div className="btns mt6"><Link className="btn primary" href={`${analysisHref(project.project_id, item.interpretation_id)}?rerun=${encodeURIComponent(item.rerun_id)}`}>重跑並比較 →</Link></div></div>)}
    </div>
    <div className="card">
      <h2>這個專案的分析<small>{analyses.length ? `${analyses.length} 次，新的在上面` : "還沒有"}</small></h2>
      {analyses.length ? <div className="scroll-x">
        <table>
          <thead><tr><th>開始</th><th>工具</th><th>狀態</th><th>你的判斷</th><th>核准</th><th></th></tr></thead>
          <tbody>{analyses.map((item) => { const redoes = item.revision_of ?? reruns.find((rerun) => rerun.fulfilled_by === item.interpretation_id)?.interpretation_id;
            return <tr key={item.interpretation_id}>
              <td>{formatTime(item.requested_at)}</td>
              <td>{item.method_id ? <Link href={toolHref(item.method_id)}>{names[item.method_id] ?? item.method_id}</Link> : "—"}{redoes ? <><br /><span className="sub">{item.revision_of ? "依退回原因重做" : "到期重跑"}</span></> : null}</td>
              <td>{STATUS[item.status]}{item.status === "DONE" && item.finished_at ? `（${formatTime(item.finished_at).slice(11)} 完成）` : ""}{item.status === "FAILED" && item.error ? <details><summary>原因</summary>{item.error}</details> : null}</td>
              <td>{item.judgment ? STANCE[item.judgment] : "尚未填"}</td>
              <td>{item.approval?.decision === "approve" ? `已核准（${item.approval.by_name ?? ""}）` : item.approval?.decision === "return" ? "已退回" : item.status === "DONE" ? "尚未核准" : "—"}</td>
              <td><Link className={`btn${item === latest && item.status === "DONE" ? " primary" : ""}`} href={analysisHref(project.project_id, item.interpretation_id)}>{OPEN[item.status]}</Link>{redoes && item.status === "DONE" && <> <Link className="btn ghost" href={compareHref(project.project_id, redoes, item.interpretation_id)}>和上一版比較</Link></>}</td>
            </tr>; })}</tbody>
        </table>
      </div> : <p className="sub">這個專案還沒有分析。</p>}
      <div className="btns mt10">
        {methods.map((id) => <Link key={id} className="btn" href={runHref(id, project.project_id)}>在這個專案再用「{names[id] ?? id}」分析一次</Link>)}
        {!methods.length && <Link className="btn" href="/methods">到「工具」挑一個開始（會開一個新專案）</Link>}
      </div>
    </div>
    <div className="card">
      <h2>任務<small>{tasks.length ? `${openTasks.length} 個進行中・${tasks.length - openTasks.length} 個做完` : "還沒有"}</small></h2>
      <div className="how"><b>怎麼讀</b>⑦ 的行動計畫存下來的任務：負責人、期限；逾期的標紅。<b>你要做的</b>做完的打勾；沒有任務就到分析結果的 ⑦ 按「存成任務」。</div>
      {tasks.length ? <div className="scroll-x"><table>
        <thead><tr><th>做完</th><th>週／時間</th><th>任務</th><th>負責人</th><th>期限</th><th>怎麼證明有效</th><th>目標</th></tr></thead>
        <tbody>{tasks.map((task) => <tr key={task.task_id}>
          <td><input type="checkbox" aria-label={`做完：${task.title}`} checked={task.done} onChange={(event) => mark(task, event.target.checked)} /></td>
          <td>{task.when}</td><td>{task.title}</td><td>{task.owner || "（待填）"}</td>
          <td className={!task.done && task.due && task.due < today ? "warn" : undefined}>{task.due || "（待填）"}{!task.done && task.due && task.due < today ? "（逾期）" : ""}</td>
          <td>{task.proof}</td><td>{task.target}</td>
        </tr>)}</tbody>
      </table></div> : <p className="sub mb0">還沒有任務。</p>}
    </div>
    {reruns.length > 0 && <div className="card">
      <h2>到期重跑<small>{reruns.filter((item) => !item.fulfilled_by).length} 個等著</small></h2>
      <div className="how"><b>怎麼讀</b>⑦ 排的提醒：到期日、答覆它的那一次分析。<b>你要做的</b>到期時按「重跑並比較」。</div>
      <ul>{reruns.map((item) => <li key={item.rerun_id}>{item.due}：{item.fulfilled_by ? <>已重跑，<Link href={compareHref(project.project_id, item.interpretation_id, item.fulfilled_by)}>並排比較 →</Link></> : item.due <= today ? <Link href={`${analysisHref(project.project_id, item.interpretation_id)}?rerun=${encodeURIComponent(item.rerun_id)}`}>到期了，重跑並比較 →</Link> : "還沒到期"}</li>)}</ul>
    </div>}
  </>;
}
