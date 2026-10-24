# codex-oracle review -- 2026-10-24 21:21:04 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/staff-tools.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/code-scan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C1 of per-staff tool grants (agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md section 6): a registry that maps every staff page and session-gated API to one or more staff tools (cells an owner ticks per employee) or to every staff member; nothing enforces it yet (C2 will, in middleware). Check: patterns that grant MORE than intended (a prefix covering a sensitive sub-route such as /api/ops/clients/credentials for the wrong tool), coverage tests that cannot fail, and the scanner refactor changing door-test behaviour. middleware.ts only gains an export keyword on PUBLIC_API_PATHS.
- exit: 0 | elapsed: 220808ms | answer: 1046B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/code-scan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/staff-tools.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Broad client ownership is unioned with narrower ownership, granting specialized APIs to the wrong tool.
  file:line   -> `staff-tools.ts:15-23,89-102` -> `R0-PLAN.md:85`
  confidence  -> CONFIRMED
  scenario    -> Employee has only `ops/clients` -> `/api/ops/clients/acme/cs-knowledge` resolves to both `ops/clients` and `cs`, so C2’s “any one key” check grants the CS API.
  why missed  -> `staff-tools.test.ts:99` explicitly expects both owners, locking in the over-grant.

FINDING 2: `/api/theme` is assigned to the theme tool instead of the platform set.
  file:line   -> `staff-tools.ts:47-58` -> `R0-PLAN.md:84`, `app/api/theme/route.ts:18-24`
  confidence  -> CONFIRMED
  scenario    -> Employee has `ops/schedules` but not `tools/theme` -> future C2 enforcement denies their session-gated `GET /api/theme`, despite the plan classifying it as usable by every staff member.
  why missed  -> Coverage tests verify only that the route has an owner, not that platform-wide routes are classified as platform.

TOTAL: 2 findings
