# codex-oracle review -- 2026-10-16 09:23:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0103_social_brand_members.sql, lobster-factory/packages/db/scripts/0103_social_brand_members-local-verify.sh, lobster-factory/packages/db/scripts/0103_social_brand_members-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/signup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/signup/__tests__/closed-until-email-verified.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `219238c36`
- context: Round 2 after your round 1 (agency-os/reports/oracle/2026-10-15-partialreview-9a3d08d3.md: email-based member add trusts a portal signup that pre-confirms emails) and a db-expert review. Invariant: an account gains a brand role only through an email its owner has proven. Fixes: 0103 also requires auth.users.email_confirmed_at; portal signup is now closed in code (SIGNUP_VERIFIES_EMAIL = false, env switches alone cannot open it) until a confirmation-email flow replaces email_confirm:true, pinned by a test; the two security definer functions use search_path = empty (definer is superuser; postgres has CREATE on public in prod); add uses insert .. on conflict do nothing then SC409 (no raw 23505 on concurrent adds); local verify adds an unconfirmed account and a two-session test (two owners demoted at once: one refused), mutation of FOR UPDATE turns it red. Production: portal signup env is empty today, 1 auth user, 0 member rows.
- exit: 0 | elapsed: 235128ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/signup/__tests__/closed-until-email-verified.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/api/signup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts, lobster-factory/packages/db/migrations/0103_social_brand_members.sql, lobster-factory/packages/db/scripts/0103_social_brand_members-local-verify.sh, lobster-factory/packages/db/scripts/0103_social_brand_members-local-verify.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
