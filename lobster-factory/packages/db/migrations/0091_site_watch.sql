-- 0091 — site-watch: public-page monitoring of client sites (slice 1). Only caller: next-admin
-- lib/site-watch/store.ts. Plan of record: agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md
-- (§4 defines the C1–C12 labels used in code comments). This header keeps only the invariants the
-- schema itself enforces; keep the two in sync.
--
-- Invariants:
--   I1 one effective executor per target: every claim gets a new lease_gen; every state write is one
--      transaction that re-checks lease_gen + lease_until under the target row lock.
--   I2 notification = state, not event: 'pending' before sending, 'uncertain' before the request
--      leaves, 'sent' only on a delivered response; uncertain counts as possibly delivered
--      (at-least-once: at most one duplicate message, never a lost one).
--   I3 one episode = one alert + one close: an alert that was sent/uncertain always gets a closing
--      message; one that surely was not (pending/skipped) ends silently.
--
-- Why functions, not table writes from TS: every state write must be fenced by the caller's lease
-- (I1). Each function takes the target row lock first (site_watch__hold, FOR UPDATE) and re-checks
-- lease_gen + lease_until in the same transaction, so a stale executor writes 0 rows and a
-- concurrent claim/config change serializes behind it. Lock order everywhere: target row, then
-- page_state rows.
--
-- enabled defaults TRUE (operator decision 2026-09-21: new clients monitored by default). The
-- AGENTS.md §0 "automation default OFF" gate is next-admin's global env SITE_WATCH_ENABLED.
--
-- APPLY:  node scripts/apply-db-migration.mjs 0091   (High: new tables + ops_incidents source check)
-- DOWN:   packages/db/scripts/0091_site_watch_down.sql
-- VERIFY: bash packages/db/scripts/site-watch-local-verify.sh

BEGIN;

-- ── tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_watch_targets (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled                     boolean     NOT NULL DEFAULT true,
  frequency                   text        NOT NULL DEFAULT 'daily'
                                CHECK (frequency IN ('hourly','every_6h','daily','update_only')),
  hour_utc                    int         NOT NULL DEFAULT 22 CHECK (hour_utc BETWEEN 0 AND 23),
  last_completed_run_key      text,
  last_completed_bucket_start timestamptz,
  lease_gen                   bigint      NOT NULL DEFAULT 0,
  lease_until                 timestamptz,
  version                     int         NOT NULL DEFAULT 1,
  updated_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- One row per (target, run bucket, page). The UNIQUE key is the idempotency key: a check is counted
-- into page_state only by the call that inserted its row.
CREATE TABLE IF NOT EXISTS public.site_watch_results (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id           uuid        NOT NULL REFERENCES public.site_watch_targets(id) ON DELETE CASCADE,
  run_key             text        NOT NULL,
  page_id             text        NOT NULL CHECK (page_id ~ '^[0-9a-f]{16}$'),
  page_url            text        NOT NULL,
  lease_gen           bigint      NOT NULL,
  ok                  boolean     NOT NULL,
  http_status         int,
  failure_code        text,
  final_url           text,
  console_error_count int         NOT NULL DEFAULT 0,
  page_error_count    int         NOT NULL DEFAULT 0,
  errors_sample       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  timing_ms           int,
  visual_status       text        CHECK (visual_status IN ('baseline_created','match','diff','skipped')),
  visual_note         text,
  diff_ratio          double precision,
  evidence_key        text,
  diff_key            text,
  skipped_buckets     int         NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, run_key, page_id)
);
CREATE INDEX IF NOT EXISTS site_watch_results_created_at_idx ON public.site_watch_results (created_at);
CREATE INDEX IF NOT EXISTS site_watch_results_target_created_idx ON public.site_watch_results (target_id, created_at DESC);

-- Alert state machine per (page, kind). Invariants I2/I3 (header; plan §4.1) are CHECKs, not conventions.
CREATE TABLE IF NOT EXISTS public.site_watch_page_state (
  target_id         uuid        NOT NULL REFERENCES public.site_watch_targets(id) ON DELETE CASCADE,
  page_id           text        NOT NULL CHECK (page_id ~ '^[0-9a-f]{16}$'),
  kind              text        NOT NULL CHECK (kind IN ('availability','visual')),
  page_url          text        NOT NULL,
  failure_streak    int         NOT NULL DEFAULT 0 CHECK (failure_streak >= 0),
  last_failure_code text,
  last_message      text,
  episode_id        uuid,
  alert_state       text        NOT NULL DEFAULT 'none'
                      CHECK (alert_state IN ('none','pending','uncertain','sent','skipped')),
  recovery_state    text        NOT NULL DEFAULT 'none'
                      CHECK (recovery_state IN ('none','pending_resolve','pending_send','uncertain')),
  recovery_reason   text        CHECK (recovery_reason IN ('recovered','disabled','page_removed')),
  incident_id       uuid        REFERENCES public.ops_incidents(id) ON DELETE SET NULL,
  baseline_set_at   timestamptz,
  baseline_sha256   text,
  -- Since when a message has been owed on this row. The watchdog's "notification stuck" probe reads
  -- this; updated_at cannot answer it, because every failed send attempt rewrites updated_at.
  owed_since        timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_id, page_id, kind),
  CONSTRAINT site_watch_episode_iff_alert CHECK ((episode_id IS NULL) = (alert_state = 'none')),
  CONSTRAINT site_watch_recovery_needs_episode CHECK (recovery_state = 'none' OR episode_id IS NOT NULL),
  CONSTRAINT site_watch_recovery_reason_iff CHECK ((recovery_state = 'none') = (recovery_reason IS NULL)),
  CONSTRAINT site_watch_owed_since_iff_owed CHECK (
    (owed_since IS NOT NULL) = (recovery_state <> 'none' OR alert_state IN ('pending','uncertain')))
);

-- Singleton: the UTC day the daily cleanup last ran (claimed atomically, C9), and the watchdog's two
-- heartbeat stamps (scripts/check-site-watch-health.ps1). Two stamps because "Trigger → next-admin →
-- DB is alive" and "the kill switch is on" are different facts.
CREATE TABLE IF NOT EXISTS public.site_watch_maintenance (
  id                        int  PRIMARY KEY CHECK (id = 1),
  last_cleanup_day          date,
  last_heartbeat_at         timestamptz,
  last_enabled_heartbeat_at timestamptz
);
INSERT INTO public.site_watch_maintenance (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_watch_targets','site_watch_results','site_watch_page_state','site_watch_maintenance'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "service_role only" ON public.%I', t);
    EXECUTE format('CREATE POLICY "service_role only" ON public.%I TO service_role USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ── ops_incidents source ────────────────────────────────────────────────────
-- Current value is 0073's (it added 'collection'); 0031 is no longer the latest definition.
ALTER TABLE public.ops_incidents DROP CONSTRAINT IF EXISTS ops_incidents_source_check;
ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_source_check
  CHECK (source IN ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch'));

-- ── internal helpers ────────────────────────────────────────────────────────

-- True iff p_gen still owns p_target; holds the target row lock for the rest of the transaction.
CREATE OR REPLACE FUNCTION public.site_watch__hold(p_target uuid, p_gen bigint) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.site_watch_targets
   WHERE id = p_target AND lease_gen = p_gen AND lease_until > clock_timestamp()
   FOR UPDATE;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.site_watch__clear_episode(p_target uuid, p_page text, p_kind text)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.site_watch_page_state
     SET episode_id = NULL, alert_state = 'none', recovery_state = 'none', recovery_reason = NULL,
         incident_id = NULL, owed_since = NULL, updated_at = now()
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind;
$$;

-- End the open episode of one row. I3: an alert that may have been delivered (sent/uncertain)
-- always gets a closing message; one that surely was not (pending/skipped) ends silently.
CREATE OR REPLACE FUNCTION public.site_watch__end_episode(p_target uuid, p_page text, p_kind text, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE s public.site_watch_page_state%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.site_watch_page_state
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind FOR UPDATE;
  IF NOT FOUND OR s.episode_id IS NULL OR s.recovery_state <> 'none' THEN RETURN; END IF;

  IF s.alert_state IN ('sent','uncertain') THEN
    -- An uncertain alert was already owed; the close inherits its age rather than restarting it.
    UPDATE public.site_watch_page_state
       SET recovery_state = 'pending_resolve', recovery_reason = p_reason,
           owed_since = coalesce(owed_since, now()), updated_at = now()
     WHERE target_id = p_target AND page_id = p_page AND kind = p_kind;
  ELSE
    IF s.incident_id IS NOT NULL THEN
      UPDATE public.ops_incidents
         SET status = 'resolved', resolved_at = now(), resolved_by = 'site_watch'
       WHERE id = s.incident_id AND status NOT IN ('resolved','ignored');
    END IF;
    PERFORM public.site_watch__clear_episode(p_target, p_page, p_kind);
  END IF;
END $$;

-- One check outcome into one row. Failure: streak+1; the 2nd consecutive failure opens an episode
-- only when none is open (a failure while an episode is still closing only counts).
-- Success: streak 0 and any open episode ends as 'recovered'.
CREATE OR REPLACE FUNCTION public.site_watch__apply(
  p_target uuid, p_page text, p_kind text, p_ok boolean, p_code text, p_message text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s public.site_watch_page_state%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.site_watch_page_state
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind FOR UPDATE;
  IF NOT p_ok THEN
    IF s.episode_id IS NULL AND s.failure_streak + 1 >= 2 THEN
      UPDATE public.site_watch_page_state
         SET failure_streak = s.failure_streak + 1, last_failure_code = p_code, last_message = p_message,
             episode_id = gen_random_uuid(), alert_state = 'pending', incident_id = NULL,
             owed_since = now(), updated_at = now()
       WHERE target_id = p_target AND page_id = p_page AND kind = p_kind;
    ELSE
      UPDATE public.site_watch_page_state
         SET failure_streak = s.failure_streak + 1, last_failure_code = p_code, last_message = p_message,
             updated_at = now()
       WHERE target_id = p_target AND page_id = p_page AND kind = p_kind;
    END IF;
  ELSE
    UPDATE public.site_watch_page_state SET failure_streak = 0, updated_at = now()
     WHERE target_id = p_target AND page_id = p_page AND kind = p_kind;
    PERFORM public.site_watch__end_episode(p_target, p_page, p_kind, 'recovered');
  END IF;
END $$;

-- ── lease ───────────────────────────────────────────────────────────────────

-- Claim a free or expired lease. Every claim gets a new generation. NULL = held by someone else.
CREATE OR REPLACE FUNCTION public.site_watch_claim(p_target uuid, p_window_s int) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE g bigint;
BEGIN
  UPDATE public.site_watch_targets
     SET lease_gen = lease_gen + 1, lease_until = clock_timestamp() + make_interval(secs => p_window_s)
   WHERE id = p_target AND (lease_until IS NULL OR lease_until < clock_timestamp())
  RETURNING lease_gen INTO g;
  RETURN g;
END $$;

-- Extend a still-valid lease. Returns seconds remaining on the DB clock, or NULL = lost, stop now.
CREATE OR REPLACE FUNCTION public.site_watch_renew(p_target uuid, p_gen bigint, p_window_s int)
RETURNS double precision LANGUAGE plpgsql AS $$
DECLARE u timestamptz;
BEGIN
  UPDATE public.site_watch_targets
     SET lease_until = clock_timestamp() + make_interval(secs => p_window_s)
   WHERE id = p_target AND lease_gen = p_gen AND lease_until > clock_timestamp()
  RETURNING lease_until INTO u;
  IF u IS NULL THEN RETURN NULL; END IF;
  RETURN extract(epoch FROM u - clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.site_watch_release(p_target uuid, p_gen bigint) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.site_watch_targets SET lease_until = clock_timestamp()
   WHERE id = p_target AND lease_gen = p_gen AND lease_until > clock_timestamp();
  RETURN FOUND;
END $$;

-- ── executor writes (all fenced) ────────────────────────────────────────────

-- Record one page check: 'fenced' | 'duplicate' | 'recorded'. p_visual NULL = not compared.
-- Visual state only moves when the page loaded (p_ok).
CREATE OR REPLACE FUNCTION public.site_watch_record_check(
  p_target uuid, p_gen bigint, p_run_key text, p_page_id text, p_page_url text,
  p_ok boolean, p_http_status int, p_failure_code text, p_final_url text,
  p_console_error_count int, p_page_error_count int, p_errors_sample jsonb, p_timing_ms int,
  p_visual text, p_visual_note text, p_diff_ratio double precision,
  p_evidence_key text, p_diff_key text, p_skipped_buckets int, p_message text, p_baseline_sha256 text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN 'fenced'; END IF;

  INSERT INTO public.site_watch_results (
    target_id, run_key, page_id, page_url, lease_gen, ok, http_status, failure_code, final_url,
    console_error_count, page_error_count, errors_sample, timing_ms, visual_status, visual_note,
    diff_ratio, evidence_key, diff_key, skipped_buckets
  ) VALUES (
    p_target, p_run_key, p_page_id, p_page_url, p_gen, p_ok, p_http_status, p_failure_code, p_final_url,
    coalesce(p_console_error_count, 0), coalesce(p_page_error_count, 0), coalesce(p_errors_sample, '[]'::jsonb),
    p_timing_ms, p_visual, p_visual_note, p_diff_ratio, p_evidence_key, p_diff_key, coalesce(p_skipped_buckets, 0)
  )
  ON CONFLICT (target_id, run_key, page_id) DO NOTHING
  RETURNING id INTO rid;
  IF rid IS NULL THEN RETURN 'duplicate'; END IF;

  INSERT INTO public.site_watch_page_state (target_id, page_id, kind, page_url)
  VALUES (p_target, p_page_id, 'availability', p_page_url), (p_target, p_page_id, 'visual', p_page_url)
  ON CONFLICT (target_id, page_id, kind) DO UPDATE SET page_url = excluded.page_url;

  PERFORM public.site_watch__apply(p_target, p_page_id, 'availability', p_ok, p_failure_code, p_message);

  IF p_ok THEN
    IF p_visual = 'baseline_created' THEN
      UPDATE public.site_watch_page_state
         SET baseline_set_at = now(), baseline_sha256 = p_baseline_sha256, updated_at = now()
       WHERE target_id = p_target AND page_id = p_page_id AND kind = 'visual';
      PERFORM public.site_watch__apply(p_target, p_page_id, 'visual', true, NULL, NULL);
    ELSIF p_visual = 'match' THEN
      PERFORM public.site_watch__apply(p_target, p_page_id, 'visual', true, NULL, NULL);
    ELSIF p_visual = 'diff' THEN
      PERFORM public.site_watch__apply(p_target, p_page_id, 'visual', false, 'visual_diff', p_visual_note);
    END IF;
  END IF;
  RETURN 'recorded';
END $$;

CREATE OR REPLACE FUNCTION public.site_watch_complete_run(
  p_target uuid, p_gen bigint, p_run_key text, p_bucket_start timestamptz
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN false; END IF;
  UPDATE public.site_watch_targets
     SET last_completed_run_key = p_run_key, last_completed_bucket_start = p_bucket_start, updated_at = now()
   WHERE id = p_target;
  RETURN true;
END $$;

-- Pages no longer configured: close their episodes ('page_removed'), drop idle rows. -1 = fenced.
CREATE OR REPLACE FUNCTION public.site_watch_retire_pages(p_target uuid, p_gen bigint, p_keep text[])
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r record; n int;
BEGIN
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN -1; END IF;
  FOR r IN SELECT page_id, kind FROM public.site_watch_page_state
            WHERE target_id = p_target AND NOT (page_id = ANY (p_keep)) LOOP
    PERFORM public.site_watch__end_episode(p_target, r.page_id, r.kind, 'page_removed');
  END LOOP;
  DELETE FROM public.site_watch_page_state
   WHERE target_id = p_target AND NOT (page_id = ANY (p_keep)) AND episode_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── notification steps (C8). Fenced and keyed by episode: a stale step cannot touch a newer one.

CREATE OR REPLACE FUNCTION public.site_watch_attach_incident(
  p_target uuid, p_gen bigint, p_page text, p_kind text, p_episode uuid, p_incident uuid
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN false; END IF;
  UPDATE public.site_watch_page_state SET incident_id = p_incident, updated_at = now()
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode;
  RETURN FOUND;
END $$;

-- Written BEFORE the request leaves: a crash mid-send lands in 'uncertain', never back in 'pending'.
CREATE OR REPLACE FUNCTION public.site_watch_notify_begin(
  p_target uuid, p_gen bigint, p_page text, p_kind text, p_episode uuid, p_phase text
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN false; END IF;
  IF p_phase = 'alert' THEN
    UPDATE public.site_watch_page_state SET alert_state = 'uncertain', updated_at = now()
     WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode
       AND recovery_state = 'none' AND alert_state IN ('pending','uncertain');
  ELSIF p_phase = 'recovery' THEN
    UPDATE public.site_watch_page_state SET recovery_state = 'uncertain', updated_at = now()
     WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode
       AND recovery_state IN ('pending_send','uncertain');
  ELSE
    RAISE EXCEPTION 'site_watch_notify_begin: bad phase %', p_phase;
  END IF;
  RETURN FOUND;
END $$;

-- p_outcome: sent | rejected (surely not delivered) | uncertain | skipped (policy: never sent).
CREATE OR REPLACE FUNCTION public.site_watch_notify_finish(
  p_target uuid, p_gen bigint, p_page text, p_kind text, p_episode uuid, p_phase text, p_outcome text
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF p_phase NOT IN ('alert','recovery') THEN RAISE EXCEPTION 'site_watch_notify_finish: bad phase %', p_phase; END IF;
  IF p_outcome NOT IN ('sent','rejected','uncertain','skipped') THEN
    RAISE EXCEPTION 'site_watch_notify_finish: bad outcome %', p_outcome;
  END IF;
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN false; END IF;
  IF p_outcome = 'uncertain' THEN RETURN true; END IF;

  IF p_phase = 'alert' THEN
    UPDATE public.site_watch_page_state
       SET alert_state = CASE p_outcome WHEN 'sent' THEN 'sent' WHEN 'skipped' THEN 'skipped' ELSE 'pending' END,
           owed_since = CASE WHEN p_outcome IN ('sent','skipped') THEN NULL ELSE owed_since END,
           updated_at = now()
     WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode
       AND recovery_state = 'none' AND alert_state = 'uncertain';
    RETURN FOUND;
  END IF;

  IF p_outcome = 'rejected' THEN
    UPDATE public.site_watch_page_state SET recovery_state = 'pending_send', updated_at = now()
     WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode
       AND recovery_state = 'uncertain';
    RETURN FOUND;
  END IF;
  PERFORM 1 FROM public.site_watch_page_state
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode
     AND recovery_state = 'uncertain' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.site_watch__clear_episode(p_target, p_page, p_kind);
  RETURN true;
END $$;

-- pending_resolve → resolve the incident. 1 row: we closed it, a recovery message is owed
-- ('pending_send'). 0 rows: the operator already closed it by hand — episode ends, no message.
CREATE OR REPLACE FUNCTION public.site_watch_resolve_for_recovery(
  p_target uuid, p_gen bigint, p_page text, p_kind text, p_episode uuid
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s public.site_watch_page_state%ROWTYPE; hit uuid;
BEGIN
  IF NOT public.site_watch__hold(p_target, p_gen) THEN RETURN 'fenced'; END IF;
  SELECT * INTO s FROM public.site_watch_page_state
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind AND episode_id = p_episode
     AND recovery_state = 'pending_resolve' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'stale'; END IF;
  IF s.incident_id IS NOT NULL THEN
    UPDATE public.ops_incidents
       SET status = 'resolved', resolved_at = now(), resolved_by = 'site_watch'
     WHERE id = s.incident_id AND status NOT IN ('resolved','ignored')
    RETURNING id INTO hit;
    IF hit IS NULL THEN
      PERFORM public.site_watch__clear_episode(p_target, p_page, p_kind);
      RETURN 'closed_by_operator';
    END IF;
  END IF;
  UPDATE public.site_watch_page_state SET recovery_state = 'pending_send', updated_at = now()
   WHERE target_id = p_target AND page_id = p_page AND kind = p_kind;
  RETURN 'pending_send';
END $$;

-- ── scheduler / operator entry points ───────────────────────────────────────

-- Every active organization with a site_url gets a target (enabled by default). Existing rows —
-- including ones an operator turned off — are never touched.
CREATE OR REPLACE FUNCTION public.site_watch_sync_targets() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.site_watch_targets (organization_id, updated_by)
  SELECT o.id, 'system:default'
    FROM public.organizations o
   WHERE o.status = 'active'
     AND coalesce(o.metadata -> 'client_config' ->> 'site_url', '') ~* '^https?://'
  ON CONFLICT (organization_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Targets owing a notification step (I2: pending/uncertain work resumes from DB state).
CREATE OR REPLACE FUNCTION public.site_watch_targets_with_pending_notifications() RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT target_id FROM public.site_watch_page_state
   WHERE (recovery_state = 'none' AND alert_state IN ('pending','uncertain'))
      OR recovery_state <> 'none';
$$;

-- Operator config write with optimistic version (C7); creates the row when absent (expect 0).
-- Returns the new row, or no row on a version conflict. Any change resets streaks (C8); turning a
-- target off closes its open episodes as 'disabled' (I3 still holds: no alert left without a close).
CREATE OR REPLACE FUNCTION public.site_watch_update_config(
  p_org uuid, p_expected_version int, p_enabled boolean, p_frequency text, p_hour_utc int, p_actor text
) RETURNS SETOF public.site_watch_targets LANGUAGE plpgsql AS $$
DECLARE t public.site_watch_targets%ROWTYPE; r record;
BEGIN
  INSERT INTO public.site_watch_targets (organization_id, version, updated_by)
  VALUES (p_org, 0, p_actor)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO t FROM public.site_watch_targets WHERE organization_id = p_org FOR UPDATE;
  IF t.version <> p_expected_version THEN RETURN; END IF;

  UPDATE public.site_watch_targets
     SET enabled = p_enabled, frequency = p_frequency, hour_utc = p_hour_utc,
         version = t.version + 1, updated_by = p_actor, updated_at = now()
   WHERE id = t.id;

  UPDATE public.site_watch_page_state SET failure_streak = 0, updated_at = now() WHERE target_id = t.id;
  IF NOT p_enabled THEN
    FOR r IN SELECT page_id, kind FROM public.site_watch_page_state
              WHERE target_id = t.id AND episode_id IS NOT NULL LOOP
      PERFORM public.site_watch__end_episode(t.id, r.page_id, r.kind, 'disabled');
    END LOOP;
  END IF;

  RETURN QUERY SELECT * FROM public.site_watch_targets WHERE id = t.id;
END $$;

-- Operator accepted a screenshot as the page's new baseline (C6). Resets the visual streak only;
-- an open episode closes through the next matching check.
CREATE OR REPLACE FUNCTION public.site_watch_accept_baseline(p_target uuid, p_page text, p_sha256 text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.site_watch_targets WHERE id = p_target FOR UPDATE;
  UPDATE public.site_watch_page_state
     SET baseline_set_at = now(), baseline_sha256 = p_sha256, failure_streak = 0, updated_at = now()
   WHERE target_id = p_target AND page_id = p_page AND kind = 'visual';
  RETURN FOUND;
END $$;

-- Every heartbeat (/api/internal/site-watch/due), BEFORE its kill-switch check: the watchdog must see
-- the scheduler chain alive even while the system is switched off.
CREATE OR REPLACE FUNCTION public.site_watch_touch_heartbeat(p_enabled boolean) RETURNS void
LANGUAGE sql AS $$
  UPDATE public.site_watch_maintenance
     SET last_heartbeat_at = now(),
         last_enabled_heartbeat_at = CASE WHEN p_enabled THEN now() ELSE last_enabled_heartbeat_at END
   WHERE id = 1;
$$;

-- At most once per UTC day (C9).
CREATE OR REPLACE FUNCTION public.site_watch_claim_daily_cleanup() RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.site_watch_maintenance SET last_cleanup_day = (now() AT TIME ZONE 'utc')::date
   WHERE id = 1 AND (last_cleanup_day IS NULL OR last_cleanup_day < (now() AT TIME ZONE 'utc')::date);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.site_watch_purge_results(p_days int) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.site_watch_results WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── grants: service_role only (SECURITY INVOKER — helpers need EXECUTE too) ──
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'site\_watch\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
