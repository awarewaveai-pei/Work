-- Migration 0050: Per-client credentials vault — general-purpose encrypted credential storage.
--
-- WHY: operator-collected client credentials (social logins, API keys, CRM tokens, WP passwords,
-- analytics IDs…) were previously scattered across co_connector_accounts (outreach-only),
-- tenant_integration_bindings (agency-level integrations), and wp_sites (plaintext — legacy).
-- This table is the canonical per-client credential store, vault-backed via migration 0049's
-- secret_put/get/delete wrappers. Every secret byte lives in supabase_vault (pgsodium, encrypted
-- at rest); this table stores only the REFERENCE NAME (secret_ref), never the value.
--
-- SCHEMA DECISIONS:
--   category CHECK — prevents arbitrary strings; extend the list when a new type is needed.
--   No UNIQUE(client_id, label) — a client may have two Instagram accounts, two email addresses, etc.
--   identifier — non-secret display field (username / email / account ID); NULL allowed.
--   secret_ref — NULL means "not yet set"; the UI shows "未設密碼". Set/cleared by the /secret route.
--   metadata — forward-compat JSONB bag for future provider-specific non-secret fields.
--   sort_order — operator can control display ordering within a category group.
--
-- SECURITY:
--   RLS enabled; single policy allows only service_role (same as co_connector_accounts, wp_sites, etc.).
--   anon / authenticated roles have no access whatsoever.
--   App code reaches this table only via the service-role Supabase client (lib/supabase-server.ts).
--
-- Down migration (rollback): packages/db/scripts/0050_client_credentials_down.sql
--   DROP TABLE IF EXISTS client_credentials;
--   (safe — no other table references this table; vault entries are namespaced `client_cred:{id}`)

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_credentials (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category    text        NOT NULL DEFAULT 'other'
    CHECK (category IN ('social','cms','analytics','email','ads','crm','hosting','api','other')),
  label       text        NOT NULL,
  identifier  text,
  note        text,
  secret_ref  text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_credentials_client_id
  ON public.client_credentials(client_id);

ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only"
  ON public.client_credentials
  USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';

COMMIT;
