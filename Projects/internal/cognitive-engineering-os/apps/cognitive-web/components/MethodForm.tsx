"use client";

import { useEffect, useState } from "react";
import React from "react";
import { apiFetch } from "../lib/api";

import { FormField, FormOption, collectDefs, fieldKey, setField, toPayload } from "../lib/form-model";

type Change = (value: unknown) => void;
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const optionsOf = (field: FormField): FormOption[] => field.options ?? (field.choices ?? []).map((choice) => ({ value: choice, label: choice }));
function childList(fields: FormField[], state: Record<string, unknown>, onChange: (state: Record<string, unknown>) => void, defs: Record<string, FormField>, conditions?: FormField["conditions"], depth = 0) {
  return fields.filter((field) => !["const", "provenance"].includes(field.kind ?? "")).map((field) => {
    const key = fieldKey(field);
    const forbidden = (conditions?.[key] ?? []).some((rule) => rule.mode === "forbidden" && state[rule.key] === rule.equals);
    return forbidden ? null : <FieldEditor key={key || field.label} field={field} value={state[key]} onChange={(next) => onChange({ ...state, [key]: next })} defs={defs} siblings={state} depth={depth} />;
  });
}

function UpstreamEditor({ field, value, onChange, siblings }: { field: FormField; value: unknown; onChange: Change; siblings: Record<string, unknown> }) {
  const methodId = field.method_id ?? field.methods?.[String(siblings[field.select_by ?? ""] ?? "")];
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { if (!methodId) return; let active = true; apiFetch<{ form: { fields: FormField[] } }>(`/methods/${encodeURIComponent(methodId)}/form`).then((response) => { if (active) setFormFields(response.form.fields); }).catch((reason) => { if (active) setError(String(reason)); }); return () => { active = false; }; }, [methodId]);
  const source = asObject(value);
  const data = source.methodId === methodId ? asObject(source.data) : {};
  return <fieldset className="field"><legend>{field.label ?? fieldKey(field)}（上游方法）</legend>{!methodId && <p>先選擇來源類型。</p>}{error && <p role="alert">{error}</p>}{methodId && formFields.length > 0 && childList(formFields, data, (next) => onChange({ methodId, data: next }), collectDefs(formFields))}</fieldset>;
}

function FieldEditor({ field, value, onChange, defs, siblings = {}, depth = 0 }: { field: FormField; value: unknown; onChange: Change; defs: Record<string, FormField>; siblings?: Record<string, unknown>; depth?: number }) {
  const kind = field.kind ?? "text";
  const label = field.label ?? fieldKey(field);
  const options = optionsOf(field);
  const current = asObject(value);
  if (kind === "const" || kind === "provenance") return null;
  if (kind === "upstream") return <UpstreamEditor field={field} value={value} onChange={onChange} siblings={siblings} />;
  if (kind === "bool") return <label className="field"><span>{label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /></label>;
  if (kind === "choice" || kind === "multi_choice") return <fieldset className="field"><legend>{label}</legend><div className="grid">{options.map((option) => { const selected = kind === "choice" ? value === option.value : Array.isArray(value) && value.includes(option.value); return <button type="button" className={selected ? "" : "secondary"} key={String(option.value)} onClick={() => onChange(kind === "choice" ? option.value : selected ? (value as unknown[]).filter((item) => item !== option.value) : [...(Array.isArray(value) ? value : []), option.value])}>{option.label ?? String(option.value)}</button>; })}</div></fieldset>;
  if (kind === "list") {
    const items = Array.isArray(value) ? value : [];
    return <fieldset className="field"><legend>{label}</legend>{items.map((item, index) => <div className="grid" key={index}><input aria-label={`${label} ${index + 1}`} type={field.item_kind === "number" ? "number" : "text"} value={String(item ?? "")} onChange={(event) => onChange(items.map((old, i) => i === index ? field.item_kind === "number" ? Number(event.target.value) : event.target.value : old))} /><button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))}>刪除</button></div>)}<button type="button" className="secondary" onClick={() => onChange([...items, field.item_kind === "number" ? 0 : ""])}>＋ 新增一項</button></fieldset>;
  }
  if (kind === "group" || kind === "recursive") {
    const target = kind === "recursive" && field.target ? defs[field.target] : field;
    if (depth >= 12 || !target) return <p>層數過深或欄位結構不可用。</p>;
    return <fieldset className="field"><legend>{label}</legend>{target.kind === "variant" ? <FieldEditor field={target} value={value} onChange={onChange} defs={defs} depth={depth + 1} /> : childList(target.fields ?? target.children ?? [], current, onChange, defs, target.conditions, depth + 1)}</fieldset>;
  }
  if (kind === "variant") {
    const branch = options.find((option) => option.value === current[field.synthetic ? "__variant" : field.discriminator ?? ""]) ?? (field.synthetic ? options.find((option) => (option.required_keys ?? []).length > 0 && (option.required_keys ?? []).every((key) => key in current)) : undefined) ?? options[0];
    const discriminator = field.synthetic ? "__variant" : field.discriminator ?? "type";
    return <fieldset className="field"><legend>{label}</legend><div className="grid">{options.map((option) => <button type="button" className={branch?.value === option.value ? "" : "secondary"} key={String(option.value)} onClick={() => onChange({ [discriminator]: option.value })}>{option.label ?? String(option.value)}</button>)}</div>{branch && childList(branch.fields ?? [], current, onChange, defs, branch.conditions, depth + 1)}</fieldset>;
  }
  if (kind === "rows") {
    const rows = Array.isArray(value) ? value : [];
    return <fieldset className="field"><legend>{label}</legend>{rows.map((row, index) => <div className="card" key={index}><span>第 {index + 1} 列</span><button type="button" disabled={rows.length <= (field.minItems ?? 0)} onClick={() => onChange(rows.filter((_, i) => i !== index))}>刪除</button><FieldEditor field={field.item ?? { kind: "group", fields: [] }} value={row} onChange={(next) => onChange(rows.map((old, i) => i === index ? next : old))} defs={defs} depth={depth + 1} /></div>)}<button type="button" disabled={field.maxItems !== undefined && rows.length >= field.maxItems} onClick={() => onChange([...rows, {}])}>＋ 新增一列</button></fieldset>;
  }
  if (kind === "fixed_rows") {
    const rows = (field.rows ?? []) as FormOption[];
    const values = Array.isArray(value) ? value : [];
    return <fieldset className="field"><legend>{label}</legend>{rows.map((row, index) => { const existing = asObject(field.row_key ? values.find((item) => asObject(item)[field.row_key!] === row.value) : values[index]); const rowValue = { ...(field.row_key ? { [field.row_key]: row.value } : {}), ...existing }; return <div className="card" key={index}><strong>{row.label ?? String(row.value)}</strong>{childList(row.fields ?? [], rowValue, (next) => onChange(rows.map((item, i) => i === index ? next : asObject(field.row_key ? values.find((entry) => asObject(entry)[field.row_key!] === item.value) : values[i]))), defs, row.conditions, depth + 1)}</div>; })}</fieldset>;
  }
  if (kind === "map") return <label className="field"><span>{label}</span><textarea rows={4} value={Object.entries(current).map(([key, item]) => `${key}: ${item}`).join("\n")} onChange={(event) => { const map: Record<string, unknown> = {}; for (const line of event.target.value.split(/\r?\n/)) { const match = line.match(/^([^:：]+)[:：]\s*(.*)$/); if (match) map[match[1].trim()] = field.value_kind === "number" ? Number(match[2]) : match[2].trim(); } onChange(map); }} /></label>;
  if (kind === "json") return <label className="field"><span>{label}（原始 JSON）</span><textarea rows={4} defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)} onBlur={(event) => { try { onChange(JSON.parse(event.target.value)); } catch { /* keep previous valid value */ } }} /></label>;
  return <label className="field"><span>{label}{field.required ? " *" : ""}</span><input type={kind === "number" ? "number" : "text"} min={field.min} max={field.max} value={String(value ?? "")} onChange={(event) => onChange(kind === "number" ? Number(event.target.value) : event.target.value)} /></label>;
}

export function MethodForm({ fields, state, onState, onSubmit }: { fields: FormField[]; state: Record<string, unknown>; onState: (state: Record<string, unknown>) => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const defs = collectDefs(fields);
  const [submitError, setSubmitError] = useState("");
  return <form onSubmit={async (event) => { event.preventDefault(); setSubmitError(""); try { const payload = toPayload(fields, state); for (const field of fields.filter((candidate) => candidate.kind === "upstream")) { const key = fieldKey(field); const source = asObject(state[key]); const methodId = field.method_id ?? field.methods?.[String(state[field.select_by ?? ""] ?? "")]; if (!methodId || source.methodId !== methodId) { if (field.required) throw new Error(`${field.label ?? key} 需要先填上游方法`); continue; } const form = await apiFetch<{ form: { fields: FormField[] } }>(`/methods/${encodeURIComponent(methodId)}/form`); const upstream = await apiFetch<{ record: Record<string, unknown> }>(`/methods/${encodeURIComponent(methodId)}/invoke`, { method: "POST", body: JSON.stringify(toPayload(form.form.fields, asObject(source.data))) }); payload[key] = upstream.record; } onSubmit(payload); } catch (error) { setSubmitError(String(error)); } }}><div className="card">{fields.map((field) => { const key = fieldKey(field); return <FieldEditor key={key} field={field} value={state[key]} onChange={(value) => onState(setField(state, key, value))} defs={defs} siblings={state} />; })}{submitError && <p role="alert">{submitError}</p>}<button type="submit">開始解讀</button></div></form>;
}
