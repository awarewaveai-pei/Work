# ADR-0009 — Tenant / Organization Model Reconciliation

Status: **ACCEPTED**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-01=A`
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not create a database schema, migration, or production behavior.

## Context

HCI previously described an undesigned `Tenant → Organization → Workspace → Project` hierarchy, while AI LEGO's accepted `ADR-003-tenant-model-and-cas-isolation.md` defines Tenant as the platform's outermost billing/legal/deployment entity with `Tenant 1:N Workspace`. The existing portal `organizations` record is a product-layer construct and must not silently become a second platform Tenant model.

## Decision

Adopt **HD-01 option A**: AI LEGO ADR-003's three-level Tenant model is the shared platform primitive for HCI. HCI represents an Organization as an attribute or graph node beneath a Workspace; the portal `organizations` record remains an adapter to that platform identity, not a competing Tenant source of truth.

This decision does not authorize direct cross-product database access or an implicit migration of portal data. Those boundaries remain governed by their own ADRs and integration contracts.

## Required implementation gates

The design artifacts are now specified in `wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md` and `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`, but runtime implementation gates are **OPEN**. Wave 1 may not freeze a tenant schema until all of the following are implemented and reviewed:

1. A tenant/organization mapping artifact that specifies the HCI-to-portal adapter mapping, ownership, lifecycle, and the treatment of `external_tenant_id`.
2. A compatibility and migration plan for any already-shipped portal organization data; no destructive or automatic migration is implied by this ADR.
3. A cross-tenant negative test proving an unauthorized tenant cannot read or write another tenant's HCI data through the adapter or mapping path.

## Consequences

- HCI has one platform Tenant semantic and does not promote `organizations` to a second platform root.
- Organization-assessment functionality is still governed by ADR-0011; this ADR only fixes the tenancy identity boundary.
- A later change to the mapping requires a new HCI change proposal and an explicit superseding ADR.

## Verification and rollback

- Verification recorded here is documentation-only: source ownership and the approved option are cross-linked to `02_PRODUCT_BOUNDARIES.md`, `governance/ADR_INDEX.md`, and the Wave 1 decision record.
- The required schema, migration, and negative test have not been implemented; their gates remain open.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback must follow the approved migration plan; it must not rewrite tenant ownership in place.

## Implementation note (2026-09-05 - investigation only, no schema change; gate 3 confirmed genuinely blocked, not an HCI-30 gap)

Recorded here rather than editing the numbered gates above, which remain
the historical decision record. Prompted by the standing "work through the
Wave 1 ADR queue" delegation, after ADR-0019's five gates closed the same
day (see that ADR's own Implementation note).

**Gates 1-2 re-verified, not rebuilt.** Before assuming these needed
schema work, the actual portal-side artifact they describe was read
directly: `lobster-factory/packages/db/migrations/0062_organization_product_subscriptions.sql`.
It already ships exactly what gate 1's "mapping artifact" and gate 2's
"compatibility and migration plan" require: `external_tenant_id uuid`,
nullable, explicitly commented `NULLABLE, INTENTIONALLY NOT A FOREIGN
KEY... NULL = not yet provisioned; the launcher must render "coming soon",
never fake a provisioned state`, plus a live-scoped unique index
(`org_product_subs_external_tenant_uniq ... where external_tenant_id is
not null and status <> 'canceled'`) that already enforces "one live portal
claimant per HCI tenant" - closing exactly the "duplicate request / fail
closed on any different claimant" row in
`wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md`'s own provisioning
table. **This means HCI-30's schema needs no mirror column, no reverse
pointer, and no new migration for this ADR at all** - the contract
document's own "Adapter mapping" rule 1 already says so explicitly ("HCI
owns an immutable `tenant_id`; the portal only stores it as
`external_tenant_id`"), and its own "Provisioning and lifecycle contract"
section states the portal migration "already enforces one live HCI
subscription per portal organization and one live portal claimant per
`external_tenant_id`; this contract adds no stronger claim until an HCI
Tenant implementation exists." Building an `hci.tenants` column anyway -
the initial plan before this verification - would have been the wrong
direction entirely: a redundant, coupling-creating seam the contract
explicitly forbids ("Not permitted: reusing a portal organization ID as
the HCI Tenant primary key" / "a cross-product DB foreign key").

**Gate 3 is genuinely blocked, confirmed by the contract's own text, not
merely unbuilt.** The contract's "Runtime-verification gate" section says
`TENANT-ADAPTER-NEG-01..03` "cannot be run until HCI has an executable
API, database, and non-superuser tenant role." Two of those three already
exist and are exhaustively tested by this session's own Wave 1 work: a
real PostgreSQL database and non-superuser tenant roles
(`hci_app_test_a`/`hci_app_test_b`) whose tenant isolation is proven by
`RLS-LEAK-01` through `-06`, `BITEMP-CROSSTENANT-01`,
`CRYPTO-CROSSTENANT-KEYREF-01`, and every other `*-CROSSTENANT-*`
assertion across migrations 0001-0010. The one missing piece is
"an executable API" - the adapter application layer that would receive an
authenticated portal request, resolve `external_tenant_id` for that
organization's live `product_key='hci'` subscription, and bind the
resulting DB session to that tenant's scope. **That code exists in
neither `hci30` nor `lobster-factory` today.** Writing a test against it
now would mean testing a strawman harness standing in for code that does
not exist, not the real adapter behavior - the same "don't build a narrow
version that has to be torn out" reasoning already applied to ADR-0019
gate 5's epistemic-label half and ADR-0018 gates 4-5. Left honestly
`OPEN`, same disposition as `ADR-0016`'s tenancy-principal mechanism
(resolved by `ADR-0033`, still open at runtime) and `ADR-0005` gate 2
("genuinely blocked on an application/API layer that does not exist yet
at Wave 1 schema stage").

**Conclusion: nothing to build in `hci30` for this ADR right now.** The
correct next step, when it happens, is an adapter/API-layer implementation
task spanning both `lobster-factory` (read the subscription seam) and
`hci30` (bind the resolved tenant into a request-scoped role/session) -
out of scope for a database-migration round and not undertaken here. No
migration file, fixture, or test was added; adding one would have been
premature schema surface, not progress.

## Evidence

- `02_PRODUCT_BOUNDARIES.md` — HD-01 alternatives and product-boundary context.
- `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR-003-tenant-model-and-cas-isolation.md` — accepted shared Tenant semantics.
- `D:\Work\agency-os\reports\decisions\2026-09-01-hci-wave-1-decision-tranche.md` — approval tranche and required artifacts.
- `D:\Work\lobster-factory\packages\db\migrations\0062_organization_product_subscriptions.sql` — the already-shipped portal-side seam and its live-scoped uniqueness guarantee, re-read 2026-09-05 to confirm gates 1-2 need no HCI-side schema mirror.
