# codex-oracle review -- 2026-09-26 18:21:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive-os/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive-os/__tests__/research.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/__tests__/cognitive.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/packages/workflows/src/lib/collection/postResearchRunExecute.ts, lobster-factory/packages/workflows/src/lib/collection/postResearchRunExecute.test.ts, lobster-factory/packages/workflows/src/trigger/collect-research-run.ts, lobster-factory/packages/workflows/src/trigger/index.ts, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/source.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/collection_run.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/bootstrap_service_identity.py, Projects/internal/cognitive-engineering-os/tests/unit/test_source_provenance.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_grant.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collection_run_repository.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/source.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/collection-run.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/domain/collection-run.fixtures.yaml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Research-line P1 (RESEARCH_LINES_MASTER_PLAN.md section 12.7, cards WC-P1-01/02/03/10/11/12/13).
next-admin: sink/cognitive projects collected docs to Cognitive OS Sources; lib/cognitive-os/research.ts is the only wire
(grant exchange, ingest, complete); POST /api/internal/collect/runs validates a strict 5-key body and triggers the Trigger task;
runs/execute exchanges a one-shot grant, crawls via runResearchCollection (no url-state) and must ALWAYS send complete in finally.
COS: Source gains collection provenance + same-transaction supersede with a partial UNIQUE index (one active row per
canonical_url per project); one-shot hashed collect grants in the identity store; collection_runs state machine.
Probe: can a grant token leak into a Trigger payload, log or response; can two active versions of one URL exist; can a
failed or unhealthy run stay 'running'; does the run.ts refactor change runCollection behaviour; anything unsafe under
SQLite concurrency. Files outside the -Path list belong to another session and are out of scope.
- exit: 0 | elapsed: 151141ms | answer: 1449B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/bootstrap_service_identity.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/source.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/source.schema.yaml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/packages/workflows/src/trigger/index.ts, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/collection_run.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_grant.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collection_run_repository.py, Projects/internal/cognitive-engineering-os/tests/unit/test_source_provenance.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/collection-run.schema.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/specs/domain/collection-run.fixtures.yaml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/research-run-request.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive-os/__tests__/research.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive-os/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/__tests__/cognitive.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts, lobster-factory/packages/workflows/src/lib/collection/postResearchRunExecute.test.ts, lobster-factory/packages/workflows/src/lib/collection/postResearchRunExecute.ts, lobster-factory/packages/workflows/src/trigger/collect-research-run.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Non-authentication ingest failures are reported as successful runs
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.ts:71 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts:73
  confidence  -> CONFIRMED
  scenario    -> Cognitive OS returns HTTP 500 for an ingest batch; the sink records `ingest_500` but `grantRefused()` only recognizes 401/403, so the execute route sets `status = "completed"` and completes the COS run despite documents not being ingested.
  why missed  -> Failure detection is narrowly coupled to grant errors, while the sink records all HTTP failures uniformly.

FINDING 2: The caller timeout exceeds the route’s hard runtime limit, so long runs can remain `running`
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.ts:20 -> lobster-factory/packages/workflows/src/lib/collection/postResearchRunExecute.ts:23
  confidence  -> CONFIRMED
  scenario    -> A crawl runs past 300 seconds; next-admin reaches its `maxDuration` termination before its `finally` completion request finishes, while Trigger waits up to 330 seconds. Cognitive OS never receives `complete`, leaving the run `running`.
  why missed  -> The timeout values were reviewed independently; the caller’s timeout is longer than the server function’s maximum lifetime.

Final line: TOTAL: 2 findings
