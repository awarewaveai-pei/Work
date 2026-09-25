export type FormOption = { value: unknown; label?: string; fields?: FormField[]; conditions?: Conditions; required_keys?: string[] };
export type Conditions = Record<string, Array<{ mode: string; key: string; equals: unknown }>>;
export type FormField = {
  key?: string;
  name?: string;
  label?: string;
  hint?: string;
  kind?: string;
  required?: boolean;
  default?: unknown;
  value?: unknown;
  options?: FormOption[];
  choices?: string[];
  fields?: FormField[];
  children?: FormField[];
  item?: FormField;
  rows?: unknown[];
  row_key?: string | null;
  min_rows?: number;
  item_kind?: string;
  value_kind?: string;
  conditions?: Conditions;
  target?: string;
  def_id?: string;
  synthetic?: boolean;
  flatten?: boolean;
  nullable?: boolean;
  epistemic_type?: string;
  method_id?: string;
  methods?: Record<string, string>;
  select_by?: string;
  minItems?: number;
  maxItems?: number;
  integer?: boolean;
  min?: number;
  max?: number;
  discriminator?: string | null;
};

export function fieldKey(field: FormField): string {
  return field.key ?? field.name ?? "";
}

export function initialState(fields: FormField[], example: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => {
    const key = fieldKey(field);
    const fallback = field.default ?? (field.kind === "bool" ? false : field.kind === "list" || field.kind === "rows" || field.kind === "multi_choice" ? [] : field.kind === "group" || field.kind === "variant" ? {} : "");
    return [key, example[key] ?? fallback];
  }));
}

export function setField(state: Record<string, unknown>, name: string, value: unknown): Record<string, unknown> {
  return { ...state, [name]: value };
}

const ROW_PROVENANCE = { epistemic_type: "HUMAN_OPINION", authorship_state: "HUMAN_ORIGINAL", locked: null };
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function empty(value: unknown): boolean { return value == null || typeof value === "string" && !value.trim() || Array.isArray(value) && !value.length || typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length; }
export function collectDefs(fields: FormField[], defs: Record<string, FormField> = {}): Record<string, FormField> {
  for (const field of fields) {
    if (field.def_id && !defs[field.def_id]) defs[field.def_id] = field;
    collectDefs(field.fields ?? [], defs);
    for (const option of field.options ?? []) collectDefs(option.fields ?? [], defs);
    for (const row of field.rows ?? []) collectDefs((row as FormOption).fields ?? [], defs);
    if (field.item) collectDefs([field.item], defs);
  }
  return defs;
}
function serializeValue(field: FormField, value: unknown, defs: Record<string, FormField>, depth = 0): unknown {
  if (depth > 12) return value;
  const kind = field.kind;
  if (kind === "recursive") return field.target && defs[field.target] ? serializeValue(defs[field.target], value, defs, depth + 1) : value;
  if (kind === "provenance") return { ...ROW_PROVENANCE, ...(field.epistemic_type ? { epistemic_type: field.epistemic_type } : {}) };
  if (kind === "const") return field.value;
  if (kind === "variant") {
    const source = object(value); const options = field.options ?? [];
    if (!options.length) return source;
    const chosen = field.synthetic ? options.find((option) => option.value === source.__variant) ?? options.find((option) => (option.required_keys ?? []).every((key) => key in source)) ?? options[0] : options.find((option) => option.value === source[field.discriminator ?? ""]) ?? options[0];
    const branch = serializeFields(chosen.fields ?? [], source, defs, chosen.conditions, depth + 1);
    return field.synthetic ? branch : { [field.discriminator ?? "type"]: chosen.value, ...branch };
  }
  if (kind === "group") return serializeFields(field.fields ?? [], object(value), defs, field.conditions, depth + 1);
  if (kind === "rows") return (Array.isArray(value) ? value : []).map((item) => serializeValue(field.item ?? { kind: "json" }, item, defs, depth + 1));
  if (kind === "fixed_rows") {
    const values = Array.isArray(value) ? value : [];
    const rows = (field.rows ?? []) as FormOption[];
    const sources = rows.map((row, index) => object(field.row_key ? values.find((item) => object(item)[field.row_key!] === row.value) : values[index]));
    let last = -1;
    rows.forEach((row, index) => { if ((row.fields ?? []).some((child) => !["const", "provenance"].includes(child.kind ?? "") && !empty(sources[index][fieldKey(child)]))) last = index; });
    const count = Math.max(field.min_rows ?? rows.length, last + 1);
    return rows.slice(0, count).map((row, index) => ({ ...(field.row_key ? { [field.row_key]: row.value } : {}), ...serializeFields(row.fields ?? [], sources[index], defs, row.conditions, depth + 1) }));
  }
  return value;
}
function serializeFields(fields: FormField[], state: Record<string, unknown>, defs: Record<string, FormField>, conditions?: Conditions, depth = 0): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === "upstream") continue;
    if (field.kind === "variant" && field.flatten) { Object.assign(output, serializeValue(field, state, defs, depth)); continue; }
    const key = fieldKey(field); if (!key) continue;
    const raw = state[key] === undefined ? field.default : state[key];
    if (raw === undefined && !["provenance", "const", "fixed_rows", "variant"].includes(field.kind ?? "")) continue;
    if (raw === null && field.nullable) { if (field.required) output[key] = null; continue; }
    const serialized = serializeValue(field, raw, defs, depth);
    if (empty(serialized) && !field.required) continue;
    output[key] = serialized;
  }
  for (const [key, rules] of Object.entries(conditions ?? {})) if (rules.some((rule) => rule.mode === "forbidden" && output[rule.key] === rule.equals)) delete output[key];
  return output;
}
export function toPayload(fields: FormField[], state: Record<string, unknown>): Record<string, unknown> { return serializeFields(fields, state, collectDefs(fields)); }

export function applyLazyLines(text: string, fields: FormField[], state: Record<string, unknown>): { state: Record<string, unknown>; missing: string[] } {
  const next = { ...state };
  const names = new Map(fields.flatMap((field) => {
    const key = fieldKey(field);
    return [[key.toLowerCase(), key], [(field.label ?? "").toLowerCase(), key]] as Array<[string, string]>;
  }).filter(([name]) => Boolean(name)));
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const name = names.get(line.slice(0, separator).trim().toLowerCase());
    if (name) next[name] = line.slice(separator + 1).trim();
  }
  return { state: next, missing: fields.filter((field) => { const key = fieldKey(field); return field.required && (next[key] === undefined || next[key] === ""); }).map(fieldKey) };
}
