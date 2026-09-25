export type FormOption = { value: unknown; label?: string };
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
    const fallback = field.default ?? (field.kind === "bool" ? false : field.kind === "list" || field.kind === "rows" || field.kind === "multi_choice" ? [] : field.kind === "group" ? {} : "");
    return [key, example[key] ?? fallback];
  }));
}

export function setField(state: Record<string, unknown>, name: string, value: unknown): Record<string, unknown> {
  return { ...state, [name]: value };
}

export function toPayload(fields: FormField[], state: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const key = fieldKey(field);
    const value = state[key];
    if (key && value !== undefined && value !== "") payload[key] = value;
  }
  return payload;
}

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
