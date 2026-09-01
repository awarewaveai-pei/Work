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

## Evidence

- `02_PRODUCT_BOUNDARIES.md` — HD-01 alternatives and product-boundary context.
- `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR-003-tenant-model-and-cas-isolation.md` — accepted shared Tenant semantics.
- `D:\Work\agency-os\reports\decisions\2026-09-01-hci-wave-1-decision-tranche.md` — approval tranche and required artifacts.
