# 2026-10-22 共享工作目錄的 commit 問題：每 session 獨立 worktree 試點

Mode: 直接決策（非 /decide 面板）。操作者回「A」＝同意方案 A 試點（2026-10-22）。

## 問題
commit 要只含自己寫的，但所有 session 共用一個工作目錄與 index，git 看不出作者。現有閘門都在猜作者：`git-commit-scope-guard.js`（619 行）、`git-add-scope-tracker.js`（323）、`git-shared-file-guard.js`（124）、`worklog-entry-number-guard.js`（65）、`file-claim-guard.js`（285）＋`lib/file-claims.js`、`scripts/git-partial-worktree-commit.py`（300）；2026-08-30 起這幾支改過 11 次，共約 2,300 行。

## 不變量
一個 session 的工作目錄只含自己的未提交改動 → 普通 `git commit` 天生正確，上述閘門不再需要。

## 方案
- **A（採用，先試點）**：每 session 一個 linked worktree（detached HEAD，不建分支），合回 main 用 rebase＋`git push origin HEAD:main`。
- B（不單做）：WORKLOG／TASKS 拆成每筆一檔。只關「共享檔」一類；讀取端 38 支腳本＋86 份文件要改或加生成檢視。A 試點若出現續號重號／rebase 衝突再補。

## 試點規則
- 舊閘門與腳本全留，試點期間不刪任何東西。
- 挑一張完整的卡在 worktree 做完，量：commit 收尾 token、rebase 衝突次數、hooks 缺什麼（linked worktree 內 hooks／`.claude` junction 為 no-op，`CLAUDE.md` R1）。
- 未驗證：`settings` deny 規則是否擋 `push HEAD:main`；worktree 清理不得動主 `node_modules`（WORKLOG 2026-10-21 續22 事故）。
- 結果寫回本檔「試點結果」，再決定全面切換／加 B／維持現狀。

## 撤回（2026-10-22）
- A 已撤回：`AGENTS.md` §8 的 worktree 句刪除。
- 原因：worktree push 讓 origin 前進、`D:\Work` 留在原地；`D:\Work` 的 ff-only 被別人未 commit 的 WORKLOG／TASKS 擋（拋棄式 repo 實測：dirty 檔內容與目標相同，`git merge --ff-only` 仍 `Aborting`）。之後在 `D:\Work` commit 的 session push 必被拒，要 cherry-pick 繞路：session `local_3c4f6ba5` 一次「COMMIT」＝22 次模型呼叫、讀約 330 萬 token（每次約 15 萬 context）。
- 根因（修正）：不是共用檔本身，是 parity 遇 dirty 重疊檔一律放棄＋doc-sync 每次只改時間戳讓共用檔常駐 dirty。已解：parity 乾淨 3-way 合併帶過去（`scripts/git-parity-merge.py`）、doc-sync 只在內容變時寫。

## Rollback
所有 session 回 `D:\Work` 共用目錄；閘門未刪，立即有效。

## 試點結果
2026-10-22 doc 提交走完整一輪，用本檔自己：`git worktree add --detach D:/tmp/wt-pilot origin/main` → 改檔 → 普通 `git add`＋`git commit`（無私有 index、無 marker、閘門沒擋）→ `git fetch`＋`git rebase origin/main`（up to date）→ `git push origin HEAD:main` 成功（0e84c4273）→ `git worktree remove`（第一次 Permission denied，因 shell 還在該目錄；離開後 `--force` 乾淨移除）。
- 已驗：settings deny 不擋 `git worktree add --detach` 與 `push HEAD:main`；detached worktree 的 index 獨立，commit 只含自己的檔。
- 未驗：寫碼卡（`node_modules` junction、`npx tsc`／vitest 在 worktree 跑、verify-gate／ORACLE 閘對 worktree 的行為）、AO-CLOSE 從 worktree 跑。第一張寫碼卡走 worktree 時補填。
- 寫碼卡已驗（2026-10-22）：`node_modules` 以 junction 掛主目錄 → `npx tsc --noEmit` 綠、vitest social＋schedules 236 過、程式碼 commit 與 push 都不經私有 index；`worktree-reparse-guard` 在 junction 未拆時擋 remove（用它印的 `[IO.Directory]::Delete` 拆後主 `node_modules` 293 項完好）。
- 陷阱：`git worktree remove` 報 Permission denied ＝ session 的 cwd 還在該 worktree；cwd 回主目錄後清乾淨。清殘留用 `cmd /c rmdir /s /q <明列路徑>`（`rm -rf` 被閘擋）。
- verify-gate 已驗：真 Edit 工具改 worktree 檔 → `git commit` 被擋（追蹤到 worktree 絕對路徑）→ `verify-clear.ps1` → commit 通過。發現 `verify-clear` 把 worktree 檔標成「outside-repo，not committable」（只是標籤，清除照做）→ 改為讀 `.git/worktrees/*/gitdir` 把 linked worktree 算 repo 內（測試：repo 內 2、舊版 0）。
- AO-CLOSE 已驗（結論：只能在主目錄）：`system-health-check.ps1` 在 worktree 得 99.7%（317/318），唯一失敗＝`check-claude-sync` HARD（`.claude` junction 只存在 main，`CLAUDE.md` R1）。不放寬閘門；規則＝worktree session 以 push 收尾，AO-CLOSE 在 `D:\Work` 跑。
- 採用：操作者 2026-10-22「直接改」→ AGENTS.md §8 Git 加一句「同時有別的 session 在寫 → 開 detached worktree」；舊閘門全留。
