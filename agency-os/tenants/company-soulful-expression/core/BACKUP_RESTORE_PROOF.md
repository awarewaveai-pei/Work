---
# Phase 4 backup monitoring metadata (machine-readable)
status: active
onboarded_at: 2026-05-08
backup_schedule: weekly
backup_destination: googledrive
backup_destination_label: "Update_Backup (WPvivid auth_id wpvivid-auth-ca9352c3bbbf3, MainWP remote_id wpvivid-remote-69ff0a63b77ab)"
restore_drill_due_after: 2026-08-06   # baseline 2026-05-08 + 90 days
last_known_success_utc: 2026-06-08T00:15:04Z
last_known_success_task_id: wpvivid-6e68a5af17f93
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

## Backup Record #2 — 2026-08-15（Hosting 退場前的完整安全網）

> **背景**：操作者 2026-08-15 決定 **Premium Web Hosting 不續約**（$215.76/年）。Hostinger hosting
> **2026-11-12 到期**，網站必須在此之前搬離。Record #1 的 DB dump 已是 3 個月前（2026-05-08），
> 不足以作為搬遷的還原點，故重新製作並**移出 Hostinger**。

| 欄位 | 值 |
|---|---|
| Backup timestamp | **2026-08-15 12:23:53 UTC** |
| Backup method | `mysqldump --single-transaction --quick --default-character-set=utf8mb4 \| gzip -9` via Hostinger SSH；uploads 以 `tar czf -` 串流下載（不在來源端落地大檔） |
| Backup scope | **DB + uploads**（Record #1 只有 DB） |
| DB | `u942075013_hDaEZ`，**288 張表**，解壓後 **107,990,474 bytes**（~103 MB），壓縮後 **15 MB** |
| DB SHA-256 | `d71ce13086ace8d6d386afd2ad4ad8eb64c058b102150d8d5a68c6525d31bd3d` |
| Uploads | **11,001 個項目**，壓縮後 **632 MB** |
| Uploads SHA-256 | `cb4daf29243d334403ec37c663514956c8bd93a696833de379ca26f095d6c79c` |
| Storage（異地） | EU VPS `204.168.175.41:/root/backups/clients/soulful/`（**不在 Hostinger**，主機到期不受影響） |
| Storage（本機） | `/tmp` 暫存，非長期保存位置 |
| Operator | Claude（SSH session 2026-08-15） |

### 完整性驗證（四項，全部實測）

| 檢查 | 結果 |
|---|---|
| `gzip -t` DB | **OK** |
| DB dump 結尾標記 | `-- Dump completed on 2026-08-15 12:23:59` —— mysqldump **僅在成功結束時**寫入此行 |
| DB 表數比對 | dump 內 `CREATE TABLE` **288** == 資料庫 `information_schema` 實際 **288** |
| `tar -tzf` uploads | **OK**（完整讀取整個封存） |
| uploads 檔案數比對 | 封存 **11,001** == 來源 `find \| wc -l` **11,001** |
| 跨三地 SHA-256 | Hostinger / 本機 / EU **三地完全一致**（DB 與 uploads 各自比對） |

### 尚未涵蓋 / 已知限制

- **plugins（619 MB）與 themes（22 MB）未備份** —— 判定為可重新安裝的第三方程式碼，非不可取代資料。搬遷時以乾淨安裝 + 設定還原處理；若要 bit-for-bit 全站快照，搬遷當下另做。
- **未執行還原演練（restore drill）** —— 上述為完整性驗證，非「還原後網站可運作」的證明。還原演練應於目標主機就緒後執行，並回寫本檔。
- 本備份是**搬遷前的安全網**，非取代日常備份；WPvivid/MainWP 例行備份不受影響。

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

## Backup Milestone — 2026-06-08（週備份持續健康，JSON 同步補登）

2026-06-08 Phase 4 routine WARN（JSON 停在 5/22）觸發 VBC 查證，直接查 EU MainWP DB `report_addon`（site_id=2）取得完整 task 歷史：

| backup_time (UTC) | task_id | status |
|---|---|---|
| 2026-05-22 11:05 | wpvivid-ea9a8f38850c5 | Succeeded |
| 2026-05-25 00:15 | wpvivid-c9f8ea1a50284 | **Failed** — Google Drive API 403 rateLimitExceeded（暫時性）|
| 2026-06-01 00:15 | wpvivid-b888aaeec2aa6 | Succeeded |
| 2026-06-08 00:15 | wpvivid-6e68a5af17f93 | **Succeeded**（最新）|

結論：週備份機制正常運作（cron `wpvivid_weekly` 每週日 00:15 UTC）。5/25 單次失敗為 Google Drive API 速率限制，**後兩次自動恢復**，無需處置。WARN 純因 `BACKUP_AUTO_STATUS.json` 為手動同步、停在 5/22 → 已補登至 6/08。根本治理（自動同步）見 JSON `future_automation`。

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
