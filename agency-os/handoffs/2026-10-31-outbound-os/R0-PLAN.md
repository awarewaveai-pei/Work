# 外聯系統 v2：研究→證據→個人化→回信 — R0 七段

> 續接語：續做 外聯系統 v2：讀 `agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md`（規則與契約）與本檔 §6（卡片），從監工台 `data.mjs` 第一張 `not_started` 的卡開始；完成＝該卡 items 全 done 並 commit。建議模型：Opus 5.5（C1／C5／C7／C9／C10 可派 Codex）。
> 規則、不變量、資料模型、流程契約只寫在規格（上面那個路徑，下稱 SPEC）；本檔只寫七段與卡片；狀態只在 `data.mjs`。路徑縮寫：`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`、`DB`＝`lobster-factory/packages/db`、`WPB`＝`lobster-factory/packages/wp-bridge-plugin`、`HS`＝`lobster-factory/infra/hetzner-phase1-core/scripts`。

## 1. 任務理解

- 根本問題：冷信工具只做了中段（評分、寫信、審核、建草稿），頭（AI 自己看對方並留證據）與尾（回信進系統、追蹤信有內容、暖名單進 FluentCRM、看得到成效）沒接；信本身缺主旨、署名、定位、多版本。
- 不變量：SPEC §0 I1–I9。一句：**冷信的工作是換到一個回覆；每個具體主張對得到證據；系統不寄（除非該帳號明示打開）；回信即停。**
- 量產目標 300 封／天（操作者 2026-11-01，SPEC D21；2026-11-06 先買 1 個網域＝100 封／天，SPEC D27）：量從信箱數來——次網域信箱池、暖機表、輪流寄、自動寄；名單擴到公司行號與個人（D20）。
- 操作者的三份輸入：GPT v1.0 草案（git `26bce3452` 原樣）、「研究引擎」補充、「企業版 12 模組」補充。願景全收；與現有架構相撞的技術棧不收（SPEC §2、§3）。

## 2. 現況分析

- git log（核心檔）：`NA/app/api/outreach/messages/route.ts`、`NA/lib/outreach/cold-gate.ts` 最後四次 `e87de9225`（10-20 entitlements）、`0a5b3e7c4`（09-11 uuid guard）、`d146eff7b`（07-02 per-org）、`2fce1cd38`（06-29 IDOR）。文件搬移與草案入庫 `26bce3452`（10-31）。
- 七步現況與證據：SPEC §1 表。摘要：步驟 0–5 可用（2026-10-14 正式站建 1 封草稿）；研究無；主旨空（`NA/app/api/outreach/messages/route.ts:209`）；定位未用（`:123`）；一封一版（`:48-66`）；草稿只存 draft id（`NA/app/api/outreach/messages/gmail-draft/route.ts:186`）、不重查拒收（`:65`）；追蹤只有日期（`NA/app/api/outreach/followups/route.ts:6-8`）；Replies／首頁／Drafts 是 stub。
- 可重用資產：`lib/collect`（entity-dossier、provenance、Serper/Brave、budget）、`lib/ai`（gateway、cheap-json、登記表、成本）、`co_*` 12 表、Trigger 工人＋主機 cron、wp-bridge 簽章寫入。GPT 提的 41 表／job queue／CRM／ai-router／brand_id 全部對應到已存在的東西，SPEC §1、§2。
- 兩個既有說法訂正：scope `gmail.compose` 允許 `drafts.send`，不寄的守衛是程式不是 scope（`MODULE_MANIFEST.json:22` 寫反）；冷信不用主網域 aware-wave.com；量產走次網域信箱池（SPEC D12、D21）——deliverability §11.1 寫「主信箱」的前提是低量，§11.2「stream 不混用」才是不變量。

## 3. 風險清單

| # | 風險 | 處置 |
|---|---|---|
| R1 | Google 專案 Testing 模式＋restricted scope → refresh token 7 天到期，10-14 的連線可能已斷 | C1.4 VBC；SPEC D13 改發布 |
| R2 | 證據改表動到 `co_leads`（prod 有資料） | expand（C3）→ 回填（C9）→ 停寫；不刪欄；migration 套 prod 走閘（High） |
| R3 | 加 `gmail.readonly` 要操作者重新授權 | C4.2 一次，同時按發布（D13） |
| R4 | 研究抓到的網頁是攻擊面（prompt injection） | 走 collect 既有 provenance 篩查；證據包 SOURCE_QUOTATION；excerpt 子字串機械驗（C3.2） |
| R5 | `auto` 寄出重複寄或退訂後仍寄 | 狀態鎖 `drafted→sending`、寄前重查、逾時只對帳不重寄（C8.2） |
| R6 | wp-bridge 外掛更新到客戶站 | C6.2 High，照 release 腳本 |
| R7 | 規格膨脹 | SPEC ≤ 300 行；一事一處；卡只寫做法 |
| R8 | 次網域、Workspace、GCIS 白名單＝外部資產，要操作者動手 | C11.1、C12.3 標 High；程式先做、資產到位才 REALTEST |
| R9 | 個人 email＝個資；社群平台禁爬 | D20：只用搜尋引擎索引、對方自有網站、商工登記、手動貼；研究不爬 `social_url`；非自行公開者首信含 §8／§9 告知行 |
| R10 | 300 封／天的人工把關變成 600 次點擊 | D23：證據自家網站自動核准、訊息 manual→sampled 政策、C15 管線 tick |

## 4. 方案比較

- A 最小：只補主旨、署名、定位三處（C2 的一半）。Rollback：revert 一個 commit。缺：頭尾仍沒接，仍是「把信寫出來」。
- B 完整：C1–C8 八張卡依序，各自獨立 commit、各自 rollback（migration 有 down 檔兩處；route 新檔刪即回復；cron 行刪即回復）；C9／C10 parked。

## 5. 建議方案

B。**第 0 天**操作者啟動 C11.1 採購（網域、Workspace 次網域、使用者），暖機 4–5 週是 300 封的關鍵路徑；程式在兩週內做到能寄（C1–C3、C10、C11.2），信箱一連上就以 w1 上限真實寄送。順序：C1（含 C1.6 scope＋發布，池信箱只授權一次）→ C2 → C3＋C10 並行 → C11（池欄位 migration、連信箱、DNS、健康）→ C4（回信）→ C8（自動寄＋輪流）→ C5（追蹤）→ C15（管線）→ C7（成效）→ C12＋C13 並行。C6、C14、C9、C16 parked，回頭條件在 SPEC D16、D22、D24 與 data.mjs `waitFor`。每張卡完成就能單獨上線，不等整套。

## 6. 實作計畫

### C1 守衛與事實訂正

| 卡號 | 做什麼 |
|---|---|
| C1.1 | `NA/lib/outreach/MODULE_MANIFEST.json:22` 與 `NA/lib/outreach/google-oauth.ts:1-10` 註解改寫：scope `gmail.compose` 允許 `drafts.send`，不寄的守衛是程式；新檔 `NA/lib/outreach/__tests__/never-sends.test.ts`：讀 `lib/outreach/**` 與 `app/api/outreach/**` 原始碼，出現 `/drafts/send`、`/messages/send`、`gmail.send`、`gmail.modify` 即紅（白名單只允許 C8 的 `send-adapter.ts`） |
| C1.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts`：建草稿前重查 lead `do_not_contact` 與 `co_suppression_list`（用 `NA/lib/outreach/normalize.ts` 的 `isSuppressed`，applies_to cold／all）→ 409 `{blocked:true, reason}`；測試：lead 標 do_not_contact → 409 |
| C1.3 | `NA/lib/outreach/google-oauth.ts` `buildRfc2822Message`：加 `List-Unsubscribe: <mailto:<from>?subject=unsubscribe>`（RFC 2369）；測試斷言 header 存在且與 from 一致 |
| C1.4 | VBC：prod `co_connector_accounts` 的 Gmail connector 是否仍能 refresh（`timeout 60 ssh … docker exec … psql` 讀 `updated_at`／`is_enabled`，再對 Google token endpoint refresh 一次，不寫 DB）；結果寫 WORKLOG 與監工台 NOW；失敗＝Testing 7 天到期已發生 → C1.6 立刻做 |
| C1.5 | 新檔 `NA/lib/outreach/verify-email.ts`：`mxStatus(email)`（判定規則 SPEC D19；有 MX＝`unknown`，**不是**信箱存在；逾時 3 秒＝`unknown` 不快取）；`provider='mx_syntax'`；`verifyEmails(orgId, emails[])` 先讀 `co_verified_emails`（`0048:295`，UNIQUE org＋email），沒有的並行 ≤10 查後寫入；只有 Hunter（C13.2）才寫 `valid`。`NA/app/api/outreach/inbox/route.ts:102-143` 匯入時呼叫，`scoreContactability(..., {emailVerified: status==='valid'})`（`NA/lib/outreach/scoring.ts:62`），`invalid` 在 `classify` 視同無 email；`gmail-draft/route.ts` I6 重查加 `invalid` → 409 `email_invalid`。測試：假 resolver 三種結果；REALTEST：匯入一筆不存在網域的 email → `invalid`、`no_contact` |
| C1.6 | scope 與發布（原 C4.2 前半，提前到此讓池信箱只授權一次）：`NA/lib/outreach/google-oauth.ts` `GMAIL_SCOPE` → `gmail.compose`＋`gmail.readonly`；`NA/lib/outreach/__tests__/google-oauth.test.ts:60` 改斷言只含這兩個 scope；部署後操作者兩步：Google Cloud Console → OAuth 同意畫面 → 按「發布應用程式」（SPEC D13）→ Connectors 頁重新連既有的 Gmail 一次 |

### C2 署名、定位、主旨、多版本、追蹤信內容

| 卡號 | 做什麼 |
|---|---|
| C2.1 | `DB/migrations/0149_outbound_v2_expand.sql`（號碼以當時最大＋1）：`co_sender_accounts.signature_block text`；`co_messages.followup_delay_days int`、`co_messages.gate_snapshot jsonb`；`co_service_profiles.privacy_url text`、`review_mode text not null default 'manual' check (review_mode in ('manual','sampled'))`、`review_sample_pct int not null default 10`；`co_leads` 部分唯一索引 `(organization_id, lower(email)) WHERE email IS NOT NULL`（migration 先 SELECT 重複，有就 RAISE 不套）；`co_messages` 部分唯一索引 `(lead_id) WHERE output_type='cold_email' AND status IN ('approved','drafted','sending','sent')`；down 檔兩處（`DB/migrations/*.down.sql`、`DB/scripts/*_down.sql`）；套 prod 走 migration 閘（High） |
| C2.2 | 新檔 `NA/lib/outreach/brand-context.ts`：純函式 `buildBrandContext({profile, sender, evidence, goal})` 依 SPEC §5.3 順序組 prompt 段落；證據以 SOURCE_QUOTATION 包裹；單元測試：缺署名 throw、證據段只含 approved |
| C2.3 | 新檔 `NA/lib/outreach/generation-schema.ts`：`parseGenerationOutput(raw)` 手寫型別守衛（repo 無 zod，不加依賴）：`subjects[2]`、`bodies[2]{label,text,evidence_ids}`、`followups[]{step,delay_days,text}`；壞 JSON 允許 1 次修復重試（把錯誤回給模型），再失敗走既有 `manual_prompt` |
| C2.4 | `NA/app/api/outreach/messages/route.ts`：`buildPrompt` 改呼叫 brand-context；輸出經 generation-schema → 寫 2 列 `cold_email`（`variant_label` A／B、`subject`、`version=1`）＋ N 列 `followup`（`version=step`、`followup_delay_days`、`subject=null`）；每列 `lintMessage`＋主旨 lint（≤25 字、無 `HARD_CTA`、無「免費」「限時」）→ `safety_score`、`quality_gate_status`、`gate_snapshot={gate_version,findings}`、`evidence_snapshot={evidence_ids}`；lead `consent_source` 不是 `self_published:` 開頭時 brand-context 固定加一行個資告知（資料來源、蒐集者、目的、`privacy_url`；SPEC D20），lint 缺告知行＝block；核准依 profile `review_mode`（SPEC D23）：`manual` 逐封，人選 A 或 B（另一版 `skipped`）；`sampled` 時①依 lead id 雜湊奇偶選一版、另一版 `skipped`，②lint `pass`，③新檔 `NA/lib/outreach/claim-check.ts`（`generateCheapJsonText`，grant `outreach.qa`，`NA/lib/portal/products.ts:88` 加 `quota("outreach.qa", "事實核對")`）判斷信中每個關於對方的主張是否被 approved evidence 支持 → `supported` 才自動 `approved`，結果存 `gate_snapshot.claim_check` 並寫 `gate_snapshot.auto=true`；抽樣（`review_sample_pct`）、warn、`unsupported` 進佇列。「前 50 封」＝該 profile `approved_at` 非空且 `gate_snapshot.auto` 不為 true 的 `cold_email` 列數。PATCH 核准撞首封唯一索引（C2.1）→ 409 `variant_already_approved` |
| C2.5 | UI：Connectors 頁寄件帳號加「署名」多行欄，預設＝`display_name`＋org 名稱，網站那行操作者填一次（SPEC D12），空白不能存；Review 頁 A／B 並排＋主旨，核准一版（另一版 `skipped`）；service profile 設定頁加 `privacy_url`（儲存時 GET 一次須 200，旁邊列 SPEC D20 的隱私頁清單讓操作者逐項勾完才能存）、`review_mode`（manual／sampled 兩顆按鈕；sampled 只在該 profile 人工核准 ≥ 50 封時可按）、`review_sample_pct`；`NA/app/(shell)/tools/outreach/drafts/page.tsx` stub 刪除、側欄移除（Review 已涵蓋） |
| C2.6 | 測試：`npx tsc --noEmit`、vitest（brand-context、generation-schema、route 寫列數）；REALTEST：本機 dev 對一個測試 lead 用 BYO key 真產一次 → `co_messages` 4 列、主旨非空、內文以署名結尾 |

### C3 研究 → 證據

| 卡號 | 做什麼 |
|---|---|
| C3.1 | `DB/migrations/0150_co_evidence.sql`：`co_evidence(id, organization_id, lead_id FK cascade, claim text, source_url text, excerpt text, source_label text, captured_at timestamptz default now(), source_date date, confidence numeric, status text check in ('pending','approved','rejected') default 'pending', created_by text, created_at)`；RLS service-role（照 `DB/migrations/0048_co_outreach_core.sql:5-11`）；index `(lead_id, status)`；唯一鍵 `(lead_id, source_url, claim)`；down 兩處 |
| C3.2 | 先改 `NA/lib/ai/cheap-json.ts`：`CheapJsonTextArgs` 加選用 `grant`，兩條路（`:40` OpenAI、`:86` Anthropic）改用 `args.grant ?? await grantFor("ops.cheap-json")`，既有呼叫點不變。新檔 `NA/lib/collect/sinks/outreach-research.ts`（一個 sink 兩種純輸出：證據列＋聯絡 email，見 C3.7）：`SinkBlock`（`NA/lib/collect/types.ts:253-270`）；`run(docs)`：每份 doc → `generateCheapJsonText({ grant: grantFor("outreach.research", …) })` 抽 ≤3 `{claim, excerpt}`；`excerpt` 必須是 `doc.text` 的子字串（機械驗，否則丟棄並計 skipped）；寫 `co_evidence`：doc host＝lead `website` host → `status='approved'`（自家網站、子字串驗證通過，SPEC D23），否則 `pending`；`source_url=doc.canonicalUrl`、`source_label=doc.collector`、`source_date=doc.publishedAt`（`doc.provenance` 是物件且恆為 EVIDENCE，`types.ts:41-45`，不存） |
| C3.3 | 新檔 `NA/lib/outreach/research.ts`＋新路由 `NA/app/api/outreach/leads/research/route.ts`（POST `{leadId}`）：seeds＝lead `website` 一個（`scope` 該 host，`meta.entityName=name`，`meta.anchors=[name]`；**`social_url` 不爬**，SPEC D20）；POST 接受 `{leadId}` 或 `{leadIds[]}`（批次，C15 用）→ `crawl(seeds, {sink, budget ≤15 頁／60 秒, callProvider: serper 若已設, maxDepth: 2})`（`NA/lib/collect/orchestrator.ts:254`；`maxDepth` 含種子頁，2＝首頁＋一層，`:404`）；非同步＋輪詢照 `NA/app/api/ops/clients/[slug]/collection-sources/route.ts:106` 與 `NA/lib/collect/run-jobs.ts`；0 claim → timeline `research_insufficient`，不生成 |
| C3.4 | `NA/lib/portal/products.ts:88` features 加 `quota("outreach.research", "客戶研究")`；`products.test.ts` 綠 |
| C3.5 | UI：Leads 頁每筆「研究這家（約 NT$x）」按鈕（費用由 `NA/lib/ai/cost-model.ts` 算）；證據列表只列 `pending`（第三方來源），approve／reject 兩顆按鈕；`NA/lib/outreach/cold-gate.ts` `checkColdGate` 改：≥1 approved evidence 通過，且 lead `status ∈ {warm, synced_to_fluentcrm, nurturing, customer}` 或 `consent_source` 以 `meta_lead_ad` 開頭 → block（暖名單永不進冷信）；過渡期舊 `observation+source_url` 亦通過（C9 收） |
| C3.6 | 測試：sink 子字串驗證（假 doc、假 JSON）；REALTEST：本機對 1 個真實公開網站跑研究 → `co_evidence` ≥1 列且 excerpt 可在頁面原文找到 |
| C3.7 | 同一 sink 的純程式段：每份 doc 從 `doc.raw.bytes`（HTML）抓 `mailto:` 與從 `doc.text` 抓 email（regex），排除圖檔名誤判，優先與 seed 網站同網域；lead `email` 為空才寫 `co_leads.email`，timeline `email_found{source_url}`；接著呼叫 C1.5 `verifyEmails` 寫 `co_verified_emails`。測試：mailto 優先、同網域優先、已有 email 不覆蓋；REALTEST：對 1 個真實店家網站跑研究 → `co_leads.email` 填入且在頁面找得到 |

### C10 名單發現

| 卡號 | 做什麼 |
|---|---|
| C10.1 | `NA/lib/collect/net/providers.ts:88` serper `allowedPaths` 加 `/places`（同段註解要求：有呼叫者才放寬）；新檔 `NA/lib/outreach/discover.ts`：經 `createProviderCall`（`NA/lib/collect/index.ts` 匯出，帶預算與限速）`POST /places {q:"<查詢字>", location:"<地區，例 Taipei City, Taiwan>", gl:"tw", hl:"zh-tw"}`（2026-11-01 真打：地名寫進 q 常只回 0–1 筆，要放 `location`；body 必須 UTF-8，Git Bash curl 會亂碼）→ 回應 `{searchParameters, places:[{position,title,address,latitude,longitude,rating,ratingCount,category,phoneNumber?,website?,cid,priceLevel?}], credits}`，一次 10 筆，phoneNumber／website 可缺、website 可能是 Facebook（C3 不研究），寫進檔頭（照 `NA/lib/collect/search/drivers.ts:67` 慣例）→ 每筆 `{title, address, phoneNumber, website, cid}`（`phoneNumber` 有時是地址，只收符合 `^\+?[\d\s()-]{7,}$` 的值，其餘留空）→ `co_lead_inbox`（`source_type='serper_places'`、`source_url=https://maps.google.com/?cid=<cid>`），再走既有 normalize／suppression；dedup 改跨庫：`dedupKey`（`NA/lib/outreach/normalize.ts:74`）對既有 `co_lead_inbox`＋`co_leads`（同 org，以 email／website host／`source_url` 查）已存在者標 `suspected_dup`（今天只比本次陣列，`normalize.ts:100-110`；`inbox/route.ts:143` 直接 insert）；核准進 leads（`NA/app/api/outreach/leads/route.ts:109`）改為 `upsert` on `(organization_id, lower(email))`（0149 的唯一索引，並行核准只留一列），沒有 email 的以 website host＋name 查後插入；沒有 email 的候選核准進名單後由 C3.7 補；每次 ≤20 筆；`NA/lib/outreach/connectors/router.ts:34` 的 `places` 槽位 note 改為 Serper |
| C10.2 | Inbox 頁「找名單」表單（查詢字、地區兩個輸入框），按鈕顯示每次查詢費用；測試：假回應 → 20 筆 inbox、重複的被標出；REALTEST：1 次真查 |

### C17 社群研究：IG／FB 頁的階梯

| 卡號 | 做什麼 |
|---|---|
| C17.1 | SPEC D20 改寫：店家 IG／FB 公開頁可讀，三層階梯、隔離四條（不經我們的 Meta app／帳號／主機 IP、不登入）、貼文事實待審、180 天；§5.1 seed 說法同步 |
| C17.2 | `NA/lib/collect/net/providers.ts`：`ProviderSpec.allowedPathPatterns`（Graph 路徑帶 id）；`meta_discovery`（`META_PAGE_TOKEN_AWARE_WAVE`，`/vX.Y/me` 與 `/vX.Y/<igId>`）、`apify_instagram`、`apify_facebook`（`APIFY_API_TOKEN`，各鎖一個 actor 路徑） |
| C17.3 | 新檔 `NA/lib/outreach/social-research.ts`：`socialTarget`（IG／FB 個人頁網址，貼文與分享連結不算）；階梯 meta_discovery（只 IG）→ serper（`site:<host> "<handle>"`，只取該頁結果的 email）→ apify（`Grant.hold` 預扣、回應後結算）；沒有金鑰＝skipped 不報錯；自介與欄位的 email 算對方宣告（`FoundEmail.mailto`）；自介與貼文成為文件，注入篩查不過的不交給模型；貼文帶日期、180 天內、`meta.reviewOnly` |
| C17.4 | `NA/lib/outreach/research.ts`：沒有自家網站或網站沒可用 email 時跑階梯；文件以 `admit` 交給 `sink/outreach-research`（只收這些網址；`reviewOnly` 一律 pending）；email 與網站的合併後照 C3.7 選；timeline `social_research`（各層結果、費用）；outcome `social`；研究路由多讀 `social_url`；`cost-model.ts` 研究上限加社群 |
| C17.5 | 名單頁：只有 IG／FB 頁的名單也能按「研究這家」；結果顯示用了哪一層、花多少 |
| C17.6 | 測試（階梯找到就停、沒金鑰跳過、錢包不足不跑 actor、注入篩查、貼文日期與待審）；REALTEST 層 1＋2 正式庫；層 3 Apify 等操作者說可以再真跑一次 |
| C17.7 | `NA/lib/outreach/research.ts`：沒有自家網站時先讀社群頁；頁上連的網址若是對方自己的網站（`researchUrl` 判斷：不是平台、表單、短網址、連結頁、地圖），compare-and-set 寫進 `co_leads.website`、社群網址移到 `social_url`、timeline `website_found`，同一次研究接著讀官網；`NA/lib/outreach/normalize.ts` `PLATFORM_HOSTS` 加表單、短網址、連結頁（2026-11-01 真資料：台中 8 家瑜珈 IG 沒有一家連自家官網） |

### C11 寄件信箱池：次網域、DNS、暖機

| 卡號 | 做什麼 |
|---|---|
| C11.1 | 操作者（High，外部資產；**第 0 天開始採購**）：買 1 個網域（操作者 2026-11-06，原 3 個；SPEC D27）；以它為主網域開 Google Workspace、2 個使用者；依 deliverability §12 設 SPF `v=spf1 include:_spf.google.com ~all`、DKIM（Workspace 產生的 `google._domainkey`）、DMARC 先 `p=none`，`warmup_stage='full'` 後改 `p=quarantine`。**連線等 C1.6 與 C11.2 都部署後**：Connectors 頁每個信箱連 Gmail，畫面要操作者輸入 email 確認「此信箱屬於寄件池：自動寄出、每日上限 50」→ `send_mode='auto'`、`daily_limit=50`、`warmup_stage='w1'`、`warmup_started_at=today`（SPEC D17、D21）；既有的 `awarewaveai@gmail.com` 維持 `draft`、20 |
| C11.2 | `DB/migrations/0152_sender_pool.sql`：`co_sender_accounts` 加 `send_mode text not null default 'draft' check (send_mode in ('draft','auto'))`、`warmup_started_at date`、`dns_status jsonb`、`dns_checked_at timestamptz`、`connector_id uuid references co_connector_accounts(id)`（以 email 回填既有列；`warmup_stage` 既有列回填 `'full'`）；`co_messages.status` CHECK 加 `sending`；新表 `co_send_claims(id, sender_account_id, sender_domain, recipient_key（免費信箱＝完整 email，其餘＝網域；`co_recipient_cap_key()`）, message_id（未釋放者唯一）, claimed_at, released_at)`＋兩個函式（SPEC §4 0152 列）：`co_begin_send(p_message_id, p_sender_account_id, p_recipient_email, p_caps jsonb) returns boolean`（`SELECT co_leads FOR UPDATE` 再查 warm／do_not_contact／suppression → `pg_advisory_xact_lock` 寄件網域與收件網域各一把、key 排序取 → 以 `released_at IS NULL` 的 claims 計三額度 → INSERT claim → `UPDATE co_messages SET status='sending' WHERE id AND status='drafted'`，0 列＝false）、`co_convert_to_warm(p_lead_id, p_consent jsonb)`（`FOR UPDATE` → `status='warm'`＋consent＋`next_followup_date=null` → 該 lead `draft`／`approved`／`drafted` 冷信 `skipped`＋timeline）；OAuth callback（`NA/app/api/outreach/connectors/gmail/oauth/callback/route.ts:109-114`，今天固定 `daily_limit` 預設）接受 `{pool:true}` → `send_mode='auto'`、`daily_limit=50`、`warmup_stage='w1'`、`warmup_started_at=today`、`connector_id`；down 兩處 |
| C11.3 | 新檔 `NA/lib/outreach/sender-health.ts`，每日對每個 `stream_type='cold'` 信箱三件事：①DNS：`node:dns/promises` `resolveTxt`（根 TXT 含 `v=spf1` 且含 `include:_spf.google.com`；`_dmarc.<domain>` 含 `v=DMARC1`）、`google._domainkey.<domain>` TXT 或 CNAME → `dns_status={spf,dkim,dmarc,checked}`、`dns_checked_at`，缺項 `health_status='warning'`＋timeline，連續 2 天缺 → `paused`；②退信率：7 日 `hard_bounced`／`sent`（`co_sending_events` 以 `sender_account_id`），分母 ≥ 30 且 ≥ 3% → `paused`＋推播（deliverability §15.3）；③暖機升階：當前階連續 5 個寄送日 `sent` ≥ 上限 70% 且 7 日 hard-bounce < 2% → `w1→w2→w3→full`（上限 10／20／35／min(50, `daily_limit`)）。恢復：Connectors 頁「重新檢查並恢復」按鈕＝即時重跑①②，都過才 `healthy`，否則顯示原因。新路由 `NA/app/api/internal/outreach/sender-health/route.ts`（Bearer `OUTREACH_SYNC_TOKEN`）＋`HS/cron.d/awarewave-schedules` 每日一行＋`NA/lib/schedules/host-jobs.ts` 登記 `outreach_sender_health` |
| C11.4 | 測試：DNS 假回應四情境（全有、缺 SPF、缺 DKIM、第 2 天仍缺）、退信率門檻（29 封不判、30 封 3% 判）、升階（4 天不升、5 天升）、恢復（退信仍高不恢復）；`co_begin_send` 併發測試（同寄件網域兩信箱各搶最後一格只成功一個；不同寄件網域同時寄同一收件網域第 3 封只成功一個；`co_convert_to_warm` 與 `co_begin_send` 同時對同一 lead 只有一個生效）；每日 sender-health 刪 31 天前 claims；REALTEST：對一個真實次網域跑一次 → 三燈正確 |

### C4 回覆同步與 Replies 頁

| 卡號 | 做什麼 |
|---|---|
| C4.1 | `DB/migrations/0153_co_replies.sql`（0151 已被 Mockup 用掉；欄位與四個函式見 SPEC §4 0153 列）：採 v1 spec §B6 欄位＋`gmail_message_id text unique`、`received_at timestamptz`、`classified_by text`、`processed_at timestamptz`、`process_attempts int not null default 0`；RLS 照 0048；down 兩處 |
| C4.2 | `NA/lib/outreach/google-oauth.ts` `createGmailDraft` 回 `{id, message:{id, threadId}}`；`NA/app/api/outreach/messages/gmail-draft/route.ts:179-188` 事件 `metadata={threadId, messageId, draftId}`（scope 與發布已在 C1.6） |
| C4.3 | 新檔 `NA/lib/outreach/gmail-sync.ts`，每個啟用 connector 兩段（SPEC §5.6）：①**已寄偵測，逐封不看 thread**：`co_messages.status ∈ {drafted, sending}` → `messages.get(<事件 messageId>)?format=minimal`，`labelIds` 含 `SENT` 且無 `DRAFT` → `sent`、`sent_at`、事件 `sent`、lead `status='sent'`、`last_contact_date`、`next_followup_date`；404 → `threads.get` 中 `SENT` 且 `internalDate` 晚於草稿建立且未對應他列者補對；草稿也 404 → `needs_edit`＋timeline。②**來信比對**（SPEC §5.6）：游標＝`co_connector_accounts.settings.gmail_sync.history_id`（`0048:195` jsonb；初次 `users.getProfile` 取並以 `messages.list?q=in:inbox after:<連線時間−1 天> -from:me` 翻完所有分頁全掃）→ 每 tick `users.history.list?startHistoryId&labelId=INBOX&historyTypes=messageAdded` 翻完分頁；404 → 日期全掃 → 每封 `INSERT co_replies(gmail_message_id, processed_at=NULL)`（衝突＝已認領，跳過）→ `messages.get?format=full`：From、Subject、In-Reply-To、X-Failed-Recipients、`text/plain` part（base64url 解碼；無則去 HTML 標籤）截 4,000 字存 `reply_text` → 比對同 org `co_leads.email`（小寫，不論 lead 狀態）→ C4.4 分類與副作用 → 全部成功才寫 `processed_at`；失敗 `process_attempts+1`，下一 tick 先重處理 `processed_at IS NULL ∧ attempts<5`；第 5 次仍失敗 → `reply_type='unprocessed'`、`processed_at=now()`、timeline `reply_processing_failed`＋推播（`NA/lib/schedules/alerts.ts` 出口）；**游標只在整輪分頁耗盡且無未處理列時前進**。`From` 含 `mailer-daemon` → 以 `X-Failed-Recipients` 找 lead → 事件 `hard_bounced`＋suppression `hard_bounce`＋`do_not_contact` |
| C4.4 | 分類（C4.3 認領後的處理段，可重試，完成才 `processed_at`）：主旨為 `unsubscribe`（`List-Unsubscribe` mailto，C1.3）直接記 `unsubscribe` 不叫 AI；其餘 `generateCheapJsonText({ grant: grantFor("outreach.classify", …) })` 以 `reply_text` 分類 `reply_type`（v1 九種）＋`suggested_response`；`NA/lib/portal/products.ts:88` 加 `quota("outreach.classify", "回信分類")`。lead：`status='replied'`、`next_followup_date=null`、`consent_status` 由 `unknown`／`legitimate_interest` 升為 `replied`（不降 `opted_in`／`form_submitted`／`customer`）；`unsubscribe` → `consent_status='unsubscribed'`＋suppression `unsubscribe`＋`do_not_contact`；`reject` → `consent_status='do_not_contact'`＋suppression `manual_opt_out`＋`do_not_contact`；全部寫 `co_timeline_events` |
| C4.5 | 新路由 `NA/app/api/internal/outreach/gmail-sync/route.ts`（Bearer `OUTREACH_SYNC_TOKEN`，照 `NA/app/api/internal/schedules/alerts/route.ts:21-25`）；`HS/cron.d/awarewave-schedules` 加 `*/10` 一行經 `poke.sh`；`NA/lib/schedules/host-jobs.ts` 登記 `outreach_gmail_sync`；Connectors 頁每個信箱「補掃 N 天」按鈕（游標回撥後下一 tick 補掃）；安裝主機 cron（High） |
| C4.6 | `NA/app/(shell)/tools/outreach/replies/page.tsx` 取代 stub：全 org 列表（時間、lead、分類、`reply_text` 摘要）；按鈕：產報價摘要（`output_type=proposal_summary`）、問正確窗口、加入拒收、同步 FluentCRM（C6 後啟用）、約到會議、成交、失去（各改 `co_leads.status`）；`unprocessed` 列紅色附「重試」（`process_attempts=0`、`processed_at=NULL`） |
| C4.7 | 測試：假回應情境——首封已寄而追蹤草稿未寄（追蹤不得標 sent）、同串回信、新開一封的退訂信、`no_reply` 後回信、退信、同一 `gmail_message_id` 跑兩次只一列且事件與拒收只一筆、分類失敗後下一 tick 重處理成功、history 404 回退全掃、兩頁分頁都處理完游標才前進；REALTEST（部署後）：操作者寄 1 封給自己的另一信箱並回覆 → 10 分內 Replies 出現該列含內文、lead 狀態 replied、follow-up 日期清空 |

### C8 自動寄與輪流寄（量產）

| 卡號 | 做什麼 |
|---|---|
| C8.1 | 新檔 `NA/lib/outreach/sender-pool.ts`（純函式＋一個 RPC 包裝）：各階上限用 C11 已建的 `NA/lib/outreach/sender.ts` `stageCap(stage, daily_limit)`（10／20／35／min(50, `daily_limit`)），不另寫；`pickSender(accounts, todayClaims)`＝`is_active ∧ healthy ∧ send_mode='auto'` 中「今日 claims／今日上限」最低；`beginSend(sb, messageId, accountId, recipientEmail)`＝呼叫 `co_begin_send` RPC（C11.2），false＝已滿、被搶先或 lead 已轉暖；`releaseClaim(sb, messageId)`＝`released_at=now()`。測試：各階上限、輪流選最低 |
| C8.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts`：建草稿改用 `pickSender`（首封）或上一封 `co_sending_events.sender_account_id`（追蹤信，同串）；用該信箱的 `connector_id` 取 token；事件記 `sender_account_id`；取代今天 `.limit(1)` 挑 connector 的寫法 |
| C8.3 | 新檔 `NA/lib/outreach/send-adapter.ts`（never-sends 測試唯一白名單）：`sendDraft(draftId)`＝`drafts.send`；只在信箱 `send_mode='auto'` ∧ `healthy` ∧ 台北 09–18 週一至五 ∧ tick 配額（剩餘上限／剩餘 tick，加 0–120 秒抖動）∧ **重跑 `checkColdGate`（含 warm／Meta 硬拒）**＋I6（含 `co_verified_emails` 非 invalid）→ `beginSend`（鎖 lead、三額度、改 `sending` 一次交易）→ 寄 → `sent`；逾時／5xx 留 `sending`，gmail-sync 以 message id 對帳，30 分未對到 → `needs_edit`＋timeline＋`releaseClaim`（證實未寄才釋放）；Gmail 4xx 配額／拒收 → 該信箱 `paused`＋timeline＋推播（`NA/lib/schedules/alerts.ts` 的通知出口） |
| C8.4 | gmail-sync tick 末尾呼叫 send-adapter；Connectors 頁信箱池表每列：email、網域、DNS 三燈（C11）、暖機階、今日 claims／上限、7 日退信率、健康、「自動寄出：關／開」（開要輸入 email 確認）、「重新檢查並恢復」（C11.3） |
| C8.5 | 測試：同一封信兩次只寄一次、同帳號 19／20 兩封只寄一封、同網域兩信箱搶最後一格只寄一封、收件網域第 3 封不寄、lead 轉 warm 後既有草稿不寄、視窗外不寄、paused 不寄；REALTEST：一個 w1 的次網域信箱 1 封寄到自己另一信箱 |
| C8.6 | 付費信箱驗證閘（SPEC D25）：新檔 `NA/lib/outreach/mailbox-verify.ts`（供應商 driver：hunter `email-verifier`、zerobounce `validate`，回 valid／invalid／risky；先真打一次記回應形狀）；首封核准且信箱 `send_mode='auto'` 時驗一次（grant `outreach.verify`，`NA/lib/portal/products.ts` 加 quota），結果寫 `co_verified_emails`（`provider`、`verified_at`；90 天內不重驗）；send-adapter（C8.3）只寄 valid＋付費來源＋90 天內；risky／unknown 進人工佇列；invalid 寫拒收 `invalid_email`；`NA/lib/outreach/connectors/router.ts` hunter／zerobounce 槽位 note 改為「自動寄前必驗」；測試：valid 才寄、risky 不寄、invalid 進拒收、90 天快取、無 key 時一律不自動寄 |

### C5 追蹤信與人工步驟

| 卡號 | 做什麼 |
|---|---|
| C5.1 | `NA/app/(shell)/tools/outreach/followups/page.tsx`：列出 `next_followup_date ≤ 今天` 且 `status='sent'` 的 lead，顯示下一封 followup 列（最小未寄 `version`）；「建草稿（回同一串）」按鈕 |
| C5.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts` 接受 followup 列：MIME 加 `In-Reply-To`／`References`＝本方上一封的 `Message-ID`（`threads.get` headers），`drafts.create` 帶 `threadId`；事件照常 |
| C5.3 | 最後一封寄出後經其 `followup_delay_days` 無回信 → lead `status='no_reply'`（在 gmail-sync tick 判）；`no_reply` 不是同步終點，之後來信由 C4.3 ② 照常改成 `replied` |
| C5.4 | `channel≠email` 的步驟（`co_messages.channel` ig_dm／linkedin／phone）在同頁顯示為待辦＋「完成」按鈕（寫 timeline，推進 `next_followup_date`）；本卡只顯示與完成，不產生這類步驟（SPEC §2 D9） |
| C5.5 | 測試：In-Reply-To 組裝；REALTEST：本機建一封 followup 草稿 → Gmail 中出現在原 thread |

### C15 量產管線：依政策自動前進

| 卡號 | 做什麼 |
|---|---|
| C15.1 | 新檔 `NA/lib/outreach/pipeline.ts` `runPipelineTick(orgId)`，在 gmail-sync 同一 tick、send-adapter 之前跑，每步各有每 tick 上限：①`co_leads.status='qualified'` 且無 `co_evidence` 且有 `website` → C3.3 批次研究（grant `outreach.research`，每 tick ≤ 20）；②有 approved evidence 且無 `co_messages` → C2.4 產信（每 tick ≤ 20）；③`co_messages.status='draft'` 依 profile `review_mode`（SPEC D23）：`manual` 留佇列；`sampled` → 每 lead 選一版（雜湊奇偶，另一版 `skipped`）→ lint `pass` ∧ `claim-check` `supported` → `approved`，抽樣、`warn`、`unsupported` → 佇列；④`approved` 且無 `drafted` 事件 → C8.2 建草稿（只對 auto 信箱）；⑤追蹤到期 → C5.2 建草稿（C5 已在前）。全部只處理 `do_not_contact=false` 且非 warm 的 lead |
| C15.2 | 佇列頁 `NA/app/(shell)/tools/outreach/review/`：顯示待人工的證據（第三方）、訊息（manual／抽樣／warn）；鍵盤 a 核准、r 退回、j 下一筆；每筆顯示證據來源與告知行 |
| C15.3 | 每 org 每日管線預算：研究與產信各 ≤ 寄信目標 × 1.5（`co_sender_accounts` 該 org 上限總和 × 1.5），超過等明天；費用記 `ai_call_logs`，成效頁（C7）顯示每日研究／產信／寄出數 |
| C15.4 | 測試：每步上限、manual 不自動核准、sampled 抽樣比例、同 lead 只一版進草稿（並行第二版撞索引）、`unsupported` 進佇列、自動核准列 `gate_snapshot.auto=true` 不計入 50、warm lead 永不進入；REALTEST：本機種 20 個有 `website` 的 qualified lead，`sampled` profile，跑 3 個 tick → 無人工點擊下出現 ≥ 15 封 `drafted`、抽樣 2 封在佇列 |

### C7 成效頁

| 卡號 | 做什麼 |
|---|---|
| C7.1 | 新路由 `NA/app/api/outreach/stats/route.ts`（GET `?organizationId&from&to`）：依 service_profile × variant_label × angle 計 generated／drafted／sent／bounced／replied／positive／meeting_booked／customer／lost（SPEC §5.9；SQL 聚合 `co_messages`、`co_sending_events`、`co_replies`、`co_leads`） |
| C7.2 | `NA/app/(shell)/tools/outreach/page.tsx` 取代 stub：一張表＋回覆率、正向回覆率；無開信率欄位；CSV 下載 |
| C7.3 | 測試：聚合對假資料的計數；REALTEST：本機種 3 筆 lead 走到 replied → 表數字正確 |

### C12 名單來源：公司行號（商工登記開放資料）

| 卡號 | 做什麼 |
|---|---|
| C12.1 | `NA/lib/collect/net/providers.ts:26` `ProviderSpec.apiKeyEnv` 改為選用（`apiKeyEnv?`），`:148` 無 key 時只在 spec 宣告 `keyless: true` 才放行（預算、origin、`allowedPaths` 照常），否則仍 `unconfigured`；`keyless` 時 `:165` **不組任何 auth header**（測試：keyless 請求無 `authorization`、keyed 缺 key 仍 `unconfigured`）；加 `gcis` entry（origin `https://data.gcis.nat.gov.tw`、`keyless`、`allowedPaths` 三個 API id）。新檔 `NA/lib/outreach/sources/gcis.ts` 經 `createProviderCall` 三步：①營業項目代碼表 `FCB90AB1-E382-45CE-8D4F-394861851E28` `$filter=Business_Item eq '<代碼>'` 列公司；②應用一 `5F64D864-61CB-4D0D-8AD9-492047CC1EA6` `$filter=Business_Accounting_NO eq <統編>` 取 `Company_Name`、`Responsible_Name`、`Company_Location`、`Capital_Stock_Amount`；③官網：`Company_Name`（去「股份有限公司」等後綴）以 Serper `/search` 查，依序取前 3 筆，host 不在目錄站拒絕清單（`gcis.ts` 內常數陣列：104／1111／518／findbiz／twincn／facebook／instagram／yellowpages 等）且頁 title 含公司名核心字才採用為 `website`（否則留空，lead 到 C3 時 `research_insufficient`）；先真打一次記下回應形狀與每日上限寫進檔頭；縣市用 `Company_Location` 前綴在本地篩；每次 ≤100 筆 |
| C12.2 | Inbox 頁「找公司」：營業項目用搜尋框＋可見的符合清單（不用下拉）、縣市按鈕；候選 → `co_lead_inbox`（`source_type='gcis'`、`source_url=https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?<統編>`、`contact_name=Responsible_Name`、`contact_role='負責人'`、`industry=Cmp_Business`、`website`＝C12.1 ③、`consent_source='general_source:<公示資料頁>'`）；頁腳一句顯名聲明（政府資料開放授權第 1 版）；email 由 C3.7 從公司網站補 |
| C12.3 | 操作者（High，外部申請）：向 GCIS 填 API 使用告知書，白名單 IP＝ks-aw-01 出口 `145.239.195.47`；測試：假回應；REALTEST：1 個代碼真查 → inbox 出現含負責人的公司 |

### C13 名單來源：人員搜尋、email 推斷、付費驗證

| 卡號 | 做什麼 |
|---|---|
| C13.1 | 新檔 `NA/lib/outreach/sources/people-search.ts`：Serper `/search`（已允許）查 `site:linkedin.com/in "<職稱>" "<公司或產業>" "<縣市>"`、`site:instagram.com "<關鍵字>" "@"`；**只取搜尋結果的 title／snippet／link**（搜尋引擎已公開索引），不抓社群頁面（SPEC D20）；候選 `{name, role, company, profile_url, snippet}` → `co_lead_inbox`（`source_type='search'`、`source_url=link`、`social_url=link`、`consent_source`：snippet 來自當事人自己的簡介頁＝`self_published:<link>`，其餘＝`general_source:<link>`）；snippet 內的 email 直接填；每次 ≤20 筆、費用顯示 |
| C13.2 | 新檔 `NA/lib/outreach/email-guess.ts`（純函式）：從同網域已知 email（C3.7、C12）推格式（first.last／first／f.last／last.first／firstlast），對有姓名英文拼法的候選人產生 ≤4 個候選；交 C1.5 `verifyEmails` 先篩 MX；再交 Hunter verifier（`NA/lib/outreach/connectors/router.ts:26` 槽位，BYO key 存 vault，`GET /v2/email-verifier`）只收 `deliverable` 寫 `co_leads.email`（`consent_source='inferred'`）、`co_verified_emails(status='valid', provider='hunter')`；Hunter `GET /v2/email-finder`（domain＋姓名）為第二路；沒有 key 只做 MX 並標 `unverified`；費用顯示 |
| C13.3 | Inbox 頁「貼上個人資料」表單：name、email、profile URL、來源一句；走既有 normalize／dedup／suppression（`NA/app/api/outreach/inbox/route.ts`） |
| C13.4 | 測試：推斷規則、Hunter 假回應（deliverable／risky／undeliverable）；REALTEST：1 個真實公司 2 位人員 → 候選進 inbox，驗證結果記 `co_verified_emails` |

### C6 暖名單進 FluentCRM

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `WPB/includes/Http/RestController.php`：`POST /fluentcrm/contact`（signed write，照 `/newsletter` `:92-103`）→ 新檔 `WPB/includes/Crm/ContactUpserter.php`：upsert contact（email 唯一）＋lists／tags；FluentCRM 未啟用回 `fluentcrm_not_active`（照 `:366`）；不碰 sequences、不寄信 |
| C6.2 | `WPB` `AWBRIDGE_VERSION` 0.19.0 → 0.20.0；`scripts/release-wp-bridge.sh`（`bash` 執行；觸發索引：改 wp-bridge 必跑）；客戶站更新＝High |
| C6.3 | 新路由 `NA/app/api/outreach/leads/sync-fluentcrm/route.ts`（POST `{leadId}`）：資格＝`consent_status ∈ {replied, opted_in, form_submitted, customer}` ∧ 非 suppression（marketing／all）；`NA/lib/crm/fluentcrm.ts` 加 `upsertContact(spec, {clientId})`（走 `bridgePost`，照 `createNewsletter` 寫法）；`clientId`＝該 org active `wp_sites.url` 的 host 對上 `listBridgeClients()`（`NA/lib/payments/woo.ts:140`，已匯出；`rawBridgeEnv` 是私有函式不 import）各站 base URL，對不到 422 `no_bridge`（SPEC D16）；成功寫 `fluentcrm_contact_id`、`fluentcrm_sync_status='synced'`、`fluentcrm_last_synced_at`、timeline；不合格 422 `not_eligible` |
| C6.4 | Replies 頁「同步 FluentCRM」按鈕接上；測試：資格判斷四種 consent 與 suppression；REALTEST：對 staging WP 同步 1 個測試 lead → FluentCRM 出現 contact |

### C14 個人消費者：Meta 名單型廣告 → FluentCRM

| 卡號 | 做什麼 |
|---|---|
| C14.1 | 新檔 `NA/lib/outreach/warm-leads.ts` `captureWarmLead({orgId, email, name, phone, sourceRef, consent})`：`co_leads` upsert（Meta 鍵 `source_url='meta:leadgen/<id>'`；CSV 鍵 `(organization_id, lower(email))`，0149 索引）→ `co_convert_to_warm` RPC（C11.2：鎖 lead 列、`status='warm'`、三個 consent 欄、`next_followup_date=null`、冷信 `skipped`＋timeline，與寄送互斥）；撞鍵時讀既有列，`fluentcrm_sync_status≠'synced'` 就重試 → C6 `upsertContact`（tag `meta-lead-ad`）→ timeline `lead_captured`；Inbox 頁「匯入 Meta 名單 CSV」：欄位對應 email／full_name／phone／created_time／表單名 → `captureWarmLead`（`consent_source='meta_lead_ad_csv:<表單名>'`），不進 inbox 審核；`DB/migrations/0153_meta_leads.sql` 部分唯一索引 `(organization_id, source_url) WHERE source_url LIKE 'meta:leadgen/%'`（`co_leads.source_url` 今天無唯一，`0048:127-129`）；Cold Gate 硬拒 warm／Meta lead（C3.5） |
| C14.2 | 新檔 `NA/lib/outreach/meta-leads.ts`：`handleLeadgenChanges(payload)` 取 `entry[].changes[]` 中 `field==='leadgen'`（`leadgen_id`、`page_id`、`form_id`、`created_time`）→ `findEnabledMetaAsset('facebook_page', page_id)`（`NA/lib/social/store.ts:85`）取品牌→org 與 `META_PAGE_TOKEN_<pageId>`（`NA/lib/social/meta-webhook.ts:70-71`）→ `GET /<leadgen_id>?fields=field_data,created_time,form_id,ad_id,campaign_id` → `captureWarmLead`（先落庫再同步；重送同一 `leadgen_id` 撞索引＝讀既有列並補做未完成的同步，不是跳過）。`NA/app/api/webhooks/meta/route.ts:27-40` POST 在簽章驗證後先呼叫它，再把 payload 照舊交給 `processMetaWebhook`；社群模組既有測試 `route.test.ts` 必須不變 |
| C14.3 | 操作者（High，外部設定）：App 加 `leads_retrieval` 權限；每個品牌頁面 `POST /<page_id>/subscribed_apps?subscribed_fields=leadgen`；代操客戶頁面非操作者管理時走 App Review。測試：假 leadgen payload → 一列 warm lead＋consent＋FluentCRM 呼叫一次；重送同一 `leadgen_id` 不重複，FluentCRM 首次失敗後重送會補同步；已有冷信草稿的 email 匯入後草稿變 `skipped`；CSV 匯入同一 email 兩次只一列；REALTEST：Meta「名單廣告測試工具」送一筆 → 10 秒內 `co_leads` 出現且 FluentCRM 有該聯絡人 |
| C14.4 | 第二個品牌（Soulful，另一家公司）照 C14.3 接：該粉專管理員帳號加為 App 管理員、產權杖並接受名單條款 → 長期粉專權杖、`META_PAGE_TOKEN_<page_id>`（.env＋compose）、`social_meta_assets` 登記到該品牌 org、粉專訂閱 leadgen。REALTEST：測試工具送一筆 → 只進 Soulful 的 FluentCRM，不進 aware-wave.com |

### C9 舊欄位退場（contract）

| 卡號 | 做什麼 |
|---|---|
| C9.1 | 回填腳本（冪等）：每個有 `observation+source_url` 且無 evidence 的 lead → 1 列 approved evidence（`created_by='backfill'`） |
| C9.2 | `checkColdGate` 只看 evidence；inbox 匯入的 `observation` 寫成 evidence 列；`NA/lib/outreach/scoring.ts` 的 observation 加分改讀 evidence 數；欄位保留不刪 |

### C16 自動化調校：依風險抽樣、事實核對穩定、A／B 成效回饋

| 卡號 | 做什麼 |
|---|---|
| C16.1 | `NA/lib/outreach/review-policy.ts` `inSample` 改 `sampleWeight(lead, profile, stats)`：總抽樣量仍＝`review_sample_pct`，分配給高風險信（profile 自動核准前 20 封、該 profile 沒做過的產業、事實核對低信心、C7 該 profile×angle 7 日退信率或負面回覆率高於全體）；決定仍可重算（雜湊＋權重）；測試：同比例下高風險信被抽中率 ≥ 2 倍低風險 |
| C16.2 | `NA/lib/outreach/claim-check.ts`：一致率實測（對 ≥200 封真信各判兩次）→ 一致率 ≥95% 的最便宜模型當預設；未達 → 兩次投票，不一致＝`unsupported`；`gate_snapshot.claim_check` 記 `model`、`runs`；SPEC D24② |
| C16.3 | `generation-schema.ts` 每版加 `angle`（固定詞表）→ 寫 `co_messages.angle`（`0048:146` 已有欄）；C7 stats 依 profile×angle 算回覆率；同 profile 每切角 ≥30 封後，`brand-context.ts` 加「有效做法」段（勝出切角、不含個資），`pickVariant` 偏向勝出切角（仍保留 ≥20% 給另一版，避免定死） |
| C16.4 | 測試與真資料：C16.1 假資料分配；C16.2 一致率報告存 `agency-os/reports/`；C16.3 種兩切角各 30 封假回覆 → prompt 出現勝出切角 |

## 7. 驗證計畫（四動作）

- 實測：每卡最後一項是 REALTEST（本機 dev 或部署後真跑）；C8、C11 用暖機中的真實次網域信箱；C12 等 GCIS 白名單核准；C14 用 Meta 名單廣告測試工具；C15 以 20 個種子 lead 跑 3 個 tick；`.ts` 改動前 `npx tsc --noEmit`；migration 先本機 Supabase 套用再走 prod 閘。
- Review：計畫本身已過 Codex 三回合（`agency-os/reports/oracle/2026-11-01-inspect-8af4371a.md` 18 項、`2026-11-01-inspect-30a78af4.md` 13 項、`2026-11-01-inspect-84062c02.md` 6 項，全採）；Claude 寫的卡 `/codex-review`（每 commit 1 個，Standard）；Codex 寫的卡 `/claude-review`；auth／scope 改動（C4.2、C8）Deep。
- 抓蟲：grep `observation`、`source_url`、`GMAIL_SCOPE`、`draft_created`、`next_followup_date`、`fluentcrm_sync_status` 的 call sites，scope `agency-os,scripts,lobster-factory,.claude`。
- WORKLOG：每卡一條，四行機械證據；監工台 `data.mjs` 改狀態＋commit → `node build.mjs && node check.mjs` → 重新發布同一網址。
