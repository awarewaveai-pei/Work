-- Migration 0035: atomic incident upsert function
-- Eliminates read-then-write race on occurrence_count (M10, audit 2026-05-23).
-- All 6 webhook routes previously computed occurrence_count = snapshot + 1 in JS;
-- concurrent retries (e.g. Sentry's auto-retry) could both read N and both write N+1.
-- This function uses SET occurrence_count = ops_incidents.occurrence_count + 1
-- which is evaluated atomically inside the row-locked UPDATE.

CREATE OR REPLACE FUNCTION public.upsert_incident_atomic(
  p_fingerprint  text,
  p_environment  text,
  p_source       text,
  p_external_id  text,
  p_signal_type  text,
  p_severity     text,
  p_service      text,
  p_title        text,
  p_message      text,
  p_raw          jsonb,
  p_tags         jsonb,
  p_is_reopen    boolean
) RETURNS SETOF public.ops_incidents
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ops_incidents (
    fingerprint, environment, source, external_id, signal_type,
    severity, service, title, message, raw, tags,
    last_seen_at, first_seen_at, occurrence_count, reopen_count, status
  )
  VALUES (
    p_fingerprint, p_environment, p_source, p_external_id, p_signal_type,
    p_severity, p_service, p_title, p_message, p_raw, p_tags,
    now(), now(), 1, 0, 'open'
  )
  ON CONFLICT (fingerprint, environment) DO UPDATE SET
    occurrence_count = public.ops_incidents.occurrence_count + 1,
    last_seen_at     = now(),
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
'Atomic incident upsert. occurrence_count uses SET count + 1 (row-locked),
not a JS-computed literal. Eliminates concurrent-retry double-count loss (M10).
Severity: max(existing, incoming). Reopen logic computed from current DB status.
NOTE: conflict target is (fingerprint, environment) only. The second unique
constraint unique(source, external_id) on ops_incidents (added in 0013) is NOT
handled here — a collision where fingerprint differs but external_id matches a
different row will surface as a 23505 unique_violation error, not a DO UPDATE.
This matches the pre-migration .upsert({onConflict:"fingerprint,environment"})
behavior. If source+external_id deduplication is ever needed, drop or broaden
this constraint in a future migration.';
