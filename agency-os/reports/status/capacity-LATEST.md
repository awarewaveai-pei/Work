# Capacity health report

- Generated: 2026-10-30 00:30:19 +08:00  (UTC: 2026-10-29 16:30:19)
- Overall: **WARN** 🟡

> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host
> for all production services. Its 128 GB RAM meets the planned floor; these thresholds
> preserve early warning for whole-host pressure rather than compensating for a spec gap.

| host | verdict | mem used | disk | swap | PSI mem some/full | containers |
|---|---|---|---|---|---|---|
| ks-aw-01 | 🟡 | 15.4% of 125.8G | 26% of 935.7G | 5% | 0 / 0 | 58/58 |

## ks-aw-01 (145.239.195.47) 🟡
- Memory: 15.4% used (19.3G of 125.8G), swap 5%
- PSI memory avg60: some 0%, full 0%  | io some 0%
- OOM kills: vmstat(since boot) 788, journal 24h 0 / 7d 636 -- by container: 8e92dc13a6c0(453) a7994f18c195(156) f72bbd554a5c(22) 8711ba166f94(2) 0511099d0c2c(2)
- Disk /: 26% (230.3G of 935.7G), inodes 8%
- Docker reclaimable: Images=24.94GB (33%),Containers=0B (0%),Local Volumes=248.4MB (0%),Build Cache=18.07GB
- Containers: 58 running / 58 total, unhealthy 0
- Top memory: buildx_buildkit_trigger0=5.004GiB lobster-video-whisper=2.191GiB postiz=1.739GiB soulful-db=1.298GiB cognitive-os-api=1.061GiB soulful-wp=1.002GiB
- CPU: 32 cores, load1 2.36 (0.07 per core), PSI cpu some 8.9%, up 14d
- Disk trend: 15.97 GiB/day since last run -- reaches the 60% warn line in about 19 days at this rate

**Findings:**
- OOM kills in the last 7d, none in 24h: 636 (vmstat since boot=788); by container (7d): 8e92dc13a6c0(453) a7994f18c195(156) f72bbd554a5c(22) 8711ba166f94(2) 0511099d0c2c(2) -- check WORKLOG that the incident is closed

