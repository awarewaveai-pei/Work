# Capacity health report

- Generated: 2026-08-27 17:46:03 +08:00  (UTC: 2026-08-27 09:46:03)
- Overall: **PASS** 🟢

> ks-aw-01 runs the strictest thresholds on purpose: it is the consolidation target
> bought at 64 GB against a plan that called for 128 GB. This check is the agreed
> compensating control for that gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟢 | 6.1% of 62.7G | 2% of 877G | 0% | 0 / 0 | 2/2 |
| SG | 🟢 | 52.8% of 3.7G | 70% of 74.8G | 21.9% | 0 / 0 | 10/10 |
| EU | 🟢 | 61.6% of 7.6G | 55% of 149.9G | 38.5% | 0 / 0 | 29/29 |

## ks-aw-01 (149.202.64.114) 🟢
- Memory: 6.1% used (3.8G of 62.7G), swap 0%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 2% (9.2G of 877G), inodes 1%
- Docker reclaimable: Images=370.8MB (19%),Containers=0B (0%),Local Volumes=0B (0%),Build Cache=17.46MB
- Containers: 2 running / 2 total, unhealthy 0
- Top memory: soulful-db=2.052GiB soulful-wp=553.8MiB
- CPU: 16 cores, load1 0.03 (0 per core), PSI cpu some 0%, up 0d

## SG (5.223.93.113) 🟢
- Memory: 52.8% used (2G of 3.7G), swap 21.9%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 70% (50.1G of 74.8G), inodes 15%
- Docker reclaimable: Images=15.55GB (87%),Containers=0B (0%),Local Volumes=85.15MB (3%),Build Cache=11.29GB
- Containers: 10 running / 10 total, unhealthy 0
- Top memory: lobster-wordpress=394.2MiB lobster-next-admin=208.1MiB lobster-wordpress-db=84.47MiB lobster-loki=50.75MiB lobster-grafana-obs=46.72MiB oracle-web=45.58MiB
- CPU: 2 cores, load1 0.46 (0.23 per core), PSI cpu some 25.24%, up 6d

## EU (204.168.175.41) 🟢
- Memory: 61.6% used (4.7G of 7.6G), swap 38.5%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 55% (78.9G of 149.9G), inodes 17%
- Docker reclaimable: Images=459.1MB (1%),Containers=0B (0%),Local Volumes=813.2MB (4%),Build Cache=102.5MB
- Containers: 29 running / 29 total, unhealthy 0
- Restart counts: trigger-supervisor(1) supabase-auth(2)
- Top memory: trigger-webapp=656.8MiB postiz=450.3MiB trigger-clickhouse=419.5MiB supabase-kong=335.4MiB n8n=258.3MiB trigger-minio=226.3MiB
- CPU: 4 cores, load1 0.79 (0.2 per core), PSI cpu some 12.73%, up 4d

