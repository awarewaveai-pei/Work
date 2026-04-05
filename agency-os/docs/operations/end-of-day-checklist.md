# End-of-day Checklist (AO-CLOSE)

> 目的：每次關機前**逐項打勾**，確保不疏漏、不重工，並留下可追溯證據（reports + 進度文件）。

## 0) 先決條件（遇到阻塞先停）
- [ ] 若存在 `ALERT_REQUIRED.txt`：先處理/回報原因，**不可帶著 FAIL 收工**
- [ ] **日內 Git（與 `REMOTE_WORKSTATION_STARTUP` §2.5 一致）**：開工後代理可能已代跑多顆**本機** checkpoint commit（未 push）；收工 `ao-close.ps1` 仍會做最後 **`git add`／`commit`／`push`**，把未推的 commits 一併送上（通過閘道後）。
- [ ] 確認今天的「主線任務」已更新到 `TASKS.md`（至少狀態正確）
- [ ] （可選）送 PR / 大改 docs 前：在 **monorepo 根** `<WORK_ROOT>` 跑 `.\scripts\verify-build-gates.ps1`（工程 + doc + 治理 health 一次完成）
- [ ] （可選）有註冊 **AgencyOS-WeeklySystemReview** 者：若本週排程曾跑過，確認未被寫入 `ALERT_REQUIRED.txt`；若有，表示週檢閘道曾 FAIL，須先處理再收工

## 1) 必跑三步（硬性 Gate）

### 1a) 一鍵收工 + 推 GitHub（推薦）
在 **monorepo 根** `<WORK_ROOT>` 執行（且請**先**改好 `TASKS.md` / `WORKLOG.md` / `memory/**`，才會被 commit 進去）：

- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1`
  - 預設：**`verify-build-gates`**（龍蝦 + Agency health）→ **`system-guard`**（doc-sync + health + guard）→ **`generate-integrated-status-report`**
  - **全程 PASS**：`git add -A` → 有變更則 `git commit` → `git push origin <目前分支>`（**公司機 pull 即完整**）
  - **任一步 FAIL**：**不會 push**
  - 今夜不推遠端：`-SkipPush`（仍跑閘道與產報）
  - 略過龍蝦閘（不建議）：`-SkipVerify`

### 1b) 手動三步（與 1a 擇一即可）
在 `<WORK_ROOT>\agency-os` 目錄執行（與 1a **擇一**；**收工推薦 1a 於 repo 根**）：

- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
  - [ ] 產生 closeout 報告：`reports/closeout/closeout-*.md`
- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`
  - [ ] `Critical Gate` 必須 **PASS**
  - [ ] 健康分數預設需達 **100%**（未達 100% 先修復；僅在明確核准下可例外）
  - [ ] 記下：`reports/health/health-*.md`
- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`
  - [ ] 更新：`LAST_SYSTEM_STATUS.md`
  - [ ] 記下：`reports/guard/guard-*.md`

## 1c) Git / GitHub（手動收工時；若已跑 1a 可勾「已由 ao-close 完成」）
在**實際 Git repo 根目錄**執行（本機路徑僅為例：`D:\Work` 或 `C:\Users\USER\Work`；若 `agency-os` 為獨立 repo 請在該根目錄另跑一輪）：

- [ ] `git status`：**無**未提交變更，或已將今日應留下的變更 **commit**（訊息簡潔、可讀）
- [ ] `git push`（或 `git push origin <你的分支>`）：**無**未推送的 commit（與遠端同步）
  - 若今天刻意不推：在 `WORKLOG.md` 寫一句原因（例如等待審查、只在私機）
- [ ] 推送前快速掃描：diff 與暫存區**不得**含 token、私钥、還原後的 MCP/IDE 備份路徑內敏感檔

> 與舊版「只做三步」相比：收工不僅要本機 PASS，還要**遠端有同款快照**，隔天或另一台電腦 **`git pull` 後**再打 `AO-RESUME` 才不會斷線。若 `push` 被拒（遠端超前），請先 **`git pull --rebase origin main`** 解衝突再推。

## 2) 四份文件必回寫（避免明天斷線）
- [ ] `TASKS.md`
  - [ ] 今天完成項目標記完成
  - [ ] 明天要做的 3 件事（P1/P2/P3）在 Next/Backlog 清楚可見
- [ ] `WORKLOG.md`
  - [ ] 寫下今天「做了什麼」與 closeout 證據檔名
- [ ] `memory/CONVERSATION_MEMORY.md`
  - [ ] 更新 Today/Remaining/Tomorrow（保持可續接）
- [ ] `memory/daily/YYYY-MM-DD.md`
  - [ ] 補上 closeout 三步 PASS 的證據檔名（closeout/health/guard）

## 3) 防重工確認（關機前最後 30 秒）
- [ ] 明天第一步的指令已寫在 `memory/CONVERSATION_MEMORY.md`（Strict/Fast Runbook）
- [ ] **§1c Git/GitHub 已完成**（或 §1a `ao-close.ps1` 已成功 push）
- [ ] 任何機密（token/key）**不得**出現在 repo 內（尤其是 `mcp-backups/`、`.claude.json` 這類）

## Related Documents (Auto-Synced)
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-02 09:23:24 UTC_

