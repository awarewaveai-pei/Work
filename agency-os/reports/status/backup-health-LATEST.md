# Backup health report

- Generated: 2026-10-14 08:28:39
- Overall: **WARN**

## lobster (ex-SG) (145.239.195.47)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 1.6G
- Latest backup file time: 2026-10-13 02:00:01
- Oldest backup file time: 2026-10-06 02:00:01
- Backup age: 0d
- Verify result: PASSED (2026-10-13T02:30:04Z)

## stack (ex-EU) (145.239.195.47)
- Cron file: /etc/cron.d/ks-stack-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1|17 2 * * * root COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_BACKUP_DIR=/root/backups/cognitive-db COGNITIVE_DB_BACKUP_KEEP_DAYS=7 /opt/cognitive-os/Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh >>/var/log/cognitive-db-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 8.7G
- Latest backup file time: 2026-10-13 02:33:42
- Oldest backup file time: 2026-10-06 02:33:47
- Backup age: 0d
- Verify result: PASSED (2026-10-13T03:00:37Z)

## ks-aw-01 (145.239.195.47)
- Cron file: /etc/cron.d/ks-aw-01-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|15 2 * * * root /root/scripts/backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1|45 2 * * * root /root/scripts/verify-backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 6.8G
- Latest backup file time: 2026-10-13 02:16:00
- Oldest backup file time: 2026-10-05 02:17:34
- Backup age: 0d
- Verify result: FAILED (2026-10-13T02:45:20Z) **FAILED**

