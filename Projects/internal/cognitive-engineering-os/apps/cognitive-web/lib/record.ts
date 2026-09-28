import { fieldKey, initialState, type FormField } from "./form-model";

// A method record, read back: the value at a manifest path ("r/events/0"), a value as text, and the form's fields
// refilled from a saved record.
export function recordValue(record: Record<string, unknown>, id: string): unknown {
  if (!id.startsWith("r/")) return undefined;
  let value: unknown = record;
  for (const part of id.slice(2).split("/")) value = Array.isArray(value) ? value[Number(part)] : value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  return value;
}
function printable(value: unknown): string { return typeof value === "string" ? value : value === undefined ? "未提供" : JSON.stringify(value); }
/** What you filled in, as text: a list reads as its items (one per line in the form), never as JSON. */
export function plain(value: unknown): string { return Array.isArray(value) ? value.map(plain).filter(Boolean).join("；") || "（沒填）" : value === undefined || value === null || value === "" ? "（沒填）" : printable(value); }

const simple = (value: unknown) => ["string", "number", "boolean"].includes(typeof value);
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
