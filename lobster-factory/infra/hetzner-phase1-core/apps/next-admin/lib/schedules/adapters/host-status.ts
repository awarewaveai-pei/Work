// The host-side schedules this app can actually observe, shown read-only (SCHEDULES_PAGE_PLAN.md §3.2-7):
// backup coverage, then every host cron/timer and the clocks the host can read for us (adapters/host-schedules.ts):
// pg_cron, n8n, and the cloud-routine / laptop reports committed to the repo. GitHub Actions: not yet (needs a token).
import { readBackupCoverage } from "@/lib/backup/coverage";
import type { SystemRow } from "../types";
import { hostScheduleRows, sortSystemRows } from "./host-schedules";

export async function hostStatusRows(now = Date.now()): Promise<SystemRow[]> {
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

  rows.push(...(await hostScheduleRows(undefined, now)));
  return sortSystemRows(rows);
}
