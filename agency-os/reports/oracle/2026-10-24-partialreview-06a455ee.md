# codex-oracle review -- 2026-10-24 22:22:52 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/staff-access.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase/session-cache.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase/__tests__/session-cache.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/hosts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-staff-tools.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C2 of per-staff tool grants (agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md section 6, auth boundary, Deep): middleware reads app_metadata.staff_tools into the cached identity, strips and injects x-ops-tools, and judges every staff page/API on staff and product doors with staffDenial (owner always passes; platform passes; unclaimed path refused; never-set = not_configured). STAFF_TOOLS_MODE defaults to shadow (exact enforce only): shadow only logs would_deny, behaviour unchanged. Check: any path where enforce could be bypassed (fast/stale cache path, product door rewrite, header spoofing, case/encoding of pathname), any way shadow could change behaviour, owner lock-out, redirect loops, log flooding or PII.
- exit: 0 | elapsed: 205338ms | answer: 1552B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/hosts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase/__tests__/session-cache.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase/session-cache.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-staff-tools.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/staff-access.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Enforced page denials redirect to a nonexistent `/no-access` page, producing a 404 instead of an access-denied screen.
  middleware.ts:142-145 -> lib/__tests__/middleware-staff-tools.test.ts:39-47
  confidence  -> CONFIRMED
  scenario    -> `STAFF_TOOLS_MODE=enforce`, operator lacks `ops/clients`, requests `/ops/clients` -> 307 to `/no-access?tool=ops/clients` -> no matching route -> 404.
  why missed  -> The test verifies only the redirect location and middleware pass-through; no route-existence/render test exists.

FINDING 2: A denied API response drops refreshed Supabase cookies.
  middleware.ts:141 -> ssr.ts:68-73; middleware.ts:421-424
  confidence  -> CONFIRMED
  scenario    -> A staff API request triggers token rotation, then fails the tool check -> JSON 403 is returned without applying `cookiesToCopy` -> the browser retains the expired token and can be logged out on the next request.
  why missed  -> The new test mocks `refreshedCookies` as an empty array and checks only status/body.

FINDING 3: Shadow logging can be flooded with attacker-controlled unique paths.
  middleware.ts:135-140 -> staff-tools.ts:109-112; staff-access.ts:83-91
  confidence  -> CONFIRMED
  scenario    -> An authenticated staff user sends thousands of distinct unclaimed paths such as `/x-1`, `/x-2`, … in shadow mode -> each path creates a new log key and emits `would_deny`; `LOG_MAX` bounds memory, not log volume.
  why missed  -> The limiter is per user/path/verdict, with no per-user or global emission rate limit.

TOTAL: 3 findings
