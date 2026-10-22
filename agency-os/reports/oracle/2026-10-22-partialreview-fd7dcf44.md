# codex-oracle review -- 2026-10-22 15:01:31 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `44be66e02^..44be66e02`
- context: Social manager card C25: saved reports (social_reports), numbers only via metrics.ts summarize/loadAnalytics, printable A4 landscape report page, monthly mail job social_monthly_report (client_schedules row is the switch). Check authz on the API routes, period arithmetic, monthly idempotency.
- exit: 0 | elapsed: 418244ms | answer: 1881B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/reporting/Reporting.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/(sections)/reporting/reporting.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialApp.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/reports/ReportView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/reports/[id]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/reports/report-view.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/monthly/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/reports/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/social/reports/[id]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/social-monthly-job.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/report-period.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/report-period.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/reports.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Report totals mix brand-local periods with Facebook’s Pacific-day metrics.
  file:line   -> `lobster-factory/.../lib/social/reports.ts:72-82` -> `lobster-factory/.../lib/social/metrics.ts:1-7,60-70`
  confidence  -> CONFIRMED
  scenario    -> An Asia/Taipei brand reports September 1–30; the report queries Facebook rows by those literal dates, although those rows represent Pacific days, so the totals include/exclude the wrong boundary hours while posts use brand-local instants.
  why missed  -> The loader reuses date strings without converting platform-specific day semantics.

FINDING 2: Partial monthly-mail failure is treated as permanent success.
  file:line   -> `lobster-factory/.../lib/social/reports.ts:121-148`
  confidence  -> CONFIRMED
  scenario    -> Two recipients exist, one Resend call succeeds and one returns `{ ok: false }`; the job returns `sent ... to 1/2`, keeps the report, and the next run finds it at line 121 and skips it, so the failed recipient never receives the report.
  why missed  -> The test covers only the all-recipients-fail branch at `lib/schedules/__tests__/social-monthly-job.test.ts:72-75`.

FINDING 3: Reports drop the “no data collected” condition and show a misleading generic reason.
  file:line   -> `lobster-factory/.../lib/social/reports.ts:89-99` -> `lobster-factory/.../lib/social/metrics.ts:354-361` and `lobster-factory/.../reports/ReportView.tsx:142-144`
  confidence  -> CONFIRMED
  scenario    -> A connected Facebook/Bluesky account has no daily rows for the selected period; `loadAnalytics` records it in `empty`, but `loadReportData` returns only `gaps`, so the report shows `—` without saying data was never collected and instead says the platform did not provide it.
  why missed  -> The analytics page handles `empty` separately, but the report projection copies only `gaps`.

TOTAL: 3 findings
