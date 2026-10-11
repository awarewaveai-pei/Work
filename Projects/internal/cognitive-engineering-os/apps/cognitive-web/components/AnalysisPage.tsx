"use client";

// One saved analysis (我的案子 › project › tool分析): read back with GET /interpretations/{id}, then shown by the run page
// itself -- the same header, fields and result cards as right after 執行分析 -- so what you see later is what you saw then,
// and running it again adds a new analysis to the same project. `rerunId` = the reminder this visit answers.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { projectHref } from "../lib/catalog";
import { RunPage, type InterpretationStatus } from "./RunPage";

export function AnalysisPage({ projectId, analysisId, names = {}, lessons = {}, families = {}, rerunId = "" }: { projectId: string; analysisId: string; names?: Record<string, string>; lessons?: Record<string, string>; families?: Record<string, string>; rerunId?: string }) {
  const [analysis, setAnalysis] = useState<InterpretationStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiFetch<InterpretationStatus>(`/interpretations/${encodeURIComponent(analysisId)}`).then((found) => {
      if (!active) return;
      if (found.project_id !== projectId) setError("這次分析不在這個專案裡。");
      else if (!found.method_id) setError("找不到這次分析用的工具。");
      else setAnalysis(found);
    }).catch((reason) => { if (active) setError(reason instanceof ApiError && reason.status === 404 ? "找不到這次分析：可能連同專案一起刪除了，或不在你的帳號裡。" : String(reason)); });
    return () => { active = false; };
  }, [projectId, analysisId]);
  if (error) return <><div className="crumbs"><Link href="/projects">我的案子</Link> › <Link href={projectHref(projectId)}>這個專案</Link></div><div className="card"><p className="error">{error}</p></div></>;
  if (!analysis) return <div className="card"><p>載入中…</p></div>;
  return <RunPage key={analysisId} methodId={analysis.method_id!} lesson={lessons[analysis.method_id!] ?? null} lessons={lessons} names={names} family={families[analysis.method_id!] ?? null} projectId={projectId} analysis={analysis} rerunId={rerunId} />;
}
