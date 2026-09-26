"use client";

// The run page (docs/mockups/iceberg-result-mock.html): header card, the fields you fill (they stay above the result),
// then the result. `lesson` = the tool's lesson page or null, `names` = tool id -> name for the next steps (both resolved on
// the server: app/(shell)/methods/[id]/run/page.tsx). Every analysis is saved in a project: `projectId` (the address's
// ?project=, or a saved analysis's own) or else a new project made when 執行分析 is pressed -- never whichever project
// happens to exist. `analysis` = a saved analysis to open (app/(shell)/projects/[id]/analyses/[analysis]): its result or
// its progress, the fields refilled from its record. Once an analysis is accepted the address becomes its own page, so a
// reload or a bookmark comes back to it.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { ApiError, apiFetch } from "../lib/api";
import { analysisHref, projectHref } from "../lib/catalog";
import { FormField, initialState } from "../lib/form-model";
import { byActivity, type Project, type Stance } from "../lib/projects";
import { restoreState } from "../lib/record";
import { formatTime } from "../lib/time";
import { LazyFill } from "./LazyFill";
import { MethodForm } from "./MethodForm";
import { ResultPage } from "./result/ResultPage";
import { RunHeader } from "./RunHeader";

type FormResponse = { method_id: string; display?: { name_zh?: string; name_en?: string; blurb_zh?: string }; form: { fields: FormField[]; example?: { scenario?: string; input?: Record<string, unknown> } } };
export type InterpretationStatus = {
  interpretation_id?: string; status: "PENDING" | "FAILED" | "DONE"; project_id?: string; method_id?: string | null; created_at?: string;
  result?: any; record?: Record<string, unknown>; manifest?: Array<{ id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string }>;
  gate_results?: Array<{ gate_id: string; status: string }>; judgment?: { stance: Stance; text: string } | null; error?: string;
};
const failed = (message?: string | null) => `這次分析沒有完成：${message || "原因不明"}`;

export function RunPage({ methodId, lesson, names = {}, projectId: given = "", analysis = null }: {
  methodId: string; lesson: string | null; names?: Record<string, string>; projectId?: string; analysis?: InterpretationStatus | null;
}) {
  const [form, setForm] = useState<FormResponse | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState(given);
  const [completed, setCompleted] = useState<InterpretationStatus | null>(analysis?.status === "DONE" ? analysis : null);
  // a failed analysis kept no record (only a finished one is stored), so its fields cannot come back
  const [error, setError] = useState(analysis?.status === "FAILED" ? `${failed(analysis.error)}。這次填的內容沒有存下來（只有分析完成才會存），要再分析請重新填格子。` : "");
  const [pendingId, setPendingId] = useState(analysis?.status === "PENDING" ? analysis.interpretation_id ?? "" : "");
  const [starting, setStarting] = useState(false);
  const [lastFailed, setLastFailed] = useState(analysis?.status === "FAILED");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [left, setLeft] = useState<string[]>([]);   // fields a saved analysis could not refill
  const refill = useRef(Boolean(analysis) && !analysis?.record);   // opened while it runs: refill the fields when it lands

  const restore = (fields: FormField[], record: Record<string, unknown>) => { const back = restoreState(fields, record); setState(back.state); setLeft(back.left); };

  useEffect(() => {
    let active = true;
    apiFetch<FormResponse>(`/methods/${encodeURIComponent(methodId)}/form`).then((response) => {
      if (!active) return;
      setForm(response);
      if (analysis?.record) { restore(response.form.fields, analysis.record); return; }
      // #demo (a lesson's 用示範案例試一次) opens with the demo filled in; otherwise the fields start empty (docs/mockups run page #new)
      const base = initialState(response.form.fields, window.location.hash === "#demo" ? response.form.example?.input : undefined);
      const prefillKey = `cos:prefill:${methodId}`;
      const prefillText = sessionStorage.getItem(prefillKey);
      sessionStorage.removeItem(prefillKey);
      try { setState({ ...base, ...(prefillText ? JSON.parse(prefillText) as Record<string, unknown> : {}) }); }
      catch { setState(base); }
    }).catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [methodId]);

  useEffect(() => {
    let active = true;
    apiFetch<Project[]>("/projects").then((list) => {
      if (!active) return;
      setProjects([...list].sort(byActivity));
      if (given && !list.some((item) => item.project_id === given)) { setProjectId(""); setError("網址裡的專案找不到了（可能已經刪除）；這次分析會開一個新專案。"); }
    }).catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [given]);

  useEffect(() => {
    if (!pendingId) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const update = await apiFetch<InterpretationStatus>(`/interpretations/${pendingId}`);
        if (!active) return;
        if (update.status === "DONE") {
          setCompleted(update); setPendingId("");
          if (refill.current && update.record && form) { restore(form.form.fields, update.record); refill.current = false; }
        }
        if (update.status === "FAILED") { setError(failed(update.error)); setLastFailed(true); setPendingId(""); }
      } catch (reason) { if (active) { setError(String(reason)); setPendingId(""); } }
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [pendingId, form]);

  if (!form) return <div className="card"><p>{error || "載入中…"}</p></div>;
  const name = form.display?.name_zh ?? methodId;
  const example = form.form.example?.input;
  const fill = () => { if (example) { setState(initialState(form.form.fields, example)); setSuggested([]); setLeft([]); setError(""); } else setError("此工具沒有示範案例"); };
  const clear = () => { setState(initialState(form.form.fields)); setSuggested([]); setLeft([]); setError(""); };
  const current = projects?.find((item) => item.project_id === projectId);
  const project = projectId && current ? { id: projectId, name: current.name } : undefined;
  // A new project for this analysis, named after the tool and the minute. Names are unique per workspace (409): a second
  // one in the same minute becomes "… (2)".
  const newProject = async (): Promise<string> => {
    const base = `${name} ${formatTime(new Date().toISOString())}`;
    for (let attempt = 1; attempt <= 20; attempt++) {
      try {
        const created = await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name: attempt === 1 ? base : `${base} (${attempt})`, purpose: `使用 ${name} 進行分析`, data_classification: "Confidential" }) });
        setProjects((list) => [created, ...(list ?? [])]); setProjectId(created.project_id);
        return created.project_id;
      } catch (reason) { if (!(reason instanceof ApiError && reason.status === 409)) throw reason; }
    }
    throw new Error("同一分鐘開了太多同名專案，請稍後再按一次");
  };
  // ResultPage's own header replaces this one once there is a result.
  const inputCard = (
    <div className="card cta" id="input">
      <h2>你的案例<small>從上往下填；填不出來的留白</small></h2>
      <div className="how"><b>怎麼讀</b>每格一句提示；空的格子裡有例子。<b>你要做的</b>填好按「執行分析」；你確認才開始、才花錢。</div>
      <details className="mb10"><summary>手邊有一段描述？貼上，系統先幫你填格子</summary><LazyFill methodId={methodId} fields={form.form.fields} state={state} onState={setState} onSuggested={setSuggested} /></details>
      {suggested.length > 0 && <div className="how"><b>AI 幫你填了</b>{suggested.join("、")}；請逐格核對。<button type="button" className="btn" onClick={() => setSuggested([])}>我已確認這些格子</button></div>}
      {left.length > 0 && <p className="sub">這次分析的「{left.join("、")}」沒辦法自動帶回格子；要再分析，請重新填這幾格。</p>}
      <p className="sub mb10">存到：{project ? <>專案「<Link href={projectHref(project.id)}>{project.name}</Link>」</> : "新專案（按「執行分析」時建立，名稱是工具加上時間）"}</p>
      {projects && projects.length > 0 && !pendingId && <details className="mb10"><summary>改存到別的專案</summary><div className="btns mt6">
        <button type="button" className={`btn${projectId ? " ghost" : " primary"}`} aria-pressed={!projectId} onClick={() => setProjectId("")}>新專案</button>
        {projects.slice(0, 8).map((item) => <button type="button" key={item.project_id} className={`btn${projectId === item.project_id ? " primary" : " ghost"}`} aria-pressed={projectId === item.project_id} onClick={() => setProjectId(item.project_id)}>{item.name}</button>)}
      </div>{projects.length > 8 && <p className="sub mb0">更早的專案：到「我的專案」打開它，按「在這個專案再分析一次」。</p>}</details>}
      <MethodForm fields={form.form.fields} state={state} onState={setState} example={example} onFill={fill} onClear={clear} label={`${name}的格子`} busy={Boolean(pendingId) || starting} onSubmit={async (payload) => {
        if (pendingId || starting) return;
        if (suggested.length) { setError("請先確認 AI 幫你填的格子"); return; }
        if (!projects) { setError("專案清單還在載入，請再按一次"); return; }
        setStarting(true);
        try {
          const target = projectId || await newProject();
          const accepted = await apiFetch<{ interpretation_id: string; status: string }>(`/methods/${encodeURIComponent(methodId)}/interpret`, { method: "POST", body: JSON.stringify({ ...payload, project_id: target }) });
          if (accepted.status !== "PENDING") throw new Error(`未預期的解讀狀態：${accepted.status}`);
          setError(""); setCompleted(null); setLeft([]); setLastFailed(false); refill.current = false; setPendingId(accepted.interpretation_id);
          window.history.replaceState(null, "", analysisHref(target, accepted.interpretation_id));
        } catch (reason) { setError(String(reason)); }
        finally { setStarting(false); }
      }} />
      {pendingId && <p role="status" className="sub mt10">正在分析，約兩到三分鐘（整頁結果：結論、逐層解讀、圖、方案）；完成後結果會出現在下面。關掉這頁也會繼續，之後到「我的專案」打開。</p>}{error && <p className="error">{error}</p>}
    </div>
  );
  if (completed?.result) return <ResultPage result={completed.result} record={completed.record} manifest={completed.manifest} gateResults={completed.gate_results} display={form.display} lesson={lesson} fields={form.form.fields} names={names} project={project} analyzedAt={completed.created_at} judgment={completed.judgment}>{inputCard}</ResultPage>;
  return <>
    <RunHeader methodId={methodId} name={name} nameEn={form.display?.name_en} lesson={lesson} project={project} status={<><span className="pill">{pendingId ? "分析中" : lastFailed ? "上次分析沒有完成" : "還沒執行"}</span>{!pendingId && <span>填好格子按「執行分析」，按之前不花錢</span>}</>} />
    {inputCard}
    <div className="card" id="result">
      <h2>結果</h2>
      <div className="how"><b>怎麼讀</b>按「執行分析」後，結果出現在這裡。<b>你要做的</b>先填上面的格子。</div>
      <p className="sub mb0">執行之前不花錢；按下去才開始分析。</p>
    </div>
  </>;
}
