"use client";

// 我的專案 (docs/mockups/home-mock.html section#projects): one row per project -- its name opens it, what it used, how
// far it got, when it was made and last moved (to the minute, in your own time zone), and the button to its latest result.
// Most recently active first.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { analysisHref, projectHref, toolHref } from "../lib/catalog";
import { byActivity, STATUS, type Project } from "../lib/projects";
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
        <div className="how"><b>怎麼讀</b>一列一個專案：用了哪個工具、走到哪、建立和最後更新的時間（到分鐘）；最近動過的在上面。<b>你要做的</b>按專案名稱打開它，看裡面每一次分析；按「看結果」直接看最近一次。</div>
        {error && <p className="error">{error}</p>}
        {projects && (projects.length ? (
          <div className="scroll-x">
            <table>
              <thead><tr><th>專案</th><th>用的</th><th>走到哪</th><th>建立</th><th>最後更新</th><th>下一步</th></tr></thead>
              <tbody>{projects.map((project) => {
                const latest = project.latest_analysis;
                const count = project.analysis_count ?? 0;
                return <tr key={project.project_id}>
                  <td><Link href={projectHref(project.project_id)}>{project.name}</Link></td>
                  <td>{project.methods?.length ? project.methods.map((id, index) => <span key={id}>{index ? "、" : ""}工具：<Link href={toolHref(id)}>{names[id] ?? id}</Link></span>) : "—"}</td>
                  <td>{latest ? `${STATUS[latest.status]}${count > 1 ? `（共 ${count} 次分析）` : ""}` : "還沒分析"}</td>
                  <td>{formatTime(project.created_at)}</td>
                  <td>{formatTime(project.updated_at ?? project.created_at)}</td>
                  <td>{latest?.status === "DONE"
                    ? <Link className="btn" href={analysisHref(project.project_id, latest.interpretation_id)}>看結果 →</Link>
                    : <Link className="btn" href={projectHref(project.project_id)}>打開專案 →</Link>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <p className="sub">還沒有專案。到「首頁」說你卡在哪，或到「工具」挑一個按「開始」；每次分析會自動開一個專案。</p>)}
      </div>
    </section>
  );
}
