# 03 — Aware Wave Domain & Subdomain Map

## Authority

This document defines the **current active product/brand subdomain architecture** for Aware Wave.

Historical hosting information does not belong in this document.

**V2 status note**: this chapter is infrastructure/brand-IA scope, not HCI-30 domain-model scope, and was only lightly touched by the 9-reviewer HCI architecture review. Its content below has been updated instead against this session's own verified infrastructure work (2026-08-29): `docs.aware-wave.com` and `trust.aware-wave.com` are now **live** (Cloudflare A record + dedicated nginx vhost + cert SAN, serving a neutral placeholder page — not "Planned" as V1 stated). See `agency-os/WORKLOG.md` 2026-08-29（續17/18）for the deploy record.

---

# 1. Active / planned public architecture

```text
aware-wave.com
│
├── www.aware-wave.com
│   Company / brand website — LIVE
│
├── hci.aware-wave.com
│   HCI-30 — planned, DNS not yet reserved
│
├── cognitive.aware-wave.com
│   AI LEGO Cognitive Engineering OS — building
│
├── portal.aware-wave.com
│   External customer account / subscription / product launcher — LIVE (identity layer; signup gated, see HD below)
│
├── api.aware-wave.com
│   Unified external API gateway — LIVE
│
├── docs.aware-wave.com
│   Documentation — LIVE (placeholder, no content yet)
│
├── trust.aware-wave.com
│   Security / privacy / compliance — LIVE (placeholder, no content yet)
│
└── status.aware-wave.com
    Public service status — planned, DNS not yet reserved
```

---

# 2. Confirmed product boundaries

## `www.aware-wave.com`

Role: Corporate / brand website. Audience: Public.

## `api.aware-wave.com`

Role: Unified external API gateway. Audience: Developers, integrations, product clients. Must remain a routing/security boundary, not a business-logic host.

## `app.aware-wave.com`

Role: Lobster Factory internal operations/admin console. Audience: Aware Wave internal staff.

Critical invariant:

```text
app.aware-wave.com
!=
portal.aware-wave.com
```

`app` must not become the external customer portal.

## `cognitive.aware-wave.com`

Role: AI LEGO Cognitive Engineering OS. Audience: Product users.

## `hci.aware-wave.com`

Role: HCI-30, Human Collaboration Intelligence. Audience: Product users.

HCI and Cognitive OS are independent peer products at the domain layer (see `02_PRODUCT_BOUNDARIES.md`).

**DNS reservation status**: not yet reserved. Per the "new subdomain/service checklist" (`runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md` §1e), do not reserve DNS until HCI-30 is close enough to shipping to avoid dangling-DNS/subdomain-takeover exposure — same discipline already applied to `cognitive.aware-wave.com`.

## `portal.aware-wave.com`

Role: Unified external customer control plane. Responsibilities: login, account, tenant membership, organization, subscription, billing, entitlements, product launcher, customer security settings, customer API credentials. Audience: HCI customers, Cognitive OS customers, future Aware Wave product customers.

**Status**: identity/login layer is deployed to production (commit `83277d80`, `WORKLOG.md` 2026-08-29). Signup is deliberately gated off pending `PORTAL_SIGNUP_ENABLED`/`TURNSTILE_SECRET_KEY`. See `HD-01` in `02_PRODUCT_BOUNDARIES.md` for the unresolved Tenant/Organization data-model question this real deployment surfaced.

## `docs.aware-wave.com`

Role: Technical + user documentation. Recommended information architecture:

```text
/docs/hci/
/docs/cognitive/
/docs/developers/
```

**Status**: DNS + nginx placeholder live; no content yet.

## `trust.aware-wave.com`

Role: Security, privacy, compliance, enterprise trust center.

**Status**: DNS + nginx placeholder live; no content yet. This will be the natural home for the customer-facing artifacts referenced throughout `11_SECURITY_PRIVACY_GOVERNANCE.md` and `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-02 (security control crosswalk) once those exist.

## `status.aware-wave.com`

Role: Public service-health surface. May use the existing Uptime Kuma monitoring implementation as source of truth (`uptime.aware-wave.com` already exists internally), but public status must remain read-only and must not expose internal administration. **Not yet reserved** — recommended approach is opening a public view on the existing Uptime Kuma instance rather than a new build (`HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md`, `status.aware-wave.com` item).

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

They remain part of infrastructure inventory, security scope, backup scope, and incident-response scope. This list is verified current as of 2026-08-29 against the live Cloudflare zone (`WORKLOG.md` 2026-08-29 續18).

---

# 4. API namespace

Preserve `api.aware-wave.com`. Recommended namespaces:

```text
/hci/v1/...
/cognitive/v1/...
/platform/v1/...
/integrations/v1/...
```

Prefer product-first versioning so HCI and Cognitive OS can evolve independently.

---

# 5. API gateway responsibility

Allowed: authentication enforcement, tenant-context validation, routing, WAF/security controls, rate limiting, API version routing, request IDs, observability hooks.

Forbidden: HCI trust logic, HCI risk logic, Cognitive method logic, billing business rules, product-specific domain behavior.

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

This distinction must be reflected in: Cloudflare policies, DNS inventory, SSO, access control, WAF rules, observability, backup, incident response, documentation. **Verified 2026-08-29**: a real gap of exactly this kind (public brand-plane hostnames silently routing into the internal MainWP admin console due to a missing host-nginx `default_server`) was found and fixed the same day this plan was written — see `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md` §5 for the incident record. Treat plane separation as something that must be verified by content comparison after every new subdomain launch, not assumed from DNS/routing config alone.

---

# 7. Brand strategy

```text
Aware Wave
├── HCI-30 by Aware Wave
└── AI LEGO Cognitive Engineering OS by Aware Wave
```

This is a branded-house architecture with strict product separation.
