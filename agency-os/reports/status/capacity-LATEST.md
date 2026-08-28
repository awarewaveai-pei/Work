# Capacity health report

- Generated: 2026-08-28 18:30:29 +08:00  (UTC: 2026-08-28 10:30:29)
- Overall: **FAIL** 🔴

> ks-aw-01 runs the strictest thresholds on purpose: it is the consolidation target
> bought at 64 GB against a plan that called for 128 GB. This check is the agreed
> compensating control for that gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🔴 | 18.8% of 62.7G | 12% of 877G | 0.3% | 0 / 0 | 41/41 |

## ks-aw-01 (149.202.64.114) 🔴
- Memory: 18.8% used (11.8G of 62.7G), swap 0.3%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 15, journal(7d) 15
- Disk /: 12% (93.5G of 877G), inodes 5%
- Docker reclaimable: Images=463.6MB (1%),Containers=0B (0%),Local Volumes=12.76GB (56%),Build Cache=57.19MB
- Containers: 41 running / 41 total, unhealthy 0
- Top memory: soulful-db=2.76GiB postiz=1.193GiB soulful-wp=1009MiB trigger-webapp=749.9MiB trigger-clickhouse=398MiB supabase-kong=290.2MiB
- CPU: 16 cores, load1 0.32 (0.02 per core), PSI cpu some 6.44%, up 1d

**Findings:**
- OOM kills observed: 15 (vmstat=15, journal=15)

