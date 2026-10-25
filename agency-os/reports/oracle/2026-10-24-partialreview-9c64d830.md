# codex-oracle review -- 2026-10-24 22:23:25 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs, .claude/launch.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator rejected the previous schedules layout (one tab per client does not scale to many sites). Rewrite of ScheduleTable: tabs = jobs (fixed set) + server groups; each job tab = one row per client with on/off, frequency chips, weekday chips, hour picker (button opens a fixed-position 24-hour grid; closes on pick/Escape/outside/scroll), last result; search, filters all/failed/on/off with counts, failures sorted first; bulk bar applies on/off, frequency, or hour to selected clients (sequential PATCHes, then one reload; partial failure shows first error with ok/total). Server tabs: rows with details inline, search, all/problem filter. Client page (only=slug) single tab, no bulk/search. Same GET/PATCH API as before. Harness change: dev-server-no-supabase.mjs falls back to $PORT; launch.json gets a preview config. Also verify: does this change depend on something NOT visible in this diff (config, schema assumption, upstream default) that contradicts it? If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 374767ms | answer: 613B
- files-reviewed: .claude/launch.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/schedules/ScheduleTable.tsx, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Client maintenance view still renders one tab per job instead of a single tab.
  file:line   -> `ScheduleTable.tsx:186` -> `ClientHubTabs.tsx:692`
  confidence  -> CONFIRMED
  scenario    -> Open `/ops/clients/acme`: the API supplies all jobs (`view.ts:63`), so `view.jobs.map(...)` creates multiple tabs and the tab bar appears. Only the first job is visible until the operator switches tabs, contrary to the required single-tab client view.
  why missed  -> `single` only suppresses search and bulk controls at `ScheduleTable.tsx:273`; it is not applied when constructing the tabs.

TOTAL: 1 findings
