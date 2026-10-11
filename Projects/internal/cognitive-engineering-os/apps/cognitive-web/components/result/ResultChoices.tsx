"use client";

// The bottom of a 直接分析 result (ENTRY_SLICE1_CHECKLIST.md items 9-10): what to do with it, shown only while its project
// is not a case yet (GET /projects/{id} is_case). 用這份結果開案 = this same project gets 開案資料 and becomes a case, the
// analysis stays in it as AI material; 留在我的分析 = keep it as it is; 永久刪除 = the result page's own erase (onErase).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { projectHref } from "../../lib/catalog";
import type { Project } from "../../lib/projects";

export function ResultChoices({ projectId, onErase }: { projectId: string; onErase: () => void }) {
  const [isCase, setIsCase] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    apiFetch<Project>(`/projects/${encodeURIComponent(projectId)}`).then((found) => { if (active) setIsCase(Boolean(found.is_case)); }).catch(() => undefined);
    return () => { active = false; };
  }, [projectId]);
  if (isCase !== false) return null;   // a case already, or not known: nothing to choose
  return (
    <div className="card" id="choices">
      <h2>這份結果要怎麼處理？</h2>
      <p className="sub">這是 AI 做的分析，不是你的判斷。它現在留在「我的分析」。</p>
      <div className="btns mt8">
        <Link className="btn primary" href={`${projectHref(projectId)}/start`}>用這份結果開案 →</Link>
        <Link className="btn" href="/projects#analyses">留在我的分析</Link>
        <button type="button" className="btn ghost" onClick={onErase}>永久刪除</button>
      </div>
      <p className="sub mt8 mb0">開案後，這份分析留在案子裡，標「AI 做的」，當你想清楚的材料；結論由你自己寫。</p>
    </div>
  );
}
