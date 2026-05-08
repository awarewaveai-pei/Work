# Backup and Restore Proof — Soulful Expression Art Therapy

> 客觀證據；與 `ENVIRONMENT_REGISTRY` 欄位互相對齊更新。

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

## Restore Drill Record

- Drill date: **待執行（阻塞：staging 環境 `provision_pending`）**
- Restore target: `staging.soulfulexpression.org`（待 Hostinger 面板建立子網域後進行）
- Duration: 預計 < 30 分鐘（DB import + WP config adjust）
- Result: **PENDING**
- Issues found: N/A
- Corrective actions: N/A
- Verified by: N/A

> **計劃**：Day 2 staging 建立（Hostinger hPanel → Subdomains + All-in-One WP Migration plugin）完成後，立即執行：
> 1. 在 staging 目標站執行 `mysql < soulful_db_20260508_160734.sql`（或 plugin import）
> 2. 確認 staging 後台可登入 + 首頁可開（關鍵頁驗收）
> 3. 回填本節 Drill 結果 + 更新 `ENVIRONMENT_REGISTRY.md` `Last Restore Test`

## Artefacts

| 項目 | 路徑 / 值 |
|---|---|
| DB dump（local only，不入 git） | `agency-os/tenants/company-soulful-expression/backups/soulful_db_20260508_160734.sql.gz` |
| SHA-256 checksum | `849db7848992308dd4dd0b7a88c19add60b9b737463a90ba19a93da9566264b1` |
| Restore log path | 待 staging restore drill 產生 |
| Screenshot/report | 待 Day 2 staging 驗收
