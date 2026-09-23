-- Behavioural assertions for 0091 (site-watch). Run by site-watch-local-verify.sh against a throwaway
-- Postgres. Each block maps to a row of the acceptance matrix (SITE_WATCH_MASTER_PLAN.md §5) at the DB layer.
SET plpgsql.check_asserts = on;

-- fixtures
INSERT INTO public.organizations (id, type, slug, name, status, metadata) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'client', 'shop-a', 'Shop A', 'active', '{"client_config":{"site_url":"https://a.example.com/"}}'),
  ('00000000-0000-0000-0000-00000000000b', 'client', 'shop-b', 'Shop B', 'inactive', '{"client_config":{"site_url":"https://b.example.com/"}}'),
  ('00000000-0000-0000-0000-00000000000c', 'client', 'shop-c', 'Shop C', 'active', '{"client_config":{}}');

-- helpers for the test only
CREATE FUNCTION pg_temp.tid() RETURNS uuid LANGUAGE sql AS
  $$ SELECT id FROM public.site_watch_targets WHERE organization_id = '00000000-0000-0000-0000-00000000000a' $$;
CREATE FUNCTION pg_temp.expire() RETURNS void LANGUAGE sql AS
  $$ UPDATE public.site_watch_targets SET lease_until = clock_timestamp() - interval '1 second' $$;
CREATE FUNCTION pg_temp.st(p_kind text) RETURNS public.site_watch_page_state LANGUAGE sql AS
  $$ SELECT * FROM public.site_watch_page_state WHERE page_id = 'aaaaaaaaaaaaaaaa' AND kind = p_kind $$;
-- one availability check through the real entry point
CREATE FUNCTION pg_temp.chk(p_gen bigint, p_key text, p_ok boolean) RETURNS text LANGUAGE sql AS $$
  SELECT public.site_watch_record_check(pg_temp.tid(), p_gen, p_key, 'aaaaaaaaaaaaaaaa', 'https://a.example.com',
    p_ok, CASE WHEN p_ok THEN 200 ELSE 500 END, CASE WHEN p_ok THEN NULL ELSE 'http_5xx' END, NULL,
    0, 0, '[]'::jsonb, 100, CASE WHEN p_ok THEN 'match' END, NULL, 0, NULL, NULL, 0, 'msg', NULL) $$;
-- the notifier's alert path, as lib/site-watch/notify.ts drives it
CREATE FUNCTION pg_temp.send(p_gen bigint, p_phase text, p_outcome text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE s public.site_watch_page_state; inc uuid;
BEGIN
  s := pg_temp.st('availability');
  IF p_phase = 'alert' AND s.incident_id IS NULL THEN
    INSERT INTO public.ops_incidents (source, external_id, fingerprint, signal_type, title)
    VALUES ('site_watch', 'site_watch:test:' || s.episode_id, 'site_watch:test:' || s.episode_id, 'uptime', 't') RETURNING id INTO inc;
    PERFORM public.site_watch_attach_incident(pg_temp.tid(), p_gen, s.page_id, s.kind, s.episode_id, inc);
  END IF;
  IF NOT public.site_watch_notify_begin(pg_temp.tid(), p_gen, s.page_id, s.kind, s.episode_id, p_phase) THEN RETURN false; END IF;
  RETURN public.site_watch_notify_finish(pg_temp.tid(), p_gen, s.page_id, s.kind, s.episode_id, p_phase, p_outcome);
END $$;

-- owed_since age, in hours. now() is constant inside one transaction, so "kept" vs "reset to now()"
-- is only observable after moving the stamp back by hand.
CREATE FUNCTION pg_temp.owed_h(p_kind text) RETURNS numeric LANGUAGE sql AS
  $$ SELECT round(extract(epoch FROM now() - owed_since) / 3600) FROM public.site_watch_page_state
      WHERE page_id = 'aaaaaaaaaaaaaaaa' AND kind = p_kind $$;
CREATE FUNCTION pg_temp.age_owed(p_kind text) RETURNS void LANGUAGE sql AS
  $$ UPDATE public.site_watch_page_state SET owed_since = owed_since - interval '5 hours'
      WHERE page_id = 'aaaaaaaaaaaaaaaa' AND kind = p_kind $$;

DO $$
DECLARE g bigint; g2 bigint; s public.site_watch_page_state; ep uuid; r text; n int;
BEGIN
  -- sync: only active orgs with an http(s) site_url; idempotent
  ASSERT public.site_watch_sync_targets() = 1, 'sync should create exactly shop-a';
  ASSERT public.site_watch_sync_targets() = 0, 'sync must be idempotent';
  ASSERT (SELECT enabled AND frequency = 'daily' AND hour_utc = 22 FROM public.site_watch_targets WHERE id = pg_temp.tid()),
    'new target defaults: enabled, daily, 22 UTC';

  -- lease: second claim while held = skip; expired = new generation; stale writer fenced
  g := public.site_watch_claim(pg_temp.tid(), 300);
  ASSERT g IS NOT NULL, 'first claim succeeds';
  ASSERT public.site_watch_claim(pg_temp.tid(), 300) IS NULL, 'concurrent claim must be skipped';
  PERFORM pg_temp.expire();
  g2 := public.site_watch_claim(pg_temp.tid(), 300);
  ASSERT g2 = g + 1, 'reclaim after expiry gets a new generation';
  ASSERT pg_temp.chk(g, 'k1', false) = 'fenced', 'stale generation must be fenced';
  ASSERT (SELECT count(*) FROM public.site_watch_results) = 0, 'fenced write left no row';
  ASSERT public.site_watch_renew(pg_temp.tid(), g, 300) IS NULL, 'stale generation cannot renew';
  ASSERT public.site_watch_renew(pg_temp.tid(), g2, 300) > 290, 'owner renews with ~window remaining';

  -- idempotent per run key: a re-run of the same bucket counts once
  ASSERT pg_temp.chk(g2, 'k1', false) = 'recorded';
  ASSERT pg_temp.chk(g2, 'k1', false) = 'duplicate';
  s := pg_temp.st('availability');
  ASSERT s.failure_streak = 1 AND s.episode_id IS NULL, 'one failure: streak 1, no episode';

  -- 2nd consecutive failure opens one episode; 6 in a row stay one episode
  PERFORM pg_temp.chk(g2, 'k2', false);
  s := pg_temp.st('availability');
  ASSERT s.failure_streak = 2 AND s.episode_id IS NOT NULL AND s.alert_state = 'pending', 'two failures open an episode';
  ASSERT pg_temp.owed_h('availability') = 0, 'an opened episode owes its alert from now';
  ep := s.episode_id;
  PERFORM pg_temp.chk(g2, 'k3', false); PERFORM pg_temp.chk(g2, 'k4', false);
  PERFORM pg_temp.chk(g2, 'k5', false); PERFORM pg_temp.chk(g2, 'k6', false);
  s := pg_temp.st('availability');
  ASSERT s.failure_streak = 6 AND s.episode_id = ep, 'six failures: still the same single episode';

  -- alert rejected (4xx) returns to pending; then sent
  PERFORM pg_temp.age_owed('availability');
  ASSERT pg_temp.send(g2, 'alert', 'rejected');
  ASSERT (pg_temp.st('availability')).alert_state = 'pending', 'rejected alert goes back to pending';
  ASSERT pg_temp.owed_h('availability') = 5, 'a failed send must not restart the owed clock (watchdog would go blind)';
  ASSERT pg_temp.send(g2, 'alert', 'sent');
  ASSERT (pg_temp.st('availability')).alert_state = 'sent';
  ASSERT (pg_temp.st('availability')).owed_since IS NULL, 'a sent alert owes nothing';
  ASSERT (SELECT count(*) FROM public.ops_incidents) = 1, 'one incident per episode';

  -- recovery: success → pending_resolve → resolve incident → pending_send → sent → cleared
  PERFORM pg_temp.chk(g2, 'k7', true);
  s := pg_temp.st('availability');
  ASSERT s.failure_streak = 0 AND s.recovery_state = 'pending_resolve' AND s.recovery_reason = 'recovered';
  ASSERT pg_temp.owed_h('availability') = 0, 'after a sent alert, the close is owed from now';
  ASSERT public.site_watch_resolve_for_recovery(pg_temp.tid(), g2, s.page_id, s.kind, s.episode_id) = 'pending_send';
  ASSERT (SELECT status FROM public.ops_incidents WHERE id = s.incident_id) = 'resolved', 'incident resolved by site_watch';
  ASSERT pg_temp.send(g2, 'recovery', 'uncertain');
  ASSERT (pg_temp.st('availability')).recovery_state = 'uncertain', 'uncertain recovery stays owed';
  ASSERT pg_temp.send(g2, 'recovery', 'sent');
  s := pg_temp.st('availability');
  ASSERT s.episode_id IS NULL AND s.alert_state = 'none' AND s.incident_id IS NULL AND s.owed_since IS NULL,
    'recovery sent closes the episode';

  -- new episode after recovery gets a new id
  PERFORM pg_temp.chk(g2, 'k8', false); PERFORM pg_temp.chk(g2, 'k9', false);
  s := pg_temp.st('availability');
  ASSERT s.episode_id IS NOT NULL AND s.episode_id <> ep, 'next outage is a new episode';

  -- alert never delivered (still pending) + recovery = silent end, incident resolved
  ASSERT pg_temp.send(g2, 'alert', 'rejected');
  PERFORM pg_temp.chk(g2, 'k10', true);
  s := pg_temp.st('availability');
  ASSERT s.episode_id IS NULL AND s.recovery_state = 'none', 'undelivered alert ends silently';
  ASSERT (SELECT count(*) FROM public.ops_incidents WHERE status <> 'resolved') = 0, 'silent end still resolves the incident';

  -- alert uncertain (timeout) + recovery = recovery still owed (I3)
  PERFORM pg_temp.chk(g2, 'k11', false); PERFORM pg_temp.chk(g2, 'k12', false);
  ASSERT pg_temp.send(g2, 'alert', 'uncertain');
  ASSERT (pg_temp.st('availability')).alert_state = 'uncertain';
  PERFORM pg_temp.age_owed('availability');
  PERFORM pg_temp.chk(g2, 'k13', true);
  ASSERT (pg_temp.st('availability')).recovery_state = 'pending_resolve', 'uncertain alert must get a recovery';
  ASSERT pg_temp.owed_h('availability') = 5, 'the close inherits the uncertain alert''s owed age';

  -- operator resolved the incident by hand before we did → episode ends with no message
  s := pg_temp.st('availability');
  UPDATE public.ops_incidents SET status = 'resolved' WHERE id = s.incident_id;
  ASSERT public.site_watch_resolve_for_recovery(pg_temp.tid(), g2, s.page_id, s.kind, s.episode_id) = 'closed_by_operator';
  ASSERT (pg_temp.st('availability')).episode_id IS NULL;

  -- failure while an episode is still closing only counts; next failure after close opens a new one
  PERFORM pg_temp.chk(g2, 'k14', false); PERFORM pg_temp.chk(g2, 'k15', false);
  ASSERT pg_temp.send(g2, 'alert', 'sent');
  PERFORM pg_temp.chk(g2, 'k16', true);
  s := pg_temp.st('availability');
  PERFORM public.site_watch_resolve_for_recovery(pg_temp.tid(), g2, s.page_id, s.kind, s.episode_id);
  PERFORM pg_temp.chk(g2, 'k17', false); PERFORM pg_temp.chk(g2, 'k18', false);
  s := pg_temp.st('availability');
  ASSERT s.failure_streak = 2 AND s.recovery_state = 'pending_send' AND s.alert_state = 'sent', 'closing episode not replaced';
  ASSERT pg_temp.send(g2, 'recovery', 'sent');
  ASSERT (pg_temp.st('availability')).episode_id IS NULL;
  PERFORM pg_temp.chk(g2, 'k19', false);
  ASSERT (pg_temp.st('availability')).alert_state = 'pending', 'streak>=2 after close: next failure opens a new episode';

  -- visual: baseline, diff x2 = episode, accept baseline resets streak only
  PERFORM public.site_watch_record_check(pg_temp.tid(), g2, 'v1', 'aaaaaaaaaaaaaaaa', 'https://a.example.com',
    true, 200, NULL, NULL, 0, 0, '[]', 1, 'baseline_created', NULL, NULL, NULL, NULL, 0, NULL, 'sha1');
  s := pg_temp.st('visual');
  ASSERT s.baseline_set_at IS NOT NULL AND s.baseline_sha256 = 'sha1', 'first success creates the baseline';
  PERFORM public.site_watch_record_check(pg_temp.tid(), g2, 'v2', 'aaaaaaaaaaaaaaaa', 'https://a.example.com',
    true, 200, NULL, NULL, 0, 0, '[]', 1, 'diff', 'diff 9%', 0.09, 'e', 'd', 0, NULL, NULL);
  PERFORM public.site_watch_record_check(pg_temp.tid(), g2, 'v3', 'aaaaaaaaaaaaaaaa', 'https://a.example.com',
    true, 200, NULL, NULL, 0, 0, '[]', 1, 'diff', 'diff 9%', 0.09, 'e', 'd', 0, NULL, NULL);
  s := pg_temp.st('visual');
  ASSERT s.failure_streak = 2 AND s.alert_state = 'pending', 'two diffs open a visual episode';
  ASSERT public.site_watch_accept_baseline(pg_temp.tid(), 'aaaaaaaaaaaaaaaa', 'sha2');
  s := pg_temp.st('visual');
  ASSERT s.failure_streak = 0 AND s.episode_id IS NOT NULL AND s.baseline_sha256 = 'sha2', 'accept resets streak, keeps episode';

  -- a failed load leaves visual state alone
  PERFORM public.site_watch_record_check(pg_temp.tid(), g2, 'v4', 'aaaaaaaaaaaaaaaa', 'https://a.example.com',
    false, 500, 'http_5xx', NULL, 0, 0, '[]', 1, NULL, NULL, NULL, NULL, NULL, 0, 'm', NULL);
  ASSERT (pg_temp.st('visual')).failure_streak = 0, 'availability failure does not touch visual';

  -- complete run is fenced
  ASSERT public.site_watch_complete_run(pg_temp.tid(), g2, 'k19', now());
  ASSERT NOT public.site_watch_complete_run(pg_temp.tid(), g, 'kX', now()), 'stale gen cannot complete';
  ASSERT (SELECT last_completed_run_key FROM public.site_watch_targets WHERE id = pg_temp.tid()) = 'k19';

  -- pending notifications are discoverable
  ASSERT pg_temp.tid() IN (SELECT public.site_watch_targets_with_pending_notifications()), 'pending work listed';

  RAISE NOTICE 'SITE_WATCH_VERIFY_STATE_OK';
END $$;

DO $$
DECLARE v int; s public.site_watch_page_state; g bigint; n int;
BEGIN
  g := (SELECT lease_gen FROM public.site_watch_targets WHERE id = pg_temp.tid());
  -- v1's successful load ended the availability episode silently; v4 was failure 1, k20 is failure 2.
  -- Deliver its alert so disabling must owe a close.
  PERFORM pg_temp.chk(g, 'k20', false);
  ASSERT (pg_temp.st('availability')).alert_state = 'pending';
  ASSERT pg_temp.send(g, 'alert', 'sent');
  ASSERT (pg_temp.st('availability')).alert_state = 'sent';

  -- version conflict: no row, nothing changed
  v := (SELECT version FROM public.site_watch_targets WHERE id = pg_temp.tid());
  ASSERT (SELECT count(*) FROM public.site_watch_update_config('00000000-0000-0000-0000-00000000000a', v + 5, false, 'daily', 22, 't')) = 0,
    'stale version must not write';
  ASSERT (SELECT enabled FROM public.site_watch_targets WHERE id = pg_temp.tid()), 'still enabled after conflict';

  -- disabling: sent alert → recovery owed with reason disabled; pending visual episode → silent end
  ASSERT (SELECT count(*) FROM public.site_watch_update_config('00000000-0000-0000-0000-00000000000a', v, false, 'daily', 22, 'owner:test')) = 1;
  s := pg_temp.st('availability');
  ASSERT s.recovery_state = 'pending_resolve' AND s.recovery_reason = 'disabled' AND s.failure_streak = 0, 'disable owes a close';
  ASSERT (pg_temp.st('visual')).episode_id IS NULL, 'undelivered visual alert closed silently on disable';
  ASSERT (SELECT version FROM public.site_watch_targets WHERE id = pg_temp.tid()) = v + 1;

  -- config for an org without a target creates it (expected version 0)
  ASSERT (SELECT count(*) FROM public.site_watch_update_config('00000000-0000-0000-0000-00000000000c', 0, true, 'hourly', 3, 'owner:test')) = 1;

  -- retire pages: the removed page's open episode is closed (owes recovery) and its row stays until closed
  n := public.site_watch_retire_pages(pg_temp.tid(), g, ARRAY['bbbbbbbbbbbbbbbb']);
  ASSERT n = 1, 'idle visual row deleted, availability row kept until its close is sent';
  ASSERT (pg_temp.st('availability')).recovery_state = 'pending_resolve';

  -- invariants are enforced by the schema, not by callers
  BEGIN
    UPDATE public.site_watch_page_state SET episode_id = NULL WHERE kind = 'availability';
    RAISE EXCEPTION 'CHECK did not fire';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- watchdog heartbeat: "chain alive" and "switched on" are separate stamps
  ASSERT (SELECT last_heartbeat_at IS NULL AND last_enabled_heartbeat_at IS NULL FROM public.site_watch_maintenance);
  PERFORM public.site_watch_touch_heartbeat(false);
  ASSERT (SELECT last_heartbeat_at IS NOT NULL AND last_enabled_heartbeat_at IS NULL FROM public.site_watch_maintenance),
    'a heartbeat with the kill switch off stamps liveness only';
  PERFORM public.site_watch_touch_heartbeat(true);
  ASSERT (SELECT last_enabled_heartbeat_at IS NOT NULL FROM public.site_watch_maintenance), 'an enabled heartbeat stamps both';

  -- cleanup: once per day; results older than 30 days purged
  ASSERT public.site_watch_claim_daily_cleanup();
  ASSERT NOT public.site_watch_claim_daily_cleanup(), 'second cleanup the same day is refused';
  UPDATE public.site_watch_results SET created_at = now() - interval '31 days' WHERE run_key IN ('k1','k2');
  ASSERT public.site_watch_purge_results(30) = 2, 'only >30 day rows purged';

  -- grants: nobody but service_role may execute
  ASSERT NOT has_function_privilege('anon', 'public.site_watch_claim(uuid,integer)', 'EXECUTE'), 'anon must not execute';
  ASSERT has_function_privilege('service_role', 'public.site_watch__hold(uuid,bigint)', 'EXECUTE'), 'service_role needs helpers';

  RAISE NOTICE 'SITE_WATCH_VERIFY_OPS_OK';
END $$;
