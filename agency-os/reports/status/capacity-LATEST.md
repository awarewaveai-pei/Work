# Capacity health report

- Generated: 2026-09-04 22:41:07 +08:00  (UTC: 2026-09-04 14:41:07)
- Overall: **FAIL** 🔴

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🔴 | 9.5% of 125.8G | 10% of 935.7G | 2.2% | 0 / 0 | 42/42 |

## ks-aw-01 (145.239.195.47) 🔴
- Memory: 9.5% used (11.9G of 125.8G), swap 2.2%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 1, journal(7d) 1
- Disk /: 10% (87G of 935.7G), inodes 4%
- Docker reclaimable: Images=677.4MB (1%),Containers=0B (0%),Local Volumes=183.5MB (0%),Build Cache=0B
- Containers: 42 running / 42 total, unhealthy 0
- Restart counts: trigger-webapp(1)
- Top memory: postiz=1.23GiB soulful-wp=967.7MiB soulful-db=800.3MiB trigger-webapp=759.2MiB supabase-kong=474.6MiB trigger-clickhouse=457MiB
- CPU: 32 cores, load1 10.95 (0.34 per core), PSI cpu some 7.12%, up 4d
- Disk trend: 0.08 GiB/day since last run -- reaches the 60% warn line in about 5609 days at this rate

**Findings:**
- OOM kills observed: 1 (vmstat=1, journal=1)

