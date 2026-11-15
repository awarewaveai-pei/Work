# codex-oracle review -- 2026-11-15 17:21:46 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: git-parity-merge.py renormalizes eol-phantom files (status M on size only, hash==index) before the ff with byte re-check before any overwrite; scope guard resets the add -N placeholder (porcelain v2 zero index hash) after a private-index commit; P17/P17b + mjs tests; diverged-main procedure in docs replaces pull --rebase advice
- exit: 0 | elapsed: 122607ms | answer: 1150B
- files-reviewed: .claude/commands/ao-resume.md, agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md, mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, scripts/git-parity-merge.py, scripts/lib/git-safe-ops.ps1, tests/ao-resume-shared-worktree.test.ps1, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The pre-move check can miss changed bytes in an untracked file.
  file:line   -> scripts/git-parity-merge.py:154
  confidence  -> CONFIRMED
  scenario    -> An untracked file initially matches the target with LF endings. An editor changes it to CRLF during planning. The check treats it as unchanged; the script moves it at line 165 and deletes the backup after the fast-forward, losing the editor’s new bytes.
  why missed  -> The recheck compares normalized content, while the stated safeguard is a byte recheck before replacing files.

FINDING 2: The diverged-main recovery instructions point to a worklog entry that is absent.
  file:line   -> agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md:255
  confidence  -> CONFIRMED
  scenario    -> An operator with a dirty, diverged checkout follows the new reference for the procedure’s scripts and backups. This checkout’s `WORKLOG.md` has no 2026-11-15 “D:\Work 對齊” entry, so the referenced recovery details cannot be found.
  why missed  -> The instruction appears to refer to an entry in another checkout rather than content included in this change.

TOTAL: 2 findings
