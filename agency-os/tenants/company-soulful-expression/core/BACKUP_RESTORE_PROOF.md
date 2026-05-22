---
# Phase 4 backup monitoring metadata (machine-readable)
status: active
onboarded_at: 2026-05-08
backup_schedule: weekly
backup_destination: googledrive
backup_destination_label: "Update_Backup (WPvivid auth_id wpvivid-auth-ca9352c3bbbf3, MainWP remote_id wpvivid-remote-69ff0a63b77ab)"
restore_drill_due_after: 2026-08-06   # baseline 2026-05-08 + 90 days
last_known_success_utc: 2026-05-22T11:05:20Z
last_known_success_task_id: wpvivid-ea9a8f38850c5
truth_source: agency-os/tenants/company-soulful-expression/core/BACKUP_AUTO_STATUS.json
---

# Backup and Restore Proof — Soulful Expression Art Therapy

> 客觀證據；與 `ENVIRONMENT_REGISTRY` 欄位互相對齊更新。
>
> **2026-05-22 治理修訂**：本檔語意收斂為「**人類維護的里程碑**」（baseline backup、restore drills、災難復原演練）。
> 「最近一次自動備份是否成功」這類週級資料**改由 `BACKUP_AUTO_STATUS.json` 承載**（truth source = MainWP DB）。
> Phase 4 routine 同時讀兩份檔做 cross-truth check。詳見 `agency-os/automation/claude-routines/phase4-weekly.md`。

## Backup Record #1 — 2026-05-08（Day 1 基線備份）

| 欄位 | 值 |
|---|---|
| Tenant | Soulful Expression Art Therapy |
| Site | soulfulexpression.org |
| Environment | **production** |
| Backup timestamp | **2026-05-08 08:07 UTC** |
| Backup method | `mysqldump -h 127.0.0.1 ... \| gzip` via Hostinger SSH（`exec()` disabled in PHP, bypassed via direct mysqldump） |
| Backup scope | **DB only**（`u942075013_hDaEZ`，138 MB uncompressed） |
| Compressed size | **15 MB**（`.sql.gz`） |
| Storage location | Local operator machine: `agency-os/tenants/company-soulful-expression/backups/soulful_db_20260508_160734.sql.gz` |
| File SHA-256 | `849db7848992308dd4dd0b7a88c19add60b9b737463a90ba19a93da9566264b1` |
| Retention policy | 本機保留至 staging restore drill 通過後，之後按月備份 |
| Operator | Claude（SSH session 2026-05-08）— verified operator |
| Missing | **uploads**（491 MB）— Day 2 staging 建立時補全站快照；Hostinger 自動備份（panel 內）未驗證還原 |

> **注意**：`uploads/` 未包含於此備份。Day 2 staging 複製時 Hostinger 面板提供「全站複製」功能，可一次包含 DB + files。此備份的用途為：有可下載的 DB dump 作為最低安全底線，可在緊急時從本機匯入還原資料庫。

## Backup Milestone — 2026-05-09（MainWP + WPvivid 自動化建立）

- 2026-05-09: MainWP Dashboard 連線修復，WPvivid Backup v0.9.126 在 child site 已 installed + active（[WORKLOG 2026-05-09 §MainWP WPvivid](../../../WORKLOG.md)）
- 2026-05-09 09:13 UTC, 11:08 UTC: 兩次 WPvivid backup task `Succeeded`（Dropbox 路徑 `SoulfulDBBackup`）
- 2026-05-16 23:06 TPE: 切換 remote 至 Google Drive（`Update_Backup`，MainWP remote_id `wpvivid-remote-69ff0a63b77ab`，OAuth scope `drive.file`）

## Backup Incident — 2026-05-16（局部失敗 — 已自然恢復）

- task_id: `wpvivid-389495d5500f8`
- backup_time: **2026-05-16 13:35:14 UTC**
- status: **Failed**
- failure mode: 本地 backup ZIP 已產出但**上傳到 Drive 之前被刪除/移動/重命名**（MainWP 回報訊息：`/wp-content/wpvividbackups/...part001.zip not found. The file might has been moved, renamed or deleted`）
- 推測根因（**未驗證**）：Hostinger 端可能的 cron / cleanup / 磁碟配額 / PHP timeout 砍 partial file
- 後續 5/22 backup 成功 → 機制能跑，但此 fail mode 仍可能週期性發生 → 列入 follow-up task

## Backup Record #2 — 2026-05-22（首次成功 Google Drive 備份）

| 欄位 | 值 |
|---|---|
| Backup timestamp | **2026-05-22 11:05:20 UTC** = 19:05 TPE |
| task_id | `wpvivid-ea9a8f38850c5` |
| Backup scope | files + DB（WPvivid `backup_files=files+db`） |
| Storage location | Google Drive root: `aware-wave 主帳號/wpvivid_backup/` |
| File name | `soulfulexpression.org_wpvivid-ea9a8f38850c5_2026-05-22-10-53_backup_all.part001.zip` |
| File size | 148,221,436 bytes（**148 MB**，含 uploads） |
| Drive mtime | 2026-05-22 19:05 TPE |
| Status (MainWP DB) | **Succeeded**（驗證自 `mwp_mainwp_wpvividmeta.report_addon`） |
| Operator | WPvivid cron + 操作者 manual trigger via MainWP UI |

## Restore Drill Record

- Drill date: **待執行（阻塞：staging 環境 `provision_pending`）**
- Restore target: `staging.soulfulexpression.org`（待 Hostinger 面板建立子網域後進行）
- Duration: 預計 < 30 分鐘（DB import + WP config adjust）
- Result: **PENDING**
- **Drill due after**: 2026-08-06（baseline 5/8 + 90 天）— Phase 4 會在 due date 過後觸發 WARN

> **計劃**：Day 2 staging 建立（Hostinger hPanel → Subdomains + All-in-One WP Migration plugin）完成後，立即執行：
> 1. 在 staging 目標站執行 `mysql < soulful_db_20260508_160734.sql`（或 plugin import）
> 2. 確認 staging 後台可登入 + 首頁可開（關鍵頁驗收）
> 3. 回填本節 Drill 結果 + 更新 `ENVIRONMENT_REGISTRY.md` `Last Restore Test` + 更新 frontmatter `restore_drill_due_after`

## Artefacts

| 項目 | 路徑 / 值 |
|---|---|
| DB dump（local only，不入 git） | `agency-os/tenants/company-soulful-expression/backups/soulful_db_20260508_160734.sql.gz` |
| SHA-256 checksum | `849db7848992308dd4dd0b7a88c19add60b9b737463a90ba19a93da9566264b1` |
| 5/22 Google Drive ZIP | `G:\我的雲端硬碟\wpvivid_backup\soulfulexpression.org_wpvivid-ea9a8f38850c5_2026-05-22-10-53_backup_all.part001.zip` |
| MainWP DB truth source | `mwp_mainwp_wpvividmeta WHERE site_id=2 AND option_name='report_addon'` on EU VPS mainwp-web container |
| Restore log path | 待 staging restore drill 產生 |
| Screenshot/report | 待 Day 2 staging 驗收 |
