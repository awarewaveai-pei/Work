-- Migration 0051: Customer Service core — knowledge base (pgvector), intents, tools,
-- eval cases, customer memory, AI reply audit, action log.
--
-- WHY: the AI customer-service engine (lib/cs/) needs durable, multi-tenant storage for the
-- RAG knowledge base, per-tenant intent + autonomy config, the agentic tool allowlist, the
-- offline eval golden set, per-customer memory, and an audit trail for every auto-reply / action.
-- Conversations/messages themselves are NOT stored here — Chatwoot owns them (single source of
-- truth); this schema owns only what the AI layer needs. See:
--   agency-os/docs/Customer_service/Customer_service_automation_plan.md §9 (data model, D6).
--
-- SCHEMA DECISIONS:
--   organization_id — every table is tenant-scoped (FK organizations, ON DELETE CASCADE), matching
--     the co_* outreach module (0048) and the RLS convention (0010 user_has_org_access).
--   cs_knowledge_chunks — pgvector embedding(1536) = OpenAI text-embedding-3-small; embed_model
--     recorded so a provider swap (→ bge-m3) is detectable and triggers a per-tenant re-index.
--     contextual_prefix = Anthropic Contextual Retrieval (Claude-generated chunk context).
--     bm25_tsv (tsvector) + GIN index = the keyword half of hybrid search. NOTE: Postgres FTS
--     tokenizes CJK poorly; the cs-engine layer decides the actual CJK keyword strategy
--     (trigram / pg_bigm / external) — this column is the Latin/keyword anchor, not the final word.
--     doc_family_id + source_version = atomic chunk replacement on knowledge updates (stale-chunk
--     defence; verify delete-propagation, not just insert).
--   cs_intents — answer_level (L0/L1/L2) × action_level (A0/A1/A2) two-axis autonomy; A3
--     (money/identity) is NEVER stored as an autonomy level — it is a hard code gate in cs-engine.
--     is_sensitive forces handoff regardless of level. canary_pct drives progressive rollout.
--   cs_tools — per-tenant agentic action allowlist; risk tier gates execution path (A1 read /
--     A2 gated-write / A3 human-only). Claude may only call tools present + enabled here.
--   cs_eval_cases — offline golden set; is_adversarial marks jailbreak / out-of-scope cases.
--   cs_customer_memory — per-contact persistent facts (Memories); expires_at honours retention.
--   cs_ai_replies — one row per AI turn; the evidence chain (intent, confidence, retrieved chunks,
--     reasoning trace ref, action taken, whether a human agent revised it = learning signal).
--   cs_action_log — one row per tool invocation; result_status captures gated/denied/pending states.
--
-- CIS NOTE: brand identity (brandKit / csVoice / brandColors) is NOT a table here — it lives in
--   organizations.metadata.client_config (JSONB), reusing the existing brand-colors convention.
--   See _uiux_design.md §2.6/2.7.
--
-- SECURITY:
--   RLS enabled on every table; single policy = service_role only (same as co_* (0048),
--   client_credentials (0050)). anon / authenticated have no access. App reaches these tables
--   exclusively via the service-role Supabase client (lib/supabase-server.ts), gated at the route
--   layer by ops-role RBAC. Per-tenant client self-serve (user_has_org_access policies) is added in
--   Phase 5, not now (matches co_* deferral).
--
-- APPLY WITH (gated — High risk, do NOT run without go-ahead):
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0051_cs_core.sql
--   (supabase_admin required for TO service_role policies; pgvector must be available on the instance)
--
-- Down migration (rollback): packages/db/scripts/0051_cs_core_down.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Knowledge sources ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_knowledge_sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind            text        NOT NULL DEFAULT 'doc'
    CHECK (kind IN ('doc','faq','sop','conversation','url')),
  title           text        NOT NULL,
  doc_family_id   uuid        NOT NULL DEFAULT gen_random_uuid(),
  source_version  int         NOT NULL DEFAULT 1,
  status          text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','dirty','archived')),
  is_sensitive    boolean     NOT NULL DEFAULT false,
  last_modified   timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_knowledge_sources_org
  ON public.cs_knowledge_sources(organization_id);

-- ── Knowledge chunks (pgvector + hybrid keyword) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_knowledge_chunks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id          uuid        NOT NULL REFERENCES public.cs_knowledge_sources(id) ON DELETE CASCADE,
  doc_family_id      uuid        NOT NULL,
  source_version     int         NOT NULL,
  content            text        NOT NULL,
  contextual_prefix  text,
  embedding          vector(1536),
  embed_model        text        NOT NULL DEFAULT 'text-embedding-3-small',
  bm25_tsv           tsvector,
  last_modified      timestamptz NOT NULL DEFAULT now(),
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_chunks_org
  ON public.cs_knowledge_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_cs_chunks_family
  ON public.cs_knowledge_chunks(organization_id, doc_family_id, source_version);
CREATE INDEX IF NOT EXISTS idx_cs_chunks_embedding
  ON public.cs_knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_cs_chunks_bm25
  ON public.cs_knowledge_chunks USING gin (bm25_tsv);

-- ── Intents (two-axis autonomy + canary) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_intents (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key                  text        NOT NULL,
  label                text        NOT NULL,
  answer_level         text        NOT NULL DEFAULT 'L1'
    CHECK (answer_level IN ('L0','L1','L2')),
  action_level         text        NOT NULL DEFAULT 'A0'
    CHECK (action_level IN ('A0','A1','A2')),
  is_sensitive         boolean     NOT NULL DEFAULT false,
  confidence_threshold numeric     NOT NULL DEFAULT 0.8,
  canary_pct           int         NOT NULL DEFAULT 0 CHECK (canary_pct BETWEEN 0 AND 100),
  metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

-- ── Agentic tool allowlist ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_tools (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  risk            text        NOT NULL
    CHECK (risk IN ('A1_read','A2_gated_write','A3_human_only')),
  schema          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_enabled      boolean     NOT NULL DEFAULT false,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- ── Offline eval golden set ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_eval_cases (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intent_key      text        NOT NULL,
  question        text        NOT NULL,
  expected_points jsonb       NOT NULL DEFAULT '[]'::jsonb,
  expect_handoff  boolean     NOT NULL DEFAULT false,
  is_adversarial  boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_eval_cases_org
  ON public.cs_eval_cases(organization_id);

-- ── Per-customer memory (GDPR-bounded) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_customer_memory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_ref     text        NOT NULL,
  fact            text        NOT NULL,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contact_ref, fact)
);
CREATE INDEX IF NOT EXISTS idx_cs_memory_lookup
  ON public.cs_customer_memory(organization_id, contact_ref);

-- ── AI reply audit (evidence chain) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_ai_replies (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chatwoot_conversation_id text       NOT NULL,
  chatwoot_message_id     text        NOT NULL,
  intent_key              text,
  confidence              numeric,
  retrieval_score         numeric,
  answer_level            text,
  action                  text        NOT NULL
    CHECK (action IN ('auto_sent','draft','handoff','suppressed','action_taken')),
  retrieved_chunk_ids     uuid[]      NOT NULL DEFAULT '{}',
  reasoning_trace_ref     text,
  model                   text,
  reviewed_by_agent       boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, chatwoot_message_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_ai_replies_conv
  ON public.cs_ai_replies(organization_id, chatwoot_conversation_id);

-- ── Action log (one row per tool invocation) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_action_log (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chatwoot_conversation_id text        NOT NULL,
  tool_name                text        NOT NULL,
  risk                     text        NOT NULL,
  params                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  result_status            text        NOT NULL
    CHECK (result_status IN ('ok','denied','error','pending_confirm','pending_human')),
  confirmed_by             text,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_action_log_conv
  ON public.cs_action_log(organization_id, chatwoot_conversation_id);

-- ── RLS: service_role only (house pattern; user_has_org_access added in Phase 5) ──
ALTER TABLE public.cs_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_knowledge_chunks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_intents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_tools             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_eval_cases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_customer_memory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_ai_replies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_action_log        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only" ON public.cs_knowledge_sources TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_knowledge_chunks  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_intents           TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_tools             TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_eval_cases        TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_customer_memory   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_ai_replies        TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.cs_action_log        TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMIT;
