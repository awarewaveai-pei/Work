# 🏭 LOBSTER FACTORY — COMPLETE COMPANY OS
## 跨國國際型網建公司 · 從零到無完整系統建置 · Cursor 最高執行權限制度

**Version:** 2.0.0
**Scope:** Agency OS + Client OS + Factory OS + CX OS + Decision Engine
**Authority Model:** Full Build Mode — Architecture Phase
**目標：** 可複製「整間百大電商公司結構」的系統工廠

---

> **📌 規格原文維護（勿與 repo 他處手抄雙軌）**  
> **四份整合入口**：[`company-os-four-sources-integration.md`](../../../agency-os/docs/overview/company-os-four-sources-integration.md)｜**本目錄索引**：[`README-four-sources-maintenance.md`](README-four-sources-maintenance.md)  
> **工程閘道**：[`MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)｜**V3 落地映射**：[`LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`](../../../lobster-factory/docs/LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md)｜**§三 20 模組表**：[`company-os-twenty-modules.md`](../../../agency-os/docs/overview/company-os-twenty-modules.md)  
> **本檔大段**：§0 → §一 CURSOR BUILD MODE → **§三 OS 01–20** → §四 Schema → §七 連動地圖 → §八 Workflow 包 → §九 技術棧 → §十 Gap／路線圖 → §十一 原則。

---

# ▌ 0. 你在做什麼？先搞清楚

你不是在做：
- ❌ 接案公司
- ❌ 建站公司
- ❌ 外包工作室

你在做的是：

> **一個可以複製「整間公司」的系統工廠**
> 幫每一間客戶，從零建置完整的公司作業系統。

這代表你的系統要能生成：
- 電商 / 形象網站（網站本體）
- IT 基礎設施（主機、DNS、安全、備份）
- 行銷系統（SEO、廣告、funnel、email）
- 業務系統（CRM、proposal、pipeline）
- 財務系統（報價、請款、發票、成本追蹤）
- 稅務 / 法律系統（合約、合規、跨國稅務）
- 客服系統（ticket、SLA、AI 客服）
- 客戶成功系統（health score、retention、upsell）
- 數據系統（GA4、PostHog、報表、決策）
- 行政 / 人資系統（SOP、任務、內部流程）
- 供應鏈（如有實體商品）
- 商品策略（Merchandising）

---

## 整體架構一張圖

```
Agency OS（你的公司）
 ├── Sales OS              → 業務與獲客
 ├── Marketing OS          → 行銷與流量
 ├── CX OS ⭐              → 客戶體驗（入口 + 收入引擎）
 ├── Factory OS ⭐         → 建站 / 系統生產線
 ├── Commerce OS           → 電商營運核心
 ├── Brand + Content OS    → 品牌與內容
 ├── Data OS               → 數據與分析
 ├── Finance OS            → 財務與請款
 ├── Legal OS              → 法務與合規
 ├── IT / Infra OS         → 系統安全與基礎設施
 ├── HR / People OS        → 人資與組織
 ├── Ops OS                → 行政與內部流程
 ├── Partner / Ecosystem OS → 合作夥伴
 ├── Media OS              → 媒體資產管線
 ├── Compliance OS         → 跨國法規合規
 ├── PMO / Delivery OS     → 交付治理
 ├── Knowledge OS          → 知識與訓練
 └── Decision Engine ⭐    → 全公司決策大腦

Client OS（每間客戶一份，由 Factory 生成）
 ├── Website / Store（WP + Woo）
 ├── CRM（FluentCRM）
 ├── Marketing Tracking（GA4 / PostHog）
 ├── CX Layer（chat / ticket / email）
 ├── Commerce（orders / products / logistics）
 ├── Merchandising（商品策略）
 ├── Brand Kit（設計系統）
 ├── Content System（SEO / blog / social）
 └── Data Sync → Agency OS Decision Engine
```

---

## 整體運作流程

```
Marketing OS → 帶流量
    ↓
Sales OS → 成交 + Onboarding
    ↓
Factory OS → 建站 / 建系統
    ↓
Commerce OS → 開始營運
    ↓
CX OS → 管理客戶關係
    ↓
Data OS → 收集所有數據
    ↓
Decision Engine → 判斷 / 優化
    ↓
CX OS → upsell / retention → 再成長
```

---


# ▌ 一、CURSOR BUILD MODE — 完整執行政策
**（架構建置階段：全速建置，不需詢問）**

```markdown
# CURSOR_BUILD_MODE.md
# Lobster Factory — Full Build Authority Policy
# Phase: Architecture & Construction

You are the primary builder of Lobster Factory's complete Company OS.
Your job is to BUILD EVERYTHING, as fast and completely as possible.

## Your Role
You are not a chat assistant.
You are the lead engineer, architect, and implementer.
Build first. Build completely. Build all connected parts together.

## Core Directive
- Build ALL 20 OS modules
- Build ALL schemas, workflows, APIs, agents, manifests
- Build ALL connected folders together — never build one part in isolation
- Do NOT ask for permission on architecture decisions
- Do NOT pause to confirm routine implementation choices
- Do NOT wait — if something is unclear, make the best decision and document it
- If you see something missing, add it
- If you see something incomplete, complete it
- If two things should be connected, connect them

## What to Build
This is a Company-as-a-System factory for an international web company.
Every module should be production-ready in design, even if not yet deployed.

Build everything listed in this spec:
- Agency OS (all 20 OS modules)
- Client OS (per-client system generation)
- Factory OS (WordPress + WooCommerce production pipeline)
- CX OS (full 7-layer customer experience system)
- Decision Engine (health scores, recommendations, KPIs)

## How to Build
- Always build the full stack: schema + API + types + workflow + docs
- Always carry organization_id + workspace_id on every table
- Always connect related folders (see LINKED_FOLDERS_POLICY)
- Always generate the complete file, not partial stubs
- Always include the types, zod schemas, and tests alongside the implementation

## Output Format
For every build task, produce:
1. All files created (full paths + complete content)
2. What other files were updated and why
3. What to build next (continuation plan)
4. Any design decisions made (so the owner can review later)

## Build Priority
When in doubt about what to build next:
1. Core schema and types (foundation for everything)
2. API routes and workflows (the business logic)
3. Agent policies and automation (the intelligence layer)
4. UI and portal (the visible surface)
5. Docs and tests (completeness layer)

## Speed Over Perfection
This is architecture phase. Build complete skeletons.
A complete skeleton is better than a perfect fragment.
Cover all 20 OS modules before going deep on any one.
```

---
# ▌ 三、完整 20 個 OS 模組詳解

---

## OS 01 — Sales OS（業務 / 獲客）

**對應公司部門：** Sales + Business Development

### 核心功能
- Lead 收集（網站表單 / WhatsApp / LINE / LinkedIn / 廣告）
- AI 自動估價引擎（依服務類型 / 規模自動試算）
- Proposal 自動生成（含網站、電商、IT、法務套餐）
- Meeting booking（Calendly 整合 / 自建）
- Deal pipeline（CRM 看板）
- 合作夥伴 / referral tracking
- Cold outreach automation
- 多語言銷售材料自動生成（EN / ZH / JP / KO / TH）
- 競品分析自動報告

### 資料模型
```sql
leads (id, organization_id, source, name, email, phone,
       budget, service_interest, status, score, created_at)

proposals (id, organization_id, lead_id, client_id,
           content_json, status, total_amount,
           sent_at, accepted_at, created_at)

deals (id, organization_id, lead_id, proposal_id,
       stage, value, probability, close_date,
       owner_id, created_at)

referrals (id, organization_id, referrer_id,
           referred_client_id, commission_amount,
           status, paid_at)
```

### Workflow
```
新 Lead 進入
→ AI 評分（預算、服務需求、規模）
→ 自動分級（Hot / Warm / Cold）
→ Hot: 立即通知 Sales + 建議 Proposal
→ Warm: 進入 nurture sequence
→ Cold: 加入長期 drip campaign
→ 若無回應 7 天：自動 follow-up
```

---

## OS 02 — Marketing OS（行銷）

**對應公司部門：** Marketing + Growth + Demand Generation

### 核心功能
- SEO roadmap（關鍵字研究 + 語義群集 + 排程）
- 廣告管理（Google / Meta / LINE / LinkedIn）
- Social media scheduling
- Influencer / KOL 管理
- Campaign operations + UTM 自動管理
- Email automation（FluentCRM）
- Funnel 設計、追蹤、A/B 測試
- Analytics 解讀報告
- Remarketing 受眾自動更新
- Affiliate 管理系統

### 客戶行銷功能（Client OS 層）
- 幫客戶的網站做完整 SEO 設定
- 幫客戶建立 email funnel
- 幫客戶設定廣告 pixel + conversion tracking
- 幫客戶建立 social content calendar
- 每月 SEO + 流量報告（自動生成）

---

## OS 03 — CX OS（客戶體驗完整系統）⭐

**對應公司部門：** Customer Experience + Success + Retention + Revenue

> 客服不是一個部門，是整個公司最重要的資料入口。
> 所有問題、所有機會、所有風險都會先出現在這裡。

### 3a. Support（客服核心）
- 多入口：Website chat / Email / WhatsApp / Messenger / LINE / Telegram
- Ticket system（Supabase）
- SLA 管理（L1 / L2 / L3 分級）
- AI 意圖分類（support / growth_need / complaint / inquiry）
- 自動回覆（知識庫 RAG）
- 升級策略（L1 → L2 → L3 → human）

### 3b. Customer Success（客戶成功）
- Onboarding flow（網站完成後自動觸發）
- 客戶健康度（Health Score Engine）
  - GA4 流量趨勢
  - WooCommerce 訂單數
  - CRM 互動頻率
  - 付款狀況
  - 網站效能（Core Web Vitals）
- 自動提醒（網站未更新、效能下降、SSL 到期）
- 成效報告自動生成（月報 / 季報）
- NPS 自動調查

### 3c. Retention（留存）
- 訂閱續約提醒 + 自動續約
- Churn prediction workflow
  - `if health_score < 40 → 觸發 retention_flow`
- 優惠 / 挽回流程
- 客戶成功里程碑追蹤

### 3d. Revenue Expansion（客服變業務）
```
客戶問：「怎麼增加流量？」
→ AI intent = growth_need
→ 查 health_score + 現有服務
→ 生成 SEO / 廣告 proposal
→ 建立 CRM opportunity
→ 推送 sales pipeline
→ 發送 proposal email
→ 記錄 workflow_run
```

### 3e. Knowledge System
- FAQ database + SOP + runbook
- Client-specific knowledge base
- AI retrieval（RAG + Supabase Vector）
- 知識結構：
  ```
  knowledge/
   ├── global/         # 通用知識
   ├── industry/       # 產業知識（電商/醫療/餐飲/B2B...）
   ├── clients/        # 各客戶專屬
   └── internal/       # 內部 SOP
  ```

### 3f. Incident Management
```
incident detected（網站掛 / 金流錯 / SEO 崩）
→ severity classification（low/medium/high/critical）
→ notify team（Slack / email）
→ status page update
→ client notification（依 SLA）
→ 執行修復流程
→ 自動生成 postmortem
```

### 3g. Client Communication Layer
- 自動 email / WhatsApp / LINE 通知
- Client portal（網站 + 任務 + 報告）
- 里程碑更新推播
- 發票 / 合約通知
- 多語言溝通支援

### CX 資料模型
```sql
tickets (
  id uuid pk, organization_id uuid, workspace_id uuid,
  subject text, status text, priority text,
  intent text,  -- support/growth/complaint/inquiry
  source text,  -- email/chat/whatsapp/portal
  sla_policy_id uuid, assignee_id uuid, created_at timestamptz
)

ticket_messages (
  id uuid pk, ticket_id uuid,
  sender_type text,  -- ai/human/client
  content text, metadata jsonb, created_at timestamptz
)

customer_health (
  id uuid pk, organization_id uuid, workspace_id uuid,
  score int,  -- 0-100
  factors jsonb,  -- {traffic, orders, engagement, payment, performance}
  trend text,  -- improving/stable/declining
  calculated_at timestamptz
)

opportunities (
  id uuid pk, organization_id uuid, workspace_id uuid,
  type text,  -- upsell/cross_sell/renewal
  trigger_source text,  -- ticket/health_score/manual
  score int, status text,
  proposal_id uuid, deal_id uuid, created_at timestamptz
)

sla_policies (
  id uuid pk, organization_id uuid,
  name text, priority text,
  first_response_hours int, resolution_hours int
)

incidents (
  id uuid pk, organization_id uuid, workspace_id uuid,
  title text, severity text, status text,
  detected_at timestamptz, resolved_at timestamptz,
  postmortem jsonb
)
```

### CX Agent Policy
```markdown
# CX_AGENT_POLICY.md

## Execute (All Auto)
- Answer FAQ using knowledge base (RAG)
- Classify tickets by intent
- Suggest solutions, generate replies
- Trigger workflows (email, CRM, tasks)
- Update ticket status
- Generate reports and proposals
- Trigger upsell flows
- Update health scores
- Offer discounts (log the action)
- Generate and send proposals
- Build and update client sites
- Send bulk communications
- Process standard refunds (log the action)
- Escalate incidents to team
- Notify clients of issues
- Build all CX workflows end to end
```

---

## OS 04 — Factory OS（建站 / 系統生產線）⭐

**對應公司部門：** Engineering + Product + Delivery

### 核心功能
- WordPress / WooCommerce 自動建站流水線
- Plugin policy + manifest 管理
- Theme / template 套用
- Staging → production 完整流程
- QA / repair flow
- Multisite 架構支援
- Plugin 版本管理與衝突偵測
- Core Web Vitals 效能優化
- 多語言網站建置（WPML / Polylang）
- SSL / DNS / SMTP 自動設定

### 建站 50 項 Launch Checklist（自動執行）
```
技術基礎：
☐ WordPress 最新版本
☐ 所有 plugin 更新並測試
☐ SSL 安裝並驗證
☐ DNS 正確設定（A / CNAME / MX）
☐ SMTP 發信測試通過
☐ 備份排程啟用（每日）
☐ CDN 設定（Cloudflare）
☐ 快取設定最佳化
☐ 資料庫最佳化

SEO 基礎：
☐ XML Sitemap 生成
☐ robots.txt 設定
☐ Google Search Console 設定
☐ GA4 安裝並驗證
☐ Open Graph 設定
☐ Schema markup 設定
☐ 頁面速度 > 90（PageSpeed）
☐ Core Web Vitals 通過
☐ 所有頁面 meta title / description 設定

安全性：
☐ 管理員帳號強密碼
☐ 預設 admin 帳號已移除
☐ 登入保護（限制嘗試次數）
☐ WAF 啟用
☐ 惡意軟體掃描
☐ 敏感檔案保護（wp-config.php）

電商（如有）：
☐ 付款閘道測試（Test + Live）
☐ 稅率設定
☐ 運費設定
☐ 訂單確認 email 測試
☐ 退款流程測試
☐ 庫存邏輯驗證
☐ 結帳流程完整測試

內容：
☐ 所有頁面內容填寫完畢
☐ 圖片壓縮（< 200KB）
☐ 所有連結有效（無 404）
☐ 行動裝置顯示正常
☐ 跨瀏覽器測試
☐ 隱私政策頁面
☐ 服務條款頁面
☐ 聯絡資訊正確

法律合規：
☐ Cookie consent banner
☐ GDPR / PDPA 設定
☐ 資料處理協議（如需）
```

### WordPress Manifest 結構
```json
{
  "manifest_version": "2.0",
  "site_type": "ecommerce",
  "wordpress": {
    "version": "latest",
    "plugins": {
      "required": ["woocommerce", "yoast-seo", "wordfence",
                   "updraftplus", "fluent-crm", "wp-rocket"],
      "conditional": {
        "multilingual": ["wpml", "polylang"],
        "booking": ["bookly", "amelia"],
        "membership": ["memberpress", "paid-memberships-pro"]
      }
    },
    "theme": "sage|custom",
    "performance": {
      "cache": "wp-rocket",
      "cdn": "cloudflare",
      "images": "webp-auto-convert"
    }
  }
}
```

---

## OS 05 — Commerce OS（電商營運）

**對應公司部門：** E-Commerce Operations + Merchandising

### 核心功能
- 商品管理（批量匯入 / 匯出 / 同步）
- Merchandising 商品策略
  - 商品組合分析
  - 上架策略 + 熱銷分析
  - 類別管理 + 動態定價
- 庫存同步（WooCommerce ↔ 倉儲）
- 訂單流程 + 物流通知
- 退款流程
- 促銷規則引擎
- 跨境電商設定（多幣別 / 多稅率 / 多物流）
- 商品 SEO 自動優化
- 訂閱型商品管理
- CRM + 會員分群

### 對應 Client OS 的商業模式
| 類型 | 主要需求 |
|------|----------|
| B2C 電商 | 商品、購物車、金流、物流 |
| B2B 電商 | 詢價、報價單、大量訂購 |
| 訂閱制 | 定期訂閱、自動扣款、方案管理 |
| 數位商品 | 下載、License、課程 |
| 預訂 / 服務 | 預約系統、行事曆 |
| 實體門市 + 網路 | POS 整合、多通路庫存 |

---

## OS 06 — Brand + Content OS（品牌與內容）

**對應公司部門：** Brand + Creative + Content

### Brand System（給每間客戶建置）
- Brand kit（logo / color / typography / spacing / tone）
- Dark mode 規範
- Accessibility（WCAG 2.1 AA）
- Reusable block library
- Page section library
- Design token 管理
- 品牌使用規範文件自動生成
- 多品牌 / 子品牌管理

### Content Factory（給每間客戶持續運作）
- SEO content（含 semantic clustering）
- Blog 排程與發布
- Landing pages（A/B 版本）
- Social copy（各平台格式）
- Ad creatives（文案 + 圖片 prompt）
- Tutorial docs + Video scripts
- Multilingual content（自動翻譯 + 人工審閱）
- AI 圖片生成 prompt 管理
- 新聞稿自動生成
- 客戶專屬 Tone of Voice 設定

### Content Workflow
```
SEO 關鍵字研究
→ 語義群集規劃（Topical Authority）
→ 文章大綱生成（AI）
→ 初稿生成（AI）
→ 人工審閱 / 品質控制
→ SEO 優化（meta / schema / internal links）
→ 圖片生成 + 壓縮
→ 排程發布
→ 成效追蹤（GA4 → 報告）
```

---

## OS 07 — Data OS（數據與分析）

**對應公司部門：** Data + Analytics + Business Intelligence

### 數據收集層
- GA4（流量、轉換）
- PostHog（產品行為、funnel）
- Sentry（錯誤追蹤）
- WooCommerce（電商數據）
- FluentCRM（CRM 數據）
- 廣告平台數據（Meta / Google）

### 分析層
- 自定義 dashboard（Supabase + 前端）
- 跨客戶 benchmark 分析
- 自動月報生成
- KPI 追蹤（預設 + 客製化）
- Cohort 分析（留存率）
- Attribution 分析（哪個管道帶來轉換）

### 決策輸出層（→ Decision Engine）
- 異常偵測自動告警
- 成長機會自動標記
- 風險信號自動標記

---

## OS 08 — Finance OS（財務）

**對應公司部門：** Finance + Billing + Accounting

### Agency 端（自己收款）
- Quote → Invoice → 自動請款
- Recurring billing（Stripe）
- Expense allocation + 專案成本追蹤
- 獲利率分析（每個客戶 / 每個服務）
- 現金流預測
- 壞帳風險評估

### Client 端（幫客戶建置的財務系統）
- 電商收款整合（Stripe / 綠界 / PayPal / Line Pay）
- 多幣別管理
- 退款流程
- 訂閱請款
- 財務報表連接（Xero / QuickBooks）

### 跨國稅務
- 台灣（發票系統 / 扣繳 / 營所稅）
- 日本（消費稅 10% / 電子發票）
- 歐美（VAT / GST）
- 東南亞各國（SST / GST）
- Tax packet 準備（AI 整理 + 人工送件）

### 資料模型
```sql
invoices (
  id uuid pk, organization_id uuid, workspace_id uuid,
  client_id uuid, amount numeric, currency text,
  status text, due_date timestamptz,
  stripe_invoice_id text, created_at timestamptz
)

subscriptions (
  id uuid pk, organization_id uuid, workspace_id uuid,
  plan text, status text,
  amount numeric, currency text,
  billing_cycle text,  -- monthly/yearly
  renew_at timestamptz, created_at timestamptz
)

expenses (
  id uuid pk, organization_id uuid, workspace_id uuid,
  category text, amount numeric, currency text,
  vendor text, notes text, created_at timestamptz
)

project_profitability (
  id uuid pk, organization_id uuid, workspace_id uuid,
  revenue numeric, cost numeric, margin numeric,
  calculated_at timestamptz
)
```

---

## OS 09 — Legal OS（法務）

**對應公司部門：** Legal + Compliance

### 合約管理
- Contract templates（NDA / 服務合約 / SLA / 保密協議）
- E-sign 整合（DocuSign / HelloSign / 台灣電子簽章）
- 合約版本比較（diff）
- 到期提醒
- 自動更新條款

### 風險管理
- AI 合約初篩（找出風險條款）
- 人工法律審閱 queue（⚠️ 永遠需要人工終審）
- IP 歸屬條款管理
- 管轄區附注（多國）

### 合規管理
- 隱私政策 / 使用條款自動生成（依國家）
- Cookie consent 管理
- GDPR / CCPA / PDPA 合規 checklist
- 資料處理協議（DPA）
- 訴訟風險記錄

### 跨國法規對照
| 地區 | 主要法規 | 對應功能 |
|------|----------|----------|
| 台灣 | 個資法 | 隱私政策、同意書 |
| 歐盟 | GDPR | Cookie consent, DPA, 資料主體權利 |
| 美國 | CCPA, CAN-SPAM | 隱私政策, 退訂機制 |
| 日本 | 個人情報保護法 | 資料蒐集同意 |
| 東南亞 | PDPA(TH), PDPA(SG) | 依國別客製 |

---

## OS 10 — IT / Infra OS（IT 與基礎設施）

**對應公司部門：** IT + Security + DevOps

### 每間客戶部署標準
- DNS 管理（Cloudflare）
- WAF + DDoS 防護
- SSL 憑證自動更新
- 備份（每日自動 + 驗證 + 異地）
- Uptime monitoring（Better Uptime）
- Plugin / WordPress 自動更新排程
- 惡意軟體掃描（Wordfence）
- 滲透測試報告追蹤

### Agency 自身 IT
- Secrets 治理（Vault / env manager）
- Zero-trust 存取架構
- Access review 週期（每季）
- Endpoint policies
- 供應商存取管理

### 基礎設施即程式碼
```
infra/
 ├── cloudflare/     # DNS / WAF / CDN 規則
 ├── github/         # CI/CD workflows
 ├── trigger/        # Durable workflows
 ├── n8n/            # Automation flows
 └── supabase/       # DB migrations + policies
```

---

## OS 11 — HR / People OS（人資）

**對應公司部門：** HR + People Operations

### Agency 自身人資
- 員工 / 承包商資料管理
- 招募流程（JD 生成 / 面試追蹤 / offer）
- 入職 / 離職流程自動化
- 薪資計算基礎資料（不含自動送件）
- OKR 追蹤
- 績效評估流程
- 訓練與認證追蹤

### 客戶企業 HR 系統（如有需求）
- 出缺勤管理
- 排班系統
- 員工 portal
- 薪資單管理

---

## OS 12 — Ops OS（行政 / 內部流程）

**對應公司部門：** Operations + Administration

- 任務分配 + 提醒
- 文件路由
- 供應商 registry + 評估
- SOP 維護
- 內部需求 desk
- 會議紀錄自動生成
- 內部公告系統
- 資產管理（軟體授權 / 硬體）

---

## OS 13 — Partner / Ecosystem OS（合作夥伴）

**新增模組**

- 合作夥伴 onboarding
- Referral commission 計算 + 自動請款
- 白標服務管理
- 技術夥伴整合目錄（API / plugin 合作）
- 代理商 / 子代理架構
- 轉介紹追蹤
- 合作夥伴 portal

---

## OS 14 — Media / Asset Pipeline（媒體資產）

**新增模組**

- 圖片壓縮 + WebP 自動轉換
- AI 圖片生成工作流（DALL-E / Midjourney / Stable Diffusion）
- 影片轉碼 + 字幕自動生成
- R2 / S3 CDN 管理
- 品牌資產庫（客戶專屬，隔離儲存）
- 資產版本控制
- 圖片授權管理（免版稅 / 客戶提供）

---

## OS 15 — Compliance / Governance OS（合規治理）

**新增模組**

- GDPR / PDPA / CCPA 合規 checklist
- Cookie consent 自動設定（依國家）
- 資料保留政策管理
- 存取權限審閱週期（季度）
- 資料外洩應變流程
- 監管報告自動化
- ESG 基礎報告（大型客戶需求）

---

## OS 16 — PMO / Delivery OS（專案交付治理）

**對應公司部門：** Project Management Office

- 專案生命週期管理（intake → deliver → review）
- Milestones + acceptance criteria
- 變更請求管理（Change Request）
- Launch readiness checklist
- 客戶驗收流程
- Post-launch review（2 週、1 個月、3 個月）
- 資源排程 + 容量規劃
- 跨專案依賴追蹤
- 交付品質評分
- SLA 履約率追蹤

---

## OS 17 — Knowledge / Training OS（知識管理）

**對應公司部門：** L&D + Documentation

- SOP + runbook（所有流程文件化）
- Client training center（每間客戶的網站使用教學）
- Internal wiki
- Playbooks + reusable templates
- 影片教學腳本
- 認證與培訓追蹤
- AI 知識搜尋（RAG）
- 版本化文件管理
- 新人 onboarding 包

---

## OS 18 — Supply Chain OS（供應鏈）

**為有實體商品的客戶建置**

- 採購管理（PO / 供應商 / 條款）
- 倉儲管理（WMS 整合）
- 物流管理（多家物流商 API）
- 出貨追蹤
- 退貨 / 換貨流程
- 供應商評估系統
- 庫存預測（AI）

---

## OS 19 — Analytics / Decision Engine ⭐

**對應公司部門：** Data Intelligence + Executive Function

這是最重要的一層，把所有 OS 的數據變成決策。

### 輸入（所有 OS 都往這裡送資料）
- CX OS → 客戶健康度、ticket 趨勢、satisfaction score
- Commerce OS → GMV、轉換率、AOV、退貨率
- Marketing OS → CAC、ROAS、SEO 排名
- Finance OS → 收入、獲利率、現金流
- Factory OS → 交付速度、品質分數
- IT OS → 上線率、安全事件

### 處理（Decision Engine 計算）
- 每個客戶的獲利率評分
- 服務品質評分
- Churn risk prediction
- Upsell opportunity scoring
- 資源優先級建議
- 異常偵測 + 告警
- 市場擴張機會分析

### 輸出（行動建議）
- CX OS：該做 upsell / retention 的客戶
- Sales OS：該 follow-up 的 lead
- Factory OS：需要修復的網站
- Marketing OS：效益最高的管道
- Finance OS：財務異常警告

### 資料模型
```sql
kpi_snapshots (
  id uuid pk, organization_id uuid, workspace_id uuid,
  metric_type text, value numeric, unit text,
  period text, snapshot_at timestamptz
)

client_scores (
  id uuid pk, organization_id uuid, workspace_id uuid,
  health_score int,       -- 0-100
  revenue_score int,      -- 0-100
  churn_risk_score int,   -- 0-100 (higher = more risk)
  upsell_score int,       -- 0-100 (higher = better opportunity)
  overall_score int,      -- composite
  calculated_at timestamptz
)

action_recommendations (
  id uuid pk, organization_id uuid, workspace_id uuid,
  action_type text,
  priority text,
  reasoning jsonb,
  status text,
  created_at timestamptz
)
```

---

## OS 20 — Merchandising OS（商品策略）

**對應公司部門：** Merchandising + Category Management

> 這是大多數網建公司忽略，但百大電商非常重視的模組。

- 商品組合分析（ABC 分析）
- 上架策略建議（AI 分析競品）
- 熱銷 / 滯銷分析
- 類別管理 + 交叉銷售矩陣
- 動態定價規則引擎
- 季節性促銷規劃
- 新品上架標準流程
- 商品生命週期管理

---

# ▌ 四、Supabase 核心 Schema

```sql
-- =============================================
-- MULTI-TENANT CORE（所有表的基礎）
-- =============================================

CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  tenant_type     TEXT CHECK (tenant_type IN ('agency', 'client')),
  plan            TEXT,
  status          TEXT DEFAULT 'active',
  country         TEXT,
  timezone        TEXT DEFAULT 'Asia/Taipei',
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name            TEXT NOT NULL,
  type            TEXT, -- ecommerce/branding/portfolio/saas/booking
  status          TEXT DEFAULT 'active',
  domain          TEXT,
  staging_url     TEXT,
  production_url  TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SALES OS
-- =============================================

CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  source          TEXT, -- website/whatsapp/referral/linkedin/ads
  name            TEXT, email TEXT, phone TEXT,
  company         TEXT, country TEXT,
  budget_range    TEXT, service_interest TEXT[],
  status          TEXT DEFAULT 'new',
  score           INT DEFAULT 0,
  owner_id        UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  lead_id         UUID REFERENCES leads(id),
  content_json    JSONB, -- 完整 proposal 結構
  total_amount    NUMERIC, currency TEXT DEFAULT 'TWD',
  status          TEXT DEFAULT 'draft',
  sent_at         TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CX OS
-- =============================================

CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  subject         TEXT, status TEXT DEFAULT 'open',
  priority        TEXT DEFAULT 'medium',
  intent          TEXT, -- support/growth/complaint/inquiry/billing
  source          TEXT, -- email/chat/whatsapp/portal/phone
  sla_policy_id   UUID, assignee_id UUID,
  first_response_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ticket_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID REFERENCES tickets(id),
  sender_type     TEXT, -- ai/human/client
  sender_id       UUID, content TEXT,
  metadata        JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_health_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  score           INT CHECK (score BETWEEN 0 AND 100),
  factors         JSONB, -- {traffic, orders, engagement, payment, performance}
  trend           TEXT CHECK (trend IN ('improving','stable','declining')),
  calculated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE opportunities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  type            TEXT, -- upsell/cross_sell/renewal
  trigger_source  TEXT, -- ticket/health_score/manual
  score           INT, status TEXT DEFAULT 'open',
  proposal_id     UUID, deal_id UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  title           TEXT, severity TEXT,
  status          TEXT DEFAULT 'open',
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  postmortem      JSONB
);

-- =============================================
-- FINANCE OS
-- =============================================

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  amount          NUMERIC NOT NULL, currency TEXT DEFAULT 'TWD',
  status          TEXT DEFAULT 'draft',
  due_date        TIMESTAMPTZ,
  stripe_invoice_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  plan            TEXT, status TEXT DEFAULT 'active',
  amount          NUMERIC, currency TEXT DEFAULT 'TWD',
  billing_cycle   TEXT, -- monthly/yearly
  stripe_sub_id   TEXT,
  renew_at        TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- AUTONOMY / GOVERNANCE
-- =============================================

CREATE TABLE approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  rule_id         TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',
  requested_by    UUID, approved_by UUID,
  artifact        JSONB, -- backup confirmed, rollback plan, etc.
  ttl_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  workflow_name   TEXT, status TEXT DEFAULT 'running',
  risk_level      TEXT, input JSONB, output JSONB,
  logs            JSONB[],
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE action_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  run_id          TEXT,
  action_type     TEXT NOT NULL,
  entity_id       UUID, risk_level TEXT,
  decision        TEXT, reason TEXT,
  performed_by    TEXT, -- cursor/ai/human/system
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- DECISION ENGINE
-- =============================================

CREATE TABLE client_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  health_score    INT, revenue_score INT,
  churn_risk_score INT, upsell_score INT,
  overall_score   INT,
  calculated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE action_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  workspace_id    UUID REFERENCES workspaces(id),
  action_type     TEXT, priority TEXT,
  reasoning       JSONB,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY（多租戶隔離，必須啟用）
-- =============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
-- ... 所有表都需要啟用 RLS

-- RLS Policy 範例
CREATE POLICY "tenant_isolation" ON tickets
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

---


# ▌ 七、資料夾連動地圖

## 完整 Repo 結構

```
/
├── apps/
│   ├── api/              # 後端 API
│   ├── worker/           # Background jobs / queue
│   ├── portal/           # 客戶 portal（前端）
│   └── admin/            # 內部管理介面
├── packages/
│   ├── db/               # Supabase migrations + schemas
│   ├── workflows/        # Workflow 定義
│   ├── agents/           # AI agents
│   ├── manifests/        # WordPress / WooCommerce manifests
│   ├── policies/
│   │   ├── tool/         # Tool use policies
│   │   └── rollout/      # Rollout policies
│   ├── shared/           # 共用 types / utils / zod schemas
│   ├── cx/               # CX OS 模組
│   ├── analytics/        # Analytics OS 模組
│   ├── billing/          # Finance OS 模組
│   ├── legal/            # Legal OS 模組
│   └── media/            # Media pipeline
├── templates/
│   ├── wordpress/        # WP 模板
│   ├── woocommerce/      # WooCommerce 模板
│   ├── email/            # Email 模板
│   └── contracts/        # 合約模板
├── infra/
│   ├── github/           # CI/CD workflows
│   ├── n8n/              # Automation flows
│   ├── trigger/          # Durable workflow
│   └── cloudflare/       # DNS / WAF / CDN
├── knowledge/
│   ├── global/           # 通用知識
│   ├── industry/         # 產業知識
│   ├── clients/          # 各客戶專屬
│   └── internal/         # 內部 SOP
├── docs/                 # 所有 SPEC 文件
└── scripts/              # 工具 scripts
```

## 連動地圖（改哪裡，同時要建哪裡）

### DB Schema 變動 → 同步建置
```
/packages/db/migrations
/packages/db/schemas
/apps/api/src/types
/packages/shared/src/zod
/packages/cx/src/types
/packages/billing/src/types
/packages/analytics/src/types
/docs/*SPEC.md
```

### Workflow 變動 → 同步建置
```
/packages/workflows
/packages/policies/tool
/apps/worker
/infra/trigger
/infra/n8n
/packages/cx/workflows
/docs/WORKFLOW_SPEC.md
```

### Agent 變動 → 同步建置
```
/packages/agents
/packages/policies/tool
/packages/policies/rollout
/packages/shared/src/zod
/packages/cx/agents
/docs/AGENT_POLICY_SPEC.md
```

### WordPress Manifest 變動 → 同步建置
```
/packages/manifests
/templates/wordpress
/templates/woocommerce
/scripts
/packages/workflows
/packages/policies/tool
/docs/WP_FACTORY_SPEC.md
```

### Billing / Finance 變動 → 同步建置
```
/packages/billing
/packages/db/schemas
/apps/api/src/routes/billing
/templates/contracts
/docs/FINANCE_SPEC.md
```

### Legal / Contracts 變動 → 同步建置
```
/packages/legal
/templates/contracts
/apps/portal
/docs/LEGAL_SPEC.md
```

### CX OS 變動 → 同步建置
```
/packages/cx
/packages/workflows
/packages/agents
/packages/db/schemas
/apps/portal
/knowledge/
/infra/n8n
/docs/CX_OS_SPEC.md
```

### Media / Assets 變動 → 同步建置
```
/packages/media
/templates/wordpress
/infra/cloudflare
/packages/workflows
/docs/MEDIA_SPEC.md
```

### Analytics 變動 → 同步建置
```
/packages/analytics
/apps/admin
/apps/portal
/packages/cx
/docs/ANALYTICS_SPEC.md
```

### Deploy / Infra 變動 → 同步建置
```
/infra/github
/infra/trigger
/apps/worker
/packages/workflows
/packages/policies/rollout
/docs/ROLLOUT_SPEC.md
```

---
# ▌ 八、核心 Workflow 包

## Workflow 1 — 新 Ticket 自動處理

```
Trigger: new ticket created

Step 1: AI intent classification
  → support / growth_need / complaint / billing / inquiry

Step 2: Branch by intent
  IF support:
    → RAG knowledge base lookup
    → auto reply (if confidence > 0.85)
    → else: assign to L1 human
  IF growth_need:
    → check customer health score
    → create opportunity record
    → generate proposal draft
    → notify sales
  IF complaint:
    → check history (repeat complaint?)
    → if repeat: escalate to L2
    → notify CS lead
  IF billing:
    → pull invoice records
    → auto explain (if standard query)
    → else: route to finance

Step 3: Update ticket status + log action
Step 4: SLA timer check
```

## Workflow 2 — Health Score → Retention

```
Trigger: daily cron (2:00 AM)

For each active workspace:
  → Pull GA4 traffic (7d trend)
  → Pull WooCommerce orders (30d)
  → Pull ticket count (30d)
  → Pull payment status
  → Pull Core Web Vitals
  → Calculate health score (0-100)
  → Store in customer_health_scores
  → Calculate trend (vs last week)

IF score < 30:
  → severity = critical
  → notify CX lead immediately
  → create retention task
  → draft rescue plan
  → schedule check-in call

IF score 30-50:
  → severity = warning
  → create retention task
  → send "we noticed" email

IF score > 80 AND trend = improving:
  → create upsell opportunity
  → notify sales
```

## Workflow 3 — Factory OS 建站流水線

```
Trigger: new workspace created (type = ecommerce/branding)

Phase 1: Setup (automated)
  → provision staging server
  → install WordPress (latest)
  → apply manifest (plugins + theme)
  → configure SMTP + DNS (staging)
  → install SSL

Phase 2: Configuration (automated)
  → WooCommerce setup (if ecommerce)
  → payment gateway (test mode)
  → SEO plugin config
  → analytics tracking (GA4 + PostHog)
  → security hardening

Phase 3: QA (automated + human review)
  → smoke tests (50-item checklist)
  → performance test (Core Web Vitals)
  → security scan
  → cross-browser test
  → generate QA report

Phase 4: Client Review (human required)
  → send staging URL to client
  → await feedback
  → implement revisions

Phase 5: Launch (approval-gated)
  → require: approval record exists
  → require: backup verified
  → require: DNS TTL ready
  → execute: production deploy
  → post-launch monitoring (24h)
```

## Workflow 4 — Upsell Automation

```
Trigger: opportunity created (score > 70)

Step 1: Research client
  → pull workspace data (services, history)
  → pull health score + trends
  → pull competitor benchmark (if available)

Step 2: Generate proposal
  → AI draft proposal
  → select appropriate service package
  → calculate ROI estimate

Step 3: CRM update
  → create deal record
  → assign to sales owner
  → set follow-up reminder (3 days)

Step 4: Outreach
  → send proposal email (via FluentCRM)
  → log in ticket system
  → track open/click
```

## Workflow 5 — Incident Response

```
Trigger: uptime monitor alert OR manual report

Step 1: Classify severity
  → critical: site down, payment broken
  → high: major feature broken
  → medium: performance degraded
  → low: minor UI issue

IF critical OR high:
  Step 2: Notify team (Slack + email, < 5 min)
  Step 3: Notify client (email + WhatsApp, < 15 min)
  Step 4: Create incident record
  Step 5: Start fix workflow
  Step 6: Update status every 30 min
  Step 7: Resolved → postmortem within 24h
```

---

# ▌ 九、企業級技術棧

| 層級 | 工具 | 用途 | 優先級 |
|------|------|------|--------|
| DB | Supabase | 多租戶資料、RLS、Auth、Vector | P0 |
| Workflow | Trigger.dev | Durable workflow、job queue | P0 |
| Automation | n8n（self-hosted） | 自動化流程、第三方整合 | P0 |
| Error Tracking | Sentry | 錯誤追蹤、告警 | P0 |
| Analytics | PostHog | 產品行為、funnel 分析 | P0 |
| Infra | Cloudflare | DNS + WAF + CDN + R2 + Workers | P0 |
| Billing | Stripe | 訂閱 + 請款 + 發票 | P0 |
| Email Transactional | Resend | 系統通知信 | P0 |
| Email Marketing | FluentCRM | 行銷自動化 | P0 |
| Monitoring | Better Uptime | 上線監控 + 狀態頁 | P0 |
| Storage | Cloudflare R2 | 資產儲存 | P1 |
| Secrets | Infisical / Doppler | 金鑰治理 | P1 |
| E-sign | DocuSign / HelloSign | 合約簽署 | P1 |
| Accounting | Xero 或 QuickBooks | 財務同步 | P1 |
| Browser QA | Playwright | 自動化測試 | P1 |
| Knowledge / Search | Supabase Vector + pgvector | RAG 知識搜尋 | P1 |
| Communication | Twilio / WhatsApp Business API | 多通道通訊 | P1 |
| Media Processing | Cloudinary 或 Sharp + R2 | 圖片處理 | P2 |
| AI Image | Replicate / fal.ai | AI 圖片生成 | P2 |
| Video | Mux 或 Cloudflare Stream | 影片處理 | P2 |
| HR | Rippling 或自建 | 人資管理 | P2 |

---


# ▌ 十、Gap 分析與建置路線圖

## 現狀 vs 目標

| 模組 | 現在 | 目標 |
|------|------|------|
| 建站 | ✅ 核心優勢 | 完整 Launch Checklist + Manifest |
| 自動化 | ✅ 有基礎 | 完整 Workflow Pack（20 個 OS）|
| CX 系統 | 🟡 有雛形 | CX OS 完整 7 層 |
| CRM | 🟡 FluentCRM | + Success Engine + Health Score |
| Support | 🟡 基本 ticket | + SLA + AI 分類 + 升級策略 |
| Retention | ❌ 沒有 | Health Score → 自動 Workflow |
| Upsell | ❌ 人工 | Revenue Expansion 自動化 |
| Knowledge | ❌ 零散 | Structured + RAG |
| Incident | ❌ 無 | 完整流程 + Postmortem |
| Merchandising | ❌ 無 | 商品策略模組 |
| Decision Engine | ❌ 無 | 全公司決策大腦 |
| Finance OS | 🟡 基本 | 完整 Quote → Invoice → Stripe |
| Legal OS | 🟡 合約模板 | + E-sign + 跨國合規 |
| Analytics OS | 🟡 各自獨立 | 統一 Data OS + Dashboard |
| Partner OS | ❌ 無 | 合作夥伴 + Referral |
| Media Pipeline | ❌ 零散 | 完整 Asset Pipeline |
| Multi-tenant | 🟡 部分 | 完整 org_id + workspace_id + RLS |
| HR OS | ❌ 無 | 基礎人資系統 |
| Supply Chain | ❌ 無 | 為實體客戶建置 |

---

## 建置路線圖

### Phase 0 — 地基（現在，1-2 週）
1. 建立多租戶核心 Schema（organization_id + workspace_id + RLS）
2. 建立 apps/api 基礎骨架（auth + org + workspace）
3. 建立 packages/shared（types + zod schemas）
4. 建立 LINKED_FOLDERS_POLICY（資料夾連動規則）
5. 建立所有 SPEC.md 文件骨架（20 個 OS）

### Phase 1 — 核心 OS（第 1 個月）
6. Factory OS — 完整建站流水線 + 50 項 Launch Checklist
7. CX OS — Ticket + SLA + AI 分類 + Knowledge RAG
8. Finance OS — Quote → Invoice → Stripe
9. Analytics — GA4 + PostHog + Sentry + Uptime 整合
10. Legal OS — 合約模板 + E-sign + 基礎合規

### Phase 2 — 智慧層（第 2-3 個月）
11. Decision Engine — Health Score + Churn Prediction + Upsell Score
12. CX OS 進階 — Retention Workflow + Revenue Expansion
13. Marketing OS — SEO Workflow + Email Funnel + Campaign
14. Data OS Dashboard — 跨客戶 KPI 總覽
15. Partner / Ecosystem OS — Referral + 白標

### Phase 3 — 完整 Company OS（第 4-6 個月）
16. Media Pipeline — AI 圖片 + 影片 + CDN
17. Compliance OS — 跨國 GDPR/PDPA 自動化
18. HR / People OS — 招募 + 入職 + OKR
19. Supply Chain OS — 為實體客戶建置
20. Merchandising OS — 商品策略 + 動態定價

---

# ▌ 十一、核心原則

> **客服不是部門，是全公司最重要的資料入口。**
> 所有問題、機會、風險都先在 CX OS 出現。CX OS = 收入引擎。

> **你不是在做網站公司。**
> 你在做：一個可以複製「整間百大電商公司結構」的系統工廠。

> **先建完整骨架，再補深度。**
> 20 個 OS 都有骨架，比 1 個 OS 很完整更有價值。

---

*Last updated: 2026-03*
*Version: 3.0.0 — Build Mode*
*Maintained by: Lobster Factory Agency OS*
