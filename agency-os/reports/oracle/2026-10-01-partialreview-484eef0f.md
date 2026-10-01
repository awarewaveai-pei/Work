# codex-oracle review -- 2026-10-01 17:56:08 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, mcp/claude-userlevel/hooks/rules.manifest.json, tests/hooks/file-claim-guard.test.mjs, mcp/claude-userlevel/hooks/README.md, mcp/claude-userlevel/hooks/README.zh-TW.md, agency-os/docs/operations/TOOL_TRIGGER_MAP.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: file-claim-guard extended to Bash: PreToolUse Bash snapshots blobs of every git-status-listed file (stat cache, --no-optional-locks); PostToolUse/PostToolUseFailure diffs. A changed file another session held live AT COMMAND START (or wrote during the command) -> exit 2 report naming file+holder (cannot undo); unheld changed files become this session's claims. Claims now carry a write log (writes[] from->to blobs) so a concurrent Write/Edit during the Bash call is not attributed to it. Also: a claim ends once HEAD holds the holder's lastBlob (a committed claim was revived by the next writer, found live). Invariant: a file with uncommitted changes has one writing session. Hooks fail open; shared by Claude Code and Codex via runner.js / codex-adapter.
- exit: 0 | elapsed: 644221ms | answer: 2461B
- files-reviewed: agency-os/docs/operations/TOOL_TRIGGER_MAP.md, mcp/claude-userlevel/hooks/README.md, mcp/claude-userlevel/hooks/README.zh-TW.md, mcp/claude-userlevel/hooks/lib/file-claims.js, mcp/claude-userlevel/hooks/rules.manifest.json, mcp/claude-userlevel/hooks/rules/file-claim-guard.js, tests/hooks/file-claim-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Codex parallel Bash calls can overwrite each other’s snapshots.

  file:line   -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:152` -> `mcp/claude-userlevel/hooks/lib/file-claims.js:353`

  confidence  -> CONFIRMED

  scenario    -> Two Codex calls without `tool_use_id` share a session/turn and identical command text in different cwd values -> both use the same snapshot key; one Post hook consumes the other’s snapshot, so the second call’s file is never claimed.

  why missed  -> The parallel test covers Claude’s `tool_use_id` path; the Codex fallback is only tested sequentially.

FINDING 2: Restoring a file’s size and mtime defeats the Bash content snapshot cache.

  file:line   -> `mcp/claude-userlevel/hooks/lib/file-claims.js:321` -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:185`

  confidence  -> CONFIRMED

  scenario    -> A holds `a.txt`; the Pre hook caches its hash; Bash rewrites it to same-length content and restores the cached mtime -> Post reuses the old hash, sees `p0 === p1`, and emits no warning or claim.

  why missed  -> The regression test changes the mtime, so it exercises rehashing but not same-stat rewrites.

FINDING 3: A delayed Post hook can attribute another Bash session’s write to a read-only command.

  file:line   -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:168` -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:223`

  confidence  -> CONFIRMED

  scenario    -> B snapshots a clean file and runs `git status`; after B’s command exits but before B’s Post hook runs, A’s Bash writes the file while A has not posted yet -> B sees the change, finds no claim, and records B as the holder.

  why missed  -> The snapshot records only a start time; the post-processing path has no command-end boundary and the in-flight snapshot is used only for an informational message.

FINDING 4: Bash changes to files larger than 32 MiB are silently skipped.

  file:line   -> `mcp/claude-userlevel/hooks/lib/file-claims.js:318` -> `mcp/claude-userlevel/hooks/rules/file-claim-guard.js:185`

  confidence  -> CONFIRMED

  scenario    -> A claims a 33 MiB file through Write/Edit; B modifies it through Bash -> both snapshots store `null`, `bashChanges` discards the file, and B exits without detecting or claiming the conflicting write.

  why missed  -> The size limit is an implementation bound, but no warning is emitted for affected files.

TOTAL: 4 findings
