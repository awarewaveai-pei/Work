# Multi-Brand Outbound OS — 工程規格與實作計畫

> 版本：v1.0（規劃草案）  
> 日期：2026-10-30  
> 用途：自有多品牌內部使用，不以對外販售 SaaS 為第一階段目標  
> 文件狀態：根據使用者提供的程式盤點摘要編寫，**尚未直接查閱完整儲存庫**。

## 0. Executive Summary

建立一套低維護、可擴充、可稽核的 **Multi-Brand AI Outbound Sales Platform**，集中管理潛在客戶研究、證據蒐集、個人化開發信、寄信序列、回覆、CRM 與成效歸因。

**核心原則**：
1. **核心流程自給自足**：不得依賴 WordPress、FluentCRM、Chatwoot、n8n、Trigger.dev 或 Airtable 才能完成 Lead → Research → Draft → Approval → Send → Reply → Stop/Follow-up。
2. **品牌資料隔離**：品牌的名單、寄件身分、Offer、Prompt、Campaign、會話、權限互相隔離；全域拒收依正確範圍生效。
3. **Evidence First**：所有針對潛在客戶的具體主張須可追溯到合法取得、可核對的來源；不以 AI 信心分數取代事實證據。
4. **Human in Control**：預設人工核准首次寄信與敏感回覆；AI 提供研究、建議和草稿，不憑空做承諾。
5. **Deliverability & Compliance by Design**：寄送之前、排程執行時都檢查資格、抑制名單、政策、網域及速率上限；不得將技術上能寄送等同於依法或平台政策可寄送。
6. **Replaceable Adapters**：搜尋、AI、Email、驗證、CRM 等外部服務需透過標準介面隔離。

## 1. 現況（依已提供的程式盤點）

| 流程 | 現有能力 | 缺口 |
|---|---|---|
| 找人 | Serper、Brave 金鑰；`/ops/collect` 蒐集器 | 尚未串接到 Outreach Leads；Hunter/Snov/Apify/Google Places 只有命名或未串接 |
| 名單 | 去重、拒收名單、評分 | MX 檢查未實作；資料來源、更新與可信度需加強 |
| 文案 | Claude → OpenAI → Gemini → 自有 Gemini 備援；人工觀察與來源必填 | 無 Subject、署名、定位未使用、無自動研究、無完整 Sequence 與 A/B |
| 寄送 | Google 可建立草稿；OAuth 測試模式 | 未確認正式授權寄信、token 續期、真正的寄送與傳送事件 |
| 系統信 | Resend | 不用於未經請求的 Cold Outreach；保留交易性通知用途 |
| 回覆 | Chatwoot、Outreach Replies 頁 | 尚無回信同步、Thread 關聯、自動停止序列 |
| 培養 | WordPress FluentCRM + wp-bridge | 僅電子報草稿；應只同步有適當資格的訂閱者 |
| 任務 | n8n、Trigger.dev 已部署 | 不作為核心寄送工作流必要依賴 |
| 分析 | PostHog、Airtable | 尚未和寄送及回覆的真實事件串接 |
| DNS | `aware-wave.com` SPF、DKIM、DMARC 曾確認；`soulfulexpression.com` 未確認 | 正式上線前重新實測；主網域不應當成專用冷信寄件身分 |

### 1.1 已知程式位置（僅根據摘要）

- `apps/next-admin/app/api/outreach/messages/route.ts`：目前的 Prompt 組裝、AI 產文與主旨寫入（主旨目前為空）。
- `apps/next-admin/lib/outreach/cold-gate.ts`：固定禁用詞、壓力詞及拒收句檢查。
- `/ops/collect`：現有研究蒐集器，需評估可否擴增至 Lead Research。
- `wp-bridge`：WordPress／FluentCRM 整合。

**實作前置工作**：以真實程式碼、資料表、權限模型、部署方式和測試結果確認上述敘述。不可假設功能已可於正式環境運作。

## 2. 產品範圍

### 2.1 必備模組

1. **Brand Workspace**：品牌設定、ICP、Offer、聲音風格、產業規則、寄件設定、成員權限。
2. **Lead Intelligence**：CSV/API 匯入、搜尋適配器、研究蒐集、去重、Lead 狀態、可追溯來源。
3. **Evidence & Research**：公開資訊研究、擷取證據、來源日期、驗證／審核、過時資訊提醒。
4. **AI Personalization Studio**：Brand Context、Subject A/B、Body A/B、Follow-ups、Prompt 版本、生成成本。
5. **Campaign Engine**：視覺化／表單序列、延遲、時區、分支、頻率上限、停止條件、審核。
6. **Mail Provider**：寄件 OAuth／受支援 API、mailbox 健康資訊、寄送識別碼、狀態追蹤、回信同步。
7. **Unified Inbox**：Thread、AI 分類、人工指派、回覆草稿、序列停止。
8. **Built-in CRM**：Companies、Contacts、Opportunities、Tasks、會議與狀態。
9. **Analytics**：按品牌、活動、模板、資料來源、模型的回覆／正向回覆／預約／成交與成本。
10. **Compliance & Admin**：Suppression、退訂、資料保留、稽核紀錄、RBAC、政策檢查。

### 2.2 非第一階段目標

- 自建全球 B2B 聯絡人資料庫（外接具授權的供應商）。
- 未經授權的 LinkedIn 自動抓取、批量邀請或私訊。
- 用 Resend 發送未經請求的冷信。
- 不經審核的大規模 AI 自主回覆。
- 一開始導入多個獨立微服務、訊息平台與工作流引擎。

## 3. 建議架構：Modular Monolith + Durable Worker

```text
Next.js Admin UI
      │
      ▼
API / Domain Modules（可先維持既有 Next.js 服務）
 ├─ Auth & RBAC / Brands
 ├─ Leads & Evidence
 ├─ AI Generation & Quality Gate
 ├─ Campaigns / Enrollments
 ├─ Mail / Inbox / CRM
 ├─ Analytics / Audit / Compliance
 └─ Integration Adapters
      │
      ├─ PostgreSQL（唯一主要業務資料來源）
      ├─ Durable Job Queue（PostgreSQL-backed，單一 Worker 運作）
      └─ Object Storage（擷取快照、附件、匯入檔）

Optional Adapters:
  Search: Serper / Brave
  AI: Claude / OpenAI / Gemini
  Mail: Gmail API / Microsoft Graph / 允許此使用情境的供應商
  Data: Hunter / 合規的 B2B Data API
  CRM: WordPress FluentCRM / Chatwoot / HubSpot
  Other: n8n / Trigger.dev / PostHog / Airtable
```

**部署策略**：初期以一個 Web 進程、一個 Worker 進程、一個 PostgreSQL 為基礎。Worker 需有可靠的 claim/lease、retry、backoff、dead-letter、取消以及冪等機制；不可只用 Web Server 的記憶體 timer。

**Supabase 策略**：若自架 Supabase 已穩定，短期可重用其 PostgreSQL；但業務程式應透過標準 PostgreSQL 介面，避免綁死 Auth、Edge Functions、Realtime 或其他特定服務。資料庫遷移、備份、還原演練需列為上線條件。

## 4. 品牌隔離與權限

- 所有品牌業務表含 `organization_id`、`brand_id`（跨品牌共享實體需另定 ownership 與關聯模型）。
- 所有查詢、Job、API、匯入、Webhook 都要傳入並驗證 Brand Context，不能相信前端傳入的 `brand_id`。
- Admin、Brand Manager、Campaign Operator、Reviewer、Read-only 等角色；伺服器端 RBAC 測試。
- 個人或公司跨品牌重複出現可使用全域 identity key 做關聯，但不可擅自交叉使用資料；保留品牌獨立的使用依據、狀態與歷史。
- Suppression 支援 `mailbox`、`brand`、`organization/global` 範圍，按拒絕內容及法規實際生效；寄送前即時比對。

## 5. Lead Research & Evidence Pipeline

```text
Lead Import / Search
  → Normalize / Deduplicate
  → Research Job
  → Fetch Supported Public Sources
  → Extract Claims with Citations
  → Verify / Score / Expiry
  → Human Review（低可信度／高風險）
  → Eligible for Personalization
```

### 5.1 Evidence schema

```json
{
  "id": "ev_001",
  "brand_id": "brand_001",
  "lead_id": "lead_001",
  "claim": "公開網站上的菜單照片光線偏暗",
  "source_url": "https://example.com/menu",
  "source_type": "public_website",
  "evidence_excerpt": "可稽核的原文或描述",
  "captured_at": "2026-10-30T00:00:00Z",
  "source_published_at": null,
  "confidence": 0.8,
  "review_status": "pending",
  "expires_at": null
}
```

- `confidence` 是模型估計，不是事實驗證。
- 研究資料不得作為 Prompt 的系統指令；必須防護網頁 Prompt Injection。
- IG「三個月沒更新」這類主張，需確認最新貼文日期與觀察日；無資料則不得生成此句。
- 含個人資料的收集／使用需有適當合法依據和資料保留機制；遵守來源條款、robots／API 限制及適用法規。
- Research 不足時設定 `research_insufficient`，進人工補充或使用無虛構觀察的信件版本。

## 6. Brand Context Builder

每個品牌具備獨立設定：

```json
{
  "brand_id": "brand_001",
  "name": "品牌名稱",
  "positioning": "市場定位",
  "offer": "提供的服務與適用客群",
  "icp": "理想客戶輪廓",
  "differentiators": ["已驗證的差異點"],
  "tone": "專業、簡潔、低壓",
  "language": "zh-TW",
  "sender_profile_id": "sender_001",
  "allowed_claims": ["經核實的服務能力"],
  "prohibited_claims": ["沒有證據的保證"],
  "industry_policy_id": "policy_001"
}
```

Context 組裝順序：Global Safety Rules → Industry Rules → Brand Rules → Offer & Positioning → Sender Identity → Lead Evidence → Campaign Goal → Template Version。

**署名**由正式 sender profile 組裝（姓名／職稱／公司／必要聯絡資訊／適用退訂方式），不可讓 AI 編造。

## 7. Structured AI Generation

### 7.1 生成工作

- Input：Brand Context、Lead、核准的 Evidence IDs、Campaign Goal、語言、字數、Sequence 設定。
- Output：2–3 個 Subject 候選、至少 2 個首封 Variant、可配置 Follow-ups、引用 Evidence IDs、生成原因、Prompt 與 Model 版本。
- 由 JSON Schema 嚴格驗證；Schema validation 失敗可有限次修復或人工處理。
- Model Router 支援 Claude／OpenAI／Gemini，區分 Research、Draft、Classify 角色。切換模型要保留原因、費用、延遲、可觀測性。

### 7.2 建議輸出格式

```json
{
  "lead_id": "lead_001",
  "brand_id": "brand_001",
  "generation_version": "v2",
  "subject_variants": [
    { "id": "sA", "text": "關於貴店的菜單呈現" },
    { "id": "sB", "text": "一個網站視覺呈現的小想法" }
  ],
  "first_email_variants": [
    {
      "id": "A",
      "body": "您好，看到貴店網站上……",
      "evidence_ids": ["ev_001"]
    },
    {
      "id": "B",
      "body": "您好，最近看了貴店的菜單頁……",
      "evidence_ids": ["ev_001"]
    }
  ],
  "follow_ups": [
    { "step": 2, "delay_business_days": 3, "body": "補充一個可參考的方向……" },
    { "step": 3, "delay_business_days": 5, "body": "最後分享一個簡短建議……" }
  ],
  "quality_status": "pending_review"
}
```

主旨與首封 Variant 應有清楚組合策略，不可無限制交叉配對造成無法歸因。

## 8. Quality Gate 規格

| 等級 | 例子 | 系統動作 |
|---|---|---|
| BLOCK | 未核實具體事實、已退訂、來源不合規、缺少必要寄件身分、違反絕對禁用規則 | 禁止寄送，顯示原因與證據 |
| REVIEW | 來源較舊、語氣不符、敏感產業主張、對個人資料使用有疑慮 | 人工審查後方可寄送 |
| WARN | 字數偏長、主旨不夠聚焦、措辭可能太模板化 | 提示修改，不必然封鎖 |

- 規則層級：Global → Jurisdiction/Industry → Brand → Campaign。
- 每次檢查保存 `rule_id`、`rule_version`、`result`、`evidence`、`checked_at`。
- Gate 對 Subject、Body、署名、寄件身分與整封 MIME／Header 都要有檢查；內文「不再打擾」不能代替必要的取消訂閱機制。
- 寄出前重新檢查資格（防止排程期間新增退訂／拒收）。

## 9. Campaign / Sending Engine

### 9.1 Campaign 狀態

`draft → ready_for_review → approved → scheduled → running → paused → completed / cancelled`

Enrollment 狀態：`pending → eligible → scheduled → sending → sent → awaiting_reply → replied / bounced / opted_out / stopped / failed`。

### 9.2 必備條件

- 帳號、品牌、Campaign、網域與收件者層級的速率限制。
- 收件者時區與工作日設定、假日選項。
- 每個 Job 具備唯一冪等 Key；防重複寄送、Lease 回收、retry、backoff、dead-letter queue。
- 「Provider 已接受但回應逾時」不得直接重寄，須先 reconcile 外部識別碼或人工確認。
- 任一已回覆、退訂、退信、投訴、拒絕或人工停止事件，立即取消後續步驟。
- A/B 指派在入組時固定，保留分組、變體與指標資料。

### 9.3 寄件供應商

- 保留 Resend 作為允許的系統／交易通知；**不要預設用於未經請求的 Cold Email**。
- Gmail API / Microsoft Graph 先以 Provider Adapter 建置；檢查授權、寄件限制、測試／正式 OAuth 要求及供應商政策。
- Gmail 寄送與讀取回覆權限不同，Restricted scopes 可能需要額外審查；登入成功或能建立草稿不代表已可正式發送／同步。
- 主網域與 Cold Email 專用寄件身分做合理隔離，但專用網域不等於信譽保證。
- 每個域的 SPF／DKIM／DMARC、MX、對齊、退訂機制和健康指標需可監控。

## 10. Reply Sync / Unified Inbox

- 收到新郵件後，透過 Provider Message ID、Thread ID、`In-Reply-To`／`References` 和寄件者資料綁定到 Campaign/Lead；設計衝突處理，不可只靠 Subject。
- 內容分類：`interested`、`question`、`not_now`、`not_interested`、`unsubscribe`、`out_of_office`、`bounce`、`unknown`。
- **任何真實回覆預設立即暫停／停止後續 Sequence**；OOO 等例外應有明確可審核策略。
- AI 回覆預設產生草稿、由人員核准；保留原始郵件、分類來源、人工覆寫與稽核紀錄。
- Chatwoot 只是選用同步／客服整合，不是 Outreach Inbox 的必要依賴。

## 11. CRM 與 WordPress / FluentCRM

- Built-in CRM 為商務追蹤唯一主要來源，含 company、contact、deal、pipeline、task、meeting、activity。
- FluentCRM 適合品牌網站訂閱者與後續培養，透過 wp-bridge 做可控同步。
- **不可以把 Cold Email 名單直接視為已同意訂閱電子報的名單**。同步前驗證身份、來源、同意或其他適用法律依據、用途及行銷拒絕狀態。
- 每個整合都要有 Sync Job、版本戳、重試與衝突解決策略；關閉整合不應影響主要系統運作。

## 12. 核心資料模型（建議）

```text
organizations
users
organization_memberships
brands
brand_memberships
brand_profiles
sender_profiles
sending_domains
mailboxes
mailbox_health_events
companies
contacts
brand_contacts
lead_lists
lead_list_members
lead_sources
research_jobs
research_evidence
lead_scores
suppression_entries
consent_and_basis_records
campaigns
sequence_steps
campaign_enrollments
message_variants
generation_runs
prompt_versions
quality_gate_results
outbound_messages
send_attempts
email_events
conversations
inbound_messages
reply_classifications
sales_pipelines
deals
sales_tasks
integration_connections
integration_sync_jobs
job_queue
audit_logs
```

資料表至少需有必要的建立時間、修改時間、操作者、品牌範圍；個資欄位需加密或最小權限管理，並規劃保存、刪除、匯出與備份還原。

## 13. API 設計草案

| Method | Path | 功能 |
|---|---|---|
| GET/POST | `/api/brands` | 管理品牌 |
| GET/POST | `/api/brands/:brandId/contacts` | 品牌聯絡人 |
| POST | `/api/brands/:brandId/leads/import` | 匯入及去重 |
| POST | `/api/brands/:brandId/leads/:leadId/research` | 建立研究工作 |
| GET | `/api/brands/:brandId/leads/:leadId/evidence` | 檢視來源與證據 |
| POST | `/api/brands/:brandId/messages/generate` | 結構化文案生成 |
| POST | `/api/brands/:brandId/messages/:id/approve` | 審核批准 |
| GET/POST | `/api/brands/:brandId/campaigns` | Campaign 管理 |
| POST | `/api/brands/:brandId/campaigns/:id/enroll` | 入組與資格檢查 |
| POST | `/api/brands/:brandId/campaigns/:id/pause` | 暫停寄送 |
| GET | `/api/brands/:brandId/inbox` | 回覆與對話 |
| POST | `/api/mail/providers/:provider/connect` | 郵件帳號授權開始 |
| POST | `/api/webhooks/mail/:provider` | 驗證簽章並接收事件 |
| POST | `/api/brands/:brandId/suppressions` | 退訂／拒收處理 |
| GET | `/api/brands/:brandId/analytics` | 品牌儀表板 |

API 必須包含 RBAC、Body Schema 驗證、rate limit、pagination、審計、冪等／CSRF／Webhook signature 等安全設計；路徑為草案，應與現有路由對齊。

## 14. 既有程式重構地圖

| 現有／新增 | 處置 | 預期責任 |
|---|---|---|
| `app/api/outreach/messages/route.ts` | 縮小並重構 | 只負責權限、參數驗證、呼叫 Generation Service 與回傳結果 |
| `lib/outreach/cold-gate.ts` | 重構為 Rule Engine | 分層、版本化品質／合規 Gate |
| `lib/outreach/brand-context.ts` | 新增 | 定位、ICP、Offer、Voice、Sender、政策組裝 |
| `lib/outreach/research-service.ts` | 新增 | 搜尋、擷取、證據正規化、審核 |
| `lib/outreach/generation-schema.ts` | 新增 | JSON Schema、Typed Result |
| `lib/outreach/sequence-generator.ts` | 新增 | Subject、多版本、Follow-ups |
| `lib/outreach/ai-router.ts` | 新增或封裝 | 多 Provider、成本、失敗處理 |
| `lib/outreach/generation-audit.ts` | 新增 | Prompt、模型、證據、版本、成本追蹤 |
| `lib/outreach/mail-providers/*` | 新增 | Gmail / Microsoft Adapter |
| `lib/outreach/campaign-worker.ts` | 新增 | Durable Sequence 排程與發送 |
| `lib/outreach/reply-sync.ts` | 新增 | 回覆取得、Thread 關聯、停止任務 |
| `lib/outreach/suppression-service.ts` | 強化 | 跨品牌／全域抑制規則 |
| `lib/outreach/analytics.ts` | 新增 | 真實事件彙整與歸因 |

實際檔名以現有專案慣例為準；不得在未讀過原檔前直接覆蓋或改寫流程。

## 15. 分階段實作與驗收

### Phase 0 — Repository Audit & Baseline

- 梳理現有 Next.js API、DB Schema、部署、OAuth、Job、資料流、測試覆蓋。
- 將既有 Cold Gate、Lead 去重、AI 模型切換建立回歸測試。
- **驗收**：出具依賴圖、風險清單、DB Migration 計畫和可重現測試環境。

### Phase 1 — AI Draft Professionalization

- 修正 Subject、Sender Profile、品牌定位注入。
- 結構化生成、2 種 Variant、Follow-up、Prompt 版本與 QA Rules。
- **驗收**：可對核准的 Evidence 產出完整可審核信件；AI 無法自行創造署名或不受證據支持的客製化主張。

### Phase 2 — Automated Research & Lead Pipeline

- 將 Serper／Brave／Collect 接到 Research Job；來源快照與事實審核。
- 建立 Lead Import → Normalize → Dedup → Research → Review 流程。
- **驗收**：匯入一批測試企業，可以追溯每句個人化敘述對應的來源；搜尋失敗不會生成虛假觀察。

### Phase 3 — Mail & Replies

- 寄件適配器、OAuth 正式使用情境審查、寄件紀錄、Reply Sync、Thread matching、Suppression。
- **驗收**：沙盒／允許的測試信箱完成寄出 → 收到回覆 → 同步 → 停止 Sequence；重複 Webhook、Token 過期、退信可安全處理。

### Phase 4 — Campaign & Multi-Brand

- Sequence Scheduler、Brand Isolation、Mailboxes、限制、Audit 與 Unified Inbox。
- **驗收**：兩品牌並行且資料不可越權查閱；任何退訂／回覆都能阻止下一封信；Workers 重啟不重寄。

### Phase 5 — Analytics & CRM Bridges

- 品牌別漏斗、正向回覆與會議／成交歸因、成本管理、FluentCRM 合規同步。
- **驗收**：指標能追溯到原始 Event；關閉 WordPress／Chatwoot／Airtable 整合不影響寄信核心。

## 16. 核心測試矩陣

- **Brand isolation**：A 品牌用戶不能看到 B 品牌名單、生成、寄信或對話。
- **Evidence safety**：沒有來源的客製化事實應 BLOCK；網頁內嵌惡意指令不得影響系統規則。
- **Prompt versioning**：每個發送版本可還原其生成輸入、證據與模型。
- **Suppression race**：排程後退訂、寄件前重查，絕不能再寄。
- **Idempotency**：Worker 崩潰、重試、Webhook 重複不造成重複寄件。
- **Reply handling**：收到客戶回覆時立即停止其後續步驟；Thread 關聯衝突可人工處理。
- **Provider failure**：429、5xx、OAuth token 過期、已接受但回應逾時，均有正確處置。
- **Compliance**：對不同地區與郵件提供商的適用要求，進行版本化規則測試與上線前人工法務檢視。
- **Backups**：演練備份、還原、資料刪除及多品牌回復。

## 17. 主要 KPI

- Deliverability：退信率、投訴率、被拒收原因、Domain/Mailbox 健康狀態。
- Outreach：回覆率、**正向回覆率**、會議預約率、商機率、成交率（按品牌／活動／來源／文案版本）。
- Research：有來源的 claim 比率、人工駁回率、來源過期率、每筆研究成本。
- AI：每次生成成功率、品質 Gate 違規、人工修改率、各 Provider 成本。
- Operations：Job 積壓、寄送失敗、回覆同步延遲、排程取消延遲、整合故障影響範圍。

> Open rate 容易受到郵件用戶端的隱私機制影響，不應作為核心成功指標，也不應以侵入性追蹤為前提。

## 18. 上線前決策清單

- [ ] 確認現有 Outreach 的 runtime、DB schema、部署、OAuth 與 Job 工具。
- [ ] 確認每個品牌的法定寄件身分、網域與 Email 帳號。
- [ ] 確認每種目標市場的合法外聯依據、個資來源／用途與退訂方式。
- [ ] 實測 `aware-wave.com` DNS；確認 `soulfulexpression.com` 名稱與 DNS。
- [ ] 重新評估 Gmail／Microsoft Graph 正式授權與郵件供應商使用政策。
- [ ] 決定 PostgreSQL 是否沿用現有自架 Supabase；備援與備份策略。
- [ ] 選擇 1–2 個品牌做封閉測試，先用受控測試名單驗證端到端。
- [ ] 正式寄送前完成 Mailbox、Domain、退訂、監控與人工審核。

## 19. Definition of Done（整體完成標準）

使用者可以在單一 Outbound OS 中：選擇品牌 → 匯入或合規搜尋 Leads → 取得附來源證據的 Research → 產生主旨與多版本 Sequence → 通過品質及合規檢查 → 人工核准 → 從已授權的帳號寄出 → 自動讀取回覆 → 終止後續寄信 → 在內建 Inbox／CRM 管理商機 → 查看品牌與活動成效。

**即使 WordPress、FluentCRM、Chatwoot、n8n、Trigger.dev、Airtable 暫時不可用，核心流程仍能運作。**

---

### 備註

本文件為工程規劃，不是已實作程式或完成的資安、法務／平台政策稽核。相關 API 權限、第三方方案價格、郵件供應商限制與地區法規可能變動，上線前須依官方最新文件重新驗證。
