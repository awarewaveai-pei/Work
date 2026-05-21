# Backup health report

- Generated: 2026-05-21 10:02:32
- Overall: **PASS**

## SG (5.223.93.113)
- Cron file: /etc/cron.d/lobster-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin 0 2 backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work root /root/lobster-phase1/scripts/backup-phase1.sh >> /var/log/lobster-backup.log 2>&1 30 2 backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work backups lobster-phase1 nginx-site-backups Work root /root/lobster-phase1/scripts/verify-backup.sh >> /var/log/lobster-backup.log 2>&1
- Retention days (RETENTION_DAYS): (unknown) (source: unknown)
- Backup dir size: 1.8G
- Latest backup file time: 2026-05-21 02:02:33
- Oldest backup file time: 2026-05-13 08:36:06

## EU (204.168.175.41)
- Cron file: /etc/cron.d/eu-backup => **present**
- Cron schedule (non-comment lines): SHELL=/bin/bash PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin 30 2 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts security-hardening-backup-20260520-015552 snap supabase trigger uptime-kuma uptime-kuma-compose.yml Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts security-hardening-backup-20260520-015552 snap supabase trigger uptime-kuma uptime-kuma-compose.yml Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts security-hardening-backup-20260520-015552 snap supabase trigger uptime-kuma uptime-kuma-compose.yml Work root /root/scripts/backup-eu-stack.sh >> /var/log/eu-backup.log 2>&1 0 3 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts security-hardening-backup-20260520-015552 snap supabase trigger uptime-kuma uptime-kuma-compose.yml Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts security-hardening-backup-20260520-015552 snap supabase trigger uptime-kuma uptime-kuma-compose.yml Work 100 backups mainwp , m[Destination]) for m in json.load(sys.stdin)] n8n scripts security-hardening-backup-20260520-015552 snap supabase trigger uptime-kuma uptime-kuma-compose.yml Work root /root/scripts/verify-backup-eu.sh >> /var/log/eu-backup.log 2>&1
- Retention days (RETENTION_DAYS): (unknown) (source: unknown)
- Backup dir size: 3.0G
- Latest backup file time: 2026-05-21 02:03:14
- Oldest backup file time: 2026-05-13 02:30:08

