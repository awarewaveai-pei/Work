// Every schedule on the host, read-only (producer: hetzner-phase1-core/scripts/report-host-schedules.py, every 10 min,
// writes /var/lib/awarewave/host-schedules.json; the container sees /var/lib/awarewave read-only at /host-status).
// A stale or missing file is reported as such -- never as the last "ok" it happens to contain.
import { readFile } from "node:fs/promises";
import { cronCadence, staleAfterMs } from "../cron-cadence";
import { HOST_GROUP_ORDER, HOST_JOBS, HOST_UI } from "../host-jobs";
import type { SystemRow } from "../types";

export const HOST_SCHEDULES_FILE = process.env.HOST_SCHEDULES_STATUS_FILE || "/host-status/host-schedules.json";
/** The report runs every 10 min: 30 min = two missed runs. */
const REPORT_STALE_MS = 30 * 60 * 1000;

interface HostEntry {
  source: string;
  schedule: string;
  key: string | null;
  records_result: boolean;
  log: string | null;
  command?: string;
  last: { started_at: string | null; finished_at: string | null; exit_code: number | null } | null;
}

export interface HostSchedulesDoc {
  generated_at: string;
  entries: HostEntry[];
  cron_files_drift: string[];
  /** Sources the reporter could not read: the inventory is partial, so "not on the host" cannot be claimed. */
  errors?: string[];
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

function details(what: string, when: string, log: string | null, fail?: string): SystemRow["details"] {
  return {
    what,
    when: when ? `${when}（台北時間）` : "",
    where: log ? fill(HOST_UI.where_log, { log }) : HOST_UI.where_none,
    look: HOST_UI.look,
    lookHref: "/ops/schedules",
    fail: fail ?? HOST_UI.fail_default,
  };
}

function judge(e: HostEntry, intervalMs: number | null, now: number): Pick<SystemRow, "state" | "detail" | "lastAt"> {
  if (e.schedule === "@inactive") return { state: "stale", detail: HOST_UI.detail_timer_stopped, lastAt: e.last?.finished_at ?? null };
  if (!e.records_result) return { state: "untracked", detail: HOST_UI.detail_untracked, lastAt: null };
  const at = e.last?.finished_at ?? null;
  if (!e.last || !at || Number.isNaN(Date.parse(at))) return { state: "missing", detail: HOST_UI.detail_no_record, lastAt: null };
  if (e.last.exit_code !== 0) return { state: "failed", detail: fill(HOST_UI.detail_exit, { code: e.last.exit_code ?? "?" }), lastAt: at };
  if (intervalMs !== null && now - Date.parse(at) > staleAfterMs(intervalMs)) return { state: "stale", detail: "", lastAt: at };
  return { state: "ok", detail: "", lastAt: at };
}

function withExitNote(j: ReturnType<typeof judge>, alwaysZero?: true): ReturnType<typeof judge> {
  return alwaysZero && j.state === "ok" ? { ...j, detail: HOST_UI.detail_exit_always_zero } : j;
}

/** Pure: the published document -> page rows. Order: problems without a group first, then HOST_GROUP_ORDER. */
export function hostScheduleRowsFrom(doc: HostSchedulesDoc, now: number): SystemRow[] {
  const rows: SystemRow[] = [];
  const seen = new Set<string>();
  const genAt = Date.parse(doc.generated_at);
  const reportAge = Number.isNaN(genAt) ? Infinity : now - genAt;

  if (doc.cron_files_drift.length) {
    rows.push({
      key: "host_cron_drift", label: HOST_UI.drift_label, description: fill(HOST_UI.drift_desc, { files: doc.cron_files_drift.join("、") }),
      cadence: "", lastAt: doc.generated_at, state: "failed", detail: "",
      details: details(fill(HOST_UI.drift_desc, { files: doc.cron_files_drift.join("、") }), "", null),
    });
  }

  const errors = doc.errors ?? [];
  if (errors.length) {
    const desc = fill(HOST_UI.errors_desc, { errors: errors.join("；").slice(0, 300) });
    rows.push({ key: "host_inventory_errors", label: HOST_UI.errors_label, description: desc, cadence: "",
      lastAt: doc.generated_at, state: "failed", detail: "", details: details(desc, "", null) });
  }

  for (const e of doc.entries) {
    const c = cronCadence(e.schedule);
    const job = e.key ? HOST_JOBS[e.key] : undefined;
    if (!e.key || !job) {
      const desc = fill(HOST_UI.unregistered_desc, { command: e.command ?? e.key ?? e.source });
      rows.push({
        key: `unregistered:${e.source}:${e.key ?? e.command ?? ""}`, label: HOST_UI.unregistered_label, description: desc,
        cadence: c.text, lastAt: e.last?.finished_at ?? null, state: "unregistered", detail: e.source,
        details: details(desc, c.text, e.log),
      });
      continue;
    }
    // The same key on two lines is one job scheduled twice; list each line, the key alone would hide one.
    const key = seen.has(e.key) ? `${e.key}:${e.source}:${e.schedule}` : e.key;
    seen.add(e.key);
    rows.push({
      key, label: job.label, description: job.description, cadence: c.text, group: job.group,
      ...withExitNote(judge(e, c.intervalMs, now), job.exitAlwaysZero),
      details: details(job.description, c.text, e.log, job.fail),
    });
  }

  for (const [key, job] of Object.entries(HOST_JOBS)) {
    if (seen.has(key)) continue;
    rows.push({
      key, label: job.label, description: job.description, cadence: "", group: job.group, lastAt: null,
      ...(errors.length ? { state: "stale" as const, detail: HOST_UI.detail_unknown } : { state: "missing" as const, detail: HOST_UI.detail_not_on_host }),
      details: details(job.description, "", null, job.fail),
    });
  }

  if (reportAge > REPORT_STALE_MS) {
    const min = Number.isFinite(reportAge) ? Math.round(reportAge / 60_000) : "?";
    // A known failure stays red; everything else can no longer be vouched for.
    for (const r of rows) {
      if (r.state !== "missing" && r.state !== "failed") r.state = "stale";
      r.detail = fill(HOST_UI.detail_list_stale, { min });
    }
  }

  return sortSystemRows(rows);
}

/** Rows without a group (problems: drift, unregistered) first, then HOST_GROUP_ORDER; stable within a group. */
export function sortSystemRows(rows: SystemRow[]): SystemRow[] {
  const rank = (r: SystemRow) => (r.group ? 1 + HOST_GROUP_ORDER.indexOf(r.group) : 0);
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}

export async function hostScheduleRows(path = HOST_SCHEDULES_FILE, now = Date.now()): Promise<SystemRow[]> {
  let doc: HostSchedulesDoc;
  try {
    doc = JSON.parse(await readFile(path, "utf8")) as HostSchedulesDoc;
    if (!Array.isArray(doc.entries) || !Array.isArray(doc.cron_files_drift)) throw new Error("shape");
  } catch {
    return [{
      key: "host_schedules", label: HOST_UI.list_missing_label, description: HOST_UI.list_missing_desc, cadence: "",
      lastAt: null, state: "missing", detail: "", group: "deploy",
      details: details(HOST_UI.list_missing_desc, "", null),
    }];
  }
  return hostScheduleRowsFrom(doc, now);
}
