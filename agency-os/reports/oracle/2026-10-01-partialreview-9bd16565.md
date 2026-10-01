# codex-oracle review -- 2026-10-01 16:28:07 +08:00

- mode: `review`
- scope: -Path scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs, lobster-factory/scripts/validate-doc-integrity.mjs, scripts/test-hooks.sh, .github/workflows/shared-asset-gates.yml, mcp/claude-userlevel/hooks/rules/file-path-router.js, mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, mcp/claude-userlevel/hooks/rules/verify-gate-stop.js, scripts/verify-closeout-completeness.ps1, agency-os/AGENTS.md, agency-os/docs/operations/AGENTS_APPENDIX.md, .claude/commands/ao-close.md, .claude/commands/ao-resume.md, .claude/commands/verify-recent.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: New gate scripts/verify-governance-pointers.mjs: every section pointer into agency-os/AGENTS.md and its appendix (from AGENTS.md line ends, and from hooks/scripts/commands citing AGENTS.md by section name or number) must resolve to exactly one heading; the appendix may hold no verbatim archive. AGENTS_APPENDIX.md rebuilt from 112KB (87 percent verbatim old copies, 18 duplicate headings) to 40KB of live detail sliced from the old text; stale citations in 3 hook rules, 1 script and 3 commands re-pointed. Acceptance: no false-green path in the gate (missing files, BOM, fenced code, regex gaps), the wiring inside validate-doc-integrity.mjs cannot swallow a failure, and no rule detail was lost from the live rule set.
- exit: 0 | elapsed: 538231ms | answer: 1778B
- files-reviewed: .claude/commands/ao-close.md, .claude/commands/ao-resume.md, .claude/commands/verify-recent.md, .github/workflows/shared-asset-gates.yml, agency-os/AGENTS.md, agency-os/docs/operations/AGENTS_APPENDIX.md, lobster-factory/scripts/validate-doc-integrity.mjs, mcp/claude-userlevel/hooks/rules/file-path-router.js, mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, mcp/claude-userlevel/hooks/rules/verify-gate-stop.js, scripts/test-hooks.sh, scripts/verify-closeout-completeness.ps1, scripts/verify-governance-pointers.mjs, tests/hooks/governance-pointers.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Missing governance gate is silently treated as success  
  lobster-factory/scripts/validate-doc-integrity.mjs:442 -> scripts/verify-governance-pointers.mjs:1  
  confidence  -> CONFIRMED  
  scenario    -> Gate file is deleted or renamed -> `validate-doc-integrity.mjs` returns before running it and can report green.  
  why missed  -> The integration assumes absence means “not a monorepo root.”

FINDING 2: Ambiguous section pointers are accepted  
  scripts/verify-governance-pointers.mjs:108 -> scripts/verify-governance-pointers.mjs:149  
  confidence  -> CONFIRMED  
  scenario    -> Appendix contains `Deploy checklist` and `Deploy checklist details`; AGENTS.md ends with `§Deploy checklist` -> `some()` returns true and the gate passes despite two matches.  
  why missed  -> Duplicate detection only catches identical keys, not prefix collisions.

FINDING 3: Fenced code with different fence lengths can create false headings  
  scripts/verify-governance-pointers.mjs:58 -> scripts/verify-governance-pointers.mjs:61  
  confidence  -> CONFIRMED  
  scenario    -> A four-backtick fence contains a triple-backtick line followed by `## Fake section` -> the boolean toggles early, treating code as a real heading and satisfying a pointer.  
  why missed  -> The test covers only matching three-backtick fences.

FINDING 4: Numeric range citations validate only the first section number  
  scripts/verify-governance-pointers.mjs:155 -> scripts/verify-governance-pointers.mjs:160  
  confidence  -> CONFIRMED  
  scenario    -> A source cites `AGENTS.md §8–§99` while only section 8 exists -> the regex extracts `8`, so the invalid range passes.  
  why missed  -> Citation validation stores and checks only the first numeric match.

TOTAL: 4 findings
