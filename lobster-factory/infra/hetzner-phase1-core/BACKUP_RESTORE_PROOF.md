# Backup and Restore Proof — Hetzner Phase 1 (SG VPS)

> Infrastructure-level backup evidence for the Phase 1 compose stack.
> Per LONG_TERM_OPS.md §4: annual minimum restore drill required.

## Quick Reference — 備份地圖

| 你想知道什麼 | 去哪裡找 |
|-------------|---------|
| 備份整體怎麼運作？ | 本目錄 [`README.md`](./README.md) §備份 |
| cron 幾點跑？腳本在哪？ | [`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md) §每日 |
| 上次 restore drill 結果？ | **本文件** §Restore Drill Record |
| RPO/RTO 是多少？ | [`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md) §1 + §4 |
| Hetzner 自動備份有開嗎？ | 有。SG 18-22 UTC / EU 22-02 UTC（API 查證 2026-05-08） |
| 堆疊全景中 Backup 在哪？ | `agency-os/docs/operations/hetzner-stack-rollout-index.md` #10 |
| 怎麼裝異地備份？ | VPS: `bash scripts/setup-offsite-backup.sh <key> <secret> <bucket>` |
| server rebuild 後怎麼恢復 cron？ | `bash scripts/install-maintenance-crons.sh --host sg` |

### 三層保護

| 層 | 機制 | 位置 | RPO | 還原時間 |
|----|------|------|-----|---------|
| L1 | Hetzner 自動 server backup | Hetzner 基礎設施（非 VPS 磁碟） | ~24h | ~30 min（Console） |
| L2 | `backup-phase1.sh` daily cron | VPS `/root/lobster-phase1/backups/` | ~24h | < 5 min |
| L3 | rclone offsite（待啟用 R2） | Cloudflare R2 或 Hetzner Object Storage | ~24h | 視大小 |

### VPS 關鍵路徑

| 項目 | 路徑 |
|------|------|
| Cron 定義 | `/etc/cron.d/lobster-backup` |
| 備份目錄 | `/root/lobster-phase1/backups/`（mode 700, 7 天 retention） |
| 日誌 | `/var/log/lobster-backup.log` |
| 備份腳本 | `/root/lobster-phase1/scripts/backup-phase1.sh` |
| 驗證腳本 | `/root/lobster-phase1/scripts/verify-backup.sh` |
| 異地設定 | `/root/lobster-phase1/scripts/setup-offsite-backup.sh` |
| cron 安裝器 | `/root/lobster-phase1/scripts/install-maintenance-crons.sh` |

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

## Next scheduled drill

- Annual minimum per LONG_TERM_OPS.md §4 + §6
- Next: 2027-05 (or before any major upgrade)
- Scope: full DR in isolated VM (not just DB restore)
