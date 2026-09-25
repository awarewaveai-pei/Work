"use client";

import { useEffect, useRef, useState } from "react";
import React from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { FormField, initialState } from "../../../lib/form-model";
import { LazyFill } from "../../../components/LazyFill";
import { MethodForm } from "../../../components/MethodForm";
import { ResultPage } from "../../../components/result/ResultPage";

type FormResponse = { method_id: string; display?: { name_zh?: string }; form: { fields: FormField[]; example?: { scenario?: string; input?: Record<string, unknown> } } };
type Project = { project_id: string; name: string };
type InterpretationStatus = { status: "PENDING" | "FAILED" | "DONE"; result?: any; error?: string };

export default function MethodPage() {
  const params = useParams<{ id: string }>();
  const methodId = decodeURIComponent(params.id);
  const [form, setForm] = useState<FormResponse | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const projectSetup = useRef<{ methodId: string; promise: Promise<Project[]> } | null>(null);
  const [result, setResult] = useState<any>();
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    apiFetch<FormResponse>(`/methods/${encodeURIComponent(methodId)}/form`).then((response) => {
      if (!active) return;
      setForm(response);
      setState(initialState(response.form.fields, response.form.example?.input));
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
        if (update.status === "DONE") { setResult(update.result); setPendingId(""); }
        if (update.status === "FAILED") { setError(update.error || "解讀失敗"); setPendingId(""); }
      } catch (reason) { if (active) { setError(String(reason)); setPendingId(""); } }
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [pendingId]);

  if (result) return <ResultPage result={result} />;
  if (!form) return <div className="card"><p>{error || "載入中…"}</p></div>;
  return <div>
    <h1>{form.display?.name_zh ?? methodId}</h1>
    <div className="card"><h2>我的專案</h2><div className="grid">{projects.map((project) => <button type="button" key={project.project_id} className={projectId === project.project_id ? "" : "secondary"} onClick={() => setProjectId(project.project_id)}>{project.name}</button>)}</div>{!projects.length && <p>正在準備專案…</p>}</div>
    <LazyFill methodId={methodId} fields={form.form.fields} state={state} onState={setState} onSuggested={setSuggested} />
    {suggested.length > 0 && <div className="card"><p>AI_SUGGESTED：{suggested.join("、")}，請逐欄核對。</p><button type="button" onClick={() => setSuggested([])}>我已確認這些欄位</button></div>}
    <button type="button" className="secondary" onClick={() => { if (form.form.example?.input) { setState(initialState(form.form.fields, form.form.example.input)); setSuggested([]); setError(""); } else setError("此工具沒有示範案例"); }}>用示範案例試一次</button>
    <MethodForm fields={form.form.fields} state={state} onState={setState} onSubmit={async (payload) => {
      if (suggested.length) { setError("請先確認 AI_SUGGESTED 欄位"); return; }
      if (!projectId) { setError("專案尚未準備好"); return; }
      try {
        const accepted = await apiFetch<{ interpretation_id: string; status: string }>(`/methods/${encodeURIComponent(methodId)}/interpret`, { method: "POST", body: JSON.stringify({ ...payload, project_id: projectId }) });
        if (accepted.status !== "PENDING") throw new Error(`未預期的解讀狀態：${accepted.status}`);
        setError(""); setPendingId(accepted.interpretation_id);
      } catch (reason) { setError(String(reason)); }
    }} />
    {pendingId && <p role="status">正在解讀，完成後會自動顯示結果…</p>}{error && <p className="error">{error}</p>}
  </div>;
}
