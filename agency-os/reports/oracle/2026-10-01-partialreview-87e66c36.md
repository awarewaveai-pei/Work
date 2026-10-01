# codex-oracle review -- 2026-10-01 17:19:05 +08:00

- mode: `review`
- scope: -Path scripts/gen-trigger-index.mjs, tests/hooks/trigger-index.test.mjs, scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: scripts/gen-trigger-index.mjs derives a one-line-per-row trigger index from the five lookup tables in agency-os/docs/operations/TOOL_TRIGGER_MAP.md and writes it between two markers in agency-os/AGENTS.md (injected into the agent prompt every turn). The map stays the only place a row is authored. scripts/verify-governance-pointers.mjs (already committed in b9a6ec3bb; only its trigger_index_stale addition is new here) fails when the block in AGENTS.md differs from what the generator yields now, when the block is missing, or when the generator can no longer find its section/tables. Row selection: all runbook rows; self-trigger rows without the hook marker; all preload rows; phrase rows without the hook marker whose first target is not a loaded command/agent/skill. Acceptance: the index cannot drift from the map without the gate going red; a restructured map cannot yield an empty or truncated index silently; a row is never dropped by a parsing accident (pipes in code spans, escaped pipes, table header detection, CRLF, BOM). Report false-green paths and rows that would be silently lost. Say so plainly if you find none.
- exit: 0 | elapsed: 690956ms | answer: 3039B
- files-reviewed: scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs, scripts/gen-trigger-index.mjs, tests/hooks/trigger-index.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Clipped rows allow map changes to pass without changing the index.
  file:line   -> scripts/gen-trigger-index.mjs:80,145; agency-os/docs/operations/TOOL_TRIGGER_MAP.md:37; scripts/verify-governance-pointers.mjs:312
  confidence  -> CONFIRMED
  scenario    -> Change only `週報月報 stale` to `週報月報 fresh`; both render as the same clipped `雲端...漂移…`, so the gate stays green while the map changed.
  why missed  -> The real-tree test checks equality and row count, not changes beyond clip limits (`tests/hooks/trigger-index.test.mjs:103-109`).

FINDING 2: The fifth lookup table is never required to exist.
  file:line   -> scripts/gen-trigger-index.mjs:47-51; agency-os/docs/operations/TOOL_TRIGGER_MAP.md:44-47
  confidence  -> CONFIRMED
  scenario    -> Delete or rename the `工作類型 → Agent/Tool` table; the generator still renders four sections, `--write` accepts it, and the verifier reports green.
  why missed  -> The synthetic map includes that table but never tests its removal (`tests/hooks/trigger-index.test.mjs:29-32,90-93`).

FINDING 3: Duplicate trigger-index blocks are accepted as valid.
  file:line   -> scripts/gen-trigger-index.mjs:171-174,198-200; scripts/verify-governance-pointers.mjs:311-319
  confidence  -> CONFIRMED
  scenario    -> AGENTS.md contains one correct block followed by a stale duplicate block; `currentBlock()` returns only the first block, so verification passes and `--write` leaves the stale duplicate.
  why missed  -> Tests cover reversed or missing markers, but not duplicate markers (`tests/hooks/trigger-index.test.mjs:96-100`).

FINDING 4: Pipes in double-backtick code spans are parsed as table separators.
  file:line   -> scripts/gen-trigger-index.mjs:61-70
  confidence  -> CONFIRMED
  scenario    -> A row contains `` ``error|401`` ``; the second opening backtick turns code mode off, so `|` splits the cell and the generated target becomes incorrect while the gate remains green.
  why missed  -> The test covers only single-backtick spans (`tests/hooks/trigger-index.test.mjs:62-64`).

FINDING 5: Removing a table header silently drops the first data row.
  file:line   -> scripts/gen-trigger-index.mjs:110-116,147
  confidence  -> CONFIRMED
  scenario    -> A selected table loses its header but retains two data rows; the first data row is consumed as `seenHeader`, the second is indexed, and the non-empty table avoids the failure check.
  why missed  -> Tests only cover a missing whole table or a table with zero selected rows (`tests/hooks/trigger-index.test.mjs:90-93`).

FINDING 6: Valid Markdown rows without a leading pipe are silently ignored.
  file:line   -> scripts/gen-trigger-index.mjs:110-113
  confidence  -> CONFIRMED
  scenario    -> Reformat one row as `症狀 | runbooks/foo.md` using Markdown’s optional outer-pipe form; the parser skips it, other rows keep the table non-empty, and verification passes.
  why missed  -> Every fixture row starts with `|` (`tests/hooks/trigger-index.test.mjs:25-54`).

TOTAL: 6 findings
