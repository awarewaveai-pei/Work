-- Migration 0041: Content Studio generated-draft persistence
-- Before this, generated articles lived ONLY in browser React state and vanished on
-- refresh / regenerate (zero persistence). This table autosaves every generated draft
-- (markdown + SEO meta + full form snapshot) so it survives reload and is re-openable
-- across machines/browsers — see TASKS "Content Studio 生成草稿持久化" (方案 A).
--
-- Operator-authored content (not secrets), but service-role-only access for consistency
-- with the other Content Studio tables (wp_sites / intake_forms pattern).

CREATE TABLE IF NOT EXISTS public.content_drafts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id         uuid,                              -- wp_sites.id (loose ref: sites may be env-only)
  keyword         text        NOT NULL,
  title           text,
  language        text,
  article_type    text,
  markdown        text        NOT NULL,
  meta            jsonb,                             -- { seoTitle, metaDesc, focusKeyword, categories[], tags[] }
  slug_hint       text,
  seo_score       int,
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'archived')),
  form_snapshot   jsonb,                             -- full GenerateForm for re-opening the editor
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- List query orders newest-first
CREATE INDEX IF NOT EXISTS idx_content_drafts_created ON public.content_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_drafts_org     ON public.content_drafts(organization_id);

-- RLS: service role only (bypasses RLS); anon/authenticated never reach this table directly.
ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_drafts_service_role ON public.content_drafts
  TO service_role USING (true) WITH CHECK (true);

-- Rollback:
--   DROP POLICY IF EXISTS content_drafts_service_role ON public.content_drafts;
--   DROP TABLE IF EXISTS public.content_drafts;
