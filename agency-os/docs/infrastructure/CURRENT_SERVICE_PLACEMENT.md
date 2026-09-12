# Current Service Placement

Status: **STUB INVENTORY — created 2026-09-02, closes a citation gap found in four HCI V2 chapters (`12`, `16`, `20`, `23`) that named this file before it existed**

## What this file is, and isn't

This is a thin, machine-checkable inventory using the field list `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md` already specified. It is **not** a second topology source of truth. The actual topology SSOT — container names, internal ports, compose file locations, nginx routing — remains [`agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md`](../operations/AWAREWAVE_STACK_QUICKREF.md), which is verified against live `docker ps` / nginx `server_name` / Cloudflare DNS on a documented cadence. Duplicating that detail here would create exactly the two-SSOT drift risk `05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-02 and this repo's own governance discipline warn against. This file exists only so a document that cites "current service placement" has something real to point at, with enough columns to answer "which host, which product, is it live" without opening the full quickref.

Update this file whenever a service is added, moved, or retired — the same event that already requires updating `AWAREWAVE_STACK_QUICKREF.md`. Treat a mismatch between the two as staleness in this file, not the other way around.

## Current host baseline

Single OVHcloud dedicated server, operational alias `ks-aw-01` (`145.239.195.47`, SSH `-p 58122`). No Kubernetes, no multi-region, no managed cloud DB, no service mesh, no message broker. Full detail: `AWAREWAVE_STACK_QUICKREF.md` banner + `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` §Current Aware Wave deployment baseline.

## Service inventory

| service_id | public_hostname | role | audience | current_host | reverse_proxy | database | public_exposure | owner | verification_status |
|---|---|---|---|---|---|---|---|---|---|
| www | www.aware-wave.com | brand site | public | ks-aw-01 | host nginx | — | public | AwareWave | live |
| api | api.aware-wave.com | unified API gateway | public/customer | ks-aw-01 | host nginx → lobster-nginx | node-api internal | public | AwareWave | live |
| app | app.aware-wave.com | internal ops console (Lobster Factory) | internal operators only | ks-aw-01 | host nginx → lobster-nginx | Supabase (self-hosted) | internal-facing, not customer portal | AwareWave | live |
| cognitive | cognitive.aware-wave.com | AI LEGO Cognitive Engineering OS (Phase 1: self-use) | internal (Phase 1 self-use only) | ks-aw-01 | host nginx → lobster-nginx | SQLite (`.runtime/identity.sqlite3`, container volume) | public (auth required beyond `/methods`) | AwareWave | live — deployed 2026-09-12 |
| hci | hci.aware-wave.com | HCI-30 | future customer | not yet deployed | not yet reserved | not yet provisioned | none yet | AwareWave | **planned — DNS reservation deferred to Wave 7 per `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md`** |
| oracle | oracle.aware-wave.com | Ziwei Doushu app ("Oracle") | internal/product | ks-aw-01 | host nginx | — | internal | AwareWave | live |
| studio / supabase | studio.aware-wave.com / supabase.aware-wave.com | self-hosted Supabase (DB/Auth/Storage) | internal (backing store for app/portal) | ks-aw-01 | host nginx | Supabase Postgres | internal | AwareWave | live |
| trigger | trigger.aware-wave.com | self-hosted Trigger.dev | internal (job runner) | ks-aw-01 | host nginx | Trigger's own Postgres/ClickHouse | internal | AwareWave | live |
| n8n | n8n.aware-wave.com | automation | internal | ks-aw-01 | host nginx | Supabase Postgres (`n8n` DB) | internal | AwareWave | live |
| postiz | postiz.aware-wave.com | social scheduling | internal | ks-aw-01 | host nginx | own Postgres/Redis | internal | AwareWave | live |
| mainwp | mainwp.aware-wave.com | WP fleet management | internal | ks-aw-01 | host nginx | own MariaDB | internal | AwareWave | live |
| uptime | uptime.aware-wave.com | Uptime Kuma monitoring | internal | ks-aw-01 | host nginx | sqlite | internal | AwareWave | live |
| remotion-svc / video-svc | remotion-svc.aware-wave.com / video-svc.aware-wave.com | video rendering | internal | ks-aw-01 | host nginx | — | internal | AwareWave | live |
| portal | portal.aware-wave.com | external multi-tenant customer control plane | external customers | ks-aw-01 | host nginx | Supabase Postgres (`organizations` etc.) | public, signup gated | AwareWave | live — identity layer only |
| docs | docs.aware-wave.com | public docs | public | ks-aw-01 | host nginx | — | public | AwareWave | live — DNS + placeholder, no content |
| trust | trust.aware-wave.com | trust center | public | ks-aw-01 | host nginx | — | public | AwareWave | live — DNS + placeholder, no content |
| status | status.aware-wave.com | status page | public | not deployed | not reserved | — | none | AwareWave | planned, not reserved |

Secrets source, backup target, monitoring, and network-zone columns from the full field list are tracked per-service in `AWAREWAVE_STACK_QUICKREF.md` and `runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`, not duplicated here.

## HCI-30 placement (this ADR batch)

Per ADR-0021 (physical isolation), HCI's own PostgreSQL runs as a dedicated container + dedicated volume on `ks-aw-01`, separate from the shared Supabase instance above — see that ADR for the rationale. No production HCI instance exists yet; the only HCI database today is the synthetic, ephemeral, no-host-port test skeleton at `Projects/internal/hci30/infra/local/compose.test.yml`, torn down after every local test run.

## Source-of-truth rules (unchanged from `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`)

1. Active architecture documents describe current valid infrastructure only.
2. Historical infrastructure (retired SG/EU VPS, terminated `149.202.64.114`) must not be used for rollback assumptions, current topology, current data residency, or current DR planning.
3. A server hostname does not define data residency — see `23` Rule 4 for the required policy dimensions.
4. Always re-verify against the live Cloudflare zone / actual `docker ps` state before trusting this table's `verification_status` column past its last-updated date.

_Last updated: 2026-09-02, cross-checked against `AWAREWAVE_STACK_QUICKREF.md` (2026-08-31 banner) and `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`._
