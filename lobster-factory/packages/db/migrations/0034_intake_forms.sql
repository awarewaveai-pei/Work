-- Migration 0034: client onboarding intake forms + website specs
-- Part of: Client Onboarding Portal (specs: agency-os/docs/architecture/client-onboarding-portal-spec.md §12)

-- Intake forms: raw client answers from the onboarding questionnaire
CREATE TABLE IF NOT EXISTS public.intake_forms (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_data       jsonb       NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  submitted_by    text,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'spec_generated', 'building', 'live', 'cancelled'))
);

CREATE INDEX idx_intake_forms_org ON public.intake_forms(organization_id);
CREATE INDEX idx_intake_forms_status ON public.intake_forms(status);

-- Website specs: Claude-generated specs derived from intake forms
CREATE TABLE IF NOT EXISTS public.website_specs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_form_id  uuid        REFERENCES public.intake_forms(id) ON DELETE CASCADE,
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  spec_data       jsonb       NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  generated_by    text        NOT NULL DEFAULT 'claude-sonnet-4-6',
  approved_at     timestamptz,
  approved_by     text,
  version         int         NOT NULL DEFAULT 1
);

CREATE INDEX idx_website_specs_org ON public.website_specs(organization_id);
CREATE INDEX idx_website_specs_intake ON public.website_specs(intake_form_id);

-- RLS
ALTER TABLE public.intake_forms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_specs ENABLE ROW LEVEL SECURITY;

-- Service role full access (existing pattern used across all tables)
CREATE POLICY intake_forms_service_role  ON public.intake_forms  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY website_specs_service_role ON public.website_specs TO service_role USING (true) WITH CHECK (true);
