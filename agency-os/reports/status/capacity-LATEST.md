# Capacity health report

- Generated: 2026-10-26 03:06:51 +08:00  (UTC: 2026-10-25 19:06:51)
- Overall: **WARN** 🟡

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟡 | 13.9% of 125.8G | 25% of 935.7G | 1.4% | 0 / 0 | 57/57 |

## ks-aw-01 (145.239.195.47) 🟡
- Memory: 13.9% used (17.5G of 125.8G), swap 1.4%
- PSI memory avg60: some 0%, full 0%  | io some 0.01%
- OOM kills: vmstat(since boot) 788, journal 24h 0 / 7d 636 -- by container: 8e92dc13a6c0(453) a7994f18c195(156) f72bbd554a5c(22) 8711ba166f94(2) 0511099d0c2c(2)
- Disk /: 25% (213.9G of 935.7G), inodes 8%
- Docker reclaimable: Images=14.5GB (23%),Containers=0B (0%),Local Volumes=248.4MB (0%),Build Cache=17.47GB
- Containers: 57 running / 57 total, unhealthy 0
- Top memory: buildx_buildkit_trigger0=4.217GiB postiz=1.797GiB cognitive-os-api=1.061GiB trigger-webapp=788.9MiB soulful-wp=632.5MiB chatwoot-sidekiq=576.1MiB
- CPU: 32 cores, load1 3.17 (0.1 per core), PSI cpu some 8.91%, up 10d
- Disk trend: 12.23 GiB/day since last run -- reaches the 60% warn line in about 24 days at this rate

**Findings:**
- OOM kills in the last 7d, none in 24h: 636 (vmstat since boot=788); by container (7d): 8e92dc13a6c0(453) a7994f18c195(156) f72bbd554a5c(22) 8711ba166f94(2) 0511099d0c2c(2) -- check WORKLOG that the incident is closed

