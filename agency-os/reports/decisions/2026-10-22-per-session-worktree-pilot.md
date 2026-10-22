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

## Rollback
所有 session 回 `D:\Work` 共用目錄；閘門未刪，立即有效。

## 試點結果
（待填）
