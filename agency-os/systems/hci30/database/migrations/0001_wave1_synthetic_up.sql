CREATE SCHEMA hci;

CREATE TABLE hci.tenants (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE);
CREATE TABLE hci.persons (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), display_label text NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE TABLE hci.tenant_authorizations (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  expires_at timestamptz, UNIQUE (tenant_id, id)
);
CREATE TABLE hci.subject_lawful_basis_records (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), person_id uuid NOT NULL,
  basis text NOT NULL, UNIQUE (tenant_id, person_id, id),
  FOREIGN KEY (tenant_id, person_id) REFERENCES hci.persons(tenant_id, id)
);
CREATE TABLE hci.sources (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), source_ref text NOT NULL, UNIQUE (tenant_id, id));
CREATE TABLE hci.source_terms_records (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), source_id uuid NOT NULL, terms_ref text NOT NULL,
  FOREIGN KEY (tenant_id, source_id) REFERENCES hci.sources(tenant_id, id)
);
CREATE TABLE hci.research_workflows (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), tenant_authorization_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, tenant_authorization_id) REFERENCES hci.tenant_authorizations(tenant_id, id)
);
CREATE FUNCTION hci.require_active_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hci.tenant_authorizations a WHERE a.tenant_id = NEW.tenant_id AND a.id = NEW.tenant_authorization_id AND a.status = 'ACTIVE' AND (a.expires_at IS NULL OR a.expires_at > now())) THEN
    RAISE EXCEPTION 'active tenant authorization is required';
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
  UNIQUE (tenant_id, id)
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
  IF TG_OP = 'INSERT' AND NEW.status <> 'RECEIVED' THEN RAISE EXCEPTION 'data-subject request must start RECEIVED'; END IF;
  IF (OLD.status = 'RECEIVED' AND NEW.status NOT IN ('IN_REVIEW','REJECTED')) OR
     (OLD.status = 'IN_REVIEW' AND NEW.status NOT IN ('RESOLVED','REJECTED')) OR
     OLD.status IN ('RESOLVED','REJECTED') THEN
    RAISE EXCEPTION 'invalid data-subject-request lifecycle transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER data_subject_requests_lifecycle BEFORE INSERT OR UPDATE OF status ON hci.data_subject_requests FOR EACH ROW EXECUTE FUNCTION hci.enforce_dsr_transition();
CREATE TABLE hci.data_subject_request_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), request_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('RECEIVED','REVIEW_STARTED','RESOLVED','REJECTED','CORRECTION_LINEAGE_RECORDED','ERASURE_RECORDED')),
  detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, request_id) REFERENCES hci.data_subject_requests(tenant_id, id)
);
CREATE TABLE hci.data_subject_request_targets (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), request_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('EVIDENCE','CLAIM','ASSESSMENT')), target_id uuid NOT NULL,
  FOREIGN KEY (tenant_id, request_id) REFERENCES hci.data_subject_requests(tenant_id, id),
  FOREIGN KEY (tenant_id, target_id) REFERENCES hci.subject_records(tenant_id, id)
);
CREATE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only table'; END $$;
CREATE TRIGGER dsr_events_append_only BEFORE UPDATE OR DELETE ON hci.data_subject_request_events FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER subject_records_append_only BEFORE UPDATE OR DELETE ON hci.subject_records FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();

CREATE TABLE hci.identity_candidates (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), person_id uuid NOT NULL,
  match_state text NOT NULL DEFAULT 'CANDIDATE' CHECK (match_state IN ('CANDIDATE','MATCH_CONFIRMED')),
  FOREIGN KEY (tenant_id, person_id) REFERENCES hci.persons(tenant_id, id),
  UNIQUE (tenant_id, id)
);
CREATE TABLE hci.identity_verifications (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id), candidate_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('DETERMINISTIC','HUMAN','LLM')), evidence_ref text,
  FOREIGN KEY (tenant_id, candidate_id) REFERENCES hci.identity_candidates(tenant_id, id)
);
CREATE FUNCTION hci.require_identity_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.match_state = 'MATCH_CONFIRMED' AND NOT EXISTS (SELECT 1 FROM hci.identity_verifications v WHERE v.tenant_id = NEW.tenant_id AND v.candidate_id = NEW.id AND v.method IN ('DETERMINISTIC','HUMAN') AND v.evidence_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'MATCH_CONFIRMED requires deterministic or human evidence';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identity_candidates_require_evidence BEFORE INSERT OR UPDATE ON hci.identity_candidates FOR EACH ROW EXECUTE FUNCTION hci.require_identity_verification();

CREATE ROLE hci_app_test_a NOLOGIN NOBYPASSRLS;
CREATE ROLE hci_app_test_b NOLOGIN NOBYPASSRLS;
CREATE TABLE hci.app_tenant_bindings (role_name name PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES hci.tenants(id));
CREATE FUNCTION hci.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = hci, pg_temp AS $$
  SELECT tenant_id
  FROM hci.app_tenant_bindings
  WHERE role_name = COALESCE(NULLIF(current_setting('role', true), 'none'), session_user)
$$;
REVOKE ALL ON FUNCTION hci.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.current_tenant_id() TO hci_app_test_a, hci_app_test_b;
GRANT USAGE ON SCHEMA hci TO hci_app_test_a, hci_app_test_b;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records','research_workflows','subject_records','data_subject_requests','data_subject_request_events','data_subject_request_targets','identity_candidates','identity_verifications'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON hci.%I TO hci_app_test_a, hci_app_test_b', t);
    EXECUTE format('CREATE INDEX %I ON hci.%I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('ALTER TABLE hci.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE hci.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON hci.%I USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id())', t);
  END LOOP;
END $$;
ALTER TABLE hci.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_registry_isolation ON hci.tenants USING (id = hci.current_tenant_id()) WITH CHECK (id = hci.current_tenant_id());
GRANT SELECT ON hci.tenants TO hci_app_test_a, hci_app_test_b;
