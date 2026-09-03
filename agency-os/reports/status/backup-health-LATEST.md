# Backup health report

- Generated: 2026-09-03 12:45:45
- Overall: **PASS**

## lobster (ex-SG) (145.239.195.47)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 2.5G
- Latest backup file time: 2026-09-03 02:00:01
- Oldest backup file time: 2026-08-31 13:17:56
- Backup age: 0d
- Verify result: PASSED (2026-09-03T02:30:16Z)

## stack (ex-EU) (145.239.195.47)
- Cron file: /etc/cron.d/ks-stack-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 4.4G
- Latest backup file time: 2026-09-03 02:33:06
- Oldest backup file time: 2026-08-31 13:39:52
- Backup age: 0d
- Verify result: PASSED (2026-09-03T03:00:32Z)

## ks-aw-01 (145.239.195.47)
- Cron file: /etc/cron.d/ks-aw-01-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|15 2 * * * root /root/scripts/backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1|45 2 * * * root /root/scripts/verify-backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 3.9G
- Latest backup file time: 2026-09-03 02:17:34
- Oldest backup file time: 2026-08-31 13:45:08
- Backup age: 0d
- Verify result: PASSED (2026-09-03T02:45:21Z)

