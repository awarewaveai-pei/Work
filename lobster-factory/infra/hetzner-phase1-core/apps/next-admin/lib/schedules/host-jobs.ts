// Every host schedule we own, keyed as report-host-schedules.py reports it (the cron-run.sh key; run_parts_<file>;
// a systemd timer's unit name). A live key missing here shows as unregistered, a key here missing on the host as
// missing -- so this list and scripts/cron.d cannot drift apart unseen. Copy written by GPT (codex-oracle inspect
// 2026-10-24, agency-os/reports/oracle/2026-10-24-inspect-273b113e.md), used as written.

export type HostJobGroup = "backup" | "deploy" | "site";

export interface HostJob {
  label: string;
  description: string;
  group: HostJobGroup;
  /** Who hears about a failure, when the job has its own alert; otherwise HOST_UI.fail_default. */
  fail?: string;
  /** Its exit code never reports failure (exit 0 by design, or curl without -f): "ok" only proves it ran on time. */
  exitAlwaysZero?: true;
}

export const HOST_GROUP_ORDER: HostJobGroup[] = ["backup", "deploy", "site"];

export const HOST_JOBS: Record<string, HostJob> = {
  backup_coverage_check: { label: "備份完整性檢查", description: "每天確認資料庫與檔案備份完整、異地有副本，且每月還原演練通過。", group: "backup", fail: "檢查失敗時，Slack 會收到告警，備份頁也會顯示失敗項目。" },
  backup_offsite_cognitive_hci: { label: "資料庫異地備份", description: "每天將 Cognitive OS 與 HCI 兩個資料庫備份複製到 R2 異地保存。", group: "backup" },
  backup_restore_drill: { label: "備份還原演練", description: "每月從備份實際還原資料，確認備份在需要時確實可以救回。", group: "backup" },
  lobster_backup: { label: "Lobster 資料備份", description: "每天備份 WordPress 資料庫、上傳檔案與 n8n 資料，保留可還原副本。", group: "backup" },
  lobster_backup_verify: { label: "Lobster 備份檢查", description: "每天在前一項備份完成 30 分鐘後檢查完整性，及早發現備份問題。", group: "backup" },
  ks_aw_01_backup: { label: "Soulful 異地備份", description: "每天備份 Soulful 網站與服務，並將副本送到 R2 異地保存。", group: "backup" },
  ks_aw_01_backup_verify: { label: "Soulful 備份檢查", description: "每天檢查 Soulful 網站備份是否完整，確認需要時可以使用。", group: "backup" },
  stack_backup: { label: "服務資料異地備份", description: "每天備份 Supabase、Trigger.dev、MainWP 等服務資料，並送到 R2 異地保存。", group: "backup" },
  stack_backup_verify: { label: "服務備份檢查", description: "每天檢查上一項服務備份是否完整，確保各項資料可供還原。", group: "backup" },
  cognitive_db_backup: { label: "Cognitive OS 備份", description: "每天備份 Cognitive OS 資料庫，保留最近 7 天的備份。", group: "backup" },
  hci_postgres_backup: { label: "HCI 資料庫備份", description: "每天備份 HCI 系統的正式資料庫，確保正式資料有備份。", group: "backup" },
  backup_status_sync: { label: "網站備份狀態同步", description: "每天從 MainWP 讀取各客戶網站的備份狀態，更新程式庫紀錄。", group: "backup" },
  host_schedules_report: { label: "主機排程盤點", description: "每 10 分鐘盤點主機排程與最近結果，供本頁讀取；停止後狀態會過時。", group: "deploy" },
  awarewave_endpoint_alert: { label: "網站回應檢查", description: "每分鐘檢查對外網站是否正常回應，異常時通知並在恢復時再通知一次。", group: "deploy", fail: "檢查失敗時，Slack 與 Telegram 會收到通知；恢復時也會再通知一次。" },
  ops_probe_heartbeat: { label: "主機存活回報", description: "每 30 分鐘回報主機仍在運作，讓健康檢查確認主機排程正常執行。", group: "deploy" },
  auto_deploy_next_admin: { label: "管理後台自動部署", description: "每天凌晨部署最新管理後台版本，部署前測試，失敗時自動退回上一版。", group: "deploy", fail: "部署失敗時，Slack 與 Telegram 會收到通知。" },
  deploy_drift_check: { label: "部署版本檢查", description: "每天檢查主機版本是否落後程式庫，及早發現運作中的版本有落差。", group: "deploy", fail: "發現版本落差時，Slack 會收到通知。" },
  routine_watchdog: { label: "雲端排程報告檢查", description: "每天檢查 Claude routine 是否按時產生報告，確保雲端自動排程正常。", group: "deploy", fail: "檢查失敗時，Telegram 會收到通知。" },
  schedules_run_due: { label: "客戶排程時鐘", description: "每 5 分鐘找出到期的客戶排程（自動爬取、內容管線、月報等）並啟動。", group: "site", fail: "某個排程本身失敗時，會記在該格並送到營運收件匣。" },
  reconcile_videos: { label: "影片畫廊補登", description: "每天兩次找出 R2 中未出現在畫廊的影片並補登，避免關閉頁面後遺漏。", group: "site", fail: "同一輪重試 3 次仍失敗時，Telegram 會收到通知。" },
  wp_cron_runner: { label: "WordPress 排程執行", description: "每分鐘替關閉內建排程的 WordPress 網站執行到期工作，維持寄信與發文等功能。", group: "site", fail: "連續超過 15 分鐘沒有成功時，告警系統會發出通知。" },
  mainwp_wp_cron: { label: "MainWP 排程", description: "每 5 分鐘觸發 MainWP 的 WordPress 排程，同步並檢查各客戶網站。", group: "site", exitAlwaysZero: true },
  certbot_renew: { label: "SSL 憑證續期", description: "每週檢查網站 SSL 憑證，接近到期時自動續期，避免憑證失效。", group: "site" },
  supabase_weekly_restart: { label: "Supabase 定期重啟", description: "每週重新啟動 Supabase 管理介面與 API 閘道，降低長時間運作造成的記憶體累積。", group: "site" },
  docker_weekly_cleanup: { label: "Docker 閒置清理", description: "每週清理閒置超過 7 天的 Docker 映像檔與暫存，釋出空間且保留使用中項目。", group: "site" },
  run_parts_netdata_updater: { label: "Netdata 自動更新", description: "每天自動更新主機監控工具 Netdata，讓監控維持在最新版本。", group: "site" },
};

export const HOST_UI = {
  group_backup: "備份",
  group_deploy: "部署與監控",
  group_site: "網站與服務維護",
  state_unregistered: "未登記",
  state_untracked: "不回報",
  detail_untracked: "這個排程會執行，但不會回報執行結果。",
  detail_no_record: "這個排程目前還沒有執行紀錄。",
  detail_exit: "執行結束但失敗，結束代碼為 {code}。",
  detail_not_on_host: "頁面已登記這個排程，但主機上找不到。",
  detail_list_stale: "主機的排程清單已 {min} 分鐘沒有更新，這些狀態可能已過時。",
  unregistered_label: "未登記排程",
  unregistered_desc: "{command} 直接加在主機上執行，頁面沒有登記這個排程。",
  drift_label: "排程版本不一致",
  drift_desc: "{files} 的主機版本與程式庫不一致，主機實際執行的排程不是程式庫記錄的版本。",
  list_missing_label: "尚未產生排程清單",
  list_missing_desc: "主機的排程清單檔尚未產生，因此目前無法比對排程狀態。",
  where_log: "執行紀錄寫在主機的 {log}。",
  where_none: "這個排程沒有另外寫執行紀錄。",
  look: "本頁顯示上次執行時間與結果；詳細內容請查看主機上的執行紀錄。",
  // Not from the GPT pass (added for codex review F2, same register).
  errors_label: "主機排程清單不完整",
  errors_desc: "主機排程清單有部分內容無法讀取：{errors}",
  detail_unknown: "主機排程清單不完整，無法確認主機上是否有這個排程。",
  detail_timer_stopped: "主機上的計時器已停止，這個排程不會再執行。",
  detail_exit_always_zero: "這個工作失敗時不會回報，本頁只能確認它有按時執行。",
  fail_default: "執行失敗時，本頁會標示「執行失敗」。",
} as const;
