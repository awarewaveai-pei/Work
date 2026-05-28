# Backup health report

- Generated: 2026-05-28 21:44:44
- Overall: **PASS**

## SG (5.223.93.113)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 3.0G
- Latest backup file time: 2026-05-28 02:30:42
- Oldest backup file time: 2026-05-20 06:49:50
- Backup age: 0d

## EU (204.168.175.41)
- Cron file: /etc/cron.d/eu-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 3.5G
- Latest backup file time: 2026-05-28 02:30:23
- Oldest backup file time: 2026-05-19 06:06:13
- Backup age: 0d

