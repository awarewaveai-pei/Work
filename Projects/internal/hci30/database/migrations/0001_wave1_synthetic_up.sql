-- HCI-30 Wave 1 - synthetic-only schema (isolated local test skeleton).
--
-- ============================================================================
-- Domain error-code registry (SSOT for this schema)
-- ============================================================================
-- Every domain rule below raises a stable, semantic SQLSTATE instead of a bare
-- RAISE EXCEPTION. Two independent reasons, both load-bearing:
--
--   1. Application layer. A caller that must distinguish "authorization is not
--      active" from "lifecycle transition rejected" by matching English message
--      text is not maintainable for 30 years: the text is not a contract, and
--      rewording or translating a message silently breaks the caller.
--
--   2. Test integrity. A bare RAISE EXCEPTION is SQLSTATE P0001
--      (raise_exception). When a negative test's own assertion is also P0001,
--      a handler written as "WHEN raise_exception" catches the control's
--      rejection AND the assertion failure identically, so the test passes
--      whether or not the control works. Distinct codes make that class of
--      silent-pass structurally impossible.
--
-- Class 'H1' is unassigned in PostgreSQL Appendix A (HV = FDW-specific,
-- HZ = SQL/MED remote database access; H1 is free), so these never collide
-- with an engine-raised condition.
--
-- 2026-09-05: this file's own list below stopped being the growing SSOT the
-- moment a second migration (0002) started allocating codes independently -
-- exactly that independence produced two real, separately-discovered
-- collisions (ADR-0012/ADR-0017 both landed on H1008; ADR-0018/ADR-0020 both
-- landed on H1009). The list below is frozen as a historical record of what
-- this specific file's own content raises (H1001-H1007, all still accurate);
-- the canonical, growing, cross-migration list - including H1008 onward -
-- is now database/ERROR_CODE_REGISTRY.md. Allocate new codes there, not here.
--
--   H1001  tenant authorization is not ACTIVE / not currently valid
--   H1002  data-subject-request lifecycle transition rejected
--   H1003  append-only table mutation rejected (trigger layer)
--   H1004  MATCH_CONFIRMED requires deterministic or human evidence
--   H1005  last supporting evidence for a MATCH_CONFIRMED identity may not be removed
--   H1006  tenant_id is immutable
--   H1007  field is immutable in the row's current state
--
-- ============================================================================
-- Field mutability matrix (SSOT - triggers and grants below are derived from
-- this, not written per-case)
-- ============================================================================
-- The gates in the first version each guarded the moment a state was asserted
-- and nothing guarded what could still be changed afterwards. That is one
-- missing invariant, not four separate bugs, so it is stated once here.
--
--   table                        field                  mutable when
--   ---------------------------  ---------------------  ----------------------
--   (every tenant-owned table)   tenant_id              never
--   identity_candidates          person_id              only while CANDIDATE
--   identity_candidates          match_state            per evidence gate; a
--                                                       downgrade to CANDIDATE
--                                                       stays allowed so it is
--                                                       a visible action
--   data_subject_requests        person_id, request_type only while RECEIVED
--   data_subject_requests        status                 per lifecycle FSM
--   data_subject_requests        (row)                  never deleted
--   data_subject_request_targets (row)                  never deleted
--   data_subject_request_events  (row)                  never changed/deleted
--   data_subject_request_events  created_at             server-assigned only
--   subject_records              (row)                  never changed/deleted
--
-- Free-text columns that carry evidentiary weight are additionally required to
-- be non-blank: 'HUMAN' verification with evidence_ref = '' satisfied
-- IS NOT NULL and opened the HD-04 gate on nothing.
--
-- 'H1TST' is reserved for the test-harness sentinel
-- (database/tests/00_test_harness.sql) and must never be raised by schema logic.
--
-- Scope guard: synthetic only. No host port, no production configuration, no
-- portal integration, no real-person fixture, no deployment path. Passing these
-- tests is not a claim of legal compliance or production readiness.
-- ============================================================================

CREATE SCHEMA hci;

CREATE TABLE hci.tenants (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE);
CREATE TABLE hci.persons (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), display_label text NOT NULL CHECK (length(btrim(display_label)) > 0),
  UNIQUE (tenant_id, id)
);
CREATE TABLE hci.tenant_authorizations (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  expires_at timestamptz, UNIQUE (tenant_id, id)
);
CREATE TABLE hci.subject_lawful_basis_records (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), person_id uuid NOT NULL,
  basis text NOT NULL CHECK (length(btrim(basis)) > 0), UNIQUE (tenant_id, person_id, id),
  FOREIGN KEY (tenant_id, person_id) REFERENCES hci.persons(tenant_id, id)
);
CREATE TABLE hci.sources (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0), UNIQUE (tenant_id, id));
CREATE TABLE hci.source_terms_records (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), source_id uuid NOT NULL, terms_ref text NOT NULL CHECK (length(btrim(terms_ref)) > 0),
  FOREIGN KEY (tenant_id, source_id) REFERENCES hci.sources(tenant_id, id)
);
CREATE TABLE hci.research_workflows (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), tenant_authorization_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, tenant_authorization_id) REFERENCES hci.tenant_authorizations(tenant_id, id)
);

-- CONSENT-NEG-04. Guards the START of new work only. Revoking an authorization
-- afterwards is deliberately NOT blocked and deliberately does NOT retroactively
-- alter existing rows: revocation must always remain possible, and an existing
-- workflow row is a historical record of work already begun. Both halves of that
-- statement are asserted in the negative-test suite so the behaviour cannot
-- drift silently.
CREATE FUNCTION hci.require_active_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hci.tenant_authorizations a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.id = NEW.tenant_authorization_id
      AND a.status = 'ACTIVE'
      AND (a.expires_at IS NULL OR a.expires_at > now())
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'active tenant authorization is required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_workflows_require_active_authorization BEFORE INSERT OR UPDATE ON hci.research_workflows FOR EACH ROW EXECUTE FUNCTION hci.require_active_authorization();

CREATE TABLE hci.subject_records (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), person_id uuid NOT NULL,
  subject_type text NOT NULL DEFAULT 'PERSON' CHECK (subject_type = 'PERSON'), subject_id uuid,
  kind text NOT NULL CHECK (kind IN ('EVIDENCE','CLAIM','ASSESSMENT','TRUST_DOMAIN')),
  CHECK (subject_id IS NULL OR subject_id = person_id),
  FOREIGN KEY (tenant_id, person_id) REFERENCES hci.persons(tenant_id, id),
  UNIQUE (tenant_id, id),
  -- Required so a referencing row can constrain the KIND it points at, not
  -- merely the identity. See hci.data_subject_request_targets below.
  UNIQUE (tenant_id, id, kind)
);
CREATE TABLE hci.data_subject_requests (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), person_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('ACCESS','CORRECTION','DISPUTE','DELETION')),
  status text NOT NULL CHECK (status IN ('RECEIVED','IN_REVIEW','RESOLVED','REJECTED')),
  FOREIGN KEY (tenant_id, person_id) REFERENCES hci.persons(tenant_id, id),
  UNIQUE (tenant_id, id)
);
CREATE FUNCTION hci.enforce_dsr_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'RECEIVED' THEN
      RAISE EXCEPTION USING ERRCODE = 'H1002', MESSAGE = 'data-subject request must start RECEIVED';
    END IF;
    -- Explicit return. OLD is not a meaningful record on INSERT, so the
    -- transition logic below must never be reachable from this branch.
    RETURN NEW;
  END IF;
  -- What the request is ABOUT is settled once review starts. Guarding only the
  -- status column let a resolved ACCESS request be rewritten into a DELETION
  -- request afterwards, with no lifecycle event recording the change.
  IF OLD.status <> 'RECEIVED'
     AND (NEW.person_id <> OLD.person_id OR NEW.request_type <> OLD.request_type) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1007',
      MESSAGE = 'person_id and request_type are immutable once review has started';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'RECEIVED'  AND NEW.status NOT IN ('IN_REVIEW','REJECTED')) OR
       (OLD.status = 'IN_REVIEW' AND NEW.status NOT IN ('RESOLVED','REJECTED')) OR
       OLD.status IN ('RESOLVED','REJECTED') THEN
      RAISE EXCEPTION USING ERRCODE = 'H1002', MESSAGE = 'invalid data-subject-request lifecycle transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- Deliberately not 'UPDATE OF status': the trigger must see every UPDATE, or
-- the columns it does not name become an unguarded write path.
CREATE TRIGGER data_subject_requests_lifecycle BEFORE INSERT OR UPDATE ON hci.data_subject_requests FOR EACH ROW EXECUTE FUNCTION hci.enforce_dsr_transition();
CREATE TABLE hci.data_subject_request_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), request_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('RECEIVED','REVIEW_STARTED','RESOLVED','REJECTED','CORRECTION_LINEAGE_RECORDED','ERASURE_RECORDED')),
  detail text NOT NULL CHECK (length(btrim(detail)) > 0), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, request_id) REFERENCES hci.data_subject_requests(tenant_id, id)
);
CREATE TABLE hci.data_subject_request_targets (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), request_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('EVIDENCE','CLAIM','ASSESSMENT')), target_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, request_id) REFERENCES hci.data_subject_requests(tenant_id, id),
  -- Typed reference: the referenced subject_record's own kind must equal
  -- target_kind, so an 'EVIDENCE' target can never point at a TRUST_DOMAIN row.
  FOREIGN KEY (tenant_id, target_id, target_kind) REFERENCES hci.subject_records(tenant_id, id, kind)
);
CREATE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'H1003',
    MESSAGE = format('%s.%s is append-only (%s rejected)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP);
END $$;

-- tenant_id is the tenant boundary itself. A row that can change tenants can
-- move data across the boundary RLS exists to enforce, so it is immutable on
-- every tenant-owned table rather than on the tables someone remembered.
CREATE FUNCTION hci.reject_tenant_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION USING ERRCODE = 'H1006', MESSAGE = 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE hci.identity_candidates (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), person_id uuid NOT NULL,
  match_state text NOT NULL DEFAULT 'CANDIDATE' CHECK (match_state IN ('CANDIDATE','MATCH_CONFIRMED')),
  FOREIGN KEY (tenant_id, person_id) REFERENCES hci.persons(tenant_id, id),
  UNIQUE (tenant_id, id)
);
CREATE TABLE hci.identity_verifications (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), candidate_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('DETERMINISTIC','HUMAN','LLM')),
  -- Blank is not evidence. IS NOT NULL alone let '' open the HD-04 gate.
  evidence_ref text CHECK (evidence_ref IS NULL OR length(btrim(evidence_ref)) > 0),
  FOREIGN KEY (tenant_id, candidate_id) REFERENCES hci.identity_candidates(tenant_id, id)
);

-- HD-04 admission gate, guarded on BOTH sides of the cross-row invariant.
-- Guarding only the asserting row is not enough: an invariant of the form
-- "this state is justified by rows over there" is violated just as easily by
-- removing the justification as by asserting the state without it.
CREATE FUNCTION hci.require_identity_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Confirming a match binds specific evidence to a specific person. Leaving
  -- person_id writable afterwards allowed the end state the gate exists to
  -- prevent: a person marked MATCH_CONFIRMED while every supporting evidence
  -- row was gathered about someone else. Repointing now requires an explicit,
  -- visible downgrade to CANDIDATE first.
  IF TG_OP = 'UPDATE' AND OLD.match_state = 'MATCH_CONFIRMED'
     AND NEW.person_id <> OLD.person_id THEN
    RAISE EXCEPTION USING ERRCODE = 'H1007',
      MESSAGE = 'person_id is immutable once MATCH_CONFIRMED; downgrade to CANDIDATE first';
  END IF;

  IF NEW.match_state = 'MATCH_CONFIRMED' AND NOT EXISTS (
    SELECT 1 FROM hci.identity_verifications v
    WHERE v.tenant_id = NEW.tenant_id AND v.candidate_id = NEW.id
      AND v.method IN ('DETERMINISTIC','HUMAN') AND v.evidence_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1004', MESSAGE = 'MATCH_CONFIRMED requires deterministic or human evidence';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identity_candidates_require_evidence BEFORE INSERT OR UPDATE ON hci.identity_candidates FOR EACH ROW EXECUTE FUNCTION hci.require_identity_verification();

CREATE FUNCTION hci.protect_identity_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- An UPDATE that leaves this row attached to the same candidate and still
  -- qualifying cannot weaken the invariant, so allow it cheaply.
  IF TG_OP = 'UPDATE'
     AND NEW.tenant_id = OLD.tenant_id
     AND NEW.candidate_id = OLD.candidate_id
     AND NEW.method IN ('DETERMINISTIC','HUMAN')
     AND NEW.evidence_ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
       SELECT 1 FROM hci.identity_candidates c
       WHERE c.tenant_id = OLD.tenant_id AND c.id = OLD.candidate_id
         AND c.match_state = 'MATCH_CONFIRMED'
     ) AND NOT EXISTS (
       SELECT 1 FROM hci.identity_verifications v
       WHERE v.tenant_id = OLD.tenant_id AND v.candidate_id = OLD.candidate_id
         AND v.id <> OLD.id
         AND v.method IN ('DETERMINISTIC','HUMAN') AND v.evidence_ref IS NOT NULL
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1005',
      MESSAGE = 'cannot remove the last supporting evidence for a MATCH_CONFIRMED identity';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identity_verifications_protect_evidence BEFORE UPDATE OR DELETE ON hci.identity_verifications FOR EACH ROW EXECUTE FUNCTION hci.protect_identity_evidence();

CREATE ROLE hci_app_test_a NOLOGIN NOBYPASSRLS;
CREATE ROLE hci_app_test_b NOLOGIN NOBYPASSRLS;
CREATE TABLE hci.app_tenant_bindings (role_name name PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id));
-- Deliberately NOT granted to the application roles: a tenant must never be
-- able to read or rewrite the mapping that decides which tenant it is.
CREATE FUNCTION hci.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hci, pg_temp AS $$
  SELECT tenant_id
  FROM hci.app_tenant_bindings
  WHERE role_name = COALESCE(NULLIF(current_setting('role', true), 'none'), session_user)
$$;
REVOKE ALL ON FUNCTION hci.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.current_tenant_id() TO hci_app_test_a, hci_app_test_b;
GRANT USAGE ON SCHEMA hci TO hci_app_test_a, hci_app_test_b;

-- ============================================================================
-- Tenant isolation + append-only enforcement, driven by two declarative lists.
--
-- Adding a table to append_only gives it BOTH layers automatically: the grant
-- layer (the role never holds UPDATE/DELETE at all) and the trigger layer (the
-- mutation is rejected even for a connection whose privileges bypass grants,
-- e.g. the table owner or a break-glass superuser session). This expresses the
-- two-layer requirement in
-- agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130
-- once, as data, instead of restating it per table.
-- ============================================================================
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications'
  ];
  -- Never changed, never deleted.
  append_only text[] := ARRAY['subject_records','data_subject_request_events'];
  -- Updatable under domain rules, but never deleted: withdrawing a data-subject
  -- request is a REJECTED transition plus an event, not the disappearance of
  -- the record that someone asked at all.
  no_delete   text[] := ARRAY['data_subject_requests','data_subject_request_targets'];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF t = ANY (append_only) THEN
      EXECUTE format('GRANT SELECT, INSERT ON hci.%I TO hci_app_test_a, hci_app_test_b', t);
      EXECUTE format('REVOKE UPDATE, DELETE ON hci.%I FROM hci_app_test_a, hci_app_test_b', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON hci.%I FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete()', t || '_append_only', t);
    ELSIF t = ANY (no_delete) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON hci.%I TO hci_app_test_a, hci_app_test_b', t);
      EXECUTE format('REVOKE DELETE ON hci.%I FROM hci_app_test_a, hci_app_test_b', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON hci.%I FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete()', t || '_no_delete', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON hci.%I FOR EACH ROW EXECUTE FUNCTION hci.reject_tenant_change()', t || '_tenant_immutable', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON hci.%I TO hci_app_test_a, hci_app_test_b', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON hci.%I FOR EACH ROW EXECUTE FUNCTION hci.reject_tenant_change()', t || '_tenant_immutable', t);
    END IF;

    -- Row-level triggers do not fire for TRUNCATE, and TRUNCATE is a separate
    -- privilege. Without this a break-glass owner session empties a compliance
    -- ledger in one statement with neither layer reacting - and the trigger
    -- layer exists precisely for connections whose privileges bypass grants.
    IF t = ANY (append_only) OR t = ANY (no_delete) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON hci.%I FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete()', t || '_no_truncate', t);
    END IF;

    EXECUTE format('CREATE INDEX %I ON hci.%I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('ALTER TABLE hci.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE hci.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON hci.%I USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id())', t);
  END LOOP;
END $$;

-- created_at must be server-assigned. A ledger whose timestamps the audited
-- party can choose proves no ordering at all, so the privilege to write that
-- column is withheld at the grant layer rather than corrected by a trigger.
REVOKE INSERT ON hci.data_subject_request_events FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, request_id, event_type, detail) ON hci.data_subject_request_events TO hci_app_test_a, hci_app_test_b;

-- The lists above are hand-maintained, so drift is caught here at migration
-- time instead of surfacing later as a table that silently has no RLS.
DO $$
DECLARE actual text[]; expected text[];
BEGIN
  -- Both sides collate as "C": pg_class.relname is type 'name' while the
  -- literal list is text, and the database collation orders '_' differently
  -- from the C locale, which would report drift that does not exist.
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'hci' AND c.relkind = 'r';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO expected FROM unnest(ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications',
    'tenants','app_tenant_bindings'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

ALTER TABLE hci.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_registry_isolation ON hci.tenants USING (id = hci.current_tenant_id()) WITH CHECK (id = hci.current_tenant_id());
GRANT SELECT ON hci.tenants TO hci_app_test_a, hci_app_test_b;
