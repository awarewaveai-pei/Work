INSERT INTO hci.tenants VALUES ('11111111-1111-1111-1111-111111111111','tenant-a'), ('22222222-2222-2222-2222-222222222222','tenant-b');
INSERT INTO hci.app_tenant_bindings VALUES ('hci_app_test_a', '11111111-1111-1111-1111-111111111111'), ('hci_app_test_b', '22222222-2222-2222-2222-222222222222');
INSERT INTO hci.persons VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Synthetic A'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Synthetic B');
INSERT INTO hci.tenant_authorizations VALUES ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ACTIVE',NULL), ('aaaaaaaa-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','REVOKED',NULL), ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','REVOKED',NULL);

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
  VALUES ('aaaaaaaa-0000-0000-0000-000000000200','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic fixture case','R1','synthetic fixture');
INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000201','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic fixture case (closed)','R1','synthetic fixture');
UPDATE hci.cases SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000201';
UPDATE hci.cases SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000201';
INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000200','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','synthetic fixture case','R1','synthetic fixture');
