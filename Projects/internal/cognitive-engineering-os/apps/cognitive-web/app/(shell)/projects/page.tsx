"use client";

// 我的專案 (docs/mockups/home-mock.html section#projects): the signed-in tenant's projects from GET /projects. The
// mock's 走到哪 / 下一步 columns need per-project progress the API does not serve yet; they are left out, not faked.
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Project = { project_id: string; name: string; purpose?: string; status?: string; created_at?: string };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<Project[]>("/projects").then(setProjects).catch((reason) => setError(String(reason))); }, []);
  return (
    <section className="view" id="projects">
      <div className="top"><div><h1>我的專案</h1><div className="sub">每次用工具分析，結果都存在一個專案裡。</div></div><Link className="btn primary" href="/">開新的分析：先說你卡在哪 →</Link></div>
      <div className="card">
        <h2>你的專案<small>{projects ? `${projects.length} 個` : "載入中"}</small></h2>
        <div className="how"><b>怎麼讀</b>一列一個專案：名稱、用途、建立的時間。<b>你要做的</b>要開新的，按上面「開新的分析」，或到「工具」挑一個按「開始」。</div>
        {error && <p className="error">{error}</p>}
        {projects && (projects.length ? (
          <div className="scroll-x">
            <table>
              <thead><tr><th>專案</th><th>用途</th><th>建立</th></tr></thead>
              <tbody>{projects.map((p) => <tr key={p.project_id}><td>{p.name}</td><td>{p.purpose ?? ""}</td><td>{(p.created_at ?? "").slice(0, 10)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="sub">還沒有專案。到「首頁」說你卡在哪，或到「工具」挑一個按「開始」，第一次分析會自動建立專案。</p>)}
      </div>
    </section>
  );
}
