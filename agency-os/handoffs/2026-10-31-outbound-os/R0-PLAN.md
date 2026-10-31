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
| R1 | Google 專案 Testing 模式＋restricted scope → refresh token 7 天到期，10-14 的連線可能已斷 | C1.4 VBC；待決 1 改發布狀態 |
| R2 | 證據改表動到 `co_leads`（prod 有資料） | expand（C3）→ 回填（C9）→ 停寫；不刪欄；migration 套 prod 走閘（High） |
| R3 | 加 `gmail.readonly` 要操作者重新授權 | C4.2 一次；待決 1 先定 |
| R4 | 研究抓到的網頁是攻擊面（prompt injection） | 走 collect 既有 provenance 篩查；證據包 SOURCE_QUOTATION；excerpt 子字串機械驗（C3.2） |
| R5 | `auto` 寄出重複寄或退訂後仍寄 | 狀態鎖 `drafted→sending`、寄前重查、逾時只對帳不重寄（C8.2） |
| R6 | wp-bridge 外掛更新到客戶站 | C6.2 High，照 release 腳本 |
| R7 | 規格膨脹 | SPEC ≤ 300 行；一事一處；卡只寫做法 |

## 4. 方案比較

- A 最小：只補主旨、署名、定位三處（C2 的一半）。Rollback：revert 一個 commit。缺：頭尾仍沒接，仍是「把信寫出來」。
- B 完整：C1–C8 八張卡依序，各自獨立 commit、各自 rollback（migration 有 down 檔兩處；route 新檔刪即回復；cron 行刪即回復）；C9／C10 parked。

## 5. 建議方案

B。順序：C1（守衛）→ C2（信本身）→ C3（研究）→ C4＋C6 並行（回信／暖名單，不同檔）→ C5＋C7 並行（追蹤／成效）→ C8（開關）。每張卡完成就能單獨上線，不等整套。

## 6. 實作計畫

### C1 守衛與事實訂正

| 卡號 | 做什麼 |
|---|---|
| C1.1 | `NA/lib/outreach/MODULE_MANIFEST.json:22` 與 `NA/lib/outreach/google-oauth.ts:1-10` 註解改寫：scope `gmail.compose` 允許 `drafts.send`，不寄的守衛是程式；新檔 `NA/lib/outreach/__tests__/never-sends.test.ts`：讀 `lib/outreach/**` 與 `app/api/outreach/**` 原始碼，出現 `/drafts/send`、`/messages/send`、`gmail.send`、`gmail.modify` 即紅（白名單只允許 C8 的 `send-adapter.ts`） |
| C1.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts`：建草稿前重查 lead `do_not_contact` 與 `co_suppression_list`（用 `NA/lib/outreach/normalize.ts` 的 `isSuppressed`，applies_to cold／all）→ 409 `{blocked:true, reason}`；測試：lead 標 do_not_contact → 409 |
| C1.3 | `NA/lib/outreach/google-oauth.ts` `buildRfc2822Message`：加 `List-Unsubscribe: <mailto:<from>?subject=unsubscribe>`（RFC 2369）；測試斷言 header 存在且與 from 一致 |
| C1.4 | VBC：prod `co_connector_accounts` 的 Gmail connector 是否仍能 refresh（`timeout 60 ssh … docker exec … psql` 讀 `updated_at`／`is_enabled`，再對 Google token endpoint refresh 一次，不寫 DB）；結果寫 WORKLOG 與監工台 NOW；失敗＝Testing 7 天到期已發生 → 待決 1 |

### C2 署名、定位、主旨、多版本、追蹤信內容

| 卡號 | 做什麼 |
|---|---|
| C2.1 | `DB/migrations/0149_outbound_v2_expand.sql`（號碼以當時最大＋1）：`co_sender_accounts.signature_block text`；`co_messages.followup_delay_days int`、`co_messages.gate_snapshot jsonb`；down 檔兩處（`DB/migrations/*.down.sql`、`DB/scripts/*_down.sql`）；套 prod 走 migration 閘（High） |
| C2.2 | 新檔 `NA/lib/outreach/brand-context.ts`：純函式 `buildBrandContext({profile, sender, evidence, goal})` 依 SPEC §5.3 順序組 prompt 段落；證據以 SOURCE_QUOTATION 包裹；單元測試：缺署名 throw、證據段只含 approved |
| C2.3 | 新檔 `NA/lib/outreach/generation-schema.ts`：`parseGenerationOutput(raw)` 手寫型別守衛（repo 無 zod，不加依賴）：`subjects[2]`、`bodies[2]{label,text,evidence_ids}`、`followups[]{step,delay_days,text}`；壞 JSON 允許 1 次修復重試（把錯誤回給模型），再失敗走既有 `manual_prompt` |
| C2.4 | `NA/app/api/outreach/messages/route.ts`：`buildPrompt` 改呼叫 brand-context；輸出經 generation-schema → 寫 2 列 `cold_email`（`variant_label` A／B、`subject`、`version=1`）＋ N 列 `followup`（`version=step`、`followup_delay_days`、`subject=null`）；每列 `lintMessage`＋主旨 lint（≤25 字、無 `HARD_CTA`、無「免費」「限時」）→ `safety_score`、`quality_gate_status`、`gate_snapshot={gate_version,findings}`、`evidence_snapshot={evidence_ids}` |
| C2.5 | UI：Connectors 頁寄件帳號加「署名」多行欄；Review 頁 A／B 並排＋主旨，核准一版（另一版 `skipped`）；`NA/app/(shell)/outreach/drafts/page.tsx` stub 刪除、側欄移除（Review 已涵蓋） |
| C2.6 | 測試：`npx tsc --noEmit`、vitest（brand-context、generation-schema、route 寫列數）；REALTEST：本機 dev 對一個測試 lead 用 BYO key 真產一次 → `co_messages` 4 列、主旨非空、內文以署名結尾 |

### C3 研究 → 證據

| 卡號 | 做什麼 |
|---|---|
| C3.1 | `DB/migrations/0150_co_evidence.sql`：`co_evidence(id, organization_id, lead_id FK cascade, claim text, source_url text, excerpt text, source_label text, captured_at timestamptz default now(), source_date date, confidence numeric, status text check in ('pending','approved','rejected') default 'pending', created_by text, created_at)`；RLS service-role（照 `DB/migrations/0048_co_outreach_core.sql:5-11`）；index `(lead_id, status)`；唯一鍵 `(lead_id, source_url, claim)`；down 兩處 |
| C3.2 | 新檔 `NA/lib/collect/sinks/outreach-evidence.ts`：`SinkBlock`（`NA/lib/collect/types.ts:253-270`）；`run(docs)`：每份 doc → `generateCheapJsonText`（`NA/lib/ai/cheap-json.ts:33`，grant `outreach.research`）抽 ≤3 `{claim, excerpt}`；`excerpt` 必須是 `doc.text` 的子字串（機械驗，否則丟棄並計 skipped）；寫 `co_evidence` pending，`source_label=doc.provenance` |
| C3.3 | 新檔 `NA/lib/outreach/research.ts`＋新路由 `NA/app/api/outreach/leads/research/route.ts`（POST `{leadId}`）：seeds＝lead `website`、`social_url`（各 `scope` 該 host，`meta.entityName=name`，`meta.anchors=[name]`）→ `crawl(seeds, {sink, budget ≤15 頁／60 秒, callProvider: serper 若已設, maxDepth 1})`（`NA/lib/collect/orchestrator.ts:254`）；非同步＋輪詢照 `NA/app/api/ops/clients/[slug]/collection-sources/route.ts:106` 與 `NA/lib/collect/run-jobs.ts`；0 claim → timeline `research_insufficient`，不生成 |
| C3.4 | `NA/lib/portal/products.ts:88` features 加 `quota("outreach.research", "客戶研究")`；`products.test.ts` 綠 |
| C3.5 | UI：Leads 頁每筆「研究這家（約 NT$x）」按鈕（費用由 `NA/lib/ai/cost-model.ts` 算）；證據列表 approve／reject 兩顆按鈕；`NA/lib/outreach/cold-gate.ts` `checkColdGate` 改：≥1 approved evidence 通過；過渡期舊 `observation+source_url` 亦通過（C9 收） |
| C3.6 | 測試：sink 子字串驗證（假 doc、假 JSON）；REALTEST：本機對 1 個真實公開網站跑研究 → `co_evidence` ≥1 列且 excerpt 可在頁面原文找到 |

### C4 回覆同步與 Replies 頁

| 卡號 | 做什麼 |
|---|---|
| C4.1 | `DB/migrations/0151_co_replies.sql`：採 v1 spec §B6 欄位＋`gmail_message_id text unique`、`received_at timestamptz`、`classified_by text`；RLS 照 0048；down 兩處 |
| C4.2 | `NA/lib/outreach/google-oauth.ts`：`GMAIL_SCOPE` → `gmail.compose`＋`gmail.readonly`；`createGmailDraft` 回 `{id, message:{id, threadId}}`；`NA/app/api/outreach/messages/gmail-draft/route.ts:179-188` 事件 `metadata={threadId, messageId}`；`NA/lib/outreach/__tests__/google-oauth.test.ts:60` 改斷言只含這兩個 scope；操作者重新授權一次（待決 1 先定） |
| C4.3 | 新檔 `NA/lib/outreach/gmail-sync.ts`：每個啟用的 Gmail connector：取 `co_sending_events` 有 threadId 且 lead 未結案的 thread → `threads.get?format=metadata` → ①本方訊息帶 `SENT` label 且 message 未 sent → `co_messages.status='sent'`、`sent_at`、事件 `sent`、lead `status='sent'`、`last_contact_date`、`next_followup_date=sent＋下一封 followup_delay_days`；②`From`≠sender → upsert `co_replies`（`gmail_message_id`）；③`From` 含 `mailer-daemon` → 事件 `hard_bounced`＋suppression `hard_bounce`＋`do_not_contact` |
| C4.4 | 分類：`generateCheapJsonText` → `reply_type`（v1 九種）＋`suggested_response`；lead `status='replied'`、`next_followup_date=null`；`unsubscribe`／`reject` → suppression（reason `unsubscribe`／`manual_opt_out`）＋`do_not_contact`；全部寫 `co_timeline_events` |
| C4.5 | 新路由 `NA/app/api/internal/outreach/gmail-sync/route.ts`（Bearer `OUTREACH_SYNC_TOKEN`，照 `NA/app/api/internal/schedules/alerts/route.ts:21-25`）；`HS/cron.d/awarewave-schedules` 加 `*/10` 一行經 `poke.sh`；`NA/lib/schedules/host-jobs.ts` 登記 `outreach_gmail_sync`；安裝主機 cron（High） |
| C4.6 | `NA/app/(shell)/outreach/replies/page.tsx` 取代 stub：全 org 列表（時間、lead、分類、原文摘要）；按鈕：產報價摘要（`output_type=proposal_summary`）、問正確窗口、加入拒收、同步 FluentCRM（C6 後啟用）、約到會議、成交、失去（各改 `co_leads.status`） |
| C4.7 | 測試：threads.get 假回應三情境（已寄／回信／退信）；REALTEST（部署後）：操作者寄 1 封給自己的另一信箱並回覆 → 10 分內 Replies 出現該列、lead 狀態 replied、follow-up 日期清空 |

### C5 追蹤信與人工步驟

| 卡號 | 做什麼 |
|---|---|
| C5.1 | `NA/app/(shell)/outreach/followups/page.tsx`：列出 `next_followup_date ≤ 今天` 且 `status='sent'` 的 lead，顯示下一封 followup 列（最小未寄 `version`）；「建草稿（回同一串）」按鈕 |
| C5.2 | `NA/app/api/outreach/messages/gmail-draft/route.ts` 接受 followup 列：MIME 加 `In-Reply-To`／`References`＝本方上一封的 `Message-ID`（`threads.get` headers），`drafts.create` 帶 `threadId`；事件照常 |
| C5.3 | 最後一封寄出後經其 `followup_delay_days` 無回信 → lead `status='no_reply'`（在 gmail-sync tick 判） |
| C5.4 | `channel≠email` 的步驟（`co_messages.channel` ig_dm／linkedin／phone）在同頁顯示為待辦＋「完成」按鈕（寫 timeline，推進 `next_followup_date`）；本卡只顯示與完成，不產生這類步驟（SPEC §2 D9） |
| C5.5 | 測試：In-Reply-To 組裝；REALTEST：本機建一封 followup 草稿 → Gmail 中出現在原 thread |

### C6 暖名單進 FluentCRM

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `WPB/includes/Http/RestController.php`：`POST /fluentcrm/contact`（signed write，照 `/newsletter` `:92-103`）→ 新檔 `WPB/includes/Crm/ContactUpserter.php`：upsert contact（email 唯一）＋lists／tags；FluentCRM 未啟用回 `fluentcrm_not_active`（照 `:366`）；不碰 sequences、不寄信 |
| C6.2 | `WPB` `AWBRIDGE_VERSION` 0.19.0 → 0.20.0；`scripts/release-wp-bridge.sh`（`bash` 執行；觸發索引：改 wp-bridge 必跑）；客戶站更新＝High |
| C6.3 | 新路由 `NA/app/api/outreach/leads/sync-fluentcrm/route.ts`（POST `{leadId}`）：資格＝`consent_status ∈ {replied, opted_in, form_submitted, customer}` ∧ 非 suppression（marketing／all）；呼叫該 org 站的 wp-bridge（簽章照 `NA/lib/payments/woo.ts` 的呼叫方式）；成功寫 `fluentcrm_contact_id`、`fluentcrm_sync_status='synced'`、`fluentcrm_last_synced_at`、timeline；不合格 422 `not_eligible` |
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
| C8.1 | `DB/migrations/0152_send_mode.sql`：`co_sender_accounts.send_mode text not null default 'draft' check (send_mode in ('draft','auto'))`；`co_messages.status` CHECK 加 `sending`；down 兩處 |
| C8.2 | 新檔 `NA/lib/outreach/send-adapter.ts`（never-sends 測試唯一白名單）：`sendDraft(draftId)`＝`drafts.send`；只在 `send_mode='auto'` ∧ `health_status='healthy'` ∧ 台北 09–18 週一至五 ∧ 當日未達 `daily_limit` ∧ 重查 I6 → `UPDATE co_messages SET status='sending' WHERE id=$1 AND status='drafted'` 取鎖 → 寄 → `sent`；逾時／5xx 留 `sending`，由 gmail-sync 以 `SENT` label 對帳，30 分未對到 → `needs_edit`＋timeline，永不盲目重寄 |
| C8.3 | gmail-sync tick 末尾呼叫 send-adapter；Connectors 頁每個寄件帳號「系統寄出：關／開」按鈕，開需輸入帳號 email 確認；翻開＝High，每帳號一次（待決 4） |
| C8.4 | 測試：鎖競爭（兩次呼叫只寄一次）、視窗外不寄、paused 不寄；REALTEST：操作者自己的帳號開 auto、1 封寄到自己另一信箱 |

### C9 舊欄位退場（contract）

| 卡號 | 做什麼 |
|---|---|
| C9.1 | 回填腳本（冪等）：每個有 `observation+source_url` 且無 evidence 的 lead → 1 列 approved evidence（`created_by='backfill'`） |
| C9.2 | `checkColdGate` 只看 evidence；inbox 匯入的 `observation` 寫成 evidence 列；`NA/lib/outreach/scoring.ts` 的 observation 加分改讀 evidence 數；欄位保留不刪 |

### C10 名單發現

| 卡號 | 做什麼 |
|---|---|
| C10.1 | connector `places`（`NA/lib/outreach/connectors/router.ts:34`）接 Google Places Text Search：查詢字＋地區 → 候選（name, website, phone, address, maps url）→ `co_lead_inbox`（`source_type='google_places'`, `source_url=maps url`）；費用顯示；每次 ≤20 筆 |
| C10.2 | Inbox 頁「找名單」表單（查詢字、地區）；測試：假回應 → 20 筆 inbox；REALTEST：1 次真查 |

## 7. 驗證計畫（四動作）

- 實測：每卡最後一項是 REALTEST（本機 dev 或部署後真跑）；`.ts` 改動前 `npx tsc --noEmit`；migration 先本機 Supabase 套用再走 prod 閘。
- Review：Claude 寫的卡 `/codex-review`（每 commit 1 個，Standard）；Codex 寫的卡 `/claude-review`；auth／scope 改動（C4.2、C8）Deep。
- 抓蟲：grep `observation`、`source_url`、`GMAIL_SCOPE`、`draft_created`、`next_followup_date`、`fluentcrm_sync_status` 的 call sites，scope `agency-os,scripts,lobster-factory,.claude`。
- WORKLOG：每卡一條，四行機械證據；監工台 `data.mjs` 改狀態＋commit → `node build.mjs && node check.mjs` → 重新發布同一網址。
