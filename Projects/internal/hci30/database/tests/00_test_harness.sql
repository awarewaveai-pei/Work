-- HCI-30 Wave 1 - negative-test harness.
--
-- ============================================================================
-- Why this exists (do not replace with inline BEGIN/EXCEPTION blocks)
-- ============================================================================
-- The previous suite asserted failure like this:
--
--     BEGIN
--       INSERT ...;                                -- control works -> P0001 -> caught
--       RAISE EXCEPTION 'expected rejection';      -- control broken -> P0001 -> ALSO caught
--     EXCEPTION WHEN raise_exception THEN NULL;
--     END;
--
-- Both branches raise SQLSTATE P0001, so the same handler swallowed the
-- control's rejection and the assertion failure identically. Those tests could
-- not fail. A test that cannot fail is worse than no test: it reports a closed
-- gate that was never verified.
--
-- The structural fix is that an assertion outcome is DATA, not an exception.
-- Nothing in this harness signals failure by raising, so nothing can swallow
-- it. The only RAISE is the final gate in hci_test.finish(), which runs after
-- all assertions are already recorded and outside any handler.
--
-- SECURITY INVOKER is mandatory throughout. If these ran as DEFINER, the
-- statement under test would execute with the owner's privileges, RLS would not
-- apply, and every tenant-isolation assertion would be meaningless.
-- ============================================================================

CREATE SCHEMA hci_test;

CREATE TABLE hci_test.results (
  id          bigserial   PRIMARY KEY,
  -- UNIQUE closes the other half of the assertion-count check: without it,
  -- duplicating one assertion while deleting another keeps the total at the
  -- expected number and the gate stays quiet. A duplicate now aborts the run.
  test_id     text        NOT NULL UNIQUE,
  outcome     text        NOT NULL CHECK (outcome IN ('PASS','FAIL')),
  detail      text        NOT NULL DEFAULT '',
  actor       text        NOT NULL DEFAULT current_user,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Assert that p_sql fails with exactly p_expected_sqlstate.
--
-- The 'H1TST' sentinel does double duty: it distinguishes "the statement
-- unexpectedly succeeded" from every domain code, AND it aborts the inner
-- subtransaction so an unexpectedly-successful statement leaves no rows behind
-- to corrupt later assertions.
CREATE FUNCTION hci_test.expect_sqlstate(p_test_id text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_state text; v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION USING ERRCODE = 'H1TST', MESSAGE = 'unexpected success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  IF v_state = 'H1TST' THEN
    INSERT INTO hci_test.results(test_id, outcome, detail)
      VALUES (p_test_id, 'FAIL', format('statement succeeded; expected SQLSTATE %s', p_expected_sqlstate));
  ELSIF v_state = p_expected_sqlstate THEN
    INSERT INTO hci_test.results(test_id, outcome, detail)
      VALUES (p_test_id, 'PASS', v_state);
  ELSE
    INSERT INTO hci_test.results(test_id, outcome, detail)
      VALUES (p_test_id, 'FAIL', format('expected SQLSTATE %s, got %s (%s)', p_expected_sqlstate, v_state, v_msg));
  END IF;
END $$;

-- Assert that p_sql succeeds. Effects are intentionally KEPT: later assertions
-- build on the rows these create.
CREATE FUNCTION hci_test.expect_success(p_test_id text, p_sql text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_state text; v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  IF v_state IS NULL THEN
    INSERT INTO hci_test.results(test_id, outcome, detail) VALUES (p_test_id, 'PASS', '');
  ELSE
    INSERT INTO hci_test.results(test_id, outcome, detail)
      VALUES (p_test_id, 'FAIL', format('unexpected %s (%s)', v_state, v_msg));
  END IF;
END $$;

-- Assert that a single-boolean-returning query is TRUE. NULL counts as FAIL.
CREATE FUNCTION hci_test.expect_true(p_test_id text, p_sql text, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_ok boolean; v_state text; v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v_ok;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  IF v_state IS NOT NULL THEN
    INSERT INTO hci_test.results(test_id, outcome, detail)
      VALUES (p_test_id, 'FAIL', format('errored %s (%s)', v_state, v_msg));
  ELSIF v_ok IS TRUE THEN
    INSERT INTO hci_test.results(test_id, outcome, detail) VALUES (p_test_id, 'PASS', p_detail);
  ELSE
    INSERT INTO hci_test.results(test_id, outcome, detail)
      VALUES (p_test_id, 'FAIL', format('predicate was %s. %s', COALESCE(v_ok::text, 'NULL'), p_detail));
  END IF;
END $$;

-- Final gate. Runs as the owner, outside every handler.
--
-- The assertion-count check closes a second silent-pass route: a suite that
-- skipped tests (an aborted section, a role that could not connect, an edit
-- that deleted a case) would otherwise report success for the assertions that
-- did run. Expected count is stated explicitly by the caller so removing a test
-- is a deliberate, visible edit.
CREATE FUNCTION hci_test.finish(p_expected_assertions int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_total int; v_failed int; r record;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE outcome = 'FAIL') INTO v_total, v_failed FROM hci_test.results;

  FOR r IN SELECT test_id, outcome, detail, actor FROM hci_test.results WHERE outcome = 'FAIL' ORDER BY id LOOP
    RAISE WARNING 'FAIL % [%] %', r.test_id, r.actor, r.detail;
  END LOOP;

  RAISE NOTICE 'HCI Wave 1 negative suite: % assertion(s) recorded, % failed', v_total, v_failed;

  IF v_total <> p_expected_assertions THEN
    RAISE EXCEPTION 'assertion-count mismatch: expected %, recorded % (a test was skipped, or added without updating the expected count)', p_expected_assertions, v_total;
  END IF;
  IF v_failed > 0 THEN
    RAISE EXCEPTION '% failing assertion(s); see hci_test.results', v_failed;
  END IF;
END $$;

GRANT USAGE ON SCHEMA hci_test TO hci_app_test_a, hci_app_test_b;
-- Column-level INSERT: 'actor' and 'recorded_at' can only take their defaults.
-- The whole point of this suite is isolation, so the harness must not be the
-- one surface where a tenant role can sign a row as someone else or backdate it.
GRANT SELECT ON hci_test.results TO hci_app_test_a, hci_app_test_b;
GRANT INSERT (test_id, outcome, detail) ON hci_test.results TO hci_app_test_a, hci_app_test_b;
GRANT USAGE, SELECT ON SEQUENCE hci_test.results_id_seq TO hci_app_test_a, hci_app_test_b;
GRANT EXECUTE ON FUNCTION hci_test.expect_sqlstate(text, text, text) TO hci_app_test_a, hci_app_test_b;
GRANT EXECUTE ON FUNCTION hci_test.expect_success(text, text) TO hci_app_test_a, hci_app_test_b;
GRANT EXECUTE ON FUNCTION hci_test.expect_true(text, text, text) TO hci_app_test_a, hci_app_test_b;
