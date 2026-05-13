import type { RepairAuditEntry } from "./types";

export function appendAudit(
  existing: unknown,
  entry: Omit<RepairAuditEntry, "ts">,
): RepairAuditEntry[] {
  const current = Array.isArray(existing) ? (existing as RepairAuditEntry[]) : [];
  return [
    ...current,
    {
      ts: new Date().toISOString(),
      ...entry,
    },
  ];
}
