# 外聯系統 v2：研究→證據→個人化→回信 — R0 七段

> 續接語：續做 外聯系統 v2：讀 `agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md`（規則與契約）與本檔 §6（卡片），從監工台 `data.mjs` 第一張 `not_started` 的卡開始；完成＝該卡 items 全 done 並 commit。建議模型：Opus 5.5（C1／C5／C7／C9／C10 可派 Codex）。
> 規則、不變量、資料模型、流程契約只寫在規格（上面那個路徑，下稱 SPEC）；本檔只寫七段與卡片；狀態只在 `data.mjs`。路徑縮寫：`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`、`DB`＝`lobster-factory/packages/db`、`WPB`＝`lobster-factory/packages/wp-bridge-plugin`、`HS`＝`lobster-factory/infra/hetzner-phase1-core/scripts`。

## 1. 任務理解

- 根本問題：冷信工具只做了中段（評分、寫信、審核、建草稿），頭（AI 自己看對方並留證據）與尾（回信進系統、追蹤信有內容、暖名單進 FluentCRM、看得到成效）沒接；信本身缺主旨、署名、定位、多版本。
- 不變量：SPEC §0 I1–I9。一句：**冷信的工作是換到一個回覆；每個具體主張對得到證據；系統不寄（除非該帳號明示打開）；回信即停。**
- 操作者的三份輸入：GPT v1.0 草案（git `26bce3452` 原樣）、「研究引擎」補充、「企業版 12 模組」補充。願景全收；與現有架構相撞的技術棧不收（SPEC §2、§3）。

## 2. 現況分析

- git log（核心檔）：`NA/app/api/outreach/messages/route.ts`、`NA/lib/outreach/cold-gate.ts` 最後四次 `e87de9225`（10-20 entitlements）、`0a5b3e7c4`（09-11 uuid guard）、`d146eff7b`（07-02 per-org）、`2fce1cd38`（06-29 IDOR）。文件搬移與草案入庫 `26bce3452`（10-31）。
- 七步現況與證據：SPEC §1 表。摘要：步驟 0–5 可用（2026-10-14 正式站建 1 封草稿）；研究無；主旨空（`NA/app/api/outreach/messages/route.ts:209`）；定位未用（`:123`）；一封一版（`:48-66`）；草稿只存 draft id（`NA/app/api/outreach/messages/gmail-draft/route.ts:186`）、不重查拒收（`:65`）；追蹤只有日期（`NA/app/api/outreach/followups/route.ts:6-8`）；Replies／首頁／Drafts 是 stub。
- 可重用資產：`lib/collect`（entity-dossier、provenance、Serper/Brave、budget）、`lib/ai`（gateway、cheap-json、登記表、成本）、`co_*` 12 表、Trigger 工人＋主機 cron、wp-bridge 簽章寫入。GPT 提的 41 表／job queue／CRM／ai-router／brand_id 全部對應到已存在的東西，SPEC §1、§2。
- 兩個既有說法訂正：scope `gmail.compose` 允許 `drafts.send`，不寄的守衛是程式不是 scope（`MODULE_MANIFEST.json:22` 寫反）；冷信不買專用網域，走品牌 Workspace 信箱低量人工寄（deliverability §11）。

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

## 4. 方案比較

- A 最小：只補主旨、署名、定位三處（C2 的一半）。Rollback：revert 一個 commit。缺：頭尾仍沒接，仍是「把信寫出來」。
- B 完整：C1–C8 八張卡依序，各自獨立 commit、各自 rollback（migration 有 down 檔兩處；route 新檔刪即回復；cron 行刪即回復）；C9／C10 parked。

## 5. 建議方案

B。順序：C1（守衛）→ C2（信本身）→ C3＋C10 並行（研究／名單發現，不同檔）→ C4（回信）→ C5＋C7 並行（追蹤／成效）。C6、C8、C9 parked，回頭條件在 SPEC D16、D17 與 data.mjs `waitFor`。每張卡完成就能單獨上線，不等整套。

## 6. 實作計畫

### C1 守衛與事實訂正

| 卡號 | 做什麼 |
|---|---|
| C1.1 | `NA/lib/outreach/MODULE_MANIFEST.json:22` 與 `NA/lib/outreach/google-oauth.ts:1-10` 註解改寫：scope `gmail.compose` 允許 `drafts.send`，不寄的守衛是程式；新檔 `NA/lib/outreach/__tests__/never-sends.test.ts`：讀 `lib/outreach/**` 與 `app/api/outreach/**` 原始碼，出現 `/drafts/send`、`/messages/send`、`gmail.send`、`gmail.modify` 即紅（白名單只允許 C8 的 `send-adapter.ts`） |
| C1.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts`：建草稿前重查 lead `do_not_contact` 與 `co_suppression_list`（用 `NA/lib/outreach/normalize.ts` 的 `isSuppressed`，applies_to cold／all）→ 409 `{blocked:true, reason}`；測試：lead 標 do_not_contact → 409 |
| C1.3 | `NA/lib/outreach/google-oauth.ts` `buildRfc2822Message`：加 `List-Unsubscribe: <mailto:<from>?subject=unsubscribe>`（RFC 2369）；測試斷言 header 存在且與 from 一致 |
| C1.4 | VBC：prod `co_connector_accounts` 的 Gmail connector 是否仍能 refresh（`timeout 60 ssh … docker exec … psql` 讀 `updated_at`／`is_enabled`，再對 Google token endpoint refresh 一次，不寫 DB）；結果寫 WORKLOG 與監工台 NOW；失敗＝Testing 7 天到期已發生 → 照 SPEC D13 提前在 C4.2 之前發布並重新連線 |
| C1.5 | 新檔 `NA/lib/outreach/verify-email.ts`：`mxStatus(email)` 用 `node:dns/promises` `resolveMx(domain)` → `valid`（有 MX）／`invalid`（NXDOMAIN 或無 MX）／`unknown`（逾時 3 秒或其他錯），`provider='mx_syntax'`；`verifyEmails(orgId, emails[])` 先讀 `co_verified_emails`（`0048:295`，UNIQUE org＋email），沒有的並行 ≤10 查後寫入。`NA/app/api/outreach/inbox/route.ts:102-143` 匯入時呼叫，`scoreContactability(..., {emailVerified: status==='valid'})`（`NA/lib/outreach/scoring.ts:62`），`invalid` 在 `classify` 視同無 email；`gmail-draft/route.ts` I6 重查加 `invalid` → 409 `email_invalid`。測試：假 resolver 三種結果；REALTEST：匯入一筆不存在網域的 email → `invalid`、`no_contact` |

### C2 署名、定位、主旨、多版本、追蹤信內容

| 卡號 | 做什麼 |
|---|---|
| C2.1 | `DB/migrations/0149_outbound_v2_expand.sql`（號碼以當時最大＋1）：`co_sender_accounts.signature_block text`；`co_messages.followup_delay_days int`、`co_messages.gate_snapshot jsonb`；down 檔兩處（`DB/migrations/*.down.sql`、`DB/scripts/*_down.sql`）；套 prod 走 migration 閘（High） |
| C2.2 | 新檔 `NA/lib/outreach/brand-context.ts`：純函式 `buildBrandContext({profile, sender, evidence, goal})` 依 SPEC §5.3 順序組 prompt 段落；證據以 SOURCE_QUOTATION 包裹；單元測試：缺署名 throw、證據段只含 approved |
| C2.3 | 新檔 `NA/lib/outreach/generation-schema.ts`：`parseGenerationOutput(raw)` 手寫型別守衛（repo 無 zod，不加依賴）：`subjects[2]`、`bodies[2]{label,text,evidence_ids}`、`followups[]{step,delay_days,text}`；壞 JSON 允許 1 次修復重試（把錯誤回給模型），再失敗走既有 `manual_prompt` |
| C2.4 | `NA/app/api/outreach/messages/route.ts`：`buildPrompt` 改呼叫 brand-context；輸出經 generation-schema → 寫 2 列 `cold_email`（`variant_label` A／B、`subject`、`version=1`）＋ N 列 `followup`（`version=step`、`followup_delay_days`、`subject=null`）；每列 `lintMessage`＋主旨 lint（≤25 字、無 `HARD_CTA`、無「免費」「限時」）→ `safety_score`、`quality_gate_status`、`gate_snapshot={gate_version,findings}`、`evidence_snapshot={evidence_ids}` |
| C2.5 | UI：Connectors 頁寄件帳號加「署名」多行欄，預設＝`display_name`＋org 名稱，網站那行操作者填一次（SPEC D12），空白不能存；Review 頁 A／B 並排＋主旨，核准一版（另一版 `skipped`）；`NA/app/(shell)/outreach/drafts/page.tsx` stub 刪除、側欄移除（Review 已涵蓋） |
| C2.6 | 測試：`npx tsc --noEmit`、vitest（brand-context、generation-schema、route 寫列數）；REALTEST：本機 dev 對一個測試 lead 用 BYO key 真產一次 → `co_messages` 4 列、主旨非空、內文以署名結尾 |

### C3 研究 → 證據

| 卡號 | 做什麼 |
|---|---|
| C3.1 | `DB/migrations/0150_co_evidence.sql`：`co_evidence(id, organization_id, lead_id FK cascade, claim text, source_url text, excerpt text, source_label text, captured_at timestamptz default now(), source_date date, confidence numeric, status text check in ('pending','approved','rejected') default 'pending', created_by text, created_at)`；RLS service-role（照 `DB/migrations/0048_co_outreach_core.sql:5-11`）；index `(lead_id, status)`；唯一鍵 `(lead_id, source_url, claim)`；down 兩處 |
| C3.2 | 先改 `NA/lib/ai/cheap-json.ts`：`CheapJsonTextArgs` 加選用 `grant`，兩條路（`:40` OpenAI、`:86` Anthropic）改用 `args.grant ?? await grantFor("ops.cheap-json")`，既有呼叫點不變。新檔 `NA/lib/collect/sinks/outreach-research.ts`（一個 sink 兩種純輸出：證據列＋聯絡 email，見 C3.7）：`SinkBlock`（`NA/lib/collect/types.ts:253-270`）；`run(docs)`：每份 doc → `generateCheapJsonText({ grant: grantFor("outreach.research", …) })` 抽 ≤3 `{claim, excerpt}`；`excerpt` 必須是 `doc.text` 的子字串（機械驗，否則丟棄並計 skipped）；寫 `co_evidence` pending，`source_url=doc.canonicalUrl`、`source_label=doc.collector`、`source_date=doc.publishedAt`（`doc.provenance` 是物件且恆為 EVIDENCE，`types.ts:41-45`，不存） |
| C3.3 | 新檔 `NA/lib/outreach/research.ts`＋新路由 `NA/app/api/outreach/leads/research/route.ts`（POST `{leadId}`）：seeds＝lead `website`、`social_url`（各 `scope` 該 host，`meta.entityName=name`，`meta.anchors=[name]`）→ `crawl(seeds, {sink, budget ≤15 頁／60 秒, callProvider: serper 若已設, maxDepth: 2})`（`NA/lib/collect/orchestrator.ts:254`；`maxDepth` 含種子頁，2＝首頁＋一層，`:404`）；非同步＋輪詢照 `NA/app/api/ops/clients/[slug]/collection-sources/route.ts:106` 與 `NA/lib/collect/run-jobs.ts`；0 claim → timeline `research_insufficient`，不生成 |
| C3.4 | `NA/lib/portal/products.ts:88` features 加 `quota("outreach.research", "客戶研究")`；`products.test.ts` 綠 |
| C3.5 | UI：Leads 頁每筆「研究這家（約 NT$x）」按鈕（費用由 `NA/lib/ai/cost-model.ts` 算）；證據列表 approve／reject 兩顆按鈕；`NA/lib/outreach/cold-gate.ts` `checkColdGate` 改：≥1 approved evidence 通過；過渡期舊 `observation+source_url` 亦通過（C9 收） |
| C3.6 | 測試：sink 子字串驗證（假 doc、假 JSON）；REALTEST：本機對 1 個真實公開網站跑研究 → `co_evidence` ≥1 列且 excerpt 可在頁面原文找到 |
| C3.7 | 同一 sink 的純程式段：每份 doc 從 `doc.raw.bytes`（HTML）抓 `mailto:` 與從 `doc.text` 抓 email（regex），排除圖檔名誤判，優先與 seed 網站同網域；lead `email` 為空才寫 `co_leads.email`，timeline `email_found{source_url}`；接著呼叫 C1.5 `verifyEmails` 寫 `co_verified_emails`。測試：mailto 優先、同網域優先、已有 email 不覆蓋；REALTEST：對 1 個真實店家網站跑研究 → `co_leads.email` 填入且在頁面找得到 |

### C4 回覆同步與 Replies 頁

| 卡號 | 做什麼 |
|---|---|
| C4.1 | `DB/migrations/0151_co_replies.sql`：採 v1 spec §B6 欄位＋`gmail_message_id text unique`、`received_at timestamptz`、`classified_by text`；RLS 照 0048；down 兩處 |
| C4.2 | `NA/lib/outreach/google-oauth.ts`：`GMAIL_SCOPE` → `gmail.compose`＋`gmail.readonly`；`createGmailDraft` 回 `{id, message:{id, threadId}}`；`NA/app/api/outreach/messages/gmail-draft/route.ts:179-188` 事件 `metadata={threadId, messageId}`；`NA/lib/outreach/__tests__/google-oauth.test.ts:60` 改斷言只含這兩個 scope；部署後操作者兩步：Google Cloud Console → OAuth 同意畫面 → 按「發布應用程式」（SPEC D13）→ 在 Connectors 頁重新連 Gmail 一次 |
| C4.3 | 新檔 `NA/lib/outreach/gmail-sync.ts`，每個啟用的 Gmail connector 兩段（SPEC §5.6）：①**已寄偵測**：`co_messages.status ∈ {drafted, sending}` 且事件有 threadId → `threads.get?format=metadata`，本方訊息帶 `SENT` label → `sent`、`sent_at`、事件 `sent`、lead `status='sent'`、`last_contact_date`、`next_followup_date`；②**來信比對**：`messages.list?q=in:inbox newer_than:7d -from:me` → `messages.get?format=metadata&metadataHeaders=From,Subject,In-Reply-To,X-Failed-Recipients` → 寄件人 email（小寫）比對同 org `co_leads.email`，不看 lead 狀態也不看 thread（新開的信、`List-Unsubscribe` 寄來的信、`no_reply` 之後的回信都抓得到）→ upsert `co_replies`（`gmail_message_id` 唯一＝重跑冪等）；`From` 含 `mailer-daemon` → 以 `X-Failed-Recipients` 比對 lead → 事件 `hard_bounced`＋suppression `hard_bounce`＋`do_not_contact` |
| C4.4 | 分類：主旨為 `unsubscribe`（`List-Unsubscribe` mailto，C1.3）直接記 `unsubscribe` 不叫 AI；其餘 `generateCheapJsonText({ grant: grantFor("outreach.classify", …) })` → `reply_type`（v1 九種）＋`suggested_response`；`NA/lib/portal/products.ts:88` 加 `quota("outreach.classify", "回信分類")`。lead：`status='replied'`、`next_followup_date=null`、`consent_status` 由 `unknown`／`legitimate_interest` 升為 `replied`（不降 `opted_in`／`form_submitted`／`customer`）；`unsubscribe` → `consent_status='unsubscribed'`＋suppression `unsubscribe`＋`do_not_contact`；`reject` → `consent_status='do_not_contact'`＋suppression `manual_opt_out`＋`do_not_contact`；全部寫 `co_timeline_events` |
| C4.5 | 新路由 `NA/app/api/internal/outreach/gmail-sync/route.ts`（Bearer `OUTREACH_SYNC_TOKEN`，照 `NA/app/api/internal/schedules/alerts/route.ts:21-25`）；`HS/cron.d/awarewave-schedules` 加 `*/10` 一行經 `poke.sh`；`NA/lib/schedules/host-jobs.ts` 登記 `outreach_gmail_sync`；安裝主機 cron（High） |
| C4.6 | `NA/app/(shell)/outreach/replies/page.tsx` 取代 stub：全 org 列表（時間、lead、分類、原文摘要）；按鈕：產報價摘要（`output_type=proposal_summary`）、問正確窗口、加入拒收、同步 FluentCRM（C6 後啟用）、約到會議、成交、失去（各改 `co_leads.status`） |
| C4.7 | 測試：假回應四情境（已寄、同串回信、新開一封的退訂信、`no_reply` 後回信）＋退信；同一 `gmail_message_id` 跑兩次只一列；REALTEST（部署後）：操作者寄 1 封給自己的另一信箱並回覆 → 10 分內 Replies 出現該列、lead 狀態 replied、follow-up 日期清空 |

### C5 追蹤信與人工步驟

| 卡號 | 做什麼 |
|---|---|
| C5.1 | `NA/app/(shell)/outreach/followups/page.tsx`：列出 `next_followup_date ≤ 今天` 且 `status='sent'` 的 lead，顯示下一封 followup 列（最小未寄 `version`）；「建草稿（回同一串）」按鈕 |
| C5.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts` 接受 followup 列：MIME 加 `In-Reply-To`／`References`＝本方上一封的 `Message-ID`（`threads.get` headers），`drafts.create` 帶 `threadId`；事件照常 |
| C5.3 | 最後一封寄出後經其 `followup_delay_days` 無回信 → lead `status='no_reply'`（在 gmail-sync tick 判）；`no_reply` 不是同步終點，之後來信由 C4.3 ② 照常改成 `replied` |
| C5.4 | `channel≠email` 的步驟（`co_messages.channel` ig_dm／linkedin／phone）在同頁顯示為待辦＋「完成」按鈕（寫 timeline，推進 `next_followup_date`）；本卡只顯示與完成，不產生這類步驟（SPEC §2 D9） |
| C5.5 | 測試：In-Reply-To 組裝；REALTEST：本機建一封 followup 草稿 → Gmail 中出現在原 thread |

### C6 暖名單進 FluentCRM

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `WPB/includes/Http/RestController.php`：`POST /fluentcrm/contact`（signed write，照 `/newsletter` `:92-103`）→ 新檔 `WPB/includes/Crm/ContactUpserter.php`：upsert contact（email 唯一）＋lists／tags；FluentCRM 未啟用回 `fluentcrm_not_active`（照 `:366`）；不碰 sequences、不寄信 |
| C6.2 | `WPB` `AWBRIDGE_VERSION` 0.19.0 → 0.20.0；`scripts/release-wp-bridge.sh`（`bash` 執行；觸發索引：改 wp-bridge 必跑）；客戶站更新＝High |
| C6.3 | 新路由 `NA/app/api/outreach/leads/sync-fluentcrm/route.ts`（POST `{leadId}`）：資格＝`consent_status ∈ {replied, opted_in, form_submitted, customer}` ∧ 非 suppression（marketing／all）；`NA/lib/crm/fluentcrm.ts` 加 `upsertContact(spec, {clientId})`（走 `bridgePost`，照 `createNewsletter` 寫法）；`clientId`＝該 org active `wp_sites.url` 的 host 對上 `NA/lib/payments/woo.ts:75-82` `rawBridgeEnv` 各站 base URL，對不到 422 `no_bridge`（SPEC D16）；成功寫 `fluentcrm_contact_id`、`fluentcrm_sync_status='synced'`、`fluentcrm_last_synced_at`、timeline；不合格 422 `not_eligible` |
| C6.4 | Replies 頁「同步 FluentCRM」按鈕接上；測試：資格判斷四種 consent 與 suppression；REALTEST：對 staging WP 同步 1 個測試 lead → FluentCRM 出現 contact |

### C7 成效頁

| 卡號 | 做什麼 |
|---|---|
| C7.1 | 新路由 `NA/app/api/outreach/stats/route.ts`（GET `?organizationId&from&to`）：依 service_profile × variant_label × angle 計 generated／drafted／sent／bounced／replied／positive／meeting_booked／customer／lost（SPEC §5.9；SQL 聚合 `co_messages`、`co_sending_events`、`co_replies`、`co_leads`） |
| C7.2 | `NA/app/(shell)/outreach/page.tsx` 取代 stub：一張表＋回覆率、正向回覆率；無開信率欄位；CSV 下載 |
| C7.3 | 測試：聚合對假資料的計數；REALTEST：本機種 3 筆 lead 走到 replied → 表數字正確 |

### C8 系統寄出開關（send_mode）

| 卡號 | 做什麼 |
|---|---|
| C8.1 | `DB/migrations/0152_send_mode.sql`：`co_sender_accounts.send_mode text not null default 'draft' check (send_mode in ('draft','auto'))`、`co_sender_accounts.daily_count_date date`；`co_messages.status` CHECK 加 `sending`；down 兩處 |
| C8.2 | 新檔 `NA/lib/outreach/send-adapter.ts`（never-sends 測試唯一白名單）：`sendDraft(draftId)`＝`drafts.send`；只在 `send_mode='auto'` ∧ `health_status='healthy'` ∧ 台北 09–18 週一至五 ∧ 重查 I6 → **先佔名額**：讀 `daily_sent_count`／`daily_count_date`（`0048:242`），以 compare-and-set 寫回（日期是今天：`.update({daily_sent_count: n+1}).eq('id').eq('daily_sent_count', n).eq('daily_count_date', today)` 且 `n < daily_limit`；不是今天：設 `(1, today)` 並 `.eq` 舊值），0 列更新＝被別人搶先或已滿，不寄 → **再鎖信**：`UPDATE co_messages SET status='sending' WHERE id=$1 AND status='drafted'` → 寄 → `sent`；寄失敗不退名額（寧少不多）；逾時／5xx 留 `sending`，由 gmail-sync 以 `SENT` label 對帳，30 分未對到 → `needs_edit`＋timeline，永不盲目重寄 |
| C8.3 | gmail-sync tick 末尾呼叫 send-adapter；Connectors 頁每個寄件帳號「系統寄出：關／開」按鈕，開需輸入帳號 email 確認；翻開＝High，每帳號一次（SPEC D17 回頭條件達成後） |
| C8.4 | 測試：同一封信兩次呼叫只寄一次；同帳號已寄 19／上限 20 時兩封不同的信同時呼叫只寄一封；跨日歸零；視窗外不寄、paused 不寄；REALTEST：操作者自己的帳號開 auto、1 封寄到自己另一信箱 |

### C9 舊欄位退場（contract）

| 卡號 | 做什麼 |
|---|---|
| C9.1 | 回填腳本（冪等）：每個有 `observation+source_url` 且無 evidence 的 lead → 1 列 approved evidence（`created_by='backfill'`） |
| C9.2 | `checkColdGate` 只看 evidence；inbox 匯入的 `observation` 寫成 evidence 列；`NA/lib/outreach/scoring.ts` 的 observation 加分改讀 evidence 數；欄位保留不刪 |

### C10 名單發現

| 卡號 | 做什麼 |
|---|---|
| C10.1 | `NA/lib/collect/net/providers.ts:88` serper `allowedPaths` 加 `/places`（同段註解要求：有呼叫者才放寬）；新檔 `NA/lib/outreach/discover.ts`：經 `createProviderCall`（`NA/lib/collect/index.ts` 匯出，帶預算與限速）`POST /places {q:"<查詢字> <地區>", gl:"tw", hl:"zh-tw"}` → 先真打一次記下回應形狀寫進檔頭（照 `NA/lib/collect/search/drivers.ts:67` 慣例）→ 每筆 `{title, address, phoneNumber, website, cid}`（`phoneNumber` 有時是地址，只收符合 `^\+?[\d\s()-]{7,}$` 的值，其餘留空）→ `co_lead_inbox`（`source_type='serper_places'`、`source_url=https://maps.google.com/?cid=<cid>`），再走既有 normalize／dedup／suppression（`NA/app/api/outreach/inbox/route.ts`）；沒有 email 的候選核准進名單後由 C3.7 補；每次 ≤20 筆；`NA/lib/outreach/connectors/router.ts:34` 的 `places` 槽位 note 改為 Serper |
| C10.2 | Inbox 頁「找名單」表單（查詢字、地區兩個輸入框），按鈕顯示每次查詢費用；測試：假回應 → 20 筆 inbox、重複的被標出；REALTEST：1 次真查 |

## 7. 驗證計畫（四動作）

- 實測：每卡最後一項是 REALTEST（本機 dev 或部署後真跑）；`.ts` 改動前 `npx tsc --noEmit`；migration 先本機 Supabase 套用再走 prod 閘。
- Review：Claude 寫的卡 `/codex-review`（每 commit 1 個，Standard）；Codex 寫的卡 `/claude-review`；auth／scope 改動（C4.2、C8）Deep。
- 抓蟲：grep `observation`、`source_url`、`GMAIL_SCOPE`、`draft_created`、`next_followup_date`、`fluentcrm_sync_status` 的 call sites，scope `agency-os,scripts,lobster-factory,.claude`。
- WORKLOG：每卡一條，四行機械證據；監工台 `data.mjs` 改狀態＋commit → `node build.mjs && node check.mjs` → 重新發布同一網址。
