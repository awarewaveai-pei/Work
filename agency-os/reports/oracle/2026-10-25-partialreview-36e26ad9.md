# codex-oracle review -- 2026-10-25 15:38:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/image-gen-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/generate/route.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `12dd0e699`
- context: Third pass on AI cost logging. Invariant: every provider charge leaves exactly one ai_call_logs row, on the account the grant bills, priced and attributed from the model that actually served it, also when the call fails after the provider charged. Image costs now live in ONE place: generateTarotImage calls logImageResult for every result (ok, or billed after a finished prediction whose output could not be fetched or was empty) with billedOrgId(grant) and the caller costLog {route, tool, jobId}; all six callers (content/image, tools/tarot/generate, tools/studio/generate via image-provider, internal tarot batch card, provision-staging, video-pipeline scene image) stopped logging themselves, so nothing is double-counted and the job-id gating on the old callers is gone. script-forge: a completed stream logs stream.finalMessage() (the SDK clears currentMessage at the end); an aborted stream logs the currentMessage snapshot. Gate: image-gen is listed as logging once for its provider branches. Real check: one flux-schnell image for Soulful wrote one row (BFL/Replicate, 0.003 USD, organization Soulful). Previous rounds: partialreview-b2a49fdd (8 findings) and partialreview-9fd4ac3b (3 findings), all addressed. Verify nothing is now logged twice or missed.
- exit: 0 | elapsed: 343473ms | answer: 3708B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/image-gen-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The OpenAI image branch depends on a model that has already shut down.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts:599
  confidence  -> CONFIRMED
  scenario    -> A standard API account selects `openai-high`, `openai-medium`, or `openai-low` → generation and editing still request `gpt-image-1` → generation fails. OpenAI documents its shutdown on October 23, 2026. [Model status](https://developers.openai.com/api/docs/models/gpt-image-1).
  why missed  -> The live verification exercised Flux; the OpenAI billing test supplies a synthetic result without contacting the model.

FINDING 2: The 58-second client timeout leaves billable Replicate predictions unlogged.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts:632
  confidence  -> CONFIRMED
  scenario    -> A prediction takes 59 seconds. The request uses `Prefer: wait` (:511), whose upstream default is 60 seconds, but the local timer aborts at 58 seconds (:18). The catch returns an unbilled failure (:639), so logImageResult skips it. Replicate can subsequently complete and charge; no prediction identifier or reconciliation work is retained. HTTP waiting and prediction cancellation are separate controls. [Replicate contract](https://replicate.com/docs/topics/predictions/create-a-prediction#deadline-vs-sync-mode-wait-duration).
  why missed  -> Tests begin with an already-received `succeeded` response; they never exercise the timeout before that response arrives.

FINDING 3: An invalid optional job ID silently prevents recording a successfully charged image.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts:230
  confidence  -> CONFIRMED
  scenario    -> Submit a valid Flux request with `_jobId: ""` or `"j1"` → generation succeeds → the string reaches log-ai-call.ts:199 unchanged. The column is UUID (`lobster-factory/packages/db/migrations/0046_ai_ledger_job_id.sql:10`), so PostgreSQL rejects the entire insert. The logger ignores the returned error, leaving zero cost rows.
  why missed  -> Caller validation checks only string type; tests use `"j1"` against mocked loggers that never enforce the database schema.

FINDING 4: Article generation still discards the grant’s billing organization.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts:866
  confidence  -> CONFIRMED
  scenario    -> A customer’s OpenAI article completes with usage. The function obtains its grant at :788, but the modified logger call omits organizationId. log-ai-call.ts:150 consequently inserts `organization_id: null`, excluding the expense from that customer’s totals. The Anthropic article logger at generate-core.ts:729 has the same omission.
  why missed  -> The article change verifies cached-token pricing while organization attribution is checked only on the newly centralized image path.

FINDING 5: ScriptForge loses OpenAI usage even when the final usage frame was received.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts:234
  confidence  -> CONFIRMED
  scenario    -> The stream receives its final usage frame, assigning usageFrame at :223, then the connection resets before clean EOF. reader.read() at :206 throws, bypassing the logger after the loop. The outer handler reports the error, but the already-known billed usage never produces a row.
  why missed  -> Logging is protected by finally only in the Anthropic branch; the OpenAI change tests token conversion rather than termination after usage arrives.

TOTAL: 5 findings
