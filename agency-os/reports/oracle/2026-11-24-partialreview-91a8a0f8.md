# codex-oracle review -- 2026-11-24 16:12:10 +08:00

- mode: `review`
- scope: whole repo
- target: `49257f977..HEAD`
- context: Platform batch 10. M6: new signed webhook route app/api/webhooks/awarewave-wp-member (member_invite event -> ensureWpCustomer with inviteCode) plus store plugin MemberInvite.php landing page that sends the code only after email verification. M8: migration 0182 member transfer -- a transfer invite replaces the account's current member inside member_invite_redeem (same advisory lock), audit row, unique index one identity per organization; new route member-transfer; shared staff guards. K14: tests only plus a visible-name string change. Focus on M6 and M8: signature and site verification on the new route, who may redeem or transfer, races between transfer redeem and the payment-event link path, privilege checks, down migration restoring 0180 functions
- exit: 0 | elapsed: 303750ms | answer: 1279B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/AccountsCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/accounts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/member-transfer/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/member-transfer/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/awarewave-wp-member/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/awarewave-wp-member/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/client-route-guards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/accounts/member-invite-link.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/client-context/__tests__/new-door.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/client-context/__tests__/no-private-context.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/wp-customers.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/identities.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/wp-customers.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/index.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/storyboards-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/server.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/appearance.cjs, lobster-factory/packages/aware-wave-store-plugin/includes/MemberInvite.php, lobster-factory/packages/aware-wave-store-plugin/includes/MyAccountDoors.php, lobster-factory/packages/aware-wave-store-plugin/includes/StoreModule.php, lobster-factory/packages/aware-wave-store-plugin/tests/MemberInviteTest.php, lobster-factory/packages/db/migrations/0182_member_transfer.down.sql, lobster-factory/packages/db/migrations/0182_member_transfer.sql, lobster-factory/packages/db/scripts/0182_member_transfer_down.sql, lobster-factory/packages/db/tests/test_0182_member_transfer.py, scripts/local-member-flow.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A transfer can make an already-paid order’s queued payment event fail permanently.
  file:line   -> lobster-factory/packages/db/migrations/0182_member_transfer.sql:127
  confidence  -> CONFIRMED
  scenario    -> The old member pays, then the transfer completes before the queued payment event is delivered. Deleting their identity makes the payment path treat them as a new customer; the account is already held by the new member, so the event is refused and the paid entitlement is not recorded.
  why missed  -> The transfer tests race a new identity insert, but do not deliver an existing member’s queued payment event after the swap.

FINDING 2: Reissuing an invite can cause the replacement link to be silently discarded.
  file:line   -> lobster-factory/packages/aware-wave-store-plugin/includes/MemberInvite.php:202
  confidence  -> CONFIRMED
  scenario    -> An unverified member has code A stored. Staff void A and issue B. The member opens B, but `hold()` keeps A; verification then sends the voided A and shows a final refusal. B was never stored, so opening the replacement link did not complete the invite.
  why missed  -> The test covers a second link being unable to replace a held code, but not the normal void-and-reissue flow.

TOTAL: 2 findings