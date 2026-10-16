# codex-oracle review -- 2026-10-16 10:55:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/mail/resend.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/accounts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/login/set-password, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/AccountsCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Members.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/members-store.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Staff-only client account creation in next-admin. Invariant: an account gets a brand role (0103 social_add_member requires auth.users.email_confirmed_at) only through an email its owner proved; the account is created email_confirm:false with no password, a generateLink hashed token is mailed via Resend as a URL-fragment link to /login/set-password, and verifyOtp runs only on button press. It must never touch staff accounts or another org's accounts; only staff owner/admin may call it. Look for privilege escalation (a user ending up user_kind staff or in the wrong org), token leakage, account takeover via re-invite/recovery, and broken compensation. ClientHubTabs/store/Members/members-store.test changes are only the new tab wiring and hint text.
- exit: 0 | elapsed: 372516ms | answer: 1979B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Members.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/members-store.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/client-invite.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/invite-copy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/mail/resend.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Link generation can target a different Auth user than the authorized profile.
  file:line   -> `lib/accounts/client-invite.ts:113-123` -> `lib/accounts/client-invite.ts:133-135`
  confidence  -> PLAUSIBLE
  scenario    -> Profile X retains email A after Auth changes X to B; Auth user Y now owns A. Re-inviting A authorizes X, but `generateLink({ email: A })` creates a recovery link for Y.
  why missed  -> Authorization uses user ID, while link generation switches back to email without verifying `user.email === args.email`.

FINDING 2: Auth lookup failures are silently misclassified.
  file:line   -> `lib/accounts/client-invite.ts:54-56` -> `lib/accounts/client-invite.ts:120-123`
  confidence  -> CONFIRMED
  scenario    -> `getUserById` temporarily returns an error; listing silently omits the account, while inviting the same address returns `409 email_taken` instead of retryable failure.
  why missed  -> The profile lookup checks its error, but both Auth lookups discard theirs.

FINDING 3: Failed compensation can permanently orphan an email.
  file:line   -> `lib/accounts/client-invite.ts:83-87` -> `lib/accounts/client-invite.ts:113-123`
  confidence  -> CONFIRMED
  scenario    -> Membership insertion fails, profile deletion fails, but Auth deletion succeeds. The retry finds the orphan profile, cannot find its Auth user, and permanently returns `email_taken`.
  why missed  -> Rollback ignores the profile-delete error and has no orphan-repair path.

FINDING 4: The email promises a 24-hour token lifetime without enforcing it.
  file:line   -> `lib/accounts/invite-copy.ts:30-31` -> `lib/accounts/client-invite.ts:133-135`
  confidence  -> PLAUSIBLE
  scenario    -> Auth is configured with a token TTL below 24 hours; a recipient opens the message later and receives an expired-link error despite the stated validity period.
  why missed  -> `generateLink` inherits Auth configuration, while the copy hard-codes “24 hours.”

TOTAL: 4 findings
