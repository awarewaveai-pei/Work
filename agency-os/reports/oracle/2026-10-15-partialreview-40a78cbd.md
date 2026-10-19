# codex-oracle review -- 2026-10-15 11:33:40 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0101_social_rotation.sql, lobster-factory/packages/db/migrations/0102_social_review.sql, lobster-factory/packages/db/scripts/0101_social_rotation-local-verify.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/rotation.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/time.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/wp-article.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/needs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/settings/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/wp-article/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/rotation/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/social-manager.spec.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Social manager C6-C11 (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md): C6 /tools/social page (calendar week/month/list+bin, editor, preview, four actions, publish-now confirm; all data via /api/social; brand time zone; no select, no colour literals); C7 rotation lists (migration 0101: materialise next 7 days once per slot, a list save withdraws unsent materialised posts and rewinds the cursor, reorder only as a permutation, delete refused with items; a content edit makes a materialised post manual); C8 per-brand require_review (0102), needs() for the notification count, review notifications via ops inbox; C9 media library with use counts and attach-to-editor; C10 WordPress article -> post (excerpt path free, AI path through /api/content/syndicate with cost from lib/ai/cost-model.ts); C11 log view + needs filter. Not yet done in this tree: state.ts enforcement of require_review (C8) and audit rows for connect/unlink (C11) -- those land next. The C5 sender (dispatch.ts, 0100) was reviewed separately.
- exit: 0 | elapsed: 627727ms | answer: 3243B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/ArticleSource.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Calendar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Editor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Lists.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/MediaView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Review.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Settings.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialApp.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/__tests__/model.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/__tests__/page-rules.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/social.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/rotation/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/lists/[id]/order/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/needs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/settings/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/wp-article/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/rotation.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/time.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/wp-article.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/social-manager.spec.ts, lobster-factory/packages/db/migrations/0101_social_rotation.sql, lobster-factory/packages/db/migrations/0102_social_review.sql, lobster-factory/packages/db/scripts/0101_social_rotation-local-verify.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Review submissions never notify the ops inbox.
  `apps/next-admin/lib/social/actions.ts:9` -> `apps/next-admin/lib/social/review.ts:91`
  confidence  -> CONFIRMED
  scenario    -> Editor submits a draft -> it enters `review`, but no Telegram/ops-inbox incident is created.
  why missed  -> `notifyReview` exists but is not wired into the shared action path.

FINDING 2: Due rotation posts are not withdrawn when a list is paused or edited.
  `packages/db/migrations/0101_social_rotation.sql:42` -> `packages/db/migrations/0100_social_dispatch.sql:62`
  confidence  -> CONFIRMED
  scenario    -> A materialized post is due but still `scheduled`; the list is paused before dispatch claims it -> withdrawal leaves it intact and dispatch sends stale content.
  why missed  -> Withdrawal equates “unsent” with “scheduled in the future.”

FINDING 3: Editing a materialized post can create a duplicate at the same rotation slot.
  `packages/db/migrations/0101_social_rotation.sql:208` -> `packages/db/migrations/0101_social_rotation.sql:83`
  confidence  -> CONFIRMED
  scenario    -> A future materialized post is edited, clearing `list_id`; the list is saved -> rematerialization inserts another post at the same timestamp because the unique index no longer sees the manual post.
  why missed  -> The slot uniqueness guard is keyed by `list_id`, which content editing deliberately clears.

FINDING 4: The daily rotation job never reconciles expired Postiz accounts.
  `app/api/internal/social/rotation/route.ts:28` -> `lib/social/review.ts:98`
  confidence  -> CONFIRMED
  scenario    -> Postiz disables an integration -> the daily rotation run materializes posts but leaves `social_accounts.status` as `connected`, so `/needs` and Telegram never report the expired channel.
  why missed  -> Reconciliation exists and is documented as daily, but the runner only calls `runRotation()`.

FINDING 5: List audit entries attribute human changes to generic `ops`.
  `packages/db/migrations/0101_social_rotation.sql:293` -> `apps/next-admin/lib/social/store.ts:323`
  confidence  -> CONFIRMED
  scenario    -> Alice saves or deletes a rotation list -> C11 shows actor `ops`, not Alice’s authenticated actor.
  why missed  -> The list RPC has no actor parameter and was copied with a hardcoded actor.

FINDING 6: Review-setting changes are not atomic with their audit entry.
  `apps/next-admin/lib/social/review.ts:35` -> `apps/next-admin/lib/social/review.ts:38`
  confidence  -> CONFIRMED
  scenario    -> The settings upsert succeeds but audit insertion fails -> the API returns an error while `require_review` has changed without an audit row.
  why missed  -> Two independent writes are treated as one logical operation.

FINDING 7: Switching articles can apply stale content to the newly selected article.
  `app/(shell)/tools/social/ArticleSource.tsx:39` -> `app/(shell)/tools/social/Editor.tsx:108`
  confidence  -> CONFIRMED
  scenario    -> Article A’s request resolves after Article B is selected -> A’s prefill overwrites B’s editor, and saving immediately creates a post sourced from A under B.
  why missed  -> Prefill uses only a global counter; it has no article identity or cancellation guard.

TOTAL: 7 findings
