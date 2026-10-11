"use client";

// The home page's two doors (ENTRY_SLICE1_CHECKLIST.md items 2 and 6): one optional sentence, then 陪我思考 (opens a case at
// once -- no tool run first -- and carries the sentence into 開案資料's 你想釐清什麼) or 直接分析 (carries it into 先說你卡在哪).
// Below: the case touched last, when there is one. Classes are design-system.css's own (mcards / mcard / btn).
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { projectHref } from "../lib/catalog";
import { humanError } from "../lib/errors";
import { byActivity, createProject, listedAsCase, type Project } from "../lib/projects";
import { formatTime } from "../lib/time";

/** A new case's name: the sentence's first line, short; without one, the minute it was opened. */
export function caseName(question: string, now: Date): string {
  const line = question.trim().split(/\r?\n/)[0].trim();
  return line ? (line.length > 40 ? `${line.slice(0, 40)}…` : line) : `新的案子 ${formatTime(now.toISOString())}`;
}

export function HomeStart() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<Project | null>(null);
  useEffect(() => {
    apiFetch<Project[]>("/projects").then((list) => setLast([...list].filter(listedAsCase).sort(byActivity)[0] ?? null)).catch(() => undefined);
  }, []);
  const thinkWithMe = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const created = await createProject(caseName(question, new Date()), question.trim() || "陪我思考");
      const q = question.trim();
      router.push(`${projectHref(created.project_id)}/start${q ? `?q=${encodeURIComponent(q.slice(0, 2000))}` : ""}`);
    } catch (reason) { setError(humanError(reason)); setBusy(false); }
  };
  const q = question.trim();
  return (
    <>
      <div className="card">
        <div className="field"><label htmlFor="home-q">你想把什麼事想清楚？（可以先不寫）</label>
          <textarea id="home-q" rows={3} maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例：合夥人第三次改合約條件，還說「同業都這樣改」。這段合作要不要繼續？" /></div>
      </div>
      <div className="mcards" id="doors">
        <div className="mcard" id="door-think">
          <div className="k">我想自己想清楚</div>
          <h2>陪我思考</h2>
          <ul className="mb0">
            <li>系統幫你排好路線，一站一站走</li>
            <li>每一站你先寫，AI 再補充、提問、找反例</li>
            <li>結論你自己寫；可以分幾天做完</li>
          </ul>
          <div className="btns"><button type="button" className="btn primary big" disabled={busy} onClick={thinkWithMe}>{busy ? "開案中…" : "開一個案子 →"}</button></div>
          {error && <p className="error" role="alert">案子沒有開成：{error}</p>}
        </div>
        <div className="mcard" id="door-analyze">
          <div className="k">我需要一個答案</div>
          <h2>直接分析</h2>
          <ul className="mb0">
            <li>挑一個做法，填幾個格子</li>
            <li>AI 直接給你一份分析</li>
            <li>之後想深入，可以把結果帶進案子</li>
          </ul>
          <div className="btns"><Link className="btn big" href={q ? `/analyze?q=${encodeURIComponent(q.slice(0, 2000))}` : "/analyze"}>直接分析 →</Link></div>
        </div>
      </div>
      {last && <div className="card" id="continue">
        <h2>繼續上次的案子</h2>
        <p className="mb0"><Link href={projectHref(last.project_id)}>{last.name}</Link>　<span className="sub">最後更新 {formatTime(last.updated_at ?? last.created_at)}</span></p>
        <div className="btns mt8"><Link className="btn" href={projectHref(last.project_id)}>繼續 →</Link><Link className="btn ghost" href="/projects">看全部的案子</Link></div>
      </div>}
    </>
  );
}
