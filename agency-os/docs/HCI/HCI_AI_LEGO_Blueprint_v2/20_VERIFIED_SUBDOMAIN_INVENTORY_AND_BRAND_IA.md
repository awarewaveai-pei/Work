# 20 — Verified Subdomain Inventory & Brand IA Baseline

## Status

Current active architecture baseline as of **2026-08-29**, re-verified against live infrastructure at V2 publication time (this session's own work, not from the 9-reviewer review — see `agency-os/WORKLOG.md` 2026-08-29 續17/18/20/21).

This document contains only current or planned active architecture. Historical host information belongs outside the active source of truth.

---

# 1. Current infrastructure baseline

```text
Provider: OVHcloud
Type: Dedicated Server
Server: ns31414856.ip-145-239-195.eu
Operational alias: ks-aw-01 (145.239.195.47, SSH -p 58122)
```

Management reference: `https://manager.ca.ovhcloud.com/#/dedicated/server/ns3006986.ip-149-202-64.eu`

Important: `server hostname != data residency policy`. Actual data residency must be derived from storage, backup, processing, logging, and subprocessors.

---

# 2. Current / planned subdomains — verified state

| Subdomain | Role | Audience | State (verified 2026-08-29) |
|---|---|---|---|
| `www` | Company / brand website | Public | **Live** |
| `api` | Unified external API gateway | Developers / integrations | **Live** |
| `app` | Lobster Factory internal operations console | Aware Wave internal staff | **Live** |
| `cognitive` | AI LEGO Cognitive Engineering OS | Product users | Building |
| `hci` | HCI-30 | Product users | Not yet reserved (see `03` §hci.aware-wave.com for the deliberate dangling-DNS-avoidance rationale) |
| `portal` | External customer account / subscription / product launcher | External customers | **Live** — identity/login layer deployed (`WORKLOG.md` 2026-08-29), signup deliberately gated |
| `docs` | Technical / user documentation | Developers / users | **Live** — DNS + nginx placeholder, no content yet |
| `trust` | Security / privacy / compliance | Enterprise buyers / procurement | **Live** — DNS + nginx placeholder, no content yet |
| `status` | Public service-health surface | Public | Not yet reserved |

**Correction from V1**: V1 listed `docs`/`trust`/`portal` as "Planned" — verified now live as of this session's own infrastructure work, including a real incident (docs/trust briefly routed into the internal MainWP admin console due to a missing host-nginx `default_server`) found and fixed the same day. See `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md` §6 for the plane-separation verification lesson this incident taught.

---

# 3. Internal operations / infrastructure surfaces

These must be tracked operationally but excluded from public brand IA:

```text
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

`app` is also internal-only, but remains documented separately because it is an important Aware Wave application boundary.

---

# 4. Critical naming invariant

```text
app.aware-wave.com
!=
portal.aware-wave.com
```

## `app`
Internal operations/admin plane. Responsibilities may include: repair, inbox, provisioning, customer administration, internal RBAC. Audience: Aware Wave staff only.

## `portal`
External customer account/control plane. Responsibilities: login, account, tenant membership, organization, subscription, billing, entitlements, product launcher, customer security settings, customer API credentials. Audience: HCI customers, Cognitive OS customers, future Aware Wave product customers.

---

# 5. Public brand IA

```text
aware-wave.com / www.aware-wave.com
│
├── hci.aware-wave.com          (not yet reserved)
│   HCI-30
│
├── cognitive.aware-wave.com    (building)
│   AI LEGO Cognitive Engineering OS
│
├── portal.aware-wave.com       (live)
│   Customer account / subscriptions / product launcher
│
├── api.aware-wave.com          (live)
│   Unified external API gateway
│
├── docs.aware-wave.com         (live, placeholder)
│   Documentation
│
├── trust.aware-wave.com        (live, placeholder)
│   Security / privacy / compliance
│
└── status.aware-wave.com       (not yet reserved)
    Public service health
```

Internal operations systems are not part of this public IA.

---

# 6. Infrastructure planes

```text
PUBLIC BRAND PLANE
www / docs / trust / status

CUSTOMER PRODUCT PLANE
hci / cognitive / portal

PUBLIC INTEGRATION PLANE
api

INTERNAL OPERATIONS PLANE
app / oracle / studio / supabase / trigger /
n8n / postiz / mainwp / uptime /
remotion-svc / video-svc
```

**Enforcement note (new in V2)**: this separation must be verified by content comparison (not just DNS/routing config review) after every new subdomain launch — see the `03` §6 incident record for why status-code-only verification is insufficient (a misrouted subdomain returned 200 with the wrong content, not an error code).

---

# 7. Data-location requirements

Before HCI / Portal production launch, define: tenant home region, control-plane region, HCI data-plane region, backup region, AI processing region, public-intelligence processing region, cross-region event/log policy. Do not infer these from DNS names or hostnames.

---

# 8. Service placement registry

Maintain an authoritative current inventory at `D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md`.

**Status (new in V2)**: verified via direct filesystem check that this file does not currently exist, despite being cited as the SSOT by four separate blueprint chapters. Create it (even as a stub using the field list below) before Wave 1, or stop citing it. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-01.

Required fields: `service_id`, `public_hostname`, `role`, `audience`, `current_host`, `runtime/container`, `internal_port`, `reverse_proxy`, `database`, `persistent_volumes`, `secrets_source`, `backup_target`, `monitoring`, `public_exposure`, `network_zone`, `owner`, `verification_status`.

---

# 9. Architecture consequences

## HCI
`hci.aware-wave.com` — independent product frontend.

## Cognitive
`cognitive.aware-wave.com` — independent product frontend.

## Portal
`portal.aware-wave.com` — external multi-tenant customer control plane. **Live, identity layer only.**

## App
`app.aware-wave.com` — internal operations only.

## API
`api.aware-wave.com` — unified external API boundary.

## Status
`status.aware-wave.com` — public read-only status surface.
