# Capacity health report

- Generated: 2026-10-19 13:10:00 +08:00  (UTC: 2026-10-19 05:10:00)
- Overall: **PASS** 🟢

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟢 | 13.4% of 125.8G | 29% of 935.7G | 15.5% | 0 / 0 | 57/61 |

## ks-aw-01 (145.239.195.47) 🟢
- Memory: 13.4% used (16.9G of 125.8G), swap 15.5%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 29% (255G of 935.7G), inodes 10%
- Docker reclaimable: Images=49.77GB (48%),Containers=38.61MB (5%),Local Volumes=241MB (0%),Build Cache=10.03GB
- Containers: 57 running / 61 total, unhealthy 0
- Restart counts: trigger-supervisor(1)
- Top memory: buildx_buildkit_trigger0=3.663GiB postiz=1.646GiB cognitive-os-api=1.057GiB soulful-wp=1020MiB soulful-db=1019MiB trigger-clickhouse=1010MiB
- CPU: 32 cores, load1 3.35 (0.1 per core), PSI cpu some 10.13%, up 4d
- Disk trend: 0.56 GiB/day since last run -- reaches the 60% warn line in about 491 days at this rate

