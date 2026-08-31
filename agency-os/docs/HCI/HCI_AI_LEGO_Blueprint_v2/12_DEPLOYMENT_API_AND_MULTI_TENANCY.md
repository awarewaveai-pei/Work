# 12 — Deployment, API & Multi-Tenancy

## Architecture style

Start with a modular monolith unless real scaling constraints require distributed services. Maintain internal bounded contexts so later extraction is possible. Avoid premature microservices.

**KEEP, confirmed and made load-bearing in V2**: "modular monolith first" is correct and matches the verified single-OVH-box infrastructure reality — HCI-30 ships as a new bounded context inside the existing modular-monolith pattern, reusing `sg-deploy.sh` + host-nginx + `lobster-nginx` routing already proven for `next-admin`. This was previously an isolated line rather than the load-bearing header it deserves; see `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md` §3a for the full 3-option comparison (single container vs. 3-container split Day-1 vs. Kubernetes) that confirms this choice. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-14.

## Suggested application structure

```text
Web
API
Worker
PostgreSQL
Object Storage
```

plus required identity/security/observability components.

**Changed in V2**: the `Worker` component (for the Public Intelligence fetch/scan pipeline, `06_HCI30_PUBLIC_INTELLIGENCE.md` Wave 6) reuses the already-running self-hosted Trigger.dev instance rather than standing up a new job-queue system — pending the network-isolation verification in `06`'s `HD-19`. Do not build a second queue/retry/dashboard system next to an already-proven one without a verified, specific reason. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-05.

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

See `02_PRODUCT_BOUNDARIES.md` `HD-01` for the pending decision reconciling this hierarchy with AI LEGO's already-accepted Tenant model and the already-shipped `portal.aware-wave.com` `organizations` table.

## Tenant Isolation Tiers

```text
Tier A — Shared app + shared DB + RLS
Tier B — Shared app + dedicated DB
Tier C — Dedicated app + dedicated DB
Tier D — Dedicated region / customer cloud
```

**Changed in V2 — Tier A is the explicit stated default, not left implicit**: Tier A (shared DB + RLS, on the already-running self-hosted Supabase instance, with RLS made mandatory per `11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant Isolation) is the default for the Personal/Professional/Team majority. Dedicated DB (Tier B+) is reserved for a specific triggered Enterprise need and mapped as a formal `Entitlement` (`08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md`), not an ad hoc per-customer negotiation. Leaving this implicit, as V1 did, invites exactly the "dedicated-DB-for-extra-safety" overreach the anti-overengineering discipline in `01_SYSTEM_CONSTITUTION.md` warns against, on infrastructure that cannot elastically absorb that operational cost. See `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` §Tier Growth Path for the migration-procedure gap this pairs with. Full reasoning: `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md` CI-12, `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-08.

## Data residency

Tenant settings should support: `home_region`, `allowed_regions`, `data_residency_policy`, `backup_region`, `ai_processing_regions`.

> 🔴 **DECISION PENDING (`HD-14`)** — ratify "a signed enterprise/Group contract with a data-residency clause" as the explicit, named trigger for building real multi-region infrastructure, replacing the current implicit phase-ordering? **Recommended: yes** — keep the schema stubs above (cheap, no enforcement built yet) per the single-region-honestly-documented posture (see `20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md`, `HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md` §3c), and state honestly to customers that region enforcement isn't implemented yet. This is a low-cost, low-controversy ratification — but it's still the operator's call to name the exact trigger condition, not an engineering default. Full reasoning: `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-14.

## Platform control plane vs HCI data plane

Control plane may own: Accounts, Tenants, Subscriptions, Licenses, Entitlements, Plans, Regions, Deployments, Identity Providers, Feature Flags, Billing, Usage Metering.

HCI data plane owns HCI content. Control-plane operators must not automatically gain unrestricted HCI data access — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Admin Principle.

## Licensing

Private/on-prem deployments should support signed offline-verifiable licenses with: expiry, entitlements, seat_limit, deployment_id, grace_period. Signing private key remains with Aware Wave.

## External sharing

Support secure sharing with: expiry, MFA/password option, view-only, watermark, download control, revocation, audit.

## API idempotency

Commercial write APIs should support idempotency keys where duplicate effects are dangerous.

## Service accounts

Integrations must use service accounts, not employee personal tokens.

## Secret lifecycle

Support: creation, rotation, revocation, expiry.

## Export

Customers should be able to export their own data in portable formats such as JSON, CSV, PDF/A, Attachments, Audit export. Avoid data hostage.

**Note (new in V2)**: this same export path is the highest-value insider/compromised-account exfiltration path for RESTRICTED dossiers — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Bulk Export for the preventive control this requires.

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

**Pending question (new in V2)**: this lifecycle assumes clean per-tenant deletion. If public Claims/Sources end up shared across tenants researching the same public figure (`06_HCI30_PUBLIC_INTELLIGENCE.md` §Claim Object, `HD-16`), this lifecycle cannot simply delete on request without either retaining data past a lawful deletion request or breaking another tenant's evidence base — resolve `HD-16` before implementing this lifecycle's deletion step.

---

# Current Aware Wave deployment baseline

Current infrastructure baseline:

```text
OVHcloud Dedicated Server
ns3006986.ip-149-202-64.eu
(operationally: ks-aw-01, 149.202.64.114, SSH -p 58122)
```

This is an infrastructure-placement fact, not a data-residency policy.

**Verified 2026-08-29 (this session's own infrastructure work, not from the 9-reviewer review)**: this single dedicated server runs every AwareWave service today — WordPress, Next.js admin, node-api, oracle-web, MainWP, n8n, Postiz, self-hosted Supabase, self-hosted Trigger.dev, Uptime Kuma, Remotion/video services — via docker-compose + host nginx (TLS termination) + a second nginx hop (`lobster-nginx`) for app-level routing. There is no Kubernetes, no multi-region, no managed cloud DB, no service mesh, no message broker today. Two earlier VPS were fully consolidated into this single box on 2026-08-28 and are stopped (kept only as rollback). The operator is effectively solo (one person + AI agents). **Every deployment recommendation in this document set must be read against this actual baseline, not a larger imagined one.**

## Active plane model

```text
Public Brand Plane
- www / docs (live, placeholder) / trust (live, placeholder) / status (planned)

Customer Product Plane
- cognitive (building) / hci (planned) / portal (live, identity layer)

Public Integration Plane
- api (live)

Internal Operations Plane
- app / oracle / studio / supabase / trigger / n8n / postiz /
  mainwp / uptime / remotion-svc / video-svc (all live)
```

## Mandatory invariant

```text
app.aware-wave.com
!=
portal.aware-wave.com
```

`app` is an internal operations console. `portal` is an external multi-tenant customer control plane.

## Authoritative service placement

**Changed in V2 — this file is now required to actually exist, not merely cited**: `D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md` is referenced by name in four separate V1 chapters, and was verified (via direct `ls`) to not exist. Under this project's own R4 discipline ("claim before verify"), a document telling every future reader to trust a file that isn't there is itself a defect. Either create the file (even a stub inventory using the field list in `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`) before Wave 1, or stop citing it as though it already exists. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-01.

Do not use stale architecture notes as deployment truth.
