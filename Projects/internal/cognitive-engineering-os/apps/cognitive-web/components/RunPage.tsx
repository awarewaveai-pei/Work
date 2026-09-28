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
import { failureReason, humanError } from "../lib/errors";
import { fieldKey, FormField, initialState } from "../lib/form-model";
import { byActivity, costLine, type Approval, type Estimate, type Project, type Stance, runMinutes } from "../lib/projects";
import { isOldVersion, restoreState } from "../lib/record";
import { formatTime } from "../lib/time";
import { LazyFill } from "./LazyFill";
import { MethodForm } from "./MethodForm";
import { ResultPage } from "./result/ResultPage";
import { RunHeader } from "./RunHeader";

type FormResponse = { method_id: string; display?: { name_zh?: string; name_en?: string; blurb_zh?: string }; form: { fields: FormField[]; example?: { scenario?: string; input?: Record<string, unknown>; sets?: Record<string, { scenario?: string; input?: Record<string, unknown> }> } } };
export function RunInputCard({ numeral, children }: { numeral: string; children: React.ReactNode }) {
  return <div className="card cta" id="input">
    <h2>你的案例：{numeral}個格子<small>從上往下填；填不出來的留白</small></h2>
    <div className="how"><b>怎麼讀</b>一格一層，每格一句提示；空的格子裡有例子。<b>你要做的</b>填好按「執行分析」；留白的層會列成證據缺口。</div>
    {children}
  </div>;
}
export type InterpretationStatus = {
  interpretation_id?: string; status: "PENDING" | "FAILED" | "DONE"; project_id?: string; method_id?: string | null; created_at?: string;
  revision?: { of: string; reason: string } | null; rerun_id?: string | null; rerun_of?: string | null;
  result?: any; record?: Record<string, unknown>; manifest?: Array<{ id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string; title?: string }>;
  gate_results?: Array<{ gate_id: string; status: string }>; record_gate_results?: Array<{ gate_id: string; status: string }>; schema_version?: string | null; judgment?: { stance: Stance; text: string } | null; approval?: Approval | null; cost_twd?: number | null; error?: string;
};
const failed = (message?: string | null) => `這次分析沒有完成：${failureReason(message)}`;

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
  const [customName, setCustomName] = useState("");   // N-83: 專案名稱, typed before a new project exists; blank = the auto tool+time name
  const [prefillNotice, setPrefillNotice] = useState("");          // N-20: 從「X分析」帶入 N 格
  const [prefillNeeds, setPrefillNeeds] = useState<string[]>([]);  // N-20: which carried-from fields still need the user (MethodForm marks them .need)
  const [stepForms, setStepForms] = useState<Record<string, FormField[]>>({});   // a result's next steps' own target forms, for card ⑧ (N-13/N-14)
  const refill = useRef(Boolean(analysis) && !analysis?.record);   // opened while it runs: refill the fields when it lands
  const prefillKey = `cos:prefill:${methodId}`;   // sessionStorage entry a previous result's ⑧ card left for this run (cleared only once a run of it is launched)

  const restore = (fields: FormField[], record: Record<string, unknown>) => { const back = restoreState(fields, record); setState(back.state); setLeft(back.left); };

  useEffect(() => {
    let active = true;
    apiFetch<FormResponse>(`/methods/${encodeURIComponent(methodId)}/form`).then((response) => {
      if (!active) return;
      setForm(response);
      if (analysis?.record) { restore(response.form.fields, analysis.record); return; }
      // #demo (a lesson's 用示範案例試一次) opens with the demo filled in; otherwise the fields start empty (docs/mockups run page #new)
      const demoSet = /^#demo(?:=([a-z]+))?$/.exec(window.location.hash);   // #demo, or #demo=<lesson domain> (N-55)
      const example = response.form.example;
      const base = initialState(response.form.fields, demoSet ? (demoSet[1] ? example?.sets?.[demoSet[1]]?.input ?? example?.input : example?.input) : undefined);
      const prefillText = sessionStorage.getItem(prefillKey);
      if (!prefillText) { setState(base); return; }
      try {
        const parsed = JSON.parse(prefillText) as { values?: Record<string, unknown>; needs?: string[]; from?: { name?: string; approved?: boolean } };
        const validKeys = new Set(response.form.fields.map(fieldKey));
        const coerced: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(parsed.values ?? {})) {
          const field = response.form.fields.find((candidate) => fieldKey(candidate) === key);
          if (!field) continue;   // not a real field of this run's form: dropped, not claimed as carried (N-13)
          coerced[key] = field.kind === "list" ? (Array.isArray(value) ? value : [String(value)]) : Array.isArray(value) ? value.join("\n") : value;   // N-21
        }
        setState({ ...base, ...coerced });
        setPrefillNeeds((parsed.needs ?? []).filter((need) => validKeys.has(need)));
        if (parsed.from?.name) setPrefillNotice(`從「${parsed.from.name}分析」帶入 ${Object.keys(coerced).length} 格；紅字的要你補（引用自${parsed.from.approved ? "已核准的版本" : "尚未核准的草稿"}）`);   // N-45
      } catch { setState(base); }
    }).catch((reason) => { if (active) setError(String(reason)); });
    apiFetch<Estimate>(`/methods/${encodeURIComponent(methodId)}/estimate`).then((found) => { if (active) setEstimate(found); }).catch(() => undefined);
    return () => { active = false; };
  }, [methodId]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // card ⑧'s own target forms (N-13/N-14): what it can honestly carry and the target's Chinese labels for what it still needs
    const nextSteps = (completed?.result?.next_steps ?? []) as Array<{ method_id?: string }>;
    const stepMethodIds = [...new Set(nextSteps.map((step) => step.method_id).filter((id): id is string => typeof id === "string"))];
    if (!stepMethodIds.length) return;
    let active = true;
    Promise.all(stepMethodIds.map((id) => apiFetch<FormResponse>(`/methods/${encodeURIComponent(id)}/form`).then((response) => [id, response.form.fields] as const).catch(() => [id, []] as const)))
      .then((pairs) => { if (active) setStepForms((previous) => ({ ...previous, ...Object.fromEntries(pairs) })); });
    return () => { active = false; };
  }, [completed?.result?.interpretation_id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    apiFetch<Project[]>("/projects").then((list) => {
      if (!active) return;
      setProjects([...list].sort(byActivity));
      if (given && !list.some((item) => item.project_id === given)) { setProjectId(""); setError("網址裡的專案找不到了（可能已經刪除）；這次分析會開一個新專案。"); }
    }).catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [given]);

  // N-60: a ?rerun= link stays in the address after the reminder is fulfilled or dropped elsewhere; a stale one
  // would otherwise be sent on every submit and refused every time (RERUN_NOT_OPEN). Drop it silently on load.
  useEffect(() => {
    if (!rerunId || !given) return;
    let active = true;
    apiFetch<Array<{ rerun_id: string; fulfilled_by: string | null }>>(`/projects/${encodeURIComponent(given)}/reruns`)
      .then((list) => { if (active && !list.some((item) => item.rerun_id === rerunId && item.fulfilled_by === null)) setRerun(""); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [given, rerunId]);

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

  // Independent of `form`: N-58 needs these to show a saved result even when the tool's own form failed to load.
  const current = projects?.find((item) => item.project_id === projectId);
  const project = projectId && current ? { id: projectId, name: current.name } : undefined;
  const redo = (reason: string) => {
    if (!completed?.interpretation_id) return;
    setRevision({ of: completed.interpretation_id, reason });
    document.getElementById("input")?.scrollIntoView({ behavior: "smooth" });
  };
  // ResultPage needs the full form only to show the input card again (redo/rerun); a saved result renders without it.
  const resultCard = (content: React.ReactNode) => completed?.result && <ResultPage result={completed.result} record={completed.record} manifest={completed.manifest} gateResults={completed.gate_results} recordGates={completed.record_gate_results ?? []} display={form?.display} lesson={lesson} lessons={lessons} fields={form?.form.fields ?? []} names={names} stepForms={stepForms} family={family} project={project} analyzedAt={completed.created_at} judgment={completed.judgment} approval={completed.approval} costTwd={completed.cost_twd} oldVersion={isOldVersion(completed.result, completed.gate_results, completed.schema_version)} compareWith={previous ?? completed.revision?.of ?? completed.rerun_of ?? null} onRedo={redo}>{content}</ResultPage>;
  if (!form) {
    // N-58: the tool's own /methods/{id}/form failed (e.g. retired) but this analysis already has a stored result --
    // that result is still worth showing; only the input card (which needs the form's fields) is dropped.
    if (completed?.result) return resultCard(<p className="sub">這個工具目前不能再執行；結果照存。</p>);
    return <div className="card"><p>{error || "載入中…"}</p></div>;
  }
  const name = form.display?.name_zh ?? methodId;
  const example = form.form.example?.input;
  const fill = () => { if (example) { setState(initialState(form.form.fields, example)); setSuggested([]); setLeft([]); setError(""); } else setError("此工具沒有示範案例"); };
  const clear = () => { setState(initialState(form.form.fields)); setSuggested([]); setLeft([]); setError(""); };
  const count = form.form.fields.length;
  const numeral = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九"][count] ?? String(count);
  // A new project for this analysis: the typed 專案名稱 (N-83), or else the tool and the minute. Names are unique
  // per workspace (409): a second one in the same minute (or the same typed name) becomes "… (2)".
  const newProject = async (): Promise<string> => {
    const base = customName.trim() || `${name} ${formatTime(new Date().toISOString())}`;
    for (let attempt = 1; attempt <= 20; attempt++) {
      try {
        const created = await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name: attempt === 1 ? base : `${base} (${attempt})`, purpose: `使用 ${name} 進行分析`, data_classification: "Confidential" }) });
        setProjects((list) => [created, ...(list ?? [])]); setProjectId(created.project_id);
        return created.project_id;
      } catch (reason) { if (!(reason instanceof ApiError && reason.status === 409)) throw reason; }
    }
    throw new Error("同一分鐘開了太多同名專案，請稍後再按一次");
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
      sessionStorage.removeItem(prefillKey);   // N-22: kept until a run of it actually launches, so a reload or a detour through the tool page first does not lose it
      setPrefillNotice(""); setPrefillNeeds([]);
      setPrevious(revision?.of ?? (rerun ? completed?.interpretation_id ?? analysis?.interpretation_id ?? null : null));
      setError(""); setCompleted(null); setLeft([]); setLastFailed(false); setRevision(null); setRerun(""); refill.current = false; setPendingId(accepted.interpretation_id);
      window.history.replaceState(null, "", analysisHref(target, accepted.interpretation_id));
    } catch (reason) { setError(humanError(reason)); }
    finally { setStarting(false); }
  };
  // ResultPage's own header replaces this one once there is a result.
  const inputCard = (
    <RunInputCard numeral={numeral}>
      <details className="mb8"><summary>手邊有一段描述？貼上，系統先幫你填格子</summary><LazyFill methodId={methodId} fields={form.form.fields} state={state} onState={setState} onSuggested={setSuggested} /></details>
      {suggested.length > 0 && <div className="how"><b>AI 幫你填了</b>{suggested.join("、")}；請逐格核對。<button type="button" className="btn" onClick={() => setSuggested([])}>我已確認這些格子</button></div>}
      {left.length > 0 && <p className="sub">這次分析的「{left.join("、")}」沒辦法自動帶回格子；要再分析，請重新填這幾格。</p>}
      {revision && <p className="mocknote" role="status">依退回原因重做：「{revision.reason}」。改好格子按「執行分析」，AI 會依原因重做；退回的那一版保留。<button type="button" className="btn ghost" onClick={() => setRevision(null)}>不重做了</button></p>}
      {rerun && <p className="mocknote" role="status">到期重跑：更新格子裡的數字，按「執行分析」；跑完會和上一次並排比較。<button type="button" className="btn ghost" onClick={() => setRerun("")}>不重跑了</button></p>}
      <p className="sub mb8">存到：{project ? <>專案「<Link href={projectHref(project.id)}>{project.name}</Link>」</> : <>新專案，<label>名稱：<input type="text" aria-label="新專案名稱" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={`留白 = ${name}加上時間`} /></label>（按「執行分析」時建立）</>}</p>
      {projects && projects.length > 0 && !pendingId && !revision && !rerun && <details className="mb8"><summary>改存到別的專案</summary><div className="btns mt6">
        <button type="button" className={`btn${projectId ? " ghost" : " primary"}`} aria-pressed={!projectId} onClick={() => setProjectId("")}>新專案</button>
        {projects.slice(0, 8).map((item) => <button type="button" key={item.project_id} className={`btn${projectId === item.project_id ? " primary" : " ghost"}`} aria-pressed={projectId === item.project_id} onClick={() => setProjectId(item.project_id)}>{item.name}</button>)}
      </div>{projects.length > 8 && <p className="sub mb0">更早的專案：到「我的專案」打開它，按「在這個專案再用「{name}」分析一次」。</p>}</details>}
      {prefillNotice && <p className="mocknote" role="status">{prefillNotice}</p>}
      <MethodForm fields={form.form.fields} state={state} onState={setState} example={example} onFill={fill} onClear={clear} label={`${name}的${numeral}個格子`} busy={Boolean(pendingId) || starting} layered={methodId === ICEBERG_ID} needs={prefillNeeds}
        onSubmit={async (payload) => {
        if (pendingId || starting) return;
        if (suggested.length) { setError("請先確認 AI 幫你填的格子"); return; }
        // N-68: a redo (退回重做) must reuse the earlier record; fields the restore could not refill are still
        // empty here, and submitting anyway would silently redo against incomplete, not the same, data.
        if (revision && left.length) { setError(`「${left.join("、")}」要先補回，重做才會用同一份資料`); return; }
        setError(""); setConfirming(payload);   // nothing is spent yet: the cost is said first (mock: 你確認才花)
      }} />
      {confirming && !pendingId && <div className="finding warn" role="status"><b>要花多少</b>{estimate ? `${costLine(estimate.tokens, estimate.twd)}${estimate.based_on ? `（依你最近 ${estimate.based_on} 次）` : "（第一次跑的估計）"}${estimate.tokens_max ? `，最多 ${costLine(estimate.tokens_max, estimate.twd_max).replace(/^約 /, "")}（要重試一次時）` : ""}` : "估計還沒載入"}，{runMinutes(estimate)}；按「確認執行」才開始、才花錢。
        <div className="btns mt6"><button type="button" className="btn primary big" disabled={starting} onClick={() => { const payload = confirming; setConfirming(null); void launch(payload); }}>確認執行</button><button type="button" className="btn ghost" onClick={() => setConfirming(null)}>取消</button></div></div>}
      {pendingId && <p role="status" className="sub mt10">正在分析，{runMinutes(estimate)}（整頁結果：結論、逐層解讀、圖、方案）；完成後結果會出現在下面。關掉這頁也會繼續，之後到「我的專案」打開。</p>}{error && <p className="error">{error}</p>}
    </RunInputCard>
  );
  if (completed?.result) return resultCard(inputCard);
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
