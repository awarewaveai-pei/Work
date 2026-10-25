# Capacity health report

- Generated: 2026-10-25 12:59:00 +08:00  (UTC: 2026-10-25 04:59:00)
- Overall: **WARN** 🟡

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟡 | 12.9% of 125.8G | 30% of 935.7G | 0.8% | 0 / 0 | 57/61 |

## ks-aw-01 (145.239.195.47) 🟡
- Memory: 12.9% used (16.2G of 125.8G), swap 0.8%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat(since boot) 788, journal 24h 0 / 7d 636 -- by container: 8e92dc13a6c0(453) a7994f18c195(156) f72bbd554a5c(22) 8711ba166f94(2) 0511099d0c2c(2)
- Disk /: 30% (265.8G of 935.7G), inodes 11%
- Docker reclaimable: Images=62.05GB (53%),Containers=38.61MB (8%),Local Volumes=241MB (0%),Build Cache=10.62GB
- Containers: 57 running / 61 total, unhealthy 0
- Top memory: buildx_buildkit_trigger0=4.207GiB postiz=1.419GiB cognitive-os-api=1.06GiB trigger-webapp=793MiB soulful-wp=616.9MiB chatwoot-sidekiq=574.1MiB
- CPU: 32 cores, load1 3.57 (0.11 per core), PSI cpu some 9.05%, up 10d

**Findings:**
- OOM kills in the last 7d, none in 24h: 636 (vmstat since boot=788); by container (7d): 8e92dc13a6c0(453) a7994f18c195(156) f72bbd554a5c(22) 8711ba166f94(2) 0511099d0c2c(2) -- check WORKLOG that the incident is closed

