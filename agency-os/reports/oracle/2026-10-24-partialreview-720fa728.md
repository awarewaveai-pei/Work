# codex-oracle review -- 2026-10-24 21:08:36 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 2 after fixing: missing now counts as problem (untracked stays by-design), details.what rendered when it differs from description, settings shown for disabled jobs too. Operator (ADHD/OCD/ASD) hated /ops/schedules: settings hidden until a cell was clicked, long scroll. Rewrite of ScheduleTable: side panel removed; one tab bar (one tab per client, then one per server group backup/deploy/site, counts + N ?啣虜); every job card shows all settings open (frequency/weekday chips, 24 Taipei-hour chips replace number input); server cards show details inline; ungrouped problem rows above tabs; client page (only=slug) has 1 tab so no bar. Same GET/PATCH API calls as before. globals.css: .tab-bar wraps, .tab nowrap (app-wide). Also verify: does this change depend on something NOT visible in this diff (config value, schema assumption, upstream default) that contradicts it? If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 117265ms | answer: 2226B
- files-reviewed: agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Successful edits leave the card and optimistic-lock version stale
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx:128 -> :143`
  confidence  -> CONFIRMED
  scenario    -> A PATCH succeeds with version 7, but `view.cells` remains version 7; the next edit sends `expectedVersion: 7` again and receives `version_conflict`, while the card still displays the old setting.
  why missed  -> The rewrite added the saved indicator but retained the old save path without updating local cell state.

FINDING 2: Failed jobs no longer show their last-run timestamp
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx:283 -> :287`
  confidence  -> CONFIRMED
  scenario    -> A job has `lastRunAt` and `lastError`; the card renders only `失敗：<lastErrorAt>`, so the operator cannot see when the job last ran.
  why missed  -> The new compact result row replaced the previous separate last-run and last-result fields.

FINDING 3: Server schedule cadence is dropped from the new card
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx:298 -> :308`
  confidence  -> CONFIRMED
  scenario    -> A server row has `cadence: "每天 03:00"` but no `details.when`; the card displays description/status/last-run data but never displays the cadence.
  why missed  -> The card reconstructs the summary from `lastAt` and `detail` and does not carry over the old `r.cadence` rendering.

FINDING 4: Client pages can still display server tabs
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx:162 -> :200`
  confidence  -> PLAUSIBLE
  scenario    -> When `only="client-slug"` returns that client plus any grouped `view.system` rows, `groups` is nonempty, so `tabs` contains the client tab and server-group tabs; the client page therefore shows a tab bar instead of one unbarred tab.
  why missed  -> The tab construction never conditions server groups on `only`, relying on an unstated API behavior that client responses contain no system rows.

TOTAL: 4 findings
