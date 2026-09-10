-- HCI-30 Wave 1 - Case reopen (CLOSED -> ACTIVE).
-- Extends 0001-0014; must run after all fourteen, before fixtures/harness/
-- negative-test files.
--
-- Operator-requested product decision (2026-09-10): "歷史案件(可復活)" --
-- historical (CLOSED) cases must be revivable, not permanently terminal.
-- 0002_wave1_case_aggregate_up.sql:123 originally allowed only
-- OPEN->ACTIVE and ACTIVE->CLOSED; CLOSED was a dead end with no way back,
-- which was a reasonable original default (ADR-0020 never actually decided
-- "can a closed case reopen," it was simply never asked) but does not match
-- the product's actual intended lifecycle once an operator has to live with
-- it. This migration widens the transition function alone -- CREATE OR
-- REPLACE FUNCTION, no table/column/grant change, since UPDATE (status)
-- was already granted to the app roles by 0002 for the two existing
-- transitions and needs no new privilege for a third.
--
-- Reopening clears closed_at back to NULL (the bidirectional CHECK
-- constraint (status='CLOSED') = (closed_at IS NOT NULL), 0002:84, requires
-- this -- an ACTIVE row with a non-null closed_at would violate it). CLOSED
-- remains reachable only from ACTIVE (unchanged), and OPEN remains
-- reachable only via INSERT (the CLOSED->OPEN skip stays rejected, same
-- H1010 as the existing OPEN->CLOSED skip) -- reopening resumes an
-- in-progress review, it does not reset one to never-started.
--
-- The existing CLOSED-immutability guard (0002:117-121, "every other
-- column frozen while closed") is copied byte-for-byte below, unconditional
-- on NEW.status exactly as before: a pure status-only reopen (the only kind
-- the app ever sends -- UPDATE ... SET status='ACTIVE' touches no other
-- column, so OLD/NEW are IS NOT DISTINCT on every other field and the guard
-- does not fire) still works, while bundling a reopen with any other field
-- edit in the same statement stays rejected (H1007) -- deliberately not
-- widened, since nothing requires that combination to work atomically.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- CREATE OR REPLACE resets proconfig, wiping migrations/0009's retroactive
-- `ALTER FUNCTION ... SET search_path = hci, pg_temp` (real-Docker FUNCTION-
-- SEARCHPATH-01 assertion caught this before it shipped) -- the pin must be
-- restated inline here, not left to the earlier ALTER FUNCTION.
CREATE OR REPLACE FUNCTION hci.enforce_case_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' THEN
      RAISE EXCEPTION USING ERRCODE = 'H1010', MESSAGE = 'a case must be created OPEN';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'CLOSED' AND (NEW.purpose, NEW.risk_tier, NEW.relationship_context, NEW.requester_context, NEW.project_ref)
       IS DISTINCT FROM (OLD.purpose, OLD.risk_tier, OLD.relationship_context, OLD.requester_context, OLD.project_ref) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1007', MESSAGE = 'case fields are immutable once CLOSED';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'OPEN' AND NEW.status = 'ACTIVE') OR
      (OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED') OR
      (OLD.status = 'CLOSED' AND NEW.status = 'ACTIVE')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'H1010', MESSAGE = 'invalid case lifecycle transition';
    END IF;
    IF NEW.status = 'CLOSED' THEN
      NEW.closed_at := now();
    ELSIF OLD.status = 'CLOSED' AND NEW.status = 'ACTIVE' THEN
      NEW.closed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
