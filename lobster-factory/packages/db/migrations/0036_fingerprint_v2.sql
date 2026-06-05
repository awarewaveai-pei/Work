-- Migration 0036: M4 fingerprint forgery hardening — salted parallel fingerprint.
-- (auto-repair audit 2026-05-23 §M4)
--
-- computeFingerprint() derives only from attacker-controllable payload fields, so a
-- token-bearing attacker can pre-seed a fingerprint and silently downgrade a real alert
-- to "duplicate". We add a parallel salted fingerprint column (fingerprint_v2 =
-- sha256(server_salt + ":" + v1), computed in app code) that an attacker cannot predict.
--
-- This migration is ADDITIVE and behaviour-preserving:
--   * fingerprint_v2 is nullable, no constraint yet.
--   * The dedup key stays (fingerprint, environment) — ON CONFLICT is UNCHANGED.
--   * p_fingerprint_v2 is a TRAILING param with DEFAULT NULL, so any caller that does
--     not pass it (older code, positional 12-arg calls) keeps working and stores NULL.
-- Promoting fingerprint_v2 to the dedup key (unique + ON CONFLICT swap + backfill) is a
-- separate later migration, after the column is fully backfilled.

ALTER TABLE public.ops_incidents
  ADD COLUMN IF NOT EXISTS fingerprint_v2 text;

-- Replace the 0035 function with a 13-arg version (added trailing p_fingerprint_v2).
-- DROP+CREATE (not CREATE OR REPLACE) because the argument signature changes; dropping
-- the exact 12-arg signature avoids leaving a stale overload that named-param calls
-- could resolve ambiguously.
DROP FUNCTION IF EXISTS public.upsert_incident_atomic(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean
);

-- CREATE OR REPLACE (not plain CREATE) so the migration is re-runnable: the DROP above
-- removes the old 12-arg overload on first apply; OR REPLACE makes a second apply a no-op
-- instead of erroring 42723 (function already exists).
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
  p_fingerprint_v2  text DEFAULT NULL
) RETURNS SETOF public.ops_incidents
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ops_incidents (
    fingerprint, fingerprint_v2, environment, source, external_id, signal_type,
    severity, service, title, message, raw, tags,
    last_seen_at, first_seen_at, occurrence_count, reopen_count, status
  )
  VALUES (
    p_fingerprint, p_fingerprint_v2, p_environment, p_source, p_external_id, p_signal_type,
    p_severity, p_service, p_title, p_message, p_raw, p_tags,
    now(), now(), 1, 0, 'open'
  )
  ON CONFLICT (fingerprint, environment) DO UPDATE SET
    occurrence_count = public.ops_incidents.occurrence_count + 1,
    last_seen_at     = now(),
    fingerprint_v2   = excluded.fingerprint_v2,
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

COMMENT ON FUNCTION public.upsert_incident_atomic IS
'Atomic incident upsert. occurrence_count uses SET count + 1 (row-locked), not a
JS-computed literal (M10). Severity: max(existing, incoming). Reopen computed from
current DB status. 0036: also stores fingerprint_v2 (M4 salted fingerprint); the
conflict target REMAINS (fingerprint, environment) — fingerprint_v2 is stored only,
not yet a dedup key. The unique(source, external_id) constraint is still NOT handled
here (a fingerprint-differs-but-external_id-matches collision surfaces as 23505).';

-- ---------------------------------------------------------------------------
-- ROLLBACK (down migration). Self-hosted Supabase has no automatic schema backup,
-- so the inverse is documented here. Apply manually to revert 0036. Run order matters:
-- restore the 0035 (12-arg) function FIRST (or the 6 webhook routes break with PGRST202),
-- then drop the column, then reload the PostgREST schema cache.
--
--   DROP FUNCTION IF EXISTS public.upsert_incident_atomic(
--     text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text
--   );
--   -- Re-create the 0035 function verbatim (12-arg, no fingerprint_v2):
--   --   see migrations/0035_upsert_incident_atomic.sql and run its CREATE OR REPLACE block.
--   ALTER TABLE public.ops_incidents DROP COLUMN IF EXISTS fingerprint_v2;
--   -- Then on the DB host: NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------
--
-- APPLY NOTE (Phase 2): after running this migration, the RPC signature changes 12→13
-- args and a new column is exposed — you MUST run `NOTIFY pgrst, 'reload schema';` (or
-- restart supabase-rest) or 13-arg calls fail with PGRST202 until the cache reloads.
