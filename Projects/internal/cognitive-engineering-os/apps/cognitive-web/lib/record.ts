import { fieldKey, initialState, type FormField } from "./form-model";

const simple = (value: unknown) => ["string", "number", "boolean"].includes(typeof value);

// A method record, read back: the value at a manifest path ("r/events/0"), a value as text, and the form's fields
// refilled from a saved record.
export function recordValue(record: Record<string, unknown>, id: string): unknown {
  if (!id.startsWith("r/")) return undefined;
  let value: unknown = record;
  for (const part of id.slice(2).split("/")) value = Array.isArray(value) ? value[Number(part)] : value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  return value;
}
const partsOf = (field?: FormField): FormField[] => (field ? field.fields ?? field.children ?? (field.item ? partsOf(field.item) : []) : []);
// The system's own parts of a row (who wrote it, a structured tier): not what the person filled in.
const UNSHOWN = new Set(["provenance", "json"]);

/** The form field a manifest path ("r/factors/0/statement") points at: a row index steps into the row, a key into the part. */
export function fieldAt(fields: FormField[], id: string): FormField | undefined {
  const [top, ...rest] = id.slice(2).split("/");
  let field = fields.find((candidate) => fieldKey(candidate) === top);
  for (const part of rest) field = /^\d+$/.test(part) ? field?.item ?? field : partsOf(field).find((candidate) => fieldKey(candidate) === part);
  return field;
}

/** A cited path, moved up out of a system part to the row that holds it (a citation of r/factors/0/provenance showed
 *  「HUMAN_ORIGINAL；HUMAN_OPINION」): what the person filled in is the row. */
export function shownPath(fields: FormField[], id: string): string {
  let path = id;
  while (path.split("/").length > 2 && UNSHOWN.has(fieldAt(fields, path)?.kind ?? "")) path = path.slice(0, path.lastIndexOf("/"));
  return path;
}

/** What you filled in, as text, never as JSON (2026-10-14: a SWOT factor was cited as its raw object, provenance and all):
 *  a list reads as its items; a row as 「label：value」 for each part the form shows; a choice as its option's label.
 *  ``field``: what fieldAt finds for the path; without it a row reads as its plain values. */
export function plain(value: unknown, field?: FormField): string {
  if (Array.isArray(value)) return value.map((item) => plain(item, field?.item ?? field)).filter(Boolean).join("；") || "（沒填）";
  if (value === undefined || value === null || value === "") return "（沒填）";
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const parts = partsOf(field).filter((part) => !UNSHOWN.has(part.kind ?? ""));
    const shown = parts.length
      ? parts.map((part) => { const inner = row[fieldKey(part)]; return inner === undefined || inner === null || inner === "" ? "" : `${(part.label ?? fieldKey(part)).split("：")[0]}：${plain(inner, part)}`; })
      : Object.values(row).filter(simple).map(String);
    return shown.filter(Boolean).join("；") || "（沒填）";
  }
  const option = field?.options?.find((candidate) => candidate.value === value);
  return option?.label ?? String(value);
}

/** The form refilled from a saved record. Only plain values (text, numbers, yes/no, lists of those) go back in: a
 *  structured field's record shape is the builder's output, not the form's state, so it starts empty and is named in
 *  `left` for the user to fill again. */
export function restoreState(fields: FormField[], record: Record<string, unknown>): { state: Record<string, unknown>; left: string[] } {
  const back: Record<string, unknown> = {};
  const left: string[] = [];
  for (const field of fields) {
    const key = fieldKey(field);
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (simple(value) || (Array.isArray(value) && value.every(simple))) back[key] = value;
    else left.push(String(field.label ?? key).split("：")[0]);
  }
  return { state: initialState(fields, back), left };
}

/** An analysis made before schema 1.1.0: it carries no detail_integrity gate (1.1.0+ always does), or its stored schema
 *  version says so. Not "sections missing" -- a 1.2.0 answer whose sections were all dropped is new, not old (P-15). */
export function isOldVersion(result: unknown, gates: Array<{ gate_id: string }> | null | undefined, schemaVersion?: string | null): boolean {
  if (!result) return false;
  if (schemaVersion) return Number(schemaVersion.split(".")[0]) < 1 || (schemaVersion.startsWith("1.") && Number(schemaVersion.split(".")[1]) < 1);
  return !(gates ?? []).some((gate) => gate.gate_id === "detail_integrity");
}
