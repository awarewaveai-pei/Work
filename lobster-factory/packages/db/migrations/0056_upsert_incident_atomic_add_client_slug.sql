-- Migration 0056: add p_client_slug to upsert_incident_atomic
-- ops_incidents.client_slug column exists since migration 0026 but was never
-- written by the atomic upsert function — webhook-created incidents always had
-- null client_slug, so repair_runs (which copy from the incident) also had null.
--
-- Fix: add p_client_slug text DEFAULT NULL as a trailing param (same pattern as
-- 0036's p_fingerprint_v2). Existing 13-arg callers keep working via DEFAULT.
-- On duplicate/reopen, COALESCE preserves an already-set client_slug rather than
-- overwriting it with a new null (e.g. from a monitor without the "client" tag).
--
-- Uptime Kuma side: add a tag named "client" with value = the client slug to any
-- client-specific monitors. The normalizer reads tags.find(t => t.name === "client").

BEGIN;

DROP FUNCTION IF EXISTS public.upsert_incident_atomic(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text
);

CREATE OR REPLACE FUNCTION public.upsert_incident_atomic(
  p_fingerprint     text,
  p_environment     text,
  p_source          text,
  p_external_id     text,
  p_signal_type     text,
  p_severity        text,
  p_service         text,
  p_title           text,
  p_message         text,
  p_raw             jsonb,
  p_tags            jsonb,
  p_is_reopen       boolean,
  p_fingerprint_v2  text DEFAULT NULL,
  p_client_slug     text DEFAULT NULL
) RETURNS SETOF public.ops_incidents
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ops_incidents (
    fingerprint, fingerprint_v2, environment, source, external_id, signal_type,
    severity, service, title, message, raw, tags, client_slug,
    last_seen_at, first_seen_at, occurrence_count, reopen_count, status
  )
  VALUES (
    p_fingerprint, p_fingerprint_v2, p_environment, p_source, p_external_id, p_signal_type,
    p_severity, p_service, p_title, p_message, p_raw, p_tags, p_client_slug,
    now(), now(), 1, 0, 'open'
  )
  ON CONFLICT (fingerprint, environment) DO UPDATE SET
    occurrence_count = public.ops_incidents.occurrence_count + 1,
    last_seen_at     = now(),
    fingerprint_v2   = excluded.fingerprint_v2,
    client_slug      = COALESCE(excluded.client_slug, public.ops_incidents.client_slug),
    external_id      = excluded.external_id,
    title            = excluded.title,
    message          = excluded.message,
    raw              = excluded.raw,
    tags             = excluded.tags,
    severity         = CASE
                         WHEN 'critical' IN (public.ops_incidents.severity, excluded.severity) THEN 'critical'
                         WHEN 'high'     IN (public.ops_incidents.severity, excluded.severity) THEN 'high'
                         WHEN 'medium'   IN (public.ops_incidents.severity, excluded.severity) THEN 'medium'
                         ELSE 'low'
                       END,
    reopen_count     = CASE
                         WHEN p_is_reopen AND public.ops_incidents.status IN ('resolved', 'ignored')
                         THEN public.ops_incidents.reopen_count + 1
                         ELSE public.ops_incidents.reopen_count
                       END,
    status           = CASE
                         WHEN p_is_reopen AND public.ops_incidents.status IN ('resolved', 'ignored')
                         THEN 'open'
                         ELSE public.ops_incidents.status
                       END,
    resolved_at      = CASE
                         WHEN p_is_reopen AND public.ops_incidents.status IN ('resolved', 'ignored')
                         THEN NULL
                         ELSE public.ops_incidents.resolved_at
                       END,
    resolved_by      = CASE
                         WHEN p_is_reopen AND public.ops_incidents.status IN ('resolved', 'ignored')
                         THEN NULL
                         ELSE public.ops_incidents.resolved_by
                       END
  RETURNING *;
$$;

COMMIT;

COMMENT ON FUNCTION public.upsert_incident_atomic IS
'Atomic incident upsert. occurrence_count uses SET count + 1 (row-locked), not a
JS-computed literal (M10). Severity: max(existing, incoming). Reopen computed from
current DB status. 0036: stores fingerprint_v2 (M4 salted fingerprint).
0056: stores client_slug from normalizer (e.g. Uptime Kuma "client" tag);
COALESCE on UPDATE preserves existing non-null client_slug against a null incoming.
Conflict target remains (fingerprint, environment).';

-- ---------------------------------------------------------------------------
-- APPLY NOTE: after running this migration, reload PostgREST schema cache:
--   NOTIFY pgrst, 'reload schema';
-- Or restart supabase-rest. Without this, 14-arg RPC calls return PGRST202.
--
-- ROLLBACK (down migration):
--   DROP FUNCTION IF EXISTS public.upsert_incident_atomic(
--     text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, text
--   );
--   -- Then re-apply 0036_fingerprint_v2.sql to restore the 13-arg version.
--   -- Then: NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------
