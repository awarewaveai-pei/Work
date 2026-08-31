> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md. See 00_README.md in this folder for why.

# 23 — Current Infrastructure Source of Truth

## Purpose

This document contains only the current infrastructure baseline used by active architecture.

Historical infrastructure is intentionally excluded.

## Current host baseline

```text
Provider: OVHcloud
Type: Dedicated Server
Server: ns3006986.ip-149-202-64.eu
```

Management reference:

```text
https://manager.ca.ovhcloud.com/#/dedicated/server/ns3006986.ip-149-202-64.eu
```

## Source-of-truth rules

### Rule 1

Active architecture documents describe current valid infrastructure only.

### Rule 2

Historical infrastructure must not be used for:

```text
rollback assumptions
current topology
current data residency
current disaster recovery
current service ownership
```

### Rule 3

Exact current service placement is maintained at:

```text
D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md
```

### Rule 4

A server hostname does not define data residency.

Data residency requires an explicit policy covering:

```text
primary data
backups
logs
telemetry
AI processing
public-intelligence processing
subprocessors
cross-border transfer
```

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

## Known service set to inventory

```text
www
api
app
cognitive
oracle
studio
supabase
trigger
n8n
postiz
mainwp
uptime
remotion-svc
video-svc
```

Future:

```text
hci
portal
docs
trust
status
```

## Expected result

Any AI or engineer reading the active blueprint sees one current infrastructure truth and does not need to reason about retired hosts.
