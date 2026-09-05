-- HCI-30 Wave 1 - Epistemic-label promotion redline (ADR-0019 gate 5,
-- second half: NEG-HD08-04), aligned to ADR-0013's shared-kernel scoping.
-- Closes the last OPEN half of ADR-0019. Extends 0001-0009; must run after
-- all nine, before the fixtures/harness/negative-test files.
--
-- ============================================================================
-- What upstream actually provides, and what this migration therefore had
-- to decide (verified by reading the sources, not assumed)
-- ============================================================================
-- ADR-0019 gate 5 says: reject an UNKNOWN/HYPOTHESIS -> SOURCE_FACT
-- promotion unless it carries a human verifier reference, reusing the
-- sibling cognitive-os product's own already-schema-validated
-- promotion_redline (path/lines cited in ADR-0019's own "Implementation
-- note", not repeated here - this file's source tree must not carry a
-- direct reference into that product outside integrations/cognitive-os/,
-- per ARCH-PEER-01/ADR-0001). That redline is structured DOCUMENTATION
-- (forbidden_transition / legal_paths / each_legal_path_must_record), not
-- a validator keyword - nothing upstream enforces it mechanically. It
-- names no verifier field or type. ADR-0013 (shared kernel) then scopes
-- what HCI may take from it: the 11-value `epistemic_type` enum ONLY - not
-- authorship_state, not locked, not the composite provenance record - and
-- its gate 5
-- (WAVE1-EPISTEMIC-ANNOTATION-01) requires every Wave 1 CHECK for such a
-- column to carry an inline comment citing ADR-0013 and marking the value
-- set provisional pending its gate 3 (the Wave 3 lossless-mapping test).
--
-- Decisions taken here, each the smallest shape the gate text requires:
--   * Column `epistemic_label` on hci.subject_records, CLAIM-scoped (the
--     best-evidenced target: 09_AI_INTELLIGENCE_REVIEW.md:64 frames the
--     redline as "promotion of a CLAIM"; no document pins it wider).
--     Value set = the kernel's full 11 values, not just the three ADR-0019
--     names, so Wave 3's mapping test has nothing to remap.
--   * A CLAIM born without a label is UNKNOWN - the least-trusted state is
--     the only safe default, and it spares ~16 existing insert sites a
--     retrofit that would carry no information. A SUPERSEDING row born
--     without a label inherits its predecessor's, so an ordinary correction
--     cannot silently demote a SOURCE_FACT to UNKNOWN (the same reasoning
--     0008's C2 fix applied to reaudit_required).
--   * "Human verifier reference" = `epistemic_verifier_principal_id`, a
--     tenant-composite FK to hci.principals - the same entity ADR-0019's
--     other half already introduced for Decisions and 0009 reused for
--     spot-checks. Required on EVERY SOURCE_FACT row (CHECK), not only on a
--     promotion: otherwise a Claim simply BORN as SOURCE_FACT with no
--     predecessor would bypass a promotion-only rule - the exact
--     "no downstream consumer / born-in-the-final-state" bypass class the
--     db-expert review found twice in 0008.
--   * The named redline itself (H1019) is a BEFORE INSERT check on the
--     superseding row: predecessor UNKNOWN or HYPOTHESIS, new label
--     SOURCE_FACT, no verifier -> rejected. "Promotion" on an append-only
--     table is a superseding row (ADR-0017), never an UPDATE, exactly as
--     ASSESSMENT_CANDIDATE admission already is.
--   * NOT modelled, stated not hidden: `authorship_state` and `locked`
--     (ADR-0013 reserves them; no ADR authorizes them as columns yet),
--     `execution_manifest_entry` (an AI LEGO execution-log concept with no
--     HCI counterpart), and any demotion/relabelling rule other than the
--     one redline. All remain OPEN for the ADR that specifies them.
--
-- Everything above is new specification surface, flagged provisional in
-- wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md, open to being superseded once
-- ADR-0013 gate 3 fixes the mapping.

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
    'data_encryption_keys','decision_claims','principals'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0010; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ADR-0013 (WAVE1-EPISTEMIC-ANNOTATION-01): value set below is the shared
-- kernel's 11-value epistemic_type re-export, verbatim, and is PROVISIONAL
-- pending ADR-0013 gate 3 (KERNEL-CONTRACT-HCI-01, the Wave 3 lossless-
-- mapping test). Do not add HCI-only values here; add them to a mapped
-- HCI vocabulary once that gate exists. Checked mechanically by
-- scripts/verify-epistemic-annotation.ps1.
ALTER TABLE hci.subject_records
  ADD COLUMN epistemic_label text
    CHECK (epistemic_label IN ('SOURCE_FACT','EVIDENCE','ASSUMPTION','HYPOTHESIS','AI_INFERENCE','AI_SUGGESTION',
                               'HUMAN_OPINION','CALCULATED_RESULT','SIMULATED_RESULT','UNKNOWN','DECISION')),
  ADD COLUMN epistemic_verifier_principal_id uuid,
  ADD CONSTRAINT subject_records_epistemic_scoped
    CHECK (kind = 'CLAIM' OR epistemic_label IS NULL),
  ADD CONSTRAINT subject_records_epistemic_required
    CHECK (kind <> 'CLAIM' OR epistemic_label IS NOT NULL),
  ADD CONSTRAINT subject_records_epistemic_verifier_scoped
    CHECK (kind = 'CLAIM' OR epistemic_verifier_principal_id IS NULL),
  -- Every SOURCE_FACT names a human, whether born or promoted into it.
  ADD CONSTRAINT subject_records_source_fact_verified
    CHECK (epistemic_label IS DISTINCT FROM 'SOURCE_FACT' OR epistemic_verifier_principal_id IS NOT NULL),
  ADD CONSTRAINT subject_records_epistemic_verifier_fk
    FOREIGN KEY (tenant_id, epistemic_verifier_principal_id) REFERENCES hci.principals (tenant_id, id);

CREATE INDEX subject_records_epistemic_verifier_idx ON hci.subject_records (tenant_id, epistemic_verifier_principal_id)
  WHERE epistemic_verifier_principal_id IS NOT NULL;

-- The one BEFORE INSERT trigger that already fires on every subject_records
-- row and already reads the predecessor for supersession (0008 C2) gains
-- the label default/inherit and the redline. Config is restated in the
-- header because CREATE OR REPLACE FUNCTION replaces proconfig wholesale
-- (0009's search_path pin would otherwise be lost - the same trap 0009's
-- mutation harness documents).
CREATE OR REPLACE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger
LANGUAGE plpgsql SET search_path = hci, pg_temp AS $$
DECLARE v_predecessor_reaudit boolean; v_predecessor_label text; v_predecessor_verifier uuid;
BEGIN
  IF NEW.kind = 'CLAIM' AND NEW.supersedes_id IS NOT NULL THEN
    SELECT reaudit_required, epistemic_label, epistemic_verifier_principal_id
      INTO v_predecessor_reaudit, v_predecessor_label, v_predecessor_verifier
      FROM hci.subject_records
     WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id;
  END IF;

  -- reaudit_required: trigger-assigned default (0008), inherited across
  -- supersession (0008 C2 fix). Unchanged.
  IF NEW.kind = 'CLAIM' AND NEW.reaudit_required IS NULL THEN
    NEW.reaudit_required := COALESCE(v_predecessor_reaudit, false);
  END IF;

  -- epistemic_label (0010): born unlabelled -> UNKNOWN; superseding and
  -- unlabelled -> inherit label AND verifier together, never silently
  -- demote. The verifier rides along only in this "label not supplied"
  -- branch: a correction that keeps the predecessor's SOURCE_FACT keeps
  -- the human who attested it; a row that SETS a label itself must name
  -- its own verifier if that label is SOURCE_FACT
  -- (subject_records_source_fact_verified).
  IF NEW.kind = 'CLAIM' AND NEW.epistemic_label IS NULL THEN
    NEW.epistemic_label := COALESCE(v_predecessor_label, 'UNKNOWN');
    IF NEW.epistemic_verifier_principal_id IS NULL THEN
      NEW.epistemic_verifier_principal_id := v_predecessor_verifier;
    END IF;
  END IF;

  -- The promotion redline (ADR-0019 gate 5 / NEG-HD08-04, the
  -- epistemic-label.schema.yaml forbidden_transition): UNKNOWN or
  -- HYPOTHESIS -> SOURCE_FACT is legal only via a named human verifier.
  -- subject_records_source_fact_verified backstops the born-SOURCE_FACT
  -- case; this raises the domain code for the transition itself.
  IF NEW.kind = 'CLAIM' AND NEW.epistemic_label = 'SOURCE_FACT'
     AND v_predecessor_label IN ('UNKNOWN','HYPOTHESIS')
     AND NEW.epistemic_verifier_principal_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1019',
      MESSAGE = format('epistemic promotion %s -> SOURCE_FACT requires a human verifier (epistemic_verifier_principal_id); direct promotion is forbidden', v_predecessor_label);
  END IF;

  -- Gate 3 (0008), unchanged.
  IF NEW.kind = 'CLAIM' AND NEW.claim_state = 'ASSESSMENT_CANDIDATE'
     AND NEW.human_spotcheck_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION USING ERRCODE = 'H1014',
      MESSAGE = 'ASSESSMENT_CANDIDATE requires human_spotcheck_status=APPROVED, independent of case risk_tier';
  END IF;
  RETURN NEW;
END $$;

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id,
              epistemic_label, epistemic_verifier_principal_id)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

-- Canonical-read parity (0005's rule, closed for 0007-0009 by 0009 M6):
-- both new columns land in claims_current AND claims_as_of() together.
CREATE OR REPLACE VIEW hci.claims_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required, epistemic_label, epistemic_verifier_principal_id
  FROM hci.subject_records WHERE kind = 'CLAIM' AND system_superseded_at IS NULL;

DROP FUNCTION hci.claims_as_of(timestamptz);
CREATE FUNCTION hci.claims_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text,
  claim_state text, human_spotcheck_status text, spotcheck_principal_id uuid, reaudit_required boolean,
  epistemic_label text, epistemic_verifier_principal_id uuid
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required, epistemic_label, epistemic_verifier_principal_id
  FROM hci.subject_records
   WHERE kind = 'CLAIM' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
REVOKE ALL ON FUNCTION hci.claims_as_of(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.claims_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

COMMIT;
