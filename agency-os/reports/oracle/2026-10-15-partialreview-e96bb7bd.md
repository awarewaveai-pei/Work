# codex-oracle review -- 2026-10-15 10:48:24 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0100_social_dispatch.sql, lobster-factory/packages/db/scripts/0100_social_dispatch_down.sql, lobster-factory/packages/db/scripts/0100_social_dispatch-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/postiz-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/limits.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/texts/route.ts, lobster-factory/packages/workflows/src/trigger/social-dispatch.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Social manager C5 (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C5): sender that claims due social posts, creates one Postiz post per target, reads results back. Invariants in migration 0100 header: claim once, one Postiz post per send (lease + uncertain adopt), write-backs only on their claim, published target never resent, user withdrawal of a queued post deletes in Postiz before release. Gated by system mode per brand. Off by default (SOCIAL_DISPATCH_ENABLED/MODE; draft = Postiz drafts only). Round 4 (fixes of round 3 only; round 1-3 findings resolved): no 7-day timeout -- results looked up by id in a window reaching back 7 days from now; the run time budget is checked before every target send; an orphan from a refused write-back is recorded in social_postiz_orphans in the same transaction and deleted by the next runs until Postiz confirms; an incident that cannot be raised fails the run. Bulk never takes publish_now (needs per-post confirmation) -- intended.
- exit: 0 | elapsed: 248329ms | answer: 2725B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/state/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/bulk/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/postiz-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/limits.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/dispatch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/texts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts, lobster-factory/packages/db/migrations/0100_social_dispatch.sql, lobster-factory/packages/db/scripts/0100_social_dispatch-local-verify.sql, lobster-factory/packages/db/scripts/0100_social_dispatch_down.sql, lobster-factory/packages/workflows/src/trigger/social-dispatch.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Uncertain sends are looked up by `send_key`, but Postiz results are keyed by the generated Postiz ID.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:203 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/postiz.ts:389,391
  confidence  -> CONFIRMED
  scenario    -> Postiz accepts and publishes a post, but the response is lost; the next run cannot find it because the stored send key differs from Postiz’s returned ID, retries, receives a published-post refusal, marks the target error, then later sends a new key and creates a duplicate.
  why missed  -> The fake test makes the uncertain key equal to the Postiz ID, hiding the production ID mismatch.

FINDING 2: A queued post that is past due cannot be withdrawn while system mode blocks dispatch.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/withdraw.ts:14 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:270
  confidence  -> CONFIRMED
  scenario    -> A post is queued, dispatch is blocked by system mode, and its scheduled time passes; every delete, unschedule, or reschedule attempt returns the “within 2 minutes” 409 indefinitely.
  why missed  -> The lead check treats all past timestamps as imminent sends instead of restricting the guard to future timestamps.

FINDING 3: The run-time budget is checked before lease acquisition, but not before the actual Postiz send.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:193 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:227
  confidence  -> CONFIRMED
  scenario    -> The budget has 149 seconds elapsed, `beginSend` or integration lookup takes 10 seconds, and `createPost` still starts after the 150-second budget; the run does not report early termination.
  why missed  -> The test advances the clock inside `createPost`, while the missing check is after the preflight awaits.

FINDING 4: Orphan cleanup bypasses `MAX_POSTIZ_CALLS`, so the route can exceed its advertised per-run Postiz-call cap.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:151 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:182
  confidence  -> CONFIRMED
  scenario    -> The 20th normal Postiz call creates an orphan; cleanup runs with `cleanup=true` and increments the counter to 21, allowing the run to exceed the stated maximum and the hourly rate budget.
  why missed  -> Cleanup was exempted to guarantee orphan deletion, but the exemption also bypasses the global call limit.

TOTAL: 4 findings
