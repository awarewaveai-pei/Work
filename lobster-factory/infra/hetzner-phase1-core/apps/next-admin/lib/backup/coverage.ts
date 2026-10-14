// Reads the host's backup coverage status (lobster-factory/docs/operations/BACKUP_COVERAGE_PLAN.md B6).
// Producer: hetzner-phase1-core/scripts/backup-coverage-check.py (cron 03:30 UTC) writes
// /var/lib/awarewave/backup-coverage.json; the next-admin container sees /var/lib/awarewave read-only at /host-status.
import { readFile } from "node:fs/promises";

export const BACKUP_COVERAGE_FILE = process.env.BACKUP_COVERAGE_STATUS_FILE || "/host-status/backup-coverage.json";
export const BACKUP_COVERAGE_MAX_AGE_HOURS = 26;

export interface CoverageRow {
  id: string;
  status: "PASS" | "FAIL";
  detail: string;
  plan?: string;
}

export interface CoverageStatus {
  generated_at: string;
  overall: "PASS" | "FAIL" | "ERROR";
  rows: CoverageRow[];
  error?: string;
}

export type CoverageRead =
  | { state: "ok"; status: CoverageStatus; ageHours: number }
  | { state: "stale"; status: CoverageStatus; ageHours: number }
  | { state: "missing"; reason: string }
  | { state: "unreadable"; reason: string };

/** A stale or missing file is reported as such, never as the last PASS it happens to contain. */
export async function readBackupCoverage(path = BACKUP_COVERAGE_FILE, now = Date.now()): Promise<CoverageRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { state: "missing", reason: code === "ENOENT" ? "the check has not written a status yet" : `cannot read ${path}: ${code}` };
  }
  let status: CoverageStatus;
  try {
    status = JSON.parse(text) as CoverageStatus;
  } catch {
    return { state: "unreadable", reason: "status file is not valid JSON" };
  }
  const at = Date.parse(status.generated_at);
  if (!Array.isArray(status.rows) || Number.isNaN(at)) return { state: "unreadable", reason: "status file has no rows or no generated_at" };
  const ageHours = (now - at) / 3_600_000;
  return ageHours > BACKUP_COVERAGE_MAX_AGE_HOURS ? { state: "stale", status, ageHours } : { state: "ok", status, ageHours };
}
