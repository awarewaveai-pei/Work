# Client Onboarding Portal — 14 段完整工程規格

> **狀態**：規格完成 2026-06-02，尚未實作。
> **使用方式**：每段標 `✅已有` 或 `🆕要做`。工程師/AI 照這份逐段 build，不需重新研究。
> **研究底稿**：`agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md`（所有 file:line）
> **設計全文**：`.claude/plans/https-github-com-jonjonesai-claude-wp-sequential-clock.md`（四層控制平面 / 威脅模型 / 商業定位）
> **限制條件**：prod 不自動改 / 全程 staging-first / 每步有 logs·run_id·status·rollback / 高風險 approval / 多客戶·多專案·多站

---

## § 1 — Onboarding Form 欄位清單

🆕要做（現有 OnboardWizard 是操作者技術介面，非客戶探索式表單）

| 欄位 | 說明 |
|------|------|
| company_name | 公司/品牌正式名稱 |
| brand_tagline | 一句話定位（可選） |
| industry | 產業類別（下拉：電商 / 服務業 / 觀光旅遊 / 藝術創作 / 教育 / 其他） |
| target_audience | 主要客群描述（自由文字，200字內） |
| primary_goal | 建站主要目的（多選：品牌展示 / 線上販售 / 預約服務 / 內容部落格 / 名片站） |
| reference_sites | 參考網站 URL（最多 3 個，讓 Claude 抽取視覺方向） |
| visual_style | 視覺風格偏好（多選：極簡 / 溫暖 / 專業 / 活潑 / 奢華） |
| primary_color | 品牌主色（hex 或描述） |
| logo_status | 已有 LOGO / 需要生成佔位 / 待提供 |
| pages_needed | 需要哪些頁面（多選：首頁 / 關於 / 產品/服務 / 部落格 / 聯絡 / 購物車 / 預約） |
| has_ecommerce | 需要線上販售？（是/否） |
| product_type | 有電商時填：實體商品 / 數位商品 / 客製商品(POD) / 服務預約 |
| needs_crm | 需要 CRM / 客戶名單管理？（是/否） |
| needs_booking | 需要預約系統？（是/否） |
| contact_email | 客戶聯絡 email（用於 FluentSMTP 寄件設定） |
| domain | 已有網域？填寫；無則留空（系統建 staging） |
| language | 主要語言（繁中 / 英文 / 其他） |
| existing_content | 已有文案素材？（是 / 部分 / 無，需 AI 生成） |
| budget_tier | 預算級別（starter / business / enterprise）— 影響 package 選擇 |
| launch_urgency | 上線時程（1個月內 / 1-3個月 / 無期限） |

---

## § 2 — 欄位分類

🆕要做（intake form 的 UX 分組）

| 分組 | 欄位 |
|------|------|
| **公司 & 品牌** | company_name, brand_tagline, industry, primary_color, logo_status |
| **客群 & 目標** | target_audience, primary_goal |
| **網站需求** | pages_needed, language, domain |
| **功能需求** | has_ecommerce, product_type, needs_crm, needs_booking |
| **素材狀態** | existing_content, logo_status |
| **參考 & 視覺** | reference_sites, visual_style |
| **技術需求** | （由系統根據功能需求自動推導，客戶不填） |
| **維運需求** | contact_email, budget_tier, launch_urgency |

表單採多步驟分頁（參考 sc-icg.com / yangsheep.art 的 intake UX）：
- Step 1：公司 & 品牌（2 min）
- Step 2：你的客戶 & 目標（1 min）
- Step 3：功能需求（2 min）
- Step 4：視覺偏好 + 參考（2 min）
- Step 5：素材 & 時程（1 min）
- 完成：自動觸發 spec 生成

---

## § 3 — 每欄資料型別 + 必填

🆕要做（TypeScript interface）

```typescript
// 新建檔案：lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/onboarding/intake-form.ts

export interface IntakeForm {
  // 必填
  company_name: string               // min 1, max 100
  industry: Industry                 // enum
  primary_goal: PrimaryGoal[]        // min 1
  pages_needed: PageType[]           // min 1
  has_ecommerce: boolean
  budget_tier: 'starter' | 'business' | 'enterprise'

  // 選填
  brand_tagline?: string             // max 200
  target_audience?: string           // max 500
  reference_sites?: string[]         // max 3, URL format
  visual_style?: VisualStyle[]
  primary_color?: string             // hex or description
  logo_status?: 'has_logo' | 'need_placeholder' | 'will_provide'
  product_type?: ProductType[]       // required if has_ecommerce
  needs_crm?: boolean
  needs_booking?: boolean
  contact_email?: string             // email format
  domain?: string                    // URL format
  language?: 'zh-TW' | 'en' | string
  existing_content?: 'yes' | 'partial' | 'no'
  launch_urgency?: 'within_month' | 'one_to_three_months' | 'no_rush'
}

export type Industry = 'ecommerce' | 'service' | 'tourism' | 'arts' | 'education' | 'other'
export type PrimaryGoal = 'brand' | 'sell' | 'booking' | 'blog' | 'card_site'
export type PageType = 'home' | 'about' | 'products' | 'blog' | 'contact' | 'cart' | 'booking'
export type VisualStyle = 'minimal' | 'warm' | 'professional' | 'playful' | 'luxury'
export type ProductType = 'physical' | 'digital' | 'pod' | 'booking'
```

---

## § 4 — Package / Plugin Manifest 自動選擇規則（Decision Tree）

✅已有：packs 目錄 `lib/wp-plugin-stack-catalog.ts`、manifest 檔 `packages/manifests/`
🆕要做：規則引擎（把 intake form → package 決策）

```typescript
// 新建：lib/onboarding/package-selector.ts

export function selectPackage(form: IntakeForm): {
  packageSlug: 'wp-basic' | 'wp-business' | 'wc-core' | 'wc-custom'
  packs: PackKey[]
  rationale: string
} {
  // 規則（優先順序從高到低）
  if (form.has_ecommerce && form.product_type?.includes('pod')) {
    return { packageSlug: 'wc-custom', packs: ['base', 'ecommerce'], rationale: '客製商品電商' }
  }
  if (form.has_ecommerce) {
    return { packageSlug: 'wc-core', packs: ['base', 'ecommerce'], rationale: '標準電商' }
  }
  if (form.industry === 'tourism') {
    return { packageSlug: 'wp-business', packs: ['base', 'tourism'], rationale: '觀光旅遊業' }
  }
  if (form.primary_goal.includes('booking') || form.needs_booking) {
    return { packageSlug: 'wp-business', packs: ['base', 'tourism'], rationale: '預約服務' }
  }
  if (form.needs_crm || form.budget_tier === 'business' || form.budget_tier === 'enterprise') {
    return { packageSlug: 'wp-business', packs: ['base', 'brand'], rationale: '品牌 + CRM' }
  }
  // 預設
  return { packageSlug: 'wp-basic', packs: ['base'], rationale: '品牌展示站' }
}
```

**決策邏輯一覽：**

| 條件 | Package | Packs |
|------|---------|-------|
| 有電商 + 客製商品 / POD | `wc-custom` 🆕 | base + ecommerce |
| 有電商（一般） | `wc-core` | base + ecommerce |
| 觀光旅遊業 | `wp-business` | base + tourism |
| 需預約系統 | `wp-business` | base + tourism |
| 需 CRM / business tier+ | `wp-business` | base + brand |
| 其他（品牌展示） | `wp-basic` | base |

---

## § 5 — Package / Manifest JSON 結構範例

✅已有（reuse `packages/manifests/wp-basic.json`, `wp-business.json`, `wc-core.json`）
🆕要做：新增 `wc-custom.json`（客製商品電商）

**現有結構（`packages/manifests/wp-basic.json` 為例）：**
```json
{
  "manifestVersion": "1.0",
  "packageSlug": "wp-basic",
  "label": "WordPress Basic",
  "pluginPacks": ["base"],
  "themeFamily": "kadence",
  "steps": [
    { "action": "install_plugins", "packs": ["base"] },
    { "action": "activate_theme", "theme": "kadence" },
    { "action": "configure_seo", "plugin": "rank-math" },
    { "action": "smoke_test" }
  ]
}
```

**新增 `wc-custom.json`（🆕）：**
```json
{
  "manifestVersion": "1.0",
  "packageSlug": "wc-custom",
  "label": "WooCommerce Custom/POD",
  "pluginPacks": ["base", "ecommerce"],
  "themeFamily": "kadence",
  "steps": [
    { "action": "install_plugins", "packs": ["base", "ecommerce"] },
    { "action": "activate_theme", "theme": "kadence" },
    { "action": "configure_woo", "mode": "custom_products" },
    { "action": "configure_product_spec_fields" },
    { "action": "configure_seo", "plugin": "rank-math" },
    { "action": "smoke_test" }
  ]
}
```

---

## § 6 — Claude 如何依 Form 生成完整網站規格

🆕要做（spec 生成大腦）

**輸入：** `IntakeForm` + 參考站截圖（選填）
**輸出：** `WebsiteSpec`（可直接交給 build pipeline）

```typescript
// 新建：lib/onboarding/spec-generator.ts

export interface WebsiteSpec {
  // 基本資訊
  site_name: string
  tagline: string
  language: string
  package_slug: string
  packs: PackKey[]

  // 網站地圖
  sitemap: SitemapPage[]

  // 首頁設計
  homepage: {
    hero: { headline: string; subheadline: string; cta_text: string; cta_url: string }
    sections: HomepageSection[]
  }

  // 設計方向
  design: {
    style_direction: string          // 1-2句，給 Kadence 設定參考
    primary_color: string
    secondary_color: string
    font_suggestion: string
    image_style: string              // e.g. "溫暖真實人物攝影"
  }

  // 圖片需求清單
  image_requirements: ImageRequirement[]

  // Plugin 配置
  plugin_config: {
    kadence: KadenceConfig
    woocommerce?: WooConfig
    fluentcrm?: FluentCRMConfig
    fluentforms?: FluentFormsConfig
    rankmath: RankMathConfig
    fluentsmtp: FluentSMTPConfig
    sitekit?: SiteKitConfig
    litespeed?: LitespeedConfig
  }

  // SEO
  seo: {
    meta_title: string
    meta_description: string
    focus_keywords: string[]
    schema_type: 'LocalBusiness' | 'Store' | 'Organization' | 'Person'
  }
}
```

**生成流程（Claude 作為 spec 大腦）：**
```
1. 讀取 IntakeForm
2. 若有 reference_sites → WebFetch 抓取頁面 → 抽取視覺元素（色調、版型、圖片風格）
3. 根據 industry + primary_goal 選擇 sitemap 範本
4. 生成首頁文案（headline / subheadline / CTA）
5. 推導 design（色彩 / 字型 / 風格方向）
6. 列出圖片需求（每個 section 需要什麼類型的圖）
7. 根據 package 決策輸出 plugin_config（每個外掛的具體設定）
8. 生成 SEO meta
9. 輸出完整 WebsiteSpec JSON
```

**觸發方式：** intake form 完成 → POST `/api/onboarding/generate-spec` → Claude API（Sonnet 4.6）→ 回傳 WebsiteSpec → 儲存進 `organizations.metadata.website_spec`

---

## § 7 — WordPress Factory Staging-First 建站流程

✅已有：Trigger.dev 任務、sg-deploy 自動回滾、manifest executor
🆕要做：串接 intake → spec → staging 自動觸發

**完整流程：**

```
客戶填完表單
    ↓
§ 4 Package 選擇（自動）
    ↓
§ 6 Claude 生成 WebsiteSpec（自動，~30秒）
    ↓
操作者在 Dashboard 審核規格（human gate）
    ↓ approve
orchestrate-tenant-provisioning（Trigger.dev）
    ├─ 建立 organization + site + environment (staging)
    ├─ 建 GitHub repo
    ├─ 建 Sentry project（§ 8）
    ├─ 建 Uptime Kuma monitors（§ 8）
    └─ 觸發 create-wp-site（staging only）
            ↓
    apply-manifest（安裝 plugins + 基本設定）
            ↓
    WP Bridge 套用 WebsiteSpec（§ 6）
    ├─ 套 Kadence 主題設定
    ├─ 套 plugin 配置（FluentCRM / FluentForms / RankMath…）
    ├─ 建首頁 Kadence 區塊
    └─ 每步 self-healing transaction（改→驗證→rollback if fail）
            ↓
    smoke_test（4 endpoints）
            ↓
    通知操作者「staging 準備好，請審核」（Telegram + Slack）
            ↓
    操作者審核 staging（人工）
            ↓ approve
    翻 lifecycle: staging → live（客戶端 DNS 切換）
```

**限制條件（全程強制）：**
- `LOBSTER_MANIFEST_EXECUTION_MODE=dry_run` 預設；`apply` 需明示
- staging 不等於 prod；prod 寫入需 approval
- 每步有 `run_id` + `status` + `rollback_token`
- 失敗自動回滾，寫 ops-inbox

---

## § 8 — Monitoring 整合設計

✅已有：webhook routes（sentry/uptime-kuma/netdata/grafana/posthog）、ops-inbox notify
🆕要做：建站後自動佈建 per-tenant 監控

**建站完成後自動執行：**

```typescript
// 擴充 orchestrate-tenant-provisioning.ts 的 provider 清單

providers: [
  'github',     // 已有
  'sentry',     // 已有 — 擴充：自動建 per-client project
  'n8n',        // 已有
  'trigger',    // 已有
  'supabase',   // 已有
  'uptime_kuma' // 🆕 — 自動建以下 monitors
]
```

**Uptime Kuma 自動建立的 monitors（per tenant）：**

| Monitor | URL/對象 | 觸發條件 |
|---------|----------|---------|
| 網站上線監測 | `https://{domain}/` | HTTP non-2xx |
| SSL 憑證 | `{domain}:443` | 到期 < 14 天 |
| WP Admin 可用 | `https://{domain}/wp-admin/` | HTTP non-2xx |
| API 健康 | `https://{domain}/wp-json/` | HTTP non-2xx |
| WooCommerce 結帳（若有電商） | `https://{domain}/checkout/` | HTTP non-2xx |
| 聯絡表單（若有 FluentForms） | `https://{domain}/?page=contact` | HTTP non-2xx |

**Sentry 自動建 project（per tenant）：**
```
project_name: "{tenant_slug}-wp"
platform: "php"
dsn → 自動寫入 wp-config.php SENTRY_DSN
捕捉：plugin fatal errors / PHP exceptions / WP_Error
```

**告警路由：**
- 嚴重問題 → 操作者 Telegram + Slack（ops-inbox 現有邏輯）
- 一般告警 → ops-inbox only
- 客戶可選：也傳到客戶自己的 Slack/Email（per-tenant 告警路由設定）

---

## § 9 — Slack / Telegram / Email Alert Workflow

✅已有：ops-inbox notify/dispatcher、slack.ts、telegram.ts（2026-06-02 已改雙語）
🆕要做：per-tenant 客戶告警路由

**現有架構（操作者告警）：**
```
事件發生 → webhook route → ops-inbox → dispatcher → Slack #ops-incidents + Telegram
```

**擴充：per-tenant 客戶告警（可選功能）：**
```typescript
// tenant_integration_bindings 新增 provider: 'client_slack' | 'client_email'
// 客戶在 onboarding 填寫自己的 Slack webhook 或 email
// 嚴重度 high/critical 才送客戶，避免告警疲勞
```

**告警格式（雙語，與系統統一）：**
```
🚨 {site_name} 網站服務中斷
您的網站暫時無法連線，我們已收到通知並處理中。
（技術資訊：uptime_kuma monitor={monitor_id} status=DOWN since={ts}）
```

---

## § 10 — Repair-Agent 自動修復流程

✅已有：repair-center 全套（types/policy/service/backup/github）、Phase 4 觀察期進行中
🆕要做：擴充 policy 涵蓋 WP plugin fatal / staging-only repair

**現有修復 policy（per source）：**
- sentry → auto_repair（可自動）
- uptime_kuma / grafana → analysis_only（可升 PR）
- netdata / deploy → human_only
- manual → triage_needed

**新增（WP 客戶站）：**
```typescript
// policy.ts 新增
'wp_plugin_fatal': {
  policy: 'analysis_only',    // Claude 分析，不自動改 prod
  can_escalate_to_pr: true,
  staging_repair_allowed: true  // 可在 staging 試修後 smoke test
}
```

**修復流程（staging-first）：**
```
WP plugin fatal → Sentry webhook → ops-inbox
    ↓
AI 分析（Claude / Gemini cascade，現有 triggerAutoClassify）
    ↓
生成修復方案（更新外掛版本 / 停用衝突外掛）
    ↓
先在 staging 套修 → smoke test
    ↓ 通過
操作者 Slack approve
    ↓
prod 套修 → smoke test → resolved
    ↓ 失敗
自動回滾 staging → 通知操作者人工處理
```

**永遠不自動做的事：**
- 改 prod 資料庫
- 刪訂單 / 刪客戶資料
- 改付款設定

---

## § 11 — 自動 vs 人工 Approval 分界表

✅已有：approvals route、command_requests、system_modes、critical pipeline gate

| 操作 | 自動 | 需 Approval | 備註 |
|------|------|-------------|------|
| 生成 WebsiteSpec（AI 規格） | ✅ | — | 操作者可修改後再觸發 build |
| 建 staging 環境 | ✅ | — | |
| 安裝 plugins（staging） | ✅ | — | |
| 套用 Kadence 設定（staging） | ✅ | — | self-healing transaction |
| 建 Sentry / Uptime Kuma monitors | ✅ | — | |
| 進行 smoke test | ✅ | — | |
| **觸發 staging → prod 切換** | ❌ | ✅ 操作者 | high risk |
| **prod 任何寫入** | ❌ | ✅ 操作者 | high risk |
| **更新 prod plugins** | ❌ | ✅ 操作者 | |
| **刪除任何資料** | ❌ | ✅ 操作者 | |
| critical severity 修復 | ❌ | ✅ 操作者 | triage_needed gate |
| 付款 / 金流相關設定 | ❌ | ✅ 操作者 | 永不自動 |

---

## § 12 — Supabase 資料表設計

✅已有：`packages/db/migrations/0001..0028`（organizations / sites / environments / tenant_integration_bindings…）
🆕要做：新增 intake_forms 表 + website_specs 表

**新增 migration（`0029_intake_forms.sql`）：**
```sql
-- 客戶填寫的 intake form（原始資料）
CREATE TABLE public.intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  form_data jsonb NOT NULL,           -- IntakeForm JSON
  submitted_at timestamptz DEFAULT now(),
  submitted_by text,                  -- 操作者 email
  status text DEFAULT 'pending'       -- pending / spec_generated / building / live
);

-- Claude 生成的網站規格
CREATE TABLE public.website_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_form_id uuid REFERENCES public.intake_forms(id),
  organization_id uuid REFERENCES public.organizations(id),
  spec_data jsonb NOT NULL,           -- WebsiteSpec JSON
  generated_at timestamptz DEFAULT now(),
  generated_by text DEFAULT 'claude-sonnet-4-6',
  approved_at timestamptz,
  approved_by text,
  version int DEFAULT 1               -- 支援多版本規格
);

-- RLS
ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_specs ENABLE ROW LEVEL SECURITY;
```

**現有表的使用（reuse，不改）：**
- `organizations` — 每個客戶一筆，`metadata` jsonb 存額外資訊
- `sites` — 每個站一筆（staging / prod 各一）
- `environments` — base_url / hosting_provider / wp_root_path
- `tenant_integration_bindings` — Sentry / Uptime Kuma / n8n 綁定
- `workflow_runs` — 每次建站任務的執行記錄

---

## § 13 — n8n / Trigger.dev Workflow 設計

✅已有：Trigger.dev 任務 `orchestrate-tenant-provisioning` / `create-wp-site` / `apply-manifest`
🆕要做：串接 intake → spec → build 的 orchestration

**Trigger.dev（主建站 pipeline）：**

```typescript
// 擴充 orchestrate-tenant-provisioning.ts

export const orchestrateTenantProvisioning = task({
  id: 'orchestrate-tenant-provisioning',
  run: async (input: {
    organizationId: string
    intakeFormId: string       // 🆕
    websiteSpecId: string      // 🆕
    providers: ProviderKey[]
  }) => {
    // 1. 建 org + site + environments（已有）
    // 2. 建 GitHub repo（已有）
    // 3. 建 Sentry project（🆕 per-tenant）
    // 4. 建 Uptime Kuma monitors（🆕 per-tenant）
    // 5. create-wp-site staging（已有）
    // 6. apply-manifest（已有）
    // 7. wp-bridge apply WebsiteSpec（🆕）
    // 8. smoke test（已有）
    // 9. 通知操作者（已有，雙語）
  }
})
```

**n8n（客戶通知 + 週期任務）：**
```
觸發：staging 建好
  → 發 Email 給客戶（「您的預覽站已準備好」）
  → 附 staging URL + 操作手冊 PDF

觸發：每週一
  → 掃全部 active 客戶站的備份狀態
  → 異常的發通知給操作者

觸發：每月
  → 生成各客戶站健康報告
  → Email 給客戶
```

---

## § 14 — 最小 MVP（先做哪一版）

**MVP 定義：** 可以接一個真實客戶（soulfulexpression.org 或 aware-wave.com 自身），跑完完整流程，上 staging。

**MVP 包含的段落（最小可驗證版本）：**

| 段落 | MVP 範圍 | 備註 |
|------|---------|------|
| §1 intake form | 靜態 HTML 表單或 Notion form，暫時不用新建 Next.js 頁面 | 快速驗證欄位 |
| §3 TypeScript interface | ✅ 先寫 `IntakeForm` + `WebsiteSpec` type | 地基 |
| §4 package selector | ✅ 先寫規則引擎函式（純邏輯，無 UI） | |
| §5 wc-custom manifest | ✅ 新增 `wc-custom.json` | |
| §6 spec generator | ✅ Claude API 呼叫，輸出 `WebsiteSpec` JSON | 核心價值 |
| §7 staging build | ✅ 用現有 `orchestrate-tenant-provisioning`，手動觸發 | |
| §8 monitoring | ✅ 手動建 Sentry + Uptime Kuma（自動佈建可後補） | |
| §12 DB migrations | ✅ `0029_intake_forms.sql` + `0030_website_specs.sql` | |

**MVP 不包含（可後補）：**
- intake form 的精美 UI（先用 Notion / 簡單表單）
- n8n 客戶 email 通知
- per-tenant 告警路由到客戶
- WP Bridge 完整四層（Phase A 先本機沙盒）
- wc-custom POD 生成器

**MVP 執行順序：**
```
1. 寫 IntakeForm + WebsiteSpec TypeScript types（§ 3）
2. 寫 package-selector.ts（§ 4）
3. 新增 wc-custom.json manifest（§ 5）
4. 寫 spec-generator.ts（§ 6）— Claude API 呼叫
5. 新增 DB migrations 0029 + 0030（§ 12）
6. 接 API route：POST /api/onboarding/submit + /api/onboarding/generate-spec
7. 用 aware-wave.com 自身（client-zero）跑一次完整流程
8. 驗收：intake → spec → staging build → smoke test 全綠
```

**驗收 DoD：**
- intake form 填完 → Claude 輸出 `WebsiteSpec` JSON（肉眼可讀、合理）
- `orchestrate-tenant-provisioning` 跑通 staging build
- staging smoke test 4/4 PASS
- WORKLOG 有 REALTEST_EVIDENCE

---

> **下一步：** 按 §14 MVP 執行順序開工，從 §3 TypeScript types 開始。
> **開工前讀：** `agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md` §1/§2（所有 file:line 已整理好）
