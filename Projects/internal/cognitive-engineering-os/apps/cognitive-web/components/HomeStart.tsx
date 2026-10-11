"use client";

// The home page's two doors (ENTRY_SLICE1_CHECKLIST.md items 2 and 6): one optional sentence, then 陪我思考 (開案 at
// /projects/new -- no tool run first; the sentence fills 你想釐清什麼, and the case exists once its 開案資料 is saved) or
// 直接分析 (carries it into 先說你卡在哪). Below: the case touched last (is_case), when there is one. Classes are
// design-system.css's own (mcards / mcard / btn).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { projectHref } from "../lib/catalog";
import { byActivity, type Project } from "../lib/projects";
import { formatTime } from "../lib/time";

export function HomeStart() {
  const [question, setQuestion] = useState("");
  const [last, setLast] = useState<Project | null>(null);
  useEffect(() => {
    apiFetch<Project[]>("/projects").then((list) => setLast(list.filter((project) => project.is_case).sort(byActivity)[0] ?? null)).catch(() => undefined);
  }, []);
  const q = question.trim();
  const carry = q ? `?q=${encodeURIComponent(q.slice(0, 2000))}` : "";
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
          <div className="btns"><Link className="btn primary big" href={`/projects/new${carry}`}>開一個案子 →</Link></div>
        </div>
        <div className="mcard" id="door-analyze">
          <div className="k">我需要一個答案</div>
          <h2>直接分析</h2>
          <ul className="mb0">
            <li>挑一個做法，填幾個格子</li>
            <li>AI 直接給你一份分析</li>
            <li>之後想深入，可以把結果帶進案子</li>
          </ul>
          <div className="btns"><Link className="btn big" href={`/analyze${carry}`}>直接分析 →</Link></div>
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
