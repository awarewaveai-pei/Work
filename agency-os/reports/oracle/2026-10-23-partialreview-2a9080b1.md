# codex-oracle review -- 2026-10-23 17:45:31 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tenant-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/ops-role-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Authorization change. Customers (x-ops-user-kind: client, set only by middleware after stripping client-supplied identity headers) had no ops role and resolved to viewer, so ~95 product routes gated on canCreateAiImageJob (owner/admin/operator) returned 403 to every customer on a product door. resolveOpsRole now returns role "operator" with source "client" for a client identity before reading claims (a client can no longer obtain owner/admin via claims). tenant-guard gains userKindOf(headers) (exact "client") shared by resolveTenant and resolveOpsRole. Gates in registry-code.test.ts now run on built doors (door page exists) instead of served doors; tarot is built but enabled:false (going live needs nginx/DNS, checked by middleware-portal-guards.test.ts). A client is confined to its door's paths by middleware isClientOutsideDoor (doors.ts doorApis). Find: any route reachable by a client where operator grants cross-organization access or a staff-only power; any path outside the middleware matcher where a caller-supplied x-ops-user-kind: client now yields operator; any consumer of the role source value that breaks. Return no findings if none are real.
- exit: 0 | elapsed: 743735ms | answer: 1338B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tenant-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/ops-role-client.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A client without an organization binding falls back to the internal entitlement account.

  file:line   -> `lib/ops-role.ts:48-50` -> `lib/entitlements/subject.ts:60-69` -> `app/api/social/rewrite/route.ts:7`

  confidence  -> CONFIRMED

  scenario    -> Client session has `user_kind=client` but blank `org_id` -> middleware sets client identity without an org -> `resolveSubject` selects the internal organization -> the client consumes internal entitlements and reaches the social rewrite handler.

  why missed  -> Tests always provide `x-ops-org-id` (`lib/__tests__/ops-role-client.test.ts:10-16`).

FINDING 2: The production compose configuration leaves entitlement enforcement in shadow mode, so the new operator role grants free access to denied paid features.

  file:line   -> `docker-compose.yml:279-283` -> `lib/entitlements/can.ts:65-67,197-199` -> `lib/entitlements/grant.ts:51-53`

  confidence  -> CONFIRMED

  scenario    -> Compose starts without `ENTITLEMENT_MODE=enforce`, and a client lacks `social.rewrite` entitlement -> entitlement denial is converted into an allowed shadow grant -> `/api/social/rewrite` executes without charging credits.

  why missed  -> The added tests verify role predicates only; they do not exercise `withFeature` under the deployed entitlement configuration.

TOTAL: 2 findings
