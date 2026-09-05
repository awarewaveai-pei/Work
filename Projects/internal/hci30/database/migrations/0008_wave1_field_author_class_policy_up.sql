-- HCI-30 Wave 1 - Field/transition author-class policy (ADR-0019, HD-08).
-- Implements gates 1 (policy doc, wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md,
-- not in this file), 2, 3, 4, and gate 5's human-principal half. Gate 5's
-- epistemic-label half (UNKNOWN/HYPOTHESIS -> SOURCE_FACT promotion redline,
-- NEG-HD08-04) is explicitly NOT built - see the policy document's own
-- Gate cross-reference section for why: unlike the three new concepts this
-- migration DOES introduce, an epistemic-label lifecycle is a broad,
-- semantically-loaded concept referenced by other not-yet-read chapters of
-- this blueprint, and a narrow version now risks a shape that has to be
-- torn out later. Left honestly OPEN rather than built shallow.
--
-- Extends 0001-0007. Must run after all seven, before the fixtures/harness/
-- negative-test files.
--
-- ============================================================================
-- Three new concepts, none backfilled from an existing blueprint spec
-- ============================================================================
-- Gates 3, 4, and 5 (human-principal half) each assume a concept that does
-- not exist anywhere in the v2 blueprint prior to this ADR - confirmed by a
-- targeted search before writing any code, not assumed: a Claim state
-- machine with an "ASSESSMENT_CANDIDATE" value (gate 3), a Decision-to-Claim
-- linking relationship (gate 4), and a human-user/analyst/reviewer entity
-- (gate 5). ADR-0019 introduces the REQUIREMENT for each; it does not
-- specify their shape. What follows is the smallest shape each gate's own
-- text actually requires - claim_state has exactly the two values gate 3
-- needs (not a full Claim lifecycle), hci.decision_claims is a plain
-- tenant-scoped junction table (not a richer evidentiary-basis model),
-- hci.principals is (id, tenant_id, display_name) (not an auth/identity
-- system) - each explicitly flagged in the policy document as provisional,
-- open to being superseded once a future ADR actually specifies these
-- concepts in full.
-- ============================================================================

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
    'data_encryption_keys'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0008; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ============================================================================
-- Gate 2: author_class on hci.subject_records (EVIDENCE/CLAIM/ASSESSMENT;
-- TRUST_DOMAIN excluded, matching gate 2's own table list which does not
-- name it) and hci.decisions. hci.enforce_field_author_class() uses `kind`
-- as the Wave-1 proxy for "field_id/transition" - see the policy document's
-- own gate 2 note for why (no finer-grained field-level tracking exists
-- yet; real payload columns are Wave 4).
-- ============================================================================
ALTER TABLE hci.subject_records
  ADD COLUMN author_class text
    CHECK (author_class IN ('DETERMINISTIC','PROBABILISTIC','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','HUMAN_ONLY')),
  ADD CONSTRAINT subject_records_author_class_required
    CHECK (kind = 'TRUST_DOMAIN' OR author_class IS NOT NULL);

ALTER TABLE hci.decisions
  ADD COLUMN author_class text NOT NULL
    CHECK (author_class IN ('DETERMINISTIC','PROBABILISTIC','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','HUMAN_ONLY'));

CREATE FUNCTION hci.enforce_field_author_class() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'subject_records' THEN
    IF NEW.kind = 'EVIDENCE' AND NEW.author_class <> 'DETERMINISTIC' THEN
      RAISE EXCEPTION USING ERRCODE = 'H1013',
        MESSAGE = 'EVIDENCE requires author_class=DETERMINISTIC (wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md)';
    ELSIF NEW.kind = 'CLAIM' AND NEW.author_class NOT IN ('LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','HUMAN_ONLY') THEN
      RAISE EXCEPTION USING ERRCODE = 'H1013',
        MESSAGE = 'CLAIM requires author_class in (LLM_ASSISTED_HUMAN_REVIEW_REQUIRED, HUMAN_ONLY)';
    ELSIF NEW.kind = 'ASSESSMENT' AND NEW.author_class NOT IN ('PROBABILISTIC','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','HUMAN_ONLY') THEN
      RAISE EXCEPTION USING ERRCODE = 'H1013',
        MESSAGE = 'ASSESSMENT requires author_class in (PROBABILISTIC, LLM_ASSISTED_HUMAN_REVIEW_REQUIRED, HUMAN_ONLY)';
    END IF;
  ELSIF TG_TABLE_NAME = 'decisions' THEN
    IF NEW.author_class <> 'HUMAN_ONLY' THEN
      RAISE EXCEPTION USING ERRCODE = 'H1013', MESSAGE = 'hci.decisions requires author_class=HUMAN_ONLY';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER subject_records_author_class BEFORE INSERT ON hci.subject_records
  FOR EACH ROW EXECUTE FUNCTION hci.enforce_field_author_class();
CREATE TRIGGER decisions_author_class BEFORE INSERT ON hci.decisions
  FOR EACH ROW EXECUTE FUNCTION hci.enforce_field_author_class();

-- ============================================================================
-- Gate 3: claim_state + human_spotcheck_status, both CLAIM-scoped.
-- "Transition to ASSESSMENT_CANDIDATE" is a NEW ROW via the existing
-- bitemporal supersession mechanism (ADR-0017), not an UPDATE - subject_records
-- is unconditionally append-only, so a state "transition" that must survive
-- that design has to be a new superseding row, exactly like a corrected
-- Evidence/Claim already is. This needed no new escape-hatch shape clause:
-- the check is a plain BEFORE INSERT validation, evaluated once, at the
-- moment the new (superseding or standalone) row is created.
-- ============================================================================
ALTER TABLE hci.subject_records
  ADD COLUMN claim_state text CHECK (claim_state IN ('DRAFT','ASSESSMENT_CANDIDATE')),
  ADD COLUMN human_spotcheck_status text CHECK (human_spotcheck_status IN ('PENDING','APPROVED','REJECTED')),
  ADD CONSTRAINT subject_records_claim_state_scoped CHECK (kind = 'CLAIM' OR claim_state IS NULL),
  ADD CONSTRAINT subject_records_claim_state_required CHECK (kind <> 'CLAIM' OR claim_state IS NOT NULL),
  ADD CONSTRAINT subject_records_spotcheck_scoped CHECK (kind = 'CLAIM' OR human_spotcheck_status IS NULL),
  ADD CONSTRAINT subject_records_spotcheck_required CHECK (kind <> 'CLAIM' OR human_spotcheck_status IS NOT NULL);

CREATE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_predecessor_reaudit boolean;
BEGIN
  -- reaudit_required's default cannot be a plain column DEFAULT (real-Docker
  -- correction: a column DEFAULT cannot be conditional on another column of
  -- the same row - `DEFAULT false` unconditionally would have given every
  -- EVIDENCE/ASSESSMENT/TRUST_DOMAIN row `false` instead of the NULL
  -- subject_records_reaudit_scoped requires, breaking every existing
  -- non-CLAIM insert in the suite the instant this migration ran). Set here
  -- instead, in the one BEFORE INSERT trigger that already fires
  -- unconditionally on every subject_records row and already knows `kind`.
  --
  -- db-expert review (2026-09-05, C2): a CORRECTING/SUPERSEDING row must
  -- inherit its predecessor's reaudit_required rather than unconditionally
  -- defaulting false - otherwise the gate 4 flag is defeated by two ordinary
  -- app-role INSERTs (flag a Claim, then INSERT a successor with
  -- supersedes_id pointing at it), with no re-audit ever having actually
  -- happened. A standalone (non-superseding) Claim still defaults false.
  IF NEW.kind = 'CLAIM' AND NEW.reaudit_required IS NULL THEN
    IF NEW.supersedes_id IS NOT NULL THEN
      SELECT reaudit_required INTO v_predecessor_reaudit
        FROM hci.subject_records
       WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id;
      NEW.reaudit_required := COALESCE(v_predecessor_reaudit, false);
    ELSE
      NEW.reaudit_required := false;
    END IF;
  END IF;

  -- Evaluated independent of the linked Case's risk_tier, per ADR-0019's
  -- "Additionally" paragraph: every AI-generated claim requires a human
  -- spot-check before admission as an Assessment Candidate, regardless of
  -- tier (including R0) - there is no risk_tier branch in this check at all.
  IF NEW.kind = 'CLAIM' AND NEW.claim_state = 'ASSESSMENT_CANDIDATE'
     AND NEW.human_spotcheck_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION USING ERRCODE = 'H1014',
      MESSAGE = 'ASSESSMENT_CANDIDATE requires human_spotcheck_status=APPROVED, independent of case risk_tier';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subject_records_claim_state_admission BEFORE INSERT ON hci.subject_records
  FOR EACH ROW EXECUTE FUNCTION hci.enforce_claim_state_admission();

-- ============================================================================
-- Gate 4: reaudit_required + risk-tier elevation cascade + Decision-linking
-- gate. reaudit_required is a THIRD column needing the same effect-based
-- escape-hatch shape clause as system_superseded_at (ADR-0017) and
-- tombstoned_at (ADR-0018) - hci.reject_update_delete() gains one more,
-- structurally identical branch, not a new mechanism.
-- ============================================================================
ALTER TABLE hci.subject_records
  ADD COLUMN reaudit_required boolean,
  ADD CONSTRAINT subject_records_reaudit_scoped CHECK (kind = 'CLAIM' OR reaudit_required IS NULL),
  ADD CONSTRAINT subject_records_reaudit_required_default CHECK (kind <> 'CLAIM' OR reaudit_required IS NOT NULL);

CREATE OR REPLACE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o jsonb; n jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    IF o ? 'system_superseded_at'
       AND o->>'system_superseded_at' IS NULL
       AND n->>'system_superseded_at' IS NOT NULL
       AND (o - 'system_superseded_at') = (n - 'system_superseded_at')
       AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER')
    THEN
      RETURN NEW;
    END IF;
    IF o ? 'tombstoned_at'
       AND o->>'tombstoned_at' IS NULL
       AND n->>'tombstoned_at' IS NOT NULL
       AND (o - 'tombstoned_at') = (n - 'tombstoned_at')
       AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER')
    THEN
      RETURN NEW;
    END IF;
    IF o ? 'reaudit_required'
       AND o->>'reaudit_required' = 'false'
       AND n->>'reaudit_required' = 'true'
       AND (o - 'reaudit_required') = (n - 'reaudit_required')
       AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER')
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'H1003',
    MESSAGE = format('%s.%s is append-only (%s rejected)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP);
END $$;

-- Fires on hci.cases (AFTER UPDATE, not BEFORE - this is a side effect into
-- a DIFFERENT table, the same reason mark_superseded()/tombstone_evidence()
-- are AFTER-triggers-or-directly-called rather than BEFORE). SECURITY
-- DEFINER for the same reason those two are: it must reach subject_records
-- rows regardless of whether the role updating hci.cases.risk_tier holds
-- any subject_records grant at all. Wave-1 simplification, stated not
-- hidden: flags every linked Claim unconditionally on any tier increase,
-- rather than differentiating by AI LEGO's actual mandatory-gates.yaml rule
-- set per tier (that file lives in a different product's schema registry
-- and this synthetic schema has no live reference to it) - a conservative
-- over-flag, not an under-flag, so it cannot silently admit a claim that
-- should have been re-audited.
CREATE FUNCTION hci.flag_claims_on_risk_elevation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $$
DECLARE v_old_rank int; v_new_rank int; v_conflict text;
BEGIN
  v_old_rank := array_position(ARRAY['R0','R1','R2','R3','R4'], OLD.risk_tier);
  v_new_rank := array_position(ARRAY['R0','R1','R2','R3','R4'], NEW.risk_tier);
  -- db-expert review (2026-09-05, M1): fail closed, not open, on a risk_tier
  -- value this function's hardcoded rank array does not know - matching the
  -- lesson 0002's own require_open_or_active_case() already learned for
  -- unknown status values. Currently unreachable via any legal input
  -- (hci.cases.risk_tier's own CHECK limits it to R0-R4), so this is
  -- defense-in-depth against a future tier being added to that CHECK
  -- without this array being updated to match - same disposition as H1012
  -- (reserved, not raised by any current input).
  IF v_old_rank IS NULL OR v_new_rank IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1018',
      MESSAGE = format('unrecognized risk_tier in elevation rank comparison (old=%s, new=%s)', OLD.risk_tier, NEW.risk_tier);
  END IF;
  IF v_new_rank > v_old_rank THEN
    -- db-expert review (2026-09-05, C3): before flagging, check whether any
    -- about-to-be-flagged Claim is ALREADY linked to a PROCEED/
    -- PROCEED_WITH_CONTROLS/EXIT decision - gate 4's own trigger
    -- (enforce_decision_reaudit_gate) only guards the elevate-then-link
    -- order; link-then-elevate was previously unguarded in either
    -- direction. An append-only decision_claims link cannot be withdrawn
    -- once written, so the only schema-level response available here is to
    -- reject the elevation itself, surfacing the conflict for human
    -- handling rather than silently recording a tier change that leaves an
    -- already-decided PROCEED standing on a now-flagged Claim.
    SELECT sr.id INTO v_conflict
      FROM hci.subject_records sr
      JOIN hci.decision_claims dc ON dc.tenant_id = sr.tenant_id AND dc.claim_id = sr.id
      JOIN hci.decisions d ON d.tenant_id = dc.tenant_id AND d.id = dc.decision_id
     WHERE sr.tenant_id = NEW.tenant_id AND sr.case_id = NEW.id AND sr.kind = 'CLAIM'
       AND sr.reaudit_required = false
       AND sr.system_superseded_at IS NULL AND sr.tombstoned_at IS NULL
       AND d.outcome IN ('PROCEED','PROCEED_WITH_CONTROLS','EXIT')
     LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'H1017',
        MESSAGE = format('risk_tier elevation on case %s would retroactively flag Claim %s, which is already linked to a PROCEED/PROCEED_WITH_CONTROLS/EXIT decision - resolve out of band before recording this tier change', NEW.id, v_conflict);
    END IF;
    -- Excludes already-superseded/tombstoned rows (db-expert review, M3):
    -- those are closed ledger entries under ADR-0017's bitemporal design,
    -- and flagging one after the fact would report a state for it that did
    -- not exist at the time any as_of() reconstruction reads it back.
    UPDATE hci.subject_records SET reaudit_required = true
     WHERE tenant_id = NEW.tenant_id AND case_id = NEW.id AND kind = 'CLAIM' AND reaudit_required = false
       AND system_superseded_at IS NULL AND tombstoned_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hci.flag_claims_on_risk_elevation() FROM PUBLIC;
CREATE TRIGGER cases_flag_claims_on_risk_elevation AFTER UPDATE ON hci.cases
  FOR EACH ROW WHEN (NEW.risk_tier IS DISTINCT FROM OLD.risk_tier) EXECUTE FUNCTION hci.flag_claims_on_risk_elevation();

-- hci.decisions has no "linked claims" column of its own - hci.decision_claims
-- is the minimal junction table gate 4 requires. Append-only (matching this
-- schema's audit-trail convention: which evidence informed a decision is
-- itself a fact that must not be editable after the fact), tenant-scoped,
-- typed FK into subject_records pinned to kind='CLAIM' (mirrors the
-- data_subject_request_targets / source_relationships typed-FK pattern).
CREATE TABLE hci.decision_claims (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  decision_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  claim_kind text NOT NULL DEFAULT 'CLAIM' CHECK (claim_kind = 'CLAIM'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, decision_id) REFERENCES hci.decisions(tenant_id, id),
  FOREIGN KEY (tenant_id, claim_id, claim_kind) REFERENCES hci.subject_records(tenant_id, id, kind),
  UNIQUE (tenant_id, decision_id, claim_id)
);

-- Decisions must exist before a link can reference them (FK), so by the
-- time a decision_claims row is inserted the decision's own outcome is
-- already fixed - checking at link-insert time is equivalent in effect to
-- "reject recording a Decision while a linked Claim carries
-- reaudit_required" (gate 4's literal wording), since gate 4's own text
-- gives hci.decisions no linked-claims column to check a single-row CHECK
-- against; a cross-table condition needs a trigger regardless of which
-- table it is attached to.
-- SECURITY DEFINER (real-Docker correction, 2026-09-05): `SELECT ... FOR
-- SHARE` requires UPDATE privilege on the locked table, not merely SELECT -
-- confirmed empirically (a plain SELECT succeeds under hci_app_test_a, the
-- identical query with FOR SHARE raises 42501). The application role
-- deliberately has no UPDATE grant on hci.subject_records at all (it is
-- append-only), so a SECURITY INVOKER version of this trigger would make
-- linking ANY Claim to ANY Decision impossible for the real application
-- role the moment the FOR SHARE lock (added for C3, below) was introduced -
-- every test that exercises this trigger up to that point had run under the
-- owner role, which bypasses the privilege check as a superuser, and so
-- never caught it. Matches hci.flag_claims_on_risk_elevation()'s own
-- SECURITY DEFINER + REVOKE ALL FROM PUBLIC posture, for the same reason:
-- reaching subject_records with more than the invoking role's own grants.
CREATE FUNCTION hci.enforce_decision_reaudit_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $$
DECLARE v_outcome text; v_reaudit boolean; v_claim_state text; v_spotcheck text;
BEGIN
  SELECT outcome INTO v_outcome FROM hci.decisions WHERE tenant_id = NEW.tenant_id AND id = NEW.decision_id;
  -- FOR SHARE (db-expert review, 2026-09-05, C3): locks the Claim row for the
  -- duration of this transaction so a concurrent risk-tier elevation
  -- (hci.flag_claims_on_risk_elevation's UPDATE into this same row) cannot
  -- commit between this SELECT and this trigger's own commit - without it,
  -- two concurrent transactions (one linking this Claim, one elevating its
  -- case) could each read reaudit_required=false and both commit, leaving
  -- an elevated-but-unflagged Claim linked to a restrictive Decision with
  -- neither gate having actually fired against the other's effect.
  SELECT reaudit_required, claim_state, human_spotcheck_status
    INTO v_reaudit, v_claim_state, v_spotcheck
    FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.claim_id
    FOR SHARE;
  -- db-expert review (2026-09-05, C1): gate 3's ASSESSMENT_CANDIDATE/
  -- human_spotcheck_status state machine had no downstream consumer - a
  -- DRAFT or not-yet-spot-checked Claim could be linked to a Decision
  -- without ever passing gate 3's own admission check. This is that
  -- consumer: only a Claim actually admitted as an approved Assessment
  -- Candidate may be cited as a Decision's basis at all, independent of
  -- reaudit_required.
  IF v_claim_state IS DISTINCT FROM 'ASSESSMENT_CANDIDATE' OR v_spotcheck IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION USING ERRCODE = 'H1016',
      MESSAGE = 'a Claim may only be linked to a Decision once admitted as an approved Assessment Candidate (claim_state=ASSESSMENT_CANDIDATE, human_spotcheck_status=APPROVED)';
  END IF;
  IF v_outcome IN ('PROCEED','PROCEED_WITH_CONTROLS','EXIT') AND v_reaudit IS TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'H1015',
      MESSAGE = 'cannot link a reaudit-required Claim to a PROCEED/PROCEED_WITH_CONTROLS/EXIT decision';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hci.enforce_decision_reaudit_gate() FROM PUBLIC;
CREATE TRIGGER decision_claims_reaudit_gate BEFORE INSERT ON hci.decision_claims
  FOR EACH ROW EXECUTE FUNCTION hci.enforce_decision_reaudit_gate();

-- created_at withheld from the INSERT grant (db-expert review, 2026-09-05,
-- M2): table-level INSERT would have made decision_claims the one
-- append-only ledger in this schema whose own insertion timestamp the
-- audited party could choose - matching the withholding already applied to
-- data_subject_request_events (0001), the eleven scope-fence tables (0006),
-- and hci.principals (this file, above).
GRANT SELECT ON hci.decision_claims TO hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, decision_id, claim_id) ON hci.decision_claims TO hci_app_test_a, hci_app_test_b;
REVOKE UPDATE, DELETE ON hci.decision_claims FROM hci_app_test_a, hci_app_test_b;
CREATE TRIGGER decision_claims_append_only BEFORE UPDATE OR DELETE ON hci.decision_claims
  FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER decision_claims_no_truncate BEFORE TRUNCATE ON hci.decision_claims
  FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();
CREATE INDEX decision_claims_tenant_idx ON hci.decision_claims (tenant_id);
CREATE INDEX decision_claims_decision_idx ON hci.decision_claims (tenant_id, decision_id);
CREATE INDEX decision_claims_claim_idx ON hci.decision_claims (tenant_id, claim_id);
ALTER TABLE hci.decision_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.decision_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.decision_claims USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

-- ============================================================================
-- Gate 5 (human-principal half only - see file header for the epistemic-
-- label half's deferral). hci.principals is full-CRUD (persons' own "ELSE"
-- category, 0001), not append-only: a human principal's display name is
-- plausibly correctable without needing an audit-trail lineage the way
-- evidentiary content does. Built with created_at from the start (unlike
-- the 11 tables 0006 had to retrofit) since this table never existed
-- without it.
-- ============================================================================
CREATE TABLE hci.principals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON hci.principals TO hci_app_test_a, hci_app_test_b;
REVOKE INSERT, UPDATE ON hci.principals FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, display_name) ON hci.principals TO hci_app_test_a, hci_app_test_b;
GRANT UPDATE (display_name) ON hci.principals TO hci_app_test_a, hci_app_test_b;
CREATE TRIGGER principals_tenant_immutable BEFORE UPDATE ON hci.principals
  FOR EACH ROW EXECUTE FUNCTION hci.reject_tenant_change();
CREATE INDEX principals_tenant_idx ON hci.principals (tenant_id);
ALTER TABLE hci.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.principals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.principals USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

-- hci.decisions.principal_id: NOT NULL, tenant-scoped FK. Omitting it at
-- INSERT gets 23502 (not-null violation); the application role's INSERT
-- grant includes it below since a decision cannot be recorded without one.
ALTER TABLE hci.decisions
  ADD COLUMN principal_id uuid NOT NULL,
  ADD CONSTRAINT decisions_principal_fk FOREIGN KEY (tenant_id, principal_id) REFERENCES hci.principals(tenant_id, id);

-- Widen both tables' INSERT grants for the columns this migration adds that
-- the application role must supply at insert time (author_class,
-- claim_state, human_spotcheck_status, principal_id). reaudit_required is
-- deliberately excluded - system-managed only, matching
-- system_superseded_at/tombstoned_at's own exclusion; a row must never be
-- born already flagged for reaudit.
REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

REVOKE INSERT ON hci.decisions FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, case_id, outcome, rationale, valid_from, valid_to,
              supersedes_id, corrected_reason, author_class, principal_id)
  ON hci.decisions TO hci_app_test_a, hci_app_test_b;

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
    RAISE EXCEPTION 'hci table inventory drift after 0008; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
