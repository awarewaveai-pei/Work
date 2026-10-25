# codex-oracle review -- 2026-10-24 21:10:52 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 3: round-2 fixes = last-run row restored, server cadence shown when details.when empty, groups empty when only is set; rejected: save already reloads view via finally load(). Round 2 after fixing: missing now counts as problem (untracked stays by-design), details.what rendered when it differs from description, settings shown for disabled jobs too. Operator (ADHD/OCD/ASD) hated /ops/schedules: settings hidden until a cell was clicked, long scroll. Rewrite of ScheduleTable: side panel removed; one tab bar (one tab per client, then one per server group backup/deploy/site, counts + N ?啣虜); every job card shows all settings open (frequency/weekday chips, 24 Taipei-hour chips replace number input); server cards show details inline; ungrouped problem rows above tabs; client page (only=slug) has 1 tab so no bar. Same GET/PATCH API calls as before. globals.css: .tab-bar wraps, .tab nowrap (app-wide). Also verify: does this change depend on something NOT visible in this diff (config value, schema assumption, upstream default) that contradicts it? If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 93607ms | answer: 726B
- files-reviewed: agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Empty schedule data renders a blank page with no empty state.

  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx:161-176 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx:199-223  
  confidence  -> CONFIRMED  
  scenario    -> GET returns `orgs=[]` and no grouped system rows (for example, a client filter matches no organization) -> `tabs=[]`, `active=undefined`, and neither client nor server content renders; the client page is visually blank.  
  why missed  -> The rewrite assumes the registry always produces at least one tab and provides no fallback for an empty view.

Final line: TOTAL: 1 findings
