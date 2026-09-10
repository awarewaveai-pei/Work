-- Reverses 0015_wave1_case_reopen_up.sql only. Does not touch 0001-0014.
-- Restores the pre-0015 function body byte-for-byte (0002_wave1_case_
-- aggregate_up.sql:108-136) -- CLOSED becomes terminal again.
BEGIN;
SET LOCAL lock_timeout = '3s';

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
    IF NOT ((OLD.status = 'OPEN' AND NEW.status = 'ACTIVE') OR (OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED')) THEN
      RAISE EXCEPTION USING ERRCODE = 'H1010', MESSAGE = 'invalid case lifecycle transition';
    END IF;
    IF NEW.status = 'CLOSED' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
