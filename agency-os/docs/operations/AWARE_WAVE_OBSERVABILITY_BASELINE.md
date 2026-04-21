# Aware Wave Observability Baseline

Updated: 2026-04-21

## Goal

Define the minimum production monitoring baseline for the current Aware Wave stack so each tool has a clear job:

- `Netdata`: host and service health on the Hetzner box
- `Uptime Kuma`: external reachability and SSL/public endpoint checks
- `Sentry`: application errors and traces
- `PostHog`: product usage and funnel impact
- `Cloudflare`: edge, DNS, WAF, and cache signals
- `Slack`: alert delivery channel

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
| `Sentry` | Code exceptions, performance regressions, release correlation | Host saturation, disk pressure |
| `PostHog` | User journeys, drop-off, feature usage, frontend/product behavior | Infra paging or low-level service health |
| `Cloudflare` | Edge errors, DNS, WAF/rate-limit events, cache behavior | Internal service metrics |
| `Slack` | Human notification fan-out | Source of truth for system state |

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

- [ ] Verify `endpoint-alert.sh` checks all six current public URLs
- [ ] Confirm `Uptime Kuma` has one monitor per public surface plus SSL expiry checks
- [ ] Confirm `Netdata` watches host, nginx, redis, n8n, trigger, minio, and self-hosted supabase where applicable
- [ ] Confirm `Sentry` DSNs and alert rules exist for `node-api`, `trigger`, `n8n`, `next-admin`, and `wordpress`
- [ ] Define the first `PostHog` funnel for sign-in and one critical workflow success path
- [ ] Send test alerts to Slack from Netdata and endpoint-alert

## Related

- `lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh`
- `lobster-factory/infra/hetzner-phase1-core/scripts/slack-alert-drill.sh`
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml`
- `agency-os/docs/operations/SENTRY_ALERT_POLICY.md`
- `agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md`
