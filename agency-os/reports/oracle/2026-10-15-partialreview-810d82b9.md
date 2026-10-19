# codex-oracle review -- 2026-10-15 10:20:53 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0100_social_dispatch.sql, lobster-factory/packages/db/scripts/0100_social_dispatch_down.sql, lobster-factory/packages/db/scripts/0100_social_dispatch-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/packages/workflows/src/trigger/social-dispatch.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Social manager C5 (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C5): sender that claims due social posts, creates one Postiz post per target, reads results back. Invariants in migration 0100 header: claim once, one Postiz post per send (lease + uncertain adopt), write-backs only on their claim, published target never resent, user withdrawal of a queued post deletes in Postiz before release. Gated by system mode per brand. Off by default (SOCIAL_DISPATCH_ENABLED/MODE; draft = Postiz drafts only).
- exit: 0 | elapsed: 226290ms | answer: 1838B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/state/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/bulk/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts, lobster-factory/packages/db/migrations/0100_social_dispatch.sql, lobster-factory/packages/db/scripts/0100_social_dispatch-local-verify.sql, lobster-factory/packages/db/scripts/0100_social_dispatch_down.sql, lobster-factory/packages/workflows/src/trigger/social-dispatch.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The per-run Postiz cap exceeds the documented hourly API limit.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:71` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:137`
  confidence  -> CONFIRMED
  scenario    -> 12 five-minute runs each use 40 Postiz calls -> 480 calls/hour against the stated 300/hour limit, causing 429 backoffs and due targets to remain unsent.
  why missed  -> The cap was considered per-run without multiplying it by the cron frequency.

FINDING 2: Orphan cleanup can be blocked by the same Postiz-call budget.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:223` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:137`
  confidence  -> CONFIRMED
  scenario    -> The create call is number 40 and succeeds, but write-back returns false after withdrawal -> the deletion call is rejected by `OutOfBudget`, leaving an unowned Postiz post permanently behind.
  why missed  -> Cleanup was placed on the success path but still routed through the creation budget guard.

FINDING 3: Uncertain-send adoption can attach an unrelated post with matching text.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:186` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:188`
  confidence  -> CONFIRMED
  scenario    -> A timed-out send is retried; a human-created post on the same integration has the same text, while no target owns it -> the dispatcher adopts the human post and never sends the intended post.
  why missed  -> Ownership filtering prevents known database posts, but content equality is still treated as a unique idempotency key.

TOTAL: 3 findings
