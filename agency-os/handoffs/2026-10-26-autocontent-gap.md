續接語：續做 AUTOCONTENT-GAP：只讀本檔 `agency-os/handoffs/2026-10-26-autocontent-gap.md`，從「§4 第一步」開始；完成＝§5 驗收全綠且操作者看過計畫卡。建議模型：Fable 5.1 寫卡 → Opus 5.5 實作。回報操作者一律繁體中文。

# AUTOCONTENT-GAP：全自動內容管線的前兩步沒接上排程

> 本檔自足：所有要知道的事實都在這裡，附 `file:line`。NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。
> 查證日 2026-10-26（commit `7d8e0c49f` 時的 main）。動手前仍照 AGENTS.md §1 先跑 `git log`，確認下列行號沒被別的 session 改掉。

## 1. 操作者要什麼

全自動：**搜集熱搜 → 產生題目 → 做文章／社群／影片 → 審核 →（站設定允許才）發布**，每月不用人去按。
目前後三段已全自動，**前兩段沒有**，所以每個月還是要有人到 `/tools/content/topics` 按「AI 提案本月題目」再核准。

## 2. 現況（已查證）

| 環節 | 現況 | 證據 |
|---|---|---|
| 總開關 | `/ops/schedules` 每客戶一格 `content_pipeline`，預設關，每 5 分鐘跑；每天最多開始 N 題（1–10） | `NA/lib/schedules/jobs.ts:106-122` |
| 那格實際做的事 | 只 `tickTopics`：把**已核准**且到期的題目往下推一步 | `NA/lib/schedules/jobs.ts:116-121` |
| tick 時間預算 | 200 秒 | `NA/lib/content/topics/tick.ts:19` |
| run-due 上限 | 300 秒 | `NA/app/api/internal/schedules/run-due/route.ts:26` |
| 自動發布 | 站別 `publishMode`，`/tools/content/sites` 兩顆按鈕，預設人審 | `NA/app/(shell)/tools/content/sites/PublishModeButtons.tsx` |
| **產生題目** | `proposeMonth()` 唯一呼叫點＝題目頁按鈕 API；**排程從不呼叫** | 定義 `NA/lib/content/topics/plan.ts:108`；呼叫 `NA/app/api/content/topics/plan/route.ts:33` |
| proposeMonth 做什麼 | 讀站品牌 → 近 30 天熱搜前 50（`recentTrends(sb, geoFor(targetCountry), 30, 50)`）＋知識庫資料夾前 30 → 一次 Opus → `parsePlan` → `proposeTopics`（同月同關鍵字略過）→ 狀態 `proposed` | `NA/lib/content/topics/plan.ts:108-126` |
| AI 呼叫注入 | `planAsker(grant, route, actorRole)`；檔頭註解已預告「排程用 `grantFor` 計同一個 feature `content.plan`」——設計有想到，但沒接 | `NA/lib/content/topics/plan.ts:1-5,80-92` |
| 路由的權限 | `withFeature("content.plan", …)`＋`canCreateAiImageJob(role)`＋`canAccessOrg`；`maxDuration = 90`（Opus 寫 ~28 題） | `NA/app/api/content/topics/plan/route.ts:17-33` |
| **搜集熱搜** | 只有有人 GET `/api/content/trending?type=trending&geo=..`（文章頁 🔥 熱搜面板）才會 `saveTrends` 存進 `content_trends`；主機上沒有任何腳本／cron 打它 | `NA/app/api/content/trending/route.ts:98-107`；grep `content/trending\|content_trends` 在 `hetzner-phase1-core` 只命中 NA 內部檔 |
| 熱搜抓取本體 | `runTrending(geo, extraBlocks)`（`NA/lib/content/trending-sources.ts`）；額外來源 `loadDbSourceBlocks()` 讀 `content_sources`（route 內私有函式） | `NA/app/api/content/trending/route.ts:3,84-95,103` |
| 熱搜存檔 | `saveTrends(sb, geo, items)`（一天一筆／項，保留 90 天）；`recentTrends` 依出現天數排 | `NA/lib/content/topics/trends.ts:49,54,69` |
| 後果 | 沒人開文章頁 → `content_trends` 空或舊 → 就算自動提案，題目也沒有熱搜依據 | — |

headless 計費範例（排程內怎麼拿 grant）：`NA/lib/content/topics/make.ts:11,99,174`（`grantFor("content.syndicate")`、`grantFor("video.script")`，在 `runForOrg` 情境內）。

## 3. 不可違反的約束

- **AI 先顯示成本**：`content_pipeline` 那格的 `cost` 文字（`jobs.ts:110`）要加上「每月提案一次約 X 美元」。價格來源 `NA/lib/ai/cost-model.ts`（`content-plan`）／`NA/lib/content/topics/cost.ts`。
- **提案後仍停 `proposed`**，等人核准（或站設 AI 自動）。不改既有不變量 I5（發布＝`ai_review_auto` 且 `review.pass`）、I8（自動化開關只有 `content_pipeline` 格、每日上限）。
- **不另建 cron**：時鐘只有主機 `*/5` → `run-due`（計畫 P4.4 定案）。新工作走 `CLIENT_JOBS`（`jobs.ts`）或併入 `content_pipeline` 的 `run`。
- **付費步驟冪等**：每站每月最多成功一次；失敗不可每 5 分鐘重打 Opus（要有嘗試次數或冷卻）。提案 90 秒 vs tick 預算 200 秒，不可擠掉當次的製作步驟。
- 熱搜是公開資料、無租戶（`trends.ts:1-3`），抓取不計費（`type=trending` 不走 AI）；但每 5 分鐘抓太頻繁，一天一次或每幾小時一次即可。
- 風險：Medium（新增排程內的 AI 花費）→ 先寫計畫卡給操作者看，同意再實作。不碰 migration 為佳；真要加欄位才寫 migration（＋`.down.sql`），那是 High。
- 推上 main ＝當晚台灣 03:00 自動部署（AGENTS §0）。不想當晚上線就放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`。

## 4. 做法（照順序）

1. **第一步**：整檔讀 `NA/lib/schedules/jobs.ts`、`NA/lib/content/topics/{plan,tick,make,trends,store}.ts`、`NA/app/api/content/trending/route.ts`、`NA/app/api/content/topics/plan/route.ts`。確認 §2 行號仍對。
2. 寫三張卡（A、B 先做，C 等 A、B 完成），加進 `agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md` §7（新編號，例如 P9.1／P9.2），每張含：改哪些檔、做什麼、驗收指令、突變（拔哪個守衛 → 哪個測紅）、rollback。同步把 §3.1 第 75 行改成實際行為。監工台 `agency-os/handoffs/2026-10-24-auto-content-supervisor/data.mjs` 加同編號的卡 → `node build.mjs && node check.mjs`。
   - **卡 A 熱搜定時落地**：把 route 的 `loadDbSourceBlocks`＋`runTrending`＋`saveTrends`（`trending/route.ts:84-107`）抽到 lib（例如 `NA/lib/content/topics/collect-trends.ts`），route 改呼叫它（行為不變）；排程每天對每個用到的 geo（各站 `geoFor(targetCountry)`）跑一次。
   - **卡 B 月初自動提案**：`content_pipeline` 的 `run`（`jobs.ts:116`）在呼叫 `tickTopics` 前（或另一個 job），對該客戶每個 WP 站：本月還沒有 `source='plan'` 的題目、且在月初窗口內（1–3 號；時區用台灣或 UTC 要在卡裡寫明）→ `proposeMonth(sb, {organizationId, siteId, month, actor:"schedule:content_pipeline"}, planAsker(await grantFor("content.plan"), "lib/schedules/content_pipeline"))`。附冪等／失敗冷卻設計。
   - **卡 C 自動內容總控頁**（A、B 做完才做；操作者 2026-10-26 要求「功能到處散放，要一個頁面管理」）：**不開新頁**，升級既有題目佇列 `NA/app/(shell)/tools/content/topics/`（`page.tsx`＋`TopicsBoard.tsx`）。頁頂加一條五格流程圖（一頁一張圖），每格＝狀態＋那一步的控制＋費用：
     | 格 | 顯示 | 控制（沿用既有 API，不新增第二份設定） |
     |---|---|---|
     | ① 搜集熱搜 | 該站 geo 最後一次 `content_trends.fetched_on`、近 30 天筆數 | 無（卡 A 自動）；可放「立即抓一次」＝GET `/api/content/trending?type=trending&geo=..` |
     | ② 提案題目 | 本月是否已提案、下次自動提案日（卡 B） | 既有「AI 提案本月題目」按鈕（`TopicsBoard.tsx:179-221`，POST `/api/content/topics/plan`） |
     | ③ 核准 | 待核准幾題 | 既有勾選核准／退回（`TopicsBoard.tsx:231-232`） |
     | ④ 製作 | 總開關開／關、每天最多開始 N 題、進行中幾題 | 讀 GET `/api/ops/schedules?slug=<客戶>`（`NA/app/(shell)/ops/schedules/ScheduleTable.tsx:140`）；寫 PATCH `/api/ops/clients/<slug>/schedules/content_pipeline`（`ScheduleTable.tsx:166`）。先例：客戶頁已嵌 `<ScheduleTable only={org.slug} />`（`NA/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx:697`）——可加「只顯示 content_pipeline」的 prop 重用，或只抽出那一格 |
     | ⑤ 發布 | 人審／AI 審核自動發 | 直接重用 `<PublishModeButtons site onSaved />`（`NA/app/(shell)/tools/content/sites/PublishModeButtons.tsx:15`，PATCH `/api/content/sites/[id]` 的 `publishMode`，`NA/app/api/content/sites/[id]/route.ts:48-59`） |
     - 範圍陷阱：①②③⑤ 跟著「網站」切換；④ 是「客戶」層（一客戶一格）。一客戶兩站時，切站 ④ 不變，畫面要寫明「這個開關管這個客戶的所有網站」。站→客戶：`wp_sites.organization_id`；要確認 `/api/content/sites` 回應有沒有帶客戶 slug，沒有就在那支 GET 加（不要前端猜）。
     - 權限：④ 的寫入沿用該 API 自己的角色檢查；角色不夠就把那格顯示成唯讀（`PublishModeButtons` 已有 `readOnly` prop），不要在頁面另寫權限判斷。
     - 側欄：`NA/app/sidebar-sections.ts:78` 的 `Topic Queue` 改 `Auto Content`（**label 只能英文**，`NA/app/__tests__/sidebar-coverage.test.ts:68-70` 會擋），中文放 `title`：「全自動內容：熱搜 → 題目 → 製作 → 發布，一頁管理」。頁面 `<h1>` 與 `metadata.title`（`topics/page.tsx:5,10`）改「自動內容」。網址不改（`/tools/content/topics`），避免舊連結壞。
     - UI 規則：不用 `<select>`／下拉（用按鈕）；細節放右欄；文案白話、不寫「我們」；顏色用主題 token。
     - 舊位置照常可用：`/ops/schedules`、`/tools/content/sites` 不刪不改行為，資料只有一份。
3. 把三張卡貼給操作者看（繁中、白話、說每月多花多少錢），等同意。
4. 實作 → `npx tsc --noEmit` 綠 → 指名的 vitest 綠 → 突變一次 → `/codex-review`（Claude 寫的）→ commit（pathspec）→ WORKLOG（用 `scripts/worklog-insert-entry.py`，經 `scripts/git-partial-worktree-commit.py stage`）。
5. 完成後把 `agency-os/TASKS.md` 收件匣 AUTOCONTENT-GAP 那條打勾。

## 5. 驗收

- vitest：模擬 1 號 tick → 產生 `proposed`；同月第二次 tick → **不再呼叫** ask；ask 失敗 → 冷卻期內不重打。
- vitest：熱搜排程 → `saveTrends` 對每個 geo 被呼叫一次；route 回應與改動前一致（既有 `NA/app/api/content/trending/route.test.ts` 綠）。
- 突變：拔掉「本月已有 plan 題目就跳過」的守衛 → 第二個測試變紅 → 還原變綠。
- `/ops/schedules` 那格的成本文字有提到月初提案的費用。
- 卡 C：在總控頁切開關／改每日上限／改發布模式後，到 `/ops/schedules` 與 `/tools/content/sites` 看得到同樣的值（證明只有一份資料）；`sidebar-coverage.test.ts` 綠；`/playwright` 截圖頁頂五格（雙站客戶切站時 ④ 不變）給操作者看。
- 只跑卡片點名的測試，不跑全套（AGENTS §1「不做無效益測試」）。

## 6. 範圍外（別順手做）

- P5 Story Bible 提示片段（`storyBibleContextBlock`、角色 id 提示）仍由頁面組好再送出：另一件事。
- 真跑一整輪需 staging WP＋測試社群品牌：操作者 10-24 說先不用。
