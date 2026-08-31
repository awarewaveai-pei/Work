> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md. See 00_README.md in this folder for why.

# 03 — Aware Wave Domain & Subdomain Map

## Authority

This document defines the **current active product/brand subdomain architecture** for Aware Wave.

Historical hosting information does not belong in this document.

---

# 1. Active / planned public architecture

```text
aware-wave.com
│
├── www.aware-wave.com
│   Company / brand website
│
├── hci.aware-wave.com
│   HCI-30
│
├── cognitive.aware-wave.com
│   AI LEGO Cognitive Engineering OS
│
├── portal.aware-wave.com
│   External customer account / subscription / product launcher
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
    Public service status
```

---

# 2. Confirmed product boundaries

## `www.aware-wave.com`

Role:

```text
Corporate / brand website
```

Audience:

```text
Public
```

## `api.aware-wave.com`

Role:

```text
Unified external API gateway
```

Audience:

```text
Developers
Integrations
Product clients
```

Must remain a routing/security boundary, not a business-logic host.

## `app.aware-wave.com`

Role:

```text
Lobster Factory internal operations/admin console
```

Audience:

```text
Aware Wave internal staff
```

Critical invariant:

```text
app.aware-wave.com
!=
portal.aware-wave.com
```

`app` must not become the external customer portal.

## `cognitive.aware-wave.com`

Role:

```text
AI LEGO Cognitive Engineering OS
```

Audience:

```text
Product users
```

## `hci.aware-wave.com`

Role:

```text
HCI-30
Human Collaboration Intelligence
```

Audience:

```text
Product users
```

HCI and Cognitive OS are independent peer products.

## `portal.aware-wave.com`

Role:

```text
Unified external customer control plane
```

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

## `docs.aware-wave.com`

Role:

```text
Technical + user documentation
```

Recommended information architecture:

```text
/docs/hci/
/docs/cognitive/
/docs/developers/
```

## `trust.aware-wave.com`

Role:

```text
Security
Privacy
Compliance
Enterprise trust center
```

## `status.aware-wave.com`

Role:

```text
Public service-health surface
```

May use the existing monitoring implementation as source of truth, but public status must remain read-only and must not expose internal administration.

---

# 3. Internal operations surfaces

The following are infrastructure / operations / internal-project systems and MUST NOT appear as public product navigation merely because they have DNS entries:

```text
app
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

They remain part of infrastructure inventory, security scope, backup scope, and incident-response scope.

---

# 4. API namespace

Preserve:

```text
api.aware-wave.com
```

Recommended namespaces:

```text
/hci/v1/...
/cognitive/v1/...
/platform/v1/...
/integrations/v1/...
```

Prefer product-first versioning so HCI and Cognitive OS can evolve independently.

---

# 5. API gateway responsibility

Allowed:

```text
authentication enforcement
tenant-context validation
routing
WAF/security controls
rate limiting
API version routing
request IDs
observability hooks
```

Forbidden:

```text
HCI trust logic
HCI risk logic
Cognitive method logic
billing business rules
product-specific domain behavior
```

---

# 6. Product plane separation

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

This distinction must be reflected in:

```text
Cloudflare policies
DNS inventory
SSO
access control
WAF rules
observability
backup
incident response
documentation
```

---

# 7. Brand strategy

```text
Aware Wave
├── HCI-30 by Aware Wave
└── AI LEGO Cognitive Engineering OS by Aware Wave
```

This is a branded-house architecture with strict product separation.
