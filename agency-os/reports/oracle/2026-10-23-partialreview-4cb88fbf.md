# codex-oracle review -- 2026-10-23 15:22:36 +08:00

- mode: `review`
- scope: -Path scripts/archive-completed-tasks.ps1, tests/archive-completed-tasks.test.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: AO-CLOSE TASKS.md archive: a [x] parent with open [ ] children is now split (parent archived with a note; each open child promoted in place to a top-level [ ] with a source line) instead of being left in the open section; new regression test with a mutation check against the old script
- exit: 0 | elapsed: 328622ms | answer: 914B
- files-reviewed: scripts/archive-completed-tasks.ps1, tests/archive-completed-tasks.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A checked descendant under an open child remains in `未完成`, contradicting the test’s “no [x] left” invariant.
  scripts/archive-completed-tasks.ps1:133 -> tests/archive-completed-tasks.test.ps1:64
  confidence  -> CONFIRMED
  scenario    -> `- [x] parent` → `  - [ ] open child` → `    - [x] done grandchild` leaves `  - [x] done grandchild` in `未完成`.
  why missed  -> The fixture only tests a checked sibling, not a checked descendant inside an open child.

FINDING 2: The regression test has a midnight date race.
  tests/archive-completed-tasks.test.ps1:54 -> scripts/archive-completed-tasks.ps1:93
  confidence  -> CONFIRMED
  scenario    -> The test records `2026-10-23`, the child process starts after midnight and writes `2026-10-24`, then date assertions fail despite correct behavior.
  why missed  -> Normal runs occur away from the local date boundary.

TOTAL: 2 findings
