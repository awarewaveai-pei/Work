# codex-oracle review -- 2026-10-21 17:24:07 +08:00

- mode: `review`
- scope: whole repo
- target: `45e465758`
- context: tarot batch store moved from process memory to Supabase rows (migration 0115): card claim before generate, deadline/timeout, org-scoped job list
- exit: 0 | elapsed: 312130ms | answer: 2117B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/start/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/trigger-callbacks-server-to-server.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/batch-store-durable.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/fake-batch-db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-run-status.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts, lobster-factory/packages/db/migrations/0115_tarot_batch_jobs.down.sql, lobster-factory/packages/db/migrations/0115_tarot_batch_jobs.sql, lobster-factory/packages/db/scripts/0115_tarot_batch_jobs-local-verify.sh, lobster-factory/packages/db/scripts/0115_tarot_batch_jobs_down.sql, lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The 7-day cleanup removes database rows but leaves batch images in public R2.

  file:line   -> `batch-store.ts:184` -> `card/route.ts:100-101`
  confidence  -> PLAUSIBLE
  scenario    -> No external R2 lifecycle exists; after 7 days, a new job deletes the old DB row and cards, but the public `tarot-batch/...png` objects remain indefinitely while the API returns 404.
  why missed  -> DB TTL cleanup was treated as complete retention cleanup, but R2 is managed separately.

FINDING 2: A quota-aborted partial batch is reported as successful.

  file:line   -> `batch-store.ts:127` -> `tarot-batch-generate.ts:124`
  confidence  -> CONFIRMED
  scenario    -> Ten cards finish, then quota returns 429; the worker exits normally, Trigger reports `COMPLETED`, and `summarizeBatch` sets status `done` because `done > 0`. The UI stops polling at `TarotStudio.tsx:411` and displays completion despite missing cards.
  why missed  -> The worker’s local failed-card count is never persisted as card rows.

FINDING 3: Card callbacks can generate and bill cards after the job deadline.

  file:line   -> `card/route.ts:70` -> `0115_tarot_batch_jobs.sql:71`
  confidence  -> CONFIRMED
  scenario    -> A valid callback arrives after `deadline_at`; `getJob` derives `timed_out`, but the route does not reject that state, and the claim RPC checks only whether the job exists. The card is claimed, generated, billed, and stored.
  why missed  -> Timeout derivation and card claiming are separate paths, with no lifecycle check in the claim RPC.

FINDING 4: The organization-scoped job list can show failed Trigger runs as still running.

  file:line   -> `batch-store.ts:301` -> `batch/[jobId]/route.ts:21`
  confidence  -> CONFIRMED
  scenario    -> Trigger fails before the deadline; `/api/tools/tarot/batch/[jobId]` reports an error using `fetchTriggerRunStatus`, but `/api/tools/tarot/batch` calls `listRecentJobs` without a run-status lookup and returns `running` until the deadline expires.
  why missed  -> Trigger status integration was added to the detail endpoint only, not the list path.

TOTAL: 4 findings
