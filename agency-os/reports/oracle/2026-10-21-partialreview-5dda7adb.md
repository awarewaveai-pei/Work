# codex-oracle review -- 2026-10-21 11:05:40 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Lists.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/social.css, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Social V1.5 C23 list weekday x time grid follow-up: row-key collision fix when a loaded list has no slots; time picker (compose DateTimePicker, time only) made visible in the list grid (compose.css import, .sm-lsdtp wrapper opening over the grid, grid box overflow visible); render fixture slots + 11-list-detail/11-list-time shots. Rest of Lists.tsx (rowsFromList/slotsFromRows/save from cf2b4ecc1) and lib/social/lists.ts parseSlots are context. Report only findings that break the main path or lose data; if none, say so.
- exit: 0 | elapsed: 523613ms | answer: 662B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Lists.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/social.css, lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The visible 15-minute picker permits grids the server rejects.

  file:line   -> `app/(shell)/tools/social/Lists.tsx:191,194-195` -> `app/(shell)/tools/social/compose/DateTimePicker.tsx:11,29` -> `lib/social/lists.ts:5,11`
  confidence  -> CONFIRMED
  scenario    -> User creates 25 distinct quarter-hour rows and selects all 7 weekdays, producing 175 slots; saving sends them, but `parseSlots` rejects anything over 168 with HTTP 400.
  why missed  -> The backend cap assumes hourly slots, while the newly exposed picker offers 96 quarter-hour times per day; boundary coverage tests parser input but not the UI’s permitted range.

TOTAL: 1 findings
