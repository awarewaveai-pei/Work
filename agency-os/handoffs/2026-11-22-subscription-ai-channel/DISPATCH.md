# AI 訂閱通道 派工表（監工用）

續接語：我是「AI 訂閱通道」的監工。讀本檔＋`PLAN.md`；`mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照「驗收」做，不問操作者。操作者 2026-11-22 授權：監工派工、選模型、工人 context 過長自行 compact／clear、整批交回後一起判 RISKS、風險處理完才部署；回報繁中。監工台 `data.mjs` 只有監工改。

## 批次

| 批 | 卡 | 內容 | 模型 | 狀態 |
|---|---|---|---|---|
| 1 | K1 | bridge kind／tool／lane／額度 | Opus 5.5 | main `a7d814353` |
| 1 | K2 | worker 文字 job、無工具、憑證掃描 | Opus 5.5 | main `b53be9244` |
| 1 | K3 | 訂閱模型獨立清單＋鏈＋帳本 | Sonnet 5.5 | main `47d60570c` |
| 2 | K4a | sub-text＋文章／劇本工坊後端（不動 .tsx） | Opus 5.5 | main `d31151b5a` |
| 2 | K6 | 走法按鈕元件＋狀態 API（只新增檔） | Sonnet 5.5 | main `81b5e30eb` |
| 2 | K8 | 成本頁訂閱用量 | Sonnet 5.5 | main `dc9e37167` |
| 3 | K4b | 文章頁掛按鈕＋202 輪詢＋可取消；控制項由員工頁注入 | Opus 5.5 | main `6302a2497` |
| 3 | K5 | 影片腳本後端收 chain | Sonnet 5.5 | main `1e25c3aaa` |
| 3 | K7 | 每站走法＋套用到所有網站＋自有組織限制＋內部標記清除 | Opus 5.5 | main `f948401a0` |
| 3 | K11 | 模型清單補五個（GPT-6 四個實測；Sonnet 未測） | Sonnet 5.5 | main `33775b69b` |
| 3c | K12 | 十二個模型文章實測（本機跑真 core，不等部署） | 監工 | 等 K11 |
| 3c | K13 | 生圖模型實測 | 監工 | 等 K12 與操作者排名。**開測前先告訴操作者並等她說完**（2026-11-22「要測之前告訴我，我有問題要說」）；未經她回覆不得開跑 |
| 3d | K10 | 文章配圖：英文畫面描述＋網站的生圖模型 | Opus 5.5 | 等 K13 與操作者談定（四點未定，見 `briefs/K10-K12.md`） |
| — | DA | `sg-deploy.sh next-admin`＋smoke＋筆電實寫一篇（不等 K10、K12、K13） | 監工 | 等批 3 |
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

### 批 1（2026-11-22）
critic Standard 整批：fail 6 major／6 minor → 全部處理（規格更正＋三張卡退回修）→ 重新整合：tsc 0、全套 vitest 5312 passed、worker node --test 綠、筆電實跑 Claude haiku 6.2 s＋憑證探針「沒有工具」。逐條處置見 `data.mjs` RISKS 第二張表。每卡 squash 成一個 commit。Codex 無額度至 11-24：`ORACLE_WAIVED`（critic 代）。
未關：Codex 文字與圖回歸實跑 → M1；`vendor-invoices`／`probe-models` 不受影響（`TEXT_RATES` 未動，`git diff` 驗）。

### 批 2（2026-11-22）
critic Standard 整批：warn 1 major／3 minor → 全修（K4a run-budget 上限、runTextChain 例外、deferred 錯誤 body；K6 預設 API-only）。結構測試紅一項（`/api/tools/sub-worker` 未登記）→ 監工在 `lib/portal/staff-tools.ts` 登記。重新整合：tsc 0、全套 vitest 5350 passed。逐條處置見 `data.mjs` RISKS 第三張表。`ORACLE_WAIVED`（Codex 無額度，critic 代）。
給批 3：K4b 輪詢回傳格式＝文章 `{ ok, markdown }`（跳過段在 `[COST_JSON].skipped[]`，每筆 `{ model, error, reason }`，`reason` 為可直接顯示的繁中）；劇本工坊 `{ ok, text, skipped?, reservedTwd? }`。lane 只能由程式設定（`config.lane`），K7 在排程傳 `schedule`。

### 批 3（2026-11-22）
critic Standard 整批：warn 3 major（含 1 既有線上 bug）／5 minor → 全修。結構測試 `registry-code.test.ts` 紅兩次（video 門、content 門帶到訂閱按鈕）→ 控制項改由員工頁注入（`ContentStudioStaff.tsx`、`SiteManagerStaff.tsx`；ScriptForge 收 prop、目前無員工頁傳入）。重新整合：tsc 0；全套 vitest 5412 passed＋修正後 lib/portal 與 content 頁 132 passed。監工自讀權限相關新增（`owner-subscription/route.ts`、jobs `DELETE`、`cancelCodexWork`）。`ORACLE_WAIVED`（Codex 無額度，critic 代）。
正式站資料修正（操作者逐次同意）：aware-wave.com `wp_posts` 36,38,48,55,62,69 移除 `[COST_JSON]` 段；62,69 移除 `NEEDS_FACT_CHECK` 標記（21＋6 處）；備份 `~/backups/wp-costjson-20261122/`、`~/backups/wp-factcheck-20261122/`；線上頁面 curl 驗 0 命中。Soulful 0 篇。
未關：劇本工坊無員工頁可用訂閱（部署後決定）；`SiteManager` 預覽未以真資料看；`probe-models.mjs --write-verified` 寫出重複屬性（`cost-model.ts:156`，既有工具 bug）。

### 部署 A（2026-11-22 09:37Z）
`sg-deploy.sh next-admin` → `a12137def`（前一版 `343fe7f9c`），healthy 15 s，HTTP smoke 全 OK；Playwright smoke 34 passed／0 failed（`agency-os/reports/e2e/2026-11-22/smoke`）。
正式站實測：筆電 worker（owner lane，tools codex＋claude）→ 文章頁 `claude+api`＋Haiku → worker 109 s 交回、`ai_call_logs` 一列 `sub-claude-haiku`／vendor 訂閱／usd 0／answered `claude-haiku-5-5`。網站設定頁（選 Soulful）：按鈕「這個客戶的網站也是我的，允許用訂閱」、12 個模型、套用到所有網站皆在。
發現：`TextChainButtons` 狀態只在掛載時讀一次（worker 後啟動仍顯示離線）→ 小卡。未看：成本頁、劇本工坊頁、apply-text-road 對真 PostgREST（Chrome MCP 中途 unhealthy）。
