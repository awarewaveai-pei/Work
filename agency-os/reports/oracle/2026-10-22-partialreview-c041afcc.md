# codex-oracle review -- 2026-10-22 12:49:18 +08:00

- mode: `review`
- scope: -Path .gitignore, scripts/verify-asset-mcp-refs.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Final re-review: EXTRA_FILES are now scanned directly (bypass git filter); only ROOTS discovery uses git ls-files --exclude-per-directory=.gitignore. .claude/skills/synced/ ignored+untracked (app-owned).
- exit: 0 | elapsed: 79798ms | answer: 460B
- files-reviewed: .gitignore, scripts/verify-asset-mcp-refs.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Large repositories can crash the verifier instead of scanning all assets.
  file:line   -> scripts/verify-asset-mcp-refs.mjs:88
  confidence  -> CONFIRMED
  scenario    -> `git ls-files` emits over 64 MiB of paths -> `execFileSync` throws and verification aborts without checking assets.
  why missed  -> The new Git-based discovery added a fixed output cap, while the previous filesystem walk had no equivalent limit.

Final line: TOTAL: 1 findings
