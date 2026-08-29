> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/12_DEPLOYMENT_API_AND_MULTI_TENANCY.md. See 00_README.md in this folder for why.

# 12 — Deployment, API & Multi-Tenancy

## Architecture style

Start with a modular monolith unless real scaling constraints require distributed services.

Maintain internal bounded contexts so later extraction is possible.

Avoid premature microservices.

## Suggested application structure

```text
Web
API
Worker
PostgreSQL
Object Storage
```

plus required identity/security/observability components.

## API-first principle

UI capabilities should be backed by versioned APIs.

## Multi-tenancy

Core hierarchy:

```text
Tenant
↓
Organization
↓
Workspace
↓
Project
```

Potential tenant isolation tiers:

### Tier A
Shared app + shared DB + RLS

### Tier B
Shared app + dedicated DB

### Tier C
Dedicated app + dedicated DB

### Tier D
Dedicated region / customer cloud

## Data residency

Tenant settings should support:

```text
home_region
allowed_regions
data_residency_policy
backup_region
ai_processing_regions
```

## Platform control plane vs HCI data plane

Control plane may own:

```text
Accounts
Tenants
Subscriptions
Licenses
Entitlements
Plans
Regions
Deployments
Identity Providers
Feature Flags
Billing
Usage Metering
```

HCI data plane owns HCI content.

Control-plane operators must not automatically gain unrestricted HCI data access.

## Licensing

Private/on-prem deployments should support signed offline-verifiable licenses with:

```text
expiry
entitlements
seat_limit
deployment_id
grace_period
```

Signing private key remains with Aware Wave.

## External sharing

Support secure sharing with:
- expiry
- MFA/password option
- view-only
- watermark
- download control
- revocation
- audit

## API idempotency

Commercial write APIs should support idempotency keys where duplicate effects are dangerous.

## Service accounts

Integrations must use service accounts, not employee personal tokens.

## Secret lifecycle

Support:
- creation
- rotation
- revocation
- expiry

## Export

Customers should be able to export their own data in portable formats such as:

```text
JSON
CSV
PDF/A
Attachments
Audit export
```

Avoid data hostage.

## Account termination

Recommended lifecycle:

```text
Subscription cancelled
↓
Read-only grace period
↓
Customer export
↓
Deletion scheduled
↓
Backup expiry
↓
Deletion certificate
```


---

# Current Aware Wave deployment baseline

Current infrastructure baseline:

```text
OVHcloud Dedicated Server
ns3006986.ip-149-202-64.eu
```

This is an infrastructure-placement fact, not a data-residency policy.

## Active plane model

```text
Public Brand Plane
- www
- future docs
- future trust
- future status

Customer Product Plane
- cognitive
- future hci
- future portal

Public Integration Plane
- api

Internal Operations Plane
- app
- oracle
- studio
- supabase
- trigger
- n8n
- postiz
- mainwp
- uptime
- remotion-svc
- video-svc
```

## Mandatory invariant

```text
app.aware-wave.com
!=
portal.aware-wave.com
```

`app` is an internal operations console.

`portal` is an external multi-tenant customer control plane.

## Authoritative service placement

Maintain:

```text
D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md
```

Do not use stale architecture notes as deployment truth.
