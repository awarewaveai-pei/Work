# codex-oracle review -- 2026-10-15 00:12:47 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/schedule.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/schedule-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ingest.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/site-watch, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/collection-schedule, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/site-watch, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/cs-knowledge, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/inbox/incidents, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/inbox/components/IncidentCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[[]slug], lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/collect/CollectionSourcesPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/packages/db/migrations/0097_client_schedules.sql, lobster-factory/packages/db/scripts/0097_client_schedules_down.sql, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Schedules page slice 1 (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md): collection_schedules generalized to client_schedules(org, job_key) via migration 0097 (moves rows, drops old table, adds ops_incidents source schedule); code registry lib/schedules/jobs.ts; generic hourly sweep /api/internal/schedules/run-due (token SCHEDULE_INGEST_TOKEN, failures -> last_error + one ops incident per job+org via new lib/ops-inbox/ingest.ts); old URL kept as transitional re-export until the Trigger task is renamed; one ScheduleTable for /ops/schedules and the client page; site-watch stays its own engine, mapped by an adapter and written through its existing locked RPC; old per-feature setting UIs and the site-watch PATCH removed. Prod state: only one collection_schedules row exists and it is disabled. Deploy order: migration first, then auto-deploy of next-admin.
- exit: 0 | elapsed: 397445ms | answer: 3782B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/schedule.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/store.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/schedule.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts, lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/collect/CollectionSourcesPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/inbox/components/IncidentCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/inbox/incidents/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/site-watch/console.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/site-watch/runKey.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/site-watch/wiring.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/run-due-schedules/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/schedules/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ingest.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/site-watch-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/host-status.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/site-watch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/view.ts, lobster-factory/packages/db/migrations/0097_client_schedules.sql, lobster-factory/packages/db/scripts/0097_client_schedules_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The Trigger heartbeat still uses the removed schedule token name, so scheduled jobs receive 401 responses.
  file:line   -> lobster-factory/packages/workflows/src/lib/collection/postRunDueSchedules.ts:14,20 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts:25-28
  confidence  -> CONFIRMED
  scenario    -> Trigger has only `COLLECT_SCHEDULE_INGEST_TOKEN`, while the route expects `SCHEDULE_INGEST_TOKEN` -> every heartbeat is unauthorized and no schedules run.
  why missed  -> The endpoint retained a transitional URL, but token propagation was not updated in the workflow.

FINDING 2: Collection runs that return errors are recorded as successful schedule runs.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts:27-29 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts:200-215 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts:70-73
  confidence  -> CONFIRMED
  scenario    -> `runCollection()` returns `errors: ["no_approved_sources"]` without throwing -> `recordScheduleRun()` clears the error and no incident is created.
  why missed  -> The registry treats resolution as success without interpreting the returned error list.

FINDING 3: Database failures are reported as a successful sweep with zero schedules.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts:61-66 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts:62-75
  confidence  -> CONFIRMED
  scenario    -> `client_schedules` is unavailable or the query fails -> the store returns `[]`, and the endpoint returns HTTP 200 with `checked: 0`, silently disabling automation.
  why missed  -> The existing “degrade to empty” convention was reused for a scheduler where an empty result is indistinguishable from healthy no-op state.

FINDING 4: Overlapping heartbeats can execute the same due job more than once.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts:52-73
  confidence  -> CONFIRMED
  scenario    -> Two authenticated requests read the same stale `lastRunAt` before either finishes -> both call `job.run()` and perform duplicate crawl side effects.
  why missed  -> The sequential loop serializes jobs inside one request but provides no database claim, lease, or conditional update across requests.

FINDING 5: The sweep can exceed its five-minute runtime limit before recording completion.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts:23,66-89 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts:76,218
  confidence  -> CONFIRMED
  scenario    -> A crawl takes longer than 300 seconds, or several clients are due sequentially -> the route times out before `recordScheduleRun()`, and a retry can rerun the same work.
  why missed  -> The generic fan-out retained the old route’s five-minute limit while the underlying crawl allows a longer execution budget.

FINDING 6: Schedule configuration can be reported successful without an audit record.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/schedules/[job]/route.ts:18-27,67,76
  confidence  -> CONFIRMED
  scenario    -> The schedule update succeeds but the `ops_audit_events` insert fails or is discarded -> the API returns `{ok:true}` with no durable evidence of who changed the configuration.
  why missed  -> Audit persistence is treated as a non-blocking side effect after the configuration mutation.

TOTAL: 6 findings
