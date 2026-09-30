# codex-oracle review -- 2026-09-23 16:29:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/scripts/validate-doc-integrity.mjs, mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/runner-parity.test.mjs, mcp/claude-userlevel/hooks/README.md, mcp/claude-userlevel/hooks/README.zh-TW.md, agency-os/docs/operations/TOOL_TRIGGER_MAP.md, lobster-factory/docs/V3_GOVERNANCE_GATES.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of an attributable commit-time markdown link check (round 1 found 2 issues, both fixed here). validate-doc-integrity.mjs --commit=<rev> [--json]: judges only the links a commit is responsible for (all links in in-scope .md files it adds/modifies + links from any in-scope .md to paths it deletes), on the commit own git tree for CI parity; merges now use diff-tree -c (only paths differing from every parent = conflict resolutions / both-sides auto-merges; a file taken whole from one side is intentionally NOT blamed on the merger). Hook rule doc-link-commit-check.js (PostToolUse Bash): commits found via git [branch sha] success lines, and when absent (git commit -q) via HEAD reflog commit* entries from the last 60s; per sha runs the validator and feeds broken links back (exit 2 / Codex JSON decision); must fail open on any validator failure. Round-1 fixes to verify: (1) merge commits were skipped entirely; (2) quiet commits were never checked. Known accepted limits: commits made by non-git-commit commands (pull/merge without conflict, cherry-pick, rebase, scripts) are out of scope; a concurrent session commit inside the 60s window may also be checked (report names each sha).
- exit: 0 | elapsed: 116410ms | answer: 590B
- files-reviewed: agency-os/docs/operations/TOOL_TRIGGER_MAP.md, lobster-factory/docs/V3_GOVERNANCE_GATES.md, lobster-factory/scripts/validate-doc-integrity.mjs, mcp/claude-userlevel/hooks/README.md, mcp/claude-userlevel/hooks/README.zh-TW.md, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/runner-parity.test.mjs, mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The hook misses commits using `--author=<...>` option syntax.

  `mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js:12` -> `mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js:48`

  confidence  -> CONFIRMED

  scenario    -> `git commit --author="Agent <agent@example.com>" -m change` creates a commit, but `RE_GIT_COMMIT` does not match `--author=...`; `check()` returns `null`, so broken links in the commit are never validated.

  why missed  -> The matcher handles options followed by whitespace, but not long options using `--option=value`.

TOTAL: 1 findings
