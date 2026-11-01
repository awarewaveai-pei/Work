# Outbound OS — 工程規格 v2

> 版本 v2.0｜2026-10-31｜取代本檔 v1.0（GPT 草案，原文在 git `26bce3452`，它自述未讀過本 repo）。
> 讀者：執行卡片的 agent。事實密度優先；每個主張附 `file:line`。
> 分工：**規則與契約在本檔**；執行順序與卡片在 [`agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md`](../../handoffs/2026-10-31-outbound-os/R0-PLAN.md) §6；狀態只在同目錄 `data.mjs`（監工台）。
> 正本關係：[v1 integrated spec](COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md) 仍是 12 張 `co_*` 表與 UX 的正本，本檔只寫增量；v1 §E3（n8n 流程）、§G3（路線圖）由本檔 §6、R0-PLAN 取代。[deliverability v3](cold_email_deliverability_compliance_v3_final.md) 仍是寄送規則正本（§6.2 Cold Gate、§11 stream、§12 DNS）。
> 路徑縮寫：`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`、`DB`＝`lobster-factory/packages/db`、`WPB`＝`lobster-factory/packages/wp-bridge-plugin`、`HS`＝`lobster-factory/infra/hetzner-phase1-core/scripts`。

## 0. 定位與不變量

**定位**：冷信的工作是換到一個回覆，不是介紹產品。系統負責找證據、寫信、守規矩、讀回信、記成效；量產模式（D21）＝多個次網域、多個信箱、暖機表、輪流寄、系統自動寄；單信箱草稿模式只用於暖機期間的試寫。品牌＝organization，多品牌＝多 org，今天就能跑。

| # | 不變量 | 守在哪 |
|---|---|---|
| I1 | 品牌＝organization；沒有第二個租戶軸 | ADR 017 §0 三軸；`NA/lib/outreach/use-active-org.ts:4-6`；每條路由 `assertOrgAccess`（`NA/app/api/outreach/messages/route.ts:109`） |
| I2 | 冷信每個具體主張對得到一條 approved 證據；沒有證據不生成 | `co_evidence`（§4）；`NA/lib/outreach/cold-gate.ts` `checkColdGate` |
| I3 | `send_mode='draft'` 時程式不呼叫任何 send 端點。scope `gmail.compose` 本身允許 `drafts.send`，守衛是程式與測試，不是 scope | C1.1 `never-sends.test.ts`；唯一白名單 `send-adapter.ts`（C8） |
| I4 | 冷信純文字、無圖、無附件、無追蹤像素、≤1 連結、有拒收句；開信率不是指標 | deliverability §6.2（`cold_email_deliverability_compliance_v3_final.md:247-284`）；`lintMessage`（`cold-gate.ts:63-99`） |
| I5 | 回信、退訂、退信、拒絕、人工停止 → 該 lead 所有後續步驟立即停（`next_followup_date=null`） | `gmail-sync.ts`（C4） |
| I6 | 建草稿與寄出前重查：拒收名單、`do_not_contact`、每日上限 | `NA/app/api/outreach/messages/gmail-draft/route.ts`（C1.2）；`send-adapter.ts`（C8） |
| I7 | 抓到的網頁永遠是 SOURCE_QUOTATION，進 prompt 前包裹，不當指令 | `NA/lib/collect/provenance.ts:1-20`；`brand-context.ts`（C2.2） |
| I8 | 付費 AI 只經 `NA/lib/ai/gateway.ts` 與 `can()` grant；金鑰只在 vault | ADR 017 §4；`NA/app/api/outreach/messages/route.ts:139-164`；migration 0049 |
| I9 | 幾秒的工作＝next-admin route；幾分鐘＝Trigger.dev 任務；定時＝主機 cron；n8n 不在路徑上 | §6；`agency-os/handoffs/2026-10-25-schedules-off-trigger/R0-PLAN.md:9` |
| I10 | 量只從信箱數來：單信箱日上限＝暖機表，絕不靠調高一個信箱的上限換量；主網域 aware-wave.com 永不寄冷信 | `co_sender_accounts.daily_limit`／`warmup_stage`（`0048:241-244`）；D12、D21 |

## 1. 現況（2026-10-31 查證）

| 步驟 | 頁面 | 狀態 | 證據 |
|---|---|---|---|
| 0 服務介紹 | `settings/service-profiles` | 可用 | `co_service_profiles`（`DB/migrations/0048_co_outreach_core.sql:28-50`）：positioning、usp、tone、forbidden_words、proof_links、compliance_rules |
| 1 匯入 | `inbox` | 可用 | `NA/app/api/outreach/inbox/route.ts`：normalize → dedup → suppression → 機械評分 |
| 2 評分 | `leads` | 可用，純機械 | `NA/lib/outreach/scoring.ts:1-6` |
| 3 產冷信 | （Review 頁） | 可用但偏 | 主旨固定 null（`NA/app/api/outreach/messages/route.ts:209`）；無署名；`positioning` 讀了未用（`:123`）；一封一版（`buildPrompt :48-66`）；AI 階梯 claude→openai→gemini→gemini_agency→manual（`:131-164`） |
| 4 審核 | `review` | 可用 | `NA/app/(shell)/outreach/review/ReviewClient.tsx` |
| 5 Gmail 草稿 | `review` | 可用 | `NA/app/api/outreach/messages/gmail-draft/route.ts`：只存 `draft.id`（`:186`）；只檢查 `status==='approved'`（`:65`），不重查拒收；2026-10-14 正式站建 1 封 |
| 6 追蹤 | `followups` | 只有日期 | `NA/app/api/outreach/followups/route.ts:6-8` |
| 7 回覆 | `replies` | stub | `NA/app/(shell)/outreach/replies/page.tsx` |
| 8 成效 | `/outreach` | stub | `NA/app/(shell)/outreach/page.tsx` |
| — 研究 | 無 | 人工填 | `co_leads.observation`、`source_url` 各一格（`0048:95-96`） |
| — 暖名單 | 無 | wp-bridge 無 contact 端點 | `WPB/includes/Http/RestController.php:42-105`：只有 health／option／post／product／woo／newsletter／blocks |
| — 信箱池 | `connectors` | 只有 1 個消費者 Gmail | `co_sender_accounts.daily_sent_count`／`weekly_sent_count`／`warmup_stage`（`0048:242-244`）存在、0 呼叫點；無次網域、無輪流 |
| — Gmail 連線 | `connectors` | Testing 模式 | scope `gmail.compose`（`NA/lib/outreach/google-oauth.ts:11`）；restricted scope 在 Testing 狀態 refresh token 7 天到期（C1.4 查） |
| — 未用的表 | — | 0 呼叫點 | `co_timeline_events`、`co_connector_usage`、`co_verified_emails`（`NA/lib/outreach/MODULE_MANIFEST.json` state_ownership） |

**GPT 草案 vs 已有資產**（草案換名字再做一次的部分）：

| GPT 提的 | 我們已有 | 處置 |
|---|---|---|
| `brand_id`、brands、brand_memberships | organizations＋`?org=`（`use-active-org.ts:16-20`） | 不加（I1） |
| job_queue＋獨立 Worker | Trigger.dev 工人、主機 cron 時鐘 | 不建（I9） |
| companies／contacts／deals／pipelines／tasks／meetings | `co_leads.status` 已是 pipeline（`0048:106-108`）＋`co_timeline_events` | 不建 |
| ai-router.ts | `NA/lib/ai/gateway.ts`、`text-model-options.ts`、`cheap-json.ts:33`、`log-ai-call.ts` | 不建 |
| send_attempts／email_events／mailboxes／suppression_entries | `co_sending_events`（`0048:257-277`）、`co_sender_accounts`（`:234-255`）、`co_suppression_list`（`:167-186`，scope 含 global） | 沿用 |
| research_jobs／research_evidence＋自建抓取 | `NA/lib/collect/collectors/entity-dossier.ts:1`、`NA/lib/collect/provenance.ts:1-20`、`NA/lib/collect/net/providers.ts:69-85`（Brave／Serper）、`NA/lib/collect/budget.ts` | 只加一個 sink（ADR 011；`NA/lib/collect/index.ts:3-7`） |
| `/api/brands/:id/...` | `/api/outreach/*?organizationId=`；ADR 018 門 `NA/lib/portal/products.ts:86` | 不改 |
| NestJS、Redis+BullMQ、S3、Microsoft Graph、HubSpot、視覺化流程編輯器、五種 RBAC 角色 | — | 不做（§9） |

## 2. 決策

| # | 決策 | 為什麼（證據） |
|---|---|---|
| D1 | 品牌＝organization | ADR 017 §0 只有三軸；加軸＝「新方式不改程式」被破 |
| D2 | 不建 queue／Worker | `agency-os/handoffs/2026-10-25-schedules-off-trigger/R0-PLAN.md:47`「時鐘搬主機 cron，Trigger 只當工人」；新服務要齊 7 項（AGENTS.md §0） |
| D3 | 不建 CRM 表 | `co_leads.status` 已含 replied→proposal_sent→meeting_booked→warm→customer／lost |
| D4 | 不建 ai-router；研究／分類走 `generateCheapJsonText`，草稿走既有階梯 | `NA/lib/ai/cheap-json.ts:33`；`NA/app/api/outreach/messages/route.ts:131-164` |
| D5 | 沿用 `co_sending_events`／`co_sender_accounts`／`co_suppression_list`，不改名 | 改名＝重工零收益 |
| D6 | 研究＝collect 的 entity-dossier 來源＋新 sink | `entity-dossier.ts:1`「給一間公司把背景資料收齊」；耦合只在 sink（`NA/lib/collect/index.ts:3-7`） |
| D7 | API 路徑不變 | `use-active-org.ts:16-20` |
| D8 | 寄出方式＝`co_sender_accounts.send_mode` draft｜auto，預設 draft；翻 auto 每帳號 High；緊急停＝`health_status='paused'`（`0048:245`） | 兩種模式都需要同一個引擎（排程、等待、回信即停），差別只在最後一步誰按；同 `ENTITLEMENT_MODE` shadow→enforce 的做法（ADR 017 §4） |
| D9 | 序列固定形狀：首封 A／B＋N 封追蹤＋回信即停；步驟帶 `channel`；不做畫布 | 唯一條件是「有回信？」（I4 禁追蹤，無開信／點擊可分岔）；序列在 DB 已是一列一列（`co_messages.version`，`0048:143`）；第二種條件等 50 封真實回信後再議 |
| D10 | 回信後＝人工對話：Replies 頁 AI 分類＋按鈕，不是序列分岔 | 對剛開口的人不能排罐頭信；v1 §B6 九種 `reply_type` 已設計 |
| D11 | 冷信零追蹤；暖信統計看 FluentCRM | Apple Mail 預載圖片、Outlook 擋圖、安全閘道假點擊；deliverability §6.2 |
| D12 | 冷信寄件身分＝AwareWave 自有的**次網域信箱池**：一個 Workspace 租戶掛多個次網域（例：awarewave.tw、aware-wave.co），每網域 2 個信箱，每信箱一列 `co_sender_accounts`（`provider='gmail'`、`stream_type='cold'`），掛在它服務的 org。主網域 aware-wave.com 只寄暖信與系統信，永不寄冷信；**禁止**在消費者 Gmail 設「以 @aware-wave.com 寄出」。代操客戶有自己的 Google 信箱就連它（客戶授權）；沒有（Soulful＝Hostinger）就用池裡掛給該 org 的信箱，`display_name` 寫客戶品牌。已連線的 `awarewaveai@gmail.com` 只做暖機期間的試寫，不進量產池。署名預設＝`display_name`＋org 名稱，網站那行操作者填一次 | 量只能從信箱數來（I10）；次網域壞了不傷主網域（deliverability §11.2 stream 不混用）；aware-wave.com SPF 無 google include、DMARC `p=quarantine`（DNS 2026-11-01）→ 消費者 Gmail 代寄會被隔離；soulfulexpression.org MX `mx1.hostinger.com`／`mx2.hostinger.com`（同日）；Workspace 每帳號 2,000 封／天、試用 500（knowledge.workspace.google.com「Gmail sending limits」2026-10-26 版）；organizations 無網站欄（`DB/migrations/0001_core.sql`）。成本≈US$7／信箱／月＋網域年費，官方頁為準 |
| D13 | Google OAuth 專案改「已發布、未驗證」。操作者唯一動手：C4.2 重新授權前在 Console 按一次「發布」 | 7 天到期只寫在 Testing（developers.google.com/identity/protocols/oauth2「Refresh token expiration」）；「內部」使用者類型要 Workspace 組織，沒有；未驗證＋restricted scope（`gmail.compose`、`gmail.readonly` 皆 restricted，support.google.com/cloud/answer/13464325）上限 100 位新使用者、專案終身計（answer/13463817），自用＋代操用不到；授權入口 ops-role 閘＋HMAC state（`NA/app/api/outreach/connectors/gmail/authorize/route.ts`），外人拿不到同意畫面。回頭條件：開「賣」模式前做 restricted scope 驗證 |
| D14 | n8n 不在路徑；v1 §E3 superseded；整台去留另案 | 5 條 workflow 全 `active:false`（2026-10-31 查）；T10 已改 next-admin route（`agency-os/TASKS.md:1176`） |
| D15 | 不加依賴：JSON 守衛手寫（repo 無 zod） | `NA/package.json` 無 zod；`cheap-json.ts:29` 已有 `extractJsonArray` 慣例 |
| D16 | FluentCRM 同步走**既有 CRM 接頭** `NA/lib/crm/fluentcrm.ts`（ADR 017 §4 `crm: fluentcrm`），加一個 `upsertContact()`，走同一條簽章＋system-mode 閘的 `bridgePost`；不另寫 bridge 呼叫。目標站＝bridge 連線由環境變數定（預設＋`WPBRIDGE_SITE_<i>_*`，`clientId`），org → `clientId` 用該 org active `wp_sites.url` 的 host 對上已設定的 bridge base URL；對不到 422 `no_bridge`。C6 parked | `NA/lib/crm/fluentcrm.ts:1-2`（adapter，今只有 `createNewsletter`）；`NA/lib/payments/woo.ts:12-22`（多站＝env，私鑰不進 DB）；`NA/app/api/content/newsletter/route.ts:173,207`（今只用預設站）；`DB/migrations/0039_wp_sites.sql`（`url`、`active`）、`0061_wp_sites_add_org.sql:36`（`organization_id`）；bridge `/health` 不報 FluentCRM（`RestController.php:128-150`），有沒有裝由 `fluentcrm_not_active` 回應判。回頭條件：某品牌有回信的 lead，且該品牌的站裝了 wp-bridge＋FluentCRM；aware-wave.com 只留 WordPress（操作者 2026-10-30），不接回 |
| D17 | 自動寄＝量產模式的主路徑：C8 解除擱置，排在 C4、C11 之後。每個信箱的 `send_mode` 仍預設 `draft`；暖機表到第 2 週且 `hard_bounced`／`sent` < 2%、無 Gmail 拒收事件，才由操作者翻 `auto`，一次一個 | 300 封／天沒有人手按得完；不變量不變：每封有紀錄、寄前重查、任一信箱 `paused` 即停（I3、I5、I6）。「0 投訴」不列：Gmail 不向寄件人揭露檢舉 |
| D19 | 頭的最後一哩兩件事都純程式、零供應商：①研究時從店家網站抓 email（`mailto:` 與內文，優先與網站同網域），寫 `co_leads.email`＋timeline `email_found{source_url}`；②匯入與建草稿前做 MX 查核（`node:dns/promises resolveMx`），結果快取 `co_verified_emails`，`invalid` 不建草稿。Hunter 等 SMTP 級驗證留槽位 | 今天沒有任何程式抓 email，匯入無 email／電話／社群即 `no_contact`（`NA/app/api/outreach/inbox/route.ts:37`）→ 找名單的產出寄不出去；`scoreContactability` 早留 `emailVerified` 分數（`NA/lib/outreach/scoring.ts:62`）、`co_verified_emails`（`0048:295`）0 呼叫點、router `mx_syntax` 只有名字（`NA/lib/outreach/connectors/router.ts:28`）。回頭條件：`hard_bounced`／`sent` > 2% 才接 Hunter（`NA/lib/outreach/connectors/router.ts:26`） |
| D18 | 名單發現用 Serper `/places`（既有 `SERPER_API_KEY`），不用 Google Places API | 決定性原因是條款：Google Places 政策「不得預先抓取、快取或儲存 Places 內容，例外只有 place ID」（developers.google.com/maps/documentation/places/web-service/policies），名單庫要存名稱、網站、電話，等於違反；且需啟用帳單帳戶、含電話／網站的 SKU＝Text Search Enterprise $35／千次（免費 1,000／月）。Serper 回 title／address／phoneNumber／website／rating／cid，沒有營業時間與評論——那是研究（C3 爬網站）的事，不是找名單的事。Serper 已是 collect 預設供應商（`NA/lib/collect/net/providers.ts:76-89`），只鎖 `/search` 是因為沒有別的呼叫者；C10 就是那個呼叫者。換供應商＝`providers.ts` 一個 entry＋一個 parser（`:63-66` 註解） |
| D20 | 名單對象三種：公司行號（經濟部商工登記開放資料）、公司裡的人（公司網站、徵才頁、搜尋引擎公開摘要＋email 推斷＋付費驗證）、個人（搜尋引擎已索引的公開簡介、對方自己的網站、操作者手動貼）。**不寫任何爬 IG／Facebook／LinkedIn 頁面的程式**。個人 email 蒐集依據＝個資法 §19 第 1 項第 7 款（一般可得之來源）；首次行銷附免費拒絕方式（§20 第 3 項）＝拒收句＋`List-Unsubscribe`；當事人拒絕即停（§20 第 2 項）＝suppression；資料來源告知（§9 第 1 項）由 Cold Gate 的 observation＋source_url 結構保證，當事人自行公開者免告知（§9 第 2 項第 2 款） | 商工登記 API `https://data.gcis.nat.gov.tw/od/data/api/<id>?$format=json&$filter=…&$top≤1000`：營業項目代碼表 `FCB90AB1-E382-45CE-8D4F-394861851E28`（依 `Business_Item` 列公司）→ 應用一 `5F64D864-61CB-4D0D-8AD9-492047CC1EA6`（`Company_Name`、`Business_Accounting_NO`、`Responsible_Name`、`Company_Location`、`Capital_Stock_Amount`）→ 應用三 `236EE382-4942-41A9-BD03-CA0709025E7C`（`Cmp_Business`）；來源 IP 白名單需申請、每日次數有上限但未公布數字（/od/rule）；政府資料開放授權第 1 版、須顯名（/main/terms）；個資法條文 law.moj.gov.tw pcode=I0050021（2026-11-01 讀）；平台條款禁爬＝違者連接器被封、整條線停 |
| D21 | 第一階段目標 **300 封／天**（操作者 2026-11-01 定）＝3 個次網域 × 2 信箱 × 50。暖機表每信箱：第 1 週 10、第 2 週 20、第 3 週 35、第 4 週起 50（不超過 `daily_limit`）；不用暖機服務（假互動抬信譽，Google 寄件者規範反對）；全部信箱同一視窗台北 09–18 週一至五，tick 內平均分配加抖動；追蹤信固定用首封的信箱（同一對話串） | 回覆率 1–5% → 每天 3–15 封回信，Replies 頁一人可消化；300 以上＝再加網域與信箱，不改程式（I10） |

## 3. GPT 企業版 12 模組對照

| 模組 | 處置 | 落點 |
|---|---|---|
| 01 多品牌工作區 | 有 | organizations＋`?org=`；跨 org 全看＝ops-role（`NA/lib/ops-role.ts:120-124`） |
| 02 Lead discovery | 卡 C10、C12、C13 | 店家＝Serper `/places`（D18）；公司＝商工登記（D20）；人＝搜尋引擎公開摘要＋email 推斷＋付費驗證（D20） |
| 03 Enrichment | 卡 C1.5、C3.7 | email 從網站抓＋MX 查核（D19）；`co_evidence` 兼任其他事實；Hunter／Snov 槽位（`NA/lib/outreach/connectors/router.ts:26-27`）等退信率觸發 |
| 04 AI research & personalization | 卡 C2、C3 | brand-context＋evidence |
| 05 Email infrastructure | 卡 C11、C8 | 次網域信箱池、DNS 自動檢查、暖機表、輪流寄、自動寄（D12、D21）；DNS 清單 deliverability §12 |
| 06 Campaign／sequence builder | 卡 C2、C5 | 固定形狀；不做畫布（D9） |
| 07 Unified inbox | 卡 C4 | Replies 頁列全 org |
| 08 Multichannel | 卡 C5.4 | `channel≠email` 步驟＝人工待辦；LinkedIn／IG 不自動 |
| 09 CRM & pipeline | 有 | `co_leads.status`＋timeline；不做 HubSpot |
| 10 Analytics | 卡 C7 | 自己的表；無開信率 |
| 11 Compliance & deliverability | 有＋卡 C1 | suppression、`List-Unsubscribe`、每日上限、寄前重查 |
| 12 API & automation | 有 | internal route＋cron；對外 REST 等「賣」模式 |

## 4. 資料模型增量（只列 delta；全表定義見 v1 §B）

| migration | 內容 | 卡 |
|---|---|---|
| `0149_outbound_v2_expand` | `co_sender_accounts.signature_block text`；`co_messages.followup_delay_days int`、`co_messages.gate_snapshot jsonb` | C2.1 |
| `0150_co_evidence` | `co_evidence(id, organization_id, lead_id FK cascade, claim, source_url, excerpt, source_label, captured_at, source_date, confidence, status pending／approved／rejected, created_by, created_at)`；RLS service-role 照 `0048:5-11`；index `(lead_id, status)`；唯一 `(lead_id, source_url, claim)` | C3.1 |
| `0151_co_replies` | v1 §B6 欄位＋`gmail_message_id text unique`、`received_at`、`classified_by` | C4.1 |
| `0152_sender_pool` | `co_sender_accounts`：`send_mode text default 'draft' check (draft／auto)`、`daily_count_date date`（配既有 `daily_sent_count`，`0048:242`）、`warmup_started_at date`、`dns_status jsonb`、`dns_checked_at timestamptz`、`connector_id uuid references co_connector_accounts(id)`（以 email 回填；OAuth callback 建帳號時直接填）；`co_messages.status` CHECK 加 `sending` | C8.1 |
| 不加欄 | thread 對應存 `co_sending_events.metadata={threadId, messageId}`（`0048:273` 已有 jsonb） | C4.2 |
| contract（parked） | `co_leads.observation`／`source_url` 停寫，由 evidence 取代；欄位不刪 | C9 |

號碼以當時最大＋1 為準。Down 檔兩處：`DB/migrations/<n>_<name>.down.sql` 與 `DB/scripts/<n>_<name>_down.sql`（0147、0148 慣例）。

## 5. 流程契約

### 5.1 研究（C3）
輸入 lead 的 `name`、`website`、`social_url`。seeds＝website 與 social_url 各一（`scope` 該 host、`meta.entityName=name`、`meta.anchors=[name]`）→ `crawl(seeds, {sink: outreach-research, budget ≤15 頁／60 秒, callProvider: serper 若已設, maxDepth: 2})`（`NA/lib/collect/orchestrator.ts:254`；`maxDepth` 含種子頁，2＝首頁＋一層，`:404`）。非同步＋輪詢照 `/ops/collect`（`NA/app/api/ops/clients/[slug]/collection-sources/route.ts:106`、`NA/lib/collect/run-jobs.ts`）。sink 對每份已過品質閘與 provenance 篩查的 doc 呼叫 `generateCheapJsonText` 抽 ≤3 `{claim, excerpt}`；`excerpt` 必須是 `doc.text` 的子字串（機械驗，不符丟棄）；寫 `co_evidence` pending（`source_url=doc.canonicalUrl`、`source_label=doc.collector`、`source_date=doc.publishedAt`）。同一個 sink 另做純程式的 email 抓取（D19）：`mailto:` 與內文的 email，優先與網站同網域，`co_leads.email` 為空才填，寫 timeline `email_found{source_url}`，並做 MX 查核。0 claim → timeline `research_insufficient`，不生成。費用：grant `outreach.research` 傳進 `generateCheapJsonText`（它今天固定用 `ops.cheap-json`，`NA/lib/ai/cheap-json.ts:40`、`:86`，C3.2 加選用 `grant` 參數），按鈕顯示估價（`NA/lib/ai/cost-model.ts`）。

### 5.2 證據審核
Leads 頁列 pending 證據，approve／reject 兩顆按鈕。Cold Gate 通過＝≥1 approved evidence；過渡期舊 `observation+source_url` 亦通過，C9 收掉。

### 5.3 產文（C2）
組裝順序（`brand-context.ts`）：全域安全規則 → 產業規則（`compliance_rules`、`sensitive_industry_type`、`forbidden_words`）→ 服務定位（`positioning`、`usp`、`target_problems`、`price_position`）→ 寄件身分（`signature_block`，AI 不得改寫）→ 證據（approved claims，每條包 SOURCE_QUOTATION，附 evidence id）→ 目標（換到回覆：低壓 CTA＋拒收句；「我做了一個給你」只在真有產出時）→ 輸出格式。

輸出 JSON（`generation-schema.ts` 手寫守衛）：
```json
{ "subjects": ["…", "…"],
  "bodies": [ { "label": "A", "text": "…", "evidence_ids": ["…"] }, { "label": "B", "text": "…", "evidence_ids": ["…"] } ],
  "followups": [ { "step": 2, "delay_days": 3, "text": "…" }, { "step": 3, "delay_days": 5, "text": "…" } ] }
```
壞 JSON 允許 1 次修復重試，再失敗走既有 `manual_prompt`。寫列：2 列 `cold_email`（`variant_label` A／B、`subject`、`version=1`）＋N 列 `followup`（`version=step`、`followup_delay_days`、`subject=null`）。每列 `lintMessage`＋主旨 lint（≤25 字、無 `HARD_CTA`、無「免費」「限時」）→ `safety_score`、`quality_gate_status`、`gate_snapshot={gate_version, findings}`、`evidence_snapshot={evidence_ids}`。內文必須以 `signature_block` 結尾（lint）。

### 5.4 審核與草稿（C1、C2、C4）
Review 頁 A／B 並排，核准一版（另一版 `skipped`）。建草稿前重查 I6（`do_not_contact`、`isSuppressed` applies_to cold／all）→ 409。MIME：`Subject`（RFC 2047）、`List-Unsubscribe: <mailto:…>`（RFC 2369）；`drafts.create` 回 `{id, message:{id, threadId}}` → `co_sending_events` `draft_created` 的 `metadata={threadId, messageId}`。

### 5.5 寄出接頭與信箱池（C8、C11）
`send_mode='draft'`：到此為止，人在 Gmail 按。建草稿時就選信箱（§5.4 的 `gmail-draft`）：首封選該 org `is_active ∧ health_status='healthy'` 中「今日已寄／今日上限」最低的信箱（輪流寄），追蹤信固定用上一封 `co_sending_events.sender_account_id` 的信箱（同一對話串）；草稿建在該信箱的 connector（`connector_id`），事件記 `sender_account_id`。今日上限＝暖機表（`warmup_started_at` 起第 1／2／3／4+ 週＝10／20／35／min(50, `daily_limit`)）。

`auto`：sync tick 末尾，對每封 `approved ∧ drafted` 且其信箱 `send_mode='auto'` 的信：①台北 09–18 週一至五，tick 配額＝該信箱剩餘上限／今日剩餘 tick 數，加 0–120 秒抖動；②重查 I6（`do_not_contact`、suppression、`co_verified_emails` 非 invalid）；③compare-and-set 佔信箱名額（`daily_sent_count`＋`daily_count_date`，0 列更新＝已滿或被搶先）；④`UPDATE co_messages SET status='sending' WHERE id=$1 AND status='drafted'` 鎖信 → `drafts.send` → `sent`＋事件。逾時／5xx 留 `sending`，下一 tick 以 `threads.get` 的 `SENT` label 對帳；30 分未對到 → `needs_edit`＋timeline；永不盲目重寄；寄失敗不退名額。Gmail API 回配額／拒收類 4xx → 該信箱 `health_status='paused'`＋timeline＋推播，其餘信箱照常。

信箱池健康（C11）：每日 cron 對每個 cold 信箱的網域查 SPF（含 `_spf.google.com`）、DKIM（`google._domainkey`）、DMARC；寫 `dns_status`／`dns_checked_at`；缺項 → `warning`＋timeline；連續 2 天缺 → `paused`。

### 5.6 回覆同步（C4）
scope＝`gmail.compose`＋`gmail.readonly`（不含 send／modify）。**不變量：來信靠寄件人地址認人，不靠我們建的對話串**——對方可能另開新信、用 `List-Unsubscribe` 寄來一封主旨 `unsubscribe` 的信、或在 lead 標 `no_reply` 之後才回。每 10 分、每個啟用 connector 兩段：
- **已寄偵測**（靠 thread）：`co_messages.status ∈ {drafted, sending}` 且事件有 `threadId` → `threads.get?format=metadata`；本方訊息帶 `SENT` label → `sent`、`sent_at`、事件 `sent`、lead `status='sent'`、`last_contact_date`、`next_followup_date=sent＋下一封 followup_delay_days`。
- **來信比對**（靠地址）：`messages.list?q=in:inbox newer_than:7d -from:me` → `messages.get?format=metadata`（From、Subject、In-Reply-To、X-Failed-Recipients）→ 寄件人 email 小寫比對同 org `co_leads.email`，不論 lead 狀態 → upsert `co_replies`（`gmail_message_id` 唯一，重跑冪等）。主旨 `unsubscribe` 直接判 `unsubscribe`；其餘 `generateCheapJsonText`（grant `outreach.classify`）分類 `reply_type`（interested／pricing／more_info／case_study／wrong_contact／has_vendor／no_need／reject／unsubscribe）＋`suggested_response` → lead `status='replied'`、`next_followup_date=null`、`consent_status` 由 `unknown`／`legitimate_interest` 升為 `replied`（不降級）；`unsubscribe` → `consent_status='unsubscribed'`＋suppression `unsubscribe`＋`do_not_contact`；`reject` → `consent_status='do_not_contact'`＋suppression `manual_opt_out`＋`do_not_contact`。`From` 含 `mailer-daemon` → 以 `X-Failed-Recipients` 找 lead → 事件 `hard_bounced`＋suppression `hard_bounce`＋`do_not_contact`。
- 7 天視窗夠用：同步停超過 7 天時 `/ops/schedules` 那列早已變紅並推播（`NA/lib/schedules/host-jobs.ts` 登記，C4.5）。
全部寫 `co_timeline_events`。Replies 頁按鈕：產報價摘要（`output_type=proposal_summary`）、問正確窗口、加入拒收、同步 FluentCRM、約到會議、成交、失去。

### 5.7 追蹤（C5）
Follow-ups 頁＝`next_followup_date ≤ 今天` ∧ `status='sent'` 的 lead＋下一封 followup 列。建草稿：MIME 加 `In-Reply-To`／`References`＝本方上一封 `Message-ID`（`threads.get` headers），`drafts.create` 帶 `threadId`（回同一串）。最後一封寄出後經其 `followup_delay_days` 無回信 → `no_reply`；`no_reply` 不是同步終點，之後來信照 §5.6 改成 `replied`。`channel≠email` 步驟＝待辦＋完成按鈕。

### 5.8 暖名單（C6）
資格＝`consent_status ∈ {replied, opted_in, form_submitted, customer}` ∧ 非 suppression（marketing／all）。呼叫該 org 站 wp-bridge `POST /fluentcrm/contact`（signed write）upsert contact＋lists／tags → `fluentcrm_contact_id`、`fluentcrm_sync_status='synced'`、`fluentcrm_last_synced_at`、timeline；不合格 422。冷名單不是訂閱者。

### 5.9 成效（C7）
依 org × service_profile × `variant_label` × `angle`：generated（`co_messages`）、drafted、sent、bounced（`co_sending_events`）、replied、positive（`reply_type ∈ interested／pricing／more_info／case_study`）、meeting_booked、customer、lost（`co_leads.status`）。回覆率＝replied／sent；正向率＝positive／sent。無開信率。

## 6. 排程與執行

| 工作 | 頻率 | 跑在哪 | 登記 |
|---|---|---|---|
| 研究 run | 按鈕 | next-admin in-process 非同步（照 `/ops/collect`）；預算 ≤60 秒故不進 Trigger | — |
| Gmail 同步＋auto 寄出（輪流寄，§5.5） | `*/10` | 主機 cron → `HS/poke.sh` → `/api/internal/outreach/gmail-sync`（Bearer `OUTREACH_SYNC_TOKEN`，照 `NA/app/api/internal/schedules/alerts/route.ts:21-25`） | `HS/cron.d/awarewave-schedules`；`NA/lib/schedules/host-jobs.ts` `outreach_gmail_sync` |
| 信箱池 DNS 與健康 | 每日 1 次 | cron → `/api/internal/outreach/sender-health`（§5.5；同 token 模式） | 同上；`outreach_sender_health` |
| 追蹤到期 | 頁面讀時算 | — | — |
| 成效 | 頁面讀時算 | — | — |
| n8n | — | 不在路徑 | — |

## 7. 安全與合規

- scope：`gmail.compose`＋`gmail.readonly`；測試禁 `gmail.send`／`gmail.modify`／`mail.google.com`；程式不呼叫 send 端點（I3）。
- Google 專案發布狀態：已發布、未驗證（D13）；token 失效（改密碼、撤銷、6 個月未用）時 C4.5 那列在 `/ops/schedules` 變紅並推播。
- token／API key：vault（0049）；`co_connector_accounts.credentials_ref` 只存參照。
- Prompt injection：抓到的內容走 `provenance.ts` 篩查與標記；證據包 SOURCE_QUOTATION；excerpt 子字串驗證擋掉模型編造的「原文」。
- 同意：冷信＝`legitimate_interest`；只有 §5.8 四種 consent 才進 FluentCRM。
- 退訂：內文拒收句＋`List-Unsubscribe` mailto；一鍵退訂（RFC 8058）要 HTTPS 端點，冷信人工低量用不到，不做。
- 速率：每信箱暖機表（D21）、台北 09–18 視窗、任一信箱 `paused`／`blocked` 只停該信箱；Gmail API 拒收事件自動 `paused`＋推播。
- 個資與平台條款：D20——只用搜尋引擎已索引、對方自有網站、商工登記、操作者手動貼的資料；不爬社群頁面；首信必含來源與免費拒絕方式。
- 資料：`co_evidence`、`co_replies` 隨 lead cascade 刪除；無軟刪。

## 8. KPI

| 指標 | 定義 | 來源 |
|---|---|---|
| 回覆率 | replied／sent | `co_replies`、`co_sending_events` |
| 正向回覆率 | positive／sent | `co_replies.reply_type` |
| 會議率、成交率 | meeting_booked／sent、customer／sent | `co_leads.status` |
| 退信率 | hard_bounced／sent | `co_sending_events` |
| 有證據的信比率 | `evidence_snapshot.evidence_ids` 非空／generated | `co_messages` |
| 每封研究成本 | `outreach.research` 用量 | `ai_call_logs` |
| 每信箱健康 | 退信率、拒收事件、暖機週、今日已寄／上限 | `co_sender_accounts`、`co_sending_events` |

## 9. 不做

`brand_id`；job queue／Worker；CRM 六表；HubSpot；Microsoft Graph；NestJS；Redis／BullMQ；S3；視覺化流程編輯器；開信／點擊追蹤；LinkedIn／IG 自動化；Resend 寄冷信；SES；Apollo 級資料庫；PostHog 接外聯；n8n；ops-role 之外的角色；暖機服務（假互動）；爬 IG／Facebook／LinkedIn 頁面；調高單信箱上限換量；用 aware-wave.com 寄冷信。

## 10. 卡片與順序

[R0-PLAN.md §6](../../handoffs/2026-10-31-outbound-os/R0-PLAN.md)：C1 守衛 → C2 信本身 → C3 研究＋C10 店家＋C11 信箱池（並行；C11.1 操作者先買網域、開 Workspace）→ C4 回信 → C8 自動寄＋輪流 → C12 公司登記＋C13 人員搜尋（並行）→ C5 追蹤＋C7 成效（並行）。Parked 附回頭條件：C6 暖名單（D16）、C9 舊欄位退場。

## 11. 決定

五項原待決已由規劃者決定（操作者 2026-11-01 授權）：D12 寄件信箱與署名、D13 Google 發布、D16 FluentCRM 目標、D17 auto、D18 名單來源；同日操作者定量產目標 300 封／天 → D21，名單擴到公司與個人 → D20。監工台 OPEN 為空；操作者要動手的事在卡片 C4.2、C11.1、C12.3。
