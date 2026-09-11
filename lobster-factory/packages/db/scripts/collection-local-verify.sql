-- Behavioural verification of migration 0073 (collection C2) against a REAL Postgres.
--
-- What matters here is not that the tables exist — it is that a resumed run updates one row instead
-- of growing a new one per attempt, that an issue cannot be filed under a bucket nobody reads, and
-- that an incident raised by a crawl is actually accepted by ops_incidents. That last one is the
-- whole alerting path: if the constraint rejects `collection`, every alert fails silently at the
-- database and the crawl reports success.
--
-- Run through packages/db/scripts/collection-local-verify.sh (throwaway container, no prod).

\set ON_ERROR_STOP on

-- ASSERT is a no-op when this is off, and the file would then pass while verifying nothing.
SET plpgsql.check_asserts = on;

BEGIN;

INSERT INTO public.organizations (id, slug, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'collect-verify', 'Collect verify');

DO $$
DECLARE
  org    uuid := '11111111-1111-4111-8111-111111111111';
  run_a  uuid;
  run_b  uuid;
  n      int;
  ok     boolean;
BEGIN
  -- 1. A resumed run keeps its key, so it must UPDATE rather than accumulate a row per attempt.
  INSERT INTO public.collection_runs (organization_id, run_key, fetched, written)
  VALUES (org, 'run-1', 10, 4)
  RETURNING id INTO run_a;

  INSERT INTO public.collection_runs (organization_id, run_key, fetched, written)
  VALUES (org, 'run-1', 25, 9)
  ON CONFLICT (organization_id, run_key)
  DO UPDATE SET fetched = EXCLUDED.fetched, written = EXCLUDED.written
  RETURNING id INTO run_b;

  ASSERT run_a = run_b, 'a resumed run created a second row instead of updating its own';
  SELECT count(*) INTO n FROM public.collection_runs WHERE organization_id = org;
  ASSERT n = 1, format('expected one run row, found %s', n);
  SELECT fetched INTO n FROM public.collection_runs WHERE id = run_a;
  ASSERT n = 25, format('the resumed run did not update its counters (fetched=%s)', n);

  -- 2. Two tenants may legitimately use the same run key.
  INSERT INTO public.organizations (id, slug, name)
  VALUES ('22222222-2222-4222-8222-222222222222', 'collect-verify-b', 'B');
  INSERT INTO public.collection_runs (organization_id, run_key)
  VALUES ('22222222-2222-4222-8222-222222222222', 'run-1');

  -- 3. Issues are attached to their run and disappear with it. A crawl's refusals outliving the
  --    run they belong to is how an issues table becomes a landfill nobody reads.
  INSERT INTO public.collection_issues (run_id, organization_id, kind, uri, reason, checks)
  VALUES
    (run_a, org, 'dirty', 'https://shop.test/a', 'too_short', '{"textBytes": 40}'::jsonb),
    (run_a, org, 'quarantined', 'https://shop.test/b', 'injection_ignore_previous', NULL),
    (run_a, org, 'disallowed', 'https://shop.test/c', 'robots_disallow', NULL),
    (run_a, org, 'gone', 'https://shop.test/d', 'http_gone', NULL);
  SELECT count(*) INTO n FROM public.collection_issues WHERE run_id = run_a;
  ASSERT n = 4, format('expected 4 issues, found %s', n);

  -- 4. A bucket nobody reads is worse than no bucket: the alert rule keys off `kind`.
  BEGIN
    INSERT INTO public.collection_issues (run_id, organization_id, kind, uri, reason)
    VALUES (run_a, org, 'whatever', 'https://shop.test/e', 'x');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'collection_issues accepted an unknown kind';

  DELETE FROM public.collection_runs WHERE id = run_a;
  SELECT count(*) INTO n FROM public.collection_issues WHERE run_id = run_a;
  ASSERT n = 0, 'issues survived the deletion of their run';

  RAISE NOTICE 'COLLECTION_VERIFY_RUNS_OK';
END $$;

-- ── The alerting path ─────────────────────────────────────────────────────────
DO $$
DECLARE
  org uuid := '11111111-1111-4111-8111-111111111111';
  ok  boolean;
  n   int;
BEGIN
  -- 5. An incident raised by a crawl must be ACCEPTED. Before 0073 the source constraint rejected
  --    it, which would have made every collection alert fail at the database while the crawl
  --    reported success — the silent-alert failure this whole stage exists to prevent.
  INSERT INTO public.ops_incidents
    (organization_id, source, external_id, fingerprint, signal_type, severity, service, environment, title, message)
  VALUES
    (org, 'collection', 'collection:org:stored_nothing', 'collection:org:stored_nothing', 'business',
     'high', 'collection', 'production', 'Collection run stored nothing while refusing pages', 'run=run-1');
  SELECT count(*) INTO n FROM public.ops_incidents WHERE source = 'collection';
  ASSERT n = 1, 'the collection incident was not stored';

  -- 6. The same failure repeating is ONE incident with a rising count, not one alert per run.
  INSERT INTO public.ops_incidents
    (organization_id, source, external_id, fingerprint, signal_type, severity, service, environment, title)
  VALUES
    (org, 'collection', 'collection:org:stored_nothing', 'collection:org:stored_nothing', 'business',
     'high', 'collection', 'production', 'Collection run stored nothing while refusing pages')
  ON CONFLICT (source, external_id)
  DO UPDATE SET occurrence_count = public.ops_incidents.occurrence_count + 1,
                last_seen_at = now();
  SELECT count(*) INTO n FROM public.ops_incidents WHERE source = 'collection';
  ASSERT n = 1, format('a repeat failure created a second incident (%s rows)', n);
  SELECT occurrence_count INTO n FROM public.ops_incidents WHERE external_id = 'collection:org:stored_nothing';
  ASSERT n = 2, format('the repeat was not counted (occurrence_count=%s)', n);

  -- 7. The constraint still refuses anything that is not a known source.
  BEGIN
    INSERT INTO public.ops_incidents
      (source, external_id, fingerprint, signal_type, severity, environment, title)
    VALUES ('not_a_source', 'x', 'x', 'business', 'low', 'production', 'x');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'ops_incidents accepted an unknown source';

  RAISE NOTICE 'COLLECTION_VERIFY_ALERT_OK';
END $$;

ROLLBACK;
