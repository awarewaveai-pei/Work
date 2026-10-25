# codex-oracle review -- 2026-10-24 21:05:06 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator (ADHD/OCD/ASD) hated /ops/schedules: settings hidden until a cell was clicked, long scroll. Rewrite of ScheduleTable: side panel removed; one tab bar (one tab per client, then one per server group backup/deploy/site, counts + N ?啣虜); every job card shows all settings open (frequency/weekday chips, 24 Taipei-hour chips replace number input); server cards show details inline; ungrouped problem rows above tabs; client page (only=slug) has 1 tab so no bar. Same GET/PATCH API calls as before. globals.css: .tab-bar wraps, .tab nowrap (app-wide). Also verify: does this change depend on something NOT visible in this diff (config value, schema assumption, upstream default) that contradicts it? If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 170083ms | answer: 1451B
- files-reviewed: agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Server-tab anomaly counts omit `missing` and `untracked` rows  
  file:line   -> `ScheduleTable.tsx:60` -> `types.ts:53`  
  confidence  -> CONFIRMED  
  scenario    -> A host row is `untracked` or `missing`; the tab count omits it and the card lacks the problem highlight, so the operator sees no “N 異常” despite a non-`ok` state.  
  why missed  -> `SERVER_BAD` only includes `failed`, `stale`, and `unregistered`.

FINDING 2: Server cards drop the detailed “what” field  
  file:line   -> `ScheduleTable.tsx:308` -> `host-status.ts:24`  
  confidence  -> CONFIRMED  
  scenario    -> The backup card has `details.what` describing 18 stores and R2 verification, but the rendered card shows only the short description; the operator loses the actual work scope.  
  why missed  -> The refactor copied several detail fields but never rendered `r.details.what`.

FINDING 3: Disabled jobs do not show their stored settings  
  file:line   -> `ScheduleTable.tsx:249` -> `SCHEDULES_PAGE_PLAN.md:46`  
  confidence  -> CONFIRMED  
  scenario    -> A default-off job’s card shows only the switch; frequency, weekday, and hour controls remain hidden until it is enabled, so the operator cannot inspect or configure its schedule while keeping it disabled.  
  why missed  -> The component’s local “off jobs have no time” assumption contradicts the stated requirement that all settings be open on every job card.

TOTAL: 3 findings
