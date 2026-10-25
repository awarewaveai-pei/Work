續接語：續做 AUTOCONTENT-GAP：只讀本檔 `agency-os/handoffs/2026-10-26-autocontent-gap.md`，從「§4 第一步」開始；完成＝§5 驗收全綠且操作者看過計畫卡。建議模型：Fable 5.1 寫卡 → Opus 5.5 實作。回報操作者一律繁體中文。

# AUTOCONTENT-GAP：全自動內容管線的前三步沒接上排程

> 本檔自足：所有要知道的事實都在這裡，附 `file:line`。NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。
> 查證日 2026-10-26（commit `30e2b9063` 時的 main；第二次複查改了 §2 核准列、§3 四條約束、§4 卡 A／B 設計，原因見 §7）。動手前仍照 AGENTS.md §1 先跑 `git log`，確認下列行號沒被別的 session 改掉。

## 1. 操作者要什麼

全自動：**搜集熱搜 → 產生題目 → 核准 → 做文章／社群／影片 → 審核 →（站設定允許才）發布**，每月不用人去按。
目前後三段已全自動，**前三段沒有**：每個月要有人到 `/tools/content/topics` 按「AI 提案本月題目」，再逐題核准。

## 2. 現況（已查證）

| 環節 | 現況 | 證據 |
|---|---|---|
| 總開關 | `/ops/schedules` 每客戶一格 `content_pipeline`，預設關，每 5 分鐘跑；每天最多開始 N 題（1–10） | `NA/lib/schedules/jobs.ts:106-122` |
| 那格實際做的事 | 只 `tickTopics`：把**已核准**且到期的題目往下推一步 | `NA/lib/schedules/jobs.ts:116-121` |
| tick 時間預算 | 200 秒；run-due 把同一輪所有 claimed 的 job **依序**跑 | `NA/lib/content/topics/tick.ts:19`；`NA/app/api/internal/schedules/run-due/route.ts:58-76` |
| run-due 上限 | 300 秒 | `NA/app/api/internal/schedules/run-due/route.ts:26` |
| 排程列的失敗狀態 | `client_schedules.last_error/last_error_at`；**下一次成功 run 就被清空** | `NA/lib/schedules/store.ts:177-182` |
| 自動發布 | 站別 `publishMode ∈ {human_review, ai_review_auto}`，`/tools/content/sites` 兩顆按鈕，預設人審 | `NA/lib/content/brand-voice.ts:20,108-110`；`NA/app/(shell)/tools/content/sites/PublishModeButtons.tsx:10-12` |
| **核准** | `proposed → approved` 只有一條路：人按 `/api/content/topics/[id]` approve。計畫 §3.1 寫的「ai_review_auto 自動核准」**沒有程式碼** | `NA/lib/content/topics/store.ts:16`；`NA/app/api/content/topics/[id]/route.ts:15`；`agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md:78` |
| **產生題目** | `proposeMonth()` 唯一呼叫點＝題目頁按鈕 API；**排程從不呼叫** | 定義 `NA/lib/content/topics/plan.ts:108`；呼叫 `NA/app/api/content/topics/plan/route.ts:33` |
| proposeMonth 做什麼 | 讀站品牌 → 近 30 天熱搜前 50（`recentTrends(sb, geoFor(targetCountry), 30, 50)`）＋知識庫資料夾前 30 → 一次 Opus → `parsePlan` → `proposeTopics`（同月同關鍵字略過）→ 狀態 `proposed` | `NA/lib/content/topics/plan.ts:108-124` |
| 題目的 `source` | 由 **AI 自報** `trending`／`kb`／`plan`；人手加的才是 `manual`。一份提案可能 0 筆 `plan` | `NA/lib/content/topics/plan.ts:65`；`lobster-factory/packages/db/migrations/0121_content_topics.sql:38` |
| 題目的月份 | 台灣月（`taipeiParts`／`monthKey`）；`scheduled_for` 09:00 台灣 | `NA/lib/content/topics/store.ts:72,82`；`NA/lib/content/topics/plan.ts:70` |
| AI 呼叫注入 | `planAsker(grant, route, actorRole)`；檔頭註解已預告「排程用 `grantFor` 計同一個 feature `content.plan`」——設計有想到，但沒接 | `NA/lib/content/topics/plan.ts:1-5,80-95` |
| 路由的權限 | `withFeature("content.plan", …)`＋`canCreateAiImageJob(role)`＋`canAccessOrg`；`maxDuration = 90`（Opus 寫 ~28 題） | `NA/app/api/content/topics/plan/route.ts:17-33` |
| **搜集熱搜** | 只有有人 GET `/api/content/trending?type=trending&geo=..`（文章頁 🔥 熱搜面板）才會 `saveTrends` 存進 `content_trends`；主機上沒有任何腳本／cron 打它 | `NA/app/api/content/trending/route.ts:99-108`；grep `content/trending\|content_trends` 在 `hetzner-phase1-core` 只命中 NA 內部檔 |
| 熱搜抓取本體 | `runTrending(geo, extraBlocks)`（`NA/lib/content/trending-sources.ts`）；額外來源 `loadDbSourceBlocks()` 讀 `content_sources`（route 內私有函式）。來源＝Google News RSS（免費）＋ Serper news（有 `SERPER_API_KEY` 才開，~0.001 美元／次） | `NA/app/api/content/trending/route.ts:3,82-96,103`；`NA/lib/content/trending-sources.ts:289-302` |
| 熱搜存檔 | `saveTrends(sb, geo, items)`：`upsert onConflict (hash, fetched_on)`，一天一筆／項，保留 90 天；`recentTrends` 依出現天數排 | `NA/lib/content/topics/trends.ts:54-66,69`；`0121_content_topics.sql:25-27` |
| 支援的 geo | `TRENDING_GEOS = TW HK SG US GB JP AU` | `NA/lib/content/geos.ts:4` |
| 客戶的站 | `wp_sites(id, organization_id, active, content_defaults)`；排程頁用 `organization_id` 數站 | `NA/lib/schedules/view.ts:32-38`；`NA/lib/content/brand-voice-store.ts:16-26` |
| 無租戶一天一次的先例 | run-due 回應後 `after(() => refreshClaimReviewIfDue(...))`，DB 閘決定今天跑過沒 | `NA/app/api/internal/schedules/run-due/route.ts:82`；`NA/lib/collect/lookups/answer.ts:67-83` |
| 後果 | 沒人開文章頁 → `content_trends` 空或舊 → 就算自動提案，題目也沒有熱搜依據；提了案也沒人核准就不動 | — |

headless 計費範例（排程內怎麼拿 grant）：`NA/lib/content/topics/make.ts:11,99,174`（`grantFor("content.syndicate")`、`grantFor("video.script")`，在 `runForOrg` 情境內）。

## 3. 不可違反的約束

- **AI 先顯示成本**：`content_pipeline` 那格的 `cost` 文字（`jobs.ts:110`）要加上「每個網站每月提案一次約 X 美元」。價格來源 `NA/lib/ai/cost-model.ts:151`（`content-plan`）／`NA/lib/content/topics/cost.ts:8`。
- **不變量 B1（整類關掉）**：「開了 `content_pipeline` 的客戶，每個啟用中的 WP 站，**本月（台灣月）一定有一份提案；一個月最多一份**」。守衛＝該站該月已有 `source <> 'manual'` 的 `content_topics` 列（人按按鈕提的也算，不重提）。**不用**「1–3 號窗口」：那是補丁——開關中途打開、或 1–3 號主機剛好掛掉，整個月就沒題目。**不用** `source='plan'` 當守衛（§2：AI 可能 0 筆 plan）。
- **不變量 B2（付費步驟冪等＋冷卻）**：同一站 24 小時內最多**嘗試**一次提案，不論成敗；嘗試記號在 `ask` **之前**寫下（中途當機也算嘗試）。狀態必須在 DB：`client_schedules.last_error` 下一次成功 tick 就被清（§2），in-memory 每晚 03:00 自動部署就重置——兩者都擋不住「付了錢但答案讀不出來 → 每 5 分鐘再付一次」。→ 加一欄 `wp_sites.content_plan_attempted_at timestamptz`（migration 0138 ＋ `.down.sql`），用 `update … where id=site and (content_plan_attempted_at is null or < now()-24h) returning id` 當 claim（同 `claimScheduleRun` 模式，`NA/lib/schedules/store.ts:165`）。
- **不變量 B3（時間預算）**：一個 firing **要嘛提案、要嘛 tick**，不同時做；一個 firing 最多提一站（兩站客戶下個 5 分鐘提第二站）。提案 ≈ 90 秒 < tick 200 秒，不會擠爆 run-due 300 秒。
- **核准**：站 `publishMode = ai_review_auto` 時，排程提的題目**直接 `move` 到 `approved`**（走 `store.ts` 轉移表，不另插 `approved`）；`human_review` 站停 `proposed` 等人。這是計畫 §3.1 已寫明的設計（`EXECUTION_PLAN.md:78`），只是沒做；不改 I5（發布＝`ai_review_auto` 且 `review.pass`）、I8（自動化開關只有 `content_pipeline` 格、每日上限）。**操作者要確認的一句**：「AI 審核後自動發布」的站＝連題目也不用人核准（一顆開關全自動）。若她要「我選題、AI 發」，才加第三種 publishMode，不在本卡。
- **不另建 cron**：時鐘只有主機 `*/5` → `run-due`（計畫 P4.4 定案）。熱搜與提案都併進 `content_pipeline` 的 `run`，不新增 `CLIENT_JOBS` 項（I8）。
- 熱搜是公開資料、無租戶（`trends.ts:1-3`）；一天一次守衛＝`content_trends` 已有 `(geo, fetched_on = 今天 UTC)` 列，**不另加狀態**。抓到 0 筆會在下個 5 分鐘重試（RSS 免費；Serper 最壞 288 × 0.001 ≈ 0.3 美元／天，可接受，卡裡寫明）。
- 風險：Medium（排程內新增 AI 花費）→ 先寫計畫卡給操作者看，同意再實作。migration 0138 是加欄位、可 down、不鎖表；**apply 到 prod 那一步是 High**，等 go。
- 推上 main ＝當晚台灣 03:00 自動部署（AGENTS §0）。還不能上就放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`。

## 4. 做法（照順序）

1. **第一步**：整檔讀 `NA/lib/schedules/jobs.ts`、`NA/lib/content/topics/{plan,tick,make,trends,store}.ts`、`NA/lib/schedules/store.ts`、`NA/app/api/content/trending/route.ts`、`NA/app/api/content/topics/plan/route.ts`。確認 §2 行號仍對。
2. 三張卡**全文已寫在 §8**（A、B 先做，C 等 A、B 完成）。照抄進 `agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md` §7（編號 P9.1／P9.2／P9.3，格式同 P6／P7），不要改寫。同步把 §3.1 資料流圖（`EXECUTION_PLAN.md:74-78`）三行改成實際行為：熱搜「排程每天一次」、提案「本月沒有就提，台灣月」、核准「ai_review_auto 自動核准（P9.2 起才成立）」。監工台 `agency-os/handoffs/2026-10-24-auto-content-supervisor/data.mjs` 加 P9 一組 → `node build.mjs && node check.mjs`。
   - **卡 A 熱搜定時落地**（免費）：新檔 `NA/lib/content/topics/collect-trends.ts`：
     - `collectTrends(sb, geo)` ＝ 把 route 的 `loadDbSourceBlocks` ＋ `runTrending` ＋ `saveTrends`（`trending/route.ts:82-108`）搬過來；route 改呼叫它（回應不變，既有 `trending/route.test.ts` 綠）。
     - `collectTrendsIfDue(sb, geos)`：每個 geo 查 `content_trends` 有無 `(geo, fetched_on = 今天 UTC)` 列，沒有才 `collectTrends`；回傳抓了哪些 geo。
     - `content_pipeline.run`（`jobs.ts:116`）開頭呼叫：geos ＝ 該客戶 `wp_sites where organization_id = org and active` 的 `geoFor(content_defaults.targetCountry)` 去重（`plan.ts:21`）。同 geo 第二個客戶看到今天已有列就跳過。
   - **卡 B 本月自動提案＋自動核准**（付費）：
     - migration `0138_wp_sites_content_plan_attempted_at.sql`（＋`.down.sql`）：`alter table wp_sites add column content_plan_attempted_at timestamptz`；RLS 不動（既有 wp_sites 政策）。
     - 新檔 `NA/lib/content/topics/plan-due.ts`：`planIfDue(sb, organizationId, actor, now)`：
       1. month ＝ `taipeiParts(now).month` → `monthKey`。
       2. 該客戶啟用中的站逐站：有 `content_topics(site_id, month, source <> 'manual')` → 跳過（B1）。
       3. 第一個沒有的站：claim `content_plan_attempted_at`（B2）；claim 不到 → 跳過；claim 到 → `proposeMonth(sb, {organizationId, siteId, month, actor:"schedule:content_pipeline"}, planAsker(await grantFor("content.plan"), "lib/schedules/content_pipeline"))`。
       4. 站 `autoPublishes(defaults)`（`brand-voice.ts:108`）→ 每題 `move(t, "approved")`（`store.ts:16` 允許）。
       5. 回傳摘要字串 `planned site=<id> month=<m> topics=<n> approved=<n>`；失敗就 throw（run-due 記 `last_error`＋開 incident，`run-due/route.ts:66-73`），24 小時後 B2 放行再試。
       6. 全部站都有提案 → 回傳 `null`。
     - `content_pipeline.run`：`collectTrendsIfDue` → `const planned = await planIfDue(...)` → **有就 return planned，沒有才 `tickTopics`**（B3）。
     - `jobs.ts:110` cost 文字加「每個網站每月提案一次約 X 美元」（X 由 `cost-model.ts:151` 算，不手打）。
     - `PublishModeButtons.tsx:12` 的 `ai_review_auto` detail 加一句「排程提的題目也自動核准」；`human_review` detail 加「排程提的題目等人核准」。沒有第二份設定。
     - 題目頁按鈕 API（`topics/plan/route.ts`）**不改**：人按鈕提的案自然成為 B1 守衛，排程不重提。
   - **卡 C 自動內容總控頁**（A、B 做完才做；操作者 2026-10-26 要求「功能到處散放，要一個頁面管理」）：**不開新頁**，升級既有題目佇列 `NA/app/(shell)/tools/content/topics/`（`page.tsx`＋`TopicsBoard.tsx`）。頁頂加一條五格流程圖（一頁一張圖），每格＝狀態＋那一步的控制＋費用：
     | 格 | 顯示 | 控制（沿用既有 API，不新增第二份設定） |
     |---|---|---|
     | ① 搜集熱搜 | 該站 geo 最後一次 `content_trends.fetched_on`、近 30 天筆數 | 無（卡 A 自動）；可放「立即抓一次」＝GET `/api/content/trending?type=trending&geo=..` |
     | ② 提案題目 | 本月已提案幾題／尚未；上次嘗試 `content_plan_attempted_at`；失敗原因＝該客戶 `content_pipeline` 列的 `last_error` | 既有「AI 提案本月題目」按鈕（`TopicsBoard.tsx:179-221`，POST `/api/content/topics/plan`） |
     | ③ 核准 | 待核准幾題；站是 `ai_review_auto` 時顯示「自動核准」 | 既有勾選核准／退回（`TopicsBoard.tsx:231-232`） |
     | ④ 製作 | 總開關開／關、每天最多開始 N 題、進行中幾題 | 讀 GET `/api/ops/schedules?slug=<客戶>`（`NA/app/(shell)/ops/schedules/ScheduleTable.tsx:140`）；寫 PATCH `/api/ops/clients/<slug>/schedules/content_pipeline`（`ScheduleTable.tsx:166`）。先例：客戶頁已嵌 `<ScheduleTable only={org.slug} />`（`NA/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx:697`）——可加「只顯示 content_pipeline」的 prop 重用，或只抽出那一格 |
     | ⑤ 發布 | 人審／AI 審核自動發（＝也自動核准） | 直接重用 `<PublishModeButtons site onSaved />`（`PublishModeButtons.tsx:15`，PATCH `/api/content/sites/[id]` 的 `publishMode`，`NA/app/api/content/sites/[id]/route.ts:48-59`） |
     - 範圍陷阱：①②③⑤ 跟著「網站」切換；④ 是「客戶」層（一客戶一格）。一客戶兩站時，切站 ④ 不變，畫面要寫明「這個開關管這個客戶的所有網站」。站→客戶：`wp_sites.organization_id`；要確認 `/api/content/sites` 回應有沒有帶客戶 slug，沒有就在那支 GET 加（不要前端猜）。
     - 權限：④ 的寫入沿用該 API 自己的角色檢查；角色不夠就把那格顯示成唯讀（`PublishModeButtons` 已有 `readOnly` prop），不要在頁面另寫權限判斷。
     - 側欄：`NA/app/sidebar-sections.ts:78` 的 `Topic Queue` 改 `Auto Content`（**label 只能英文**，`NA/app/__tests__/sidebar-coverage.test.ts:68-70` 會擋），中文放 `title`：「全自動內容：熱搜 → 題目 → 製作 → 發布，一頁管理」。頁面 `<h1>` 與 `metadata.title`（`topics/page.tsx:5,10`）改「自動內容」。網址不改（`/tools/content/topics`），避免舊連結壞。
     - UI 規則：不用 `<select>`／下拉（用按鈕）；細節放右欄；文案白話、不寫「我們」；顏色用主題 token。
     - 舊位置照常可用：`/ops/schedules`、`/tools/content/sites` 不刪不改行為，資料只有一份。
3. 把三張卡貼給操作者看（繁中、白話、說每月多花多少錢、§3「核准」那一句請她確認），等同意；migration apply 到 prod 另等 go。
4. 實作 → `npx tsc --noEmit` 綠 → 指名的 vitest 綠 → 突變一次 → `/codex-review`（Claude 寫的）→ commit（pathspec）→ WORKLOG（用 `scripts/worklog-insert-entry.py`，經 `scripts/git-partial-worktree-commit.py stage`）。
5. 完成後把 `agency-os/TASKS.md` 收件匣 AUTOCONTENT-GAP 那條打勾。

## 5. 驗收

- vitest `plan-due.test.ts`（假 sb、假 ask）：
  - 站本月無題目 → ask 被叫一次、產生 `proposed`、`content_plan_attempted_at` 在 ask **之前**已寫。
  - 同站同月第二次 → **不叫** ask（B1）。
  - 人按鈕先提過（`source='trending'`，無 `plan`）→ 不叫 ask（B1 用 `<> 'manual'`，不是 `= 'plan'`）。
  - ask 失敗 → throw；24 小時內再叫 → 不叫 ask（B2）；24 小時後 → 再叫。
  - 兩站客戶 → 一次 firing 只提一站（B3）。
  - `ai_review_auto` 站 → 題目落 `approved`；`human_review` 站 → 停 `proposed`。
- vitest `jobs` / run：提案的 firing **不**呼叫 `tickTopics`；沒得提的 firing 呼叫 `tickTopics`（B3）。
- vitest `collect-trends.test.ts`：兩站同 geo → 當天只抓一次；今天已有列 → 不抓；route 回應與改動前一致（既有 `NA/app/api/content/trending/route.test.ts` 綠）。
- 突變：拔掉 B1 守衛 → 「同站同月第二次」測試變紅 → 還原變綠（一個守衛一次）。
- `/ops/schedules` 那格的成本文字有提到每站每月提案的費用；`/tools/content/sites` 兩顆按鈕的說明有寫到核准行為。
- migration：`0138` apply 後 `\d wp_sites` 有欄位；`.down.sql` 跑過能還原（在本機 Postgres 驗，不碰 prod）。
- 卡 C：在總控頁切開關／改每日上限／改發布模式後，到 `/ops/schedules` 與 `/tools/content/sites` 看得到同樣的值（證明只有一份資料）；`sidebar-coverage.test.ts` 綠；`/playwright` 截圖頁頂五格（雙站客戶切站時 ④ 不變）給操作者看。
- 只跑卡片點名的測試，不跑全套（AGENTS §1「不做無效益測試」）。

## 6. 範圍外（別順手做）

- 第三種 publishMode（「我選題、AI 發」）：操作者若在 §3 那一句說要，另開卡。
- 月中才開開關：提的是當月、含已過日期的題目，核准後 tick 依每日上限慢慢消化；不做「改提下個月」。
- P5 Story Bible 提示片段（`storyBibleContextBlock`、角色 id 提示）仍由頁面組好再送出：另一件事。
- 真跑一整輪需 staging WP＋測試社群品牌：操作者 10-24 說先不用。

## 7. 第二次複查改了什麼（2026-10-26，Fable 5.1）

| 原版 | 問題 | 改成 |
|---|---|---|
| 守衛「本月沒有 `source='plan'`」 | `source` 是 AI 自報，一份提案可 0 筆 `plan`（`plan.ts:65`）→ 月月重提 | `source <> 'manual'`（B1） |
| 「1–3 號窗口」 | 窗口內開關沒開或主機掛 → 整月無題；是補丁 | 不變量「本月一定有一份」（B1） |
| 「附冷卻設計」沒說狀態放哪 | `last_error` 下次成功 run 被清（`schedules/store.ts:182`）；in-memory 每晚部署重置 | `wp_sites.content_plan_attempted_at` ＋ claim（B2） |
| 提案「在 tickTopics 前」 | 90 s ＋ 200 s 擠 run-due 300 s | 提案 firing 獨占、一次一站（B3） |
| 「提案後仍停 proposed 等人核准（或站設 AI 自動）」 | 自動核准根本沒程式（`[id]/route.ts:15` 是唯一入口）；不做它，「每月不用人按」不成立 | `ai_review_auto` 站自動 `approved`；請操作者確認耦合 |
| 卡 A「排程每天跑一次」沒說守衛 | — | `(geo, fetched_on=今天)` 已有列就跳過，不加狀態 |

## 8. 卡片全文（執行者照抄進 EXECUTION_PLAN §7 與監工台；給任何 AI 都能照做）

> 共同規則：每張卡一個 commit（pathspec），commit 前 `npx tsc --noEmit` 綠、卡內點名的 vitest 綠、突變一次；Claude 寫 → `/codex-review`，Codex 寫 → `/claude-review`。測試用假物件，**不連真 DB、不打真 Anthropic**。監工台卡片用 `todo('P9.x', '白話一句')`，做完改 `done('P9.x', '白話一句', '<commit>')`（`data.mjs:48-49`），再 `node build.mjs && node check.mjs`。回報操作者一律繁體中文。

### P9.1　熱搜每天自動落地（卡 A；免費；Low；模型 Opus 5.5 或 Codex 照卡）

**改哪些檔**
1. 新檔 `NA/lib/content/topics/collect-trends.ts`：
   - `export async function collectTrends(sb, geo): Promise<number>`：把 `NA/app/api/content/trending/route.ts:82-96` 的 `loadDbSourceBlocks()` 與 `:99-108` 的 `runTrending(geo, extra)` ＋ `saveTrends(sb, geo, items)` 搬進來，回傳 `saveTrends` 的筆數；`saveTrends` 失敗一樣只 `console.warn`，不 throw（route 既有行為）。同時回傳 `items` 給 route 用（例如回 `{ items, saved }`）。
   - `export async function collectTrendsIfDue(sb, geos: string[]): Promise<string[]>`：對每個去重後的 geo，`select id from content_trends where geo = G and fetched_on = <今天 UTC 'YYYY-MM-DD'> limit 1`；沒有列才 `collectTrends`；回傳實際抓了的 geo。查詢失敗 throw（排程要知道）。
   - 檔頭註解 1–3 行：為什麼一天一次（`recentTrends` 依出現天數排，`trends.ts:68-69`）、守衛是既有列不是新狀態。
2. `NA/app/api/content/trending/route.ts`：`trendingResponse` 改成呼叫 `collectTrends`，回應 JSON 不變（`{ ok, items, geo }`）；刪掉搬走的私有函式。
3. `NA/lib/schedules/jobs.ts:116-121` `content_pipeline.run` 開頭：
   ```ts
   const { data: sites, error } = await sb.from("wp_sites").select("id, content_defaults").eq("organization_id", organizationId).eq("active", true);
   if (error) throw new Error(`content_pipeline:sites:${error.message}`);
   const geos = [...new Set((sites ?? []).map((s) => geoFor((s.content_defaults as SiteContentDefaults | null)?.targetCountry)))];
   await collectTrendsIfDue(sb, geos);
   ```
   `geoFor` 來自 `NA/lib/content/topics/plan.ts:21`；用動態 `import()` 跟既有 `tickTopics` 一樣的寫法（`jobs.ts:119`）。

**驗收**
- 新測 `NA/lib/content/topics/__tests__/collect-trends.test.ts`（假 sb 鏈式物件；mock `@/lib/content/trending-sources` 的 `runTrending`）：(a) 今天沒有列 → `runTrending` 被叫一次、`saveTrends` 被叫一次；(b) 今天已有列 → 都不叫；(c) `geos=["TW","TW","HK"]` → 最多叫兩次。
- 既有 `NA/app/api/content/trending/route.test.ts` 不改內容就綠（回應 shape 沒變）。
- 既有 `NA/lib/schedules/__tests__/content-pipeline-job.test.ts` 補 mock：`vi.mock("@/lib/content/topics/collect-trends", () => ({ collectTrendsIfDue: vi.fn(async () => []) }))`，且假 sb 要能回 `wp_sites` 空陣列；原本兩個斷言仍成立。
- 指令：`npx vitest run lib/content/topics/__tests__/collect-trends.test.ts app/api/content/trending/route.test.ts lib/schedules/__tests__/content-pipeline-job.test.ts`。
- 突變：把「今天已有列就跳過」的 `if` 拿掉 → 測 (b) 變紅 → 還原變綠。

**Rollback**：revert 該 commit；沒有資料庫改動。

### P9.2　本月自動提案＋自動核准（卡 B；付費；Medium，migration apply 到 prod 為 High）

**改哪些檔**
1. migration `lobster-factory/packages/db/migrations/0138_wp_sites_content_plan_attempted_at.sql`（格式照 `0125_client_schedules_daily_limit.sql`：檔頭 `-- APPLY: node scripts/apply-db-migration.mjs 0138`、`begin; set local lock_timeout='5s'; … notify pgrst,'reload schema'; commit;`）：
   ```sql
   alter table public.wp_sites add column if not exists content_plan_attempted_at timestamptz;
   ```
   `.down.sql`：`alter table public.wp_sites drop column if exists content_plan_attempted_at;`（欄位只是時間戳，不需備份表）。RLS 不動。**apply 到 prod 要操作者 go**；本機 Postgres 先 apply → down → apply 各一次證明可逆。
2. 新檔 `NA/lib/content/topics/plan-due.ts`：
   ```ts
   export interface PlanDueDeps {
     sites(): Promise<Array<{ id: string; defaults: SiteContentDefaults }>>;          // 該客戶 active 的 wp_sites
     hasProposal(siteId: string, month: string): Promise<boolean>;                    // content_topics: site_id, month, source <> 'manual' 存在
     claimAttempt(siteId: string, now: Date): Promise<boolean>;                        // update wp_sites set content_plan_attempted_at=now where id=site and (is null or < now-24h) returning id → 1 列 = true
     propose(siteId: string, month: string): Promise<Topic[]>;                        // proposeMonth 包在 runForOrg + grantFor("content.plan")
     approve(t: Topic): Promise<Topic | null>;                                         // store.move(sb, t, "approved")
   }
   export const PLAN_RETRY_MS = 24 * 60 * 60 * 1000;
   /** 一個 firing 最多提一站；回傳摘要，沒得提回 null。 */
   export async function planIfDue(deps: PlanDueDeps, now: Date): Promise<string | null>
   ```
   流程：`month = monthKey(taipeiParts(now.toISOString()).month)`（`store.ts:72,82`）→ 逐站 `hasProposal` 為 true 跳過 → 第一個 false 的站 `claimAttempt`，false 跳過（冷卻中或別的 firing 搶到）→ `propose` → 若 `autoPublishes(defaults)`（`brand-voice.ts:108`）每題 `approve` → 回 `planned site=<id> month=<m> topics=<n> approved=<n>`。`propose` throw 就讓它往上 throw（run-due 記 `last_error` 開 incident，`run-due/route.ts:66-73`）。
   - `export function planDueDeps(sb, organizationId, actor): PlanDueDeps`：真實作。`propose` ＝ `runForOrg(organizationId, actor, async () => proposeMonth(sb, { organizationId, siteId, month, actor }, planAsker(await grantFor("content.plan"), "lib/schedules/content_pipeline")))`（`runForOrg`／`grantFor` 在 `NA/lib/entitlements/grant.ts:58,73`；先例 `make.ts:99,261`）。
3. `NA/lib/schedules/jobs.ts` `content_pipeline.run`：P9.1 的 `collectTrendsIfDue` 之後：
   ```ts
   const planned = await planIfDue(planDueDeps(sb, organizationId, "schedule:content_pipeline"), new Date());
   if (planned) return planned;      // B3：提案的 firing 不 tick
   return tickTopics(...);           // 原本那行
   ```
4. `jobs.ts:110` cost 字串尾端加：`` 每個網站每月第一次提案另約 ${planCostUsd()} 美元。`` — 在 `NA/lib/content/topics/cost.ts` 加 `export function planCostUsd(): number`（同檔 `planCostTwd` 的 USD 版，`Math.ceil(featureUnitCostUsd(f) * 100) / 100`），不手打數字。
5. `NA/app/(shell)/tools/content/sites/PublishModeButtons.tsx:11-12`：`human_review.detail` 尾端加「排程提出的題目等人核准。」；`ai_review_auto.detail` 尾端加「排程提出的題目也自動核准。」
6. `agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md:74-78` 三行改成實際行為（§4 步驟 2）。

**驗收**
- 新測 `NA/lib/content/topics/__tests__/plan-due.test.ts`（全部假 deps，用 `vi.fn`）：
  1. 一站、`hasProposal=false`、`claimAttempt=true` → `propose` 叫一次，且 `claimAttempt` 的呼叫順序在 `propose` 之前（`mock.invocationCallOrder`）。
  2. `hasProposal=true` → `propose` 不叫、回 `null`（B1）。
  3. `claimAttempt=false` → `propose` 不叫（B2）。
  4. `propose` reject → `planIfDue` reject（錯誤往上）。
  5. 兩站都 `hasProposal=false` → `propose` 只叫一次（B3）。
  6. `defaults.publishMode="ai_review_auto"` → `approve` 對每題各叫一次；`human_review` → 不叫。
  7. `now = 2026-11-01T00:30:00Z`（台灣 11/1 08:30）→ `hasProposal` 收到 `"2026-11-01"`；`now = 2026-10-31T17:00:00Z`（台灣 11/1 01:00）也收到 `"2026-11-01"`（台灣月）。
- `content-pipeline-job.test.ts` 加兩條：`planIfDue` 回字串 → `tickTopics` 不叫、`run` 回那個字串；回 `null` → `tickTopics` 叫（mock `@/lib/content/topics/plan-due`）。
- 真 SQL 守衛各一條（在 `store.test.ts` 的假 sb 風格下驗呼叫鏈）：`hasProposal` 用 `.eq("site_id").eq("month").neq("source","manual")`；`claimAttempt` 的 `.or()` 字串含 `content_plan_attempted_at.is.null` 與 `.lt.`。
- 指令：`npx vitest run lib/content/topics/__tests__/plan-due.test.ts lib/schedules/__tests__/content-pipeline-job.test.ts`。
- 突變：把 `hasProposal` 那個 `continue` 拿掉 → 測 2 變紅 → 還原變綠。
- 部署後實測（操作者 go 之後）：在 staging／測試客戶把 `content_pipeline` 打開，看 run-due log 出現 `planned site=…`，題目頁出現本月題目；再等 5 分鐘 log 應是 tick 摘要而不是第二次 `planned`。

**Rollback**：revert commit（app 先）→ `0138.down.sql`。已提出的題目留著（是資料，不是程式），不刪。

### P9.3　自動內容總控頁（卡 C；Low–Medium；UI；模型 Opus 5.5）

內容＝§4 卡 C 的表與五條規則，照抄；**另外**：
- ② 的「本月已提案幾題」＝`listTopics(sb, org, month)` 過濾 `site_id` 與 `source <> 'manual'` 的筆數（`store.ts:91`）；「上次嘗試」讀 `wp_sites.content_plan_attempted_at`（要在 `/api/content/sites` GET 的 select 加這一欄）；「失敗原因」讀 `/api/ops/schedules?slug=` 回的 `content_pipeline.lastError`。
- 五格資料由頁面一次 server 端組好傳給 client component，不要五格各自 fetch。
- 驗收：§5 卡 C 那一條；另加 `npx vitest run app/__tests__/sidebar-coverage.test.ts`。
- Rollback：revert commit；無資料庫改動。
