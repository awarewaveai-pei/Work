"use client";

// The run page (docs/mockups/iceberg-result-mock.html): header card, the fields you fill (they stay above the result),
// then the result. `lesson` = the tool's lesson page or null, `names` = tool id -> name for the next steps, `family` = the
// tool's family label, `lessons`/`families` = the same for every tool (all resolved on the server). Every analysis is
// saved in a project: `projectId` (the address's ?project=, or a saved analysis's own) or else a new project made when
// 執行分析 is pressed -- never whichever project happens to exist. `analysis` = a saved analysis to open
// (app/(shell)/projects/[id]/analyses/[analysis]): its result or its progress, the fields refilled from its record.
// `rerunId` = the rerun reminder this visit answers (from a project page's 到期 notice). Once an analysis is accepted the
// address becomes its own page, so a reload or a bookmark comes back to it.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { ApiError, apiFetch } from "../lib/api";
import { analysisHref, ICEBERG_ID, projectHref } from "../lib/catalog";
import { FormField, initialState } from "../lib/form-model";
import { byActivity, costLine, type Approval, type Estimate, type Project, type Stance } from "../lib/projects";
import { isOldVersion, restoreState } from "../lib/record";
import { formatTime } from "../lib/time";
import { LazyFill } from "./LazyFill";
import { MethodForm } from "./MethodForm";
import { ResultPage } from "./result/ResultPage";
import { RunHeader } from "./RunHeader";

type FormResponse = { method_id: string; display?: { name_zh?: string; name_en?: string; blurb_zh?: string }; form: { fields: FormField[]; example?: { scenario?: string; input?: Record<string, unknown> } } };
export type InterpretationStatus = {
  interpretation_id?: string; status: "PENDING" | "FAILED" | "DONE"; project_id?: string; method_id?: string | null; created_at?: string;
  revision?: { of: string; reason: string } | null; rerun_id?: string | null;
  result?: any; record?: Record<string, unknown>; manifest?: Array<{ id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string }>;
  gate_results?: Array<{ gate_id: string; status: string }>; judgment?: { stance: Stance; text: string } | null; approval?: Approval | null; cost_twd?: number | null; error?: string;
};
const failed = (message?: string | null) => `這次分析沒有完成：${message || "原因不明"}`;

export function RunPage({ methodId, lesson, names = {}, lessons = {}, family = null, projectId: given = "", analysis = null, rerunId = "" }: {
  methodId: string; lesson: string | null; names?: Record<string, string>; lessons?: Record<string, string>; family?: string | null; projectId?: string; analysis?: InterpretationStatus | null; rerunId?: string;
}) {
  const [form, setForm] = useState<FormResponse | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState(given);
  const [completed, setCompleted] = useState<InterpretationStatus | null>(analysis?.status === "DONE" ? analysis : null);
  const [error, setError] = useState(analysis?.status === "FAILED" ? `${failed(analysis.error)}。這次填的內容沒有存下來（只有分析完成才會存），要再分析請重新填格子。` : "");
  const [pendingId, setPendingId] = useState(analysis?.status === "PENDING" ? analysis.interpretation_id ?? "" : "");
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState<Record<string, unknown> | null>(null);   // 花錢前先講: the filled form waits for 確認執行
  const [lastFailed, setLastFailed] = useState(analysis?.status === "FAILED");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [left, setLeft] = useState<string[]>([]);   // fields a saved analysis could not refill
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [revision, setRevision] = useState<{ of: string; reason: string } | null>(null);   // 退回 → 依原因重做: the next run redoes this one
  const [rerun, setRerun] = useState(rerunId);   // the reminder the next run answers
  const [previous, setPrevious] = useState<string | null>(null);   // the analysis the shown result redoes or reruns
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
    apiFetch<Estimate>(`/methods/${encodeURIComponent(methodId)}/estimate`).then((found) => { if (active) setEstimate(found); }).catch(() => undefined);
    return () => { active = false; };
  }, [methodId]);   // eslint-disable-line react-hooks/exhaustive-deps

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
  const count = form.form.fields.length;
  const numeral = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九"][count] ?? String(count);
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
  const redo = (reason: string) => {
    if (!completed?.interpretation_id) return;
    setRevision({ of: completed.interpretation_id, reason });
    document.getElementById("input")?.scrollIntoView({ behavior: "smooth" });
  };
  // The run itself, after 確認執行: a project to save in, then the analysis; the address becomes the analysis's own page.
  const launch = async (payload: Record<string, unknown>) => {
    if (pendingId || starting) return;
    if (!projects) { setError("專案清單還在載入，請再按一次"); return; }
    setStarting(true);
    try {
      const target = projectId || await newProject();
      const body = { ...payload, project_id: target, ...(revision ? { revision } : {}), ...(rerun ? { rerun_id: rerun } : {}) };
      const accepted = await apiFetch<{ interpretation_id: string; status: string }>(`/methods/${encodeURIComponent(methodId)}/interpret`, { method: "POST", body: JSON.stringify(body) });
      if (accepted.status !== "PENDING") throw new Error(`未預期的解讀狀態：${accepted.status}`);
      setPrevious(revision?.of ?? (rerun ? completed?.interpretation_id ?? analysis?.interpretation_id ?? null : null));
      setError(""); setCompleted(null); setLeft([]); setLastFailed(false); setRevision(null); setRerun(""); refill.current = false; setPendingId(accepted.interpretation_id);
      window.history.replaceState(null, "", analysisHref(target, accepted.interpretation_id));
    } catch (reason) { setError(String(reason)); }
    finally { setStarting(false); }
  };
  // ResultPage's own header replaces this one once there is a result.
  const inputCard = (
    <div className="card cta" id="input">
      <h2>你的案例：{numeral}個格子<small>從上往下填；填不出來的留白</small></h2>
      <div className="how"><b>怎麼讀</b>一格一層，每格一句提示；空的格子裡有例子。<b>你要做的</b>填好按「執行分析」；留白的層會列成證據缺口。</div>
      <details className="mb8"><summary>手邊有一段描述？貼上，系統先幫你填格子</summary><LazyFill methodId={methodId} fields={form.form.fields} state={state} onState={setState} onSuggested={setSuggested} /></details>
      {suggested.length > 0 && <div className="how"><b>AI 幫你填了</b>{suggested.join("、")}；請逐格核對。<button type="button" className="btn" onClick={() => setSuggested([])}>我已確認這些格子</button></div>}
      {left.length > 0 && <p className="sub">這次分析的「{left.join("、")}」沒辦法自動帶回格子；要再分析，請重新填這幾格。</p>}
      {revision && <p className="mocknote" role="status">依退回原因重做：「{revision.reason}」。改好格子按「執行分析」，AI 會依原因重做；退回的那一版保留。<button type="button" className="btn ghost" onClick={() => setRevision(null)}>不重做了</button></p>}
      {rerun && <p className="mocknote" role="status">到期重跑：更新格子裡的數字，按「執行分析」；跑完會和上一次並排比較。</p>}
      <p className="sub mb8">存到：{project ? <>專案「<Link href={projectHref(project.id)}>{project.name}</Link>」</> : "新專案（按「執行分析」時建立，名稱是工具加上時間）"}</p>
      {projects && projects.length > 0 && !pendingId && !revision && !rerun && <details className="mb8"><summary>改存到別的專案</summary><div className="btns mt6">
        <button type="button" className={`btn${projectId ? " ghost" : " primary"}`} aria-pressed={!projectId} onClick={() => setProjectId("")}>新專案</button>
        {projects.slice(0, 8).map((item) => <button type="button" key={item.project_id} className={`btn${projectId === item.project_id ? " primary" : " ghost"}`} aria-pressed={projectId === item.project_id} onClick={() => setProjectId(item.project_id)}>{item.name}</button>)}
      </div>{projects.length > 8 && <p className="sub mb0">更早的專案：到「我的專案」打開它，按「在這個專案再用「{name}」分析一次」。</p>}</details>}
      <MethodForm fields={form.form.fields} state={state} onState={setState} example={example} onFill={fill} onClear={clear} label={`${name}的${numeral}個格子`} busy={Boolean(pendingId) || starting} layered={methodId === ICEBERG_ID}
        onSubmit={async (payload) => {
        if (pendingId || starting) return;
        if (suggested.length) { setError("請先確認 AI 幫你填的格子"); return; }
        setError(""); setConfirming(payload);   // nothing is spent yet: the cost is said first (mock: 你確認才花)
      }} />
      {confirming && !pendingId && <div className="finding warn" role="status"><b>要花多少</b>{estimate ? `${costLine(estimate.tokens, estimate.twd)}${estimate.based_on ? `（依你最近 ${estimate.based_on} 次）` : "（第一次跑的估計）"}` : "估計還沒載入"}，約兩到三分鐘；按「確認執行」才開始、才花錢。
        <div className="btns mt6"><button type="button" className="btn primary big" disabled={starting} onClick={() => { const payload = confirming; setConfirming(null); void launch(payload); }}>確認執行</button><button type="button" className="btn ghost" onClick={() => setConfirming(null)}>取消</button></div></div>}
      {pendingId && <p role="status" className="sub mt10">正在分析，約兩到三分鐘（整頁結果：結論、逐層解讀、圖、方案）；完成後結果會出現在下面。關掉這頁也會繼續，之後到「我的專案」打開。</p>}{error && <p className="error">{error}</p>}
    </div>
  );
  if (completed?.result) return <ResultPage result={completed.result} record={completed.record} manifest={completed.manifest} gateResults={completed.gate_results} display={form.display} lesson={lesson} lessons={lessons} fields={form.form.fields} names={names} family={family} project={project} analyzedAt={completed.created_at} judgment={completed.judgment} approval={completed.approval} costTwd={completed.cost_twd} oldVersion={isOldVersion(completed.result)} compareWith={previous ?? completed.revision?.of ?? null} onRedo={redo}>{inputCard}</ResultPage>;
  return <>
    <RunHeader methodId={methodId} name={name} nameEn={form.display?.name_en} family={family} lesson={lesson} project={project} count={count} status={<>{(pendingId || lastFailed) && <span className="pill">{pendingId ? "分析中" : "上次分析沒有完成"}</span>}{!pendingId && <span>還沒執行：填好格子按「執行分析」，按之前不花錢</span>}{estimate && <span>{costLine(estimate.tokens, estimate.twd)}</span>}</>} />
    {inputCard}
    {!pendingId && <div className="card" id="result">
      <h2>結果</h2>
      <div className="how"><b>怎麼讀</b>按「執行分析」後，九段結果出現在這裡。<b>你要做的</b>先填上面的格子。</div>
      <p className="sub mb0">執行之前不花錢；按下去會先說要花多少，你確認才跑。</p>
    </div>}
  </>;
}
