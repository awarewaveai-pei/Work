# codex-oracle review -- 2026-10-24 23:22:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.sql, lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/schedule.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/site-watch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/reports.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/report-period.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/schedules/[job]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/reporting/Reporting.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/schedule.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/social-report-jobs.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/report-period.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 2 after 232e01f7: F1 fixed (periodic reports take the period from Taipei today and throw NotDueYet while it is not over in the brand tz; run-due treats NotDueYet as no run/no error/no incident; weekly uses the brand-local last week since weekday schedules have no catch-up); F3 fixed (down appends to backup with backed_up_at); F2 accepted and documented (catch-up never crosses into the next month: day 27/28 get fewer retry days in February, crossing would serve the next period); F4 unchanged by design (partial mail failure raises an incident, resend by hand, pre-existing). Operator wants social weekly/monthly/quarterly/yearly reports, each with its own send day and hour. Migration 0123 adds client_schedules.day_of_month (1-28, a TAIPEI calendar day) and frequencies monthly/quarterly/yearly; converts social_monthly_report rows daily->monthly. isDueNow: periodic frequencies fire at hourUtc when the Taipei day is in [dayOfMonth, dayOfMonth+3) of the right month (quarterly Jan/Apr/Jul/Oct, yearly Jan) and lastRunAt is in an earlier Taipei period; failures leave lastRunAt so the next day retries (claim key is per UTC day). Reports: runPeriodReport(kind) replaces runMonthlyReport (actor system:<job>, dedupe by actor+period_from), no more 1st-3rd guard in the job; MAX_DAYS 93->366; report posts uncapped (loadAnalytics postsCap). REPORT_JOBS moved to pure report-period.ts for the browser. Social reporting page and its route (path kept /api/social/reports/monthly) now toggle all four kinds and show the send time. Schedules page gets a 1-28 date picker column and bulk date. Deploy order: migration applied before the code; old code runs against the new schema for hours. Also verify: does this change depend on something NOT visible in this diff (config, schema assumption, upstream default, another caller) that contradicts it? If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 453835ms | answer: 1584B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/social-report-jobs.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/reporting/Reporting.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/schedules/run-due/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/schedules/[job]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/schedule.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/site-watch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/schedule.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/report-period.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/report-period.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/reports.ts, lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.down.sql, lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Omitting `dayOfMonth` silently resets an existing schedule date to the default 1st.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/schedules/[job]/route.ts:55`
  confidence  -> CONFIRMED
  scenario    -> A schedule is set to day 15; a PATCH omits `dayOfMonth` -> the saved date becomes 1.
  why missed  -> The current table sends the field, but stale/older callers remain compatible and trigger the defaulting path.

FINDING 2: The new report-toggle API breaks already-open old reporting pages after deployment.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts:54-55`
  confidence  -> CONFIRMED
  scenario    -> An old page sends `{ brand, enabled }` -> `kind` is undefined, the API returns 400, and the toggle fails.
  why missed  -> The database migration is backward-compatible, but the changed API request contract is not.

FINDING 3: Concurrent schedule edits can overwrite a newly selected send date or hour.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts:58-63` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts:103-121`
  confidence  -> CONFIRMED
  scenario    -> Staff changes a report’s date to 15; a stale report-toggle request reads date 1 and upserts the whole row -> date 1 is restored.
  why missed  -> Normal schedule writes have no optimistic version check; single-writer tests do not expose lost updates.

TOTAL: 3 findings
