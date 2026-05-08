# Backup and Restore Proof — Hetzner Phase 1 (SG VPS)

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
- Offsite: pending `RCLONE_REMOTE` configuration (rclone installed, target: Hetzner Object Storage fsn1)
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
