> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md. See 00_README.md in this folder for why.

# 20 — Verified Subdomain Inventory & Brand IA Baseline

## Status

Current active architecture baseline as of **2026-08-29**.

This document contains only current or planned active architecture. Historical host information belongs outside the active source of truth.

---

# 1. Current infrastructure baseline

```text
Provider: OVHcloud
Type: Dedicated Server
Server: ns3006986.ip-149-202-64.eu
```

Management reference:

```text
https://manager.ca.ovhcloud.com/#/dedicated/server/ns3006986.ip-149-202-64.eu
```

Important:

```text
server hostname
!=
data residency policy
```

Actual data residency must be derived from storage, backup, processing, logging, and subprocessors.

---

# 2. Current / planned subdomains

| Subdomain | Role | Audience | State |
|---|---|---|---|
| `www` | Company / brand website | Public | Existing |
| `api` | Unified external API gateway | Developers / integrations | Existing |
| `app` | Lobster Factory internal operations console | Aware Wave internal staff | Existing |
| `cognitive` | AI LEGO Cognitive Engineering OS | Product users | Building |
| `hci` | HCI-30 | Product users | Planned |
| `portal` | External customer account / subscription / product launcher | External customers | Planned |
| `docs` | Technical / user documentation | Developers / users | Planned |
| `trust` | Security / privacy / compliance | Enterprise buyers / procurement | Planned |
| `status` | Public service-health surface | Public | Planned public surface |

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

Internal operations/admin plane.

Responsibilities may include:

```text
repair
inbox
provisioning
customer administration
internal RBAC
```

Audience:

```text
Aware Wave staff only
```

## `portal`

External customer account/control plane.

Responsibilities:

```text
login
account
tenant membership
organization
subscription
billing
entitlements
product launcher
customer security settings
customer API credentials
```

Audience:

```text
HCI customers
Cognitive OS customers
future Aware Wave product customers
```

---

# 5. Public brand IA

```text
aware-wave.com / www.aware-wave.com
│
├── hci.aware-wave.com
│   HCI-30
│
├── cognitive.aware-wave.com
│   AI LEGO Cognitive Engineering OS
│
├── portal.aware-wave.com
│   Customer account / subscriptions / product launcher
│
├── api.aware-wave.com
│   Unified external API gateway
│
├── docs.aware-wave.com
│   Documentation
│
├── trust.aware-wave.com
│   Security / privacy / compliance
│
└── status.aware-wave.com
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

---

# 7. Data-location requirements

Before HCI / Portal production launch, define:

```text
tenant home region
control-plane region
HCI data-plane region
backup region
AI processing region
public-intelligence processing region
cross-region event/log policy
```

Do not infer these from DNS names or hostnames.

---

# 8. Service placement registry

Maintain an authoritative current inventory at:

```text
D:\Work\agency-os\docs\infrastructure\CURRENT_SERVICE_PLACEMENT.md
```

Required fields:

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

---

# 9. Architecture consequences

## HCI

```text
hci.aware-wave.com
```

Independent product frontend.

## Cognitive

```text
cognitive.aware-wave.com
```

Independent product frontend.

## Portal

```text
portal.aware-wave.com
```

External multi-tenant customer control plane.

## App

```text
app.aware-wave.com
```

Internal operations only.

## API

```text
api.aware-wave.com
```

Unified external API boundary.

## Status

```text
status.aware-wave.com
```

Public read-only status surface.
