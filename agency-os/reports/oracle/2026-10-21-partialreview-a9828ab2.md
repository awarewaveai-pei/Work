# codex-oracle review -- 2026-10-21 17:13:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0115_tarot_batch_jobs.sql, lobster-factory/packages/db/migrations/0115_tarot_batch_jobs.down.sql, lobster-factory/packages/db/scripts/0115_tarot_batch_jobs_down.sql, lobster-factory/packages/db/scripts/0115_tarot_batch_jobs-local-verify.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-run-status.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/fake-batch-db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/batch-store-durable.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/trigger-callbacks-server-to-server.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/start/route.ts, lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot batch store moved from in-memory Map to Supabase rows (migration 0115): claim-before-generate idempotency, deadline/timeout state, restart durability, org-scoped job list. Browser TarotStudio.tsx intentionally unchanged; timed_out maps to status error for it.
- exit: 0 | elapsed: 206398ms | answer: 2491B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/start/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/trigger-callbacks-server-to-server.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts, lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/batch-store-durable.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/fake-batch-db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-run-status.ts, lobster-factory/packages/db/migrations/0115_tarot_batch_jobs.down.sql, lobster-factory/packages/db/migrations/0115_tarot_batch_jobs.sql, lobster-factory/packages/db/scripts/0115_tarot_batch_jobs-local-verify.sh, lobster-factory/packages/db/scripts/0115_tarot_batch_jobs_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Expired pending jobs can be revived by a late start callback  
  file:line   -> `lib/tarot/batch-store.ts:200-210`  
  confidence  -> CONFIRMED  
  scenario    -> A job remains pending past its 6-hour deadline -> `markRunning` updates it to `running` and extends the deadline, so the expired job starts generating.  
  why missed  -> The timeout is enforced during status summarization, not during the pending-to-running transition.

FINDING 2: Timed-out jobs still accept card callbacks and can be resurrected  
  file:line   -> `packages/db/migrations/0115_tarot_batch_jobs.sql:68-90` -> `lib/tarot/batch-store.ts:117-129`  
  confidence  -> CONFIRMED  
  scenario    -> A job is marked `timed_out` -> a delayed card callback claims and generates a card because the RPC checks only job existence; if all cards finish, summarization can report `done`.  
  why missed  -> Timeout is treated as a read-side state; claim does not enforce job status or deadline.

FINDING 3: A failed `finishCard` write is silently returned as success  
  file:line   -> `app/api/internal/tarot/batch/[jobId]/card/route.ts:101-104` -> `lib/tarot/batch-store.ts:236-245`  
  confidence  -> CONFIRMED  
  scenario    -> Image generation and R2 upload succeed, but the finish RPC fails -> the route still returns 200 with the URL, leaving the card generating until lease expiry and allowing a duplicate billed generation.  
  why missed  -> The `finally` block catches persistence errors without changing the response.

FINDING 4: `INTERRUPTED` Trigger runs never terminate the job early  
  file:line   -> `lib/tarot/batch-store.ts:64-65` -> `lib/tarot/batch-run-status.ts:16-17`  
  confidence  -> CONFIRMED  
  scenario    -> Trigger reports `INTERRUPTED` -> the status is returned but is absent from `RUN_ENDED`, so the job remains running until its deadline. [Trigger.dev run statuses](https://trigger.dev/changelog/runs-get-list)  
  why missed  -> The terminal-status list omits a valid Trigger run state.

FINDING 5: The collection job list ignores Trigger run failures  
  file:line   -> `lib/tarot/batch-store.ts:286-299`  
  confidence  -> CONFIRMED  
  scenario    -> A stored run fails before producing cards -> `GET /api/tools/tarot/batch` summarizes rows without fetching `runStatus`, so it reports pending/running until the deadline while the detail endpoint reports an error.  
  why missed  -> Run-status integration was added only to `getJob`, not `listRecentJobs`.

TOTAL: 5 findings
