# Backup health report

- Generated: 2026-08-28 16:47:11
- Overall: **PASS**

## lobster (ex-SG) (149.202.64.114)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 2.5G
- Latest backup file time: 2026-08-28 08:10:19
- Oldest backup file time: 2026-08-28 07:59:23
- Backup age: 0d
- Verify result: UNKNOWN ((none)) (unknown)

## stack (ex-EU) (149.202.64.114)
- Cron file: /etc/cron.d/ks-stack-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root BACKUP_DIR=/root/backups-stack /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 3.1G
- Latest backup file time: 2026-08-28 08:32:00
- Oldest backup file time: 2026-08-28 06:40:58
- Backup age: 0d
- Verify result: UNKNOWN ((none)) (unknown)

## ks-aw-01 (149.202.64.114)
- Cron file: /etc/cron.d/ks-aw-01-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin|15 2 * * * root /root/scripts/backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1|45 2 * * * root /root/scripts/verify-backup-ks-aw-01.sh >> /var/log/ks-aw-01-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 44K
- Latest backup file time: 2026-08-28 02:15:05
- Oldest backup file time: 2026-08-27 05:49:15
- Backup age: 0d
- Verify result: PASSED (2026-08-28T02:45:01Z)

