# Backup health report

- Generated: 2026-06-03 09:17:45
- Overall: **PASS**

## SG (5.223.93.113)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|0 2 * * * root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1|30 2 * * * root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 4.0G
- Latest backup file time: 2026-06-02 02:30:45
- Oldest backup file time: 2026-05-26 02:00:01
- Backup age: 0d

## EU (204.168.175.41)
- Cron file: /etc/cron.d/eu-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash|PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin|30 2 * * * root /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1|0 3 * * * root /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): 7 (source: static)
- Backup dir size: 2.5G
- Latest backup file time: 2026-06-02 02:30:27
- Oldest backup file time: 2026-05-26 02:30:22
- Backup age: 0d

