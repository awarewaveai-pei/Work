-- HCI-30 Wave 1 - hci.sources admission-state machine + idempotent discovery
-- upsert + hci.source_snapshots content provenance type.
--
-- Unblocks HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 2 (decision record:
-- reports/decisions/2026-09-17-hci30-c6-and-collector-task1-decisions.md,
-- 裁決 4). Closes a real gap found while drafting that plan: 06_HCI30_PUBLIC_
-- INTELLIGENCE.md:204-215 names the DISCOVERED/MATCHED/VERIFIED/ACCEPTED/
-- ACTIVE/REJECTED admission states and "raw web result must never
-- automatically become formal HCI Evidence" as a hard rule, but hci.sources
-- had no column to hold that state at all - the rule was prose only, with no
-- mechanical gate (this project's own AGENTS.md ADR-011 §決策22: "提升路徑用
-- 機械閘，不用散文").
--
-- Design choice (state machine via BEFORE trigger, not a bespoke function-
-- only write path): mirrors hci.enforce_dsr_transition() (0001) and
-- hci.enforce_case_lifecycle() (0002) exactly - both guard a lifecycle
-- column via trigger rather than by routing all writes through one function.
-- hci.sources is NOT full-CRUD-at-table-level, corrected from an earlier
-- draft of this note that assumed 0001's "ELSE" category still applied
-- unmodified: 0006_wave1_bitemporal_scope_fence_up.sql:94,104-106 already
-- narrowed it to column-level INSERT/UPDATE grants (id,tenant_id,source_ref
-- only, to keep created_at out of app control). admission_state needs its
-- own column-level INSERT/UPDATE grant added below for the same
-- column-allowlist reason - not a new pattern, just extending 0006's
-- existing one to the new column.
--
-- Idempotent discovery upsert (hci.upsert_discovered_source): a source
-- re-discovered by a second crawl of the same URL must resolve to the same
-- hci.sources row, not a duplicate, and must NOT reset a source that has
-- already been promoted past DISCOVERED back to DISCOVERED. INSERT ... ON
-- CONFLICT ON CONSTRAINT ... DO UPDATE SET source_ref = EXCLUDED.source_ref
-- RETURNING id is the standard atomic upsert idiom (avoids the classic
-- SELECT-then-INSERT race); the DO UPDATE deliberately touches only
-- source_ref (a no-op when it already matches) so admission_state is never
-- part of the conflict-resolution write and can never be dragged backwards
-- by a re-discovery.
--
-- tenant_id derived from hci.current_tenant_id(), not caller-supplied
-- (critic follow-up, 2026-09-17, matching hci.record_decision() at
-- 0014:87-94 and hci.set_case_auto_promote_rule_findings() at 0019): an
-- earlier draft took p_tenant_id as a parameter and relied entirely on RLS
-- to reject a mismatched value, with zero defense-in-depth against a caller
-- bug -- the same class of value 0014's own header (lines 46-50) says gets
-- this redundant check deliberately, for a stable H1001 instead of a bare
-- RLS 42501.
--
-- content_epistemic_type on hci.source_snapshots: 0010_wave1_epistemic_label
-- _up.sql's kernel-provenance comment (lines 84-88) is explicit that HCI may
-- take the kernel's 11-value epistemic_type enum verbatim and must not invent
-- HCI-only values - reused here verbatim rather than copying the CLAIM-scoped
-- epistemic_label column itself, since that column's own CHECK constraints
-- (subject_records_epistemic_scoped etc.) are specifically scoped to
-- hci.subject_records rows with kind='CLAIM' and do not apply to a source
-- snapshot. authorship_state is deliberately NOT added here, matching 0010's
-- own explicit exclusion (line 52: "NOT modelled, stated not hidden:
-- authorship_state and locked") - process-level provenance metadata (e.g. the
-- collector pipeline's SOURCE_QUOTATION tag) stays at the application layer,
-- not in this schema.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- Table-inventory drift check (critic follow-up, 2026-09-17): every other
-- migration since 0002, including column/function-only ones (0006, 0009,
-- 0010, 0011), carries this guard. 0020 doesn't add a table, so only the
-- "before" half applies -- no "after" needed since the table count doesn't
-- change.
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
    'data_encryption_keys','decision_claims','principals','case_report_snapshots','subject_record_chain_tips',
    'case_auto_promote_audit'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0020; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ADR-0013 (WAVE1-EPISTEMIC-ANNOTATION-01): value set below is a Wave 1
-- classification vocabulary, provisional pending ADR-0013 gate 3 (Wave 3
-- lossless-mapping test). Six values verbatim from 06_HCI30_PUBLIC_
-- INTELLIGENCE.md:204-213, not this migration's own invention.
ALTER TABLE hci.sources
  ADD COLUMN admission_state text NOT NULL DEFAULT 'DISCOVERED'
    CHECK (admission_state IN ('DISCOVERED','MATCHED','VERIFIED','ACCEPTED','ACTIVE','REJECTED')),
  ADD CONSTRAINT sources_tenant_ref_unique UNIQUE (tenant_id, source_ref);

-- H1022 (see database/ERROR_CODE_REGISTRY.md - claimed in this commit).
-- INSERT branch mirrors hci.enforce_dsr_transition()'s "must start RECEIVED"
-- shape (0001:145-151). UPDATE branch allows only the forward transitions
-- 06_HCI30_PUBLIC_INTELLIGENCE.md:204-213 names; ACTIVE and REJECTED are
-- terminal for Wave 1 (no reopen path modelled here, unlike hci.cases -
-- nothing in the source spec calls for un-rejecting or deactivating a source,
-- and adding one speculatively would be scope not asked for).
CREATE FUNCTION hci.enforce_source_admission_transition() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.admission_state <> 'DISCOVERED' THEN
      RAISE EXCEPTION USING ERRCODE = 'H1022', MESSAGE = 'a source must be admitted as DISCOVERED';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.admission_state IS DISTINCT FROM OLD.admission_state THEN
    IF (OLD.admission_state = 'DISCOVERED' AND NEW.admission_state NOT IN ('MATCHED','REJECTED')) OR
       (OLD.admission_state = 'MATCHED'    AND NEW.admission_state NOT IN ('VERIFIED','REJECTED')) OR
       (OLD.admission_state = 'VERIFIED'   AND NEW.admission_state NOT IN ('ACCEPTED','REJECTED')) OR
       (OLD.admission_state = 'ACCEPTED'   AND NEW.admission_state NOT IN ('ACTIVE','REJECTED')) OR
       OLD.admission_state IN ('ACTIVE','REJECTED') THEN
      RAISE EXCEPTION USING ERRCODE = 'H1022', MESSAGE = 'invalid source admission-state transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- Deliberately not 'UPDATE OF admission_state': same reasoning as 0001:171-172
-- (data_subject_requests_lifecycle) - naming a column list would leave every
-- other UPDATE path on this table unguarded by this trigger's own logic (it
-- would still run, but IS DISTINCT FROM would never see a change on a
-- narrower trigger, silently no-op-ing the guard for combined-column UPDATEs).
CREATE TRIGGER sources_admission_lifecycle BEFORE INSERT OR UPDATE ON hci.sources FOR EACH ROW EXECUTE FUNCTION hci.enforce_source_admission_transition();

-- Extends 0006's column-allowlist grant (id,tenant_id,source_ref) to the new
-- column - additive GRANT statements, does not touch or reissue 0006's own.
GRANT INSERT (admission_state) ON hci.sources TO hci_app_test_a, hci_app_test_b;
GRANT UPDATE (admission_state) ON hci.sources TO hci_app_test_a, hci_app_test_b;

CREATE FUNCTION hci.upsert_discovered_source(p_id uuid, p_source_ref text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $$
DECLARE v_tenant_id uuid; v_id uuid;
BEGIN
  v_tenant_id := hci.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'tenant authorization is not ACTIVE / not currently valid';
  END IF;
  INSERT INTO hci.sources (id, tenant_id, source_ref)
  VALUES (p_id, v_tenant_id, p_source_ref)
  ON CONFLICT ON CONSTRAINT sources_tenant_ref_unique DO UPDATE SET source_ref = EXCLUDED.source_ref
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hci.upsert_discovered_source(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.upsert_discovered_source(uuid, text) TO hci_app_test_a, hci_app_test_b;

-- Default UNKNOWN, not EVIDENCE (critic follow-up, 2026-09-17): 0010:33-38
-- states this schema's own rule for this exact vocabulary -- "a CLAIM born
-- without a label is UNKNOWN, the least-trusted state is the only safe
-- default" -- and this migration's own header cites 06_HCI30_PUBLIC_
-- INTELLIGENCE.md:215 ("raw web result must never automatically become
-- formal HCI Evidence") as its whole reason to exist. Defaulting a raw
-- snapshot to EVIDENCE the moment it's captured, before admission_state has
-- moved past DISCOVERED, directly contradicted that. No downstream consumer
-- exists yet, so fixed here rather than via a later migration.
-- ADR-0013 (WAVE1-EPISTEMIC-ANNOTATION-01): value set below is the kernel's
-- 11-value epistemic_type re-export verbatim (0010_wave1_epistemic_label_
-- up.sql:84-88's own rule against inventing HCI-only values), provisional
-- pending ADR-0013 gate 3 like every other use of this vocabulary in Wave 1.
ALTER TABLE hci.source_snapshots
  ADD COLUMN content_epistemic_type text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (content_epistemic_type IN ('SOURCE_FACT','EVIDENCE','ASSUMPTION','HYPOTHESIS','AI_INFERENCE','AI_SUGGESTION',
                                       'HUMAN_OPINION','CALCULATED_RESULT','SIMULATED_RESULT','UNKNOWN','DECISION'));
-- 0004's own INSERT grant (id,tenant_id,source_id,content_hash,snapshot_ref)
-- deliberately withholds retrieved_at (server-assigned only); unlike that
-- column, content_epistemic_type is a legitimate caller-supplied
-- classification, not a system-integrity timestamp, so it is added to the
-- INSERT allowlist here rather than left server-default-only.
GRANT INSERT (content_epistemic_type) ON hci.source_snapshots TO hci_app_test_a, hci_app_test_b;

COMMIT;
