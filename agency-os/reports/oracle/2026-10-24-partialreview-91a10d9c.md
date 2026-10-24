# codex-oracle review -- 2026-10-24 14:44:42 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/packages/db/migrations/0121_content_topics.sql, :(literal)lobster-factory/packages/db/migrations/0121_content_topics.down.sql, :(literal)lobster-factory/packages/db/scripts/0121_content_topics-local-verify.sh, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/trends.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/cost.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/trending/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/plan/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: AUTO_CONTENT P3 (agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md P3): trends are kept and topics are queued. Migration 0121 (not yet applied to production; a db-expert review's 7 fixes are in): content_trends (global cache, unique (hash, fetched_on), 90-day prune in saveTrends), content_trends_top RPC (titles ranked by days hot), content_topics (per-organization queue, version claim, NEXT transition table in store.ts), content_topics_start RPC (daily cap under a per-organization advisory lock), client_schedules frequency every_5m. /api/content/trending saves each fetch (a failure only warns). New routes /api/content/topics (GET list + folders, POST add), /[id] (PATCH approve/reject/reopen/retry/formats with version), /plan (withFeature content.plan, one Opus call via planAsker); each derives the organization from the site or topic and calls canAccessOrg. Page /tools/content/topics. Check: tenant leaks, claim and cap correctness, migration/down safety, prompt or parse failures that store bad topics, cost/feature registration, anything that will break when P4 calls startTopic/move.
- exit: 0 | elapsed: 303280ms | answer: 1706B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/trending/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/plan/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/cost.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/trends.ts, lobster-factory/packages/db/migrations/0121_content_topics.down.sql, lobster-factory/packages/db/migrations/0121_content_topics.sql, lobster-factory/packages/db/scripts/0121_content_topics-local-verify.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `every_5m` is accepted by the migration but ignored by the existing scheduler.
  `packages/db/migrations/0121_content_topics.sql:103` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/schedule.ts:35-45`
  confidence  -> CONFIRMED
  scenario    -> An enabled `every_5m` row runs at 03:00, then the 03:05 heartbeat is rejected by daily/weekly logic; the next run may be six days later.
  why missed  -> The migration verifies the database constraint, not the existing scheduler’s runtime behavior.

FINDING 2: Trend retention is skipped whenever a fetch produces no valid rows.
  `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/trends.ts:56` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/trends.ts:59`
  confidence  -> CONFIRMED
  scenario    -> A valid geo fetch returns an empty item list; `saveTrends` returns before pruning, so rows older than 90 days remain indefinitely.
  why missed  -> The prune is placed after the non-empty write path and tests cover only fetches containing items.

FINDING 3: Month validation accepts impossible months and later generates invalid database dates.
  `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/topics/route.ts:18,36,58-69` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/store.ts:69-72`
  confidence  -> CONFIRMED
  scenario    -> `month=2026-13` passes the regex, then produces `2026-13-01T01:00:00Z`; Supabase rejects it and the route returns 500 instead of 400.
  why missed  -> The validator checks only the string shape, while `monthKey` also checks only the string prefix.

TOTAL: 3 findings
