-- Migration 0048: Cold Outreach Workbench — Phase 1 core schema
-- Spec SSOT: agency-os/docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md (PART B + §B0.1)
-- Build plan: agency-os/docs/cold_email/COLD_OUTREACH_PHASE1_BUILD_PLAN.md (task T1)
--
-- Model (verified reality-read 2026-06-23, §B0.1): this is an AGENCY-INTERNAL ops-console feature,
-- NOT a per-tenant login SaaS. Access control is ops-role RBAC at the route layer (lib/ops-role.ts);
-- organization_id is a NULLABLE "which client does this row belong to" filter column (set from the
-- route's client slug, like ops/clients/[slug]), NOT a per-login isolation boundary. DB access is via
-- the service-role client (lib/supabase-server.ts), so RLS here is service-role-only defense-in-depth
-- (blocks direct anon/authenticated API) — identical to intake_forms (0034) / content_drafts (0041).
-- Per-tenant login isolation for the "sell" mode is deferred to Phase 5 (separate design).
--
-- Phase-1 subset only (12 tables). Phase-2 tables (campaigns / replies / proposals / prompt_versions /
-- experiments / message_variants / crm_sync_logs / analytics_events / email_domains / risk_metrics /
-- incidents) come in a later migration. Forward-compat columns that would reference those tables
-- (campaign_id, prompt_version_id) are kept as plain nullable uuid WITHOUT a FK, to avoid a hard
-- dependency on tables that do not exist yet.
--
-- Down migration: packages/db/scripts/0048_co_outreach_core_down.sql

-- All DDL runs in ONE transaction: a mid-file failure rolls the whole thing back instead of
-- leaving a half-applied 12-table state on the `psql -f` apply path. Postgres DDL is transactional.
BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. co_service_profiles — 使用者/客戶的服務設定檔（每 org 可多筆）
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_service_profiles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  industry                text,
  service_name            text NOT NULL,
  positioning             text,
  service_description      text,
  target_problems         text[],
  target_audiences        text[],
  usp                     text,
  price_position          text,
  proof_links             text[],
  tone                    text,
  forbidden_words         text[],
  replacement_words       text[],
  compliance_rules        text,
  sensitive_industry_type text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_service_profiles_org ON public.co_service_profiles(organization_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. co_lead_inbox — 匯入暫存（不污染正式 leads）
-- ───────────────────────────────────────────────────────────────────────────
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
  quality_score        int NOT NULL DEFAULT 0,
  contactability_score int NOT NULL DEFAULT 0,
  duplicate_score      int NOT NULL DEFAULT 0,
  inbox_status         text NOT NULL DEFAULT 'pending'
                       CHECK (inbox_status IN ('pending','high_quality','needs_data','suspected_dup','no_contact','not_recommended','risky','approved','rejected')),
  ai_notes             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_lead_inbox_org    ON public.co_lead_inbox(organization_id);
CREATE INDEX IF NOT EXISTS idx_co_lead_inbox_status ON public.co_lead_inbox(organization_id, inbox_status);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. co_leads — 正式冷名單
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_leads (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_profile_id       uuid REFERENCES public.co_service_profiles(id) ON DELETE SET NULL,
  name                     text NOT NULL,
  industry                 text,
  website                  text,
  social_url               text,
  contact_name             text,
  contact_role             text,
  email                    text,
  phone                    text,
  region                   text,
  source_type              text,
  source_url               text,
  observation              text,
  website_summary          text,
  social_summary           text,
  pain_guess               text,
  buying_motive            text,
  recommended_offer        text,
  recommended_angle        text,
  lead_quality_score       int NOT NULL DEFAULT 0,
  contactability_score     int NOT NULL DEFAULT 0,
  icp_score                int NOT NULL DEFAULT 0,
  score                    int NOT NULL DEFAULT 0,
  priority                 text CHECK (priority IS NULL OR priority IN ('high','medium','low','not_recommended')),
  status                   text NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new','inbox_pending','analyzed','qualified','message_generated','approved','drafted','sent','followup_due','replied','proposal_sent','meeting_booked','warm','synced_to_fluentcrm','nurturing','customer','lost','no_reply','not_qualified','do_not_contact','unsubscribed')),
  first_contact_date       date,
  last_contact_date        date,
  next_followup_date       date,
  do_not_contact           boolean NOT NULL DEFAULT false,
  do_not_contact_reason    text,
  consent_status           text NOT NULL DEFAULT 'unknown'
                           CHECK (consent_status IN ('unknown','legitimate_interest','replied','opted_in','form_submitted','customer','unsubscribed','do_not_contact')),
  consent_source           text,
  consent_at               timestamptz,
  fluentcrm_contact_id     text,
  fluentcrm_sync_status    text NOT NULL DEFAULT 'not_synced'
                           CHECK (fluentcrm_sync_status IN ('not_synced','ready','synced','failed','retrying','not_eligible')),
  fluentcrm_last_synced_at timestamptz,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_leads_org      ON public.co_leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_co_leads_status   ON public.co_leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_co_leads_followup ON public.co_leads(next_followup_date) WHERE next_followup_date IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. co_messages — 文案（含 evidence/prompt snapshot）
--    campaign_id / prompt_version_id = forward-compat nullable uuid, NO FK (Phase-2 tables)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id               uuid NOT NULL REFERENCES public.co_leads(id) ON DELETE CASCADE,
  campaign_id           uuid,                 -- FK added in Phase-2 (co_campaigns)
  channel               text NOT NULL,        -- email | ig_dm | linkedin
  output_type           text NOT NULL,        -- cold_email | followup | proposal_summary | warm_intro
  subject               text,
  body                  text NOT NULL,
  version               int NOT NULL DEFAULT 1,
  variant_label         text,
  angle                 text,
  personalization_score int,
  safety_score          int,
  quality_gate_status   text CHECK (quality_gate_status IS NULL OR quality_gate_status IN ('pass','warn','block')),
  ai_model              text,                 -- 對應 ai_call_logs.model
  prompt_version_id     uuid,                 -- FK added in Phase-2 (co_prompt_versions)
  prompt_snapshot       jsonb,
  evidence_snapshot     jsonb,                -- anti-hallucination 證據（spec §C3）
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','approved','needs_edit','drafted','copied','sent','skipped')),
  approved_at           timestamptz,
  drafted_at            timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_messages_org  ON public.co_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_co_messages_lead ON public.co_messages(lead_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. co_suppression_list — 寄送前必查的核心（唯一正式定義）
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_suppression_list (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           text,
  domain          text,
  company_name    text,
  lead_id         uuid REFERENCES public.co_leads(id) ON DELETE SET NULL,
  reason          text NOT NULL,   -- manual_opt_out|unsubscribe|hard_bounce|soft_bounce_limit|complaint|spam_report|invalid_email|role_account_blocked|legal_request|domain_block|user_manual
  source          text NOT NULL,
  applies_to      text NOT NULL DEFAULT 'all'   CHECK (applies_to IN ('cold','marketing','transactional','all')),
  scope           text NOT NULL DEFAULT 'email' CHECK (scope IN ('email','domain','company','campaign','global')),
  evidence        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_suppression_email  ON public.co_suppression_list(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_co_suppression_domain ON public.co_suppression_list(organization_id, domain);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. co_connector_accounts — per-org connector 設定（含客戶 BYO free key 的 vault ref）
--    credentials_ref = secrets-vault key 名稱，NEVER 存實值（spec PART H §H2）
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_connector_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_name  text NOT NULL,   -- gmail | wp_bridge | hunter | snov | apify | brevo | resend
  connector_type  text NOT NULL,   -- email_send | crm | enrichment | scrape | verify
  is_enabled      boolean NOT NULL DEFAULT true,
  credentials_ref text,            -- vault key NAME only — never the secret value
  settings        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_connector_accounts_org ON public.co_connector_accounts(organization_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. co_connector_limits — per-org per-connector 額度上限 + 警示門檻（Quota Guard）
-- ───────────────────────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_co_connector_limits_org ON public.co_connector_limits(organization_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. co_connector_usage — 非 AI 外部工具用量（Hunter/Apify credit）；AI 走 ai_call_logs
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_connector_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_name  text NOT NULL,
  usage_type      text NOT NULL,
  amount          numeric NOT NULL DEFAULT 1,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_connector_usage_org ON public.co_connector_usage(organization_id, connector_name);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. co_sender_accounts — per-org 寄送身份（客戶 Gmail / FluentSMTP / Brevo）
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_sender_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  email             text NOT NULL,
  display_name      text,
  provider          text NOT NULL,   -- gmail | fluentsmtp | brevo | resend
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
CREATE INDEX IF NOT EXISTS idx_co_sender_accounts_org ON public.co_sender_accounts(organization_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. co_sending_events — 統一寄送事件流（draft/sent/bounce/complaint/...）
--     campaign_id = forward-compat nullable uuid, NO FK (Phase-2)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_sending_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id           uuid REFERENCES public.co_leads(id) ON DELETE SET NULL,
  message_id        uuid REFERENCES public.co_messages(id) ON DELETE SET NULL,
  campaign_id       uuid,                 -- FK added in Phase-2 (co_campaigns)
  stream_type       text NOT NULL,        -- cold | warm | transactional
  provider          text,
  sender_account_id uuid REFERENCES public.co_sender_accounts(id) ON DELETE SET NULL,
  event_type        text NOT NULL,        -- draft_created|sent|delivered|opened|clicked|replied|soft_bounced|hard_bounced|blocked|complained|unsubscribed|suppressed|synced_to_fluentcrm|sequence_started|sequence_completed
  event_status      text,
  provider_event_id text,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_sending_events_org   ON public.co_sending_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_co_sending_events_lead  ON public.co_sending_events(lead_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 11. co_timeline_events — lead 互動時間軸
--     campaign_id = forward-compat nullable uuid, NO FK (Phase-2)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_timeline_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.co_leads(id) ON DELETE CASCADE,
  campaign_id     uuid,                   -- FK added in Phase-2 (co_campaigns)
  event_type      text NOT NULL,
  title           text,
  description     text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_co_timeline_events_lead ON public.co_timeline_events(lead_id, created_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 12. co_verified_emails — email 驗證結果快取（dedup，永不重驗同一 email；spec PART H §H6）
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.co_verified_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  status          text NOT NULL CHECK (status IN ('valid','invalid','risky','unknown')),
  provider        text,
  verified_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS: service-role-only（縱深防禦，比照 intake_forms / content_drafts）
-- app 層 service-role client 存取 + 路由 ops-role 守門；anon/authenticated 直連一律擋。
-- DROP+CREATE 讓本段可重複執行（idempotent，比照 0010）。
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.co_service_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_lead_inbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_suppression_list   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_connector_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_connector_limits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_connector_usage    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_sender_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_sending_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_timeline_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_verified_emails    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS co_service_profiles_service_role   ON public.co_service_profiles;
DROP POLICY IF EXISTS co_lead_inbox_service_role         ON public.co_lead_inbox;
DROP POLICY IF EXISTS co_leads_service_role              ON public.co_leads;
DROP POLICY IF EXISTS co_messages_service_role           ON public.co_messages;
DROP POLICY IF EXISTS co_suppression_list_service_role   ON public.co_suppression_list;
DROP POLICY IF EXISTS co_connector_accounts_service_role ON public.co_connector_accounts;
DROP POLICY IF EXISTS co_connector_limits_service_role   ON public.co_connector_limits;
DROP POLICY IF EXISTS co_connector_usage_service_role    ON public.co_connector_usage;
DROP POLICY IF EXISTS co_sender_accounts_service_role    ON public.co_sender_accounts;
DROP POLICY IF EXISTS co_sending_events_service_role     ON public.co_sending_events;
DROP POLICY IF EXISTS co_timeline_events_service_role    ON public.co_timeline_events;
DROP POLICY IF EXISTS co_verified_emails_service_role    ON public.co_verified_emails;

CREATE POLICY co_service_profiles_service_role   ON public.co_service_profiles   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_lead_inbox_service_role         ON public.co_lead_inbox         TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_leads_service_role              ON public.co_leads              TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_messages_service_role           ON public.co_messages           TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_suppression_list_service_role   ON public.co_suppression_list   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_connector_accounts_service_role ON public.co_connector_accounts TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_connector_limits_service_role   ON public.co_connector_limits   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_connector_usage_service_role    ON public.co_connector_usage    TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_sender_accounts_service_role    ON public.co_sender_accounts    TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_sending_events_service_role     ON public.co_sending_events     TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_timeline_events_service_role    ON public.co_timeline_events    TO service_role USING (true) WITH CHECK (true);
CREATE POLICY co_verified_emails_service_role    ON public.co_verified_emails    TO service_role USING (true) WITH CHECK (true);

-- Register the 12 new public tables with PostgREST's schema cache (house convention, cf. 0047/0038).
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback: packages/db/scripts/0048_co_outreach_core_down.sql
