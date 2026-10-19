# codex-oracle review -- 2026-10-15 10:41:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0100_social_dispatch.sql, lobster-factory/packages/db/scripts/0100_social_dispatch_down.sql, lobster-factory/packages/db/scripts/0100_social_dispatch-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/postiz-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/limits.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/texts/route.ts, lobster-factory/packages/workflows/src/trigger/social-dispatch.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Social manager C5 (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C5): sender that claims due social posts, creates one Postiz post per target, reads results back. Invariants in migration 0100 header: claim once, one Postiz post per send (lease + uncertain adopt), write-backs only on their claim, published target never resent, user withdrawal of a queued post deletes in Postiz before release. Gated by system mode per brand. Off by default (SOCIAL_DISPATCH_ENABLED/MODE; draft = Postiz drafts only). Round 3: text-matching adoption (flagged twice) replaced by an idempotency key: 0100 social_begin_send picks send_key before the Postiz call; createPost sends it as value[0].id (Postiz v2.25.1 createOrUpdatePost upserts by value.id; guardAgainstRepublish refuses re-sending a PUBLISHED id); an uncertain retry gets the same key, looks it up by exact id first (before the integration check), else re-sends with that key. Round 2 F1 (cleanup still counted) is intended: Postiz counts that call against API_LIMIT too.
- exit: 0 | elapsed: 456687ms | answer: 2873B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/state/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/bulk/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/postiz-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/limits.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/texts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts, lobster-factory/packages/db/migrations/0100_social_dispatch.sql, lobster-factory/packages/db/scripts/0100_social_dispatch-local-verify.sql, lobster-factory/packages/db/scripts/0100_social_dispatch_down.sql, lobster-factory/packages/workflows/src/trigger/social-dispatch.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Fresh sends can be marked failed after the seven-day timeout.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:265 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:86
  confidence  -> CONFIRMED
  scenario    -> A post blocked for over seven days is finally sent; the next run treats its newly-created Postiz post as too old, skips lookup, and marks it error.
  why missed  -> The timeout is based on scheduled_at, not the actual send time.

FINDING 2: The run budget is not enforced while processing targets.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:244 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:260
  confidence  -> CONFIRMED
  scenario    -> One post has many targets and slow Postiz calls; after the 150-second budget expires, the target loop continues until the request/Trigger timeout, leaving partial leases and sends.
  why missed  -> The clock check is only between posts, while Postiz work occurs per target.

FINDING 3: An orphaned Postiz post can become permanently untracked when cleanup fails.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:227 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:288
  confidence  -> CONFIRMED
  scenario    -> Postiz creation succeeds, the database write-back returns false because the post was withdrawn, and deletePost returns 429/5xx; the orphan remains in Postiz with no durable ID for a later cleanup.
  why missed  -> Cleanup errors enter the outer backoff/500 path, which has no retry record for the orphan.

FINDING 4: Postiz failures can settle without raising an incident.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts:98 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts:100
  confidence  -> CONFIRMED
  scenario    -> A target becomes error but ingestIncident returns an error; the failure is only logged, so dispatch can return success while no ops incident exists.
  why missed  -> Incident creation is treated as best-effort despite the acceptance invariant requiring an incident.

FINDING 5: Bulk publish-now actions cannot provide the required confirmation.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/bulk/route.ts:26 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/state/route.ts:26
  confidence  -> CONFIRMED
  scenario    -> A bulk item requests publish_now with confirmPublishNow=true; the bulk input omits that field, so transition rejects the item and nothing is published.
  why missed  -> The single-item route passes confirmPublishNow, but the bulk route copied an incomplete input shape.

TOTAL: 5 findings
