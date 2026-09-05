-- HCI-30 Wave 1 - No Universal Human Trust Score (ADR-0004 gates 1-3).
-- Extends 0001-0010; must run after all ten, before the fixtures/harness/
-- negative-test files.
--
-- ============================================================================
-- What ADR-0004 requires and what this migration therefore decides
-- ============================================================================
-- ADR-0004's decision: TrustDomain data is always domain-scoped and
-- evidence-linked; HCI never computes, stores, transmits, or displays a
-- single scalar "overall trust" value for a Person. Gates 1-3 (Wave 1,
-- schema-adjacent, do not wait on the Wave 5 roll-up-formula work):
--
--   Gate 1 (CI-blocking lint): scripts/check-no-universal-trust-column.ps1
--     scans every migration file for a column matching
--     overall_score|composite_trust|aggregate_trust|universal_trust|^trust_score$
--     on any table that has no `domain` column, and fails if found. Wired
--     into test-wave1-local.ps1. This migration adds no such column, so the
--     lint's own self-test (synthetic fixtures, not this schema) is what
--     proves it is non-vacuous.
--   Gate 2: hci.subject_records (the TrustDomain stub, ADR-0011) gains a
--     required, enum-restricted `domain` column, scoped to
--     kind='TRUST_DOMAIN' (never present on any other kind - the same
--     scoped/required CHECK-pair idiom 0007/0008/0009/0010 already use for
--     encryption_key_ref/author_class/claim_state/epistemic_label), plus a
--     partial UNIQUE index on (tenant_id, person_id, domain) WHERE
--     kind='TRUST_DOMAIN' - explicitly not UNIQUE(tenant_id, person_id)
--     alone, which is exactly the one-slot-per-Person shape the ADR forbids.
--     TRUST-NEG-01 (new): domain NULL on a TRUST_DOMAIN row is rejected.
--   Gate 3 (same migration): TRUST-NEG-02 (new): two TRUST_DOMAIN rows for
--     the same (tenant_id, person_id) with two different domain values both
--     persist - proving the schema holds the full vector, not one slot.
--
-- Evidence-link requirement (ADR-0004's Decision, third bullet): every
-- TrustDomain row must reference at least one EVIDENCE/CLAIM subject_records
-- row. Modelled as a typed self-reference pair (evidence_ref_id,
-- evidence_ref_kind), same composite-FK idiom data_subject_request_targets
-- already uses to pin a reference's kind (0001:180-186) and supersedes_id
-- already uses for a same-table self-reference (0005) - not a new idiom.
-- Both columns use the same scoped/required CHECK pair as `domain` itself,
-- so an EVIDENCE/CLAIM/ASSESSMENT row can never carry either.
--
-- Gates 4-5 (Wave 5, TRUST-NEG-03 / METHOD-CONTRACT-NEG-01) are out of scope
-- here; they gate the Intelligence-math roll-up work, which does not exist
-- yet. See ADR-0004's own "Required implementation gates".
--
-- db-expert review (2026-09-05), fixed before this migration ever shipped:
--   M2: the typed evidence pin originally keyed only on (tenant_id, id, kind)
--   - the same tuple data_subject_request_targets pins against (0001:134) -
--     which lets a TRUST_DOMAIN row for Person A cite evidence about Person
--     B in the same tenant as its backing. subject_records_person_kind_unique
--     below widens the pinned tuple to (tenant_id, person_id, id, kind), and
--     the evidence FK now includes person_id, so a TrustDomain's evidence
--     must be about the SAME Person it is scoped to, not merely the same
--     tenant. TRUST-EVIDENCE-CROSSPERSON-01 proves it.
--   M1: this table's only correction mechanism is bitemporal supersession
--     (0005, an AFTER INSERT trigger) - which can never fire on a
--     TRUST_DOMAIN row, because subject_records_trust_domain_unique below is
--     checked before insert and would reject the superseding row as a
--     duplicate (tenant_id, person_id, domain) before mark_superseded() ever
--     runs on the predecessor. Rather than leave that silently unreachable,
--     subject_records_trust_domain_no_supersede below makes it an explicit,
--     tested rule for Wave 1: correcting a TrustDomain row is not yet
--     supported (same exclusion pattern 0008 already applies to keep
--     TRUST_DOMAIN out of author_class, 0008:57). Revisit when Wave 5 gives
--     TrustDomain an actual value to correct.

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
    RAISE EXCEPTION 'hci table inventory drift before 0011; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- domain: the seven names in 04_HCI30_PRODUCT_SPEC.md:59-65, verbatim.
-- TRUST_DOMAIN-scoped and required, never present on any other kind.
ALTER TABLE hci.subject_records
  ADD COLUMN domain text
    CHECK (domain IN ('OPERATIONAL','COMPETENCE','CONFIDENTIALITY','FINANCIAL',
                       'STRATEGIC','REPUTATIONAL','GOVERNANCE_POWER')),
  ADD CONSTRAINT subject_records_domain_scoped
    CHECK (kind = 'TRUST_DOMAIN' OR domain IS NULL),
  ADD CONSTRAINT subject_records_domain_required
    CHECK (kind <> 'TRUST_DOMAIN' OR domain IS NOT NULL),
  -- M1 (db-expert, 2026-09-05): TrustDomain rows cannot use this table's
  -- only correction mechanism (bitemporal supersession, 0005) - see the
  -- header comment above for why - so Wave 1 makes that an explicit,
  -- tested exclusion rather than a silently-unreachable trigger path.
  -- subject_records_reason_paired (0005) already requires corrected_reason
  -- to be NULL whenever supersedes_id is, so excluding supersedes_id alone
  -- is sufficient; no separate corrected_reason rule is needed here.
  ADD CONSTRAINT subject_records_trust_domain_no_supersede
    CHECK (kind <> 'TRUST_DOMAIN' OR supersedes_id IS NULL),
  -- Typed self-reference to the evidence/claim that backs this domain
  -- value. evidence_ref_kind is independently scoped/required exactly like
  -- domain, not merely paired with evidence_ref_id, so both branches (kind
  -- set with id NULL, or vice versa) hit their own named CHECK rather than
  -- a single combined one that could not say which column was wrong.
  ADD COLUMN evidence_ref_id uuid,
  ADD CONSTRAINT subject_records_evidence_ref_id_scoped
    CHECK (kind = 'TRUST_DOMAIN' OR evidence_ref_id IS NULL),
  ADD CONSTRAINT subject_records_evidence_ref_id_required
    CHECK (kind <> 'TRUST_DOMAIN' OR evidence_ref_id IS NOT NULL),
  ADD COLUMN evidence_ref_kind text
    CHECK (evidence_ref_kind IN ('EVIDENCE','CLAIM')),
  ADD CONSTRAINT subject_records_evidence_ref_kind_scoped
    CHECK (kind = 'TRUST_DOMAIN' OR evidence_ref_kind IS NULL),
  ADD CONSTRAINT subject_records_evidence_ref_kind_required
    CHECK (kind <> 'TRUST_DOMAIN' OR evidence_ref_kind IS NOT NULL),
  -- M2 (db-expert, 2026-09-05): widens the typed-pin target from (tenant_id,
  -- id, kind) - the tuple data_subject_request_targets pins against
  -- (0001:134) - to also include person_id, so a TrustDomain's evidence must
  -- be about the SAME Person, not merely the same tenant.
  ADD CONSTRAINT subject_records_person_kind_unique
    UNIQUE (tenant_id, person_id, id, kind),
  -- Same idiom as subject_records_supersedes_fk (0005), typed per
  -- data_subject_request_targets (0001): the referenced row's own kind (and
  -- now person_id) must equal evidence_ref_kind (and the referencing row's
  -- own person_id), so a TRUST_DOMAIN row can never typed-pin an ASSESSMENT
  -- or another TRUST_DOMAIN row, nor another Person's EVIDENCE/CLAIM, as its
  -- evidence.
  ADD CONSTRAINT subject_records_evidence_ref_fk
    FOREIGN KEY (tenant_id, person_id, evidence_ref_id, evidence_ref_kind)
    REFERENCES hci.subject_records (tenant_id, person_id, id, kind);

-- (tenant_id, person_id, domain) is the TrustDomain identity key (ADR-0004's
-- Decision, first bullet) - partial, not a bare table-wide UNIQUE, because
-- domain is NULL on every non-TRUST_DOMAIN row and a bare index would let
-- Postgres's NULL-distinctness silently do the scoping instead of an
-- explicit WHERE clause saying so.
CREATE UNIQUE INDEX subject_records_trust_domain_unique
  ON hci.subject_records (tenant_id, person_id, domain) WHERE kind = 'TRUST_DOMAIN';

CREATE INDEX subject_records_trust_domain_evidence_ref_idx
  ON hci.subject_records (tenant_id, evidence_ref_id) WHERE kind = 'TRUST_DOMAIN';

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id,
              epistemic_label, epistemic_verifier_principal_id,
              domain, evidence_ref_id, evidence_ref_kind)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

COMMIT;
