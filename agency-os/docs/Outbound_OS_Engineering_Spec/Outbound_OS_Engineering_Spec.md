# Outbound OS — 工程規格 v2

> 版本 v2.0｜2026-10-31｜取代本檔 v1.0（GPT 草案，原文在 git `26bce3452`，它自述未讀過本 repo）。
> 讀者：執行卡片的 agent。事實密度優先；每個主張附 `file:line`。
> 分工：**規則與契約在本檔**；執行順序與卡片在 [`agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md`](../../handoffs/2026-10-31-outbound-os/R0-PLAN.md) §6；狀態只在同目錄 `data.mjs`（監工台）。
> 正本關係：[v1 integrated spec](COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md) 仍是 12 張 `co_*` 表與 UX 的正本，本檔只寫增量；v1 §E3（n8n 流程）、§G3（路線圖）由本檔 §6、R0-PLAN 取代。[deliverability v3](cold_email_deliverability_compliance_v3_final.md) 仍是寄送規則正本（§6.2 Cold Gate、§11 stream、§12 DNS）。
> 路徑縮寫：`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`、`DB`＝`lobster-factory/packages/db`、`WPB`＝`lobster-factory/packages/wp-bridge-plugin`、`HS`＝`lobster-factory/infra/hetzner-phase1-core/scripts`。

## 0. 定位與不變量

**定位**：冷信的工作是換到一個回覆，不是介紹產品。系統負責找證據、寫信、守規矩、讀回信、記成效；按寄出的是人，直到你把某個帳號的 `send_mode` 打開。品牌＝organization，多品牌＝多 org，今天就能跑。

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
| D12 | 冷信寄件身分＝品牌自己的 Workspace／Gmail 信箱、低量、人工寄；不買專用網域；stream 不混用 | deliverability §11（`:590-611`）；全新網域零信譽 |
| D13 | Google OAuth 專案 Testing → 發布（unverified）：消除 7 天 token 到期；100 帳號上限內部使用可接受 | 待決 1（操作者在 Console 操作） |
| D14 | n8n 不在路徑；v1 §E3 superseded；整台去留另案 | 5 條 workflow 全 `active:false`（2026-10-31 查）；T10 已改 next-admin route（`agency-os/TASKS.md:1176`） |
| D15 | 不加依賴：JSON 守衛手寫（repo 無 zod） | `NA/package.json` 無 zod；`cheap-json.ts:29` 已有 `extractJsonArray` 慣例 |

## 3. GPT 企業版 12 模組對照

| 模組 | 處置 | 落點 |
|---|---|---|
| 01 多品牌工作區 | 有 | organizations＋`?org=`；跨 org 全看＝ops-role（`NA/lib/ops-role.ts:120-124`） |
| 02 Lead discovery | 卡 C10（parked） | Google Places → `co_lead_inbox`；待決 5 |
| 03 Enrichment | 部分 | `co_evidence` 兼任（每個事實附來源與時間）；Hunter／Snov 槽位（`NA/lib/outreach/connectors/router.ts:26-27`）有 key 再接 |
| 04 AI research & personalization | 卡 C2、C3 | brand-context＋evidence |
| 05 Email infrastructure | 有 | `co_sender_accounts`、Gmail OAuth；DNS 清單 deliverability §12 |
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
| `0152_send_mode` | `co_sender_accounts.send_mode text default 'draft' check (draft／auto)`；`co_messages.status` CHECK 加 `sending` | C8.1 |
| 不加欄 | thread 對應存 `co_sending_events.metadata={threadId, messageId}`（`0048:273` 已有 jsonb） | C4.2 |
| contract（parked） | `co_leads.observation`／`source_url` 停寫，由 evidence 取代；欄位不刪 | C9 |

號碼以當時最大＋1 為準。Down 檔兩處：`DB/migrations/<n>_<name>.down.sql` 與 `DB/scripts/<n>_<name>_down.sql`（0147、0148 慣例）。

## 5. 流程契約

### 5.1 研究（C3）
輸入 lead 的 `name`、`website`、`social_url`。seeds＝website 與 social_url 各一（`scope` 該 host、`meta.entityName=name`、`meta.anchors=[name]`）→ `crawl(seeds, {sink: outreach-evidence, budget ≤15 頁／60 秒, callProvider: serper 若已設, maxDepth: 1})`（`NA/lib/collect/orchestrator.ts:254`）。非同步＋輪詢照 `/ops/collect`（`NA/app/api/ops/clients/[slug]/collection-sources/route.ts:106`、`NA/lib/collect/run-jobs.ts`）。sink 對每份已過品質閘與 provenance 篩查的 doc 呼叫 `generateCheapJsonText` 抽 ≤3 `{claim, excerpt}`；`excerpt` 必須是 `doc.text` 的子字串（機械驗，不符丟棄）；寫 `co_evidence` pending。0 claim → timeline `research_insufficient`，不生成。費用：grant `outreach.research`，按鈕顯示估價（`NA/lib/ai/cost-model.ts`）。

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

### 5.5 寄出接頭（C8）
`send_mode='draft'`：到此為止，人在 Gmail 按。`auto`：sync tick 末尾，條件 `health_status='healthy'` ∧ 台北 09–18 週一至五 ∧ 當日 `sent` 事件 < `daily_limit` ∧ 重查 I6 → `UPDATE co_messages SET status='sending' WHERE id=$1 AND status='drafted'` 取鎖 → `drafts.send` → `sent`＋事件。逾時／5xx 留 `sending`，下一 tick 以 `threads.get` 的 `SENT` label 對帳；30 分未對到 → `needs_edit`＋timeline；永不盲目重寄。

### 5.6 回覆同步（C4）
scope＝`gmail.compose`＋`gmail.readonly`（不含 send／modify）。每 10 分：每個啟用 connector，取有 `threadId` 且 lead 未結案（status ∉ replied／no_reply／customer／lost／do_not_contact／unsubscribed）的 thread → `threads.get?format=metadata`：
- 本方訊息帶 `SENT` label 且 `co_messages.status≠sent` → `sent`、`sent_at`、事件 `sent`、lead `status='sent'`、`last_contact_date`、`next_followup_date=sent＋下一封 followup_delay_days`。
- `From`≠sender → upsert `co_replies`（`gmail_message_id`）→ `generateCheapJsonText` 分類 `reply_type`（interested／pricing／more_info／case_study／wrong_contact／has_vendor／no_need／reject／unsubscribe）＋`suggested_response` → lead `status='replied'`、`next_followup_date=null`；`unsubscribe`／`reject` → suppression（`unsubscribe`／`manual_opt_out`）＋`do_not_contact`。
- `From` 含 `mailer-daemon` → 事件 `hard_bounced`＋suppression `hard_bounce`＋`do_not_contact`。
全部寫 `co_timeline_events`。Replies 頁按鈕：產報價摘要（`output_type=proposal_summary`）、問正確窗口、加入拒收、同步 FluentCRM、約到會議、成交、失去。

### 5.7 追蹤（C5）
Follow-ups 頁＝`next_followup_date ≤ 今天` ∧ `status='sent'` 的 lead＋下一封 followup 列。建草稿：MIME 加 `In-Reply-To`／`References`＝本方上一封 `Message-ID`（`threads.get` headers），`drafts.create` 帶 `threadId`（回同一串）。最後一封寄出後經其 `followup_delay_days` 無回信 → `no_reply`。`channel≠email` 步驟＝待辦＋完成按鈕。

### 5.8 暖名單（C6）
資格＝`consent_status ∈ {replied, opted_in, form_submitted, customer}` ∧ 非 suppression（marketing／all）。呼叫該 org 站 wp-bridge `POST /fluentcrm/contact`（signed write）upsert contact＋lists／tags → `fluentcrm_contact_id`、`fluentcrm_sync_status='synced'`、`fluentcrm_last_synced_at`、timeline；不合格 422。冷名單不是訂閱者。

### 5.9 成效（C7）
依 org × service_profile × `variant_label` × `angle`：generated（`co_messages`）、drafted、sent、bounced（`co_sending_events`）、replied、positive（`reply_type ∈ interested／pricing／more_info／case_study`）、meeting_booked、customer、lost（`co_leads.status`）。回覆率＝replied／sent；正向率＝positive／sent。無開信率。

## 6. 排程與執行

| 工作 | 頻率 | 跑在哪 | 登記 |
|---|---|---|---|
| 研究 run | 按鈕 | next-admin in-process 非同步（照 `/ops/collect`）；預算 ≤60 秒故不進 Trigger | — |
| Gmail 同步＋auto 寄出 | `*/10` | 主機 cron → `HS/poke.sh` → `/api/internal/outreach/gmail-sync`（Bearer `OUTREACH_SYNC_TOKEN`，照 `NA/app/api/internal/schedules/alerts/route.ts:21-25`） | `HS/cron.d/awarewave-schedules`；`NA/lib/schedules/host-jobs.ts` `outreach_gmail_sync` |
| 追蹤到期 | 頁面讀時算 | — | — |
| 成效 | 頁面讀時算 | — | — |
| n8n | — | 不在路徑 | — |

## 7. 安全與合規

- scope：`gmail.compose`＋`gmail.readonly`；測試禁 `gmail.send`／`gmail.modify`／`mail.google.com`；程式不呼叫 send 端點（I3）。
- Google 專案發布狀態：待決 1（Testing 7 天到期 vs 發布 unverified）。
- token／API key：vault（0049）；`co_connector_accounts.credentials_ref` 只存參照。
- Prompt injection：抓到的內容走 `provenance.ts` 篩查與標記；證據包 SOURCE_QUOTATION；excerpt 子字串驗證擋掉模型編造的「原文」。
- 同意：冷信＝`legitimate_interest`；只有 §5.8 四種 consent 才進 FluentCRM。
- 退訂：內文拒收句＋`List-Unsubscribe` mailto；一鍵退訂（RFC 8058）要 HTTPS 端點，冷信人工低量用不到，不做。
- 速率：`daily_limit`（預設 20）、台北 09–18 視窗、`health_status='paused'` 全停。
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

## 9. 不做

`brand_id`；job queue／Worker；CRM 六表；HubSpot；Microsoft Graph；NestJS；Redis／BullMQ；S3；視覺化流程編輯器；開信／點擊追蹤；LinkedIn／IG 自動化；Resend 寄冷信；SES；Apollo 級資料庫；PostHog 接外聯；n8n；ops-role 之外的角色；專用冷信網域。

## 10. 卡片與順序

[R0-PLAN.md §6](../../handoffs/2026-10-31-outbound-os/R0-PLAN.md)：C1 守衛 → C2 信本身 → C3 研究 → C4 回信＋C6 暖名單（並行）→ C5 追蹤＋C7 成效（並行）→ C8 開關；C9 舊欄位退場、C10 名單發現 parked。

## 11. 待你決定

監工台 `data.mjs` OPEN：① Google 專案發布狀態（C4 前）② 哪些信箱寄冷信與署名（C2 前）③ 各品牌 FluentCRM 站（C6 前）④ 哪個帳號翻 auto（C8 前）⑤ Google Places key（C10 前）。
