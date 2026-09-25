"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { FormField, initialState } from "../../../lib/form-model";
import { LazyFill } from "../../../components/LazyFill";
import { MethodForm } from "../../../components/MethodForm";
import { ResultPage } from "../../../components/result/ResultPage";

type FormResponse = { method_id: string; form: { fields: FormField[]; example?: Record<string, unknown> } };
export default function MethodPage() {
  const params = useParams<{ id: string }>(); const methodId = decodeURIComponent(params.id);
  const [form, setForm] = useState<FormResponse | null>(null); const [state, setState] = useState<Record<string, unknown>>({}); const [result, setResult] = useState<any>(); const [projectId, setProjectId] = useState(""); const [error, setError] = useState("");
  useEffect(() => { apiFetch<FormResponse>(`/methods/${encodeURIComponent(methodId)}/form`).then((response) => { setForm(response); setState(initialState(response.form.fields, response.form.example)); }).catch((reason) => setError(String(reason))); }, [methodId]);
  if (result) return <ResultPage result={result} />;
  if (!form) return <div className="card"><p>{error || "載入中…"}</p></div>;
  return <div><h1>{methodId}</h1><label className="field card">Project ID<input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="先建立或貼上 Project UUID" required /></label><LazyFill methodId={methodId} fields={form.form.fields} state={state} onState={setState} /><button type="button" className="secondary" onClick={async () => { try { const demo = await apiFetch<Record<string, unknown>>(`/methods/${encodeURIComponent(methodId)}/demo`); setState((demo.input as Record<string, unknown>) ?? demo); } catch (reason) { setError(String(reason)); } }}>用示範案例試一次</button><MethodForm fields={form.form.fields} state={state} onState={setState} onSubmit={async (payload) => { try { const accepted = await apiFetch<{ interpretation_id: string }>(`/methods/${encodeURIComponent(methodId)}/interpret`, { method: "POST", body: JSON.stringify({ ...payload, project_id: projectId }) }); const done = await apiFetch<{ result: any }>(`/interpretations/${accepted.interpretation_id}`); setResult(done.result); } catch (reason) { setError(String(reason)); } }} />{error && <p className="error">{error}</p>}</div>;
}
