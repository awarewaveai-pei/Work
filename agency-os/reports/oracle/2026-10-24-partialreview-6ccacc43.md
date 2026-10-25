# codex-oracle review -- 2026-10-24 15:57:19 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/start/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/cost.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Confirm the fixes for your re-review findings (agency-os/reports/oracle/2026-10-24-partialreview-a25cb568.md) on AUTO_CONTENT P4: F1 the start route now gates on content.article when the topic makes an article, else content.syndicate (two literal withFeature calls; route-features lists both keys for the route); F2 topicCostUsd/topicCostTwd take the topic's formats and the topic page prices the selected topic's formats. Check the fixes are right and introduce nothing new.
- exit: 0 | elapsed: 287202ms | answer: 565B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/cost.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/start/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The start hint falsely promises both drafts for single-format topics
  file:line   -> `app/(shell)/tools/content/topics/TopicsBoard.tsx:35,286` -> `lib/content/topics/make.ts:93-94`
  confidence  -> CONFIRMED
  scenario    -> Topic formats are `["article"]` -> the button says it will make WordPress and social drafts, but the maker runs only the article branch. `["social"]` similarly produces no WordPress draft.
  why missed  -> The hint remained hard-coded for the default two-format case while the UI permits selecting one format.

TOTAL: 1 findings
