# codex-oracle review -- 2026-10-15 11:48:26 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0101_social_rotation.sql, lobster-factory/packages/db/migrations/0102_social_review.sql, lobster-factory/packages/db/scripts/0101_social_rotation-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/rotation.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/accounts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/rotation/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/ArticleSource.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/state.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/actions.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/audit.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Social manager round 2 for C6-C11. Round 1 (7 findings) fixed: notifyReview wired into the shared action path; a list save withdraws every unsent materialised post (state scheduled with list_id, due ones included); origin_list_id (never cleared) makes a rotation slot unique so an edited slot is never made again; the daily rotation run also reconciles expired accounts; list save/delete and the review setting log the real actor, review setting + log in one SQL function; article prefill carries its article id. New since round 1 (C8 permission rule, C11 logging): with require_review on (0102), state.ts refuses an editor scheduling a draft or error post (moving an approved post stays allowed; owner unaffected), PUT posts/[id] refuses an editor changing content of an approved (scheduled/queued) post; reject appends its reason to notes then changes state on the new version; connect start/cancel/connected, unlink and media upload write one audit row each (logAction never undoes the action). V1 roles come from ops_role (owner/admin=owner, operator=editor, viewer=client); per-person members are out of scope (needs a user id in middleware).
- exit: 0 | elapsed: 545839ms | answer: 2660B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/accounts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/state.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/state.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/ArticleSource.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/rotation/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists/[id]/order/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/actions.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/audit.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/rotation.ts, lobster-factory/packages/db/migrations/0101_social_rotation.sql, lobster-factory/packages/db/migrations/0102_social_review.sql, lobster-factory/packages/db/scripts/0101_social_rotation-local-verify.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `require_review` is bypassed by rotation-list materialization.
  file:line   -> state.ts:62,87 -> 0101_social_rotation.sql:94 -> 0102_social_review.sql:2
  confidence  -> CONFIRMED
  scenario    -> Review enabled; an editor adds a draft to an active rotation list. `to_rotation` is allowed, then the rotation job creates a scheduled post that can be sent without approval.
  why missed  -> The rule covers direct `schedule`, but the SQL materializer is a separate scheduling path.

FINDING 2: Editors cannot use “save draft” or “submit” to unschedule an approved scheduled post.
  file:line   -> Editor.tsx:162,166,169 -> posts/[id]/route.ts:34,35
  confidence  -> CONFIRMED
  scenario    -> Review enabled; an editor edits a scheduled post and clicks “存草稿” or “送審”. The editor saves targets/media first, the API rejects the content change, and the later unschedule step never runs.
  why missed  -> The server guard was added without accounting for the editor’s save-before-unschedule sequence.

FINDING 3: Rescheduling a materialized rotation post can recreate its original slot.
  file:line   -> SocialManager.tsx:139 -> state.ts:91,102 -> 0098_social_writes.sql:186 -> 0101_social_rotation.sql:37,55,59,94
  confidence  -> CONFIRMED
  scenario    -> A post for future slot T is dragged to T2, clearing `list_id` but changing `scheduled_at` while retaining `origin_list_id`. Saving the list before T resets materialization; T has no `(origin_list_id, T)` conflict, so a second post is created for T.
  why missed  -> The uniqueness key includes mutable `scheduled_at`; tests only edit content without moving the scheduled time.

FINDING 4: List details hide due posts that have not gone out.
  file:line   -> rotation.ts:76,82 -> 0101_social_rotation.sql:55
  confidence  -> CONFIRMED
  scenario    -> A materialized post reaches its scheduled time but remains `state='scheduled'` because the sender has not claimed it. The list API’s strict future-time filter omits it, so the UI reports no upcoming calendar post even though it is still unsent.
  why missed  -> “Upcoming” was implemented as future-only, while the rotation contract treats due scheduled rows as unsent.

FINDING 5: Required audit rows are silently lost when logging fails.
  file:line   -> store.ts:28,29
  confidence  -> CONFIRMED
  scenario    -> An unlink or media upload succeeds, but inserting into `social_audit_log` fails. `logAction` only logs to the console, so the endpoint succeeds with no audit row.
  why missed  -> The failure path was intentionally swallowed and the audit test covers only successful inserts.

TOTAL: 5 findings
