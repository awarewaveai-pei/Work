"use client";

// 我的案子 (ENTRY_SLICE1_CHECKLIST.md items 7-8): two lists. 案子 = projects with 開案資料 (is_case, GET /projects);
// 我的分析 = projects that only hold analyses run from 直接分析 -- every project made before 2026-10-11 lands here, nothing
// moved. One row per project: its name opens it, what it used, how far it got, when it was made and last moved (to the
// minute, your own time zone), the next step. 我的分析 rows can be ticked and erased for good (DELETE /projects/{id},
// the same erasure as a project's own 刪除); the page says what that means before anything is deleted.
import { NotTherapyNotice } from "./blocks/GovernParts";
import { RemindersPanel } from "./blocks/RemindersPanel";
import Link from "next/link";
import { BLOCKS } from "../lib/blocks";
import { Slots } from "./blocks/BlockShell";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { analysisHref, projectHref, toolHref } from "../lib/catalog";
import { humanError } from "../lib/errors";
import { byActivity, standing, type ErasedProject, type Project } from "../lib/projects";
import { formatTime } from "../lib/time";

const HEAD = <thead><tr><th>名稱</th><th>用的</th><th>走到哪</th><th>建立</th><th>最後更新</th><th>下一步</th></tr></thead>;

export function ProjectList({ names = {} }: { names?: Record<string, string> }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [erased, setErased] = useState<ErasedProject[]>([]);
  const [ticked, setTicked] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [cleaning, setCleaning] = useState(0);
  const [reload, setReload] = useState(0);
  useEffect(() => { apiFetch<Project[]>("/projects").then((list) => setProjects([...list].sort(byActivity))).catch((reason) => setError(humanError(reason))); }, [reload]);
  useEffect(() => { apiFetch<ErasedProject[]>("/projects/erased").then(setErased).catch(() => undefined); }, [reload]);
  const cases = (projects ?? []).filter((project) => project.is_case);
  const analyses = (projects ?? []).filter((project) => !project.is_case);
  const chosen = analyses.filter((project) => ticked.includes(project.project_id));
  const tick = (id: string) => setTicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  const eraseChosen = async () => {
    setDeleting(true); setDeleteErrors([]);
    const failed: string[] = [];
    let pending = 0;   // 202: the records are gone, some files are still being removed (the cleanup retries on its own)
    for (const project of chosen) {
      // ?only=analysis: one that became a case since this list loaded (another tab) is refused, never erased (PROJECT_IS_A_CASE)
      try { const done = await apiFetch<{ physical_cleanup?: string }>(`/projects/${encodeURIComponent(project.project_id)}?only=analysis`, { method: "DELETE" }); if (done?.physical_cleanup === "pending") pending += 1; }
      catch (reason) { failed.push(`${project.name}：${humanError(reason)}`); }
    }
    // the count adds up: an earlier batch's cleanup is not over because this one is (Codex review 2026-10-11 F3)
    setDeleteErrors(failed); setCleaning((count) => count + pending); setTicked([]); setAsking(false); setDeleting(false); setReload((count) => count + 1);
  };
  const row = (project: Project, tickable: boolean) => {
    const latest = project.latest_analysis;
    const count = project.analysis_count ?? 0;
    const flags = [project.tasks?.overdue ? `${project.tasks.overdue} 個任務逾期` : project.tasks?.open ? `${project.tasks.open} 個任務進行中` : "", project.tasks?.due_today ? `${project.tasks.due_today} 個任務今天到期` : "", project.reruns_due ? "到期：重跑並比較" : ""].filter(Boolean);
    return <tr key={project.project_id}>
      <td>{tickable && <><input type="checkbox" id={`tick-${project.project_id}`} aria-label={`勾選「${project.name}」`} checked={ticked.includes(project.project_id)} onChange={() => tick(project.project_id)} /> </>}<Link prefetch={false} href={projectHref(project.project_id)}>{project.name}</Link></td>
      <td>{project.methods?.length ? <>工具：{project.methods.map((id, index) => <span key={id}>{index ? "、" : ""}<Link prefetch={false} href={toolHref(id)}>{names[id] ?? id}</Link></span>)}</> : "—"}</td>
      <td>{standing(latest)}{count > 1 ? `（共 ${count} 次分析）` : ""}{flags.length ? <><br /><span className="warn">{flags.join("・")}</span></> : null}</td>
      <td>{formatTime(project.created_at)}</td>
      <td>{formatTime(project.updated_at ?? project.created_at)}</td>
      <td>{project.reruns_due
        ? <Link prefetch={false} className="btn primary" href={projectHref(project.project_id)}>到期了：重跑並比較 →</Link>
        : latest?.status === "DONE"
          ? <Link prefetch={false} className="btn" href={analysisHref(project.project_id, latest.interpretation_id)}>{latest.approval?.decision === "approve" ? "看結果 →" : "看結果、核准 →"}</Link>
          : <Link prefetch={false} className="btn" href={projectHref(project.project_id)}>打開 →</Link>}
        {tickable && <> <Link prefetch={false} className="btn ghost" href={`${projectHref(project.project_id)}/start`}>用這份結果開案 →</Link></>}</td>
    </tr>;
  };
  return (
    <section className="view" id="projects">
      <div className="top"><div><h1>我的案子</h1><div className="sub">上面是你開的案子；下面「我的分析」是直接分析跑過、還沒開案的結果。</div></div><Link className="btn primary" href="/projects/new">開新案子 →</Link></div>
      <NotTherapyNotice />
      <RemindersPanel />
      {error && <div className="card"><p className="error">{error}</p></div>}
      <div className="card" id="cases">
        <h2>案子<small>{projects ? `${cases.length} 個` : "載入中"}</small></h2>
        <div className="how"><b>怎麼讀</b>一列一個案子：用過哪些工具、走到哪、建立和最後更新的時間（到分鐘）、下一步；最近動過的在上面。<b>你要做的</b>按名稱打開案子，接著走下一塊。</div>
        {projects && (cases.length
          ? <div className="scroll-x"><table>{HEAD}<tbody>{cases.map((project) => row(project, false))}</tbody></table></div>
          : <p className="sub mb0">還沒有案子。按「開新案子」或首頁的「陪我思考」開第一個；也可以把下面任何一份分析拿來開案。</p>)}
      </div>
      <div className="card" id="analyses">
        <h2>我的分析<small>{projects ? `${analyses.length} 個你自己的・1 個示範` : "載入中"}</small></h2>
        <div className="how"><b>怎麼讀</b>直接分析每跑一次就留一份在這裡，是 AI 做的，不是你的判斷；2026-10-11 以前的專案也都在這裡。<b>你要做的</b>想把一件事想清楚，按「用這份結果開案」；不要的，勾起來按「永久刪除」。</div>
        {projects && (
          <div className="scroll-x">
            <table>
              {HEAD}
              <tbody>{analyses.map((project) => row(project, true))}
              <tr className="demo">
                <td><Link href="/projects/demo/iceberg">WuSheng 團體反思・第三期（示範）</Link></td>
                <td>工具：<Link href={toolHref("systems.iceberg_model")}>{names["systems.iceberg_model"] ?? "冰山模型"}</Link></td>
                <td>報表（示範，不花錢）</td><td>—</td><td>—</td>
                <td><Link className="btn" href="/projects/demo/iceberg">看示範結果 →</Link></td>
              </tr></tbody>
            </table>
            {!analyses.length && <p className="sub mt8 mb0">還沒有你自己的分析。</p>}
          </div>
        )}
        {analyses.length > 0 && <div className="btns mt8"><button type="button" className="btn" disabled={!chosen.length || deleting} onClick={() => setAsking(true)}>永久刪除勾選的 {chosen.length} 個</button></div>}
        {asking && chosen.length > 0 && <div className="finding warn" role="alertdialog" aria-labelledby="erase-title" id="erase-confirm">
          <b id="erase-title">要永久刪除這 {chosen.length} 個嗎？</b>
          <ul>{chosen.map((project) => <li key={project.project_id}>{project.name}</li>)}</ul>
          <p>刪了就回不來：裡面的來源和所有分析結果一起刪掉，只留一筆「誰在什麼時候刪了幾筆」，不含任何內容。每晚的備份最多再留 7 天，之後也沒有了。</p>
          <div className="btns"><button type="button" className="btn primary" disabled={deleting} onClick={eraseChosen}>{deleting ? "刪除中…" : "確定永久刪除"}</button><button type="button" className="btn" disabled={deleting} onClick={() => setAsking(false)}>取消</button></div>
        </div>}
        {cleaning > 0 && <p className="sub" role="status">有 {cleaning} 個的內容已經刪掉、讀不到了；它們的檔案還在清理，系統會自己清完，清完才會出現在下面的「已抹除」。</p>}
        {deleteErrors.length > 0 && <div className="error" role="alert">有 {deleteErrors.length} 個沒有刪掉：<ul>{deleteErrors.map((line) => <li key={line}>{line}</li>)}</ul></div>}
      </div>
      {/* A case is not one fixed line (藍圖 4; contract card 共用紀錄): the assembler puts blocks together by purpose. */}
      <div className="card">
        <h2>每個案子怎麼走<small>{BLOCKS.length} 塊積木，依目的組起來</small></h2>
        <div className="how"><b>怎麼讀</b>開案時你選目的，系統推薦一組積木和順序；你可以重排、跳過、停止。其他積木在對的時機由各塊提出，你同意才加。個人的案子不用核准收尾。</div>
        <Slots />
      </div>
      {erased.length > 0 && <div className="card" id="erased">
        <h2>已抹除<small>{erased.length} 個</small></h2>
        <div className="how"><b>怎麼讀</b>被刪除的案子和分析留下的紀錄：什麼時候、刪掉了多少來源和分析。<b>你要做的</b>不用做；它們本身已經不在，也回不來。</div>
        <ul>{erased.map((item) => <li key={item.project_id}>{formatTime(item.erased_at)}：{item.project_id}（來源 {item.sources} 筆、產出 {item.artifacts_deleted} 份）</li>)}</ul>
      </div>}
    </section>
  );
}
