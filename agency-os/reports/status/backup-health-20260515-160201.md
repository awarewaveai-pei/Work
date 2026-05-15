# Backup health report

- Generated: 2026-05-15 16:02:01
- Overall: **PASS**

## SG (5.223.93.113)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin 0 2 backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1 30 2 backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): (unknown) (source: unknown)
- Backup dir size (/root/backups): 400M
- Latest backup file time: 2026-05-07 15:50:46
- Oldest backup file time: 2026-05-07 15:50:46

## EU (204.168.175.41)
- Cron file: /etc/cron.d/eu-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin 30 2 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts snap supabase trigger uptime-kuma Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts snap supabase trigger uptime-kuma Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts snap supabase trigger uptime-kuma Work root /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1 0 3 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts snap supabase trigger uptime-kuma Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts snap supabase trigger uptime-kuma Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts snap supabase trigger uptime-kuma Work root /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): (unknown) (source: unknown)
- Backup dir size (/root/backups): 919M
- Latest backup file time: 2026-05-15 08:02:41
- Oldest backup file time: 2026-05-08 08:34:52

