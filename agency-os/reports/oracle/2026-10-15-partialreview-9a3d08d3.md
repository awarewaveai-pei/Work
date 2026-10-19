# codex-oracle review -- 2026-10-15 19:29:29 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0103_social_brand_members.sql, lobster-factory/packages/db/scripts/0103_social_brand_members_down.sql, lobster-factory/packages/db/scripts/0103_social_brand_members-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/members/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Members.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialApp.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Review.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/__tests__/routes.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/members-store.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Brand member management for the social manager (ADR 018 section 3). Migration 0103 adds service_role-only RPCs over social_brand_members (0096): list with emails (security definer reading auth.users), add by email (existing live non-anonymous account, ambiguous refused, no duplicate), change role and remove (brand rows locked FOR UPDATE, the last owner row stays), each with its audit row in the same transaction and no email in the log. next-admin: lib/social/store.ts maps the RPC refusals to fixed Chinese messages and statuses; /api/social/members is owner-only (lib/social/authz.ts roleOn: member row wins, staff owner/admin owner everywhere); Members.tsx in the settings view (visible buttons, no select); LogView names the member actions with role names. Verified: local Postgres 15.8 script (behaviour, access, down, re-apply, idempotent), tsc, vitest 2390, mutations of the owner-only route and the last-owner check. Not applied to production yet.
- exit: 0 | elapsed: 682099ms | answer: 837B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Review.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialApp.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/__tests__/routes.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Members.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/members/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/members-store.test.ts, lobster-factory/packages/db/migrations/0103_social_brand_members.sql, lobster-factory/packages/db/scripts/0103_social_brand_members-local-verify.sql, lobster-factory/packages/db/scripts/0103_social_brand_members_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Email-based member assignment trusts an attacker-controlled portal signup identity.
  file:line   -> `app/portal/api/signup/route.ts:190-193`; `middleware.ts:226,301-308`; `packages/db/migrations/0103_social_brand_members.sql:45-58`; `app/api/social/members/route.ts:31-38`
  confidence  -> CONFIRMED
  scenario    -> With portal signup enabled, an attacker registers using another person’s email; signup sets `email_confirm: true`. A brand owner adds that email, the RPC resolves the attacker’s account and grants the role, so the attacker gains brand membership.
  why missed  -> Tests cover account existence, deletion, anonymity, ambiguity, and route authorization, but not email ownership. The RPC treats `auth.users.email` as identity proof while signup pre-confirms arbitrary submitted addresses.

TOTAL: 1 findings
