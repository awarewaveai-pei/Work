# codex-oracle review -- 2026-10-18 10:35:40 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Calendar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Toolbar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Trash.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/EmptyState.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Icon.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/social.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/__tests__/model.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/__tests__/routes.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/social-manager.spec.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: SOCIAL_MANAGER_PLAN C22: week calendar as a column per day with stacked cards (thumb, tag bar, flags, now line, best-time chips), month view that changes month, list with a bulk menu, bin tab with who deleted (audit log delete rows, actor filtered per viewer), filter panel with tags, repeat-series computed occurrences (model.ts occurrences) that hide slots whose child exists in any state.
- exit: 0 | elapsed: 88849ms | answer: 635B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Calendar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Icon.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Toolbar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/__tests__/model.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/social.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/__tests__/routes.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/social-manager.spec.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/EmptyState.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Trash.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Filtered week/month views do not show the empty state when no posts match.

  `SocialManager.tsx:372-374, 401` -> `Calendar.tsx:185-197`

  confidence  -> CONFIRMED

  scenario    -> A brand has posts, then the user selects a tag with no matching posts -> `nothingYet` remains false because it checks `posts`/`calPosts`, while WeekView and MonthView receive `visible=[]` and render a blank calendar instead of the “沒有符合的貼文” state.

  why missed  -> The empty-state condition was based on the loaded dataset rather than the filtered dataset, and only ListView separately consumes `empty`.

TOTAL: 1 findings
