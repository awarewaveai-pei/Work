# codex-oracle review -- 2026-11-12 22:23:46 +08:00

- mode: `review`
- scope: -Path scripts/git-parity-merge.py, scripts/lib/git-safe-ops.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 for the parity-merge data-loss fix. Round-1 findings fixed: (1) backup creation now inside try, failure removes the dir and reports nothing touched; (2) post-fast-forward merged writes go to <file>.parity-tmp then os.replace, failure removes tmp files and returns JSON backup=<dir>; git-safe-ops.ps1 Invoke-SharedWorktreeParity then says LOCAL EDITS ARE NOT IN THE FILES with that path instead of nothing touched. Report only data loss, wrong restore, crashes, or wrong caller message, with file:line.
- exit: 0 | elapsed: 127865ms | answer: 1672B
- files-reviewed: scripts/git-parity-merge.py, scripts/lib/git-safe-ops.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 固定暫存檔名會覆寫其他工作階段的檔案
  file:line   -> scripts/git-parity-merge.py:143
  confidence  -> CONFIRMED
  scenario    -> 工作目錄已有未追蹤的 `a.txt.parity-tmp`，而 `a.txt` 需要合併；`open(..., "wb")` 先截斷該檔，接著 `os.replace` 移走它，原有內容永久遺失。備份清單只保存 `a.txt`。
  why missed  -> 備份檢查涵蓋待合併路徑，沒有涵蓋新增的固定暫存路徑。

FINDING 2: 暫存檔清理再次失敗時，呼叫端會誤報「nothing touched」
  file:line   -> scripts/git-parity-merge.py:149
  confidence  -> CONFIRMED
  scenario    -> `a.txt.parity-tmp` 已是目錄；fast-forward 成功後，寫入暫存檔失敗，清理時 `os.remove` 又因目標是目錄而拋錯。helper 沒有輸出 JSON；呼叫端在 `scripts/lib/git-safe-ops.ps1:435,445` 得不到 `backup`，回報「nothing touched」，但 HEAD 已前進、合併檔可能尚未寫回。
  why missed  -> 新增的失敗處理假設清理本身不會拋錯。

FINDING 3: 已成功 fast-forward 的失敗回報仍稱 Git 拒絕前進
  file:line   -> scripts/lib/git-safe-ops.ps1:446
  confidence  -> CONFIRMED
  scenario    -> 第一個合併檔寫回成功、第二個寫回失敗；helper 於 `scripts/git-parity-merge.py:150` 回傳備份路徑，呼叫端卻顯示「git refused the fast-forward」及「LOCAL EDITS ARE NOT IN THE FILES」。實際上 HEAD 已前進，第一個檔案也已有本地修改，操作者會據此誤判還原狀態。
  why missed  -> 呼叫端沿用 helper 執行前的 `ff-refused` 訊息模板，沒有依 helper 的執行階段更新描述。

TOTAL: 3 findings
