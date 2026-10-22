# codex-oracle review -- 2026-10-22 12:47:43 +08:00

- mode: `review`
- scope: -Path .gitignore, scripts/verify-asset-mcp-refs.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Re-review after fixes: NUL byte in source replaced by escape; --exclude-standard replaced by --exclude-per-directory=.gitignore. Gate scans only git-defined repo-owned files; .claude/skills/synced/ ignored + untracked (app-owned).
- exit: 0 | elapsed: 211390ms | answer: 734B
- files-reviewed: .gitignore, scripts/verify-asset-mcp-refs.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Git filtering silently excludes the explicitly listed deployed subagent charter from scanning.
  file:line   -> scripts/verify-asset-mcp-refs.mjs:44,88; .gitignore:36; mcp/claude-userlevel/manifest.json:60-61
  confidence  -> CONFIRMED
  scenario    -> A bad MCP reference is added to `mcp/claude-userlevel/SUBAGENT_CHARTER.md` and synced to `.claude/SUBAGENT_CHARTER.md`; Git excludes the deployed copy, while the source is outside `ROOTS`, so the gate passes without checking it.
  why missed   -> The new collector applies `.gitignore` to `EXTRA_FILES`; tests cover only the current tree and in-memory parsing, not an ignored extra file. [Git exclusion behavior](https://git-scm.com/docs/git-ls-files)

TOTAL: 1 findings
