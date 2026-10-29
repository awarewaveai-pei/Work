# Backup health report

- Generated: 2026-10-30 00:29:19
- Overall: **PASS**

## lobster (ex-SG) (145.239.195.47)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|0 2 * * * root /root/lobster-phase1/scripts/cron-run.sh lobster_backup '/root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1'|30 2 * * * root /root/lobster-phase1/scripts/cron-run.sh lobster_backup_verify '/root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1'
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 1.9G
- Latest backup file time: 2026-10-29 02:00:01
- Oldest backup file time: 2026-10-22 02:00:02
- Backup age: 0d
- Verify result: PASSED (2026-10-29T02:30:05Z)

## stack (ex-EU) (145.239.195.47)
- Cron file: /etc/cron.d/ks-stack-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|30 2 * * * root /root/lobster-phase1/scripts/cron-run.sh stack_backup 'BACKUP_DIR=/root/backups-stack /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1'|0 3 * * * root /root/lobster-phase1/scripts/cron-run.sh stack_backup_verify 'BACKUP_DIR=/root/backups-stack /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1'|17 2 * * * root /root/lobster-phase1/scripts/cron-run.sh cognitive_db_backup 'COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_BACKUP_DIR=/root/backups/cognitive-db COGNITIVE_DB_BACKUP_KEEP_DAYS=7 /opt/cognitive-os/Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh >>/var/log/cognitive-db-backup.log 2>&1'
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 9.2G
- Latest backup file time: 2026-10-29 02:33:58
- Oldest backup file time: 2026-10-22 02:33:56
- Backup age: 0d
- Verify result: PASSED (2026-10-29T03:00:37Z)

## ks-aw-01 (145.239.195.47)
- Cron file: /etc/cron.d/ks-aw-01-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|15 2 * * * root /root/lobster-phase1/scripts/cron-run.sh ks_aw_01_backup '/root/scripts/backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1'|45 2 * * * root /root/lobster-phase1/scripts/cron-run.sh ks_aw_01_backup_verify '/root/scripts/verify-backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1'
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 8.7G
- Latest backup file time: 2026-10-29 02:17:41
- Oldest backup file time: 2026-10-21 02:17:33
- Backup age: 0d
- Verify result: PASSED (2026-10-29T02:45:21Z)

## Coverage (backup-inventory.json)
- PASS (2026-10-29T03:30:05Z)

