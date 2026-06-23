# Cold Outreach Workbench — Integrated Master Spec v1.0

> **本文件地位**：AI 冷拜訪 + FluentCRM 暖名單培養工作台的**單一 SSOT**，取代並整合以下三份草稿：
> - `cold_email_Outbound + FluentCRM Warm Nurture.md`（產品/技術 v3.0）
> - `cold_email_deliverability_compliance_v3_final.md`（寄送風險治理 v3）
> - `cold_email_outreach_workbench_UX_v2_3_final.md`（UI/UX v2.3）
>
> **本版做了什麼**：① 三份合一、去重、版本對齊 ② 全面對齊 AwareWave 現有系統（Clerk org 多租戶、service-role RLS、wp-bridge、Trigger.dev、ai_call_logs、intake_forms、ops-console）③ 折入 7 個架構改善，把 net-new 量降到最低 ④ 明確支援三營運模式（代操 / 自用 / 賣）與「每客戶自帶 WP + FluentCRM」現實。
>
> **技術棧定位**：Next.js next-admin（控制台）+ EU Supabase（主控 DB，service-role 存取）+ 自架 Trigger.dev（AI 背景任務）+ 自架 n8n（外部串接）+ wp-bridge 外掛（per-client WP/FluentCRM 通道）+ Gmail per-org OAuth（冷信草稿）+ Resend（系統信）+ SES（暖信 optional fallback）。
>
> 版本：v1.0 Integrated｜建立：2026-06-23｜語言：繁中（code 英文）

---

# PART A — 產品與多租戶架構

## A0. 版本定位

本系統不是單純 AI 冷信生成器，也不是單純 CRM，而是一套：

```
AI Outbound Lead System
+ Human-reviewed Cold Outreach
+ Warm Lead CRM（每客戶自有 FluentCRM）
+ Free Plan Connector Router（per-org）
+ Supabase 主控資料庫（org-scoped）
+ Deliverability Risk Governance（per-org per-sender）
+ Trigger.dev / n8n 自動化後台
```

差異化**不是大量發送**，而是：名單乾淨、觀察具體、文案可信、人工審核、跟進不漏、回覆可推進、暖名單可培養、成本可控、資料可追蹤、風險一出事就停損。

## A1. 三營運模式（本版核心，文件原本沒有）

| 模式 | 誰登入 / 操作 | 誰付費 | tenancy |
|---|---|---|---|
| **自用** | 你（agency owner） | 無（內部） | 一個你自己的 org |
| **代操** | 你 / 你的團隊，代客戶操作 | 客戶（服務費） | 每客戶一個 org，你用 operator 身份跨 org |
| **賣（SaaS）** | 客戶自己登入 | 客戶（訂閱） | 每客戶一個 org，self-serve |

**統一結論**：三模式在資料層**都是 org-tenant**，差別只在「登入者是誰、operator 是否 agency、是否 self-serve onboarding + billing」。
→ 接現有 `organizations` 表 + **Supabase Auth + ops-role RBAC**（`lib/ops-role.ts`，已驗證 §B0.1）；`organization_id` 是「屬於哪個客戶」的篩選欄（由路由帶入），代操時 operator 看得到並切換所有客戶。**自用 / 代操在現有架構即可運作；賣（客戶自己登入只看自己）需 Phase 5 補真正 per-org 登入隔離。** **不採用文件的單人 `user_id` 模型。**

## A2. 每客戶自帶 WP + FluentCRM（本版核心現實）

- 每個 org（=客戶）有自己的 WordPress 站 + 自己的 FluentCRM + 自己的 FluentSMTP。
- 暖名單培養（nurture / newsletter / sequence）發生在**客戶自己的 FluentCRM**，用**客戶自己的寄送身份**。
- 系統**不**集中一個 FluentCRM，**不**強制集中 SES 當暖層寄送（見 PART D 改善 ②）。
- 暖層的同步通道 = **既有的 wp-bridge 外掛**（已裝在每個客戶 WP，已能操作該站 FluentCRM；見 PART E 改善 ①）。

## A3. 產品不做什麼

不自動大量亂寄信；不做 LinkedIn/IG 大量自動私訊；不把未同意冷名單直接丟進 FluentCRM newsletter；不 scraping 私人資料；不做無來源依據的 AI 個人化；不保證成交/回覆/療效/收益。

## A4. 要解決的問題（10 項）

不知開發誰 / 名單良莠難辨 / 冷信像罐頭 / 發太多變垃圾 / follow-up 漏掉 / 回覆後不知推進 / 暖名單沒培養 / 免費工具難分工 / API 額度與成本難控 / 冷名單與訂閱名單混雜風險高。

---

# PART B — 資料層（Supabase Schema + RLS）

## B0. Schema 設計原則（對齊現有 codebase）

1. **每張表加 `organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE`**，取代文件的 `user_id references auth.users`。
2. **RLS = service-role-only**，比照 `intake_forms` / `content_drafts`（`migrations/0034`、`0041`）：next-admin server 用 service-role client（`lib/supabase-server.ts:getSupabaseWriteClient`）存取，Supabase RLS 只開 `service_role`（anon/authenticated 一律擋）。**不採用** `auth.uid() = user_id` per-row policy。
3. PK 一律 `uuid DEFAULT gen_random_uuid()`；時間 `timestamptz NOT NULL DEFAULT now()`；狀態用 `text ... CHECK (... IN (...))`；彈性欄位用 `jsonb`。
4. 命名 prefix `co_`（cold-outreach），避免與現有 `content_*` / `ops_*` / `repair_*` 撞名。
5. Migration **雙檔慣例**：`migrations/0048_co_outreach_core.sql` + `scripts/0048_co_outreach_core_down.sql`（比照 `0047`/`0038`）。最新為 `0047_video_jobs`。

> ### B0.1 已驗證的現況存取模型（reality-read 2026-06-23，**取代先前 Clerk 假設**）
>
> 經讀回 next-admin 實際 code，現有 admin console 是 **agency 內部 ops console**，不是 per-tenant 登入 SaaS：
> - **身份** = Supabase Auth（email+密碼），角色 = `app_metadata.ops_role` ∈ {owner, admin, operator, viewer}（`middleware.ts`）。**runtime 不是 Clerk**（DB 有 `clerk_organization_mappings` 但 console 不靠它）。
> - **存取控制** = ops-role RBAC（`lib/ops-role.ts`：`canWriteTenantConfig`=owner/admin、`canCreateAiImageJob`=owner/admin/operator）。
> - **`organization_id`** = 「這筆屬於哪個客戶」的**篩選欄位**（nullable，由路由 client slug 帶入，比照 `ops/clients/[slug]/page.tsx`），**非 per-login 隔離**。operator 看得到並切換**所有**客戶。
> - **DB 存取** = service-role client（bypass RLS）；RLS service-role-only = 縱深防禦（擋直連 anon/authenticated）。
>
> **co_ 表一律沿用此模型**：service-role-only RLS + `organization_id` 可空篩選欄 + 路由 ops-role 守門。
> **三模式落點修正**：**自用 + 代操** 在現有架構**即可運作**（你操作所有客戶）；**賣**（客戶自己登入、只能看自己）= **Phase 5** 才補真正 per-org 登入隔離（per-client Supabase Auth user 或啟用 Clerk org + 加 org-scoped RLS）。
> **存取守門**：新增 `canManageOutreach(role)`（owner/admin/operator）helper，比照既有 RBAC。
>
> 下列 DDL 為主體；實作依現有 lint（splinter / RLS initplan）微調，rollback 走獨立 down 檔。

## B1. co_service_profiles（服務設定檔，每 org 可多筆）

```sql
CREATE TABLE IF NOT EXISTS public.co_service_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  industry            text,
  service_name        text NOT NULL,
  positioning         text,
  service_description text,
  target_problems     text[],
  target_audiences    text[],
  usp                 text,
  price_position      text,
  proof_links         text[],
  tone                text,
  forbidden_words     text[],
  replacement_words   text[],
  compliance_rules    text,
  sensitive_industry_type text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

## B2. co_lead_inbox（匯入暫存，不污染正式 leads）

```sql
CREATE TABLE IF NOT EXISTS public.co_lead_inbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  raw_payload          jsonb,
  normalized_name      text,
  normalized_industry  text,
  website              text,
  social_url           text,
  email                text,
  phone                text,
  region               text,
  source_type          text,
  source_url           text,
  quality_score        int DEFAULT 0,
  contactability_score int DEFAULT 0,
  duplicate_score      int DEFAULT 0,
  inbox_status         text NOT NULL DEFAULT 'pending'
                       CHECK (inbox_status IN ('pending','high_quality','needs_data','suspected_dup','no_contact','not_recommended','risky','approved','rejected')),
  ai_notes             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

## B3. co_leads（正式冷名單）

```sql
CREATE TABLE IF NOT EXISTS public.co_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_profile_id   uuid REFERENCES public.co_service_profiles(id),
  name                 text NOT NULL,
  industry             text,
  website              text,
  social_url           text,
  contact_name         text,
  contact_role         text,
  email                text,
  phone                text,
  region               text,
  source_type          text,
  source_url           text,
  observation          text,
  website_summary      text,
  social_summary       text,
  pain_guess           text,
  buying_motive        text,
  recommended_offer    text,
  recommended_angle    text,
  lead_quality_score   int DEFAULT 0,
  contactability_score int DEFAULT 0,
  icp_score            int DEFAULT 0,
  score                int DEFAULT 0,
  priority             text CHECK (priority IN ('high','medium','low','not_recommended')),
  status               text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','inbox_pending','analyzed','qualified','message_generated','approved','drafted','sent','followup_due','replied','proposal_sent','meeting_booked','warm','synced_to_fluentcrm','nurturing','customer','lost','no_reply','not_qualified','do_not_contact','unsubscribed')),
  first_contact_date   date,
  last_contact_date    date,
  next_followup_date   date,
  do_not_contact       boolean NOT NULL DEFAULT false,
  do_not_contact_reason text,
  consent_status       text NOT NULL DEFAULT 'unknown'
                       CHECK (consent_status IN ('unknown','legitimate_interest','replied','opted_in','form_submitted','customer','unsubscribed','do_not_contact')),
  consent_source       text,
  consent_at           timestamptz,
  -- warm sync 走 wp-bridge（per-client FluentCRM），fluentcrm_contact_id 由該站回傳
  fluentcrm_contact_id text,
  fluentcrm_sync_status text NOT NULL DEFAULT 'not_synced'
                       CHECK (fluentcrm_sync_status IN ('not_synced','ready','synced','failed','retrying','not_eligible')),
  fluentcrm_last_synced_at timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_leads_org ON public.co_leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_co_leads_followup ON public.co_leads(next_followup_date) WHERE next_followup_date IS NOT NULL;
```

## B4. co_campaigns / co_campaign_leads

```sql
CREATE TABLE IF NOT EXISTS public.co_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  target_industry text,
  offer           text,
  channel         text,
  hypothesis      text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','running','paused','completed','stopped')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.co_campaign_leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.co_campaigns(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.co_leads(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'queued',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
```

## B5. co_messages（文案，含 evidence/prompt snapshot）

```sql
CREATE TABLE IF NOT EXISTS public.co_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id              uuid NOT NULL REFERENCES public.co_leads(id) ON DELETE CASCADE,
  campaign_id          uuid REFERENCES public.co_campaigns(id),
  channel              text NOT NULL,        -- email | ig_dm | linkedin
  output_type          text NOT NULL,        -- cold_email | followup | proposal_summary | warm_intro
  subject              text,
  body                 text NOT NULL,
  version              int DEFAULT 1,
  variant_label        text,
  angle                text,
  personalization_score int,
  safety_score         int,
  quality_gate_status  text CHECK (quality_gate_status IN ('pass','warn','block')),
  ai_model             text,                 -- 對應 ai_call_logs
  prompt_version_id    uuid REFERENCES public.co_prompt_versions(id),
  prompt_snapshot      jsonb,
  evidence_snapshot    jsonb,                -- 見 §C3 anti-hallucination
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','approved','needs_edit','drafted','copied','sent','skipped')),
  approved_at          timestamptz,
  drafted_at           timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
```

## B6. co_replies

```sql
CREATE TABLE IF NOT EXISTS public.co_replies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id            uuid NOT NULL REFERENCES public.co_leads(id) ON DELETE CASCADE,
  message_id         uuid REFERENCES public.co_messages(id),
  reply_text         text NOT NULL,
  reply_type         text,   -- interested | pricing | more_info | case_study | wrong_contact | has_vendor | no_need | reject | unsubscribe
  ai_interpretation  text,
  hidden_objection   text,
  next_action        text,
  suggested_response text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

## B7. co_proposals

```sql
CREATE TABLE IF NOT EXISTS public.co_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.co_leads(id),
  campaign_id     uuid REFERENCES public.co_campaigns(id),
  title           text,
  summary         text,
  markdown_body   text,
  html_body       text,
  status          text NOT NULL DEFAULT 'draft',
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

## B8. co_prompt_versions / co_experiments / co_message_variants

```sql
CREATE TABLE IF NOT EXISTS public.co_prompt_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  prompt_type     text NOT NULL,
  version         text NOT NULL,
  prompt_text     text NOT NULL,
  is_active       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.co_experiments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid REFERENCES public.co_campaigns(id),
  name            text NOT NULL,
  hypothesis      text,
  metric          text,
  status          text NOT NULL DEFAULT 'running',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.co_message_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    uuid REFERENCES public.co_messages(id) ON DELETE CASCADE,
  experiment_id uuid REFERENCES public.co_experiments(id),
  variant_label text,
  angle         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

## B9. Connectors（per-org 額度路由）

```sql
CREATE TABLE IF NOT EXISTS public.co_connector_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_name  text NOT NULL,   -- gmail | wp_bridge | hunter | apify | snov | ses | resend
  connector_type  text NOT NULL,   -- email_send | crm | enrichment | scrape | verify
  is_enabled      boolean NOT NULL DEFAULT true,
  credentials_ref text,            -- secrets-vault key 名稱，不存實值
  settings        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.co_connector_limits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_name  text NOT NULL,
  monthly_limit   numeric,
  current_usage   numeric NOT NULL DEFAULT 0,
  reset_at        timestamptz,
  alert_threshold numeric NOT NULL DEFAULT 0.8,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

> **改善 ⑤**：connector **AI 用量**（Gemini/Claude token、成本）**不另建表**，接既有 `ai_call_logs`（`migrations/0043`）。`co_connector_usage` 只記非 AI 外部工具（Hunter/Apify credit）：

```sql
CREATE TABLE IF NOT EXISTS public.co_connector_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_name  text NOT NULL,
  usage_type      text NOT NULL,
  amount          numeric NOT NULL DEFAULT 1,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

## B10. Deliverability（合併 deliverability 文件 5 表，per-org per-sender）

```sql
-- 寄送身份（per-org：客戶自己的 Gmail / FluentSMTP / SES）
CREATE TABLE IF NOT EXISTS public.co_sender_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  email             text NOT NULL,
  display_name      text,
  provider          text NOT NULL,   -- gmail | fluentsmtp | ses | resend
  stream_type       text NOT NULL,   -- cold | warm | transactional
  daily_limit       int NOT NULL DEFAULT 20,
  daily_sent_count  int NOT NULL DEFAULT 0,
  weekly_sent_count int NOT NULL DEFAULT 0,
  warmup_stage      text NOT NULL DEFAULT 'new',
  health_status     text NOT NULL DEFAULT 'healthy'
                    CHECK (health_status IN ('healthy','warning','paused','blocked')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 寄送 domain / 認證狀態（per-org）
CREATE TABLE IF NOT EXISTS public.co_email_domains (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain                 text NOT NULL,
  stream_type            text NOT NULL,
  provider               text NOT NULL,
  spf_status             text NOT NULL DEFAULT 'unknown',
  dkim_status            text NOT NULL DEFAULT 'unknown',
  dmarc_status           text NOT NULL DEFAULT 'unknown',
  mail_from_status       text NOT NULL DEFAULT 'unknown',
  tracking_domain_status text NOT NULL DEFAULT 'unknown',
  reputation_status      text NOT NULL DEFAULT 'unknown',
  last_checked_at        timestamptz,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 統一寄送事件流（所有 stream / provider）
CREATE TABLE IF NOT EXISTS public.co_sending_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id           uuid REFERENCES public.co_leads(id),
  message_id        uuid REFERENCES public.co_messages(id),
  campaign_id       uuid REFERENCES public.co_campaigns(id),
  stream_type       text NOT NULL,
  provider          text,
  sender_account_id uuid REFERENCES public.co_sender_accounts(id),
  event_type        text NOT NULL,   -- draft_created|sent|delivered|opened|clicked|replied|soft_bounced|hard_bounced|blocked|complained|unsubscribed|suppressed|synced_to_fluentcrm|sequence_started|sequence_completed
  event_status      text,
  provider_event_id text,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 風險指標（per-org per-sender per-period）
CREATE TABLE IF NOT EXISTS public.co_email_risk_metrics (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  stream_type        text NOT NULL,
  provider           text,
  domain             text,
  sender_account_id  uuid REFERENCES public.co_sender_accounts(id),
  campaign_id        uuid REFERENCES public.co_campaigns(id),
  sent_count         int NOT NULL DEFAULT 0,
  hard_bounce_count  int NOT NULL DEFAULT 0,
  soft_bounce_count  int NOT NULL DEFAULT 0,
  complaint_count    int NOT NULL DEFAULT 0,
  unsubscribe_count  int NOT NULL DEFAULT 0,
  hard_bounce_rate   numeric NOT NULL DEFAULT 0,
  complaint_rate     numeric NOT NULL DEFAULT 0,
  unsubscribe_rate   numeric NOT NULL DEFAULT 0,
  risk_status        text NOT NULL DEFAULT 'healthy'
                     CHECK (risk_status IN ('healthy','warning','danger','stopped')),
  period_start       timestamptz,
  period_end         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 寄送事故
CREATE TABLE IF NOT EXISTS public.co_deliverability_incidents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  incident_type   text NOT NULL,
  severity        text NOT NULL,
  stream_type     text,
  provider        text,
  domain          text,
  campaign_id     uuid REFERENCES public.co_campaigns(id),
  title           text,
  description     text,
  evidence        jsonb,
  status          text NOT NULL DEFAULT 'open',
  action_taken    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
```

## B11. co_suppression_list（**唯一正式定義**，採 deliverability 文件 §10.2 完整版）

> 修正「兩份文件各定義一次」的衝突。本表為全系統寄送前必查的核心。

```sql
CREATE TABLE IF NOT EXISTS public.co_suppression_list (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           text,
  domain          text,
  company_name    text,
  lead_id         uuid REFERENCES public.co_leads(id),
  reason          text NOT NULL,   -- manual_opt_out|unsubscribe|hard_bounce|soft_bounce_limit|complaint|spam_report|invalid_email|role_account_blocked|legal_request|domain_block|user_manual
  source          text NOT NULL,
  applies_to      text NOT NULL DEFAULT 'all'   CHECK (applies_to IN ('cold','marketing','transactional','all')),
  scope           text NOT NULL DEFAULT 'email' CHECK (scope IN ('email','domain','company','campaign','global')),
  evidence        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_suppression_email ON public.co_suppression_list(organization_id, email);
```

## B11.1 co_verified_emails（email 驗證快取 — dedup，永不重驗同一 email；PART H §H6）

```sql
CREATE TABLE IF NOT EXISTS public.co_verified_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  status          text NOT NULL CHECK (status IN ('valid','invalid','risky','unknown')),
  provider        text,
  verified_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
```

## B12. CRM 同步 / Timeline / Analytics

```sql
CREATE TABLE IF NOT EXISTS public.co_crm_sync_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id          uuid REFERENCES public.co_leads(id),
  crm_name         text NOT NULL DEFAULT 'fluentcrm',
  action           text NOT NULL,
  request_payload  jsonb,
  response_payload jsonb,
  status           text NOT NULL,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.co_timeline_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.co_leads(id),
  campaign_id     uuid REFERENCES public.co_campaigns(id),
  event_type      text NOT NULL,
  title           text,
  description     text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.co_analytics_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.co_leads(id),
  campaign_id     uuid REFERENCES public.co_campaigns(id),
  event_type      text NOT NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

## B13. RLS（全表 service-role-only）

每一張 `co_*` 表都套用既有 control-plane pattern：

```sql
ALTER TABLE public.co_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY co_leads_service_role ON public.co_leads
  TO service_role USING (true) WITH CHECK (true);
-- 對 co_service_profiles / co_lead_inbox / co_campaigns / co_campaign_leads /
-- co_messages / co_replies / co_proposals / co_prompt_versions / co_experiments /
-- co_message_variants / co_connector_accounts / co_connector_limits / co_connector_usage /
-- co_sender_accounts / co_email_domains / co_sending_events / co_email_risk_metrics /
-- co_deliverability_incidents / co_suppression_list / co_crm_sync_logs /
-- co_timeline_events / co_analytics_events 重複相同 policy
```

**存取控制（已驗證現況，見 §B0.1）**：路由用 `resolveOpsRole(req)` + `canManageOutreach(role)`（owner/admin/operator）守門；查特定客戶時用 `.eq('organization_id', orgId)`（orgId 由路由 client slug 帶入，比照 `ops/clients/[slug]`）。service-role client 存取，RLS service-role-only 為縱深防禦。**這是 agency 內部 ops console 模型**：operator 看得到所有客戶、非 per-login 隔離；賣模式的 per-tenant 隔離留 Phase 5。

---

# PART C — AI、評分與品質

## C1. Lead Scoring（沿用 v3.0）

**Lead Quality（資料品質，滿分 100）**：公司/品牌名 15、官網或社群 15、公開商務聯絡 20、明確產業 10、具體觀察點 20、source_url 10、非重複 10。
**Contactability（可聯絡度）**：公開 Email 25、Email 已驗證 25、社群 15、聯絡人職稱 15、明確合作窗口 10、無 do_not_contact 10。
**ICP Fit（符合服務）**：產業高度相關 25、明顯痛點 20、近期活動 15、預算可能 10、合作切入點 20、有決策者 10。
**Priority**：80–100 High / 60–79 Medium / 40–59 Low / 0–39 Not Recommended。

## C2. Quality Gate

**Lead Gate**（缺一不進正式開發）：名稱、產業、source_url、網站或社群、具體觀察點、無 suppression、非重複。
**Message Gate**：有具體觀察 / 無禁用詞 / 不誇大 / 無未證實資訊 / CTA 低壓 / 字數合理(80–150) / 不像垃圾。
**Block 條件**：`do_not_contact=true` / suppression 命中 / 無觀察點 / AI 編造來源 / 禁用詞 / 含療效·收益·成交保證。

## C3. Anti-Hallucination Guard

AI 只能引用實存欄位：`lead.observation` / `website_summary` / `social_summary` / `source_url` / `service_profile` / industry_playbook / manual_notes。
每封文案**必帶** `evidence_snapshot`（存 `co_messages.evidence_snapshot`）：

```json
{
  "used_observation": "常辦女性瑜伽與香氛課程",
  "used_pain_guess": "需要增加週末小班活動",
  "source_url": "https://example.com",
  "unsupported_claims": []
}
```

`unsupported_claims` 非空 → Quality Gate 標 warn/block。

## C4. 敏感產業禁用詞（藝術療癒 / 健康）

禁用：治療焦慮 / 治療憂鬱 / 療效保證 / 改善疾病 / 診斷 / 取代諮商 / 保證療癒。
替代：情緒表達 / 壓力覺察 / 自我探索 / 創作陪伴 / 團體連結 / 身心放鬆 / 支持性活動 / 非語言表達。
**行銷類**禁用：保證成交 / 保證業績 / 穩賺 / 一定提升營收 → 替代：提升機會 / 改善流程 / 協助優化 / 增加轉換可能性。
（每 org 可在 `co_service_profiles.forbidden_words` / `replacement_words` 覆寫。）

---

# PART D — Email 寄送與風險治理

## D0. 三 Stream（per-tenant 修正版）

| Stream | 用途 | 主工具 | 底層寄送 | 寄送身份 |
|---|---|---|---|---|
| **Cold** | 第一封冷信、個人化 follow-up | Gmail draft | Gmail | **per-org Gmail OAuth**（代操=客戶 Gmail；自用=你的） |
| **Warm** | 已回覆/opt-in/表單/提案後 nurture/newsletter | 客戶 FluentCRM | **客戶自己的 FluentSMTP**（改善 ②） | 客戶自己的寄送域 |
| **Transactional** | 系統通知/提案連結/OTP（寄給 operator） | Resend | Resend API（已有 key） | 中央 notify 子網域 |
| Warm fallback（optional） | 沒有自己 SMTP 的客戶 | 中央 SES | SES API | mail.aware-wave 子網域 |

**改善 ②**：暖信主路徑 = 客戶現有 FluentCRM+FluentSMTP，**中央 SES 不是 MVP blocker**，降為 optional fallback。
**改善 ③**：Gmail 從第一天就 **per-org OAuth**（不是單一帳號）。Phase 1 仍只建 draft，人工寄。
**不使用 Sendy**（與 FluentCRM 重疊，造成名單分裂 / 退訂不同步 / 聲譽風險）。

## D1. 官方風險閾值 → 產品規則

- **Google/Yahoo spam complaint**：目標 < 0.1%；警戒 ≥ 0.1%；強制停該 stream ≥ 0.3%。
- **SES bounce**：理想 < 1%；警戒 ≥ 2%；強制檢查 ≥ 3%；停 SES marketing ≥ 5%；災難 ≥ 10%。
- **SES complaint**：理想 < 0.05%；警戒 ≥ 0.08%；停 campaign ≥ 0.1%；停 stream ≥ 0.3%；災難 ≥ 0.5%。
- **Unsubscribe rate**（內部）：正常 < 0.5%；警戒 0.5–1%；檢查 1–2%；停 sequence > 2%。
- **Cold opt-out**：冷信不需 newsletter unsubscribe link，但必須有拒收句：「如果不適合，我就不再打擾。」任何拒絕/退訂/檢舉/hard bounce → suppression。

## D2. Sending Policy Gate（每封信寄出前）

**Global Gate**（共用）：不得命中 suppression / do_not_contact / invalid / hard_bounced / complained / unsubscribed；不得超 sender daily limit / domain daily limit / campaign risk limit。
**Cold Gate**：lead 有 source_url + observation + 與服務相關；email 非私人/不明來源；無近期寄送；同公司/domain 未過度聯絡；**純文字、最多 1 連結、無圖片、無附件、無 tracking pixel**；無誇大；有拒收句；人工 approve；**只建 Gmail draft 不自動寄**。違反→block。
**Warm Gate**：必須符合 positive reply / proposal requested / meeting booked / form submitted / opt-in / customer 之一；FluentCRM contact 存在；`consent_status != unknown`；有 unsubscribe link + List-Unsubscribe header；非 suppression/bounced/complained。
**Transactional Gate**：純系統通知；不混 newsletter / 促銷 / 大量 marketing CTA；subject 反映事件。

## D3. Bounce / Complaint / Unsubscribe / Suppression

**Bounce**：hard → 立即 suppression + 停所有 stream；soft 1 次 +1、2 次暫停 14 天、3 次 suppression；blocked → 暫停該 domain 進 review。來源：Gmail mailer-daemon（n8n parser）/ SES SNS / Resend webhook。
**Complaint**（比退訂嚴重）：立即 suppression + 停該 recipient 所有 stream + 停同 campaign follow-up + 檢查名單來源/文案。風險擴散：同 campaign 1→停 recipient、2→暫停查文案、3→停 campaign；同來源 complaint rate ≥ 0.1% → 停該 source_type 新寄送。
**Unsubscribe scope**（非單一 boolean）：`unsubscribe_marketing` / `unsubscribe_sales` / `unsubscribe_all` / `do_not_contact` / `transactional_only`。
**Suppression**：寄送前必查；reason / scope / applies_to 見 B11。解除需二次確認。

## D4. Emergency Stop（per-org per-sender，本版強調隔離）

- **Stop Recipient**：hard_bounce / complaint / unsubscribe / manual opt-out。
- **Stop Campaign**：complaint_count ≥ 2 或 complaint_rate ≥ 0.1% 或 hard_bounce_rate ≥ 3% 或 unsubscribe_rate > 2%。
- **Stop Sender**：sender hard_bounce_rate ≥ 3% 或 complaint_rate ≥ 0.1% 或 Google Postmaster spam ≥ 0.1%。
- **Stop Stream**：SES bounce ≥ 5% 或 complaint ≥ 0.1% 或 Google spam ≥ 0.3%。
- **隔離鐵則**：停一個 org / sender **不得**波及其他 org。所有閾值計算 `WHERE organization_id = :org`。

## D5. Domain / DNS Checklist（每寄送域 per-org）

每個寄送 domain/subdomain：SPF + DKIM + DMARC。
- SES marketing：Custom MAIL FROM、Bounce domain、SNS bounce/complaint、Custom tracking domain。
- Resend transactional：domain verification、DKIM、webhook、獨立 notify 子網域。
- Gmail cold：Workspace SPF、Google DKIM、DMARC、Google Postmaster Tools、**不用 tracking pixel**。

## D6. Legal / Consent（per-region per-org）

`consent_status`：unknown / legitimate_interest / replied / opted_in / form_submitted / customer / unsubscribed / do_not_contact。
Region risk（per-org / per-campaign，**不是全域**）：US=CAN-SPAM（opt-out + 真實 header/subject）；EU/UK=更嚴 lawful basis / legitimate interest；Canada=偏 opt-in；Taiwan=保留拒收 + 個資來源紀錄。
策略：region=EU/UK/Canada → 冷開發加 legal warning；無 source_url → 不允許生成冷信；私人 email → 不建議 cold；所有 opt-out 立即同步。
**代操額外**：你代客戶寄信時，責任歸屬與授權需在服務合約載明（標記為 sell/代操 模式的 legal open item）。

---

# PART E — 整合層（wp-bridge / FluentCRM / n8n / Trigger.dev）

## E1. 暖層 = 擴充 wp-bridge（改善 ①，最大省力點）

**現況**：每個客戶 WP 已裝 wp-bridge，已能直接操作該站 FluentCRM（`NewsletterCreator` 用 `\FluentCrm\App\Models\Campaign`，`includes/Newsletter/NewsletterCreator.php`），且**已內建本系統要求的紅線** — draft-only / human-gated / never auto-send（`NewsletterCreator.php:6-13, 79`；`WP_BRIDGE_CONTROL_PLANE_DESIGN.md §I`）。

**決策**：warm sync **不新建中央 FluentCRM REST connector**，改為在 wp-bridge 新增一個 Subscriber/tag REST endpoint（同外掛、同 per-client 認證、同治理紅線）。

**要新增的 wp-bridge endpoint（小擴充）**：
```
POST /aware-wave/v1/fluentcrm/contact
  body: { email, first_name, last_name, lists[], tags[], status:'subscribed'|'pending' }
  行為: 用 FluentCrm Subscriber model createOrUpdate；attachTags / attachLists；回傳 fluentcrm_contact_id
  紅線: 只能加入既有 list/tag；啟動 sequence 維持 human-gated（沿用 campaign 紅線）
```
回傳的 `fluentcrm_contact_id` 寫回 `co_leads.fluentcrm_contact_id`。

**省掉**：N 把 FluentCRM API key 管理、新 connector auth、重寫一套紅線。
**版本**：擴充後依 `WP-BRIDGE-RELEASE-RUNBOOK` bump `AWBRIDGE_VERSION`（header+define）並跑 `scripts/release-wp-bridge.sh`。

## E2. FluentCRM Tags / Lists / Sequences（per-client）

只同步 warm leads：`replied_positive / requested_proposal / booked_meeting / opted_in / submitted_form / became_customer`。
**不同步**：new / analyzed / message_generated / cold_sent / no_reply / not_qualified / do_not_contact / unsubscribed。
**Tag 命名**：`source:*`（outbound/website-form/workshop/referral/manual-import）、`industry:*`、`stage:*`（warm-lead/proposal-requested/meeting-booked/customer/lost）、`interest:*`、`consent:opted-in` / `do-not-contact`。
（`consent:opted-in` 不只用 tag，Supabase `co_leads.consent_status` 為正式真相來源。）
**內建 Sequences**：Proposal Follow-up（Day0 提案/Day2 案例/Day5 詢問調整/Day10 低壓提醒）；藝術療癒工作坊 Nurture（5 封）；產業分眾 Newsletter（HR/瑜伽/長照/親子/診所/餐飲）。

## E3. n8n Workflows（per-tenant）

每條 workflow 接收 `organization_id`，用該 org 的 connector 設定。
1. **Import Leads**：Webhook → Normalize → Dedup → Suppression Check → insert `co_lead_inbox` → 觸發 Trigger.dev scoring → return summary。
2. **Apify Public Data**：Manual/Scheduled → Apify Actor → Fetch → Normalize → insert inbox → log usage。
3. **Hunter Verify**：Webhook → check limits → Hunter verify → update email 驗證 metadata → log usage。
4. **Gmail Draft**：Webhook → fetch approved message → 用該 org Gmail OAuth 建 draft → `co_messages.status=drafted` → `co_sending_events(draft_created)`。
5. **Warm Lead → wp-bridge**：status changed → check sync rules + consent → 呼叫該客戶 wp-bridge `/fluentcrm/contact` → apply list+tags → write `co_crm_sync_logs` → update `fluentcrm_contact_id` → timeline event。
6. **WordPress Form → Supabase**：Fluent Forms 送出 → FluentCRM contact → outgoing webhook → n8n → upsert `co_leads`（`consent_status=opted_in`, `source_type=website_form`）→ Trigger.dev classify → timeline。
7. **FluentCRM Activity → Analytics**：webhook/polling → map event → insert `co_analytics_events` + `co_timeline_events`（open/click/tag/sequence/unsub/form/meeting）。
8. **Gmail Bounce Parser**：搜 mailer-daemon → parse → classify → `co_sending_events` → hard→suppression。
9. **SES Bounce/Complaint**（fallback 客戶才用）：SNS → parse → bounce classify / complaint 立即 suppression → update risk metrics → maybe incident。
10. **FluentCRM Unsubscribe Sync**：unsub webhook → suppression + `consent_status` + 停 cold+warm + timeline。
11. **Resend Webhook**：classify delivered/bounced/complained → events + metrics。
12. **Daily Deliverability Scan**：每早算 bounce/complaint/unsub rate per-org per-sender → 比對閾值 → warn dashboard / danger 自動 pause → 建 incident。

## E4. Trigger.dev Tasks（接 packages/workflows）

```ts
enrichLead({ leadId })                 // 讀 lead → service profile + playbook → AI 分類 → 三分數 → 寫回 → timeline
generateOutreachPack({ leadId, serviceProfileId, campaignId })
                                       // quality gate → 生 email/dm/followup/proposal summary → safety lint
                                       //   → 存 prompt_snapshot + evidence_snapshot → update status
safetyLintMessage({ messageId })       // forbidden words / unsupported claims / hard CTA / spam tone
classifyReply({ replyId })             // reply type → next action → suggested response
dailyFollowupScan()  cron "0 9 * * *"  // next_followup_date <= today → dashboard task
syncWarmLeadToFluentCRM({ leadId })    // verify warm + consent + sync rule → 呼叫 n8n #5（wp-bridge）
buildIndustryPlaybookInsights({ campaignId }) // reply rate / angle / CTA / objection → 更新 playbook
```
AI 成本一律記 `ai_call_logs`（含 job_id，`migrations/0046`）。

## E5. Supabase Edge Functions（安全 API 層，optional）

`/import-leads /analyze-lead /generate-message /approve-message /create-gmail-draft /sync-fluentcrm /fluentcrm-webhook /n8n-webhook` — verify auth/webhook secret → validate → execute → log → return。
> 若 next-admin server actions 已能涵蓋，可不另建 Edge Function；webhook 入口仍建議走 Edge Function 或 next-admin route + secret。

---

# PART F — 控制台 UX（掛進 next-admin）

## F0. UX 核心原則

① Cold 與 Warm 在 UI 上分層（Cold=Supabase 主控；Warm=客戶 FluentCRM）。② UI 語言不鼓勵大量寄送（用「建立草稿/人工審核/高品質聯絡/低壓 CTA/停止聯絡」，避免「Blast/Spam/Mass DM/一鍵狂發」）。③ FluentCRM 定位寫清楚=暖名單培養，非冷信發送器。④ 每頁都有 **Next Best Action**。

## F1. 資訊架構（next-admin 新 module `app/outreach/`，沿用既有 UI 殼）

左側 sidebar：Dashboard 作戰中心 / Lead Inbox / Leads 冷名單 / Campaigns / Message Review / Draft Queue / Follow-ups / Replies / Proposals / Warm Leads / Nurture Sequences / FluentCRM Sync / Playbooks / Analytics / Connectors / Settings。

## F2. 各頁要點（濃縮 UX v2.3）

- **Dashboard**：今日任務卡（冷開發：需跟進/待審草稿/高分未聯絡/缺觀察點；暖名單：有興趣回覆/待同步/sync error/proposal sequence 待追）+ AI 推薦行動 + 成效摘要 + 免費額度狀態。
- **Lead Inbox**：所有來源先進此，分類（高品質/資料不足/疑似重複/缺聯絡/不建議/風險/WP表單/FluentCRM回流）。操作：Approve to Leads / Reject / Merge / Request enrichment / Add observation / Mark do_not_contact。WP 表單來源自動 `consent=opted_in, source=website_form` → 可直進 Warm。
- **Leads**：表格（名稱/產業/地區/三分數/優先級/狀態/渠道/下次跟進/FluentCRM 狀態/Consent/來源）+ 篩選 + 批次（AI 分析/生成文案/加 Campaign/標不聯絡/匯出/去重/批次同步 warm，僅 warm 可同步）。
- **Lead Detail**：左=資料、中=AI 分析（三分數/痛點/角度/方案/觀察點/風險/來源依據）、右=Next Best Action（冷開發動作 + 暖名單動作）+ CRM Timeline。
- **Message Review**：左 Lead Context / 中 Draft / 右 Safety+Evidence+Actions。Tabs：Cold Email/IG DM/LinkedIn/Follow-up 1·2/Proposal Summary/Warm Intro。Safety Panel（個人化/安全/垃圾感/誇大/觀察/CTA/禁用詞/同步條件）。Evidence Panel 顯示 evidence_snapshot。操作：Approve/建 Gmail 草稿/複製/重生（更短·更溫和·更商務·加案例·降推銷感）/產提案摘要。
- **Draft Queue**：分類（待審/需改/已批/已建草稿/已複製/已跳過）。快捷鍵 A/R/S/C/D/W/B。
- **Follow-ups**：看板（今天/明天/本週/逾期/等回覆/已停/FluentCRM nurture 中）。快速：完成/延 3·7 天/停止/重生 follow-up/轉 FluentCRM nurture。
- **Replies + Reply Copilot**：分類（有興趣/詢價/要資料/要案例/找錯窗口/已有廠商/暫無需求/拒絕/退訂）。Copilot 輸出意圖/隱含疑慮/建議策略/建議回覆/是否傳提案/是否約時間/是否同步 FluentCRM/建議 tag/建議 sequence/是否停止聯絡。回覆→FluentCRM 對照表見 E2。
- **Proposals**：欄位（主題/為何適合/服務/流程/交付/收益/合作方式/下一步）+ 格式（Markdown/HTML/複製 Canva/PDF later/FluentCRM body）+ 提案後動作（Gmail 寄/同步/啟動 Proposal sequence/加 tag/追蹤 clicked）。
- **Warm Leads**：條件=六種 warm 狀態；表格（名稱/來源/產業/Warm Stage/Consent/Sync/Tags/Active Sequence/Last Activity/Next Action）。
- **Nurture Sequences**：顯示客戶 FluentCRM 各 sequence 與成效（人數/開信/點擊/退訂/狀態）。
- **FluentCRM Sync**：Sync Status（未同步/可同步/已同步/失敗/重試/不可同步-未達 warm/不可同步-do_not_contact/不可同步-unsubscribed）+ Sync Error Center（Retry/Ignore/Edit Mapping/Mark Not Syncable/View Payload）+ Mapping 設定。
- **Playbooks**：每產業（痛點/決策者/渠道/角度/拒絕原因/CTA/禁用說法/成功範例/推薦 sequence/tags）。
- **Analytics**：見 PART G。
- **Connectors**：Gmail/wp-bridge(FluentCRM)/Hunter/Apify card（狀態/配額/本月用量/失敗/fallback/啟用/webhook/key ref）。
- **Settings**：Service Profiles / AI Provider / Prompt Versions / 品牌語氣 / 禁用詞 / Follow-up 節奏 / Suppression / Gmail / FluentCRM(per-site URL+App Password) / n8n Webhooks / Trigger.dev / 配額策略 / Consent Rules / Sync Rules。

## F3. 寄送策略 UI 提示

| 場景 | 推薦 |
|---|---|
| 第一封冷信 / 個人化 follow-up | Gmail 草稿 |
| IG/LinkedIn DM | 複製文字人工發 |
| 對方有興趣後傳提案 | Gmail 或客戶 FluentCRM |
| 已 opt-in 長期培養 / Newsletter | 客戶 FluentCRM |
| 交易型通知 | Resend（或 SES fallback） |
| 大量 cold blast | 不建議（UI 不提供） |

## F4. Status Badges / Empty States / Microcopy / Cost-Saving Mode / Template Gallery

- **Lead Status / Consent Status / FluentCRM Sync Status**：見各 CHECK 約束（B3）。
- **Cost-Saving Mode**：極省（只產 prompt 不呼 API、手動查找、不跑 Apify）/ 平衡（Gemini Free + Hunter 只驗高分 + Apify 必要欄位）/ 品質優先（高分完整 enrichment + 多版本 + safety lint + proposal + nurture）。
- **Template Gallery**：藝術療癒×瑜伽/HR/長照/親子；網站設計×診所；品牌×餐飲；社群代操×美業；攝影×旅宿；顧問×B2B；SEO×電商。每模板含 痛點/CTA/禁用詞/冷信結構/DM 結構/follow-up 節奏/提案格式/推薦 tags+sequence。

---

# PART G — 落地（Reuse Map / Net-new / 路線圖 / MVP / 治理）

## G1. Reuse Map（用既有，少造輪子）

| 需求 | 重用既有 | 證據 |
|---|---|---|
| 多租戶 + RLS | `organizations` + Clerk org + `user_has_org_access()` | `migrations/0010` |
| 暖層 FluentCRM 通道 | **wp-bridge**（+小擴充 contact/tag endpoint） | `NewsletterCreator.php` |
| AI 用量/成本帳本 | `ai_call_logs`(+job_id) | `migrations/0043,0046` |
| WP 表單 → lead intake | `intake_forms` 模式 | `migrations/0034` |
| AI 文案生成模式 | content engine（`content_drafts/sources`） | `migrations/0041,0042` |
| 代操跨 org | ops-console operator 授權 | `migrations/0011` |
| 背景任務基礎 | Trigger.dev `packages/workflows` | `trigger/index.ts` |
| 系統信 | Resend（key 已在 vault） | `mcp/user-env.ps1` |
| 控制台 UI 殼 | next-admin `app/tools`·`app/ops` | — |

## G2. 真正的 Net-new 清單

1. Supabase schema `0048+`（~23 表，org-scoped + service-role RLS）。
2. next-admin `app/outreach/` module（沿用 UI 殼）。
3. wp-bridge `/fluentcrm/contact` endpoint（小擴充 + release）。
4. **Gmail per-org OAuth + draft 建立**（net-new，但必要）。
5. Trigger.dev 7 個 task + n8n 12 條 workflow。
**已省掉**：中央 FluentCRM REST connector、中央 SES（降 optional）、獨立 AI 帳本、單人 user_id 模型。

## G3. 路線圖（對齊現有 phased + SES/Gmail 時程）

- **Phase 1 核心（含 Free-Plan Router）**：schema+RLS / Service Profile / Lead Inbox / Leads CRUD / AI scoring / Message generation+Review / **Gmail per-org OAuth + draft only** / Follow-up date / Cold Gate / Suppression / sender daily limit / **Free-Plan Router + 客戶 BYO-key onboarding（前移，PART H）+ Quota Guard 基礎**。
- **Phase 2 品質與暖層**：Quality Gate / Safety Linter / Evidence Snapshot / Draft Queue / Prompt Versioning / Reply Classifier / **wp-bridge contact endpoint + Warm sync** / WordPress Form inbox / Consent model / Unsubscribe webhook / Email Risk Dashboard(basic) / **Brevo free 暖信 fallback（無 FluentSMTP 客戶）** / verified-email cache。
- **Phase 3 外部 connector + 寄送治理**：Apify·Hunter·Snov·Sheets import / Google Places lead sourcing / Cost-saving Mode UI / **Resend transactional** / Daily deliverability scan / Emergency stop / Incident Center / Domain auth dashboard。
- **Phase 4 進階寄送/法規**：Google Postmaster / DMARC reports / provider fallback / Region legal rules。（**SES 已移除** — 決策 4；暖信走客戶 FluentSMTP 或 Brevo free。）
- **Phase 5 成效與「賣」**：Analytics Dashboard / A/B Engine / Playbook Builder / Proposal Builder / Deal Path / Nurture conversion / **billing + self-serve onboarding + per-org 成本隔離**（sell 模式）。

## G4. MVP 範圍（Phase 1 + 部分 Phase 2）

schema+RLS → Service Profile → Lead Inbox → Leads CRUD → AI scoring → AI 冷信/DM/follow-up → Message Review+Approve → **Gmail draft only(per-org OAuth)** → Follow-up dashboard → Reply 分類 → Warm sync(wp-bridge) → FluentCRM tags + basic sequence。
**暫不做**：完全自動寄信、IG/LinkedIn 自動化、複雜團隊權限、billing、多租戶 marketplace、大型付費資料庫。

## G5.「賣」模式增量（文件未覆蓋，先標記）

billing / 方案分層 / self-serve connector onboarding（客戶連自己 Gmail+FluentCRM）/ per-org 成本與額度硬隔離 / 資料隔離保證（RLS 已備）/ 客戶端 legal 責任條款（代操授權）。不擋 MVP，列 Phase 5。

## G6. 治理 / 部署 SOP（強制）

next-admin 新增 outreach module = **新可部署面** → 觸發 `AGENTS.md` 新部署 6 件套：① unit test gate ② docker healthcheck ③ HTTP smoke check ④ rollback runbook ⑤ Slack/TG 通知 ⑥ typecheck gate（`tsc --noEmit` + CI）。
DB migration（0048+）= **High risk**，走 db-expert 審 + 非破壞性驗證 + rollback 區塊。
wp-bridge 改動 = bump 版本 + `release-wp-bridge.sh`（正本 repo `aware-wave-wp-bridge`）。
寄送底層（Gmail/SES）= 涉 auth/憑證 → High risk，列風險 + rollback，等明示 go-ahead。

## G7. 已拍板決策（2026-06-23）

| # | 決策 | 結論 | 對設計的影響 |
|---|---|---|---|
| 1 | 冷信寄送身份 | **客戶自己的 Gmail** | 代操時用客戶 Gmail OAuth 寄冷信草稿；聲譽/退訂/封鎖風險歸客戶。Gmail connector = per-org OAuth（D0/E3）。自用模式才用你自己的 Gmail。 |
| 2 | Lead 來源 | **你（agency）幫客戶找** | 找名單/驗證/enrichment 成本**全由 agency 吃**，跨所有客戶 → 免費額度爆很快 → **Free-Plan Maximization 升為第一級設計支柱**（見 PART H）。 |
| 3 | 「賣」定價模型 | **訂閱制** | billing = 訂閱方案分層（非用量制）。方案分層與免費額度策略綁定（PART H §8）：低階方案 = BYO-key + 極省模式；高階 = agency 提供 enrichment 含上限。 |
| 4 | SES 是否現在送審 | **不送審** | 中央 SES 完全延後，不在 Phase 1–4 路線圖佔位。暖信**只走客戶自己的 FluentSMTP**；沒有 FluentSMTP 的客戶用免費寄送替代（PART H 研究），不依賴 SES。 |
| 5 | schema prefix `co_` | **接受（暫定）** | 所有表用 `co_` 前綴避免與 `content_*`/`ops_*`/`repair_*` 撞名；可隨時改。 |

> **連動修正**：因決策 2 + 3 + 4，原 §G3 路線圖把「Free Plan 外掛」放 Phase 3 是錯的 → 已在 **PART H** 重新定位為跨階段/Phase-1 核心；SES 從 Phase 4 移除（決策 4）。

---

# PART H — Free-Plan Maximization & Cost Architecture（成本骨幹，第一級）

> **狀態註記**：下列免費額度數字依 **2026-01 知識**整理；免費方案常縮水，**上線前必以各官方 pricing 頁確認**，標 ⚠️ 者特別易變。背景驗證 workflow 因 session limit（台北 3:30am 重置）未跑完，重置後可補跑對帳。

## H0. 核心洞察：self-host = $0 骨幹

你已在 EU VPS self-host **Supabase + Trigger.dev + n8n** → 資料層 / 背景任務 / 自動化**全部 $0**（只付 VPS）。
→ 免費額度的真正瓶頸**只有 5 類外部 SaaS**：Gemini（AI 生成）、Hunter/Snov/Apollo（Email 查找/驗證）、Apify（抓資料）、Clerk（Auth，賣模式）、Gmail（寄送）。其餘不必煩惱。

## H1. 免費額度總表（⚠️ = 易變，需上線前確認）

| 工具 | 類別 | 免費上限（約） | 重置 | 觸發付費 | self-host | BYO-key | 免費替代 |
|---|---|---|---|---|---|---|---|
| Gemini API | AI 生成 | ~15 RPM / ~1500 RPD（flash 類）⚠️ | 每日 | 超量 / 要更高 RPM | ✗ | ✓ | OpenRouter free / 本機 Ollama / 手動貼 ChatGPT |
| Hunter.io | Email 驗證 | ~25 搜尋 + 50 驗證/月 ⚠️ | 每月 | 超量 / 完整 API | ✗ | ✓ | 手動 MX/syntax / Snov |
| Snov.io | Email 查找 | ~50 credits/月 ⚠️ | 每月 | 超量 / API | ✗ | ✓ | Hunter / 手動 |
| Apollo.io | B2B 名單 | email credits 有限，**API 鎖付費** ⚠️ | 每月 | API / export 量 | ✗ | ✓ | 手動 export |
| Apify | 抓資料 | ~$5 平台 credit/月 ⚠️ | 每月 | credit 用完 | 部分 | ✓ | 手動 / Google Places |
| Resend | 交易信 | 3,000/月、100/日、1 域 | 月/日 | 超量 / 多域 | ✗ | （agency 一把即可） | Brevo |
| Clerk | Auth（賣） | ~10,000 MAU；**Org 數/B2B 功能可能設限** ⚠️ | 月 | MAU / Org 超量 / Pro 功能 | ✗ | ✗ | 自架 auth（成本高，不建議） |
| Gmail API | 冷信草稿 | 草稿建立 quota 充足；寄送 Workspace 2,000/日、消費版 500/日 | 日 | — | ✗ | ✓（per-org OAuth） | — |
| Supabase | DB | **self-host 無限**（只付 VPS） | — | — | ✓ | — | — |
| Trigger.dev | 背景任務 | **self-host 免費** | — | — | ✓ | — | — |
| n8n | 自動化 | **self-host 社群版免費**（SSO/queue 等企業功能鎖付費） | — | — | ✓ | — | — |
| Brevo | 暖信 fallback | 300/日（~9,000/月） | 日 | 超量 | ✗ | ✓ | MailerSend ~3,000/月 |

## H2. BYO-key 乘數策略（最大槓桿）⭐

**問題**：決策 2 = 你幫客戶找名單 → 若全用 agency 一組 key，Hunter 25–50/月、Apify $5/月 跨所有客戶**秒爆**。

**解法（化解張力）**：**勞動由你做，API 額度由各客戶自己的免費帳號出。**
- onboarding 收集每客戶**自己的免費 key**（Gemini / Hunter / Snov / Apify），存進 `co_connector_accounts`（per-org `credentials_ref` → secrets-vault，**不硬編**）。
- 你在 workbench 幫客戶找名單時，該 org 的呼叫**跑在該客戶的免費額度上** → 免費額度 = **× 客戶數**，你不吃 API 成本。
- **自用** org 用你自己一組 key。

| Connector | 走法 | 原因 |
|---|---|---|
| Gemini / Hunter / Snov / Apify | **客戶 BYO（per-org）** | 免費額度乘客戶數；成本歸客戶 |
| Gmail | **客戶 BYO OAuth（per-org）** | 決策 1：用客戶身份寄 |
| FluentCRM / FluentSMTP | **客戶自有**（已存在） | 每客戶自帶 WP |
| Resend（交易信） | **agency 共用一把** | 寄給 operator，量低，3,000/月夠 |
| Clerk（Auth） | **agency 共用**（平台層） | 平台級，非 per-client key |

## H3.「你幫找名單」的免費優先 lead-sourcing stack

排序（免費先，付費 credit 留給高分）：
1. **手動 / Google Maps 目視 / 公開目錄**（$0，最先用）
2. **Google Places API**（$200/月 free credit ⚠️，覆蓋數千查詢）+ **Custom Search API**（100 查詢/日免費）
3. **Apify free credit**（$5/月，只抓高價值清單 / 補資料）
4. **Hunter/Snov 驗證**：只對 **score ≥ 80** 的 lead 花 credit
5. 用完 → 標 `email_unverified`，手動補或下月再處理（**不買付費**）

## H4. Free-Plan Router（決策邏輯）

```
需要 AI 生成:
  1. 客戶 BYO Gemini key (free RPD)
  2. agency Gemini key (自用/fallback, 有 quota guard)
  3. 產 prompt 讓 operator 手動貼 ChatGPT/Claude
  ⚠️ 隱私: Gemini free tier 會拿資料訓練 → 客戶 PII 不送 free tier,
     只送公開 observation; 敏感資料走 BYO 付費 key 或本機模型

需要 Email 驗證:
  1. 客戶 BYO Hunter (~50/月) → 2. 客戶 BYO Snov (~50/月)
  3. 免費 MX/syntax 檢查 → 4. 標 unverified (不付費)
  規則: 只驗 score >= 80; 已驗過的 email 進 cache 不重驗

需要 抓名單:
  1. 手動/Google Maps → 2. Places API (free credit)
  3. 客戶 BYO Apify ($5) 只抓高價值 → 4. 標 needs_manual

需要 CRM (暖層):
  1. 客戶自有 FluentCRM (wp-bridge) — 唯一路徑

需要 寄送:
  冷: 客戶 Gmail draft (per-org OAuth)
  暖: 客戶 FluentSMTP → 沒有則 Brevo free (300/日)
  交易: Resend (agency 共用)
  不用 SES (決策 4)

需要 DB/自動化/任務:
  self-hosted Supabase / n8n / Trigger.dev — 全免費
```

## H5. Cost-Saving Modes（具體 connector 對應）

| 模式 | AI | Email 驗證 | 抓資料 | 適用 |
|---|---|---|---|---|
| 極省 | 只產 prompt 手動貼 | 手動/不驗 | 純手動 | 訂閱 Starter / 客戶沒給 key |
| 平衡 | Gemini free（BYO） | Hunter 只驗 ≥80 | Apify 只抓必要 | 多數客戶 |
| 品質優先 | Gemini 多版本 + safety lint | 完整驗證 + enrichment | 完整抓 | 高價值客戶 / Pro 方案 |

## H6. Quota Guard（防爆額度）

- `co_connector_limits`：每 org 每 connector 設 `monthly_limit` + `alert_threshold`（預設 0.8）→ 達 80% 警示、100% 自動降級下一階 fallback。
- `co_connector_usage`：記每次外部呼叫（Hunter/Apify）；AI 走 `ai_call_logs`。
- **Reserve rule**：Hunter/Apify/付費 AI 只給 `score >= 80` lead。
- **Dedup/cache**：驗證過的 email 入 cache（新增 `co_verified_emails` 或併入 inbox）→ **永不重驗同一 email**，省 credit。

## H7. 訂閱方案 × 免費額度（避免 agency 虧本）

| 方案 | AI/Enrichment | 條件 | agency 變動成本 |
|---|---|---|---|
| Starter（最便宜） | **BYO-key 必填** + 極省模式 | 客戶自備所有 free key | ≈ $0 |
| Growth | agency 提供 enrichment，含月上限（如 50 驗證 / N 篇 AI） | 用 agency key，capped | 受控可預測 |
| Pro | 高上限 + 多版本 + 優先 | agency key | 較高，訂閱費覆蓋 |

→ 訂閱費**至少 cover** 該方案 agency key 封頂成本 + VPS 攤提。BYO-key 方案近乎零變動成本。

## H8. Spec 變更清單（本 PART 對前文的修正）

1. **Free-Plan Router 從 Phase 3 → Phase 1 跨切面核心**（router + BYO-key onboarding 一開始就在）。
2. `co_connector_accounts`：onboarding 加「收集客戶 BYO free key」步驟（per-org `credentials_ref`）。
3. 暖信 fallback：**Brevo free（300/日）取代 SES**（決策 4 移除 SES）。
4. Gemini 隱私註記：free tier 訓練資料 → 客戶 PII 不送 free tier。
5. 路線圖 §G3：Phase 4 移除 SES；Phase 3「Free Plan 外掛」前移 Phase 1。
6. 新增 verified-email cache（dedup 省 credit）。

---

# 附錄 — 與三份原始草稿的差異摘要

| 主題 | 原文件 | 本整合版 |
|---|---|---|
| 租戶模型 | 單人 `user_id`+`auth.uid()` RLS | org-tenant + service-role RLS（對齊現有） |
| 暖層 FluentCRM | 中央 REST connector | 擴充既有 wp-bridge（per-client） |
| 暖信寄送 | 中央 SES 必備 | 客戶 FluentSMTP；SES 降 optional |
| Gmail | 單帳號 | per-org OAuth |
| suppression_list | 兩處定義衝突 | 單一正式定義（B11） |
| AI 用量 | 新 connector_usage | 接既有 ai_call_logs |
| 版本 | v3.0 / v3 / v2.3 三版 | 統一 v1.0 Integrated |
| 三營運模式 | 無 | A1 明確定義 |
| 部署治理 | 無 | G6 對齊 6 件套 SOP |
