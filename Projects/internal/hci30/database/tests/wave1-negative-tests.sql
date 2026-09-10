\set ON_ERROR_STOP on

-- HCI-30 Wave 1 negative-test suite.
--
-- Every assertion goes through hci_test.* (see 00_test_harness.sql), which
-- records outcomes as rows instead of raising. No assertion here can be
-- swallowed by the handler that catches the condition under test.
--
-- Assertions run as a NON-OWNER tenant role, per
-- HCI_WAVE1_NEGATIVE_TEST_SPEC.md test-execution requirement 1. The final two
-- run as the owner on purpose, to prove the append-only trigger layer holds for
-- a connection whose privileges bypass grants.

SET ROLE hci_app_test_a;

-- ---------------------------------------------------------------------------
-- Tenant isolation (RLS)
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_true('RLS-OWN-01',
  $q$SELECT EXISTS (SELECT 1 FROM hci.persons WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$q$,
  'own-tenant person must remain readable');

SELECT hci_test.expect_true('RLS-LEAK-01',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.persons WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$q$,
  'tenant B person must not be visible to tenant A');

SELECT hci_test.expect_true('RLS-LEAK-02',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.tenants WHERE id = '22222222-2222-2222-2222-222222222222')$q$,
  'tenant registry must not enumerate other tenants');

SELECT hci_test.expect_sqlstate('RLS-WRITE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('bbbbbbbb-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','EVIDENCE','bbbbbbbb-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '42501');

-- ---------------------------------------------------------------------------
-- Person-only subject boundary (SUBJECT-NEG-01..03)
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_success('SUBJECT-NEG-01a',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000101','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$);

SELECT hci_test.expect_true('SUBJECT-NEG-01b',
  $q$SELECT subject_type = 'PERSON' FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'$q$,
  'omitted subject_type must default deterministically to PERSON');

SELECT hci_test.expect_sqlstate('SUBJECT-NEG-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,subject_type,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ORGANIZATION','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

SELECT hci_test.expect_sqlstate('SUBJECT-NEG-03',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,subject_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- ---------------------------------------------------------------------------
-- Tenant authorization gate (CONSENT-NEG-04) and revocation semantics
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('CONSENT-NEG-04a',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000010','aaaaaaaa-0000-0000-0000-000000000200')$q$,
  'H1001');

-- A gate that rejects everything is also broken. Prove the allow path works.
SELECT hci_test.expect_success('CONSENT-NEG-04b',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000102','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000200')$q$);

SELECT hci_test.expect_success('CONSENT-NEG-05a',
  $q$INSERT INTO hci.tenant_authorizations (id,tenant_id,status,expires_at) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000103','11111111-1111-1111-1111-111111111111','ACTIVE',NULL)$q$);

SELECT hci_test.expect_success('CONSENT-NEG-05b',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000104','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000103','aaaaaaaa-0000-0000-0000-000000000200')$q$);

SELECT hci_test.expect_success('CONSENT-NEG-05c',
  $q$UPDATE hci.tenant_authorizations SET status = 'REVOKED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000103'$q$);

-- Documented intentional behaviour: revocation stops new work, it does not
-- retroactively rewrite history.
SELECT hci_test.expect_true('CONSENT-NEG-05d',
  $q$SELECT EXISTS (SELECT 1 FROM hci.research_workflows WHERE id = 'aaaaaaaa-0000-0000-0000-000000000104')$q$,
  'revocation must not retroactively delete work already begun');

SELECT hci_test.expect_sqlstate('CONSENT-NEG-05e',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000105','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000103','aaaaaaaa-0000-0000-0000-000000000200')$q$,
  'H1001');

-- ---------------------------------------------------------------------------
-- Data-subject-request lifecycle (HD-03)
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('DSR-LIFECYCLE-01',
  $q$INSERT INTO hci.data_subject_requests (id,tenant_id,person_id,request_type,status) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000106','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CORRECTION','IN_REVIEW')$q$,
  'H1002');

SELECT hci_test.expect_success('DSR-LIFECYCLE-02',
  $q$INSERT INTO hci.data_subject_requests (id,tenant_id,person_id,request_type,status) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000107','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CORRECTION','RECEIVED')$q$);

SELECT hci_test.expect_sqlstate('DSR-LIFECYCLE-03',
  $q$UPDATE hci.data_subject_requests SET status = 'RESOLVED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$,
  'H1002');

SELECT hci_test.expect_success('DSR-LIFECYCLE-04',
  $q$UPDATE hci.data_subject_requests SET status = 'IN_REVIEW' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$);

SELECT hci_test.expect_success('DSR-LIFECYCLE-05',
  $q$UPDATE hci.data_subject_requests SET status = 'RESOLVED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$);

SELECT hci_test.expect_sqlstate('DSR-LIFECYCLE-06',
  $q$UPDATE hci.data_subject_requests SET status = 'IN_REVIEW' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$,
  'H1002');

-- ---------------------------------------------------------------------------
-- Append-only ledgers, GRANT layer (the role never holds UPDATE/DELETE)
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_success('DSR-EVENT-01',
  $q$INSERT INTO hci.data_subject_request_events (id,tenant_id,request_id,event_type,detail)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000108','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000107','RECEIVED','synthetic fixture')$q$);

SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-01',
  $q$UPDATE hci.data_subject_request_events SET detail = 'mutated'$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-02',
  $q$DELETE FROM hci.data_subject_request_events$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-03',
  $q$UPDATE hci.subject_records SET kind = 'CLAIM'$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-04',
  $q$DELETE FROM hci.subject_records$q$, '42501');

-- ---------------------------------------------------------------------------
-- Typed reference: a DSR target must match the kind it claims to point at
-- ---------------------------------------------------------------------------
-- Retrofitted 2026-09-05 (ADR-0004 gates 2-3): domain/evidence_ref_id/
-- evidence_ref_kind became required for kind='TRUST_DOMAIN' by migration
-- 0011. Evidence reference reuses '...101' (a real tenant-A EVIDENCE row,
-- inserted above at line ~40), not a placeholder.
SELECT hci_test.expect_success('TARGET-KIND-01a',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000109','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','OPERATIONAL','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$);

SELECT hci_test.expect_sqlstate('TARGET-KIND-01b',
  $q$INSERT INTO hci.data_subject_request_targets (id,tenant_id,request_id,target_kind,target_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000110','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000107','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000109')$q$,
  '23503');

SELECT hci_test.expect_success('TARGET-KIND-02',
  $q$INSERT INTO hci.data_subject_request_targets (id,tenant_id,request_id,target_kind,target_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000111','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000107','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000101')$q$);

-- ---------------------------------------------------------------------------
-- Identity confirmation admission (HD-04), guarded on both sides
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_success('IDENTITY-NEG-01a',
  $q$INSERT INTO hci.identity_candidates (id,tenant_id,person_id,match_state) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000112','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CANDIDATE')$q$);

SELECT hci_test.expect_success('IDENTITY-NEG-01b',
  $q$INSERT INTO hci.identity_verifications (id,tenant_id,candidate_id,method,evidence_ref) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000113','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000112','LLM','synthetic-confidence')$q$);

SELECT hci_test.expect_sqlstate('IDENTITY-NEG-01c',
  $q$UPDATE hci.identity_candidates SET match_state = 'MATCH_CONFIRMED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$,
  'H1004');

SELECT hci_test.expect_success('IDENTITY-NEG-02a',
  $q$INSERT INTO hci.identity_verifications (id,tenant_id,candidate_id,method,evidence_ref) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000114','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000112','HUMAN','synthetic-human-check')$q$);

SELECT hci_test.expect_success('IDENTITY-NEG-02b',
  $q$UPDATE hci.identity_candidates SET match_state = 'MATCH_CONFIRMED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$);

-- The invariant is violated just as easily by removing the justification.
SELECT hci_test.expect_sqlstate('IDENTITY-NEG-03',
  $q$DELETE FROM hci.identity_verifications WHERE id = 'aaaaaaaa-0000-0000-0000-000000000114'$q$,
  'H1005');

SELECT hci_test.expect_sqlstate('IDENTITY-NEG-04',
  $q$UPDATE hci.identity_verifications SET method = 'LLM' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000114'$q$,
  'H1005');

-- ---------------------------------------------------------------------------
-- Field mutability matrix (migration header): what may change, and when
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('NONEMPTY-01',
  $q$INSERT INTO hci.identity_verifications (id,tenant_id,candidate_id,method,evidence_ref) VALUES
     ('aaaaaaaa-0000-0000-0000-000000000115','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000112','HUMAN','')$q$,
  '23514');

-- Repointing a confirmed identity at a different person is the end state the
-- HD-04 gate exists to prevent, reached without touching any evidence row.
SELECT hci_test.expect_sqlstate('IDENTITY-NEG-05',
  $q$UPDATE hci.identity_candidates SET person_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$,
  'H1007');

SELECT hci_test.expect_success('PERSON-02',
  $q$INSERT INTO hci.persons (id,tenant_id,display_label) VALUES
     ('aaaaaaaa-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','Synthetic A2')$q$);

-- The gate must block the silent path without blocking the legitimate one.
SELECT hci_test.expect_success('IDENTITY-NEG-06a',
  $q$UPDATE hci.identity_candidates SET match_state = 'CANDIDATE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$);
SELECT hci_test.expect_success('IDENTITY-NEG-06b',
  $q$UPDATE hci.identity_candidates SET person_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$);

-- A resolved ACCESS request must not become a DELETION request afterwards.
SELECT hci_test.expect_sqlstate('DSR-IMMUTABLE-01',
  $q$UPDATE hci.data_subject_requests SET request_type = 'DELETION' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$,
  'H1007');
SELECT hci_test.expect_sqlstate('DSR-IMMUTABLE-02',
  $q$UPDATE hci.data_subject_requests SET person_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$,
  'H1007');

-- Withdrawal is a REJECTED transition plus an event, not the record vanishing.
SELECT hci_test.expect_sqlstate('DSR-NODELETE-01',
  $q$DELETE FROM hci.data_subject_requests WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'$q$, '42501');
SELECT hci_test.expect_sqlstate('TARGET-NODELETE-01',
  $q$DELETE FROM hci.data_subject_request_targets$q$, '42501');

-- Asserted on hci.persons rather than research_workflows: BEFORE-row triggers
-- fire in alphabetical order, so on research_workflows the authorization gate
-- ('r...require...') answers first with H1001. The row is protected either way,
-- but this assertion is about the tenant guard specifically, so it is placed
-- where nothing shadows it.
SELECT hci_test.expect_sqlstate('TENANT-IMMUTABLE-01',
  $q$UPDATE hci.persons SET tenant_id = '22222222-2222-2222-2222-222222222222' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$,
  'H1006');

-- A ledger whose timestamps the audited party chooses proves no ordering.
SELECT hci_test.expect_sqlstate('CREATED-AT-01',
  $q$INSERT INTO hci.data_subject_request_events (id,tenant_id,request_id,event_type,detail,created_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000116','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000107','RESOLVED','backdated','1999-01-01T00:00:00Z')$q$,
  '42501');

-- ---------------------------------------------------------------------------
-- Case/Engagement aggregate (ADR-0020, HD-10)
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_true('CASE-SCHEMA-01',
  $q$SELECT
       (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'hci' AND table_name = 'cases'
            AND column_name IN ('id','tenant_id','tenant_authorization_id','purpose','risk_tier',
                                 'relationship_context','requester_context','project_ref','status',
                                 'opened_at','closed_at')) = 11
       AND EXISTS (
         SELECT 1 FROM information_schema.table_constraints
          WHERE table_schema = 'hci' AND table_name = 'cases' AND constraint_type = 'FOREIGN KEY')$q$,
  'hci.cases must carry the full ADR-0020 field list and a tenant_authorization foreign key');

-- Tenant isolation on hci.cases itself (2026-09-04 critic review: the table
-- had a policy from the moment it was created, but nothing in the suite would
-- have gone red if that policy were dropped - RLS-LEAK-01/02 exercise
-- persons/tenants, and CASE-OWNS-02 is caught by the composite FK regardless
-- of RLS). purpose/requester_context/relationship_context are the most
-- sensitive free text on this table, so this is the highest-value gap to
-- close first.
SELECT hci_test.expect_true('RLS-LEAK-03',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.cases WHERE id = 'bbbbbbbb-0000-0000-0000-000000000200')$q$,
  'tenant B case must not be visible to tenant A');

-- Dedicated, freshly-created cases for the lifecycle assertions below, rather
-- than mutating a fixture case other sections rely on staying OPEN. 'status'
-- is omitted (see fixtures/0001_synthetic.sql for why) - the app role has no
-- grant to set it explicitly, so every case is born OPEN via the DEFAULT.
SELECT hci_test.expect_success('CASE-LIFECYCLE-SETUP-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000210','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture')$q$);

SELECT hci_test.expect_success('CASE-LIFECYCLE-01',
  $q$UPDATE hci.cases SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$);

SELECT hci_test.expect_success('CASE-LIFECYCLE-02',
  $q$UPDATE hci.cases SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$);

SELECT hci_test.expect_true('CASE-LIFECYCLE-02b',
  $q$SELECT closed_at IS NOT NULL FROM hci.cases WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$,
  'closed_at must be set exactly on the transition into CLOSED');

-- -210 is CLOSED as of CASE-LIFECYCLE-02 above: prove every other column is
-- frozen too, not just the status/closed_at pair (2026-09-04 critic review -
-- the original trigger guarded only the moment of closing, leaving a closed
-- case's purpose/risk_tier/etc. rewritable indefinitely with no event trail).
SELECT hci_test.expect_sqlstate('CASE-CLOSED-IMMUTABLE-01',
  $q$UPDATE hci.cases SET purpose = 'rewritten after close' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$,
  'H1007');

-- Case reopen (migrations/0015, operator-requested "歷史案件(可復活)"):
-- CLOSED->ACTIVE is now a valid transition, distinct from -210 above (which
-- must stay CLOSED for CASE-CLOSED-IMMUTABLE-01) -- a dedicated case avoids
-- disturbing that precondition.
SELECT hci_test.expect_success('CASE-REOPEN-SETUP-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000218','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture')$q$);
SELECT hci_test.expect_success('CASE-REOPEN-SETUP-02',
  $q$UPDATE hci.cases SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000218'$q$);
SELECT hci_test.expect_success('CASE-REOPEN-SETUP-03',
  $q$UPDATE hci.cases SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000218'$q$);

-- CASE-LIFECYCLE-03 repurposed (was: CLOSED->ACTIVE expected to fail, before
-- 0015 -- that is now the wrong behavior by design, not a regression).
SELECT hci_test.expect_success('CASE-LIFECYCLE-03',
  $q$UPDATE hci.cases SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000218'$q$);
SELECT hci_test.expect_true('CASE-REOPEN-CLOSEDAT-CLEARED-01',
  $q$SELECT closed_at IS NULL FROM hci.cases WHERE id = 'aaaaaaaa-0000-0000-0000-000000000218'$q$,
  'closed_at must be cleared when a CLOSED case is reopened to ACTIVE');

-- Reopening only ever targets ACTIVE (resume in-progress review); CLOSED
-- straight to OPEN (reset to never-started) stays rejected, same H1010 as
-- the existing OPEN->CLOSED skip (CASE-LIFECYCLE-04 below).
SELECT hci_test.expect_success('CASE-REOPEN-SETUP-04',
  $q$UPDATE hci.cases SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000218'$q$);
SELECT hci_test.expect_sqlstate('CASE-REOPEN-SKIP-01',
  $q$UPDATE hci.cases SET status = 'OPEN' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000218'$q$,
  'H1010');

-- A fresh OPEN case: -210 is CLOSED as of CASE-LIFECYCLE-02 above, so testing
-- the OPEN->CLOSED skip needs its own case rather than reusing that one.
SELECT hci_test.expect_success('CASE-LIFECYCLE-SETUP-02',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000211','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture')$q$);

SELECT hci_test.expect_sqlstate('CASE-LIFECYCLE-04',
  $q$UPDATE hci.cases SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000211'$q$,
  'H1010');

-- closed_at is withheld from the app role's UPDATE grant entirely (gate 2's
-- "no direct UPDATE privilege on closed_at"), independent of the lifecycle
-- trigger's own logic - proven directly, not just implied by CASE-LIFECYCLE-*.
SELECT hci_test.expect_sqlstate('CASE-CLOSEDAT-DIRECT-01',
  $q$UPDATE hci.cases SET closed_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$,
  '42501');

-- 'status' and 'opened_at' are both grant-layer withheld (2026-09-04 critic
-- review: 'status' was originally granted, letting the app role INSERT
-- directly into ACTIVE/CLOSED - see the migration's trigger comment). Proven
-- directly at the grant layer, the same way CREATED-AT-01 proves
-- data_subject_request_events.created_at (0001:340-344) rather than only
-- being implied by the trigger's own INSERT-branch check.
SELECT hci_test.expect_sqlstate('CASE-LIFECYCLE-05',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context,status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000216','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R0','synthetic fixture','OPEN')$q$,
  '42501');
SELECT hci_test.expect_sqlstate('CASE-OPENEDAT-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context,opened_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000217','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R0','synthetic fixture',now())$q$,
  '42501');

-- Ownership binding (gate 3): every research_workflows row needs a case_id,
-- and it must resolve inside the acting tenant.
SELECT hci_test.expect_sqlstate('CASE-OWNS-01',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000212','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001')$q$,
  '23502');

SELECT hci_test.expect_sqlstate('CASE-OWNS-02',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000213','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000200')$q$,
  '23503');

-- A bound workflow's case_id must stay bound (2026-09-04 critic review): the
-- original migration only checked case_id at INSERT, leaving it a plain
-- UPDATE-able column that could be repointed onto a different case -
-- including a CLOSED one - entirely without tripping the terminal-state
-- guard below. -102 (CONSENT-NEG-04b) is already bound to case -200; a second
-- OPEN case is created here as the repoint target, so this proves case_id is
-- frozen even when both the old and new case are otherwise valid.
SELECT hci_test.expect_success('CASE-OWNS-03-SETUP',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000220','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','synthetic fixture')$q$);
SELECT hci_test.expect_sqlstate('CASE-OWNS-03',
  $q$UPDATE hci.research_workflows SET case_id = 'aaaaaaaa-0000-0000-0000-000000000220' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102'$q$,
  'H1007');

-- Terminal-state guard (gate 4): a CLOSED case may not admit new work. Uses
-- the pre-CLOSED fixture case (0001_synthetic.sql), not one closed above, so
-- this assertion does not depend on CASE-LIFECYCLE-* execution order.
SELECT hci_test.expect_sqlstate('CASE-CLOSED-GUARD-01',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000214','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000201')$q$,
  'H1011');

-- ADR-0020 gate 4 names research_workflows OR subject_records; the guard on
-- subject_records had zero coverage until now (2026-09-04 critic review -
-- the mutation that dropped both triggers at once was killed by
-- CASE-CLOSED-GUARD-01 alone, so dropping only the subject_records trigger
-- was previously invisible to the suite).
SELECT hci_test.expect_sqlstate('CASE-CLOSED-GUARD-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000218','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  'H1011');

-- project_ref is opaque (gate 5): no FK exists on it, and an arbitrary value
-- that resolves to nothing real is accepted without error.
SELECT hci_test.expect_true('CASE-PROJECTREF-01',
  $q$SELECT NOT EXISTS (
       SELECT 1 FROM information_schema.key_column_usage k
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema
       WHERE k.table_schema = 'hci' AND k.table_name = 'cases' AND k.column_name = 'project_ref'
         AND tc.constraint_type = 'FOREIGN KEY')$q$,
  'project_ref must never be a foreign key');

SELECT hci_test.expect_success('CASE-PROJECTREF-02',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context,project_ref)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000215','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R0','synthetic fixture','nonexistent-project-xyz-999')$q$);

-- ---------------------------------------------------------------------------
-- Regulatory market scope (ADR-0012, HD-20) - purpose allow-list, re-anchored
-- onto hci.cases.purpose per ADR-0012:36 (see migration 0003's header for the
-- full re-anchoring rationale: hci.cases.purpose did not exist when the ADR
-- was written and is now the natural home for this check).
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('REG-NEG-04',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000223','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','employment_screening','R1','synthetic fixture')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-05',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000224','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','credit_decisioning','R1','synthetic fixture')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-06',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000225','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','housing_tenant_screening','R1','synthetic fixture')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-07',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000226','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','insurance_underwriting','R1','synthetic fixture')$q$,
  '23514');
-- A gate that rejects everything is also broken (same discipline as
-- CONSENT-NEG-04b): prove an allow-listed purpose is actually admitted.
SELECT hci_test.expect_success('REG-NEG-08',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000227','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','vendor_risk_assessment','R1','synthetic fixture')$q$);

-- ---------------------------------------------------------------------------
-- Source/SourceSnapshot provenance and corroboration graph (ADR-0026,
-- HD-16). hci.sources itself has existed since 0001 but had zero fixtures
-- or tests until this section - the fixtures file's two source/snapshot
-- rows above exist specifically so this section has real cross-tenant data
-- to prove is invisible/unreferenceable, not an empty-table false negative.
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_success('CLAIM-FIXTURE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000302','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','aaaaaaaa-0000-0000-0000-000000000850')$q$);

-- Read-side: tenant A must not see tenant B's Source or SourceSnapshot row -
-- the same RLS mechanism protecting every other hci.* table (0001's
-- declarative loop for hci.sources; this migration's manual wiring for
-- hci.source_snapshots), exercised for the first time on these two tables.
SELECT hci_test.expect_true('SOURCE-RLS-01',
  $q$SELECT
       NOT EXISTS (SELECT 1 FROM hci.sources WHERE id = 'bbbbbbbb-0000-0000-0000-000000000300')
       AND NOT EXISTS (SELECT 1 FROM hci.source_snapshots WHERE id = 'bbbbbbbb-0000-0000-0000-000000000301')$q$,
  'tenant B source and source_snapshot must not be visible to tenant A');

-- ---------------------------------------------------------------------------
-- Consent-class separation (ADR-0010, HD-02). hci.subject_lawful_basis_records
-- and hci.source_terms_records have existed since 0001 with zero fixtures or
-- tests until now - the same situation hci.sources was in before ADR-0026's
-- pass. CONSENT-NEG-01 (bare `consent` payload rejected) is proven at the
-- application-request-validation layer, not SQL - see
-- tests/unit/contracts/validate-request.test.mjs's 'rejects bare consent'
-- case, run by scripts/test-wave1-local.ps1 in the same suite as this file.
-- CONSENT-NEG-02/03 (an application flow may not treat tenant authorization
-- or source terms AS data-subject consent) are NOT implemented here: proving
-- that requires an actual claim-admission workflow to exercise, and none
-- exists yet at Wave 1 schema stage - left OPEN rather than faked, same
-- disposition as ADR-0005 gate 2 and ADR-0026 gate 3. What this section does
-- prove at the schema layer: both tables are real, populated, and
-- tenant-isolated, not merely designed-on-paper.
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_true('CONSENT-RLS-01',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.subject_lawful_basis_records WHERE id = 'bbbbbbbb-0000-0000-0000-000000000400')$q$,
  'tenant B lawful-basis record must not be visible to tenant A');
SELECT hci_test.expect_true('CONSENT-RLS-02',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.source_terms_records WHERE id = 'bbbbbbbb-0000-0000-0000-000000000401')$q$,
  'tenant B source-terms record must not be visible to tenant A');

-- Write-side (ADR-0026 gate 2's named test id): a tenant-A Claim cannot cite,
-- derive from, or claim-as-original-source a tenant-B Source - the
-- composite FK (tenant_id, source_id) makes this structurally impossible,
-- the same "cannot even construct the row" guarantee CASE-OWNS-02 already
-- proves for research_workflows/cases.
SELECT hci_test.expect_sqlstate('RLS-CLAIM-01',
  $q$INSERT INTO hci.source_relationships (id,tenant_id,claim_id,relationship_type,source_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000303','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000302','CITES','bbbbbbbb-0000-0000-0000-000000000300')$q$,
  '23503');
-- A gate that rejects every source_id is also broken: prove the same shape
-- succeeds against tenant A's own source.
SELECT hci_test.expect_success('RLS-CLAIM-02',
  $q$INSERT INTO hci.source_relationships (id,tenant_id,claim_id,relationship_type,source_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000304','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000302','CITES','aaaaaaaa-0000-0000-0000-000000000300')$q$);

-- Append-only, GRANT layer (mirrors APPEND-ONLY-GRANT-01..04 for
-- subject_records/data_subject_request_events).
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-05',
  $q$UPDATE hci.source_snapshots SET content_hash = 'mutated'$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-06',
  $q$DELETE FROM hci.source_snapshots$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-07',
  $q$UPDATE hci.source_relationships SET relationship_type = 'DERIVED_FROM'$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-08',
  $q$DELETE FROM hci.source_relationships$q$, '42501');

-- ---------------------------------------------------------------------------
-- Bitemporal history (ADR-0017 gates 1-3). Uses tenant A's existing OPEN
-- case (aaaaaaaa-...-200, fixtures) and person 'aaaaaaaa-aaaa-...'. ID block
-- 500-506 (subject_records) / 600-601 (decisions) is the first unused block
-- in this file, following the same per-topic-block convention as 300s
-- (provenance) / 400s (consent).
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('BITEMP-WINDOW-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,valid_from,valid_to,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000500','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','2026-01-02T00:00:00Z','2026-01-01T00:00:00Z','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- References SUBJECT-NEG-01a's row ('...101', tenant A, EVIDENCE) as a real
-- same-tenant supersedes_id target, so the FK is satisfied and only the
-- reason-required CHECK is under test.
SELECT hci_test.expect_sqlstate('BITEMP-REASON-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000501','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000101','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- Blank is not a reason (db-expert review, 2026-09-05 - matching 0001:66-68's
-- own stated lesson about evidentiary free text elsewhere in this schema):
-- an empty string satisfies "IS NOT NULL" but not the intent, and until this
-- CHECK existed it silently passed BITEMP-REASON-01's own gate.
SELECT hci_test.expect_sqlstate('BITEMP-REASON-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000507','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000101','','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- Targets a REAL tenant-B row (fixtures: 'bbbbbbbb-...-500') so this proves
-- the composite FK rejects a genuine cross-tenant reference, not merely an
-- id that does not exist anywhere.
SELECT hci_test.expect_sqlstate('BITEMP-CROSSTENANT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000502','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000500','cross-tenant probe','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23503');

SELECT hci_test.expect_sqlstate('BITEMP-IMMUTABLE-01',
  $q$UPDATE hci.subject_records SET valid_to = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'$q$,
  '42501');

SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,system_recorded_at,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000506','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','2020-01-01T00:00:00Z','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '42501');
-- Both server-assigned columns need their own assertion (critic review):
-- withholding system_recorded_at alone does not prove system_superseded_at
-- is withheld too - a row "born already superseded" would be invisible to
-- every _current/_as_of read while still sitting in the base table.
SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-01b',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,system_superseded_at,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000508','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200',now(),'aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '42501');

-- Predecessor A ('...503') and successor B ('...504'): B's insert fires
-- hci.mark_superseded() (AFTER INSERT), which must set A's
-- system_superseded_at to B's own system_recorded_at.
SELECT hci_test.expect_success('BITEMP-SUPERSEDE-SETUP-A',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000503','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$);
SELECT hci_test.expect_success('BITEMP-SUPERSEDE-SETUP-B',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000504','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000503','correction test','aaaaaaaa-0000-0000-0000-000000000801','DETERMINISTIC')$q$);

SELECT hci_test.expect_true('BITEMP-SUPERSEDE-01',
  $q$SELECT (SELECT system_superseded_at FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000503')
         = (SELECT system_recorded_at FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000504')$q$,
  'predecessor system_superseded_at must equal successor system_recorded_at');

-- No forks: a second attempt to supersede the SAME already-superseded
-- predecessor must be rejected, not silently accepted as a second successor.
-- Real-Docker correction (2026-09-05): predicted H1008 (mark_superseded's own
-- "predecessor already superseded" check), got 23505 instead -
-- subject_records_supersedes_unique (UNIQUE(tenant_id, supersedes_id), gate 1) rejects
-- the duplicate supersedes_id value at INSERT time, before the AFTER INSERT
-- trigger that would raise H1008 ever runs. H1008 is not dead code even
-- though this specific test cannot reach it - it is defense-in-depth for a
-- schema where that UNIQUE constraint were ever weakened, and the
-- 'drop-supersedes-unique-constraint' mutation below proves exactly that:
-- with the constraint gone, this same assertion's actual SQLSTATE flips to
-- H1008, which is why that mutation's expected failure is this test ID.
SELECT hci_test.expect_sqlstate('BITEMP-SUPERSEDE-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000505','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000503','second correction attempt','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23505');

-- "What was known at T" (gate 3). Uses each row's OWN system_recorded_at as
-- the natural T boundary rather than a hardcoded literal, since neither A's
-- nor B's exact clock value is known ahead of time.
SELECT hci_test.expect_true('BITEMP-ASOF-01',
  $q$SELECT
       (SELECT array_agg(id ORDER BY id) FROM hci.evidence_as_of((SELECT system_recorded_at FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000503')) WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000503','aaaaaaaa-0000-0000-0000-000000000504'))
         = ARRAY['aaaaaaaa-0000-0000-0000-000000000503']::uuid[]
       AND (SELECT array_agg(id ORDER BY id) FROM hci.evidence_as_of((SELECT system_recorded_at FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000504')) WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000503','aaaaaaaa-0000-0000-0000-000000000504'))
         = ARRAY['aaaaaaaa-0000-0000-0000-000000000504']::uuid[]
       AND (SELECT array_agg(id ORDER BY id) FROM hci.evidence_current WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000503','aaaaaaaa-0000-0000-0000-000000000504'))
         = ARRAY['aaaaaaaa-0000-0000-0000-000000000504']::uuid[]
  $q$,
  'as_of(A.system_recorded_at) returns only A; as_of(B.system_recorded_at) returns only B; _current returns only B');

-- Same mechanism (hci.mark_superseded is generic across tables), proven
-- against hci.decisions specifically so gate 1/2's "Decision" coverage is
-- real, not inferred from subject_records alone.
SELECT hci_test.expect_success('BITEMP-DECISION-01',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000600','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','synthetic rationale','HUMAN_ONLY','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_success('BITEMP-DECISION-02',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,supersedes_id,corrected_reason,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000601','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PROCEED','synthetic rationale, revised','aaaaaaaa-0000-0000-0000-000000000600','initial pause was overly cautious','HUMAN_ONLY','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_true('BITEMP-DECISION-03',
  $q$SELECT (SELECT system_superseded_at FROM hci.decisions WHERE id = 'aaaaaaaa-0000-0000-0000-000000000600')
         = (SELECT system_recorded_at FROM hci.decisions WHERE id = 'aaaaaaaa-0000-0000-0000-000000000601')$q$,
  'mark_superseded must work generically for hci.decisions too, not only hci.subject_records');
SELECT hci_test.expect_true('BITEMP-DECISION-04',
  $q$SELECT (SELECT array_agg(id ORDER BY id) FROM hci.decisions_current WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000600','aaaaaaaa-0000-0000-0000-000000000601'))
         = ARRAY['aaaaaaaa-0000-0000-0000-000000000601']::uuid[]$q$,
  'decisions_current must show only the successor');

-- hci.decisions (gate 1/2) had zero RLS/append-only/security_invoker
-- coverage of its own until a db-expert review pointed out that disabling
-- RLS, dropping either trigger, or turning off security_invoker on the
-- views would leave 118/118 green - the happy-path BITEMP-DECISION-0x tests
-- above never exercise any of these controls. Mirrors the equivalent,
-- already-established coverage for hci.cases (RLS-LEAK-03) and
-- subject_records/source_snapshots/source_relationships
-- (APPEND-ONLY-GRANT/TRIGGER-0x, TRUNCATE-0x).
SELECT hci_test.expect_true('RLS-LEAK-04',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.decisions WHERE id = 'bbbbbbbb-0000-0000-0000-000000000600')$q$,
  'tenant B decision must not be visible to tenant A');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-09',
  $q$UPDATE hci.decisions SET outcome = 'EXIT'$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-10',
  $q$DELETE FROM hci.decisions$q$, '42501');
SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-02',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,system_recorded_at,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000602','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','clock probe','2020-01-01T00:00:00Z','HUMAN_ONLY','aaaaaaaa-0000-0000-0000-000000000850')$q$,
  '42501');
SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-02b',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,system_superseded_at,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000603','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','clock probe',now(),'HUMAN_ONLY','aaaaaaaa-0000-0000-0000-000000000850')$q$,
  '42501');

-- security_invoker=true on the four canonical-read views was asserted but
-- never actually proven: every prior BITEMP assertion ran only as tenant A
-- against tenant A's own rows, so a dropped security_invoker would have
-- changed nothing observable. This is the first real cross-tenant probe
-- through them - all four, not just two (critic review: "all four views
-- share one code shape" was an assumption the original two-view version of
-- this test never actually checked).
SELECT hci_test.expect_true('BITEMP-VIEWRLS-01',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.evidence_current WHERE id = 'bbbbbbbb-0000-0000-0000-000000000500')
       AND NOT EXISTS (SELECT 1 FROM hci.claims_current WHERE id = 'bbbbbbbb-0000-0000-0000-000000000501')
       AND NOT EXISTS (SELECT 1 FROM hci.assessments_current WHERE id = 'bbbbbbbb-0000-0000-0000-000000000502')
       AND NOT EXISTS (SELECT 1 FROM hci.decisions_current WHERE id = 'bbbbbbbb-0000-0000-0000-000000000600')$q$,
  'security_invoker views must not leak tenant B rows to tenant A');

-- ADR-0017 gate 4: created_at is withheld from both INSERT and UPDATE on the
-- eleven scope-fence tables (migration 0006), matching the "ledger clock
-- must not be client-chosen" rule already proven for the other server-
-- assigned timestamps in this schema. Representative coverage on
-- hci.persons (the pattern is structurally identical across all eleven -
-- the mutation-check equivalents below cover a second table for the same
-- reason APPEND-ONLY-GRANT-0x covers a representative set, not every table).
SELECT hci_test.expect_sqlstate('CREATEDAT-SCOPE-01',
  $q$INSERT INTO hci.persons (id,tenant_id,display_label,created_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000700','11111111-1111-1111-1111-111111111111','clock probe','2020-01-01T00:00:00Z')$q$,
  '42501');
SELECT hci_test.expect_sqlstate('CREATEDAT-SCOPE-02',
  $q$UPDATE hci.persons SET created_at = now() WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$,
  '42501');

-- ---------------------------------------------------------------------------
-- Crypto-shredding for erasure (ADR-0018 gate 2). Gate 1 (key-table grant
-- isolation) and gate 6 (no-external-key-path) are owner-run introspection,
-- with the other owner-run architecture assertions below.
-- ---------------------------------------------------------------------------
-- author_class supplied explicitly on all three (ADR-0019 gate 2 landed
-- alongside this one): without it, the NOT-NULL author_class CHECK could
-- fire instead of the constraint each test actually means to exercise,
-- making the assertion pass for the wrong reason (or, for CROSSTENANT-KEYREF,
-- fail outright with the wrong SQLSTATE).
SELECT hci_test.expect_sqlstate('CRYPTO-KEYREQ-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000900','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200',NULL,'DETERMINISTIC')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('CRYPTO-SCOPE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000901','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ASSESSMENT','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','PROBABILISTIC')$q$,
  '23514');
-- Targets a REAL tenant-B key (fixtures: 'bbbbbbbb-...-800'), same reasoning
-- as BITEMP-CROSSTENANT-01: proves the composite FK rejects a genuine
-- cross-tenant reference, not merely a key id that does not exist anywhere.
SELECT hci_test.expect_sqlstate('CRYPTO-CROSSTENANT-KEYREF-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000902','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23503');
-- ADR text's gate 3 predicted H1003 for a direct app-role UPDATE attempt;
-- real behaviour matches BITEMP-IMMUTABLE-01's own already-documented
-- correction - subject_records holds zero UPDATE grant for the application
-- role at all (unchanged since 0001), so the attempt never reaches the
-- trigger to begin with.
SELECT hci_test.expect_sqlstate('CRYPTO-TOMBSTONE-01',
  $q$UPDATE hci.subject_records SET tombstoned_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'$q$,
  '42501');

-- ---------------------------------------------------------------------------
-- Field/transition author-class policy (ADR-0019 gate 2). `kind` is the
-- Wave-1 proxy for "field_id/transition" (see wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md
-- gate 2 note); each assertion below supplies every OTHER kind's own
-- required author_class correctly and varies only the one under test, so a
-- failure can only be attributed to the author_class mismatch itself.
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('AUTHORCLASS-NEG-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000910','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','HUMAN_ONLY')$q$,
  'H1013');
SELECT hci_test.expect_sqlstate('AUTHORCLASS-NEG-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000911','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC','DRAFT','PENDING')$q$,
  'H1013');
SELECT hci_test.expect_sqlstate('AUTHORCLASS-NEG-03',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000912','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ASSESSMENT','aaaaaaaa-0000-0000-0000-000000000200','DETERMINISTIC')$q$,
  'H1013');
SELECT hci_test.expect_sqlstate('AUTHORCLASS-NEG-04',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000913','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','wrong author class probe','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','aaaaaaaa-0000-0000-0000-000000000850')$q$,
  'H1013');

-- ADR-0019 gate 3, NEG-HD08-01: admitting an R0-tier Claim with
-- human_spotcheck_status='PENDING' must be rejected by the database, not
-- only by application code - the trigger has no risk_tier branch at all
-- (evaluated "independent of the linked Case's risk_tier value" per the
-- ADR), and this fixture's R0 case (fixtures/0001_synthetic.sql) makes that
-- literal rather than inferred from an R1 case standing in for it.
SELECT hci_test.expect_sqlstate('NEG-HD08-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000914','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000202','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','PENDING')$q$,
  'H1014');

-- ADR-0019 gate 5 (human-principal half), NEG-HD08-03: a Decision row
-- requires a human principal reference and is rejected without one -
-- principal_id is NOT NULL, so omitting it entirely (not merely passing a
-- key that doesn't exist) is the direct test of the requirement itself.
SELECT hci_test.expect_sqlstate('NEG-HD08-03',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000915','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','no principal probe','HUMAN_ONLY')$q$,
  '23502');

-- ADR-0019 gate 5, hci.principals: tenant isolation and the deliberately
-- narrow GRANT UPDATE (display_name)-only both had zero coverage of their
-- own until this pass (same "db-expert found the gap" pattern already
-- documented above for hci.decisions/hci.cases). PRINCIPAL-SCOPE-01 proves
-- tenant_id is unwritable at the grant layer alone, independent of
-- principals_tenant_immutable's own trigger-layer proof (TENANT-IMMUTABLE-02,
-- owner-run section below - the two are deliberately redundant, matching
-- BITEMP-CLOCK-0x's own belt-and-suspenders shape).
SELECT hci_test.expect_true('RLS-LEAK-05',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.principals WHERE id = 'bbbbbbbb-0000-0000-0000-000000000850')$q$,
  'tenant B principal must not be visible to tenant A');
SELECT hci_test.expect_sqlstate('PRINCIPAL-SCOPE-01',
  $q$UPDATE hci.principals SET tenant_id = '22222222-2222-2222-2222-222222222222' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000850'$q$,
  '42501');
-- GRANT INSERT (id, tenant_id, display_name) had no app-role exercise at
-- all - every existing hci.principals row up to this point (fixtures) was
-- owner-inserted, so a fully revoked INSERT grant would have gone
-- undetected. New id (...851) rather than reusing the fixture row, since
-- RLS does not care who inserted a row but INSERT itself must be proven.
SELECT hci_test.expect_success('PRINCIPAL-INSERT-01',
  $q$INSERT INTO hci.principals (id,tenant_id,display_name)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000851','11111111-1111-1111-1111-111111111111','App-role-inserted analyst')$q$);

-- hci.decision_claims: tenant B's fixture link (RLS-LEAK-06) mirrors
-- RLS-LEAK-04's decisions coverage; the GRANT-layer append-only proof
-- (APPEND-ONLY-GRANT-11/12) needs no existing row - a column-privilege
-- error fires before any row is matched, exactly like APPEND-ONLY-GRANT-05..10.
SELECT hci_test.expect_true('RLS-LEAK-06',
  $q$SELECT NOT EXISTS (SELECT 1 FROM hci.decision_claims WHERE id = 'bbbbbbbb-0000-0000-0000-000000000920')$q$,
  'tenant B decision_claims link must not be visible to tenant A');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-11',
  $q$UPDATE hci.decision_claims SET claim_kind = 'CLAIM'$q$, '42501');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-GRANT-12',
  $q$DELETE FROM hci.decision_claims$q$, '42501');
-- db-expert review (2026-09-05, M2): created_at withheld from the INSERT
-- grant (mirrors CREATED-AT-01 for data_subject_request_events) - without
-- it, decision_claims would have been the one append-only ledger in this
-- schema whose own insertion timestamp the audited party could choose. A
-- dedicated, not-yet-linked claim (not '...302', already linked to '...601'
-- by DECISION-CLAIMS-SETUP-01 below) - reusing that pair would hit the
-- UNIQUE(tenant_id,decision_id,claim_id) constraint instead of proving
-- anything about the created_at grant once privilege is restored.
SELECT hci_test.expect_success('DECISION-CLAIMS-CREATEDAT-SETUP-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000927','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_sqlstate('DECISION-CLAIMS-CREATEDAT-01',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id,created_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000926','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','aaaaaaaa-0000-0000-0000-000000000927','1999-01-01T00:00:00Z')$q$,
  '42501');
-- db-expert review (2026-09-05, m1): the whole gate-4 link mechanism had
-- only ever been exercised from the owner (superuser) session - every
-- decision_claims INSERT elsewhere in this file runs after RESET ROLE. That
-- gap is exactly what hid a real regression found while fixing C3: adding
-- `FOR SHARE` to enforce_decision_reaudit_gate() made it require UPDATE
-- privilege on hci.subject_records, which the application role never has
-- (append-only by design) - every app-role link would have raised 42501
-- instead of ever reaching gate 3/4's own logic, and nothing in this suite
-- would have noticed. Fixed by making that function SECURITY DEFINER
-- (matching flag_claims_on_risk_elevation()'s own posture); this is the
-- real-app-role proof that the fix actually restores a working link path,
-- not just that it fails correctly under privilege tests above.
SELECT hci_test.expect_success('DECISION-CLAIMS-INSERT-01',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000928','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','aaaaaaaa-0000-0000-0000-000000000927')$q$);

-- ADR-0019 hardening (2026-09-05, M7): human_spotcheck_status='APPROVED'
-- must name which human. subject_records_spotcheck_principal_required
-- (any CLAIM APPROVED without a principal) and _scoped (spotcheck_principal_id
-- on a non-CLAIM row) both proven directly, no mutation needed.
SELECT hci_test.expect_sqlstate('SPOTCHECK-PRINCIPAL-REQUIRED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000930','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('SPOTCHECK-PRINCIPAL-SCOPE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,author_class,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000931','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ASSESSMENT','aaaaaaaa-0000-0000-0000-000000000200','PROBABILISTIC','aaaaaaaa-0000-0000-0000-000000000850')$q$,
  '23514');
-- Targets a REAL tenant-B principal (fixtures: 'bbbbbbbb-...-850'), same
-- reasoning as every other CROSSTENANT test in this file: proves the
-- composite FK rejects a genuine cross-tenant reference, not merely an id
-- that does not exist anywhere.
SELECT hci_test.expect_sqlstate('SPOTCHECK-PRINCIPAL-CROSSTENANT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000932','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','bbbbbbbb-0000-0000-0000-000000000850')$q$,
  '23503');

-- ADR-0019 hardening (2026-09-05, M8): the two composite FKs 0008 already
-- built (decisions_principal_fk, decision_claims' claim/decision FKs) had
-- zero direct test coverage of the cross-tenant/typed-pin behavior their
-- composite shape exists to provide - the exact gap TARGET-KIND-01b/
-- BITEMP-CROSSTENANT-01/CRYPTO-CROSSTENANT-KEYREF-01 already close for
-- every other composite FK in this schema.
SELECT hci_test.expect_sqlstate('DECISION-PRINCIPAL-CROSSTENANT-01',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000605','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','cross-tenant principal probe','HUMAN_ONLY','bbbbbbbb-0000-0000-0000-000000000850')$q$,
  '23503');

-- hci.record_decision() (migration 0014) - a SEPARATE, narrower write path
-- next to the raw INSERT grant the tests above already exercise (see that
-- migration's header for why both coexist). Tests here prove ITS OWN
-- tenant-isolation logic specifically, not the composite FK above - a
-- db-expert review (2026-09-08) found this coverage did not exist at all,
-- verified only by a throwaway, non-committed probe. RECORD-DECISION-
-- CROSSTENANT-CASE-01/-PRINCIPAL-01 must each go red if the corresponding
-- EXISTS check in that function's body is ever deleted (see
-- mutation-check-wave1.ps1's matching entries).
SELECT hci_test.expect_success('RECORD-DECISION-HAPPY-01',
  $q$SELECT hci.record_decision('aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000850','REVIEW_REQUIRED','record_decision() happy-path probe')$q$);
SELECT hci_test.expect_sqlstate('RECORD-DECISION-CROSSTENANT-CASE-01',
  $q$SELECT hci.record_decision('bbbbbbbb-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000850','REVIEW_REQUIRED','cross-tenant case_id probe')$q$,
  'H1020');
SELECT hci_test.expect_sqlstate('RECORD-DECISION-CROSSTENANT-PRINCIPAL-01',
  $q$SELECT hci.record_decision('aaaaaaaa-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000850','REVIEW_REQUIRED','cross-tenant principal_id probe')$q$,
  'H1021');

-- Real-Docker correction (2026-09-05): the first version of the two
-- claim-side tests below expected 23503 and got H1016. A BEFORE ROW trigger
-- runs before the row exists, RI checks run after - so for a cross-tenant
-- or non-CLAIM claim_id, enforce_decision_reaudit_gate()'s own
-- tenant-scoped claim lookup (no row / claim_state NULL -> H1016) rejects
-- the statement before PostgreSQL ever evaluates the composite FK. That
-- makes the claim-side FK defense in depth BEHIND the gate trigger, and
-- these two app-role assertions prove the OUTER layer. The FK itself is
-- proven separately, owner-run with the trigger stripped, in the
-- '-FK' pair further down. The decision-side FK (CROSSTENANT-02) needs no
-- such split: the trigger's decision lookup returning no row is not itself
-- an error, so that statement genuinely reaches the FK.
SELECT hci_test.expect_sqlstate('DECISION-CLAIMS-CROSSTENANT-01-GATE',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000934','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','bbbbbbbb-0000-0000-0000-000000000501')$q$,
  'H1016');
SELECT hci_test.expect_sqlstate('DECISION-CLAIMS-CROSSTENANT-02',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000935','11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000600','aaaaaaaa-0000-0000-0000-000000000927')$q$,
  '23503');
-- claim_id points at a REAL row that exists but is kind=EVIDENCE, not CLAIM.
-- At this (outer) layer the gate rejects it because an EVIDENCE row has no
-- claim_state; the composite FK's claim_kind pin is the inner layer, proven
-- by DECISION-CLAIMS-KIND-01-FK below (TARGET-KIND-01b's exact shape).
SELECT hci_test.expect_sqlstate('DECISION-CLAIMS-KIND-01-GATE',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000936','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','aaaaaaaa-0000-0000-0000-000000000101')$q$,
  'H1016');

-- ADR-0019 hardening (2026-09-05, m4): hci.principals keeps a DELETE grant
-- (unlike INSERT/UPDATE, never narrowed) with no test that the FK's NO
-- ACTION default actually blocks deleting a principal a Decision still
-- references - '...850' is referenced by every decisions_principal_fk row
-- in this file.
SELECT hci_test.expect_sqlstate('PRINCIPAL-DELETE-RI-01',
  $q$DELETE FROM hci.principals WHERE id = 'aaaaaaaa-0000-0000-0000-000000000850'$q$,
  '23503');

-- ADR-0019 hardening (2026-09-05, m2): 0008's six paired CHECK constraints
-- (claim_state/human_spotcheck_status/reaudit_required, each *_scoped +
-- *_required) had no direct assertion and no mutation - controls reported
-- closed and never verified, against this suite's own doctrine. The four
-- reachable from the application role are here; the two reaudit_required
-- ones need the owner (the column is outside the app INSERT grant, and the
-- default is trigger-assigned) and sit in the owner-run section.
SELECT hci_test.expect_sqlstate('CHECK-CLAIMSTATE-SCOPED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000939','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC','DRAFT')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('CHECK-CLAIMSTATE-REQUIRED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000940','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','PENDING')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('CHECK-SPOTCHECK-SCOPED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000941','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC','PENDING')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('CHECK-SPOTCHECK-REQUIRED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000942','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT')$q$,
  '23514');

-- ---------------------------------------------------------------------------
-- Epistemic-label promotion redline (ADR-0019 gate 5, second half;
-- migration 0010). "Promotion" on an append-only table is a superseding row
-- (ADR-0017), so NEG-HD08-04 is an INSERT with supersedes_id, never an
-- UPDATE. All app-role reachable: both columns are in the INSERT grant.
-- ---------------------------------------------------------------------------
-- A Claim born unlabelled is UNKNOWN (trigger default - the least-trusted
-- state is the only safe default), not NULL and not an error.
SELECT hci_test.expect_success('EPISTEMIC-DEFAULT-SETUP-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000945','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING')$q$);
SELECT hci_test.expect_true('EPISTEMIC-DEFAULT-01',
  $q$SELECT epistemic_label = 'UNKNOWN' FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000945'$q$,
  'a Claim inserted without an epistemic_label must default to UNKNOWN');
-- Value set is the ADR-0013 kernel's 11 values verbatim; 'FACT' is exactly
-- the bare literal the kernel's own promotion_redline note says exists in
-- no enum.
SELECT hci_test.expect_sqlstate('EPISTEMIC-VALUESET-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000946','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','FACT')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('EPISTEMIC-SCOPED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000947','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC','UNKNOWN')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('EPISTEMIC-VERIFIER-SCOPED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,epistemic_verifier_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000948','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC','aaaaaaaa-0000-0000-0000-000000000850')$q$,
  '23514');
-- Born SOURCE_FACT with no predecessor: the promotion-only rule would never
-- see it, so the CHECK is what closes that bypass (the class 0008's C1/C2
-- review findings were about).
SELECT hci_test.expect_sqlstate('EPISTEMIC-SOURCEFACT-VERIFIER-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000949','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','SOURCE_FACT')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('EPISTEMIC-VERIFIER-CROSSTENANT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label,epistemic_verifier_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000950','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','SOURCE_FACT','bbbbbbbb-0000-0000-0000-000000000850')$q$,
  '23503');
-- NEG-HD08-04 (ADR-0019 gate 5): UNKNOWN -> SOURCE_FACT with no human
-- verifier is the forbidden direct promotion.
SELECT hci_test.expect_sqlstate('NEG-HD08-04',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000951','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000945','promoted without anyone checking','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','SOURCE_FACT')$q$,
  'H1019');
SELECT hci_test.expect_success('EPISTEMIC-HYPOTHESIS-SETUP-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000952','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','HYPOTHESIS')$q$);
SELECT hci_test.expect_sqlstate('NEG-HD08-04b',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000953','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000952','hypothesis promoted without anyone checking','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','SOURCE_FACT')$q$,
  'H1019');
-- A gate that rejects every promotion is also broken: the legal path
-- ("via Human Validation") must succeed with a named verifier.
SELECT hci_test.expect_success('EPISTEMIC-PROMOTE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label,epistemic_verifier_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000954','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000952','verified by analyst','aaaaaaaa-0000-0000-0000-000000000800','HUMAN_ONLY','DRAFT','PENDING','SOURCE_FACT','aaaaaaaa-0000-0000-0000-000000000850')$q$);
-- An unlabelled correction of a SOURCE_FACT keeps both the label and the
-- human who attested it - never a silent demotion to UNKNOWN, never a
-- SOURCE_FACT with the verifier dropped on the floor.
SELECT hci_test.expect_success('EPISTEMIC-INHERIT-SETUP-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class,claim_state,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000955','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000954','metadata correction','aaaaaaaa-0000-0000-0000-000000000800','HUMAN_ONLY','DRAFT','PENDING')$q$);
SELECT hci_test.expect_true('EPISTEMIC-INHERIT-01',
  $q$SELECT epistemic_label = 'SOURCE_FACT' AND epistemic_verifier_principal_id = 'aaaaaaaa-0000-0000-0000-000000000850'
       FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000955'$q$,
  'an unlabelled superseding row must inherit its predecessor''s epistemic_label and verifier together');

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Append-only ledgers, TRIGGER layer.
-- Runs as the owner, whose privileges bypass the grant layer entirely. This is
-- the half of "defense in depth" that a grants-only implementation would miss.
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-01',
  $q$UPDATE hci.data_subject_request_events SET detail = 'mutated-by-owner'$q$, 'H1003');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-02',
  $q$DELETE FROM hci.subject_records$q$, 'H1003');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-03',
  $q$UPDATE hci.source_snapshots SET content_hash = 'mutated-by-owner'$q$, 'H1003');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-04',
  $q$DELETE FROM hci.source_relationships$q$, 'H1003');
-- hci.decisions' trigger layer: targets '...600', already superseded by
-- '...601' above - reject_update_delete()'s shape check only lets through an
-- UPDATE that touches system_superseded_at and nothing else, so an UPDATE to
-- 'outcome' is rejected regardless of the row's current supersession state.
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-05',
  $q$UPDATE hci.decisions SET outcome = 'EXIT' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000600'$q$, 'H1003');

-- hci.decision_claims' trigger layer, plus hci.principals' tenant-immutable
-- trigger, had zero owner-bypass coverage of their own (APPEND-ONLY-GRANT-
-- 11/12 above only prove the grant layer; an owner connection bypasses
-- grants entirely, exactly the gap APPEND-ONLY-TRIGGER-01..05 already close
-- for every other append-only table). Setup links decision '...601'
-- (tenant A, still outcome=PROCEED, superseded-FROM but not itself
-- superseded) to CLAIM-FIXTURE-01 ('...302', case '...200' - untouched by
-- NEG-HD08-02-ELEVATE's separate case '...219', so its reaudit_required
-- stays false and the link is not itself rejected by H1015).
SELECT hci_test.expect_success('DECISION-CLAIMS-SETUP-01',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000921','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','aaaaaaaa-0000-0000-0000-000000000302')$q$);
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-06',
  $q$UPDATE hci.decision_claims SET created_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000921'$q$, 'H1003');
SELECT hci_test.expect_sqlstate('APPEND-ONLY-TRIGGER-07',
  $q$DELETE FROM hci.decision_claims$q$, 'H1003');
SELECT hci_test.expect_sqlstate('TENANT-IMMUTABLE-02',
  $q$UPDATE hci.principals SET tenant_id = '22222222-2222-2222-2222-222222222222' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000850'$q$,
  'H1006');

-- ADR-0019 hardening (2026-09-05, M8, inner layer): the claim-side
-- composite FK on hci.decision_claims sits BEHIND enforce_decision_reaudit_gate()
-- (see the '-GATE' pair in the app-role section for why). Proving the FK on
-- its own means removing the outer layer for exactly these two statements:
-- owner-run, user triggers on the table disabled then re-enabled - the same
-- "strip the outer layer to reach the inner one" idea APPEND-ONLY-TRIGGER-0x
-- uses when the owner bypasses the grant layer. DISABLE TRIGGER as a
-- *production* escape hatch was rejected in 0005's header; here it is a
-- test-isolation tool only, never part of the schema, and it is restored
-- two statements later. `USER` rather than the trigger's name so this
-- block cannot itself error under the mutation that drops that trigger.
ALTER TABLE hci.decision_claims DISABLE TRIGGER USER;
SELECT hci_test.expect_sqlstate('DECISION-CLAIMS-CROSSTENANT-01-FK',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000937','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','bbbbbbbb-0000-0000-0000-000000000501')$q$,
  '23503');
SELECT hci_test.expect_sqlstate('DECISION-CLAIMS-KIND-01-FK',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000938','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','aaaaaaaa-0000-0000-0000-000000000101')$q$,
  '23503');
ALTER TABLE hci.decision_claims ENABLE TRIGGER USER;

-- ADR-0019 hardening (2026-09-05, m2, owner-run half): reaudit_required is
-- outside the application INSERT grant, so only the owner can put a value
-- on a non-CLAIM row (scoped), and its NOT-NULL-for-CLAIM constraint is
-- normally satisfied by enforce_claim_state_admission() before the CHECK
-- ever sees the row - so proving the CHECK itself means stripping that
-- trigger for exactly one statement, the same isolation the '-FK' pair
-- above uses.
SELECT hci_test.expect_sqlstate('CHECK-REAUDIT-SCOPED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,reaudit_required)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000943','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC',false)$q$,
  '23514');
ALTER TABLE hci.subject_records DISABLE TRIGGER USER;
-- epistemic_label supplied explicitly (migration 0010 landed after this
-- test - with user triggers disabled its own default no longer fires
-- either, and an unrelated NULL there would mask which CHECK actually
-- rejects the row behind the same 23514 SQLSTATE; real-Docker run found
-- this, 2026-09-05).
SELECT hci_test.expect_sqlstate('CHECK-REAUDIT-DEFAULT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,epistemic_label)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000944','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING','UNKNOWN')$q$,
  '23514');
ALTER TABLE hci.subject_records ENABLE TRIGGER USER;

-- ADR-0019 hardening (2026-09-05, M4 + search_path suggestion), asserted
-- generically over pg_proc - no hardcoded function list, so a future
-- SECURITY DEFINER function or any new function is covered automatically.
-- row_security=off is what makes a definer FAIL CLOSED (hard error) instead
-- of silently matching zero rows if this schema is ever owned by a
-- non-superuser under FORCE ROW LEVEL SECURITY; see 0009's own M4 comment.
SELECT hci_test.expect_true('DEFINER-RLS-FAILCLOSED-01',
  $q$SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'hci' AND p.prosecdef)
       AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'hci' AND p.prosecdef
                          AND NOT (coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['row_security=off']))$q$,
  'every SECURITY DEFINER function in hci must carry row_security=off so it fails closed, never silently filtered, under FORCE RLS with a non-superuser owner');
SELECT hci_test.expect_true('FUNCTION-SEARCHPATH-01',
  $q$SELECT NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'hci'
                          AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                                           WHERE c LIKE 'search_path=%'))$q$,
  'every function in hci must pin search_path');

-- Epistemic label (0010), owner-run half: subject_records_epistemic_required
-- is normally satisfied by the trigger default before the CHECK sees the
-- row, so - like CHECK-REAUDIT-DEFAULT-01 - it is proven with the table's
-- user triggers stripped for one statement (reaudit_required supplied
-- explicitly so only the epistemic CHECK can be the one that fails).
ALTER TABLE hci.subject_records DISABLE TRIGGER USER;
SELECT hci_test.expect_sqlstate('EPISTEMIC-REQUIRED-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,reaudit_required)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000956','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING',false)$q$,
  '23514');
ALTER TABLE hci.subject_records ENABLE TRIGGER USER;

-- TRUNCATE does not fire row-level triggers and is a separate privilege, so it
-- is the one statement that would otherwise walk past both layers at once.
SELECT hci_test.expect_sqlstate('TRUNCATE-01',
  $q$TRUNCATE hci.data_subject_request_events$q$, 'H1003');
-- subject_records is referenced by a foreign key, and PostgreSQL refuses that
-- TRUNCATE before any trigger runs. Recorded as its own layer rather than
-- relabelled as trigger evidence: TRUNCATE-01 is what proves the trigger.
SELECT hci_test.expect_sqlstate('TRUNCATE-02-FK',
  $q$TRUNCATE hci.subject_records$q$, '0A000');
-- source_relationships has an FK to source_snapshots (source_snapshot_id) -
-- the constraint blocks TRUNCATE hci.source_snapshots regardless of whether
-- any row actually uses that column, exactly TRUNCATE-02-FK's shape (real
-- Docker run corrected the original prediction here from H1003 to 0A000,
-- the same "PostgreSQL refuses before any trigger runs" fact already
-- documented for subject_records above). source_relationships itself is not
-- referenced by any FK, so it alone reaches the trigger directly
-- (TRUNCATE-01's shape).
SELECT hci_test.expect_sqlstate('TRUNCATE-03-FK',
  $q$TRUNCATE hci.source_snapshots$q$, '0A000');
SELECT hci_test.expect_sqlstate('TRUNCATE-04',
  $q$TRUNCATE hci.source_relationships$q$, 'H1003');
-- Real-Docker correction (ADR-0019 landing): hci.decisions was NOT
-- referenced by any FK when this test was first written, but
-- hci.decision_claims now references it (migrations/0008), so this flips
-- from TRUNCATE-01/04's shape to TRUNCATE-02/03's - PostgreSQL refuses the
-- TRUNCATE before any trigger runs, same as those two.
SELECT hci_test.expect_sqlstate('TRUNCATE-05-FK',
  $q$TRUNCATE hci.decisions$q$, '0A000');
-- hci.decision_claims is not referenced by any FK of its own, so it reaches
-- its no_truncate trigger directly - TRUNCATE-01/04's shape, not
-- TRUNCATE-02/03/05's.
SELECT hci_test.expect_sqlstate('TRUNCATE-06',
  $q$TRUNCATE hci.decision_claims$q$, 'H1003');

-- hci.cases' owner-bypass layer (2026-09-04 critic review): the original
-- migration gave hci.cases a grant layer only, unlike every other protected
-- table in this schema, which get both layers from 0001's declarative
-- append_only/no_delete lists (0001:284-293). These prove the INSERT-side
-- lifecycle guard and the DELETE guard both hold for a connection whose
-- privileges bypass grants entirely.
SELECT hci_test.expect_sqlstate('CASE-LIFECYCLE-TRIGGER-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context,status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000221','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R0','synthetic fixture','ACTIVE')$q$,
  'H1010');

SELECT hci_test.expect_success('CASE-NODELETE-TRIGGER-SETUP-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000222','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence',
             'R0','synthetic fixture')$q$);
SELECT hci_test.expect_sqlstate('CASE-NODELETE-TRIGGER-01',
  $q$DELETE FROM hci.cases WHERE id = 'aaaaaaaa-0000-0000-0000-000000000222'$q$,
  'H1003');

-- ---------------------------------------------------------------------------
-- Regulatory market scope (ADR-0012, HD-20) - jurisdiction deny-list. Owner
-- section: the app role has SELECT-only on hci.tenants (0001:371, tenants are
-- provisioned out-of-band, not self-service), so these can only be exercised
-- as the owner - which doubles as proof the CHECK binds even a connection
-- that bypasses every grant, unlike the grant-only protections elsewhere in
-- this schema.
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_sqlstate('REG-NEG-01',
  $q$INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES ('cccccccc-0000-0000-0000-000000000001','tenant-de','DE')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-02',
  $q$INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES ('cccccccc-0000-0000-0000-000000000002','tenant-fr','FR')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-03',
  $q$INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES ('cccccccc-0000-0000-0000-000000000003','tenant-gb','GB')$q$,
  '23514');
-- 2026-09-05 db-expert review: 'GB' alone left the more common free-text
-- spelling 'UK' untested (and, before the fix, unblocked - see 0003's
-- header). Also proves the upper(btrim(...)) normalization, not just the
-- literal list: lowercase input must still be denied.
SELECT hci_test.expect_sqlstate('REG-NEG-11',
  $q$INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES ('cccccccc-0000-0000-0000-000000000004','tenant-uk','UK')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-12',
  $q$INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES ('cccccccc-0000-0000-0000-000000000005','tenant-de-lower','de')$q$,
  '23514');

-- REG-NEG-09 is the real-Docker proof behind migration 0003's "Gate 3
-- disposition" comment for its OWNER-BYPASS half: a CHECK constraint (unlike
-- a GRANT or a trigger that could in principle be dropped or a role that
-- could in principle bypass grants) is validated unconditionally on every
-- write to its own table, including one made as the table owner. There is no
-- connection, privilege level, or insert path that reaches a row violating
-- this CHECK - which is exactly why no defense-in-depth trigger is needed the
-- way DELETE/TRUNCATE needed cases_no_delete/cases_no_truncate above (grants
-- alone do not stop an owner-level DELETE; this CHECK alone already stops an
-- owner-level insert). This specific assertion exercises gate 2 (purpose);
-- REG-NEG-10 below exercises the same claim for gate 1 (jurisdiction) via the
-- specific "bulk-insert style" path ADR-0012:37 named.
SELECT hci_test.expect_sqlstate('REG-NEG-09',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000228','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','employment_screening','R1','synthetic fixture, owner bypass attempt')$q$,
  '23514');

-- REG-NEG-10: the actual "bulk-insert style" bypass ADR-0012:37 named -
-- attempting to admit a research_workflows row against an excluded-
-- jurisdiction tenant. 10a confirms (again, with its own fresh id so this
-- test does not depend on REG-NEG-01 having run first) that such a tenant
-- cannot exist at all; 10b then attempts the research_workflows insert
-- against that same, never-created tenant_id.
--
-- Expects H1001, not 23503 (real-Docker result, not the FK violation this
-- comment originally predicted before running it): research_workflows'
-- BEFORE-INSERT triggers fire in alphabetical order (already relied on
-- elsewhere in this file, e.g. CASE-CLOSED-GUARD-01's comment), and
-- 'research_workflows_require_active_authorization' ('...require_a...',
-- 0001:114) sorts before 'research_workflows_require_open_or_active_case'
-- ('...require_o...', 0002:213) - both fire before any constraint (FK
-- included) is ever checked. No tenant_authorization row can have
-- tenant_id = the never-created tenant, so that trigger's own NOT EXISTS
-- check fails first and raises H1001, before the FK on tenant_id even gets a
-- chance to fire. This is a stronger result than the FK alone would have
-- been: TWO independent, pre-existing gates (the authorization check and the
-- tenant FK) both block this specific bypass attempt redundantly, not just
-- the one this test set out to exercise.
SELECT hci_test.expect_sqlstate('REG-NEG-10a',
  $q$INSERT INTO hci.tenants (id,slug,jurisdiction) VALUES ('cccccccc-0000-0000-0000-000000000006','tenant-de-bulk','DE')$q$,
  '23514');
SELECT hci_test.expect_sqlstate('REG-NEG-10b',
  $q$INSERT INTO hci.research_workflows (id,tenant_id,tenant_authorization_id,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000229','cccccccc-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000200')$q$,
  'H1001');

-- ---------------------------------------------------------------------------
-- Peer-product database boundary (ADR-0001 gate 2 / ADR-0002 gate 1, reused;
-- ADR-0005 gate 1 "no hard schema dependency" is a strict subset of this
-- same check - any NOT NULL FK into a cognitive-os entity is necessarily a
-- pg_constraint of type 'f' crossing schema hci, which ARCH-PEER-02 already
-- forbids unconditionally). Owner section: this is a database-wide
-- introspection check, not a tenant-role-scoped one, so it belongs with the
-- other owner-run architecture assertions rather than under SET ROLE.
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_true('ARCH-PEER-02',
  $q$SELECT
       NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname IN ('postgres_fdw','dblink'))
       AND NOT EXISTS (SELECT 1 FROM pg_foreign_server)
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint c
         JOIN pg_class rel ON rel.oid = c.confrelid
         JOIN pg_namespace refns ON refns.oid = rel.relnamespace
         WHERE c.contype = 'f' AND c.connamespace = 'hci'::regnamespace AND refns.nspname <> 'hci'
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_namespace n
         WHERE n.nspname NOT IN ('hci','hci_test','pg_catalog','public','information_schema')
           AND n.nspname !~ '^pg_(toast|temp)'
       )$q$,
  'no database-level coupling to another product: no fdw/dblink extension, no foreign server, no FK from schema hci crossing out of it, no schema besides hci/hci_test/PostgreSQL defaults');

-- ADR-0002 gate 3: credential/network isolation is the operational half of
-- ARCH-PEER-02 - that gate proves no FK crosses the boundary, this one
-- proves no shared login role could bypass RLS to cross it even without one.
SELECT hci_test.expect_true('ARCH-PEER-02b',
  $q$SELECT
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname ~* '(cognitive|lego)')
       AND NOT EXISTS (
         SELECT 1 FROM pg_roles
          WHERE rolname NOT IN ('hci_owner','hci_app_test_a','hci_app_test_b')
            AND rolname !~ '^pg_'
       )$q$,
  'credential isolation: only the known Wave 1 roles plus PostgreSQL built-ins exist, none matching cognitive/lego');

-- ADR-0017 gate 4: BITEMP-SCOPE-01, the machine form of Decision item 2 -
-- "no valid_*/system_* bitemporal columns may be populated outside
-- subject_records/decisions, and every other tenant-owned table carries
-- exactly one server-assigned insertion-timestamp column." Two independent
-- checks, both against information_schema (no hardcoded table list to go
-- stale as new tables are added): (1) valid_from/system_recorded_at exist
-- on no BASE TABLE except the two named; (2) every other BASE TABLE that has
-- its own tenant_id column also has at least one NOT NULL timestamptz column
-- defaulting to now() - the generic form of "created_at", matching that a
-- domain-appropriate name (opened_at, retrieved_at) satisfies this too
-- (ADR-0017:24). app_tenant_bindings is excluded by name even though it has
-- a tenant_id column - see migration 0006's own header for why (it is
-- infrastructure, never granted to the application roles at all, not domain
-- data in the sense this gate is about).
SELECT hci_test.expect_true('BITEMP-SCOPE-01',
  $q$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'hci' AND c.column_name IN ('valid_from','system_recorded_at')
        AND c.table_name NOT IN ('subject_records','decisions')
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'hci' AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT IN ('subject_records','decisions','app_tenant_bindings')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'hci' AND c.table_name = t.table_name AND c.column_name = 'tenant_id'
        )
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema = 'hci' AND c2.table_name = t.table_name
            AND c2.data_type = 'timestamp with time zone' AND c2.is_nullable = 'NO'
            AND c2.column_default LIKE 'now()%'
        )
    )
  $q$,
  'bitemporal columns confined to subject_records/decisions; every other tenant-owned table carries a server-assigned insertion timestamp');

-- ADR-0018 gate 1: the application roles hold zero grant of any kind on
-- hci.data_encryption_keys - the default-deny state IS the control, not RLS
-- (see migration 0007's own header for why RLS is deliberately omitted here).
SELECT hci_test.expect_true('CRYPTO-KEYGRANT-01',
  $q$SELECT NOT EXISTS (
       SELECT 1 FROM information_schema.role_table_grants
       WHERE table_schema = 'hci' AND table_name = 'data_encryption_keys'
         AND grantee IN ('hci_app_test_a','hci_app_test_b')
     )$q$,
  'application roles hold zero grants on hci.data_encryption_keys');

-- ADR-0018 gate 3: hci.tombstone_evidence() is not app-role-callable at Wave
-- 1 (matching hci.mark_superseded()'s own PUBLIC-revoked posture) - it is
-- meant to be called by hci.record_erasure() (Wave 4, gate 5, not built
-- here), so tested directly as owner, simulating what that future caller
-- will do. A dedicated row (not one reused from an earlier section) avoids
-- any doubt about interference with already-recorded assertion outcomes.
SELECT hci_test.expect_success('CRYPTO-TOMBSTONE-SETUP',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000903','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$);
SELECT hci_test.expect_success('CRYPTO-TOMBSTONE-02-SETUP',
  $q$SELECT hci.tombstone_evidence('aaaaaaaa-0000-0000-0000-000000000903')$q$);
SELECT hci_test.expect_sqlstate('CRYPTO-TOMBSTONE-02',
  $q$SELECT hci.tombstone_evidence('aaaaaaaa-0000-0000-0000-000000000903')$q$,
  'H1009');

-- The effect-based shape check (0005's design, extended by 0007) does not
-- merely check "did tombstoned_at change" - it requires NOTHING else
-- changed too. An UPDATE that changes tombstoned_at AND another column
-- together must still be rejected, even run as owner: this is the
-- "wrong shape" proof BITEMP-IMMUTABLE-01 never exercised for
-- system_superseded_at either (it only ever tested app-role/grant-layer
-- rejection) - the 'weaken-tombstone-shape-check' mutation below is what
-- proves this assertion is load-bearing, not merely descriptive.
SELECT hci_test.expect_sqlstate('CRYPTO-TOMBSTONE-SHAPE-01',
  $q$UPDATE hci.subject_records SET tombstoned_at = now(), case_id = 'aaaaaaaa-0000-0000-0000-000000000201'
     WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'$q$,
  'H1003');

-- ADR-0019 gate 4, NEG-HD08-02: recording a Decision while a flagged Claim
-- is unresolved must be rejected. A dedicated case (not one of the shared
-- fixture cases) isolates this sequence's risk_tier elevation from every
-- other test that assumes its own case's tier never changes.
SELECT hci_test.expect_success('NEG-HD08-02-SETUP-CASE',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000219','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','reaudit gate probe')$q$);
SELECT hci_test.expect_success('NEG-HD08-02-SETUP-CLAIM',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000916','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000219','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','aaaaaaaa-0000-0000-0000-000000000850')$q$);
-- Positive proof the cascade actually fires, not just its downstream effect:
-- reaudit_required starts false (subject_records_reaudit_required_default
-- forces every Claim to have an explicit boolean, defaulted false by the
-- application layer's own insert convention here) and must flip to true
-- purely from the risk_tier UPDATE below, with no direct write to the Claim
-- row at all.
SELECT hci_test.expect_success('NEG-HD08-02-ELEVATE',
  $q$UPDATE hci.cases SET risk_tier = 'R2' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000219'$q$);
SELECT hci_test.expect_true('NEG-HD08-02-FLAGGED',
  $q$SELECT reaudit_required FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000916'$q$,
  'risk_tier elevation must flag the linked Claim for reaudit, with no direct write to the Claim row');
SELECT hci_test.expect_success('NEG-HD08-02-SETUP-DECISION',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000917','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000219','PROCEED','reaudit gate probe','HUMAN_ONLY','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_sqlstate('NEG-HD08-02',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000918','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000917','aaaaaaaa-0000-0000-0000-000000000916')$q$,
  'H1015');

-- db-expert review (2026-09-05, C2): a correcting/superseding row must
-- inherit its predecessor's reaudit_required rather than resetting to
-- false - proven directly against '...916' (already flagged true above by
-- NEG-HD08-02-ELEVATE), on the same case so no new risk_tier plumbing is
-- needed.
SELECT hci_test.expect_success('NEG-HD08-05-SUPERSEDE-SETUP',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000925','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000219','aaaaaaaa-0000-0000-0000-000000000916','re-checked after elevation','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_true('NEG-HD08-05',
  $q$SELECT reaudit_required FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000925'$q$,
  'a Claim superseding an already-flagged predecessor must inherit reaudit_required=true, not reset to false');

-- db-expert review (2026-09-05, C1): gate 3's claim_state/human_spotcheck_status
-- state machine had no downstream consumer until enforce_decision_reaudit_gate()
-- was given this check - a DRAFT, never-spot-checked Claim must not be
-- linkable to any Decision at all, independent of reaudit_required.
SELECT hci_test.expect_success('NEG-HD08-06-SETUP-CLAIM',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000919','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','DRAFT','PENDING')$q$);
SELECT hci_test.expect_sqlstate('NEG-HD08-06',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000924','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000601','aaaaaaaa-0000-0000-0000-000000000919')$q$,
  'H1016');

-- db-expert review (2026-09-05, C3): the elevate->link ordering was already
-- guarded (NEG-HD08-02 above); this proves the reverse, previously
-- unguarded, link->elevate ordering. Dedicated case/claim/decision (not the
-- shared fixture case) so this elevation cannot collide with any other
-- test's assumption about its own case's tier.
SELECT hci_test.expect_success('NEG-HD08-07-SETUP-CASE',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000230','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','general_due_diligence','R1','link-then-elevate probe')$q$);
SELECT hci_test.expect_success('NEG-HD08-07-SETUP-CLAIM',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,encryption_key_ref,author_class,claim_state,human_spotcheck_status,spotcheck_principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000922','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000230','aaaaaaaa-0000-0000-0000-000000000800','LLM_ASSISTED_HUMAN_REVIEW_REQUIRED','ASSESSMENT_CANDIDATE','APPROVED','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_success('NEG-HD08-07-SETUP-DECISION',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,author_class,principal_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000604','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000230','PROCEED','link-then-elevate probe','HUMAN_ONLY','aaaaaaaa-0000-0000-0000-000000000850')$q$);
SELECT hci_test.expect_success('NEG-HD08-07-SETUP-LINK',
  $q$INSERT INTO hci.decision_claims (id,tenant_id,decision_id,claim_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000923','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000604','aaaaaaaa-0000-0000-0000-000000000922')$q$);
SELECT hci_test.expect_sqlstate('NEG-HD08-07',
  $q$UPDATE hci.cases SET risk_tier = 'R2' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000230'$q$,
  'H1017');

-- ADR-0018 gate 6: the machine form of "key material never leaves
-- PostgreSQL in Wave 1". Broader than ARCH-PEER-02 (which checks dblink/
-- postgres_fdw for peer-product isolation, a different ADR's reason) - adds
-- 'http' and, new here, a prosrc scan proving no hci function body calls a
-- network-capable primitive by name, not just that no such extension is
-- installed.
SELECT hci_test.expect_true('CRYPTO-NOEXTERNAL-01',
  $q$SELECT
      NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname IN ('dblink','postgres_fdw','http'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'hci' AND p.prosrc ~* '(dblink|http_get|http_post|pg_read_server_files|program\s)'
      )
  $q$,
  'no network-capable extension installed; no hci function body calls one');

-- ---------------------------------------------------------------------------
-- ADR-0004 (No Universal Human Trust Score) Wave 1 gates 1-3, migration 0011.
-- TARGET-KIND-01a above (retrofitted) is the base positive case: a
-- TRUST_DOMAIN row with domain + a typed evidence reference persists. What
-- follows proves every new CHECK/FK/UNIQUE actually rejects the shape it
-- names, not merely that the happy path still works.
-- ---------------------------------------------------------------------------

-- Gate 2, the ADR's own named test: domain NULL on a TRUST_DOMAIN row is
-- rejected (subject_records_domain_required).
SELECT hci_test.expect_sqlstate('TRUST-NEG-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000960','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$,
  '23514');

-- Gate 3, the ADR's own named test: two TRUST_DOMAIN rows for the SAME
-- (tenant_id, person_id) with two DIFFERENT domain values both persist -
-- proving the schema holds the full vector, not one slot that happens to be
-- unfilled. Same person as TARGET-KIND-01a's '...109' row (already
-- OPERATIONAL), so this also proves a Person may carry more than one domain
-- simultaneously, not merely one-at-a-time via supersession.
SELECT hci_test.expect_success('TRUST-NEG-02-SETUP-A',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000961','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','COMPETENCE','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$);
SELECT hci_test.expect_success('TRUST-NEG-02-SETUP-B',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000962','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','CONFIDENTIALITY','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$);
SELECT hci_test.expect_true('TRUST-NEG-02',
  $q$SELECT COUNT(DISTINCT domain) = 3 FROM hci.subject_records
     WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
       AND person_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND kind = 'TRUST_DOMAIN'
       AND domain IN ('OPERATIONAL','COMPETENCE','CONFIDENTIALITY')$q$,
  'a Person must be able to hold TRUST_DOMAIN rows for more than one domain at once, not a single collapsed slot');

-- domain is TRUST_DOMAIN-scoped: any other kind carrying it is rejected
-- (subject_records_domain_scoped).
SELECT hci_test.expect_sqlstate('TRUST-DOMAIN-SCOPE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000963','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','OPERATIONAL','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- domain is restricted to the seven 04_HCI30_PRODUCT_SPEC.md:59-65 names -
-- not free text that a future roll-up formula could quietly repurpose.
SELECT hci_test.expect_sqlstate('TRUST-DOMAIN-ENUM-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000964','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','OVERALL','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$,
  '23514');

-- (tenant_id, person_id, domain) is the TrustDomain identity key: a SECOND
-- OPERATIONAL row for the same Person (TARGET-KIND-01a's '...109' already
-- holds it) is rejected by subject_records_trust_domain_unique, not merely
-- discouraged.
SELECT hci_test.expect_sqlstate('TRUST-DOMAIN-UNIQUE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000965','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','OPERATIONAL','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$,
  '23505');

-- Evidence-link requirement (ADR-0004 Decision, third bullet): a
-- TRUST_DOMAIN row with no evidence_ref_id is invalid, not merely
-- undocumented (subject_records_evidence_ref_id_required).
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-REQ-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000966','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','STRATEGIC','EVIDENCE')$q$,
  '23514');

-- evidence_ref_id is TRUST_DOMAIN-scoped, same as domain
-- (subject_records_evidence_ref_id_scoped).
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-SCOPE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,evidence_ref_id,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000967','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000101','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- evidence_ref_kind is independently required, not merely implied by
-- evidence_ref_id being set (subject_records_evidence_ref_kind_required) -
-- proves the two link columns each have their own named CHECK rather than
-- one combined check that could not say which column was wrong.
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-KIND-REQ-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000968','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','STRATEGIC','aaaaaaaa-0000-0000-0000-000000000101')$q$,
  '23514');

-- evidence_ref_kind is TRUST_DOMAIN-scoped too
-- (subject_records_evidence_ref_kind_scoped).
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-KIND-SCOPE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,evidence_ref_kind,encryption_key_ref,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000969','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000800','DETERMINISTIC')$q$,
  '23514');

-- evidence_ref_kind is restricted to EVIDENCE/CLAIM - an ASSESSMENT (or any
-- other kind) may never be typed-pinned as a TrustDomain's evidence.
-- db-expert review (2026-09-05, M4): the first version of this test pointed
-- at '...101', a REAL EVIDENCE row, while claiming evidence_ref_kind=
-- 'ASSESSMENT' - so dropping subject_records_evidence_ref_kind_check alone
-- left the composite FK (which requires the referenced row's own kind to
-- equal evidence_ref_kind) to reject it with 23503 instead, passing this
-- assertion for the wrong reason (the exact anti-pattern this file already
-- names at line ~662). Retargeted at a real tenant-A ASSESSMENT row (tenant
-- A previously had none still alive) so removing the CHECK lets the FK
-- succeed and the assertion genuinely depends on the CHECK.
SELECT hci_test.expect_success('TRUST-EVIDENCE-KINDVALUE-01-SETUP-ASSESSMENT',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,author_class)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000974','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ASSESSMENT','aaaaaaaa-0000-0000-0000-000000000200','PROBABILISTIC')$q$);
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-KINDVALUE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000970','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','STRATEGIC','aaaaaaaa-0000-0000-0000-000000000974','ASSESSMENT')$q$,
  '23514');

-- db-expert review (2026-09-05, M4): a TRUST_DOMAIN row may never chain to
-- ANOTHER TRUST_DOMAIN row as its evidence (referencing the real '...109'
-- row, not a nonexistent id) - caught directly by the enum CHECK, since
-- 'TRUST_DOMAIN' is not in evidence_ref_kind's allowed set regardless of
-- what the referenced row's actual kind is.
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-CHAIN-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000975','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','STRATEGIC','aaaaaaaa-0000-0000-0000-000000000109','TRUST_DOMAIN')$q$,
  '23514');

-- Targets a REAL tenant-B row (fixtures: 'bbbbbbbb-...-500', EVIDENCE kind),
-- same reasoning as BITEMP-CROSSTENANT-01/CRYPTO-CROSSTENANT-KEYREF-01:
-- proves the composite FK rejects a genuine cross-tenant reference, not
-- merely an id that does not exist anywhere.
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-CROSSTENANT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000971','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','STRATEGIC','bbbbbbbb-0000-0000-0000-000000000500','EVIDENCE')$q$,
  '23503');

-- Typed reference: '...101' is really kind='EVIDENCE', so claiming it as
-- evidence_ref_kind='CLAIM' is rejected by the composite FK - same pattern
-- as TARGET-KIND-01b, applied to this ADR's own typed pin.
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-TYPEDPIN-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000972','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','STRATEGIC','aaaaaaaa-0000-0000-0000-000000000101','CLAIM')$q$,
  '23503');

-- Positive proof that CLAIM (not only EVIDENCE) is a legal evidence_ref_kind
-- - ADR-0004's Decision says "kind IN ('EVIDENCE','CLAIM')", and a suite
-- that only ever exercised EVIDENCE would not actually prove CLAIM is
-- accepted. References the real tenant-A CLAIM row '...916' (NEG-HD08-02's
-- fixture, still ASSESSMENT_CANDIDATE/APPROVED - irrelevant to this check,
-- which cares only about its subject_records kind).
SELECT hci_test.expect_success('TRUST-EVIDENCE-CLAIM-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000973','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','GOVERNANCE_POWER','aaaaaaaa-0000-0000-0000-000000000916','CLAIM')$q$);

-- db-expert review (2026-09-05, M2): the typed evidence pin originally keyed
-- only on (tenant_id, id, kind) - the same tuple data_subject_request_targets
-- pins against - which let a TrustDomain row for one Person cite evidence
-- about a DIFFERENT Person in the same tenant. PERSON-02
-- ('...a2', line ~199-201) taking '...101' (a real EVIDENCE row about
-- PERSON-01, 'aaaa-...-aaaa') as its evidence now correctly fails: the
-- widened FK requires evidence_ref_id to belong to the SAME person_id as the
-- referencing row, not merely the same tenant.
SELECT hci_test.expect_sqlstate('TRUST-EVIDENCE-CROSSPERSON-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000976','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a2','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','FINANCIAL','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$,
  '23503');

-- db-expert review (2026-09-05, M1): this table's only correction mechanism
-- (bitemporal supersession, 0005 - an AFTER INSERT trigger) can never fire
-- on a TRUST_DOMAIN row, because subject_records_trust_domain_unique is
-- checked before insert and would reject the superseding row as a duplicate
-- (tenant_id, person_id, domain) before mark_superseded() ever runs on the
-- predecessor. subject_records_trust_domain_no_supersede makes that an
-- explicit, tested Wave 1 rule instead of a silently-unreachable path -
-- corrected_reason is supplied so ONLY the new no-supersede CHECK is what
-- rejects this insert (subject_records_reason_paired would otherwise fire
-- first on a bare supersedes_id with no reason).
SELECT hci_test.expect_sqlstate('TRUST-NEG-NOSUPERSEDE-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind,supersedes_id,corrected_reason)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000977','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','REPUTATIONAL','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000109','TrustDomain rows do not support correction in Wave 1')$q$,
  '23514');

-- db-expert review (2026-09-05, N4): every other new typed reference in this
-- ADR-0004 block has a cross-tenant test against a REAL other-tenant row;
-- TRUST_DOMAIN's own person_id (via the pre-existing 0001:130 persons FK,
-- not anything new in 0011) had none. Targets tenant B's real person
-- ('bbbbbbbb-bbbb-...', fixtures) from a tenant-A insert. No dedicated
-- mutation was added for this one specifically (checked by probe, not
-- estimated): weakening ONLY the persons FK still leaves this insert
-- rejected, because M2's own subject_records_evidence_ref_fk ALSO requires
-- evidence_ref_id's person to match - '...101' belongs to tenant-A
-- PERSON-01, not this tenant-B person - so the two protections overlap for
-- this exact shape and a single-constraint-drop mutation cannot isolate
-- which one fired. TRUST-EVIDENCE-CROSSPERSON-01 already has its own
-- dedicated mutation for that second protection; this assertion still
-- documents real, correct behavior (a suite-wide baseline this file
-- already accepts: not every assertion needs its own mutation, only that
-- the invariant it states is genuinely true and tested somewhere).
SELECT hci_test.expect_sqlstate('TRUST-PERSON-CROSSTENANT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,domain,evidence_ref_id,evidence_ref_kind)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000978','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200','REPUTATIONAL','aaaaaaaa-0000-0000-0000-000000000101','EVIDENCE')$q$,
  '23503');

-- db-expert review (2026-09-05, C1): defense-in-depth against
-- check-no-universal-trust-column.ps1's own known limit (a text-based lint
-- can be wrong about a column it has never seen) - a real DB-catalog
-- assertion against the live schema, same idiom as CRYPTO-NOEXTERNAL-01
-- (pg_proc scan) and CASE-PROJECTREF-01 (information_schema scan). Proves
-- directly, at the only layer that cannot be fooled by migration-file text,
-- that hci.subject_records never grows the exact column shape ADR-0004
-- forbids - independent of whatever the lint script's exemption logic does
-- or does not catch.
SELECT hci_test.expect_true('TRUST-NO-AGGREGATE-COLUMN-01',
  $q$SELECT NOT EXISTS (
       SELECT 1 FROM pg_attribute
        WHERE attrelid = 'hci.subject_records'::regclass AND attnum > 0 AND NOT attisdropped
          AND attname ~ '(overall_score|composite_trust|aggregate_trust|universal_trust|^trust_score$)')$q$,
  'no cross-domain aggregate column may exist on hci.subject_records (ADR-0004)');

-- ---------------------------------------------------------------------------
-- P0-09 (RLS enforcement gate, 21_HCI_TOP_TIER_GAP_ANALYSIS.md): whole-schema
-- catalog gate. Every RLS-LEAK/SOURCE-RLS/CONSENT-RLS assertion above proves
-- one NAMED table's isolation functionally; this catches a FUTURE
-- tenant-scoped table nobody wrote a named test for.
--
-- db-expert review (2026-09-06) found the first version's exemption was
-- narrower than its own comment claimed: filtering by
-- information_schema.columns' tenant_id row is a per-COLUMN privilege
-- check, not per-table -- a table granted e.g. `SELECT (id, payload)`
-- without `tenant_id` would read as exempt while still being readable with
-- zero RLS (real Postgres repro). Fixed with has_any_column_privilege
-- (table-scoped: "does this role have any access to this table at all").
-- relkind IN ('r','p') for the same reason -- 'r' alone silently excludes
-- partitioned tables, which do support RLS (also real-repro'd).
-- has_any_column_privilege checks the CURRENT role, so this still must run
-- as hci_app_test_a and not the owner (everything after RESET ROLE, line
-- ~959, runs as hci_owner, whose superuser privilege sees every table).
--
-- hci.app_tenant_bindings and hci.data_encryption_keys hold zero grants of
-- any kind to hci_app_test_a/b (migration 0001 and 0007 gate 1's own
-- comments), so has_any_column_privilege correctly excludes both. hci.tenants
-- is scoped by `id`, not `tenant_id`, so it needs its own assertion
-- (RLS-OWN-02 below) instead.
SET ROLE hci_app_test_a;
SELECT hci_test.expect_true('RLS-COMPLETENESS-01',
  $q$SELECT NOT EXISTS (
       SELECT 1
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'hci' AND c.relkind IN ('r','p')
          AND EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                         AND a.attnum > 0 AND NOT a.attisdropped)
          AND has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
     )$q$,
  'every hci table with a tenant_id column and any grant to this role must have RLS both enabled and forced');

-- Policy EXISTENCE is not policy CORRECTNESS (db-expert M4): `USING (false)`,
-- a policy scoped `TO` a different role, or `FOR SELECT` only would all pass
-- a bare "at least one policy" check while leaving the table wrong (either
-- leaking, or fail-closed to its own tenant). Every policy this schema's
-- declarative loop generates (migration 0001) is the same shape --
-- PERMISSIVE, all commands, PUBLIC role, current_tenant_id() in both USING
-- and WITH CHECK (grep-verified against every CREATE POLICY across
-- migrations 0001/0002/0004/0005/0008) -- so this asserts that shape, not
-- just presence.
SELECT hci_test.expect_true('RLS-COMPLETENESS-02',
  $q$SELECT NOT EXISTS (
       SELECT 1
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'hci' AND c.relkind IN ('r','p')
          AND EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                         AND a.attnum > 0 AND NOT a.attisdropped)
          AND has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          AND NOT EXISTS (
            SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'hci' AND p.tablename = c.relname
               AND p.permissive = 'PERMISSIVE' AND p.cmd = 'ALL' AND p.roles = '{public}'
               AND p.qual ~ 'current_tenant_id' AND p.with_check ~ 'current_tenant_id')
     )$q$,
  'every hci table with a tenant_id column and any grant to this role must have a current_tenant_id() policy covering all commands and roles');

-- hci.tenants is scoped by `id`, not `tenant_id`, so neither query above
-- names it. db-expert review (2026-09-06) found a real blind spot:
-- RLS-LEAK-02 (line 27) only proves cross-tenant rows stay invisible, and
-- dropping tenant_registry_isolation leaves that true (FORCE ROW LEVEL
-- SECURITY with no policy denies every row, not just other tenants') --
-- nothing else in this file does a positive same-tenant read against this
-- table. Mirrors RLS-OWN-01's positive-read check for hci.persons (line 19).
SELECT hci_test.expect_true('RLS-OWN-02',
  $q$SELECT EXISTS (SELECT 1 FROM hci.tenants WHERE id = '11111111-1111-1111-1111-111111111111')$q$,
  'own tenant registry row must remain readable');

-- Restores the owner context hci_test.finish() requires below (that
-- function's own EXECUTE grant list does not include hci_app_test_a/b --
-- 00_test_harness.sql's final GRANT block only covers expect_sqlstate/
-- expect_success/expect_true), matching the role this file was already in
-- at the point RLS-COMPLETENESS-01 temporarily left it.
RESET ROLE;

-- ---------------------------------------------------------------------------
\echo '--- assertion results ---'
SELECT test_id, outcome, actor, detail FROM hci_test.results ORDER BY id;

SELECT hci_test.finish(241);
