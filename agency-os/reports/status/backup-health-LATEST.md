# Backup health report

- Generated: 2026-09-30 10:28:03
- Overall: **PASS**

## lobster (ex-SG) (145.239.195.47)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 2.6G
- Latest backup file time: 2026-09-30 02:00:01
- Oldest backup file time: 2026-09-23 02:00:02
- Backup age: 0d
- Verify result: PASSED (2026-09-29T02:30:05Z)

## stack (ex-EU) (145.239.195.47)
- Cron file: /etc/cron.d/ks-stack-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 8.4G
- Latest backup file time: 2026-09-29 02:33:40
- Oldest backup file time: 2026-09-22 02:33:43
- Backup age: 0d
- Verify result: PASSED (2026-09-29T03:00:37Z)

## ks-aw-01 (145.239.195.47)
- Cron file: /etc/cron.d/ks-aw-01-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|15 2 * * * root /root/scripts/backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1|45 2 * * * root /root/scripts/verify-backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 6.9G
- Latest backup file time: 2026-09-30 02:18:07
- Oldest backup file time: 2026-09-22 02:17:44
- Backup age: 0d
- Verify result: PASSED (2026-09-29T02:45:22Z)

