# Backup health report

- Generated: 2026-06-26 15:36:19
- Overall: **PASS**

## SG (5.223.93.113)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 13G
- Latest backup file time: 2026-06-26 02:31:14
- Oldest backup file time: 2026-06-19 02:00:02
- Backup age: 0d
- Verify result: PASSED (2026-06-26T02:30:12Z)

## EU (204.168.175.41)
- Cron file: /etc/cron.d/eu-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 8.3G
- Latest backup file time: 2026-06-26 06:16:53
- Oldest backup file time: 2026-06-19 02:30:45
- Backup age: 0d
- Verify result: PASSED (2026-06-26T03:00:16Z)

