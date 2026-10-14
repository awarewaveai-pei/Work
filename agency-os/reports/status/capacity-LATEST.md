# Capacity health report

- Generated: 2026-10-14 08:29:25 +08:00  (UTC: 2026-10-14 00:29:25)
- Overall: **PASS** 🟢

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟢 | 11.3% of 125.8G | 26% of 935.7G | 16.3% | 0 / 0 | 55/59 |

## ks-aw-01 (145.239.195.47) 🟢
- Memory: 11.3% used (14.2G of 125.8G), swap 16.3%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 26% (227.3G of 935.7G), inodes 9%
- Docker reclaimable: Images=28.89GB (35%),Containers=38.61MB (4%),Local Volumes=241MB (0%),Build Cache=8.138GB
- Containers: 55 running / 59 total, unhealthy 0
- Restart counts: trigger-supervisor(1)
- Top memory: postiz=1.34GiB cognitive-os-api=1.04GiB soulful-wp=1021MiB soulful-db=970.6MiB trigger-webapp=919.7MiB trigger-clickhouse=908.8MiB
- CPU: 32 cores, load1 2.23 (0.07 per core), PSI cpu some 9.54%, up 4d
- Disk trend: 0.4 GiB/day since last run -- reaches the 60% warn line in about 739 days at this rate

