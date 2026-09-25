"use client";

import { FormField, fieldKey, setField, toPayload } from "../lib/form-model";

function FieldEditor({ field, value, onChange }: { field: FormField; value: unknown; onChange: (value: unknown) => void }) {
  const kind = field.kind ?? "text";
  const label = field.label ?? fieldKey(field);
  const options = field.options ?? (field.choices ?? []).map((choice) => ({ value: choice, label: choice }));
  if (kind === "const") return <input type="hidden" value={String(field.value ?? field.default ?? value ?? "")} />;
  if (kind === "provenance") return null;
  if (kind === "bool") return <label className="field"><span>{label}</span><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /></label>;
  if (kind === "choice") return <fieldset className="field"><legend>{label}</legend><div className="grid">{options.map((option) => { const selected = value === option.value; return <button type="button" className={selected ? "" : "secondary"} key={String(option.value)} onClick={() => onChange(option.value)}>{option.label ?? String(option.value)}</button>; })}</div></fieldset>;
  if (kind === "multi_choice") return <fieldset className="field"><legend>{label}</legend><div className="grid">{options.map((option) => { const selected = Array.isArray(value) && value.includes(option.value); return <button type="button" className={selected ? "" : "secondary"} key={String(option.value)} onClick={() => onChange(selected ? (value as unknown[]).filter((item) => item !== option.value) : [...(Array.isArray(value) ? value : []), option.value])}>{option.label ?? String(option.value)}</button>; })}</div></fieldset>;
  if (kind === "group") return <fieldset className="field"><legend>{label}</legend>{(field.fields ?? field.children ?? []).map((child) => { const key = fieldKey(child); const childState = value && typeof value === "object" ? value as Record<string, unknown> : {}; return <FieldEditor key={key} field={child} value={childState[key]} onChange={(childValue) => onChange({ ...childState, [key]: childValue })} />; })}</fieldset>;
  if (kind === "variant") return <fieldset className="field"><legend>{label}</legend><div className="grid">{options.map((option) => <button type="button" className="secondary" key={String(option.value)} onClick={() => onChange({ ...(value && typeof value === "object" ? value as Record<string, unknown> : {}), ...(field.discriminator ? { [field.discriminator]: option.value } : {}) })}>{option.label ?? String(option.value)}</button>)}</div></fieldset>;
  if (["list", "rows", "fixed_rows", "json", "map", "recursive", "upstream"].includes(kind)) return <label className="field"><span>{label}</span><textarea rows={4} value={typeof value === "string" ? value : JSON.stringify(value ?? (kind === "list" ? [] : {}), null, 2)} onChange={(event) => { try { onChange(JSON.parse(event.target.value)); } catch { onChange(kind === "list" ? event.target.value.split(/\r?\n/).filter(Boolean) : event.target.value); } }} /></label>;
  return <label className="field"><span>{label}{field.required ? " *" : ""}</span><input type={kind === "number" ? "number" : "text"} min={field.min} max={field.max} value={String(value ?? "")} onChange={(event) => onChange(kind === "number" ? (field.integer ? Number.parseInt(event.target.value, 10) : Number(event.target.value)) : event.target.value)} /></label>;
}

export function MethodForm({ fields, state, onState, onSubmit }: { fields: FormField[]; state: Record<string, unknown>; onState: (state: Record<string, unknown>) => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(toPayload(fields, state)); }}><div className="card">{fields.map((field) => { const key = fieldKey(field); return <FieldEditor key={key} field={field} value={state[key]} onChange={(value) => onState(setField(state, key, value))} />; })}<button type="submit">開始解讀</button></div></form>;
}
