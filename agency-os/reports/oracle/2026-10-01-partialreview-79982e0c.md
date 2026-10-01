# codex-oracle review -- 2026-10-01 16:40:53 +08:00

- mode: `review`
- scope: -Path scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs, lobster-factory/scripts/validate-doc-integrity.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 after fixing four round-1 findings (artifact 2026-10-01-partialreview-9bd16565): (1) validate-doc-integrity now fails when agency-os/AGENTS.md exists but the gate script is missing; (2) new ambiguous_heading rule: no heading key may be the start of another; (3) fenced-block tracking follows fence character and length; (4) every number of a numeric range/list citation is checked. The gate must have no false-green path: a pointer or citation that resolves to nothing, to several headings, or to text inside a code fence must fail; an unreadable rule file must fail. Look for what the fixes themselves broke or still miss.
- exit: 0 | elapsed: 627454ms | answer: 3831B
- files-reviewed: lobster-factory/scripts/validate-doc-integrity.mjs, scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Prefix matching accepts undelimited typos as valid headings.
  file:line   -> `scripts/verify-governance-pointers.mjs:121` -> `scripts/verify-governance-pointers.mjs:173`
  confidence  -> CONFIRMED
  scenario    -> Appendix has `## Risk tiers`; citation is `AGENTS.md §Risk tiersTYPO` -> gate passes although no such heading exists.
  why missed  -> Tests cover parenthesized suffixes, not arbitrary trailing characters.

FINDING 2: Numeric ranges without repeating `§` skip later numbers.
  file:line   -> `scripts/verify-governance-pointers.mjs:193` -> `tests/hooks/governance-pointers.test.mjs:82`
  confidence  -> CONFIRMED
  scenario    -> `AGENTS.md §1-99` with section 1 present and 99 absent -> range parser matches nothing after 1 -> gate passes.
  why missed  -> Test uses `§1–§99`, not the normal `§1–99` form.

FINDING 3: Bare numeric pointers in the appendix are never checked.
  file:line   -> `scripts/verify-governance-pointers.mjs:206` -> `agency-os/docs/operations/AGENTS_APPENDIX.md:6`
  confidence  -> CONFIRMED
  scenario    -> Appendix contains `see §99` with no matching numbered heading -> digit exclusion prevents detection -> gate passes.
  why missed  -> Numeric tests require an `AGENTS.md` prefix; the appendix test covers only named pointers.

FINDING 4: Four-space-indented fence lines can close a real fenced block.
  file:line   -> `scripts/verify-governance-pointers.mjs:64` -> `tests/hooks/governance-pointers.test.mjs:61`
  confidence  -> CONFIRMED
  scenario    -> A fenced block contains `    ````, followed by `## Fake`; the parser closes at the indented line and treats `Fake` as a real heading, so a pointer resolves into code.
  why missed  -> Tests cover fence length and character, but not valid four-space-indented fence content.

FINDING 5: The source scan silently omits supported code surfaces and unreadable directories/files.
  file:line   -> `scripts/verify-governance-pointers.mjs:37` -> `scripts/verify-governance-pointers.mjs:109`
  confidence  -> CONFIRMED
  scenario    -> A bad citation is added to `scripts/rules.ts` or `lobster-factory/scripts/rules.mjs`; neither is scanned, so validation passes. An unreadable scanned file is likewise dropped.
  why missed  -> The real-tree test checks only that more than 50 sources were found, not that every source surface was covered.

FINDING 6: The appendix qualifier heuristic suppresses nearby unrelated unresolved pointers.
  file:line   -> `scripts/verify-governance-pointers.mjs:210` -> `tests/hooks/governance-pointers.test.mjs:143`
  confidence  -> CONFIRMED
  scenario    -> Appendix contains `foo.js, see §NoSuchSection`; the previous 14 characters contain `.js`, so the pointer is skipped and validation passes.
  why missed  -> The test covers an actually qualified backticked filename, not unrelated text nearby.

FINDING 7: Archive detection checks only one magic heading phrase, not archived content.
  file:line   -> `scripts/verify-governance-pointers.mjs:150` -> `tests/hooks/governance-pointers.test.mjs:139`
  confidence  -> CONFIRMED
  scenario    -> A verbatim old appendix is placed under `## Historical version` inside a fenced block without `全文存檔` -> no archive issue is emitted.
  why missed  -> The test only adds the exact `全文存檔` heading phrase.

FINDING 8: `validate-doc-integrity` trusts any existing gate that exits zero.
  file:line   -> `lobster-factory/scripts/validate-doc-integrity.mjs:451` -> `scripts/verify-governance-pointers.mjs:226`
  confidence  -> CONFIRMED
  scenario    -> `verify-governance-pointers.mjs` is truncated to an empty valid module -> Node exits 0 -> `validate:docs` reports no governance failure.
  why missed  -> The round-1 fix checks only gate existence; integration tests do not cover a present-but-no-op gate.

TOTAL: 8 findings
