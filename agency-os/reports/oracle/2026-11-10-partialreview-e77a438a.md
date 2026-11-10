# codex-oracle review -- 2026-11-10 22:24:33 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/batch-format.js, tests/hooks/runner-parity.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: batch-format Stop hook: prettier only rewrites files whose own project declares a prettier config (find-config-path), resolved from the file's nearest node_modules/prettier, not session cwd; incident 2026-11-10 video-workbench reflowed 1300 lines with default 80 cols
- exit: 0 | elapsed: 275871ms | answer: 542B
- files-reviewed: mcp/claude-userlevel/hooks/rules/batch-format.js, tests/hooks/runner-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 專案外的祖先設定檔會讓無設定的專案被格式化
  file:line   -> mcp/claude-userlevel/hooks/rules/batch-format.js:38
  confidence  -> CONFIRMED
  scenario    -> `video-workbench` 沒有 Prettier 設定，但 `D:\.prettierrc` 存在；Prettier 的設定搜尋會向上到磁碟根目錄，因此此檢查通過，Stop hook 隨後改寫該專案檔案。
  why missed  -> 新測試只模擬在檔案祖先目錄找到設定的情況，沒有驗證找到的設定是否屬於檔案自己的專案。

TOTAL: 1 findings
