# codex-oracle review -- 2026-11-12 22:19:41 +08:00

- mode: `review`
- scope: -Path scripts/git-parity-merge.py, tests/ao-resume-shared-worktree.test.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fix after a data-loss incident 2026-11-12: the old script rewrote ten tracked files to HEAD bytes, then os.replace of an untracked file to tempfile.mkdtemp() on C: failed (WinError 17, repo on D:) and the merged bytes lived only in memory. Invariant now: before any file changes, every local byte to be changed is saved in a backup dir inside the repo's git common dir (same drive) with manifest.json; any exception restores all of it (moved files back, ours bytes, staged index); a killed process leaves the dir, whose path failure messages print. New test P16 locks an untracked file so the move fails after rewrites; mutation removing restore turns it red. Report only data loss, wrong restore, crashes, or main-path breakage, with file:line.
- exit: 0 | elapsed: 87083ms | answer: 1253B
- files-reviewed: scripts/git-parity-merge.py, tests/ao-resume-shared-worktree.test.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: fast-forward 後寫回合併內容失敗，工作樹不會還原。
  file:line   -> scripts/git-parity-merge.py:134
  confidence  -> CONFIRMED
  scenario    -> Git fast-forward 成功後，寫入較大的合併檔時磁碟空間耗盡；`open(..., "wb")` 可能已截斷檔案，例外路徑只回報備份位置。呼叫端隨後回報「nothing touched」，下次執行則因 HEAD 已追上遠端而回報「up-to-date」（scripts/lib/git-safe-ops.ps1:410、443）。本機編輯只剩備份，未被還原。
  why missed  -> P16 只測 fast-forward *之前* 的移動失敗，沒有覆蓋 fast-forward 之後的寫入失敗。

FINDING 2: 建立備份時的例外未被捕捉，導致 helper 崩潰且不回報備份路徑。
  file:line   -> scripts/git-parity-merge.py:98
  confidence  -> CONFIRMED
  scenario    -> 備份目錄建立後，寫入 `ours-0` 時磁碟空間耗盡；例外發生在 `try` 之外，程序直接以 traceback 結束。呼叫端丟棄 stderr 並回報「merge helper unavailable」（scripts/lib/git-safe-ops.ps1:434、442），留下的備份目錄路徑沒有出現在失敗訊息中。
  why missed  -> 測試注入的是完成備份後的移動失敗，未覆蓋備份建立過程。

TOTAL: 2 findings
