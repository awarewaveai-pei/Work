# Tenant Commercial Model Standard

## Purpose
Define how the commercial layer (billing, entitlement, lifecycle) maps onto the technical tenant/multi-tenancy architecture, so a technical tenant boundary and a commercial account boundary don't silently diverge.

## Tenant as the Billing/Entitlement Boundary
1. Every technical tenant (`engineering/TENANT_ARCHITECTURE_STANDARD.md`) MUST map to exactly one commercial account/workspace unless explicitly composed under `commercial/GROUP_STANDARD.md`. An unmapped tenant (technically provisioned but with no commercial owner) MUST NOT be able to persist in production.
2. Cross-tenant billing is PROHIBITED by default: one tenant's usage MUST NOT be charged to another tenant's account without an explicit, audited group/delegation relationship.

## Account, Tenant, Organization, Workspace
3. Where this framework's generated system distinguishes account / tenant / organization / workspace as separate concepts, the mapping between them MUST be documented as a single diagram or table — ambiguity between these terms is a common source of billing and access-control bugs and MUST be closed at design time, not left to convention.

## Transfer, Merge, Split
4. Transferring a tenant between commercial owners MUST preserve billing history and entitlement audit trail; it MUST NOT be implemented as delete-and-recreate.
5. Merging two tenants MUST define conflict resolution for overlapping entitlements/limits before the merge, not resolve conflicts by silent overwrite. Splitting a tenant MUST define how shared billing history is apportioned.
6. Transfer/merge/split operations MUST follow `engineering/MIGRATION_STANDARD.md`'s full sequence with a rehearsed rollback, given their irreversibility risk.

## Consistency
7. This standard's tenant-to-account mapping is the single source of truth that `commercial/BILLING_ARCHITECTURE.md`, `commercial/ENTITLEMENT_STANDARD.md`, and `commercial/GROUP_STANDARD.md` MUST all derive from — none of them may define a competing notion of tenant boundary.
