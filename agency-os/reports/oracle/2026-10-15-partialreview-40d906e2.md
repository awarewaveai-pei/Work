# codex-oracle review -- 2026-10-15 09:27:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/sweep.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-sweep.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/system-modes/__tests__/production-change-coverage.test.ts, lobster-factory/packages/db/migrations/0099_cs_ai_replies_completed_at.sql, lobster-factory/packages/db/migrations/0099_cs_ai_replies_completed_at.down.sql, lobster-factory/packages/workflows/src/trigger/cs-inbound-sweep.ts, lobster-factory/packages/workflows/src/trigger/cs-inbound-sweep.test.ts, lobster-factory/packages/workflows/src/trigger/index.ts, lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Chatwoot v4.18 AgentBot webhook times out at 5s and then opens the conversation itself. The route now claims the message (unique insert), answers 200, and runs the AI pipeline in next/server after(). Invariant: a claimed message is either completed (recordReply sets completed_at, migration 0099) or handed to a human by a 5-minute Trigger sweep (claims older than 10 min with completed_at NULL: private note + handoff, then conditional close). Focus: lost-message paths; double reply or double note races between a late pipeline and the sweep; migration backfill and lock safety; any path that leaves completed_at NULL forever or closes a claim without a handoff. Also verify: does this change depend on something NOT visible in this diff (config value, timeout, schema assumption, cron, upstream default) that contradicts it? If you cannot support a real finding, say so and return none; do not invent weak findings.
- exit: 0 | elapsed: 244447ms | answer: 4807B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/system-modes/__tests__/production-change-coverage.test.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/packages/workflows/src/trigger/index.ts, lobster-factory/packages/workflows/trigger.config.ts, scripts/lobster-trigger-deploy.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/cs/sweep/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-sweep.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/sweep.ts, lobster-factory/packages/db/migrations/0099_cs_ai_replies_completed_at.down.sql, lobster-factory/packages/db/migrations/0099_cs_ai_replies_completed_at.sql, lobster-factory/packages/workflows/src/trigger/cs-inbound-sweep.test.ts, lobster-factory/packages/workflows/src/trigger/cs-inbound-sweep.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The sweep closes stale claims without a handoff when Chatwoot config is missing.
  file:line   -> `lib/cs/sweep.ts:25` -> `lib/cs/sweep.ts:30`
  confidence  -> CONFIRMED
  scenario    -> stale claim + `cis.chatwoot` absent -> no note/handoff is attempted, but `completed_at` is set and future sweeps skip it.
  why missed  -> the test explicitly treats “no Chatwoot config” as successful closure.

FINDING 2: Sweep retries duplicate private notes after a partial Chatwoot failure.
  file:line   -> `lib/cs/sweep.ts:26` -> `lib/cs/sweep.ts:31`
  confidence  -> CONFIRMED
  scenario    -> private note succeeds, handoff fails -> claim remains unfinished; next tick posts the same private note again.
  why missed  -> the test checks only that the claim stays open, not that already-completed external side effects are idempotent.

FINDING 3: A late pipeline can reply after the sweep has handed the conversation to a human.
  file:line   -> `lib/cs/sweep.ts:21` -> `lib/cs/db.ts:154` -> `app/api/webhooks/chatwoot/route.ts:160`
  confidence  -> PLAUSIBLE
  scenario    -> pipeline remains alive past 10 minutes, sweep sends note/handoff and closes the claim, then the pipeline upserts its AI decision and sends `sendReply` -> human handoff plus AI reply.
  why missed  -> the conditional close prevents only a completion observed before the update; there is no lease or pre-delivery claim-state check.

FINDING 4: `recordReply` silently ignores database errors, so the route can deliver an AI reply while the claim remains unfinished.
  file:line   -> `lib/cs/db.ts:154` -> `lib/cs/orchestrator.ts:179` -> `app/api/webhooks/chatwoot/route.ts:160`
  confidence  -> CONFIRMED
  scenario    -> `upsert` returns a Supabase error -> `recordReply` still resolves, the AI reply is sent, `completed_at` stays NULL, and the sweep later posts a human handoff.
  why missed  -> the code assumes an awaited Supabase call throws; its returned `error` is never inspected.

FINDING 5: Sweep database/schema errors are reported as “nothing to do,” leaving claims indefinitely unfinished.
  file:line   -> `lib/cs/db.ts:190` -> `app/api/internal/cs/sweep/route.ts:26`
  confidence  -> CONFIRMED
  scenario    -> migration 0099 is not applied or Supabase is unavailable -> the unfinished-claim query returns `[]`, the endpoint returns HTTP 200/`ok:true`, and no retry or alert occurs.
  why missed  -> the database layer’s “degrade to []” convention hides the failure from the scheduler.

FINDING 6: Migration 0099 can permanently hide pre-existing crash-left claims.
  file:line   -> `packages/db/migrations/0099_cs_ai_replies_completed_at.sql:23` -> `apps/next-admin/lib/cs/db.ts:295`
  confidence  -> PLAUSIBLE
  scenario    -> an old process inserted the placeholder row, then crashed before `recordReply` -> backfill sets `completed_at = created_at`, so the new sweep never hands it off.
  why missed  -> the backfill assumes every historical synchronous request completed, but the claim insert and decision write are separate operations.

FINDING 7: Migration 0099 performs blocking whole-table work in one transaction.
  file:line   -> `packages/db/migrations/0099_cs_ai_replies_completed_at.sql:21` -> `apps/next-admin/app/api/webhooks/chatwoot/route.ts:95`
  confidence  -> CONFIRMED
  scenario    -> `cs_ai_replies` is larger than assumed or another transaction is active -> `ALTER TABLE`, full backfill, and non-concurrent index creation hold blocking locks; webhook claim waits beyond Chatwoot’s 5-second timeout and the conversation opens without an accepted claim.
  why missed  -> lock duration is justified only by an unverified “handful of rows” assumption.

FINDING 8: The safety sweep is disabled by default and has no visible token provisioning.
  file:line   -> `docker-compose.yml:383` -> `scripts/lobster-trigger-deploy.ps1:168` -> `packages/workflows/src/trigger/cs-inbound-sweep.ts:30`
  confidence  -> CONFIRMED
  scenario    -> fresh deployment without an externally pre-populated `CS_SWEEP_TOKEN` -> next-admin receives an empty token, Trigger syncs nothing, and every five-minute run skips.
  why missed  -> deployment reads the token from the already-running container but does not create or inject one.

FINDING 9: A Chatwoot delivery failure marks the claim complete without handing off.
  file:line   -> `lib/cs/orchestrator.ts:179` -> `lib/cs/db.ts:167` -> `app/api/webhooks/chatwoot/route.ts:177`
  confidence  -> CONFIRMED
  scenario    -> AI decision persists, `sendReply` returns 500 -> the catch only reports to Sentry; the claim is completed and redelivery is deduped, so the customer receives neither an AI reply nor a human handoff.
  why missed  -> persistence is treated as completion even though external delivery has not succeeded.

TOTAL: 9 findings
