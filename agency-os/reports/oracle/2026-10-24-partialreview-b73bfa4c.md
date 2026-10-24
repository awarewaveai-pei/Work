# codex-oracle review -- 2026-10-24 22:44:07 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/staff-accounts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/staff/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/staff/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/staff/StaffAccess.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/staff/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C4 of per-staff tool grants (agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md section 6, account permissions, Deep): /ops/staff page and GET/PATCH/POST /api/ops/staff. Role and tools live in Supabase auth app_metadata (ops_role, staff_tools), read by middleware (already on main). Rules: only the owner writes (owner/admin read); an owner tools cannot change; the last owner cannot be demoted (writes serialized in-process, single container); every write audited in ops_audit_events under organizations.kind=internal; invite creates a staff user (viewer, no tools, email unconfirmed) and mails a recovery set-password link, same path as lib/accounts/client-invite.ts. Check: privilege escalation (non-owner write, admin promoting self, customer account turned staff), lock-out (zero owners, owner stripping own tools), app_metadata keys lost on update, invite touching an existing customer or creating a user without user_kind, audit gaps, UI letting a non-owner think a save happened.
- exit: 0 | elapsed: 287712ms | answer: 1935B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/staff/StaffAccess.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/staff/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/staff/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/staff/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/staff-accounts.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Writes succeed even when the required audit event is not recorded  
  file:line   -> `app/api/ops/staff/route.ts:65-70` -> `lib/accounts/staff-accounts.ts:149-163`  
  confidence  -> CONFIRMED  
  scenario    -> Metadata update succeeds, but the internal-org lookup or audit insert fails -> API returns 200 while no audit row exists.  
  why missed  -> Tests only mock successful inserts (`route.test.ts:13`, `85-92`).

FINDING 2: Failed invitations can leave an unaudited staff account behind  
  file:line   -> `lib/accounts/staff-accounts.ts:120-135` -> `app/api/ops/staff/route.ts:81-84`  
  confidence  -> CONFIRMED  
  scenario    -> `createUser` succeeds, then link generation or mail fails -> API returns an error, but the unverified staff user remains without an audit event.  
  why missed  -> The test mocks link generation and mail as always successful (`route.test.ts:14`, `29-31`).

FINDING 3: Admin read access is blocked in enforce mode unless `ops/staff` is separately granted  
  file:line   -> `app/api/ops/staff/route.ts:23-26` -> `lib/portal/staff-tools.ts:53` -> `middleware.ts:134-143`  
  confidence  -> CONFIRMED  
  scenario    -> An admin with `staff_tools: []` requests `/api/ops/staff` while `STAFF_TOOLS_MODE=enforce` -> middleware returns 403 before the route’s admin-read check runs.  
  why missed  -> Route tests invoke the handler directly and never pass through middleware (`route.test.ts:69-75`).

FINDING 4: Network failures permanently leave the UI in a busy state  
  file:line   -> `app/(shell)/ops/staff/StaffAccess.tsx:45-47` -> `StaffAccess.tsx:125-128`  
  confidence  -> CONFIRMED  
  scenario    -> PATCH or POST `fetch()` rejects due to a network failure -> the exception skips the reset call, leaving “儲存中…” or “寄送中…” disabled indefinitely.  
  why missed  -> Only HTTP responses are handled; rejected promises have no catch path.

TOTAL: 4 findings
