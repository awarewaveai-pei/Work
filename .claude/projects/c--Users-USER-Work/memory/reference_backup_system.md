# Backup System Reference (2026-05-08)

## Three layers of protection

| Layer | Mechanism | Location | RPO | Restore time |
|-------|-----------|----------|-----|-------------|
| L1 | Hetzner automatic server backup | Hetzner infrastructure (not on VPS disk) | ~24h | 30 min (Console) |
| L2 | `backup-phase1.sh` daily cron | `/root/lobster-phase1/backups/` on VPS | ~24h | < 5 min |
| L3 | rclone offsite (pending R2 setup) | Cloudflare R2 or Hetzner Object Storage | ~24h | depends |

## Key files (owner docs)

- **Backup script**: `lobster-factory/infra/hetzner-phase1-core/scripts/backup-phase1.sh`
- **Verify script**: `lobster-factory/infra/hetzner-phase1-core/scripts/verify-backup.sh`
- **Offsite setup**: `lobster-factory/infra/hetzner-phase1-core/scripts/setup-offsite-backup.sh`
- **Cron installer**: `lobster-factory/infra/hetzner-phase1-core/scripts/install-maintenance-crons.sh`
- **Restore proof**: `lobster-factory/infra/hetzner-phase1-core/BACKUP_RESTORE_PROOF.md`
- **Long-term ops**: `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md` (RPO/RTO, annual drill)
- **Maintenance calendar**: `lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md`

## VPS state (SG 5.223.93.113)

- Cron: `/etc/cron.d/lobster-backup` (02:00 backup, 02:30 verify UTC)
- Log: `/var/log/lobster-backup.log`
- Backup dir: `/root/lobster-phase1/backups/` (mode 700, 7 day retention)
- .env permissions: 600
- rclone: installed v1.60.1
- Hetzner server backup window: 18-22 UTC daily

## Hetzner API

- Token in env var `HETZNER_API_TOKEN` — works from bash, fails from PowerShell (encoding issue, not expired)
- SG server ID: 125887340
- EU server ID: 127972089
- Both have automatic backups enabled

## Restore drill

- First drill: 2026-05-08, 12/12 tables restored OK
- Next scheduled: annual per LONG_TERM_OPS.md §4

## EU VPS (204.168.175.41)

- Scripts: `/root/scripts/backup-eu-stack.sh` + `verify-backup-eu.sh`
- Cron: `/etc/cron.d/eu-backup` (02:30 backup, 03:00 verify UTC)
- Log: `/var/log/eu-backup.log`
- Scope: Supabase (pg_dumpall via supabase_admin) + Trigger (pg_dump -U trigger) + Uptime Kuma volume
- Offsite: rsync to SG VPS via `/root/.ssh/backup_to_sg`
- First drill: 2026-05-08, Trigger 77/77 tables match, Supabase 208 tables in dump

## Cross-VPS offsite (L3)

- SG→EU: rclone SFTP via `/root/.ssh/backup_to_eu` → `eu-backup:/root/backups/from-sg/`
- EU→SG: rsync via `/root/.ssh/backup_to_sg` → `/root/lobster-phase1/backups/from-eu/`

## Cloudflare R2 offsite (L4 — cross-provider)

- Bucket: `lobster-backup` (APAC)
- Endpoint: `https://aea1a836e6f8b8d7f18206dc8e848bd6.r2.cloudflarestorage.com`
- Token: `lobster-backup-r2-token` (cfut_...) — in AWARE_WAVE_CREDENTIALS.md §25
- Upload script: `upload-to-r2.sh` (REST API, no S3 credentials needed)
- SG env: `.env` → `R2_API_TOKEN`, `R2_PREFIX=sg`
- EU env: `/etc/default/eu-backup` → `R2_API_TOKEN`, `R2_PREFIX=eu`
- R2 keys: `sg/<date>/` and `eu/<date>/`
- Both verified 2026-05-08

## Fixed issues

- endpoint-alert 404: dead Uptime Kuma push monitor; HEARTBEAT_URL commented out + crontab push disabled
- Hetzner API token: works from bash env; PowerShell failure was call-syntax issue, not token
