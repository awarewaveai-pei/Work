# Tenant Context Standard

P0-07. Required fields per `21_HCI_TOP_TIER_GAP_ANALYSIS.md`: `tenant_id`,
`organization_id`, `workspace_id`, `actor_id`, `service_account_id`,
`request_id`, `data_region`, `policy_context`.

**Status: 3 of 8 fields transcribable from ADR-0009 (ACCEPTED); the other 5
have zero prior design anywhere in the corpus and are left OPEN, not
invented.** The gap analysis's own text says not to freeze this standard
until ADR-0009's mapping, compatibility/migration plan, and cross-tenant
negative-test gates are closed — gates 1-2 are closed, gate 3
(`TENANT-ADAPTER-NEG-01..03`) is **genuinely blocked**, "cannot be run until
HCI has an executable API, database, and non-superuser tenant role"
(`governance/wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md` §Runtime-
verification gate) — the database and tenant roles exist, the API does not.
The same missing API/application layer is why 5 of these 8 fields have no
design yet: they are request-tracing/authorization-context fields that only
make sense once something is actually receiving HTTP/event traffic, which
is P0-06's job (API + event contracts), not built yet either.

## `tenant_id` — CLOSED

HCI's own immutable, product-owned identifier. Every tenant-owned table
carries `tenant_id NOT NULL` with forced RLS (ADR-0016). This is the one
field of the eight that is fully implemented today, not just designed.

## `organization_id` — CLOSED, but not the field the reader will assume

**Do not conflate this with an HCI-native concept** — the adapter contract's
own "Canonical meanings" table names this exact confusion as "not
permitted." `organization_id` belongs to the **portal product**, not HCI:
it is the portal's customer-identity/membership record. HCI never treats a
portal `organization_id` as a second source of truth for tenancy, and never
infers HCI access from a portal organization alone
(`HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md` §Adapter mapping, rule 2).
The two products are bridged only through
`organization_product_subscriptions.external_tenant_id` — a nullable,
non-FK seam on the portal side (`lobster-factory/packages/db/migrations/
0062_organization_product_subscriptions.sql`) — never a direct cross-product
database query or foreign key (rule 3). When HCI needs to carry an
"organization" concept in a tenant-context payload, it is this portal-owned
value received through the signed/versioned adapter contract, not a column
HCI's own schema defines.

## `workspace_id` — CLOSED as a relationship concept, no schema backing yet

"A Workspace belongs to exactly one HCI Tenant. An Organization relationship
node is scoped inside that Workspace and never changes the tenant context"
(`HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md` §Adapter mapping, rule 4).
This is a decided *relationship rule*, not a built table — grep of
`docs/domain/HCI_ENTITY_DICTIONARY.md` (P0-01, exhaustive over all 11
migrations) finds no `Workspace` entity. Wave 1 has no Workspace-scoped
data; the rule exists to constrain a *future* schema addition (a Workspace
must nest under exactly one Tenant, never span tenants) rather than to
document one that ships today.

## `actor_id`, `service_account_id`, `request_id` (generic tracing), `data_region`, `policy_context` — OPEN, zero prior art

Checked `ADR-0009-tenant-organization-model-reconciliation.md` in full and
every Wave 1 migration: none of these five terms appears anywhere outside
one narrow, unrelated use. **A `request_id` column does exist in the
schema** (`hci.data_subject_request_events`, `hci.data_subject_request_
targets`, `0001_wave1_synthetic_up.sql:175,181`) — but that is a
domain-specific foreign key to *which Data Subject Request* an event
belongs to, not a generic per-API-call trace ID. Reusing the same name for
both would be exactly the kind of conflation the adapter contract's
"Canonical meanings" table warns against for Tenant/Organization — flagged
here so a future implementer does not assume DSR's `request_id` already
satisfies this standard's `request_id`.

None of the other four fields (`actor_id`, `service_account_id`,
`data_region`, `policy_context`) has any column, ADR, or design note
anywhere in the corpus. This is not an oversight this file can close: they
are properties of an authentication/API-gateway layer
(who is calling — human actor vs. service account; which jurisdiction's
data-residency rules apply; what policy context — edition, entitlement,
regulatory scope — governs this request) that cannot be meaningfully
specified before P0-06's API + event contracts exist to carry them. Writing
a speculative shape now would be inventing API-layer design out of sequence,
the same failure mode `21_HCI_TOP_TIER_GAP_ANALYSIS.md`'s own P0-07 text
warns against ("do not freeze it until... closed").

## What would unblock this

P0-06 (API + event contracts) landing enough of an initial shape — even a
draft — for auth scopes and request context, so this standard has something
concrete to define these five fields against, instead of inventing them
speculatively. Until then, this file's honest status is 3/8 closed.
