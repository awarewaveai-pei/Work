# Capacity health report

- Generated: 2026-09-03 12:46:20 +08:00  (UTC: 2026-09-03 04:46:20)
- Overall: **PASS** 🟢

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟢 | 10.7% of 125.8G | 10% of 935.7G | 9.4% | 0 / 0 | 42/42 |

## ks-aw-01 (145.239.195.47) 🟢
- Memory: 10.7% used (13.5G of 125.8G), swap 9.4%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 10% (84.4G of 935.7G), inodes 4%
- Docker reclaimable: Images=677.4MB (1%),Containers=0B (0%),Local Volumes=183.5MB (0%),Build Cache=0B
- Containers: 42 running / 42 total, unhealthy 0
- Top memory: trigger-webapp=2.473GiB postiz=1.217GiB soulful-wp=946.3MiB soulful-db=620.3MiB supabase-kong=471MiB trigger-clickhouse=466MiB
- CPU: 32 cores, load1 1.02 (0.03 per core), PSI cpu some 7.75%, up 2d

