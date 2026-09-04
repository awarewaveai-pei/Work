# Group Standard

## Purpose
Define how multiple accounts/tenants compose under one commercial relationship (a group, holding company, region, or post-M&A structure) without inventing a second, incompatible lifecycle or entitlement model.

## Group as Composition, Not a New Primitive
1. A group MUST be modeled as a composition of existing accounts/tenants (`commercial/TENANT_COMMERCIAL_MODEL.md`), each still governed by `commercial/CUSTOMER_LIFECYCLE.md` and `commercial/ENTITLEMENT_STANDARD.md` individually. A group MUST NOT introduce a parallel lifecycle state machine.
2. Group membership MUST be an explicit, auditable relationship (parent-child or peer-set) with a documented authority: who can add/remove a member account.

## Delegated Governance
3. A group administrator's authority over member accounts MUST be scoped and explicit (e.g. "can view billing, cannot access customer data") per `governance/AUTHORITY_MODEL.md` — group admin MUST NOT imply unrestricted access to every member account by default.
4. Legal-entity boundaries within a group (for data residency, contracting, tax) MUST be tracked explicitly; a group UI convenience MUST NOT silently move data or billing across a legal-entity boundary that requires separate handling.

## Billing and Entitlement Roll-Up
5. Where a group has consolidated billing, `commercial/BILLING_ARCHITECTURE.md` MUST treat the group as an explicit billing-aggregation unit with per-member itemization preserved — consolidation MUST NOT destroy the per-account audit trail.
6. Group-level entitlement pooling (e.g. a shared seat pool) MUST define allocation rules per member account and MUST reconcile back to individual account entitlement records; it MUST NOT be implemented as an ungoverned shared bucket with no per-account accounting.

## Mergers, Splits, and Region Changes
7. Merging two accounts into a group, or splitting a member out of a group, MUST be treated as a governed migration following `engineering/MIGRATION_STANDARD.md`'s sequence, with a rehearsed rollback — not an ad hoc data-fix script run once under time pressure.
8. Any regional or legal-entity move triggered by group restructuring MUST re-evaluate residency and compliance commitments per `commercial/ENTERPRISE_STANDARD.md` before the move is finalized, not after.
