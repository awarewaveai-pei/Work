# codex-oracle review -- 2026-10-01 16:59:27 +08:00

- mode: `review`
- scope: -Path scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs, lobster-factory/scripts/validate-doc-integrity.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. Rounds 1-2 (artifacts 2026-10-01-partialreview-9bd16565 and -79982e0c, 12 findings) were all one class: an input the pattern did not anticipate was silently not checked. The gate was redesigned to close the class instead of patching instances: (a) inside agency-os/AGENTS.md and its appendix EVERY section sign is classified -- resolved, qualified by another file name immediately before it (or chained to such a pointer), or a mention inside backticks -- anything else is an issue; (b) a name resolves only as a whole heading key followed by a delimiter (no prefix match), and no heading key may start another; numbers, ranges and lists are each checked, sub-numbers rejected; (c) scan scope = git ls-files (tracked + untracked-not-ignored) with code/doc extensions minus RECORD_PATHS, unreadable file = issue, git failure = issue; (d) fenced blocks follow fence char, length and indent; (e) the appendix may not contain a line of 60+ chars that also exists in AGENTS.md, in addition to the archive heading phrase; (f) the CLI prints a counted pass line and validate-doc-integrity.mjs requires it with non-zero counts, and fails when the rule file exists but the gate script is missing. Accepted, documented limit: a bare number is only range-checked. Review for remaining false-green paths in this design, and for false-RED risk (a correct repo that the gate would wrongly fail). Say so plainly if you find none.
- exit: 0 | elapsed: 727102ms | answer: 3702B
- files-reviewed: lobster-factory/scripts/validate-doc-integrity.mjs, scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Missing gate is still silently accepted when only the appendix remains
  lobster-factory/scripts/validate-doc-integrity.mjs:441 -> agency-os/docs/operations/AGENTS_APPENDIX.md:219
  confidence  -> CONFIRMED
  scenario    -> `verify-governance-pointers.mjs` and `AGENTS.md` are missing but the appendix exists -> the guard returns without adding `broken`, and validation can print PASS.
  why missed  -> The missing-gate branch checks only `AGENTS.md`, not the appendix.

FINDING 2: `lstat` failures and non-files are silently removed from the scan
  scripts/verify-governance-pointers.mjs:157 -> scripts/verify-governance-pointers.mjs:162
  confidence  -> CONFIRMED
  scenario    -> A tracked source path returns `EACCES` from `lstatSync`, or is replaced by a directory -> the code continues without `scanIssues`, so its unresolved citation is never checked.
  why missed  -> The catch assumes every failure means a deleted tracked file.

FINDING 3: JSON code/config files are outside the claimed scan scope
  scripts/verify-governance-pointers.mjs:50 -> lobster-factory/package.json:1
  confidence  -> CONFIRMED
  scenario    -> A tracked `package.json` contains `AGENTS.md §NoSuchSection` -> `.json` fails `SCAN_EXT`, so the file is never scanned and validation passes.
  why missed  -> `.json` is supported by the filename-qualifier regex but omitted from the scan-extension regex.

FINDING 4: English conjunctions can hide later AGENTS citations
  scripts/verify-governance-pointers.mjs:70 -> CLAUDE.md:20
  confidence  -> CONFIRMED
  scenario    -> A line reads `AGENTS.md §0 and §NoSuchSection` -> the first pointer resolves, `and` is not a `CHAIN_GAP`, and the second pointer is classified unrelated and skipped.
  why missed  -> `CHAIN_GAP` includes Chinese conjunctions but not `and`/`or`.

FINDING 5: Fence indentation is measured relative to the opener instead of absolutely
  scripts/verify-governance-pointers.mjs:102 -> tests/hooks/governance-pointers.test.mjs:62
  confidence  -> CONFIRMED
  scenario    -> A valid one-space-indented fence contains a four-space ` ``` ` line followed by `## Fake`; Markdown keeps the block open, but the gate closes it and treats `Fake` as a real heading.
  why missed  -> The test covers a column-zero opener but not an indented opener.

FINDING 6: Commit-mode validation bypasses the new governance gate
  lobster-factory/scripts/validate-doc-integrity.mjs:499 -> mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js:65
  confidence  -> CONFIRMED
  scenario    -> A commit changes `AGENTS.md` to contain an unresolved pointer; the post-commit hook invokes `--commit=<sha>`, exits at line 519, and never reaches `assertGovernancePointers()`.
  why missed  -> The new call was inserted only after the early-returning commit-mode branch.

FINDING 7: Valid indented Markdown headings produce false RED
  scripts/verify-governance-pointers.mjs:120 -> tests/hooks/governance-pointers.test.mjs:81
  confidence  -> CONFIRMED
  scenario    -> The appendix contains `  ## Deploy checklist` and AGENTS.md points to `§Deploy checklist` -> the valid Markdown heading is not parsed, so the pointer is reported unresolved.
  why missed  -> The parser requires the heading marker at column zero.

FINDING 8: Multi-backtick code mentions are treated as real pointers
  scripts/verify-governance-pointers.mjs:211 -> tests/hooks/governance-pointers.test.mjs:98
  confidence  -> CONFIRMED
  scenario    -> The appendix contains ````AGENTS.md §Ghost```` -> two backticks make the parity test even, so the sign is classified as an AGENTS pointer and causes a false failure.
  why missed  -> The test covers only single-backtick spans.

TOTAL: 8 findings
