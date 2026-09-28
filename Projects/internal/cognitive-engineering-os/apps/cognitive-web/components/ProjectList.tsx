"use client";

// 我的專案 (docs/mockups/home-mock.html section#projects): one row per project -- its name opens it, what it used, how
// far it got (走到哪: AI 草稿／已核准／已退回, tasks due, a rerun due), when it was made and last moved (to the minute, in
// your own time zone), and the button to its latest result. Most recently active first.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { analysisHref, projectHref, toolHref } from "../lib/catalog";
import { humanError } from "../lib/errors";
import { byActivity, standing, type ErasedProject, type Project } from "../lib/projects";
import { formatTime } from "../lib/time";

export function ProjectList({ names = {} }: { names?: Record<string, string> }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [erased, setErased] = useState<ErasedProject[]>([]);
  useEffect(() => { apiFetch<Project[]>("/projects").then((list) => setProjects([...list].sort(byActivity))).catch((reason) => setError(humanError(reason))); }, []);
  useEffect(() => { apiFetch<ErasedProject[]>("/projects/erased").then(setErased).catch(() => undefined); }, []);
  return (
    <section className="view" id="projects">
      <div className="top"><div><h1>我的專案</h1><div className="sub">每次用工具分析都會開一個新專案，結果存在裡面，隨時回來看。</div></div><Link className="btn primary" href="/">開新的分析：先說你卡在哪 →</Link></div>
      <div className="card">
        <h2>你的專案<small>{projects ? `${projects.length} 個你自己的・1 個示範` : "載入中"}</small></h2>
        <div className="how"><b>怎麼讀</b>一列一個專案：用了哪個工具、走到哪、建立和最後更新的時間（到分鐘）、下一步；最近動過的在上面。<b>你要做的</b>按專案名稱打開它，看裡面每一次分析和任務；按「看結果」直接看最近一次。</div>
        {error && <p className="error">{error}</p>}
        {projects && (
          <div className="scroll-x">
            <table>
              <thead><tr><th>專案</th><th>用的</th><th>走到哪</th><th>建立</th><th>最後更新</th><th>下一步</th></tr></thead>
              <tbody>{projects.map((project) => {
                const latest = project.latest_analysis;
                const count = project.analysis_count ?? 0;
                const flags = [project.tasks?.overdue ? `${project.tasks.overdue} 個任務逾期` : project.tasks?.open ? `${project.tasks.open} 個任務進行中` : "", project.tasks?.due_today ? `${project.tasks.due_today} 個任務今天到期` : "", project.reruns_due ? "到期：重跑並比較" : ""].filter(Boolean);
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
              })}
              <tr className="demo">
                <td><Link href="/projects/demo/iceberg">WuSheng 團體反思・第三期（示範）</Link></td>
                <td>工具：<Link href={toolHref("systems.iceberg_model")}>{names["systems.iceberg_model"] ?? "冰山模型"}</Link></td>
                <td>報表（示範，不花錢）</td><td>—</td><td>—</td>
                <td><Link className="btn" href="/projects/demo/iceberg">看示範結果 →</Link></td>
              </tr></tbody>
            </table>
            {!projects.length && <p className="sub mt8 mb0">還沒有你自己的專案。</p>}
          </div>
        )}
        <p className="sub mt8 mb0">你自己建立的專案會出現在這裡；建立第一個：到「首頁」說你卡在哪，或到「工具」挑一個按「開始」。刪除專案 = 來源與所有產出一起刪掉，留一筆「已抹除」。</p>
      </div>
      {/* N-79: the six-step journey every project walks (docs/mockups/home-mock.html「每個專案都走同一條線」) */}
      <div className="card">
        <h2>每個專案都走同一條線<small>六步，每步一顆主按鈕</small></h2>
        <div className="how"><b>怎麼讀</b>不管用哪個工具，專案都是這六步；關掉視窗再開，會回到走到的那一步。<b>你要做的</b>不用做；記住會花錢的步（蒐集、分析）按下去之前都會先告訴你要花多少。</div>
        <div className="journey"><span>建立</span><i>→</i><span>蒐集</span><i>→</i><span>彙整</span><i>→</i><span>分析</span><i>→</i><span>報表</span><i>→</i><span>核准</span></div>
      </div>
      {erased.length > 0 && <div className="card" id="erased">
        <h2>已抹除<small>{erased.length} 個</small></h2>
        <div className="how"><b>怎麼讀</b>被刪除的專案留下的紀錄：什麼時候、刪掉了多少來源和分析。<b>你要做的</b>不用做；這些專案本身已經不在，也回不來。</div>
        <ul>{erased.map((item) => <li key={item.project_id}>{formatTime(item.erased_at)}：{item.project_id}（來源 {item.sources} 筆、產出 {item.artifacts_deleted} 份）</li>)}</ul>
      </div>}
    </section>
  );
}
