# codex-oracle review -- 2026-10-23 13:53:30 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, tests/hooks/shared-file-guard.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Final review. One accepted private-index shape: the commit segment STARTS with GIT_INDEX_FILE=<existing ABSOLUTE literal path> immediately followed by git (no other assignment, no env). GIT_INDEX_FILE anywhere else in the command, a relative path, shell expansion chars, or a missing file -> PreToolUse BLOCK. Report only real defects: a way to commit with an index the hook did not check, or a false block of the canonical shape.
- exit: 0 | elapsed: 198105ms | answer: 1266B
- files-reviewed: mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Quoted shell operators in a commit message falsely block the canonical shape  
  mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:362 -> mcp/claude-userlevel/hooks/lib/shared.js:167  
  confidence  -> CONFIRMED  
  scenario    -> `GIT_INDEX_FILE=/abs/index git commit -m "note; GIT_INDEX_FILE=other"` is valid, but the segment splitter treats `;` inside quotes as a new segment; `untrustedIndex()` sees the message text and PreToolUse blocks the commit.  
  why missed  -> The added message test only uses a message without shell separators (`tests/hooks/shared-file-guard.test.mjs:141`).

FINDING 2: `exec env ... git commit` bypasses commit detection entirely  
  mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:496-499 -> mcp/claude-userlevel/hooks/lib/shared.js:467  
  confidence  -> CONFIRMED  
  scenario    -> `exec env GIT_INDEX_FILE=/abs/unchecked.index git commit -m x` executes Git with that index, but `RE_GIT_COMMIT` does not recognize the `exec` prefix; `findCommitSegment()` returns no segment and the hook returns without checking the index.  
  why missed  -> The new validation only runs after the pre-existing commit recognizer succeeds; wrapper commands are outside that recognizer’s grammar.

TOTAL: 2 findings
