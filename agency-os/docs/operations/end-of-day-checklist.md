# End-of-day Checklist (AO-CLOSE)

> 目的：每次關機前**逐項打勾**，確保不疏漏、不重工，並留下可追溯證據（reports + 進度文件）。

**給操作者（最簡版）**：只打 **`AO-CLOSE`**；**不要**自己記 `-CompletenessGate` 等參數。由 **Cursor 代理**依 **`40-shutdown-closeout.mdc`** 代寫 **WORKLOG** 證據、代跑 **`ao-close.ps1`**、代處理被擋下的重跑。下列清單給**要手動逐步對照**的人用，與一鍵不衝突。

## 0) 先決條件（遇到阻塞先停）
- [ ] 若存在 `ALERT_REQUIRED.txt`：先處理/回報原因，**不可帶著 FAIL 收工**
- [ ] **日內 Git（與 `REMOTE_WORKSTATION_STARTUP` §2.5 一致）**：開工後代理可能已代跑多顆**本機** checkpoint commit（未 push）；收工 `ao-close.ps1` 仍會做最後 **`git add`／`commit`／`push`**，把未推的 commits 一併送上（通過閘道後）。
- [ ] **任務狀態**：`TASKS.md` 為真相；**預設 Autopilot** 由代理在 **`WORKLOG.md`** 寫 **`- AUTO_TASK_DONE:`** 後，**`ao-close`** 內 **`apply-closeout-task-checkmarks`** 套用打勾（見 **`.cursor/rules/40-shutdown-closeout.mdc`**）。手動改 `- [ ]`／`- [x]` 仍允許。
  - **`AUTO_TASK_DONE` 機讀格式（必守）**：須落在**與本機當日日曆一致**的 **`## yyyy-MM-dd`** 區塊內（腳本只掃「今日」該段）；單獨一行 **`- AUTO_TASK_DONE: <子字串>`**，**勿**用 `**…**` 包住該行（否則正則掃不到）；子字串須在**恰好一條**仍為 `- [ ]` 的 `TASKS` 行內可找到。
- [ ] （可選）送 PR / 大改 docs 前：在 **monorepo 根** `<WORK_ROOT>` 跑 `.\scripts\verify-build-gates.ps1`（工程 + doc + 治理 health 一次完成）
- [ ] （可選）有註冊 **AgencyOS-WeeklySystemReview** 者：若本週排程曾跑過，確認未被寫入 `ALERT_REQUIRED.txt`；若有，表示週檢閘道曾 FAIL，須先處理再收工

## 0.5) 多代理（並行 4–5 個 AI）時怎麼收工才「完善」

**問題根因**：`WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`TASKS.md` 是**單檔單真相**；多個對話同時改會互蓋、合併衝突、`AUTO_TASK_DONE` 掃描錯日、commit 訊息變垃圾句。

**建議協議（最省事）**：

1. **指定唯一「收關代理」**（同一輪只由一個 Cursor／Claude 對話執行 **§2 的 `ao-close.ps1`**；其餘代理**不跑** `git push`／**不**對上述三檔做最終寫入）。
2. **其他代理只交「素材」**：在 **`agency-os/.agency-state/closeout-inbox.md`**（**已納入版控**，可跟 `git pull` 同步）用 **`###` 區塊**條列；**`---` 之後、新區塊一律置頂**（**最新一則在最上**）。內容含對話 ID／完成項一句／相關 commit hash 或檔案路徑。**禁止**多人同時改 `WORKLOG` 當日區塊當「草稿本」。
3. **Inbox → 進度檔**：**`ao-close.ps1`** 內 **`merge-closeout-inbox-into-progress.ps1`** 會將可匯區塊 **verbatim** 併入當日 **`WORKLOG`**／**`memory/daily`** 並自範本**重置 inbox**（不必手動清空）。收關代理仍須在**呼叫腳本前**補 **`AUTO_TASK_DONE:`**，並依 **rule 40／10** 更新 **`CONVERSATION_MEMORY.md`**（操作者不預設手寫長篇）。
4. **分支策略（強烈建議）**：並行開發用**不同 branch** 或至少不同 prefix commit；收關前 **`git merge`** / PR 合進當日工作分支，再跑 **`ao-close.ps1`**，降低同檔二頭馬。
5. **長 commit 訊息**：用 **`-CommitMessageFile path\to\msg.txt`**（UTF-8）取代一行 `-CommitMessage`；`ao-close.ps1` 會在 commit 前擋 **staged diff 含 `<<<<<<<` 衝突標記**。
6. **協作 AI 規則（給 Codex／其他 Cursor／Claude）**：[collaborator-ai-agent-rules.md](collaborator-ai-agent-rules.md)（內含一鍵貼上區塊）。
7. **收件匣範本與初始化**：可版控範本 [closeout-inbox-TEMPLATE.md](closeout-inbox-TEMPLATE.md)；本機若尚無 `closeout-inbox.md`，在 monorepo 根執行 **`.\scripts\init-closeout-inbox.ps1`**。

## 1) 必跑三步（硬性 Gate）

### 1a) 一鍵收工 + 推 GitHub（推薦）
在 **monorepo 根** `<WORK_ROOT>` 執行（**先**依 **`.cursor/rules/40-shutdown-closeout.mdc`** 更新 **`WORKLOG`／`memory/**`**；**`TASKS` 勾選**預設由腳本自 **`WORKLOG`** 的 **`AUTO_TASK_DONE`** 套用。**若記不得今天做了什麼**：腳本開頭會印 **今日 recap**）：

- **使用者**：在**收關** Cursor 對話打 **`AO-CLOSE`** 即可（與單代理相同）。**收關代理**須在執行腳本前完成 rule **第 1 步**（**含**：若存在協作收件匣，讀取並併入進度檔；**勿**僅留 inbox 不寫 WORKLOG／memory）。
- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1`
  - 預設順序（詳見腳本與 **`.cursor/rules/40-shutdown-closeout.mdc` 第 2 步**）：**`ensure-daily-progress-scaffold`** → **closeout inbox guard**（預設 **warn**）→ **`merge-closeout-inbox-into-progress`**（verbatim 併入後重置 inbox）→ **`print-today-closeout-recap`** →（push 模式）**`git fetch`／落後攔截**→ **`verify-build-gates`** → **`system-guard`** → **`generate-integrated-status-report`** → health **100%** 檢查 → **`apply-closeout-task-checkmarks`** → **`git add`** → **`verify-closeout-completeness`**（預設 **strict**）→ **`commit`／`push`**
  - **全程 PASS**：推上後**公司機 `pull` 即完整**
  - **任一步 FAIL**：**不會 push**
  - 今夜不推遠端：`-SkipPush`（仍跑閘道與產報）
  - 略過龍蝦閘（不建議）：`-SkipVerify`
  - 遠端已超前仍強制 push（**高風險**，僅明示核准）：`-AllowPushWhileBehind`
  - 略過開頭「今日機器摘要」（進階／純 CI）：`-SkipTodayRecap`
  - 略過 **`TASKS` 自動打勾**（緊急除錯用）：`-SkipAutoTaskCheckmarks`
  - 從檔讀 commit 訊息（多代理彙總／多行說明）：`-CommitMessageFile agency-os\.agency-state\closeout-commit-msg.txt`（UTF-8；路徑相對 monorepo 根或絕對路徑皆可；與 inbox 同目錄便於管理）

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

> 與舊版「只做三步」相比：收工不僅要本機 PASS，還要**遠端有同款快照**，隔天或另一台電腦須在 monorepo 根 **`scripts/ao-resume.ps1` exit 0**（或手動 `git pull` 達成等價對齊）後再打 **`AO-RESUME`** 才不會斷線。若 `push` 被拒（遠端超前），請先 **`git pull --rebase origin main`** 解衝突再推。

## 2) 四份文件必回寫（避免明天斷線）
- [ ] `TASKS.md`
  - [ ] 今天完成項目：**預設**由收工腳本依 **`WORKLOG` `- AUTO_TASK_DONE:`** 打勾；否則手動
  - [ ] 明天要做的 3 件事（P1/P2/P3）在 Next/Backlog 清楚可見
- [ ] `WORKLOG.md`
  - [ ] 寫下今天「做了什麼」與 closeout 證據檔名
- [ ] `memory/CONVERSATION_MEMORY.md`
  - [ ] 更新 Today/Remaining/Tomorrow（保持可續接）；**若當日有協作 inbox 匯入**：**`ao-close.ps1`** 內 **`merge-closeout-inbox-into-progress.ps1`** 會在 **`## Current Operating Context`** 自動插入**一則指標列**（指向當日 **WORKLOG** 的 verbatim 區塊），**不取代**你手寫的長期濃縮敘事
- [ ] `memory/daily/YYYY-MM-DD.md`
  - [ ] **`YYYY-MM-DD` = 收工當日本機日曆**（與 **`print-today-closeout-recap`**／**`40-shutdown-closeout.mdc`** 一致，不依對話開始日）
  - [ ] 補上 closeout 三步 PASS 的證據檔名（closeout/health/guard）

## 3) 防重工確認（關機前最後 30 秒）
- [ ] 明天第一步的指令已寫在 `memory/CONVERSATION_MEMORY.md`（Strict/Fast Runbook）
- [ ] **§1c Git/GitHub 已完成**（或 §1a `ao-close.ps1` 已成功 push）
- [ ] 任何機密（token/key）**不得**出現在 repo 內（尤其是 `mcp-backups/`、`.claude.json` 這類）

## Related Documents (Auto-Synced)
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-26 15:34:23 UTC_

