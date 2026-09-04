# Tenant Architecture Standard

Cross-tenant data leakage is a hard invariant violation, not a bug to be fixed with normal priority — it MUST be prevented structurally, not only by application-code discipline.

Required: an explicit tenant-context propagation mechanism present on every request/job (no code path may run without a resolved tenant context except explicitly-declared cross-tenant system operations), row-level security (RLS) or an equivalent database-enforced isolation mechanism as defense-in-depth beneath application-layer checks, a clear mapping of organization/workspace concepts onto the tenant model (`commercial/TENANT_COMMERCIAL_MODEL.md`), explicit rules for any delegated cross-tenant access (support tooling, group administration), and automated isolation tests that actively attempt cross-tenant reads and assert they fail.

Noisy-neighbor effects (one tenant's load degrading another's performance) MUST be mitigated by design (quotas, rate limits, or physical isolation for the highest-risk tenants), not left to capacity planning alone. Every tenant MUST have a queryable, tenant-scoped audit trail of actions taken within it.
