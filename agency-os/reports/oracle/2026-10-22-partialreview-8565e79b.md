# codex-oracle review -- 2026-10-22 12:43:25 +08:00

- mode: `review`
- scope: -Path .gitignore, scripts/verify-asset-mcp-refs.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Review: .gitignore adds .claude/skills/synced/ (app-owned bundles; also git rm --cached, not shown). collectFiles() now uses git ls-files --cached --others --exclude-standard instead of fs walk; throws on git failure or zero files. Invariant: asset gate scans only repo-owned files, SSOT=.gitignore. Look for bypass, Windows/junction path issues, false-green, Codex-container breakage.
- exit: 0 | elapsed: 110882ms | answer: 944B
- files-reviewed: .gitignore, scripts/verify-asset-mcp-refs.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The verifier is now a binary/non-parseable JavaScript file.
  scripts/verify-asset-mcp-refs.mjs:1   -> scripts/verify-asset-mcp-refs.mjs:1
  confidence  -> CONFIRMED
  scenario    -> `node scripts/verify-asset-mcp-refs.mjs` runs -> Node fails before the asset scan starts, so every gate invocation crashes.
  why missed  -> Git emits only `Binary files differ`, hiding the source-level encoding/corruption in review.

FINDING 2: `--exclude-standard` permits non-`.gitignore` exclusions to bypass the asset gate.
  scripts/verify-asset-mcp-refs.mjs:1   -> .gitignore:57
  confidence  -> CONFIRMED
  scenario    -> A repository file matches a developer’s global Git ignore or `.git/info/exclude` rule -> `git ls-files` omits it -> the gate reports clean despite the asset being present.
  why missed  -> The implementation treats Git’s combined standard excludes as if `.gitignore` were the sole source of truth.

TOTAL: 2 findings
