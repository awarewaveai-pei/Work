# Aware Wave Observability Baseline

Updated: 2026-09-05

> **範圍限制**：本檔涵蓋 AwareWave 自身 `aware-wave.com` 家族的監控分工；**不含**個別客戶站台的監控細節、也**不含** MainWP 艦隊管理面本身內建的功能（見下方新增的 `MainWP` 列）。**跨（AwareWave 自身 + 所有客戶站 + MainWP 艦隊 + 全部 Cloudflare zone）的單一總覽 → `MONITORING_SYSTEMS_INVENTORY.md`**（2026-09-05 新建，起因與本檔下方的 MainWP 內建 Uptime Monitor 事件同一次盤查）。

## Goal

Define the minimum production monitoring baseline for the current Aware Wave stack so each tool has a clear job:

- `Netdata`: host and service health on the Hetzner box
- `Uptime Kuma`: external reachability and SSL/public endpoint checks
- `Sentry`: application errors and traces
- `PostHog`: product usage and funnel impact
- `Cloudflare`: edge, DNS, WAF, and cache signals
- `Slack`: alert delivery channel
- `MainWP`: client-fleet management/backup/sync dashboard — **not** a monitoring source of truth; its own built-in Uptime Monitor feature must stay disabled (see below)

This baseline assumes the current public surface includes:

- `https://aware-wave.com/`
- `https://app.aware-wave.com/`
- `https://api.aware-wave.com/health`
- `https://n8n.aware-wave.com/healthz`
- `https://trigger.aware-wave.com/`
- `https://uptime.aware-wave.com/dashboard`

## Monitoring Split

| Tool | Primary job | Do not use it for |
| --- | --- | --- |
| `Netdata` | Host, CPU, RAM, swap, disk, network, process/container pressure, service-level symptoms | Product analytics, app exception triage |
| `Uptime Kuma` | External HTTP/HTTPS/TCP checks, SSL expiry, heartbeat | Root-cause debugging inside the host |
| `endpoint-alert.sh` | SG-side local container probes plus one EU dead-man canary | Public edge monitoring through Cloudflare hairpin |
| `Sentry` | Code exceptions, performance regressions, release correlation | Host saturation, disk pressure |
| `PostHog` | User journeys, drop-off, feature usage, frontend/product behavior | Infra paging or low-level service health |
| `Cloudflare` | Edge errors, DNS, WAF/rate-limit events, cache behavior | Internal service metrics |
| `Slack` | Human notification fan-out | Source of truth for system state |
| `MainWP` | Client-site fleet management: backups (WPvivid), plugin/core updates, health sync | Uptime/reachability alerting — it ships a **built-in Uptime Monitor feature that duplicates Uptime Kuma** and must stay disabled (`mainwp_global_uptime_monitoring_settings` → `active:0`); see incident note below |

## MainWP built-in Uptime Monitor — disabled 2026-09-05, keep it that way

MainWP core (no separate extension plugin required) ships its own HTTP uptime-check feature, independent of Uptime Kuma. On the `mainwp-web` dashboard (ks-aw-01, DB `mainwp`, table `mwp_options`, key `mainwp_global_uptime_monitoring_settings`) it was found **silently active at a 60-second interval** for every site in the fleet, fully redundant with the dedicated Uptime Kuma monitors that already cover the same sites (`agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md`'s `Uptime Kuma` row; per-client detail in `tenants/<slug>/sites/<site>/OBSERVABILITY_*.md`). Nobody had documented this feature existed anywhere before this date, so it kept running unnoticed and roughly doubled the automated hit volume on monitored sites (discovered while investigating an unexplained Cloudflare pageview spike on `soulfulexpression.org`).

- **Fix applied**: flipped `active` from `1` to `0` inside the serialized settings blob (byte-length-safe substitution — both are single-digit PHP integers, no serialization corruption risk). DB backed up first (`mysqldump mainwp` on ks-aw-01, `/tmp/mainwp.db.bak-20260905-uptime-disable.sql`).
- **Trigger mechanism**: root crontab on ks-aw-01 hits `mainwp-web`'s `wp-cron.php` every 5 minutes (`*/5 * * * * curl ... http://127.0.0.1:8090/wp-cron.php?doing_wp_cron`); the uptime-check hook runs from there, not from a container-level cron.
- **If re-enabling this feature is ever considered**: don't. Uptime Kuma already owns this job per the Monitoring Split table above — enabling both again reintroduces the exact duplication this note exists to prevent. If MainWP's own monitor is genuinely needed for some reason, retire the corresponding Uptime Kuma monitor(s) for that site first so there is still exactly one source of truth.

## Service Matrix

| Surface / Service | Main risk | Primary tool | Minimum signals |
| --- | --- | --- | --- |
| `Hetzner` host | CPU, RAM, swap, disk, NIC saturation, reboot | `Netdata` | CPU > 85%, RAM pressure, swap usage, disk fullness, inode usage, network spikes, system load |
| `Nginx` | 5xx, upstream failure, TLS/proxy issues | `Netdata` + logs | request rate, 4xx/5xx, upstream connect/read timeout, active connections |
| `aware-wave.com` | public site unavailable | `Uptime Kuma` | HTTP status, TLS expiry, response time |
| `app.aware-wave.com` | admin/front-end unreachable or redirect broken | `Uptime Kuma` | status/redirect correctness, latency |
| `api.aware-wave.com` | API unavailable or degraded | `Uptime Kuma` + `Sentry` | `/health`, p95 latency, 5xx rate, backend exceptions |
| `Supabase` | DB exhaustion, auth/storage/API degradation | platform metrics + `Netdata` where self-hosted | DB CPU, connections, slow queries, replication/backups, auth/storage failures |
| `Redis` | memory pressure, evictions, connection errors | `Netdata` | memory, evictions, ops/sec, blocked clients, latency |
| `n8n` | failed executions, stuck queue, webhook failures | `Uptime Kuma` + `Sentry` | `/healthz`, execution failures, backlog, retry spikes |
| `Trigger.dev` | stuck jobs, failed runs, websocket/dashboard issues | `Uptime Kuma` + `Sentry` | public URL health, worker/job failures, queue delay, retry rate |
| `MinIO` | storage unavailable or nearing capacity | `Netdata` + service metrics | disk use, object storage errors, latency, capacity growth |
| `Uptime Kuma` | monitor plane down | `Netdata` + secondary check | process/container health, dashboard reachability |
| `Netdata` | alert plane degraded | self-check + manual drill | agent running, alarm delivery test |
| `Cloudflare` | WAF false positives, cache misses, DNS/TLS issues | Cloudflare analytics | 4xx/5xx at edge, rule matches, challenge/block spikes, cert status |
| `Sentry` | alerts silent or DSN broken | manual test route + alert rule | test event receipt, issue-to-Slack delivery |
| `PostHog` | product blind spots | PostHog dashboards | sign-in funnel, onboarding funnel, critical CTA usage |
| `GitHub` | deploy regressions not correlated | `Sentry` release tags + process | release tag alignment, deploy timestamp, rollback reference |

## Netdata Baseline

Netdata should monitor more than WordPress. Minimum host-level scope:

- host CPU, RAM, swap, disk, filesystem saturation
- Docker/container memory and CPU
- `Nginx`
- `Redis`
- `n8n`
- `Trigger.dev` host/container processes
- `MinIO` host/container processes
- self-hosted `Supabase` host/processes if it is on the same machine

Page to Slack immediately on:

- host CPU pinned above 90% for sustained duration
- swap above 25% and rising
- disk above 80%
- nginx 5xx spike
- redis evictions > 0
- repeated container restarts

## Uptime Kuma Baseline

Create or verify these public checks:

- `aware-wave.com` -> `GET /`
- `app.aware-wave.com` -> `GET /`
- `api.aware-wave.com` -> `GET /health`
- `n8n.aware-wave.com` -> `GET /healthz`
- `trigger.aware-wave.com` -> `GET /`
- `uptime.aware-wave.com` -> `GET /dashboard`

Also add:

- SSL expiry monitors for all public domains
- heartbeat monitor for any scheduled backup or critical cron
- optional TCP checks for private ports only if routed through a secure internal monitor

## SG Endpoint Alert Baseline

`awarewave-endpoint-alert.service` runs on SG every minute. Its fast tier must use local probes, not public Cloudflare URLs. This avoids daily `000000` noise from the `SG -> Cloudflare -> SG` hairpin path.

Canonical SG drop-in: `/etc/default/awarewave-endpoint-alert.local`

```bash
CHECK_URLS="http://127.0.0.1:8080/ http://127.0.0.1:3002/api/ops/summary http://127.0.0.1:3001/health"
CHECK_URLS_SLOW="https://uptime.aware-wave.com/api/entry-page"
```

Responsibilities:

- SG endpoint-alert: local WordPress, next-admin, node-api liveness
- EU Uptime Kuma: external public reachability, SSL expiry, and endpoint-alert heartbeat
- Slack: delivery channel only, not source of truth

## Sentry Baseline

Keep one project per service boundary:

- `node-api`
- `trigger-workflows`
- `n8n-backend`
- `n8n-frontend` if used
- `next-admin`
- `wordpress`

Required tags:

- `environment`
- `service`
- `owner`
- `release`

Alert immediately on:

- new production issue
- sudden regression after deploy
- sustained p95 transaction regression on critical API/frontend route

## PostHog Baseline

PostHog is not infra monitoring. Use it to answer impact:

- are users reaching the app?
- where do they drop in auth or onboarding?
- did a deployment reduce successful task completion?

Minimum funnels/events to define:

- landing -> login -> dashboard
- key API-backed action success
- workflow/job start -> workflow/job complete
- frontend error event count by release

## Slack Routing

Use `Slack` as the shared sink, but preserve source ownership:

- `Netdata` -> infra channel
- `Uptime Kuma` -> infra channel
- `Sentry` -> engineering/alerts channel
- `PagerDuty` -> on-call escalation for public outage

Do not use Slack as a monitoring backend. It is only the transport layer.

## Immediate Checklist

- [ ] Verify `endpoint-alert.sh` checks SG local ports and only one EU dead-man canary
- [ ] Confirm `Uptime Kuma` has one monitor per public surface plus SSL expiry checks
- [ ] Confirm `Netdata` watches host, nginx, redis, n8n, trigger, minio, and self-hosted supabase where applicable
- [ ] Confirm `Sentry` DSNs and alert rules exist for `node-api`, `trigger`, `n8n`, `next-admin`, and `wordpress`
- [ ] Define the first `PostHog` funnel for sign-in and one critical workflow success path
- [ ] Send test alerts to Slack from Netdata and endpoint-alert

## Related

- `agency-os/docs/operations/MONITORING_SYSTEMS_INVENTORY.md` — cross-cutting index (all systems, all sites, all CF zones)
- `lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh`
- `lobster-factory/infra/hetzner-phase1-core/scripts/slack-alert-drill.sh`
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml`
- `agency-os/docs/operations/SENTRY_ALERT_POLICY.md`
- `agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md`

## Related Documents (Auto-Synced)
- `docs/operations/MONITORING_SYSTEMS_INVENTORY.md`

_Last synced: 2026-09-23 03:45:07 UTC_

