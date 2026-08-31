# Backup and Restore Proof — Hetzner Phase 1 (SG VPS)

> ## 🚨 2026-08-31 換機更新：三條備份管線全部住在 ks-aw-01（KS-6，`145.239.195.47`，SSH 58122/ubuntu/sudo）
> SG/EU 機器已退場。**跨機互備（L3）已不存在**——單機拓樸下 R2 是唯一異地，
> 三支 verifier 都已把「R2 物件實列 + 逐檔對應」設為硬性檢查（缺任一檔即 FAIL）。
>
> | 管線 | cron 檔（皆在 ks） | 備份目錄 | 驗證 log | R2 prefix |
> |------|------------------|---------|---------|-----------|
> | lobster（原 SG：WP DB/uploads）| `/etc/cron.d/lobster-backup` 02:00/02:30 | `/root/lobster-phase1/backups/` | `/var/log/lobster-backup.log` | `sg-stack/<date>/` |
> | stack（原 EU：Supabase/Trigger/Kuma/MainWP/n8n/Postiz）| `/etc/cron.d/ks-stack-backup` 02:30/03:00 | `/root/backups-stack/` | `/var/log/eu-backup.log` | `eu/<date>/` |
> | soulful | `/etc/cron.d/ks-aw-01-backup` 02:15/02:45 | `/root/backups/` | `/var/log/ks-aw-01-backup.log` | `ks-aw-01/<STAMP>/`（WORM，見下）|
>
> **🔴 R2 還原必讀：大檔是分片的。** `upload-to-r2.sh` 對 >200MiB 的檔案切成
> `<name>.part-000`、`<name>.part-001`… 加一個 `<name>.parts.json` 清單
> （**清單只在所有分片都成功後才寫入** = 完整性證明）。還原時重組：
> ```bash
> cat <name>.part-* > <name>        # part 檔名有序，glob 展開即正確順序
> gunzip -t <name> 或 tar tzf <name>  # 重組後先驗完整性再灌
> ```
> 歷史 R2 內容：`sg/`（舊 SG 直傳，2026-08-28 前）與 `eu/` 照舊；`sg-stack/` 自 2026-08-28 起。
> 下方 SG/EU 區塊描述的是退場前的拓樸，保留當歷史證據；路徑在 ks 上依然同構有效
> （唯 EU 備份目錄已改 `/root/backups-stack/`、cron 檔改名 `ks-stack-backup`、
> 跨機 L3 與 `backup_to_sg`/`backup_to_eu` 金鑰全部作廢）。

> Infrastructure-level backup evidence for the Phase 1 compose stack.
> Per LONG_TERM_OPS.md §4: annual minimum restore drill required.

## Quick Reference — 備份地圖

| 你想知道什麼 | 去哪裡找 |
|-------------|---------|
| 備份整體怎麼運作？ | 本目錄 [`README.md`](./README.md) §備份 |
| cron 幾點跑？腳本在哪？ | [`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md) §每日 |
| 上次 restore drill 結果？ | **本文件** §Restore Drill Record（SG）/ §EU Restore Drill（EU） |
| RPO/RTO 是多少？ | [`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) §1 + §4 |
| Hetzner 自動備份有開嗎？ | 有。SG 18-22 UTC / EU 22-02 UTC（API 查證 2026-05-08） |
| 堆疊全景中 Backup 在哪？ | `agency-os/docs/operations/hetzner-stack-rollout-index.md` #10 |
| Cloudflare R2 怎麼查？ | Dashboard → R2 → `lobster-backup` bucket；`sg/` + `eu/` 子目錄按日期；credentials 見 `AWARE_WAVE_CREDENTIALS.md` §二十五 |
| R2 token / endpoint | Token: `lobster-backup-r2-token`；Endpoint: `aea1a836...r2.cloudflarestorage.com`；VPS env: SG `.env` / EU `/etc/default/eu-backup` 的 `R2_API_TOKEN` |
| server rebuild 後怎麼恢復 cron？ | SG: `bash scripts/install-maintenance-crons.sh --host sg`；EU: 重建 `/etc/cron.d/eu-backup`（見下方 EU 區塊） |

### 四層保護（2026-05-08 全部到位）

| 層 | 機制 | SG VPS (5.223.93.113) | EU VPS (204.168.175.41) |
|----|------|----------------------|------------------------|
| L1 | Hetzner 自動 server backup | 每日 18-22 UTC | 每日 22-02 UTC |
| L2 | DB-level daily cron | 02:00 UTC：WP DB + uploads + n8n | 02:30 UTC：Supabase + Trigger + Uptime Kuma |
| L3 | 跨洲 VPS 互備（Hetzner 內） | → EU `/root/backups/from-sg/` | → SG `/root/lobster-phase1/backups/from-eu/` |
| L4 | Cloudflare R2（跨供應商） | → `lobster-backup/sg/<date>/` | → `lobster-backup/eu/<date>/` |

**現役主機：ks-aw-01（OVH KS-6，`145.239.195.47`，2026-08-31 起）**

| 層 | 機制 | ks-aw-01 |
|----|------|---------|
| L2 | 服務 dump + volume 封存 | 02:15 UTC 備份 / 02:45 UTC 驗證（`/etc/cron.d/ks-aw-01-backup`）|
| L3 | 跨機互備 | ⛔ 尚未建立（P3 只做 R2 單異地；SG/EU 整併完成後再評估）|
| L4 | Cloudflare R2（跨供應商） | → `lobster-backup/ks-aw-01/<STAMP>/`，**`STAMP` = `YYYYmmdd-HHMMSS`，非日期** |

> ⚠️ **ks-aw-01 的 R2 key 不可由日期推導**（與 sg/eu 不同）。該 prefix 有 14 天 WORM lock
> （`ks-aw-01-retention-14d`），date-only key 會讓「部分上傳失敗後重試」在鎖定期內永久不可能，
> 故改用時間戳。**還原前必須先列出 bucket**，見
> [`infra/ks-aw-01-backup/README.md`](../ks-aw-01-backup/README.md) §Restore。

### SG VPS 關鍵路徑

| 項目 | 路徑 |
|------|------|
| Cron 定義 | `/etc/cron.d/lobster-backup` |
| 備份目錄 | `/root/lobster-phase1/backups/`（mode 700, 7 天 retention） |
| 從 EU 收到的異地備份 | `/root/lobster-phase1/backups/from-eu/` |
| 日誌 | `/var/log/lobster-backup.log` |
| 備份腳本 | `/root/lobster-phase1/scripts/backup-phase1.sh` |
| 驗證腳本 | `/root/lobster-phase1/scripts/verify-backup.sh` |
| R2 上傳腳本 | `/root/lobster-phase1/scripts/upload-to-r2.sh` |
| cron 安裝器 | `/root/lobster-phase1/scripts/install-maintenance-crons.sh` |
| 異地 SSH key（SG→EU） | `/root/.ssh/backup_to_eu` |
| R2 config | `.env` 內 `R2_API_TOKEN` / `R2_PREFIX=sg` |

### EU VPS 關鍵路徑

| 項目 | 路徑 |
|------|------|
| Cron 定義 | `/etc/cron.d/eu-backup` |
| 備份目錄 | `/root/backups/`（7 天 retention） |
| 從 SG 收到的異地備份 | `/root/backups/from-sg/` |
| 日誌 | `/var/log/eu-backup.log` |
| 備份腳本 | `/root/scripts/backup-eu-stack.sh` |
| R2 上傳腳本 | `/root/scripts/upload-to-r2.sh` |
| 驗證腳本 | `/root/scripts/verify-backup-eu.sh` |
| 異地 SSH key（EU→SG） | `/root/.ssh/backup_to_sg` |
| R2 config | `/etc/default/eu-backup` 內 `R2_API_TOKEN` / `R2_PREFIX=eu` |

---

## Backup Record

- Stack: Phase 1 compose (Nginx + Redis + WordPress + MariaDB + Node API + Next Admin)
- VPS: 5.223.93.113 (Hetzner SG, instance-id: 125887340)
- Backup scope: WordPress DB (MariaDB `wordpress`) + wp-content uploads + n8n volume (when running)
- Backup script: `scripts/backup-phase1.sh` (cron daily 02:00 UTC)
- Verify script: `scripts/verify-backup.sh` (cron daily 02:30 UTC)
- Local retention: 7 days (`BACKUP_RETAIN_DAYS`)
- Offsite retention: 14 days (`OFFSITE_RETAIN_DAYS`, added 2026-08-12) — the pushing host prunes its own copies on the receiving host
- Offsite: `RCLONE_REMOTE=eu-backup:/root/backups/from-sg` (rclone sftp remote → EU VPS 204.168.175.41)
- Cron file: `/etc/cron.d/lobster-backup`
- Log: `/var/log/lobster-backup.log`

## Restore Drill Record

### Drill #1 — 2026-05-08

- Drill date: 2026-05-08T07:53Z
- Operator: Claude Code (automated)
- Backup used: `./backups/20260508-075320/wordpress-db.sql.gz` (28K gzip)
- Restore target: `wordpress_restore_drill` (temporary database, same MariaDB container)
- Method: `gunzip -c | docker exec -i lobster-wordpress-db mariadb`
- Duration: < 5 seconds

#### Verification

| Check | Result |
|-------|--------|
| Backup file integrity (`gzip -t`) | PASS |
| Restore without errors | PASS |
| Table count: production = 12, restored = 12 | PASS (match) |
| Tables present: wp_options, wp_posts, wp_users, wp_comments, wp_postmeta, wp_usermeta, wp_terms, wp_termmeta, wp_term_taxonomy, wp_term_relationships, wp_commentmeta, wp_links | PASS (all 12) |
| Row counts: wp_options=147, wp_usermeta=25, wp_posts=4 | PASS (plausible) |
| Uploads archive integrity (`tar tzf wp-html.tgz`) | PASS |
| Uploads archive size: 28M | PASS (matches live 89M uncompressed) |

#### Cleanup
- Test database `wordpress_restore_drill` dropped immediately after verification.
- No production data modified.

#### Issues found: None
#### Corrective actions: None required

---

---

## EU VPS (204.168.175.41) — Backup Record

- Stack: Supabase (Postgres 15.8 + Auth + Storage + Studio) + Trigger.dev v4.4.4 + n8n + Uptime Kuma
- Backup script: `/root/scripts/backup-eu-stack.sh` (cron daily 02:30 UTC)
- Verify script: `/root/scripts/verify-backup-eu.sh` (cron daily 03:00 UTC)
- Cron file: `/etc/cron.d/eu-backup`
- Log: `/var/log/eu-backup.log`
- Local retention: 7 days
- Offsite retention: 14 days (`OFFSITE_RETAIN_DAYS`, added 2026-08-12) — the pushing host prunes its own copies on the receiving host
- Offsite: rsync to SG VPS (`/root/lobster-phase1/backups/from-eu/`) via SSH key `/root/.ssh/backup_to_sg`

### EU Restore Drill #1 — 2026-05-08

- Drill date: 2026-05-08T08:36Z
- Operator: Claude Code (automated)

| Check | Result |
|-------|--------|
| Supabase dump integrity (gzip -t) | PASS |
| Supabase dump content: 208 CREATE TABLE, 2 CREATE DATABASE (_supabase, n8n) | PASS |
| Supabase dump size: 3.1M gzip | PASS (plausible for 83MB raw) |
| Trigger.dev DB restore to test DB | PASS |
| Trigger.dev table count: production = 77, restored = 77 | PASS (match) |
| Trigger.dev restore: 784 DDL/DML statements | PASS |
| Uptime Kuma archive integrity (tar) | PASS |
| Uptime Kuma archive size: 16M | PASS |
| Offsite rsync to SG VPS | PASS (3 files received) |
| SG→EU offsite rsync | PASS (2 files received on EU) |

## Cross-VPS Offsite Summary

| Direction | Mechanism | Key | Schedule |
|-----------|-----------|-----|----------|
| SG → EU | rclone SFTP (`eu-backup:`) | `/root/.ssh/backup_to_eu` | daily with backup |
| EU → SG | rsync over SSH | `/root/.ssh/backup_to_sg` | daily with backup |

---

## Next scheduled drill

- Annual minimum per LONG_TERM_OPS.md §4 + §6
- Next: 2027-05 (or before any major upgrade)
- Scope: full DR in isolated VM (not just DB restore)
