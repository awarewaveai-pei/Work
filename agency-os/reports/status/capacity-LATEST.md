# Capacity health report

- Generated: 2026-10-23 14:39:17 +08:00  (UTC: 2026-10-23 06:39:17)
- Overall: **PASS** 🟢

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟢 | 13% of 125.8G | 30% of 935.7G | 19.3% | 0 / 0 | 57/61 |

## ks-aw-01 (145.239.195.47) 🟢
- Memory: 13% used (16.4G of 125.8G), swap 19.3%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat 0, journal(7d) 0
- Disk /: 30% (258.6G of 935.7G), inodes 10%
- Docker reclaimable: Images=54.38GB (50%),Containers=38.61MB (5%),Local Volumes=241MB (0%),Build Cache=10.62GB
- Containers: 57 running / 61 total, unhealthy 0
- Restart counts: trigger-supervisor(1)
- Top memory: buildx_buildkit_trigger0=3.933GiB postiz=1.658GiB soulful-db=1.499GiB cognitive-os-api=1.061GiB trigger-clickhouse=1.025GiB soulful-wp=1009MiB
- CPU: 32 cores, load1 1.68 (0.05 per core), PSI cpu some 8.35%, up 8d

