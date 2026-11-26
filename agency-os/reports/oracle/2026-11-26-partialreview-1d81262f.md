# codex-oracle review -- 2026-11-26 18:01:03 +08:00

- mode: `review`
- scope: -Path scripts/git-parity-merge.py, scripts/check-smoke-tests.ps1, scripts/doc-sync-automation.ps1, tests/git-parity-merge-check.test.py, .claude/commands/ao-resume.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: fix: D:\Work sat 139 commits behind origin for a day. Root cause (a): AO-RESUME parity refused the ff on one conflicting file (TASKS.md, an uncommitted AO-CLOSE archive hunk next to an upstream edit) and the refusal was only a yellow console line, never a smoke blocker, so nobody acted. Fix: git-parity-merge.py --check (read-only, lists every blocking file) feeds smoke blockers[] via new mainline_parity check, printed every AO-RESUME until resolved. Root cause (b): doc-sync's stamp-only guard compared CRLF-joined new text with LF file text, so it re-stamped ~15-20 docs nightly that were never committed (more orphan hunks that later conflict). Fix: compare with LF line ends. Verified: real old/new function run on HEAD copies (old wrote, new did not; new still writes when Related list changes).
- exit: 0 | elapsed: 102329ms | answer: 645B
- files-reviewed: .claude/commands/ao-resume.md, scripts/check-smoke-tests.ps1, scripts/doc-sync-automation.ps1, scripts/git-parity-merge.py, tests/git-parity-merge-check.test.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 主線已分歧時，smoke 會誤報「下次可快轉」
  file:line   -> scripts/check-smoke-tests.ps1:595
  confidence  -> CONFIRMED
  scenario    -> 本機與 `origin/main` 各有新 commit，且沒有衝突檔案時，`--check` 只看檔案阻塞並回傳 `ok=true`（scripts/git-parity-merge.py:177–180）；smoke 因而記為 `ok:behind_*_ff_possible`。但 AO-RESUME 明確將此狀態判為 `diverged`，不會快轉（scripts/lib/git-safe-ops.ps1:419–421），阻塞也不會進入 `blockers[]`。
  why missed  -> 新檢查沿用檔案合併規劃，漏掉呼叫端先判斷的 commit 分歧狀態。

TOTAL: 1 findings