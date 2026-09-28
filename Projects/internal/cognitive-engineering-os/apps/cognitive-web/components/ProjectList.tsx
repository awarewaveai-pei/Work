"use client";

// 我的專案 (docs/mockups/home-mock.html section#projects): one row per project -- its name opens it, what it used, how
// far it got (走到哪: AI 草稿／已核准／已退回, tasks due, a rerun due), when it was made and last moved (to the minute, in
// your own time zone), and the button to its latest result. Most recently active first.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { analysisHref, projectHref, toolHref } from "../lib/catalog";
import { byActivity, standing, type Project } from "../lib/projects";
import { formatTime } from "../lib/time";

export function ProjectList({ names = {} }: { names?: Record<string, string> }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<Project[]>("/projects").then((list) => setProjects([...list].sort(byActivity))).catch((reason) => setError(String(reason))); }, []);
  return (
    <section className="view" id="projects">
      <div className="top"><div><h1>我的專案</h1><div className="sub">每次用工具分析都會開一個新專案，結果存在裡面，隨時回來看。</div></div><Link className="btn primary" href="/">開新的分析：先說你卡在哪 →</Link></div>
      <div className="card">
        <h2>你的專案<small>{projects ? `${projects.length} 個` : "載入中"}</small></h2>
        <div className="how"><b>怎麼讀</b>一列一個專案：用了哪個工具、走到哪、建立和最後更新的時間（到分鐘）、下一步；最近動過的在上面。<b>你要做的</b>按專案名稱打開它，看裡面每一次分析和任務；按「看結果」直接看最近一次。</div>
        {error && <p className="error">{error}</p>}
        {projects && (projects.length ? (
          <div className="scroll-x">
            <table>
              <thead><tr><th>專案</th><th>用的</th><th>走到哪</th><th>建立</th><th>最後更新</th><th>下一步</th></tr></thead>
              <tbody>{projects.map((project) => {
                const latest = project.latest_analysis;
                const count = project.analysis_count ?? 0;
                const flags = [project.tasks?.overdue ? `${project.tasks.overdue} 個任務逾期` : project.tasks?.open ? `${project.tasks.open} 個任務進行中` : "", project.reruns_due ? "到期：重跑並比較" : ""].filter(Boolean);
                return <tr key={project.project_id}>
                  <td><Link href={projectHref(project.project_id)}>{project.name}</Link></td>
                  <td>{project.methods?.length ? <>工具：{project.methods.map((id, index) => <span key={id}>{index ? "、" : ""}<Link href={toolHref(id)}>{names[id] ?? id}</Link></span>)}</> : "—"}</td>
                  <td>{standing(latest)}{count > 1 ? `（共 ${count} 次分析）` : ""}{flags.length ? <><br /><span className="warn">{flags.join("・")}</span></> : null}</td>
                  <td>{formatTime(project.created_at)}</td>
                  <td>{formatTime(project.updated_at ?? project.created_at)}</td>
                  <td>{project.reruns_due
                    ? <Link className="btn primary" href={projectHref(project.project_id)}>到期了：重跑並比較 →</Link>
                    : latest?.status === "DONE"
                      ? <Link className="btn" href={analysisHref(project.project_id, latest.interpretation_id)}>{latest.approval?.decision === "approve" ? "看結果 →" : "看結果、核准 →"}</Link>
                      : <Link className="btn" href={projectHref(project.project_id)}>打開專案 →</Link>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <p className="sub">還沒有專案。</p>)}
        <p className="sub mt8 mb0">你自己建立的專案會出現在這裡；建立第一個：到「首頁」說你卡在哪，或到「工具」挑一個按「開始」。刪除專案 = 來源與所有產出一起刪掉，留一筆「已抹除」。</p>
      </div>
    </section>
  );
}
