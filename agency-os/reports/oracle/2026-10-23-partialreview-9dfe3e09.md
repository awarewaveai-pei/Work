# codex-oracle review -- 2026-10-23 13:37:28 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, tests/hooks/shared-file-guard.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Re-review after fixing 3 findings. Invariant: the hook checks and later syncs exactly the index git commits. privateIndexOf resolves GIT_INDEX_FILE from the commit segment prefix assignments (never message text) or the last earlier export segment; PreToolUse blocks a value with $, backtick, leading ~, glob chars, or a nonexistent file. git-shared-file-guard uses the same resolver. Report only real defects.
- exit: 0 | elapsed: 264426ms | answer: 1854B
- files-reviewed: mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js, mcp/claude-userlevel/hooks/rules/git-shared-file-guard.js, tests/hooks/shared-file-guard.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `env -i GIT_INDEX_FILE=... git commit` 未解析為 private index
  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:345-352`; sync at `:531-533`
  confidence  -> CONFIRMED
  scenario    -> helper 建立有效 private index 後執行 `env -i GIT_INDEX_FILE=<idx> git commit`；regex 把 `<idx>` 吃成 `env -i` 的參數，`privIdx` 為 null，commit 成功但 PostToolUse 不 sync／清理該 private index。
  why missed  -> 測試只覆蓋直接 assignment 與簡單 `export`（`tests/hooks/shared-file-guard.test.mjs:121-131`）。

FINDING 2: `export` 後的 `unset` 會讓 hook 檢查錯誤的 index
  file:line   -> `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:353-357`; `:496-503`
  confidence  -> CONFIRMED
  scenario    -> 執行 `export GIT_INDEX_FILE=<private>; unset GIT_INDEX_FILE; git commit -m mine`，resolver 仍回傳 `<private>`；實際 Git 使用 shared index，可能把另一 session 已 staged 的 shared file 一起 commit，而兩個 guard 都以 private marker 放行。
  why missed  -> 實作只回溯最後一個 export，沒有處理後續 shell state mutation；測試只測試 export 緊接 commit。

FINDING 3: heredoc／commit message 內容可被誤認為 earlier export
  file:line   -> `mcp/claude-userlevel/hooks/lib/shared.js:163-170`; `mcp/claude-userlevel/hooks/rules/git-commit-scope-guard.js:353-355`
  confidence  -> CONFIRMED
  scenario    -> `cat > msg <<'EOF'` 的 heredoc 內容包含 `export GIT_INDEX_FILE=<private>`，之後執行 `git commit -F msg`；segment splitter 將 heredoc 行當成 export segment，hook 以 private marker 放行，但實際 commit 使用 shared index，可能提交 foreign staged hunks。
  why missed  -> 測試只驗證直接 export segment，未涵蓋 commit 前建立 message file 的 heredoc。

TOTAL: 3 findings
