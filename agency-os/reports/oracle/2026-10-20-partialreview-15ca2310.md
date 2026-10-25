# codex-oracle review -- 2026-10-20 15:49:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up delta after a prior Codex review (artifact 2026-10-20-partialreview-4e45188c) of the tarot batch callback move to /api/internal/tarot/batch/[jobId]/{start,card} with Bearer BATCH_INTERNAL_SECRET from the worker env. This delta: (1) the Trigger task now fails the run when next-admin answers 401 (token drift) or 404 (job lost to a restart) on start or card, instead of finishing 'completed' with every card failed; (2) retry maxAttempts 1 for the task, because a whole-run retry restarts at card 0 and re-bills finished cards; (3) .env.example documents BATCH_INTERNAL_SECRET (the prior finding).
- exit: 0 | elapsed: 172403ms | answer: 838B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/packages/workflows/src/trigger/tarot-batch-generate.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Fail-on-404 turns the normal job-creation race into a failed batch.

  file:line   -> `packages/workflows/src/trigger/tarot-batch-generate.ts:69` → `apps/next-admin/app/api/tools/tarot/batch/route.ts:53`, `:86`; `app/api/internal/tarot/batch/[jobId]/start/route.ts:28`
  confidence  -> CONFIRMED
  scenario    -> Trigger starts immediately after the trigger request at line 53, before `createJob` runs at line 86; `/start` sees no in-memory job and returns 404, so line 69 fails the run. The API then creates a pending job, leaving the user with no generated cards and a permanently pending job.
  why missed  -> The 404 was treated as “job lost after restart,” but the same response also occurs during the existing trigger-before-create ordering; the previous code ignored the start status.

Final line: TOTAL: 1 finding
