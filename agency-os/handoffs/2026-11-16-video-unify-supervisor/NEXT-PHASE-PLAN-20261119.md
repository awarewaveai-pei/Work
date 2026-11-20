# 影音平台下一階段計畫：從「融合完成」到「每天自動發文發信」（2026-11-19）

讀者 = AI agent。前綴：`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`，`VW` = `…/apps/video-workbench`，`PLAN` = `VW/docs/video-unify-plan-20261116.md`，`SOP` = 同資料夾 `SOULFUL-LIVE-RUN-SOP-20261118.md`。
行號以 checkout `4bcb1bb20` 為準，開卡前 grep 一次。「實走」＝ 2026-11-19 10:45–10:55（台北）正式站 AwareWave Ops，內建瀏覽器。金額 NT$（匯率 32）。
本檔只有評估與卡片；沒有改程式、沒有對外發布。狀態正本仍是 `data.mjs`；本檔的卡併入監工台前不算開工。

## 1. 結論五行

1. **融合了一半**：人按的做片是一條路（腳本 → 鏡頭 → 快速輸出 → 審片發布面板）；自動那一半仍是兩套（話題佇列 vs 工作台自動推進），審核、嵌入、封面、上限、通知各做各的（§3 A1–A12）。
2. **走得通，不順**：實走違反「只有一顆下一步」12 處（§4 S1–S12）；一鍵到草稿要填上限 ≥ NT$37 才肯跑實際約 NT$3 的工作。
3. **離全自動差 4 個節點＋3 個守衛**：缺每日選題、影片進發布閘、YouTube 先發再回填連結、發信；守衛缺單題金額上限、跨月去重、審核逾時提醒（§5）。
4. **第一優先 N1**：話題佇列的影片不經四項審片就會進「可自動發布」的文章（`NA/lib/content/topics` grep 審片函式 0 hits）。今天三個站都關自動發布所以沒外洩，開關一開就是洞。
5. **成本**：一支日更影片（腳本＋成片＋社群文案）實測約 NT$2；加 SEO 文章與 3 張配圖約 NT$10.2。每品牌每月約 NT$60／NT$310，另加月提案 NT$2.5。渲染、配音、圖庫、封面 NT$0（自家主機＋免費來源）；R2 流量、發信費未量（§11）。

## 2. 不變量

沿用（照抄編號，不重述）：PLAN §1 #1–#12；PLAN §11 四條；PLAN §12 六條；PLAN §13 C3（`full_auto` 只由話題佇列設）。

新增：
- **新 1 一個執行器**：全自動的執行器＝話題佇列（`content_topics` 狀態機＋`tick.ts`）。工作台自動推進（`project-advance`）是它呼叫的審片／核准函式庫，不是第二條發布路。不建第三套。
- **新 2 一道審核**：任何會進「可發布文章／對外貼文」的影片，都過同一道四項 QA＋Release（`project-advance.ts:59-62`）。文字規則審核（`topics/review.ts`）只管文字。
- **新 3 連結先活才引用**：WP 文章與對外貼文只引用已上線的網址（既有：社群貼文等文章上線才帶連結，`tick.ts:8-10`；新增：文章等 YouTube 上線才帶 YouTube 連結）。
- **新 4 一個上限機制**：金額上限只有 `auto-run-budget.ts` 一套（預留 → 實扣 → 到頂停在當步）；話題、一鍵到草稿、快速輸出自動完成都用它。
- **新 5 系統不自己寄信**：會員信只建草稿，寄出是人在 FluentCRM 按（既有紅線：`lobster-factory/packages/wp-bridge-plugin/WP_BRIDGE_CONTROL_PLANE_DESIGN.md:95,192`）。
- **新 6 手動＝同一列同一串**：手動模式是同一筆 `content_topics`、同一串步驟，把「自動條件成立」換成「人按了這一顆」；不另寫流程。
- **新 7 估價只有一個數**：畫面上同一步驟只顯示一個預估與一個最大值，來源同一個函式；預估用近 30 天實扣中位數校正。

## 3. 問題 A：融合度（20 列舊能力是一條路，自動段是兩套）

PLAN §8 的 20 列：2026-11-18 Soulful 實走全部能用（`data.mjs:184`）；本次沒有發現退回兩條路的列。仍是兩套的地方（全部在 §8 之外的「自動」與「殼」）：

| # | 兩套 | 話題佇列這邊 | 工作台這邊 | 證據 |
|---|---|---|---|---|
| A1 | 做片前段 | 主題 → `startVideoJob`（腳本→場景→圖庫） | 鏡頭 → quick-render | `NA/lib/content/topics/make.ts:223`；`VW/backend/quick-render.cjs:1-8`。引擎同一個（video-service），PLAN D17 已知代價 |
| A2 | 審核 | 只有文字規則 4＋2 項 | 四項 QA＋Release | `topics/review.ts:19-38`；`project-advance.ts:59-62`；`grep -rnE "persistEditorialRightsQa\|media_qa_reports\|createApprovedRelease" NA/lib/content/topics` → 0 |
| A3 | WP 嵌入 | 裸網址、無封面預覽圖 | video 區塊＋poster | `make.ts:265`（無 releaseId）；`project-advance-deps.ts:120`；實查 post 55 內容為裸 `…/16x9.mp4`，post 57 為 `<video controls poster=…>` |
| A4 | WP 草稿內容 | 文章＋SEO 欄＋分類（post 55：居家生活、收納整理，Rank Math 三欄有值） | 只有標題＋影片（post 57：未分類、無 SEO、1,030 bytes） | wp-cli 2026-11-19；兩篇 `post_author=0`、都沒有 `_thumbnail_id`（SOP B2） |
| A5 | 花費上限 | 只有每天題數 | `autoBudget` 預留與實扣 | `tick.ts:15`；`project-advance-deps.ts:18,85-93`；`NA/lib/script-forge/run-store.ts:42` |
| A6 | 幣別 | 總覽「US$11.21」、排程說明「每題約 0.19 美元」 | 全 NT$ | 實走 `/tools/content/topics`；`NA/lib/schedules/jobs.ts:111`。同頁按鈕又是「約 NT$2.5」 |
| A7 | 停點通知 | 事件：英文標題＋uuid，無連結 | Telegram 直送：片名＋原因＋已用／上限＋連結 | `NA/app/api/internal/schedules/run-due/route.ts:55-56`；`advance-auto-projects.ts:49`；`project-advance-deps.ts:224-226` |
| A8 | 日界線 | 每日上限按 UTC 日算（台北 08:00 換日） | 排定時間顯示台北 | `tick.ts:231`；`plan.ts:120`；社群編輯頁另有 SOP B19 |
| A9 | 導覽 | 員工門側欄英文（Auto Content、Social Posts） | 工作台 14 項側欄＋腳本頁內再一層 24 入口選單；產品門另有功能清單 | 實走三個網域 |
| A10 | 客戶選擇 | 社群工具 TopBar 品牌 | 工作台頂「客戶：」＋腳本頁內「載入客戶… AwareWave ▾」 | 實走；腳本頁那顆是下拉（違反 PLAN §1 #8） |
| A11 | 作品清單 | — | 「作品」不跟客戶切換：客戶是 AwareWave Ops 時列出 Soulful 的片（標題 A 30-Second Creative Pause、檔名前綴 `2bf60452_`） | 實走；`NA/app/(shell)/tools/designs/DesignsGallery.tsx:422`（請求不帶組織） |
| A12 | 「自動」五個名字 | 自動內容（話題）／Schedules（排程）／自動發布清單（輪播）／自動化流程（留言自動回覆） | 自動排程（話題唯讀） | `NA/app/(shell)/tools/social/routes.ts:20-25`；實走。同一個詞指五件事 |

## 4. 問題 B：順暢度

### 4.1 違反「只有一顆下一步」（PLAN §11）的地方（只列新發現；B1–B26 見 SOP §2 B）

- S1 腳本頁底部三顆並排：「產生腳本角度 →」「主題 → 完整腳本（一鍵）」「一鍵到草稿」，兩顆同為主色。
- S2 一鍵到草稿三個金額互相矛盾：頁面「約 NT$1.3／次」、對話框「腳本與評分最多 NT$36.88」、拒絕訊息「下一次腳本呼叫最多需要 NT$8.33」（`run-store.ts:42`）。實扣第一個呼叫 NT$2.01（`ai_call_logs` 02:50:59Z opus US$0.0628）。
- S3 上限低於預留，送出後才回 409，文字是「腳本生成失敗」；填 1、填 9 都被擋，要 ≥ 約 37 才能跑。對話框預設「缺的畫面＝AI 生圖」、上限預填最大值 62＝預設走最貴的路。
- S4 快速輸出的集，步驟列 6 剪輯、7 聲音、8 字幕顯示「還沒做」，9、11、12 卻「做好了」（`VW/shared/episode-spine.js:590-592` 只看剪輯檔）。
- S5 一集三版成片各列約 13 顆按鈕；第 1、2 版寫「完成：已建 3 個社群草稿、1 篇文章」，實際交付的是第 3 版。
- S6 成片卡「發布到哪：wordpress／default:post-57：published」：文章是草稿卻寫 published，還露出內部代號（`NA/lib/content/video/embed-in-post.ts:234-235` 草稿也記成 published）。
- S7 話題到「已審核」後，細節只剩一顆「退回重做」；沒有草稿連結、沒有發布（`NA/app/(shell)/tools/content/topics/TopicsBoard.tsx:75`）。人工審核的站走到這裡就斷線。
- S8 話題「核准」後畫面不說何時開始（實際等下一個 5 分鐘）；「加題目」日期預設 1 日（已過）。
- S9 自動內容頁在 1440 寬仍水平溢出（`scrollWidth` 2035）；1024 寬時側欄蓋住清單與勾選框。
- S10 工作台「自動排程」列 200 筆，含 10 月與已過期的「排隊・待確認」，沒有篩選、沒有每列下一步。
- S11 腳本頁 Story Bible 說明還寫「草稿頁多一個比對面板」（舊流程已刪）。
- S12 重複題目：10 月與 11 月各有「每天滑短影音看新聞，會讓你更焦慮嗎？」「學會說不…」「職場倦怠的 5 個…」（唯一鍵只到月，`NA/lib/content/topics/store.ts:133`）。

### 4.2 四級今天能自動到哪（PLAN §12；B19–B26、F1–F4 不重抄）

| 級 | 今天到哪 | 停在哪、為什麼 |
|---|---|---|
| 1 腳本一鍵 | 能用 | 預估偏低（1.3 vs 實扣 2.01，同 B21 類） |
| 2 影片一鍵→草稿 | 走通（11-19 10:10，`data.mjs:188`） | B25 圖庫靜止片、B26 續接不重出片 |
| 3 一鍵到草稿 | 走通一次（12 點擊、7 分 45 秒） | 本次實走被上限預留擋下（S2、S3）；沒續跑，守 NT$2 |
| 4 全自動 | 到 `reviewed` 即止 | 三個站 `publishMode` 全 NULL（psql）；`topicMode` 全空 → 11 月 28 題提案沒人核准，實際每日產出 0；只做社群的題 98 秒到 reviewed、NT$0.014（預估 0.4） |

話題路線本次實走：開頁 → 選日 → 填標題與關鍵字 → 關「文章」→ 加入 → 點題目 → 核准＝ 7 次點擊＋2 個欄位；02:48:30Z 核准 → 02:50:01Z 排程接手 → 02:50:08Z reviewed。

## 5. 問題 C：全自動日更管線的差距表

目標串：抓熱門 → 寫腳本 → 審核 → 生影片 → 審核 → 發布（YouTube → WP 嵌 YouTube 連結 → 其他社群）→ 發信。

| 節點 | 今天有沒有（file:line） | 缺口 | 風險 | 卡 |
|---|---|---|---|---|
| 抓熱門 | 有：每 geo 每天一次（`collect-trends.ts:48-63`），近 30 天 9,701 筆、7 個來源（實走） | 只餵月提案，不產當天題目 | 來源 429；共用快取不分客戶（既有設計） | N8 |
| 選題 | 半：每月一次提 28 題（`plan-due.ts:28-45` B1、`plan.ts:20`）；`ai_pick` 才自動核准（`plan-due.ts:41`） | 沒有每日；相關性只靠提示一句「不相關就不用」（`plan.ts:84`）；去重只到月；過期提案不清 | 重複發文、離題、蹭敏感時事 | N8、N9、N7 |
| 寫腳本／文章 | 有：`make.ts:96-123`（文章）、`:217-231`（影片腳本） | 呼叫不帶題目 id（F4；本次社群呼叫 `job_id` 空） | 無法對帳 | N2 |
| 文字審核 | 有：完整／長度／SEO／禁語／社群／社群禁語（`review.ts:19-38`） | 禁語只比對字面（`review.ts:16`）；沒有必附段落（免責、危機專線）檢查 | Soulful 類內容規範（`agency-os/tenants/company-soulful-expression/sites/soulfulexpression-org/content/CONTENT_STRATEGY.md:19-21`） | N1b |
| 生影片 | 有：`startVideoJob`，6 場、圖庫、免費配音（`NA/lib/content/video/defaults.ts:6-12`） | 無封面；靜止素材（B25） | 版權：只收 Pexels／自家 R2（PLAN F2） | B25、R1 |
| 影片審核 | **無**（A2） | 成片直接嵌入並可自動發布 | 凍結畫面、字幕錯、無權素材上線 | **N1** |
| 發布 YouTube | 半：YouTube 是社群貼文的一個頻道，文章上線後 2 分鐘才排（`make.ts:175-188`、`:50`） | 順序相反；發布網址有回寫（`NA/lib/social/dispatch.ts:305` `release_url`）但沒人讀 | YouTube 配額與審核延遲；Postiz 429 整體退避（`dispatch.ts:7`） | N5a |
| 發布 WP | 有：`publishDrafts`（`make.ts:190-211`），只在 `ai_review_auto` | 嵌的是 R2 mp4（A3），不是 YouTube 連結；人工審核站沒有發布鈕（S7） | Bridge 只能改草稿（`embed-in-post.ts:259-262`）→ 必須在發布前換連結 | N5b、N6 |
| 發布其他社群 | 有：帶文章連結後排程或送審（`make.ts:175-188`） | 無 | 品牌要求社群審核時改成送審（既有） | — |
| 發信 | **無自動通道**：只有建 FluentCRM 草稿、只到我們自己的 bridge 站、寄出要人按（`NA/lib/crm/fluentcrm.ts:35-39`；`NA/app/api/content/newsletter/route.ts:14-16`） | 每站通道、名單人數、退訂、頻率上限、模板全缺；平台沒有任何會員 email 表 | 垃圾信、寄件信譽、個資；`grep -rl -iE 'wc/v3/customers\|get_users\(\|WP_User_Query'` 三處 0 檔 | N10 |
| 金額上限 | 話題無（B22） | — | 花費失控 | N2 |
| 提醒與逾時 | 停點有通知（A7）；等人的沒有 | 待核准、待發布不提醒；不逾時 | 題目爛在佇列（現況 53 筆 proposed） | N7、N17 |

### 5.1 特別回答

**審核要人還是 AI**
- AI／規則就夠：腳本評分（`NA/lib/script-forge/auto-run-result.ts`）、文字規則（`review.ts`）、影片四項 QA（N1 接上後）。
- 必須人點頭：(a) 把一個站切成自動發布（只有員工能切，`make.ts:8-9`）；(b) 寄出會員信（新 5）；(c) 內容規範有法規風險的品牌（Soulful）每一則的發布——建議維持人工審核站，不開自動。
- 沒人點頭：永遠不發布，留草稿。每天 09:00 的排程報告多一行「N 題待核准、M 題待發布、最舊幾天」（N7）。提案過了排定日 7 天自動退回並寫原因；已審核 72 小時沒人按就在同一行標紅，不自動發。天數已定（§11 O2）。

**順序、重試、回退（執行器＝話題佇列，新 1）**
1. 影片審核過 → 草稿階段文章先嵌 R2 檔（審的人看得到片）。
2. 發布（自動或人按）→ 只送 YouTube 那則 → 每 5 分鐘讀 `social_post_targets.release_url`。
3. 拿到網址 → 把文章裡的 R2 影片換成 YouTube 網址（獨立一行，WordPress 自動嵌入）→ 文章上線。
4. 文章上線 → 其他社群帶文章連結排出。會員信不在這一串裡（每週一封，見「發信」）。
- 每步做完記在 `artifacts`（照 `attachTopicVideo` 的寫法，`make.ts:256-287`），重跑不重做。
- YouTube 60 分鐘沒網址或回錯 → 題目 failed、文章與其他貼文都還是草稿（沒有東西要收回）。
- 文章上線後社群失敗 → 既有行為：題目 failed 並保留已上線紀錄，重試只補沒送的（`tick.ts:76-93`）。
- 沒連 YouTube 的站：跳過 2，文章維持 R2 檔（今天的行為）。

**發信**
- 通道：各站自己的 FluentCRM，經 WP Bridge（文件既定：`agency-os/docs/Outbound_OS_Engineering_Spec/cold_email_deliverability_compliance_v3_final.md:53`；不可用開發信信箱，同檔 `:603`）。Resend 只寄單封交易信（`NA/lib/mail/resend.ts:1,12-19`），沒有退訂處理，不用。
- 名單：在各站 FluentCRM 裡，平台不讀；收件人由人在 FluentCRM 按寄出前看（`newsletter/route.ts:14-15`）。退訂用 FluentCRM 內建（已退訂者不會被重新訂閱，`ContactUpserter.php:6`）。
- 頻率（已定 O3）：每週一封。由既有的客戶排程每週跑一次（寫法照社群週報，`NA/lib/schedules/jobs.ts:43-52,98-99`）；排程就是頻率上限，同一期只會領到一次（`NA/app/api/internal/schedules/run-due/route.ts:9-12`）。不另做人數與頻率的讀取路由。
- 模板：那一週已發布題目的標題、摘要（`artifacts.article.summary`）、YouTube 連結＋該站必附段落；沿用 `newsletter/route.ts:167-231` 的轉換。那一週沒有發布就不建。

**熱門議題**
- 來源：`content_trends`（Dcard、Google News、Google Trends、Instagram、Serper、X、YouTube）＋各站自己的 RSS（`plan.ts:52-57`）。
- 去重：同站 90 天內標題與關鍵字正規化後相同就不提（規則沿用 `trends.ts:10 norm`）。
- 相關性：每日一次便宜模型打分（0–100），低於門檻不提；預設門檻 70、每天最多提 3 題、最多開始 1 題。
- 誰決定：`human_pick` 站只提案等人勾；`ai_pick` 站自動核准（既有 B4，`plan-due.ts:41`）。

## 6. 問題 D：手動模式（同一條管線）

同一筆題目、同一份狀態；每個狀態只給一顆主按鈕（新 6）：

| 狀態 | 自動時 | 手動時那一顆 | 今天 |
|---|---|---|---|
| proposed | `ai_pick` 自動核准 | 核准 | 有（另有「核准並開始」「退回」並排 → 收成一顆主＋兩顆次） |
| approved | 到時間自動開始 | 現在開始（顯示預估與上限） | 有 |
| generating／drafted／waiting_video | 自動 | 無按鈕，顯示做到哪、預計幾分鐘 | 只顯示狀態字 |
| failed | 停＋通知 | 重試（從失敗那步） | 有 |
| reviewed | `ai_review_auto` 自動發布 | **發布**（列出會發到哪、開啟各草稿的連結） | **缺**（S7）→ N6 |
| publishing | 自動逐步 | 無按鈕，顯示 YouTube → 文章 → 社群 三格 | 缺 → N5a |
| published | — | 完成（各連結） | 有 |

自動節點在手動時變「建議＋確認」的三個：選題（提案＋打分 → 人勾）、發布（N6）、發信（永遠是人按，新 5）。

## 7. 問題 E：額外建議（有證據才列）

- 預估校正：三處實測都偏（7.4→10.2、0.4→0.014、1.3→2.01）→ N3、N12。
- 單題金額上限：B22、F3 → N2。
- 時區統一：A8、B19 → N4、B19。
- Remotion 封面模板：SOP §2 C、待決 5 已定另開卡 → R1（話題影片目前沒有封面，A3）。
- 圖庫靜止片預篩：B25 → 沿用 `video-service/server.py:263-270` 的 freezedetect。
- 多客戶同時日更：渲染一次一支（`quick-render.cjs:14-15` 註記 `_render_lock`）、每支約 3–6 分鐘；每輪每組織只推 3 支（B24）；`tick` 每輪 200 秒預算（`tick.ts:19`）。10 個品牌同時日更約佔渲染 1 小時／天，排隊可行；隔離靠既有組織條件。先修 B24 再開第二個品牌。
- 成效回寫選題、A/B 標題與封面：**不建議現在做**。`social_metrics` 每天有快照（`host-jobs.ts:56`），但目前 0 支影片對外發布過，沒有資料可回寫；等 N5 上線滿 30 天再評估。
- 路由三件套沒有「內容對外發布」「會員信」兩種任務（`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md:34-47`；`workflow-risk-matrix.json` grep publish／social／email 0）→ N18。

## 8. 卡片（格式同 `data.mjs`；每張 ≤ 1 天 Opus 5.5）

檔案路徑省略 `NA/` 前綴者皆在 next-admin。「突變」只列隱私／可見範圍／同意／擁有權／對外發布的守衛，一個守衛一次（AGENTS §1）。

**批 0：開自動發布之前必須先有（可並行：N1｜N2｜N4｜N15）**

- **N1 話題影片過同一道審片**｜白話：話題做出的影片有凍結畫面時，題目停下並說原因，文章留草稿。｜完成的樣子：`pollTopicVideo` 完成後呼叫 `advanceDeps` 的 `rows`／`qaProblems`／`release`（不複製）；不過 → 題目 failed、原因中文；過 → 嵌入帶 `releaseId`。｜風險 Medium（部署 High）｜Opus 5.5＋critic Deep｜相依：無｜檔案：`lib/content/topics/make.ts`、`lib/content/topics/tick.ts`、`lib/content/video/project-advance-deps.ts`｜突變：拿掉 `qaProblems` 判斷 → 測試紅（未審影片不得進可發布文章）。
- **N1b 必附段落規則**｜白話：站台設了「每篇必附」的句子（免責、專線），文章沒有就審核不過。｜完成的樣子：`SiteContentDefaults` 加 `requiredBlocks: string[]`；`articleChecks` 多一項；`embedVideoInNewDraft` 的草稿也帶這些段落與預設作者（收 B2）。｜Medium｜Opus 5.5｜相依：無｜檔案：`lib/content/brand-voice.ts`、`lib/content/topics/review.ts`、`lib/content/video/embed-in-post.ts`｜突變：無（不是隱私守衛；單元測試）。
- **N2 話題金額上限與對帳**｜白話：一題花到上限就停在那一步；每題花多少查得到。｜完成的樣子：排程列多「每題上限 NT$」（預設 15）；文章、社群、腳本呼叫都帶 `jobId`＝題目 id；用 `auto-run-budget.ts` 預留與實扣；`select sum(cost_usd) … where job_id=<題目>` ＝題目花費。｜Medium｜Opus 5.5＋db-expert（migration，down 寫兩處）｜相依：無｜檔案：`packages/db/migrations/（開卡取號，現 0164）`、`lib/content/topics/make.ts`、`lib/schedules/jobs.ts`、`lib/content/video/auto-run-budget.ts`｜突變：拿掉上限判斷 → 紅。
- **N3 預估校正、全頁 NT$**｜白話：按鈕上的錢跟實際差不到一成，整頁不再出現美元。｜完成的樣子：`topicCostUsd` 算進配圖張數；有 ≥5 筆實扣時改用近 30 天中位數；`jobs.ts:111` 與總覽改 NT$。｜Low｜fullstack-engineer（Sonnet）｜相依：N2｜檔案：`lib/content/topics/cost.ts`、`lib/schedules/jobs.ts`、`app/(shell)/tools/content/topics/*`。
- **N4 每日上限照品牌時區換日**｜白話：台北的品牌在半夜 12 點換日，不是早上 8 點。｜完成的樣子：`tick.ts:231` 的日改讀 `organizations.default_timezone`；07:59 與 08:01（台北）兩個測試。｜Low｜Opus 5.5（小）｜相依：無｜檔案：`lib/content/topics/tick.ts`、`lib/content/topics/make.ts`。
- **N15 作品頁跟著客戶**｜白話：切到 A 客戶時，作品只列 A 的片。｜完成的樣子：`/works` 帶工作台目前組織；伺服器端比對可見範圍。｜Medium｜Opus 5.5＋critic Deep（可見範圍）｜相依：無｜檔案：`app/video/(wb)/works/page.tsx`、`app/(shell)/tools/designs/DesignsGallery.tsx`、`app/api/tools/designs/route.ts`｜突變：拿掉組織條件 → 紅。

**批 1：發布順序（N5a → N5b → N6；N7、N17 可並行）**

- **N5a 發布分步、YouTube 先發**｜白話：先上 YouTube，拿到連結才動文章與其他貼文。｜完成的樣子：`makeSocial` 把 YouTube 拆成自己一則；題目新增「發布中」狀態（`store.ts:7-8` 現有 11 個狀態沒有它；資料庫的狀態限制要一起改）；每步記 `artifacts.publish`；60 分鐘沒網址 → failed、其餘仍是草稿；YouTube 公開設定讀網站設定（`public`｜`unlisted`，預設 `public`；現寫死在 `lib/social/compose.ts:60`）。｜High｜Opus 5.5＋critic Deep＋db-expert（狀態 check）｜相依：N1｜檔案：`lib/content/topics/tick.ts`、`make.ts`、`store.ts`、`lib/social/store.ts`、`lib/social/compose.ts`、`lib/content/brand-voice.ts`、migration｜突變：拿掉「等 `release_url`」→ 紅（未上線的連結不得進已發布內容）。
- **N5b 文章改嵌 YouTube 連結**｜白話：發布時把文章裡的影片檔換成 YouTube 連結。｜完成的樣子：`embed-in-post.ts` 加 `swapEmbeddedVideo`（同一條 bridge 通道、帶 sha256）；發布後文章含 YouTube 網址、不含 `.mp4`；重跑不重複；沒連 YouTube 的站不變。｜Medium｜Opus 5.5｜相依：N5a｜檔案：`lib/content/video/embed-in-post.ts`、`lib/content/topics/make.ts`。
- **N6 已審核題目的「發布」鈕**｜白話：人工審核的站，在題目上按一顆就照同一串發出去。｜完成的樣子：`TopicsBoard` reviewed 列主按鈕「發布」＋各草稿連結；`publishDrafts` 的門改成「站台自動 或 這次有人按（記誰、何時）」；限員工與品牌編輯。｜High｜Opus 5.5＋critic Deep｜相依：N5a｜檔案：`app/(shell)/tools/content/topics/TopicsBoard.tsx`、`app/api/content/topics/*`、`lib/content/topics/make.ts`｜突變：拿掉「自動或有人按」判斷 → 紅（沒人點頭的站不得發布）。
- **N7 等人的事會提醒、會過期**｜白話：每天早上一行告訴你幾題等核准、幾題等發布。｜完成的樣子：每日排程報告多一行；提案過期 7 天自動退回並寫原因；已審核 72 小時標紅。｜Low｜fullstack-engineer（Sonnet）｜檔案：`lib/schedules/alerts.ts`、`lib/content/topics/tick.ts`。
- **N17 停點通知一則就能動手**｜白話：通知寫片名、停在哪、為什麼、點哪裡。｜完成的樣子：`video_project_advance` 與 `content_pipeline` 的事件標題改中文、帶標題與連結；同一停點不重複通知兩則。｜Low｜fullstack-engineer（Sonnet）｜檔案：`app/api/internal/schedules/run-due/route.ts`、`lib/content/video/advance-auto-projects.ts`。

**批 2：每日選題（N9 → N8）**

- **N9 跨月去重**｜白話：三個月內寫過的題目不再提。｜完成的樣子：`proposeTopics` 比對同組織 90 天內正規化標題與關鍵字。｜Low｜fullstack-engineer（Sonnet）｜檔案：`lib/content/topics/store.ts`、`plan.ts`。
- **N8 每日熱題補位**｜白話：每天從當天熱搜挑最多 3 個跟品牌有關的題目。｜完成的樣子：`content_pipeline` 每天每站一次（先在 DB 佔位再呼叫，照 B2）；便宜模型打分，≥70 才提；`ai_pick` 站自動核准；站台開關預設關。｜Medium｜Opus 5.5＋db-expert｜相依：N2、N9｜檔案：`lib/content/topics/plan-due.ts`、`plan.ts`、`lib/schedules/jobs.ts`、`lib/content/brand-voice.ts`、migration。

**批 3：會員信（N10）**

- **N10 每週會員信草稿（各站自己的 FluentCRM）**｜白話：每週一次，把這一週發布的影片排成一封信，放進那個站的 FluentCRM，等人按寄出。｜完成的樣子：`CLIENT_JOBS` 加一項每週排程（預設關，寫法照 `reportJob`）；`createNewsletter` 收 `clientId`（照 `fluentcrm.ts:66-71`）；那一週沒有發布就不建；站沒裝 FluentCRM 就跳過並寫明；建好後通知「信已備好」。｜High（對外信）｜Opus 5.5＋critic Deep｜相依：N5a｜檔案：`lib/schedules/jobs.ts`、`lib/crm/fluentcrm.ts`、`app/api/content/newsletter/route.ts`｜突變：讓草稿以外的狀態通過 → 紅（系統不得自行寄信；外掛側 `NewsletterCreator.php:79-86`）。

**批 4：順暢度（互不相依，可並行；動 `VW/scripts/projects-0.js` 的 N13、N14 由監工排先後）**

- **N12 一鍵到草稿的金額說清楚**｜一個預估＋一個最大（同一個伺服器報價）；上限是硬保證，低於整趟最大值不得起跑，在花錢前就擋並寫「至少要 NT$X」；腳本頁只留一顆主按鈕。｜Medium｜Opus 5.5｜檔案：`app/(shell)/tools/video/ScriptForge.tsx`、`lib/script-forge/run-store.ts`、`app/api/tools/script-forge/*`。（收 S1–S3）
- **N13 步驟列跟著輸出法**｜快速輸出的集，6–8 顯示「選用」。｜Low｜fullstack-engineer（Sonnet）｜檔案：`VW/shared/episode-spine.js`。（收 S4）
- **N14 成片卡收斂**｜只展開最新一版；「完成」只標在實際交付那版；「發布到哪」寫「網站草稿〈標題〉」。｜Low｜fullstack-engineer（Sonnet）｜檔案：`VW/scripts/projects-0.js`、`lib/content/video/embed-in-post.ts`。（收 S5、S6）
- **N16 兩個「自動」頁**｜篩選（進行中／等你處理／過期）、每列一顆下一步、修水平溢出、員工門側欄改繁中、腳本頁舊說明與客戶下拉拿掉。｜Low｜fullstack-engineer（Sonnet）｜檔案：`app/video/(wb)/schedule/*`、`app/(shell)/tools/content/topics/*`、`app/sidebar-sections.ts`、`ScriptForge.tsx`。（收 S8–S11、A9、A10）
- **N18 路由三件套登記**｜加 `content_publish`（high、要核准）、`member_email`（high、要核准）。｜Low｜fullstack-engineer（Sonnet）｜檔案：`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`、`lobster-factory/workflow-risk-matrix.json`、`lobster-factory/docs/ROUTING_MATRIX.md`（同一 commit）。
- 既有未修、照原編號併入本批：**B19**（社群編輯時區）、**B24**（每組織只推 3 支）、**B25**（靜止片預篩）、**B26**（續接先重出片）、**B1**（發布頁合併多比例）、**R1**（Remotion 封面模板，待決 5）。
- 2026-11-20 第一則真發布實測後加入：**T1**（實測找到的四個介面問題）、**T2**（Instagram 主題標籤上限 30）、**T3**（標題空格檢查之前做好的文章不自動發）。同日操作者加開：**R2**（片首封面：封面做成開場並轉場進正片，自動與手動都能加；派工單 `briefs/R2-cover-opener.md`）。**R3**（橫幅工具當積木：橫幅字卡當片頭，接在 R2 之後）。

拆不下去的：N5 原本一張，估 1.5–2 天（狀態機＋貼文拆分＋文章換連結）→ 已拆 N5a／N5b。

## 9. 發布安全

- 絕對不能自動：寄出會員信（新 5）；把站切成自動發布（員工手動，逐站）；改已上線文章（Bridge 本來就拒，`embed-in-post.ts:259-262`）；Soulful 的任何對外發布（維持人工審核）。
- 預設值（已定 O6）：每題上限 NT$15；每天最多開始 1 題（現預設 2，`tick.ts:15`）；每天最多提 3 題；相關性門檻 70；會員信每站每週一封草稿；YouTube 預設公開；`topicMode`、`publishMode`、每日熱題三個開關預設關（AGENTS §0 自動化預設 OFF）。
- 失敗停點：題目 failed＋`last_error`（中文）→ 既有事件 → Slack `#ops-incidents`／Telegram（N17 改文字）；影片專案另有 Telegram 直送（保留一條，N17 去重）。
- 回滾：每張卡單獨 `git revert`；migration 都附 down（兩處）；部署用 `sg-deploy.sh` 快照回退；已發布內容不自動收回——YouTube 下架、文章改回草稿由人做，步驟寫進 N5a 的驗證檔。
- 上線前閘（流程，不寫程式）：批 0 在監工台標完成前，不把任何站切成 `ai_review_auto`；切換只有員工能做（`make.ts:8-9`）。N1 上線後程式本身就有審片閘，再加一道檢查只會留下沒用的程式。

## 10. 七天上線順序與每天的驗收指令

驗收指令都在 `NA` 目錄跑；psql ＝ `timeout 60 ssh -p 58122 ubuntu@145.239.195.47 "sudo docker exec -i supabase-db psql -U postgres -d postgres"`。部署每次當下要操作者說 go（High）。

| 天 | 卡 | 驗收 |
|---|---|---|
| 1 | N1、N4、N15、N13 | `npx tsc --noEmit && npx vitest run lib/content/topics lib/content/video app/api/tools/designs`；`node ../video-workbench/tests/gate.cjs` |
| 2 | N2（db-expert 先審）、N1b、N14 | 同上＋套 migration（腳本名開卡先 Glob `scripts/apply-db-migration*`）；psql：`select job_id, round(sum(cost_usd)*32,2) from ai_call_logs where created_at>now()-interval '1 day' group by 1;` 每題一列 |
| 3 | N3、N12、N17、N18 | `npx vitest run lib/content/topics lib/script-forge lib/schedules`；repo 根目錄 `node scripts/verify-governance-pointers.mjs`；實點：一鍵到草稿填低於最小值 → 送出前被擋 |
| 4 | N5a | `npx vitest run lib/content/topics lib/social`（假 Postiz：YouTube 錯 → 其餘無動作） |
| 5 | N5b、N6 | `npx vitest run lib/content/video lib/content/topics app/api/content`；部署後 `curl -s -o /dev/null -w "%{http_code}" https://app.aware-wave.com/tools/content/topics` → 200 |
| 6 | N9、N8、N7 | `npx vitest run lib/content/topics lib/schedules`；psql：`select title, count(*) from content_topics where organization_id='<org>' and created_at>now()-interval '90 days' group by 1 having count(*)>1;` → 0 列 |
| 7 | N10、部署、AwareWave 第一則真的發布當驗收（YouTube 不公開，操作者說 go，O4） | `npx vitest run lib/crm lib/schedules app/api/content/newsletter`；psql：`select status, artifacts->'publish' from content_topics where id='<題目>';` 三步都有時間；`curl -s https://aware-wave.com/?p=<id> \| grep -c youtube.com` ≥ 1、`grep -c '\.mp4'` = 0 |

批 4 其餘（N16、B19、B24–B26、B1、R1）排在第 7 天之後，不擋全自動。

## 11. 沒讀到、無法驗證、要操作者決定

已定（2026-11-19，操作者「你決定」；監工定，理由一句）：
- O1 加「發布」鈕（N6）。沒有它，人工審核的站走到已審核就斷線（S7）；有人按才發，記誰按的。
- O2 提案過排定日 7 天自動退回；已審核 72 小時標紅、不自動發（N7）。現況 53 筆提案沒人清。
- O3 會員信每週一封、寄出一律人按（N10）。日更每天寄會被退訂；每週排程本身就是頻率上限，所以原 N11（人數與頻率路由）不做，外掛不用發版。
- O4 不另設測試站（操作者 2026-11-19：只用 Soulful 和 AwareWave，`E2E-Verify-0704` 已不用）。驗收＝AwareWave 第一則真的發布：一個操作者核准的真題目，用 N6 的「發布」鈕發（跟自動發布同一串程式），YouTube 先設不公開；看過沒問題再把站台設定改公開。
- O5 AwareWave 先開每日自動；Soulful 維持人工審核，不開自動發布（`CONTENT_STRATEGY.md:19-21`）。
- O6 每題上限 NT$15、每天 1 題、相關性門檻 70。實測一題 NT$10.2，上限留五成餘裕。
- O7 YouTube 預設公開，改成每站設定（`public`｜`unlisted`），併 N5a。O4 的實測要用不公開，所以不能寫死。

要操作者動手的：第一則發布當下說 go（High）；看過後決定何時把 aware-wave.com 切成自動發布。

沒做到或無法驗證：
- 路線 (a) 一鍵到草稿沒有走完：第一次腳本呼叫後停在上限預留。我在頁面點模型與 AI 生圖時版面位移、沒點中，實際用了 Opus（NT$2.01），加話題 NT$0.014 共 **NT$2.02，超過你給的 NT$2 上限 NT$0.02**；之後沒有再花。點擊數與時間沿用 11-19 10:10 那次（12 點擊、7 分 45 秒）。
- 成本一行的月估是單一樣本外推（腳本 2 次：US$0.0523、US$0.0628；文章 1 次：US$0.2575），不是 30 天平均。
- Slack `#ops-incidents` 最近一則 `video_project_advance`（11-19 09:40 台北）工具只回空白內文；Telegram 沒有讀取工具。通知內容以程式碼判斷（A7），沒看到實際訊息。
- 沒走：Ops Inbox、AI 用量與費用頁、審片與發布面板（沿用 SOP 11-18）、歷史紀錄頁（讀不到內容）、社群設定的 YouTube 連接畫面、WordPress 後台畫面（改用 wp-cli 讀 55、57）。
- 沒量：YouTube 經 Postiz 的每日配額、R2 流量費、FluentCRM 在各站是否啟用與名單人數、FluentSMTP／SES 是否設好、預設 bridge 站是哪一個。
- 作品頁在客戶門（非員工）是否也混客戶，沒測。
- 沒讀：`CODEX-TO-CLAUDE-20261118.md`、兩份 risk-triage、ADR 017 全文（只讀 AGENTS §0 摘要與 ADR 018 標題）、`video-service/pipeline.py`（只 grep freezedetect）、`VW/backend` 的圖庫挑選程式（`stock*.cjs` 不存在，實際在 `scene-image.cjs`／`url-import.cjs`，沒讀）。

本次在正式站留下的東西（都沒對外）：題目 `d67e4a5a…`「工作桌三分鐘整理法」（已審核、只有社群）、社群草稿 `776dc9e4…`（FB＋IG，草稿）、空專案列 `81448cc0…`「一鍵腳本」。要不要刪由操作者定。

## 12. 自審（寫完對一遍）

- 每條結論有證據：§3–§5 每列附 file:line、psql、wp-cli 或實走；§5 發信段的 FluentCRM／Resend 事實來自一個唯讀調查 agent，我抽驗了 `fluentcrm.ts:35-39`、`newsletter/route.ts:14-16`，其餘行號開卡前 grep。
- 每張卡有完成的樣子；N3、N4、N9、N13、N14、N16、N17、N18 不是隱私／發布守衛，所以沒列突變。
- 與不變量對照：N6 是人按、走話題佇列，不違反 PLAN §12「不新增第二個自動發布入口」（O1 已定：加）。N1 讓話題佇列呼叫 `project-advance` 的函式，不改 PLAN §13 C3（`full_auto` 仍只由話題佇列設）。N5b 在發布前換連結，守 Bridge「只改草稿」。沒有提第二套排程、第二套狀態。
- 沒重做 50 項；B 系列與 R1 只引用原編號。
