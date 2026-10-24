// The host-side schedules this app can actually observe, shown read-only (SCHEDULES_PAGE_PLAN.md §3.2-7):
// backup coverage, the site-watch heartbeat, then every host cron/timer (adapters/host-schedules.ts).
// Laptop tasks, cloud routines and GitHub Actions have no data path into the app and are not listed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readBackupCoverage } from "@/lib/backup/coverage";
import type { SystemRow } from "../types";
import { hostScheduleRows, sortSystemRows } from "./host-schedules";

/** Two missed hourly ticks (site-watch-heartbeat cron "5 * * * *", WF src/trigger/site-watch.ts). */
const HEARTBEAT_STALE_MS = 2 * 60 * 60 * 1000;

export async function hostStatusRows(sb: SupabaseClient | null, now = Date.now()): Promise<SystemRow[]> {
  const rows: SystemRow[] = [];

  // Cadence: scripts/cron.d/backup-coverage (30 3 * * * UTC = 11:30 Taipei).
  const backup = {
    key: "backup_coverage",
    label: "備份覆蓋",
    description: "每天檢查資料庫備份，確認當日備份已複製到異地。",
    cadence: "每天 11:30",
    group: "backup" as const,
    // Facts: scripts/backup-coverage-check.py header, scripts/backup-inventory.json (18 stores, bucket lobster-backup).
    details: {
      what: "檢查 18 個資料庫與檔案資料夾：今日備份完整、R2 有副本、每月還原演練已通過。",
      when: "每日台北時間 11:30 在伺服器執行。",
      where: "結果存成伺服器上的狀態檔；排程頁和備份頁都會讀取。",
      look: "到「備份」頁（/ops/backup）查看每個資料儲存區的結果。",
      lookHref: "/ops/backup",
      fail: "失敗或停止時，Slack 會在幾分鐘內告警；開啟 Telegram 後也會收到通知。「備份」頁會顯示失敗項目。",
    },
  };
  const cov = await readBackupCoverage(undefined, now);
  if (cov.state === "ok" || cov.state === "stale") {
    const failed = cov.status.rows.filter((r) => r.status !== "PASS");
    rows.push({
      ...backup,
      lastAt: cov.status.generated_at,
      state: cov.state === "stale" ? "stale" : cov.status.overall === "PASS" ? "ok" : "failed",
      detail: failed.length ? `${failed.length} 項失敗：${failed.map((r) => r.id).join("、")}` : `${cov.status.rows.length} 項正常`,
    });
  } else {
    rows.push({ ...backup, lastAt: null, state: "missing", detail: cov.reason });
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
    description: "每小時喚醒網站巡檢；心跳停止時，不會檢查任何網站。",
    cadence: "每小時 :05",
    group: "deploy",
    // Facts: WF src/trigger/site-watch.ts, lib/site-watch/notify.ts, scripts/check-site-watch-health.ps1 (>2h WARN, >6h FAIL).
    details: {
      what: "每小時由 Trigger.dev 喚醒網站巡檢；各客戶網站依自己的排程檢查。",
      when: "每小時 05 分執行。",
      where: "各客戶的巡檢結果與截圖分開存放。",
      look: "到客戶頁面的「維護」分頁，在「網站巡檢」卡片查看狀態、最近 10 次檢查和截圖。",
      lookHref: "/ops/clients",
      fail: "網站失敗時，Telegram 在事故發生及恢復時各通知一次。心跳停止後，「網站巡檢狀態」在 2 小時後警告、6 小時後失敗。",
    },
    lastAt: heartbeat,
    state: !heartbeat ? "missing" : now - Date.parse(heartbeat) > HEARTBEAT_STALE_MS ? "stale" : "ok",
    detail: heartbeatError ?? "",
  });

  rows.push(...(await hostScheduleRows(undefined, now)));
  return sortSystemRows(rows);
}
