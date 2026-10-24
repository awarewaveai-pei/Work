# codex-oracle review -- 2026-10-24 23:12:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.sql, lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/schedule.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/site-watch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/reports.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/report-period.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/schedules/[job]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/reporting/Reporting.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/schedule.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/social-report-jobs.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/report-period.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator wants social weekly/monthly/quarterly/yearly reports, each with its own send day and hour. Migration 0123 adds client_schedules.day_of_month (1-28, a TAIPEI calendar day) and frequencies monthly/quarterly/yearly; converts social_monthly_report rows daily->monthly. isDueNow: periodic frequencies fire at hourUtc when the Taipei day is in [dayOfMonth, dayOfMonth+3) of the right month (quarterly Jan/Apr/Jul/Oct, yearly Jan) and lastRunAt is in an earlier Taipei period; failures leave lastRunAt so the next day retries (claim key is per UTC day). Reports: runPeriodReport(kind) replaces runMonthlyReport (actor system:<job>, dedupe by actor+period_from), no more 1st-3rd guard in the job; MAX_DAYS 93->366; report posts uncapped (loadAnalytics postsCap). REPORT_JOBS moved to pure report-period.ts for the browser. Social reporting page and its route (path kept /api/social/reports/monthly) now toggle all four kinds and show the send time. Schedules page gets a 1-28 date picker column and bulk date. Deploy order: migration applied before the code; old code runs against the new schema for hours. Also verify: does this change depend on something NOT visible in this diff (config, schema assumption, upstream default, another caller) that contradicts it? If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 283519ms | answer: 2186B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/social-report-jobs.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/reporting/Reporting.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/schedules/[job]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/schedule.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/adapters/site-watch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/schedule.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/report-period.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/metrics.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/report-period.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/reports.ts, lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.down.sql, lobster-factory/packages/db/migrations/0123_client_schedules_day_of_month.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Taipei-triggered schedules can generate the wrong reporting period for non-Taipei brands.
  file: `lib/schedules/schedule.ts:67`   -> `lib/social/reports.ts:124`
  confidence  -> CONFIRMED
  scenario    -> A monthly job fires at 2026-11-01 01:00 UTC (Taipei Nov 1), but a New York brand is still on Oct 31. `runPeriodReport` computes the brand date as Oct 31 and sends September’s report; October is then skipped.
  why missed  -> The schedule uses Taipei time, while report periods use each brand’s configurable timezone (`0001_core.sql:3-14`).

FINDING 2: Monthly catch-up fails when the scheduled day is near February’s end.
  file: `lib/schedules/schedule.ts:76`   -> `lib/schedules/schedule.ts:87`
  confidence  -> CONFIRMED
  scenario    -> A monthly job scheduled for day 28 fails on February 28. March 1 and March 2 return not-due because their numeric days are less than 28, so the report is retried only on March 28.
  why missed  -> The retry window compares day-of-month numbers without handling month rollover.

FINDING 3: Repeated rollback cycles can permanently delete periodic schedules.
  file: `packages/db/migrations/0123_client_schedules_day_of_month.down.sql:11`   -> `packages/db/migrations/0123_client_schedules_day_of_month.down.sql:18`
  confidence  -> CONFIRMED
  scenario    -> Roll back 0123, reapply it, create a new quarterly schedule, then roll back again. `CREATE TABLE IF NOT EXISTS` does not refresh the backup, but the row is deleted, leaving no backup copy.
  why missed  -> The rollback assumes the backup table is created only once and does not account for later rows.

FINDING 4: Partial email failure suppresses retries for recipients who did not receive the report.
  file: `lib/social/reports.ts:123`   -> `lib/social/reports.ts:153`
  confidence  -> CONFIRMED
  scenario    -> One recipient receives the email and another fails. The job throws but retains the report; the next due run finds the dedupe record and skips, so the failed recipient never receives it automatically.
  why missed  -> Period deduplication is treated as delivery completion, although delivery is tracked only at aggregate job level.

TOTAL: 4 findings
