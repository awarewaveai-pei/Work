# AI 訂閱通道 派工表（監工用）

續接語：我是「AI 訂閱通道」的監工。讀本檔＋`PLAN.md`；`mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照「驗收」做，不問操作者。操作者 2026-11-22 授權：監工派工、選模型、工人 context 過長自行 compact／clear、整批交回後一起判 RISKS、風險處理完才部署；回報繁中。監工台 `data.mjs` 只有監工改。

## 批次

| 批 | 卡 | 內容 | 模型 | 狀態 |
|---|---|---|---|---|
| 1 | K1 | bridge kind／tool／lane／額度 | Opus 5.5 | 派出 |
| 1 | K2 | worker 文字 job、無工具、憑證掃描 | Opus 5.5 | 派出 |
| 1 | K3 | 目錄＋價目＋帳本 | Sonnet 5.5 | 派出 |
| 2 | K4 | sub-text＋文章＋劇本工坊 | Opus 5.5 | 等批 1 |
| 2 | K6 | 訂閱按鈕組 | Sonnet 5.5 | 等批 1 |
| 3 | K5 | 影片腳本 | Sonnet 5.5 | 等 K4 |
| 3 | K7 | 每站通道＋排程帶入 | Opus 5.5 | 等 K4 |
| 3 | K8 | 成本頁訂閱用量 | Sonnet 5.5 | 等 K3 |
| — | DA | `sg-deploy.sh next-admin`＋smoke＋筆電實寫一篇 | 監工 | 等批 3 |
| 4 | K9 | 主機常駐 worker（High；待決 1、2） | Opus 5.5 | 等 DA |
| 4 | M1 | 11-24 後實測 | 監工 | 等 K9 |

同時最多 4 個工人；同一條線的下一張卡 `send_message` 給同一個閒置 session（先 `clear_session`）。工人 worktree 在 `D:\Worktrees`。

## 驗收（每張卡）
1. 讀 FILES／TESTS／COMMITS／RISKS → 讀 diff（`git -C <worktree> diff main...HEAD`），回報裡的 `file:line` grep 驗真；對照 PLAN §2 不變量與 §3 合約逐條看。
2. 整合工作區 `D:\Worktrees\Work\sub-int`（detached）：cherry-pick → 解衝突 → `npm ci` → `npx tsc --noEmit`。
3. 整批併完：全套 `npm test` 一次；`critic` 審整批 diff 一次（Codex 無額度至 11-24，WORKLOG 記 `ORACLE_WAIVED`）；有畫面的卡預覽實看。
4. **整批交回後獨立一步「一起看 RISKS」**：並排三類——會出錯貨／沒實看／main 紅 → 當輪處理；要改別的系統 → 掛到既有或下一張卡；理論性 → 記一行。結果寫進 `data.mjs` RISKS＋本檔，`node build.mjs && node check.mjs`，重新發布監工台。
5. rebase 到 `main` → `git merge --ff-only`（pathspec commit）；`clear_session` 工人；派下一批。
6. 部署只在 DA 與 K9：先確認該批 RISKS 全有處置。DA 照 `/sg-deploy`（首行 `# CONFIRMED-HIGH-RISK:`）；K9 每個主機動作停下等操作者。

## 監工台
頁面：見 `data.mjs` 檔頭與記憶 `project_subscription_ai_channel_supervisor`。更新＝改 `data.mjs` → `node build.mjs && node check.mjs` → 發布到同一網址。

## RISKS 紀錄
### 動工前
見 `data.mjs` RISKS 第一張表（七條，皆有處置）。

### 批 1
（待交回）
