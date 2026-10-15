-- Behavioural assertions for 0100 (social sender), run by 0100_social_dispatch-local-verify.sh after 0096 + 0098 + 0100
-- on a throwaway Postgres. One block per invariant in the 0100 header.
SET plpgsql.check_asserts = on;

CREATE FUNCTION pg_temp.must_fail(p_sql text, p_state text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_state IS NOT NULL AND SQLSTATE <> p_state THEN
      RAISE EXCEPTION '% failed with % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '% was accepted but must be refused', p_label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO service_role;

-- social_begin_send's lease alone (the key is checked where it matters)
CREATE FUNCTION pg_temp.lease_of(p_org uuid, p_post uuid, p_version int, p_target uuid, p_lease interval) RETURNS text LANGUAGE sql AS $$
  SELECT lease FROM public.social_begin_send(p_org, p_post, p_version, p_target, p_lease) $$;
GRANT EXECUTE ON FUNCTION pg_temp.lease_of(uuid, uuid, int, uuid, interval) TO service_role;

-- a post of brand a with two targets, scheduled at p_at; returns its id
CREATE FUNCTION pg_temp.scheduled_post(p_at timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  p uuid; v int;
BEGIN
  SELECT saved_post_id, saved_version INTO p, v FROM public.social_save_post(a, NULL, NULL, '{"body":"hello"}',
    (SELECT jsonb_agg(jsonb_build_object('account_id', id)) FROM public.social_accounts WHERE organization_id = a), NULL, 'verify');
  PERFORM public.social_set_state(a, p, v, 'scheduled', p_at, NULL, NULL, 'verify', 'schedule', NULL);
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.scheduled_post(timestamptz) TO service_role;

SET ROLE service_role;
DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  p uuid; far uuid; q uuid; r uuid; t1 uuid; t2 uuid; v int; n int; s text; ok boolean; k text;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;

  -- claimed once: only what is due inside the window, and a second claim finds nothing
  p := pg_temp.scheduled_post(now() + interval '5 minutes');
  far := pg_temp.scheduled_post(now() + interval '2 hours');
  SELECT count(*) INTO n FROM public.social_claim_due(now() + interval '10 minutes', 10, 'system:verify') c WHERE c.claimed_post_id = p;
  ASSERT n = 1, 'the due post is claimed';
  ASSERT (SELECT state FROM public.social_posts WHERE id = far) = 'scheduled', 'a post outside the window is left alone';
  ASSERT (SELECT count(*) FROM public.social_claim_due(now() + interval '10 minutes', 10, 'system:verify')) = 0, 'nothing is claimed twice';
  ASSERT (SELECT action FROM public.social_audit_log WHERE post_id = p ORDER BY id DESC LIMIT 1) = 'queue', 'claim audited';
  SELECT version INTO v FROM public.social_posts WHERE id = p;
  SELECT id INTO t1 FROM public.social_post_targets WHERE post_id = p ORDER BY id LIMIT 1;
  SELECT id INTO t2 FROM public.social_post_targets WHERE post_id = p AND id <> t1;

  -- the send lease: go, then busy while held, uncertain once it ran out with no id; stale for an old claim
  ASSERT pg_temp.lease_of(a, p, v, t1, interval '10 minutes') = 'go', 'first send';
  SELECT send_key INTO k FROM public.social_post_targets WHERE id = t1;
  ASSERT k IS NOT NULL, 'the send key is fixed before the Postiz call';
  ASSERT pg_temp.lease_of(a, p, v, t1, interval '10 minutes') = 'busy', 'lease held';
  ASSERT pg_temp.lease_of(a, p, v, t1, interval '0') = 'uncertain', 'lease ran out without an id';
  ASSERT (SELECT send_key FROM public.social_post_targets WHERE id = t1) = k, 'an uncertain retry gets the same key (Postiz upserts by it)';
  ASSERT pg_temp.lease_of(a, p, v - 1, t1, interval '10 minutes') = 'stale', 'an older claim';
  ASSERT pg_temp.lease_of('00000000-0000-0000-0000-00000000000b', p, v, t1, interval '0') = 'stale', 'another brand';

  -- write-back: id -> queued; a refusal -> error; a 429 only drops the lease
  ASSERT public.social_record_send(a, p, v, t1, 'pz-1', NULL, 'system:verify'), 'id recorded';
  ASSERT (SELECT state = 'queued' AND postiz_post_id = 'pz-1' AND send_started_at IS NULL AND send_key IS NULL FROM public.social_post_targets WHERE id = t1), 'target queued, lease and key gone';
  ASSERT public.social_record_send(a, p, v, t1, 'pz-1', NULL, 'system:verify'), 'a retried write-back with the same id';
  ASSERT NOT public.social_record_send(a, p, v, t1, 'pz-other', NULL, 'system:verify'), 'a second Postiz id for the same target';
  ASSERT pg_temp.lease_of(a, p, v, t2, interval '10 minutes') = 'go', 'second target';
  SELECT send_key INTO k FROM public.social_post_targets WHERE id = t2;
  ASSERT public.social_record_send(a, p, v, t2, NULL, NULL, 'system:verify'), '429: lease dropped';
  ASSERT pg_temp.lease_of(a, p, v, t2, interval '10 minutes') = 'go', 'after a 429 (nothing reached Postiz) the next send is new';
  ASSERT (SELECT send_key FROM public.social_post_targets WHERE id = t2) <> k, 'with a new key';
  PERFORM public.social_record_send(a, p, v, t2, NULL, NULL, 'system:verify');
  ASSERT (SELECT state = 'pending' AND send_started_at IS NULL FROM public.social_post_targets WHERE id = t2), 'still pending, no lease';
  ASSERT pg_temp.lease_of(a, p, v, t2, interval '10 minutes') = 'go', 'sendable again after a 429';
  ASSERT public.social_record_send(a, p, v, t2, NULL, 'HTTP 400: bad', 'system:verify'), 'refusal recorded';
  ASSERT (SELECT state = 'error' AND error = 'HTTP 400: bad' FROM public.social_post_targets WHERE id = t2), 'target error';

  -- outcome: still something open -> stays queued (no version bump); all settled with an error -> error
  ASSERT public.social_record_outcome(a, p, v, '[]', 'system:verify') = 'queued', 't1 still queued';
  ASSERT (SELECT version FROM public.social_posts WHERE id = p) = v, 'no bump while queued';
  s := public.social_record_outcome(a, p, v, jsonb_build_array(jsonb_build_object('id', t1, 'state', 'published', 'release_url', 'https://bsky.app/x')), 'system:verify');
  ASSERT s = 'error', format('one published, one error -> error (%s)', s);
  ASSERT (SELECT published_at IS NULL FROM public.social_posts WHERE id = p), 'a partly failed post has no published_at';
  ASSERT (SELECT release_url FROM public.social_post_targets WHERE id = t1) = 'https://bsky.app/x', 'release url kept';
  ASSERT public.social_record_outcome(a, p, v, '[]', 'system:verify') IS NULL, 'outcome on a post no longer queued';

  -- all published -> published with published_at; a published target never moves again
  q := pg_temp.scheduled_post(now() + interval '1 minute');
  PERFORM public.social_claim_due(now() + interval '10 minutes', 10, 'system:verify');
  SELECT version INTO v FROM public.social_posts WHERE id = q;
  FOR t1 IN SELECT id FROM public.social_post_targets WHERE post_id = q LOOP
    PERFORM pg_temp.lease_of(a, q, v, t1, interval '10 minutes');
    PERFORM public.social_record_send(a, q, v, t1, 'pzq-' || t1, NULL, 'system:verify');
  END LOOP;
  s := public.social_record_outcome(a, q, v, (SELECT jsonb_agg(jsonb_build_object('id', id, 'state', 'published')) FROM public.social_post_targets WHERE post_id = q), 'system:verify');
  ASSERT s = 'published' AND (SELECT published_at IS NOT NULL FROM public.social_posts WHERE id = q), 'all published';

  -- reset of a failed target only with the id that was deleted, only on the current claim
  r := pg_temp.scheduled_post(now() + interval '30 minutes');
  PERFORM public.social_claim_due(now() + interval '40 minutes', 10, 'system:verify');
  SELECT version INTO v FROM public.social_posts WHERE id = r;
  SELECT id INTO t1 FROM public.social_post_targets WHERE post_id = r ORDER BY id LIMIT 1;
  SELECT id INTO t2 FROM public.social_post_targets WHERE post_id = r AND id <> t1;
  PERFORM pg_temp.lease_of(a, r, v, t1, interval '10 minutes');
  PERFORM public.social_record_send(a, r, v, t1, 'pzr-1', NULL, 'system:verify');
  PERFORM pg_temp.lease_of(a, r, v, t2, interval '10 minutes');
  PERFORM public.social_record_send(a, r, v, t2, 'pzr-2', NULL, 'system:verify');
  PERFORM public.social_record_outcome(a, r, v, jsonb_build_array(jsonb_build_object('id', t2, 'state', 'error', 'error', 'token expired')), 'system:verify');
  ASSERT (SELECT state FROM public.social_posts WHERE id = r) = 'queued', 't1 still queued';
  ASSERT NOT public.social_reset_target(a, r, v, t2, 'pz-wrong'), 'reset with an id that was not deleted';
  ASSERT public.social_reset_target(a, r, v, t2, 'pzr-2'), 'reset after deleting its Postiz post';
  ASSERT (SELECT state = 'pending' AND postiz_post_id IS NULL AND error IS NULL FROM public.social_post_targets WHERE id = t2), 'pending again';

  -- release: refused while a send is in flight, refused when a queued id was not deleted, then frees the targets
  PERFORM pg_temp.lease_of(a, r, v, t2, interval '10 minutes');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_release_post(%L, %L, %s, ARRAY['pzr-1'], 'scheduled', now() + interval '1 day', 'verify', 'schedule', NULL)$q$, a, r, v),
    'SC409', 'release while a send is in flight');
  PERFORM public.social_record_send(a, r, v, t2, NULL, NULL, 'system:verify');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_release_post(%L, %L, %s, '{}', 'scheduled', now() + interval '1 day', 'verify', 'schedule', NULL)$q$, a, r, v),
    'SC409', 'release without deleting a queued Postiz post');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_release_post(%L, %L, %s, ARRAY['pzr-1'], 'published', now(), 'verify', 'x', NULL)$q$, a, r, v),
    '22023', 'release into a sender state');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_release_post(%L, %L, %s, ARRAY['pzr-1'], 'scheduled', now() + interval '1 day', 'verify', 'schedule', NULL)$q$,
    '00000000-0000-0000-0000-00000000000b', r, v), 'SC404', 'another brand');
  SELECT saved_version INTO n FROM public.social_release_post(a, r, v, ARRAY['pzr-1'], 'scheduled', now() + interval '1 day', 'verify', 'schedule', '{"why":"moved"}');
  ASSERT n > v, 'release bumps version';
  ASSERT (SELECT state = 'scheduled' AND scheduled_at > now() + interval '23 hours' FROM public.social_posts WHERE id = r), 'rescheduled';
  ASSERT (SELECT count(*) FROM public.social_post_targets WHERE post_id = r AND state = 'pending' AND postiz_post_id IS NULL) = 2, 'both targets pending';
  ASSERT (SELECT action FROM public.social_audit_log WHERE post_id = r ORDER BY id DESC LIMIT 1) = 'schedule', 'release audited';
  -- a write-back from the old claim lands nowhere
  ASSERT NOT public.social_record_send(a, r, v, t1, 'pz-late', NULL, 'system:verify'), 'late write-back after a release';
  ASSERT (SELECT count(*) FROM public.social_post_targets WHERE postiz_post_id = 'pz-late') = 0, 'late id not stored';
  ASSERT EXISTS (SELECT 1 FROM public.social_postiz_orphans WHERE postiz_post_id = 'pz-late'), 'but kept as an orphan to delete';

  -- a published target in the deleted ids is refused (it would be sent twice)
  r := pg_temp.scheduled_post(now() + interval '20 minutes');
  PERFORM public.social_claim_due(now() + interval '25 minutes', 10, 'system:verify');
  SELECT version INTO v FROM public.social_posts WHERE id = r;
  SELECT id INTO t1 FROM public.social_post_targets WHERE post_id = r ORDER BY id LIMIT 1;
  SELECT id INTO t2 FROM public.social_post_targets WHERE post_id = r AND id <> t1;
  PERFORM pg_temp.lease_of(a, r, v, t1, interval '10 minutes');
  PERFORM public.social_record_send(a, r, v, t1, 'pzp-1', NULL, 'system:verify');
  PERFORM pg_temp.lease_of(a, r, v, t2, interval '10 minutes');
  PERFORM public.social_record_send(a, r, v, t2, 'pzp-2', NULL, 'system:verify');
  PERFORM public.social_record_outcome(a, r, v, jsonb_build_array(jsonb_build_object('id', t1, 'state', 'published')), 'system:verify');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_release_post(%L, %L, %s, ARRAY['pzp-1','pzp-2'], 'draft', NULL, 'verify', 'unschedule', NULL)$q$, a, r, v),
    'SC409', 'releasing a published target');
  PERFORM public.social_release_post(a, r, v, ARRAY['pzp-2'], 'draft', NULL, 'verify', 'unschedule', NULL);
  ASSERT (SELECT state FROM public.social_post_targets WHERE id = t1) = 'published', 'the published target stays published';

  RAISE NOTICE 'SOCIAL_0100_BEHAVIOUR_OK';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.social_claim_due(timestamptz, integer, text)', 'execute'), 'anon cannot claim';
  ASSERT NOT has_function_privilege('authenticated', 'public.social_release_post(uuid, uuid, integer, text[], text, timestamptz, text, text, jsonb)', 'execute'), 'authenticated cannot release';
  ASSERT NOT has_function_privilege('anon', 'public.social_record_outcome(uuid, uuid, integer, jsonb, text)', 'execute'), 'anon cannot record';
  ASSERT NOT has_table_privilege('anon', 'public.social_dispatch_state', 'select'), 'anon cannot read the backoff';
  ASSERT NOT has_table_privilege('authenticated', 'public.social_postiz_orphans', 'select'), 'authenticated cannot read orphans';
  RAISE NOTICE 'SOCIAL_0100_ACCESS_OK';
END $$;
