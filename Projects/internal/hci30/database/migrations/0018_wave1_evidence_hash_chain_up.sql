-- HCI-30 Wave 1 - Evidence tamper-evidence hash-chain (closes item 4/5 of
-- security/evidence-integrity/HCI_EVIDENCE_TAMPER_EVIDENCE_SPEC.md, both
-- previously marked "OPEN -- blocked on a real payload column"). That
-- blocker was actually resolved by 0012 (ADR-0034's generic `payload jsonb`
-- column) and the spec doc was never revisited -- this migration is that
-- revisit, not new scope invention: the spec's own item 5 says to chain once
-- item 4's blocker clears, and names `system_recorded_at` ordering (already
-- shipped by 0005) as the natural sequence to chain.
--
-- Extends 0001-0017. Must run after all seventeen.
--
-- What this closes: `subject_records` is already append-only at both the
-- grant layer (REVOKE UPDATE/DELETE, 0001) and the trigger layer
-- (hci.reject_update_delete(), same file) -- a row cannot be edited or
-- deleted through any path this schema grants. What that does NOT catch is
-- a bypass of those two layers themselves (a table-owner/superuser
-- connection, or a future migration that ALTERs data directly) silently
-- deleting ONE row from the middle of a case's evidence sequence. Each
-- remaining row's own content would still look internally consistent under
-- a per-row self-hash -- deletion in the middle is only detectable by
-- checking that every row's `prev_hash` still points at a hash some
-- surviving row actually produces. That is what chaining adds over a bare
-- content_hash column, and it is exactly the gap analysis's own item 5
-- wording: "verifies that a sequence of records has not been reordered or
-- had entries silently removed."
--
-- Scope: chains ALL subject_records kinds (EVIDENCE/CLAIM/ASSESSMENT/
-- TRUST_DOMAIN) together in one per-case sequence, ordered by the existing
-- system_recorded_at column -- they already share one physical append-only
-- table and one insert-order timeline; chaining only a subset would leave
-- gaps at every excluded-kind insert that would misreport as tampering.
--
-- Concurrency: hci.subject_record_chain_tips holds one row per (tenant_id,
-- case_id) with the current chain tip's hash. The trigger takes a
-- transaction-scoped advisory lock keyed by (tenant_id, case_id) before
-- reading or writing that tip, serializing concurrent inserts within one
-- case -- including the case's very first record, where no tip row exists
-- yet for a plain row lock to hold (see the trigger function's own comment
-- for why that distinction matters). Correct is worth more than fast here;
-- evidence entry is a human-typing-speed workflow, not a hot path.
--
-- content_hash/prev_hash are server-computed only (never added to the
-- app-role INSERT column grant below), same CREATED-AT-01-class posture as
-- system_recorded_at/generated_at elsewhere in this schema -- the app role
-- cannot supply or override either column even if it tried.

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE actual text[]; expected text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'hci' AND c.relkind = 'r';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO expected FROM unnest(ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications',
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions',
    'data_encryption_keys','decision_claims','principals','case_report_snapshots'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0018; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

ALTER TABLE hci.subject_records
  ADD COLUMN content_hash text,
  ADD COLUMN prev_hash text;

CREATE TABLE hci.subject_record_chain_tips (
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  case_id uuid NOT NULL,
  tip_hash text NOT NULL,
  -- now(), not clock_timestamp(): unlike system_recorded_at (0005), nothing
  -- reads this column for ordering/causality -- it is an observability aid
  -- only -- and BITEMP-SCOPE-01 (ADR-0017 gate 4) specifically requires
  -- `column_default LIKE 'now()%'` for every tenant-owned table's insertion
  -- timestamp. 0005's own header already names clock_timestamp() colliding
  -- with this exact gate as a caught mistake; repeating it here would be the
  -- same mistake with no excuse.
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, case_id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases(tenant_id, id)
);
-- Unlike hci.data_encryption_keys (0007, zero grants because it holds key
-- material), this table holds nothing sensitive -- a one-way digest reveals
-- nothing about the payload it was computed from. The app role needs
-- INSERT/UPDATE here because hci.compute_subject_record_hash() below is a
-- plain (non-DEFINER) trigger function, so it runs with the firing
-- statement's own privileges, not the function owner's -- deliberately: a
-- DEFINER function on a FORCE-RLS table would join the "FORCE-RLS-under-
-- non-superuser-owner risk" category 0016 already flagged as an open
-- TASKS.md item for five existing functions, for zero real gain here (see
-- below). Direct GRANT is not a meaningful weakening: the only entity this
-- chain can ever actually catch is a table-owner/superuser connection that
-- disables the append-only trigger first (DISABLE TRIGGER requires DDL
-- ownership, a strictly higher bar than DML) -- and that tier bypasses
-- every GRANT on every table regardless, chain_tips included, so denying
-- the app role a grant here would not raise the real bar at all. The app
-- role itself can never delete/edit a subject_records row in the first
-- place (append-only already blocks that entirely), so a malicious app-role
-- credential forging its own tenant's tip value only breaks that tenant's
-- OWN future chain visibly at the next verification -- it cannot retroactively
-- hide a deletion it was never able to perform.
GRANT SELECT, INSERT (tenant_id, case_id, tip_hash) ON hci.subject_record_chain_tips
  TO hci_app_test_a, hci_app_test_b;
GRANT UPDATE (tip_hash, updated_at) ON hci.subject_record_chain_tips TO hci_app_test_a, hci_app_test_b;
ALTER TABLE hci.subject_record_chain_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.subject_record_chain_tips FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.subject_record_chain_tips
  USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

CREATE FUNCTION hci.compute_subject_record_hash() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $$
DECLARE v_prev text;
BEGIN
  -- Transaction-scoped advisory lock keyed by (tenant_id, case_id), held
  -- until this transaction commits or rolls back. `SELECT ... FOR UPDATE`
  -- alone cannot serialize this: it only locks a row that already exists,
  -- so two concurrent inserts of a case's FIRST record would both see "no
  -- tip yet", both compute prev_hash=NULL, and hci.verify_subject_record_chain
  -- would then see two records both claiming to be genesis -- reporting a
  -- broken chain that no tampering actually caused. The advisory lock
  -- serializes the read-compute-write sequence below even for that case.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || NEW.case_id::text, 0));

  SELECT tip_hash INTO v_prev FROM hci.subject_record_chain_tips
   WHERE tenant_id = NEW.tenant_id AND case_id = NEW.case_id;

  NEW.prev_hash := v_prev; -- NULL for the case's first record -- the chain's genesis link.
  -- public.digest(): pgcrypto (0007) installed with no explicit SCHEMA
  -- clause, landing in `public` -- schema-qualified here because this
  -- function pins search_path to `hci, pg_temp` (FUNCTION-SEARCHPATH-01
  -- requires every hci function to pin one), which does not include
  -- `public`. encode() itself is core Postgres (pg_catalog, always
  -- implicitly searched), so only the pgcrypto call needs qualifying.
  NEW.content_hash := encode(public.digest(
    NEW.id::text || '|' || NEW.tenant_id::text || '|' || NEW.case_id::text || '|' ||
    NEW.person_id::text || '|' || NEW.kind || '|' || NEW.payload::text || '|' ||
    NEW.system_recorded_at::text || '|' || COALESCE(NEW.prev_hash, ''),
    'sha256'), 'hex');

  INSERT INTO hci.subject_record_chain_tips (tenant_id, case_id, tip_hash)
    VALUES (NEW.tenant_id, NEW.case_id, NEW.content_hash)
    ON CONFLICT (tenant_id, case_id) DO UPDATE SET tip_hash = EXCLUDED.tip_hash, updated_at = now();

  RETURN NEW;
END;
$$;

-- Fires after 0008's two BEFORE INSERT triggers on this table alphabetically
-- ("author_class" < "claim_state_admission" < "content_hash"), so
-- NEW.author_class is already validated/settled by the time this reads NEW
-- -- not that this trigger reads author_class, but system_recorded_at and
-- payload are column DEFAULTs applied before any BEFORE INSERT trigger runs
-- regardless of trigger name/order, so both are already populated on NEW
-- here either way.
CREATE TRIGGER subject_records_content_hash BEFORE INSERT ON hci.subject_records
  FOR EACH ROW EXECUTE FUNCTION hci.compute_subject_record_hash();

-- Verification: recompute every row's content_hash from its own stored
-- columns in system_recorded_at order, and check both self-consistency
-- (stored content_hash matches a fresh recompute -- catches any row whose
-- content changed by a path this schema's append-only guarantees did not
-- actually stop) and chain linkage (each row's prev_hash equals the
-- previous row's content_hash, and the case's chain_tips row matches the
-- last row's content_hash -- catches a row deleted from the middle, or a
-- tip that no longer matches the last surviving row).
CREATE FUNCTION hci.verify_subject_record_chain(p_tenant_id uuid, p_case_id uuid)
RETURNS TABLE(record_id uuid, ok boolean, reason text) LANGUAGE plpgsql SET search_path = hci, pg_temp AS $$
DECLARE r record; v_prev text := NULL; v_expected_hash text; v_last_hash text;
BEGIN
  FOR r IN
    SELECT id, person_id, kind, payload, system_recorded_at, content_hash, prev_hash
      FROM hci.subject_records
     WHERE tenant_id = p_tenant_id AND case_id = p_case_id
     ORDER BY system_recorded_at, id
  LOOP
    v_expected_hash := encode(public.digest(
      r.id::text || '|' || p_tenant_id::text || '|' || p_case_id::text || '|' ||
      r.person_id::text || '|' || r.kind || '|' || r.payload::text || '|' ||
      r.system_recorded_at::text || '|' || COALESCE(r.prev_hash, ''),
      'sha256'), 'hex');

    IF r.prev_hash IS DISTINCT FROM v_prev THEN
      RETURN QUERY SELECT r.id, false, 'prev_hash does not match the preceding record -- a record may have been deleted or reordered';
    ELSIF r.content_hash IS DISTINCT FROM v_expected_hash THEN
      RETURN QUERY SELECT r.id, false, 'content_hash does not match a fresh recompute -- this record''s stored content may have been altered';
    ELSE
      RETURN QUERY SELECT r.id, true, NULL::text;
    END IF;
    v_prev := r.content_hash;
    v_last_hash := r.content_hash;
  END LOOP;

  IF v_last_hash IS NOT NULL THEN
    PERFORM 1 FROM hci.subject_record_chain_tips
     WHERE tenant_id = p_tenant_id AND case_id = p_case_id AND tip_hash = v_last_hash;
    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL::uuid, false, 'chain tip does not match the last surviving record -- the most recent record may have been deleted';
    END IF;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION hci.verify_subject_record_chain(uuid, uuid) TO hci_app_test_a, hci_app_test_b;

DO $$
DECLARE actual text[]; expected text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'hci' AND c.relkind = 'r';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO expected FROM unnest(ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications',
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions',
    'data_encryption_keys','decision_claims','principals','case_report_snapshots','subject_record_chain_tips'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift after 0018; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
