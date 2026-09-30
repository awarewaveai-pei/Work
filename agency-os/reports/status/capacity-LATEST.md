# Capacity health report

- Generated: 2026-09-30 10:28:53 +08:00  (UTC: 2026-09-30 02:28:53)
- Overall: **PASS** 🟢

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟢 | 10.5% of 125.8G | 25% of 935.7G | 9.6% | 0 / 0 | 52/56 |

## ks-aw-01 (145.239.195.47) 🟢
- Memory: 10.5% used (13.2G of 125.8G), swap 9.6%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 25% (213.5G of 935.7G), inodes 8%
- Docker reclaimable: Images=24.66GB (32%),Containers=38.61MB (5%),Local Volumes=183.5MB (0%),Build Cache=3.026GB
- Containers: 52 running / 56 total, unhealthy 0
- Restart counts: trigger-supervisor(1) supabase-auth(1)
- Top memory: buildx_buildkit_trigger0=1.559GiB postiz=1.348GiB soulful-wp=1.113GiB soulful-db=1.007GiB trigger-webapp=945.3MiB trigger-clickhouse=932.2MiB
- CPU: 32 cores, load1 6.41 (0.2 per core), PSI cpu some 7.73%, up 5d

