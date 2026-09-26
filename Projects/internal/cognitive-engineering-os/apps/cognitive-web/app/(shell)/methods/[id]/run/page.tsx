"use client";

import { useEffect, useRef, useState } from "react";
import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../../lib/api";
import { FormField, initialState } from "../../../../../lib/form-model";
import { LazyFill } from "../../../../../components/LazyFill";
import { MethodForm } from "../../../../../components/MethodForm";
import { ResultPage } from "../../../../../components/result/ResultPage";

type FormResponse = { method_id: string; display?: { name_zh?: string }; form: { fields: FormField[]; example?: { scenario?: string; input?: Record<string, unknown> } } };
type Project = { project_id: string; name: string };
type InterpretationStatus = { status: "PENDING" | "FAILED" | "DONE"; result?: any; record?: Record<string, unknown>; manifest?: Array<{ id: string; kind?: string; path?: string; value?: string; source_id?: string; sha256?: string }>; gate_results?: Array<{ gate_id: string; status: string }>; error?: string };

export default function MethodPage() {
  const params = useParams<{ id: string }>();
  const methodId = decodeURIComponent(params.id);
  const [form, setForm] = useState<FormResponse | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const projectSetup = useRef<{ methodId: string; promise: Promise<Project[]> } | null>(null);
  const [completed, setCompleted] = useState<InterpretationStatus | null>(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    apiFetch<FormResponse>(`/methods/${encodeURIComponent(methodId)}/form`).then((response) => {
      if (!active) return;
      setForm(response);
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
    if (!form) return;
    let active = true;
    if (projectSetup.current?.methodId !== methodId) {
      const promise = apiFetch<Project[]>("/projects").then(async (existing) => {
        if (existing.length) return existing;
        const name = `${form.display?.name_zh ?? methodId} ${new Date().toLocaleDateString("sv-SE")}`;
        const created = await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name, purpose: `使用 ${form.display?.name_zh ?? methodId} 進行分析`, data_classification: "Confidential" }) });
        return [created];
      });
      projectSetup.current = { methodId, promise };
    }
    projectSetup.current.promise.then((list) => { if (active) { setProjects(list); setProjectId((selected) => selected || list[0]?.project_id || ""); } }).catch((reason) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [methodId, form?.display?.name_zh]);

  useEffect(() => {
    if (!pendingId) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const update = await apiFetch<InterpretationStatus>(`/interpretations/${pendingId}`);
        if (!active) return;
        if (update.status === "DONE") { setCompleted(update); setPendingId(""); }
        if (update.status === "FAILED") { setError(update.error || "解讀失敗"); setPendingId(""); }
      } catch (reason) { if (active) { setError(String(reason)); setPendingId(""); } }
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [pendingId]);

  if (!form) return <div className="card"><p>{error || "載入中…"}</p></div>;
  const name = form.display?.name_zh ?? methodId;
  const example = form.form.example?.input;
  const fill = () => { if (example) { setState(initialState(form.form.fields, example)); setSuggested([]); setError(""); } else setError("此工具沒有示範案例"); };
  const clear = () => { setState(initialState(form.form.fields)); setSuggested([]); setError(""); };
  // docs/mockups/iceberg-result-mock.html: the header, then the fields you fill (they stay above the result), then the
  // result -- ResultPage's own header replaces this one once there is a result.
  const inputCard = (
    <div className="card cta" id="input">
      <h2>你的案例<small>從上往下填；填不出來的留白</small></h2>
      <div className="how"><b>怎麼讀</b>每格一句提示；空的格子裡有例子。<b>你要做的</b>填好按「執行分析」；你確認才開始、才花錢。</div>
      <details className="mb10"><summary>手邊有一段描述？貼上，系統先幫你填格子</summary><LazyFill methodId={methodId} fields={form.form.fields} state={state} onState={setState} onSuggested={setSuggested} /></details>
      {suggested.length > 0 && <div className="how"><b>AI 幫你填了</b>{suggested.join("、")}；請逐格核對。<button type="button" className="btn" onClick={() => setSuggested([])}>我已確認這些格子</button></div>}
      <MethodForm fields={form.form.fields} state={state} onState={setState} example={example} onFill={fill} onClear={clear} label={`${name}的格子`} busy={Boolean(pendingId)} onSubmit={async (payload) => {
        if (pendingId) return;
        if (suggested.length) { setError("請先確認 AI 幫你填的格子"); return; }
        if (!projectId) { setError("專案尚未準備好"); return; }
        try {
          const accepted = await apiFetch<{ interpretation_id: string; status: string }>(`/methods/${encodeURIComponent(methodId)}/interpret`, { method: "POST", body: JSON.stringify({ ...payload, project_id: projectId }) });
          if (accepted.status !== "PENDING") throw new Error(`未預期的解讀狀態：${accepted.status}`);
          setError(""); setCompleted(null); setPendingId(accepted.interpretation_id);
        } catch (reason) { setError(String(reason)); }
      }} />
      {pendingId && <p role="status" className="sub mt10">正在分析，約一分鐘；完成後結果會出現在下面。</p>}{error && <p className="error">{error}</p>}
    </div>
  );
  if (completed?.result) return <ResultPage result={completed.result} record={completed.record} manifest={completed.manifest} gateResults={completed.gate_results} display={form.display}>{inputCard}</ResultPage>;
  return <>
    <div className="card">
      <div className="crumbs"><Link href={`/methods/${encodeURIComponent(methodId)}`}>{name}</Link> › 填寫與結果</div>
      <div className="top"><div><h1>{name}分析</h1></div><Link className="howto" href={`/methods/${encodeURIComponent(methodId)}`}>它做什麼？</Link></div>
      <div className="status"><span className="pill">還沒執行</span><span>專案：</span>{projects.map((project) => <button type="button" key={project.project_id} className={`btn${projectId === project.project_id ? " primary" : " ghost"}`} aria-pressed={projectId === project.project_id} onClick={() => setProjectId(project.project_id)}>{project.name}</button>)}{!projects.length && <span>正在準備專案…</span>}</div>
      <div className="how"><b>怎麼讀</b>先填下面的格子，按「執行分析」；結果出現在格子下方。<b>你要做的</b>填不出來的留白；執行之前不花錢。</div>
    </div>
    {inputCard}
    <div className="card" id="result">
      <h2>結果</h2>
      <div className="how"><b>怎麼讀</b>按「執行分析」後，結果出現在這裡。<b>你要做的</b>先填上面的格子。</div>
      <p className="sub mb0">執行之前不花錢；按下去才開始分析。</p>
    </div>
  </>;
}
