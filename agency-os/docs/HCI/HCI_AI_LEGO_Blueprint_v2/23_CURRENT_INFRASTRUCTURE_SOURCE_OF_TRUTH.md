# 23 — Current Infrastructure Source of Truth

## Purpose

This document contains only the current infrastructure baseline used by active architecture.

Historical infrastructure is intentionally excluded.

## Current host baseline

```text
Provider: OVHcloud
Type: Dedicated Server
Server: ns31414856.ip-145-239-195.eu
Operational alias: ks-aw-01 (145.239.195.47, SSH -p 58122)
```

Management reference: `https://manager.ca.ovhcloud.com/#/dedicated/server/ns3006986.ip-149-202-64.eu`

**Verified 2026-08-29 (this session's own infrastructure work)**: this single dedicated server runs every AwareWave service today via docker-compose + host nginx (TLS termination) + `lobster-nginx` (app-level routing). No Kubernetes, no multi-region, no managed cloud DB, no service mesh, no message broker. Two earlier VPS (SG/EU) were fully consolidated into this single box on 2026-08-28 and are stopped, kept only as rollback. See `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` for the full verified baseline and its implications for HCI-30's own deployment plan.

## Source-of-truth rules

### Rule 1
Active architecture documents describe current valid infrastructure only.

### Rule 2
Historical infrastructure must not be used for: rollback assumptions, current topology, current data residency, current disaster recovery, current service ownership.

### Rule 3
Exact current service placement is maintained at `D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md`.

**Status (new in V2)**: this file was verified (via direct filesystem check) to not exist, despite being cited by name in four blueprint chapters (`12`, `16`, `20`, this file). Under this project's own R4 discipline ("claim before verify"), citing a file as authoritative truth without confirming it exists is itself a defect. Create it — even as a stub using the field list below — before Wave 1 database work begins, or remove the citations. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-01.

### Rule 4
A server hostname does not define data residency. Data residency requires an explicit policy covering: primary data, backups, logs, telemetry, AI processing, public-intelligence processing, subprocessors, cross-border transfer.

## Required current-service inventory

```text
service_id
public_hostname
role
audience
current_host
runtime/container
internal_port
reverse_proxy
database
persistent_volumes
secrets_source
backup_target
monitoring
public_exposure
network_zone
owner
verification_status
```

## Known service set to inventory — verified state, 2026-08-29

```text
www          -- live
api          -- live
app          -- live
cognitive    -- building
oracle       -- live (internal)
studio       -- live (internal)
supabase     -- live (internal)
trigger      -- live (internal)
n8n          -- live (internal)
postiz       -- live (internal)
mainwp       -- live (internal)
uptime       -- live (internal)
remotion-svc -- live (internal)
video-svc    -- live (internal)
portal       -- live (identity layer; signup gated)
docs         -- live (DNS + placeholder only, no content)
trust        -- live (DNS + placeholder only, no content)
```

Future (not yet reserved):

```text
hci
status
```

**Correction from V1**: V1 listed `portal`/`docs`/`trust` under "Future" — verified live as of this session's infrastructure work (`agency-os/WORKLOG.md` 2026-08-29 續17/18/20/21). This is the kind of drift this document exists to prevent — always re-verify against the live Cloudflare zone / actual service state before treating any status column here as current, rather than trusting the last time this file was edited.

## Expected result

Any AI or engineer reading the active blueprint sees one current infrastructure truth and does not need to reason about retired hosts.
