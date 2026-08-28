# Capacity health report

- Generated: 2026-08-28 16:40:45 +08:00  (UTC: 2026-08-28 08:40:45)
- Overall: **FAIL** 🔴

> ks-aw-01 runs the strictest thresholds on purpose: it is the consolidation target
> bought at 64 GB against a plan that called for 128 GB. This check is the agreed
> compensating control for that gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🔴 | 19.1% of 62.7G | 12% of 877G | 11.1% | 2.28 / 2.15 | 41/41 |

## ks-aw-01 (149.202.64.114) 🔴
- Memory: 19.1% used (12G of 62.7G), swap 11.1%
- PSI memory avg60: some 2.28%, full 2.15%  | io some 0.23%
- OOM kills: vmstat 15, journal(7d) 15
- Disk /: 12% (93.5G of 877G), inodes 5%
- Docker reclaimable: Images=463.6MB (1%),Containers=0B (0%),Local Volumes=12.76GB (56%),Build Cache=57.19MB
- Containers: 41 running / 41 total, unhealthy 0
- Top memory: soulful-db=2.752GiB postiz=1.18GiB soulful-wp=815.6MiB trigger-webapp=757.4MiB supabase-kong=753.6MiB trigger-clickhouse=457.7MiB
- CPU: 16 cores, load1 0.56 (0.04 per core), PSI cpu some 10.63%, up 1d

**Findings:**
- memory stall (PSI full avg60 2.15%) -- tasks are BLOCKED on memory
- OOM kills observed: 15 (vmstat=15, journal=15)

