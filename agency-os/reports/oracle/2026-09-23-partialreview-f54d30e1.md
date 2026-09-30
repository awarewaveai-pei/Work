# codex-oracle review -- 2026-09-23 16:20:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/scripts/validate-doc-integrity.mjs, mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/runner-parity.test.mjs, mcp/claude-userlevel/hooks/README.md, mcp/claude-userlevel/hooks/README.zh-TW.md, agency-os/docs/operations/TOOL_TRIGGER_MAP.md, lobster-factory/docs/V3_GOVERNANCE_GATES.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Adds an attributable commit-time markdown link check. (1) lobster-factory/scripts/validate-doc-integrity.mjs gains --commit=<rev> [--json]: outgoing links of in-scope .md files the commit adds/modifies plus incoming links to paths it deletes, evaluated against the commit own git tree (ls-tree / cat-file --batch) for CI parity (case-sensitive, untracked files do not count); full mode is refactored onto one LINK_SCAN_ROOTS list shared with inLinkScope() and must stay behavior-identical. (2) New PostToolUse Bash hook rule mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js parses the git [branch sha] success line from tool_response (Claude object or Codex plain string), runs the validator per sha, and feeds broken links back to the committing agent (runner exit 2 / Codex JSON decision); it must fail open on any validator failure. Why: 6 broken links stayed red 16 days because the only detectors (nightly health, CI, /verify) were repo-wide and unattributed.
- exit: 0 | elapsed: 112123ms | answer: 1182B
- files-reviewed: agency-os/docs/operations/TOOL_TRIGGER_MAP.md, lobster-factory/docs/V3_GOVERNANCE_GATES.md, lobster-factory/scripts/validate-doc-integrity.mjs, mcp/claude-userlevel/hooks/README.md, mcp/claude-userlevel/hooks/README.zh-TW.md, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/runner-parity.test.mjs, mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Merge commits are silently excluded, so conflict-resolution link breakage is never checked.
  lobster-factory/scripts/validate-doc-integrity.mjs:197-199   -> lobster-factory/scripts/validate-doc-integrity.mjs:187
  confidence  -> CONFIRMED
  scenario    -> A merge resolves a documentation conflict by adding `[x](missing.md)`; the merge commit contains the broken final tree, but the validator returns `skipped` and the hook reports no defect.
  why missed  -> The implementation assumes merged branch contents were already checked, but merge conflict resolutions can introduce unique changes.

FINDING 2: Successful quiet commits are not checked.
  mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js:32-33   -> mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js:11
  confidence  -> CONFIRMED
  scenario    -> `git commit --quiet` successfully creates a commit containing `[x](missing.md)`; Git emits no summary line, `shas` is empty, and the hook returns without running the validator.
  why missed  -> The hook treats absence of the human-readable summary as evidence that no commit occurred, although `--quiet` suppresses only output.

TOTAL: 2 findings
