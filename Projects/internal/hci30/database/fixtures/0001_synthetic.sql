-- Explicit column list (2026-09-05 db-expert review, ADR-0012's regulatory
-- market scope): the bare positional form still worked once 'jurisdiction'
-- became the table's third column (it is DEFAULT 'US'), but for the file
-- whose entire subject is jurisdiction scoping, "these are US-jurisdiction
-- tenants" should be a stated fact, not an implicit default - and an
-- explicit column list survives the next ADD COLUMN without silently
-- reordering.
INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES
  ('11111111-1111-1111-1111-111111111111','tenant-a','US'),
  ('22222222-2222-2222-2222-222222222222','tenant-b','US');
INSERT INTO hci.app_tenant_bindings VALUES ('hci_app_test_a', '11111111-1111-1111-1111-111111111111'), ('hci_app_test_b', '22222222-2222-2222-2222-222222222222');
INSERT INTO hci.persons (id,tenant_id,display_label) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Synthetic A'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Synthetic B');
INSERT INTO hci.tenant_authorizations (id,tenant_id,status,expires_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ACTIVE',NULL), ('aaaaaaaa-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','REVOKED',NULL), ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','REVOKED',NULL);

-- Crypto-shredding key fixtures (ADR-0018 gate 2). subject_records now
-- requires encryption_key_ref for every EVIDENCE/CLAIM row
-- (subject_records_key_required_for_evidence_claim), so every existing
-- EVIDENCE/CLAIM insert throughout fixtures/tests needs a real key to
-- reference. Two per tenant, reused across the many unrelated tests whose
-- own subject is something else entirely (identity, DSR lifecycle, etc.) -
-- the ADR's gate 2 does not require one key per row (no UNIQUE constraint
-- is in its own gate list), only that the reference be valid, so reuse here
-- is schema-legal, not a shortcut around the actual control.
INSERT INTO hci.data_encryption_keys (id,tenant_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000800','11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000801','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000800','22222222-2222-2222-2222-222222222222');

-- Human-principal fixtures (ADR-0019 gate 5). hci.decisions.principal_id is
-- NOT NULL, so every existing/future Decision insert needs a real
-- principal to reference. One per tenant, matching the key-fixture reuse
-- pattern directly above.
INSERT INTO hci.principals (id,tenant_id,display_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000850','11111111-1111-1111-1111-111111111111','Synthetic Analyst A'),
  ('bbbbbbbb-0000-0000-0000-000000000850','22222222-2222-2222-2222-222222222222','Synthetic Analyst B');

-- Case/Engagement aggregate fixtures (ADR-0020). One OPEN case per tenant so
-- research_workflows/subject_records tests have a valid case_id to bind to;
-- one pre-CLOSED tenant-A case for the terminal-state-guard test
-- (CASE-CLOSED-GUARD-01). 'status' is omitted from every INSERT below (the
-- column DEFAULT is 'OPEN') because 'status' is no longer in the app role's
-- INSERT grant and, as of the 2026-09-04 hardening, the lifecycle trigger's
-- own INSERT branch rejects any non-OPEN status regardless of role - fixtures
-- run as hci_owner, which bypasses grants but not triggers. The pre-CLOSED
-- case is therefore driven through the real OPEN->ACTIVE->CLOSED sequence via
-- two UPDATEs rather than seeded directly, which doubles as a positive
-- exercise of the lifecycle trigger before the negative-test suite even
-- starts.
INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000200','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture');
INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000201','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture');
UPDATE hci.cases SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000201';
UPDATE hci.cases SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000201';
INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000200','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture');
-- R0-tier tenant-A case (ADR-0019 NEG-HD08-01): the human-spot-check
-- requirement is independent of tier "including R0" per the ADR's own
-- "Additionally" paragraph - a dedicated R0 case makes that literal, rather
-- than relying on the existing R1 cases above to stand in for it.
INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000202','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R0','synthetic fixture');

-- Source/SourceSnapshot provenance fixtures (ADR-0026). One source +
-- snapshot per tenant, so RLS-CLAIM-01/SOURCE-RLS-01 have a real cross-
-- tenant row to prove is invisible/unreferenceable, not an empty table.
INSERT INTO hci.sources (id,tenant_id,source_ref) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000300','11111111-1111-1111-1111-111111111111','https://example.com/tenant-a-source'),
  ('bbbbbbbb-0000-0000-0000-000000000300','22222222-2222-2222-2222-222222222222','https://example.com/tenant-b-source');
INSERT INTO hci.source_snapshots (id,tenant_id,source_id,content_hash,snapshot_ref) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000301','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000300','sha256:synthetic-a','s3://synthetic/tenant-a/snap1'),
  ('bbbbbbbb-0000-0000-0000-000000000301','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000300','sha256:synthetic-b','s3://synthetic/tenant-b/snap1');

-- Lawful-basis / source-terms fixtures (ADR-0010). Both tables have existed
-- since 0001 with zero fixtures or tests until now - same situation
-- hci.sources was in before the 2026-09-05 ADR-0026 pass gave it coverage.
-- One row per tenant so CONSENT-RLS-01/02 have a real cross-tenant row to
-- prove is invisible, not an empty-table false negative.
INSERT INTO hci.subject_lawful_basis_records (id,tenant_id,person_id,basis) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000400','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','synthetic fixture basis - tenant A'),
  ('bbbbbbbb-0000-0000-0000-000000000400','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','synthetic fixture basis - tenant B');
INSERT INTO hci.source_terms_records (id,tenant_id,source_id,terms_ref) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000401','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000300','https://example.com/tenant-a-source/terms'),
  ('bbbbbbbb-0000-0000-0000-000000000401','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000300','https://example.com/tenant-b-source/terms');

-- Bitemporal (ADR-0017) fixtures: one real tenant-B subject_records row, so
-- BITEMP-CROSSTENANT-01 (tenant A referencing it as supersedes_id) proves the
-- composite FK rejects a genuine cross-tenant reference, not merely an id
-- that does not exist anywhere. Also doubles as RLS-LEAK / BITEMP-VIEWRLS-01
-- fixture data.
-- Three kinds, not just EVIDENCE (critic review: BITEMP-VIEWRLS-01 originally
-- only probed evidence_current/decisions_current, leaving claims_current/
-- assessments_current's security_invoker asserted but never once actually
-- exercised cross-tenant - "all four views share one code shape" was an
-- assumption, not a checked fact).
-- EVIDENCE/CLAIM rows carry encryption_key_ref (ADR-0018 gate 2, tenant-B
-- key fixture above); ASSESSMENT correctly carries none (the scope-fence
-- CHECK forbids it there). author_class (ADR-0019 gate 2) + claim_state/
-- human_spotcheck_status (gate 3, CLAIM only) added the same way -
-- EVIDENCE=DETERMINISTIC, CLAIM=LLM_ASSISTED_HUMAN_REVIEW_REQUIRED (already
-- spot-checked APPROVED so it can freely be used as a supersedes_id/
-- decision_claims target elsewhere without every consuming test having to
-- re-clear that gate itself), ASSESSMENT=PROBABILISTIC per
-- HCI_FIELD_AUTHOR_CLASS_POLICY.md's own policy table.
INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000500','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','EVIDENCE','bbbbbbbb-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000800','DETERMINISTIC');
INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000501','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','CLAIM','bbbbbbbb-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','bbbbbbbb-0000-0000-0000-000000000850');
INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,author_class) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000502','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ASSESSMENT','bbbbbbbb-0000-0000-0000-000000000200','PROBABILISTIC');
-- One real tenant-B hci.decisions row (RLS-LEAK-04 / BITEMP-VIEWRLS-01),
-- mirroring the subject_records row directly above. author_class is always
-- HUMAN_ONLY for decisions (the only value the trigger accepts); principal_id
-- references the tenant-B principal fixture above.
INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class,principal_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000600','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000200','PROCEED','synthetic fixture rationale - tenant B','HUMAN_ONLY','bbbbbbbb-0000-0000-0000-000000000850');
-- One real tenant-B hci.decision_claims row (RLS-LEAK-06), mirroring the
-- decisions row directly above. reaudit_required on the linked claim
-- ('...501') defaults false (no risk-tier elevation ever touches tenant B's
-- fixture case), so this link is not itself rejected by the outcome='PROCEED'
-- H1015 gate.
INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000920','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000600','bbbbbbbb-0000-0000-0000-000000000501');

-- Case Report Snapshot fixture (migrations/0016, RLS-LEAK-07): one real
-- tenant-B row, mirroring every other RLS-LEAK fixture above. 'report' is
-- '{}' -- this table's own CHECK only requires a JSON object, and no test
-- reads this row's content, only its (in)visibility.
INSERT INTO hci.case_report_snapshots (id,tenant_id,case_id,generated_by_principal_id,report) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000700','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000850','{}'::jsonb);

-- Case auto-promote audit fixture (migrations/0019, RLS-LEAK test): one
-- real tenant-B row, same mirroring convention as the fixture directly
-- above.
INSERT INTO hci.case_auto_promote_audit (id,tenant_id,case_id,changed_by_principal_id,new_value) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000710','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000850',true);
