// The host-side schedules this app can actually observe, shown read-only (SCHEDULES_PAGE_PLAN.md §3.2-7).
// Laptop tasks, cloud routines and GitHub Actions have no data path into the app and are not listed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readBackupCoverage } from "@/lib/backup/coverage";
import type { SystemRow } from "../types";

/** Two missed hourly ticks (site-watch-heartbeat cron "5 * * * *", WF src/trigger/site-watch.ts). */
const HEARTBEAT_STALE_MS = 2 * 60 * 60 * 1000;

export async function hostStatusRows(sb: SupabaseClient | null, now = Date.now()): Promise<SystemRow[]> {
  const rows: SystemRow[] = [];

  // Cadence: scripts/backup-coverage.cron (30 3 * * *).
  const cov = await readBackupCoverage(undefined, now);
  if (cov.state === "ok" || cov.state === "stale") {
    const failed = cov.status.rows.filter((r) => r.status !== "PASS");
    rows.push({
      key: "backup_coverage",
      label: "備份覆蓋",
      cadence: "每天 03:30 UTC",
      lastAt: cov.status.generated_at,
      state: cov.state === "stale" ? "stale" : cov.status.overall === "PASS" ? "ok" : "failed",
      detail: failed.length ? `${failed.length} 項失敗：${failed.map((r) => r.id).join("、")}` : `${cov.status.rows.length} 項正常`,
    });
  } else {
    rows.push({ key: "backup_coverage", label: "備份覆蓋", cadence: "每天 03:30 UTC", lastAt: null, state: "missing", detail: cov.reason });
  }

  let heartbeat: string | null = null;
  let heartbeatError: string | null = null;
  if (sb) {
    const m = await sb.from("site_watch_maintenance").select("last_heartbeat_at").eq("id", 1).maybeSingle();
    if (m.error) heartbeatError = m.error.message;
    else heartbeat = (m.data?.last_heartbeat_at as string | null) ?? null;
  } else heartbeatError = "no_supabase_client";
  rows.push({
    key: "site_watch_heartbeat",
    label: "巡檢心跳",
    cadence: "每小時 :05",
    lastAt: heartbeat,
    state: !heartbeat ? "missing" : now - Date.parse(heartbeat) > HEARTBEAT_STALE_MS ? "stale" : "ok",
    detail: heartbeatError ?? (heartbeat ? "" : "還沒有心跳紀錄"),
  });

  return rows;
}
