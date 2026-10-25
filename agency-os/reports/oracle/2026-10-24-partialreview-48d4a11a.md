# codex-oracle review -- 2026-10-24 20:45:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/publish/wp-post-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/wp-post/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/tick.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/__tests__/sites-publish-mode.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/PublishModeButtons.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/__tests__/PublishModeButtons.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/SiteManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: AUTO_CONTENT P4.6+P4.8: content pipeline auto publish (I5: publishMode=ai_review_auto AND review.pass, else draft); WP post update core extracted from /api/content/wp-post; site publishMode buttons; publishMode writable only via its own PATCH field. SiteManager.tsx also carries another session's unrelated door hunks (useOnDoor/useDoorHref) - not part of this change.
- exit: 0 | elapsed: 121801ms | answer: 1121B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/SiteManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/wp-post/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/tick.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/PublishModeButtons.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/__tests__/PublishModeButtons.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/__tests__/sites-publish-mode.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/publish/wp-post-core.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Scheduled topics are marked published without verifying WordPress or social delivery.
  file:line   -> `lib/content/topics/tick.ts:127-129`; `lib/content/topics/make.ts:128-129`
  confidence  -> CONFIRMED
  scenario    -> WordPress future-post cron is disabled or misses its event; the post remains `future`, but the next tick moves the topic to `published` anyway. The same applies if social scheduling was not delivered.
  why missed   -> The code assumes the external scheduler succeeded and treats elapsed time as proof of publication.

FINDING 2: Switching a site back to human review can race with auto-publish and still publish content.
  file:line   -> `lib/content/topics/make.ts:136-144`; `app/api/content/sites/[id]/route.ts:50-57`
  confidence  -> CONFIRMED
  scenario    -> Auto mode is read as enabled, an operator changes the site to `human_review`, then the already-running pipeline calls `updateWpPost`; the article is published despite the new mode.
  why missed   -> The second mode read is only a non-atomic check; the mode update and WordPress write are not coordinated.

TOTAL: 2 findings
