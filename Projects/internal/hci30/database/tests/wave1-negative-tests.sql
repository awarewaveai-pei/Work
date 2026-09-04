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
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id)
     VALUES ('bbbbbbbb-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','EVIDENCE','bbbbbbbb-0000-0000-0000-000000000200')$q$,
  '42501');

-- ---------------------------------------------------------------------------
-- Person-only subject boundary (SUBJECT-NEG-01..03)
-- ---------------------------------------------------------------------------
SELECT hci_test.expect_success('SUBJECT-NEG-01a',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000101','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200')$q$);

SELECT hci_test.expect_true('SUBJECT-NEG-01b',
  $q$SELECT subject_type = 'PERSON' FROM hci.subject_records WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'$q$,
  'omitted subject_type must default deterministically to PERSON');

SELECT hci_test.expect_sqlstate('SUBJECT-NEG-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,subject_type,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ORGANIZATION','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200')$q$,
  '23514');

SELECT hci_test.expect_sqlstate('SUBJECT-NEG-03',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,subject_id,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200')$q$,
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
  $q$INSERT INTO hci.tenant_authorizations VALUES
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
  $q$INSERT INTO hci.data_subject_requests VALUES
     ('aaaaaaaa-0000-0000-0000-000000000106','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CORRECTION','IN_REVIEW')$q$,
  'H1002');

SELECT hci_test.expect_success('DSR-LIFECYCLE-02',
  $q$INSERT INTO hci.data_subject_requests VALUES
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
SELECT hci_test.expect_success('TARGET-KIND-01a',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000109','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','TRUST_DOMAIN','aaaaaaaa-0000-0000-0000-000000000200')$q$);

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
  $q$INSERT INTO hci.identity_candidates VALUES
     ('aaaaaaaa-0000-0000-0000-000000000112','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CANDIDATE')$q$);

SELECT hci_test.expect_success('IDENTITY-NEG-01b',
  $q$INSERT INTO hci.identity_verifications VALUES
     ('aaaaaaaa-0000-0000-0000-000000000113','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000112','LLM','synthetic-confidence')$q$);

SELECT hci_test.expect_sqlstate('IDENTITY-NEG-01c',
  $q$UPDATE hci.identity_candidates SET match_state = 'MATCH_CONFIRMED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$,
  'H1004');

SELECT hci_test.expect_success('IDENTITY-NEG-02a',
  $q$INSERT INTO hci.identity_verifications VALUES
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
  $q$INSERT INTO hci.identity_verifications VALUES
     ('aaaaaaaa-0000-0000-0000-000000000115','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000112','HUMAN','')$q$,
  '23514');

-- Repointing a confirmed identity at a different person is the end state the
-- HD-04 gate exists to prevent, reached without touching any evidence row.
SELECT hci_test.expect_sqlstate('IDENTITY-NEG-05',
  $q$UPDATE hci.identity_candidates SET person_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000112'$q$,
  'H1007');

SELECT hci_test.expect_success('PERSON-02',
  $q$INSERT INTO hci.persons VALUES
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

SELECT hci_test.expect_sqlstate('CASE-LIFECYCLE-03',
  $q$UPDATE hci.cases SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$,
  'H1010');

-- -210 is CLOSED as of CASE-LIFECYCLE-02 above: prove every other column is
-- frozen too, not just the status/closed_at pair (2026-09-04 critic review -
-- the original trigger guarded only the moment of closing, leaving a closed
-- case's purpose/risk_tier/etc. rewritable indefinitely with no event trail).
SELECT hci_test.expect_sqlstate('CASE-CLOSED-IMMUTABLE-01',
  $q$UPDATE hci.cases SET purpose = 'rewritten after close' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000210'$q$,
  'H1007');

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
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000218','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000201')$q$,
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
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000302','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CLAIM','aaaaaaaa-0000-0000-0000-000000000200')$q$);

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
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,valid_from,valid_to)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000500','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','2026-01-02T00:00:00Z','2026-01-01T00:00:00Z')$q$,
  '23514');

-- References SUBJECT-NEG-01a's row ('...101', tenant A, EVIDENCE) as a real
-- same-tenant supersedes_id target, so the FK is satisfied and only the
-- reason-required CHECK is under test.
SELECT hci_test.expect_sqlstate('BITEMP-REASON-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000501','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000101')$q$,
  '23514');

-- Blank is not a reason (db-expert review, 2026-09-05 - matching 0001:66-68's
-- own stated lesson about evidentiary free text elsewhere in this schema):
-- an empty string satisfies "IS NOT NULL" but not the intent, and until this
-- CHECK existed it silently passed BITEMP-REASON-01's own gate.
SELECT hci_test.expect_sqlstate('BITEMP-REASON-02',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000507','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000101','')$q$,
  '23514');

-- Targets a REAL tenant-B row (fixtures: 'bbbbbbbb-...-500') so this proves
-- the composite FK rejects a genuine cross-tenant reference, not merely an
-- id that does not exist anywhere.
SELECT hci_test.expect_sqlstate('BITEMP-CROSSTENANT-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000502','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','bbbbbbbb-0000-0000-0000-000000000500','cross-tenant probe')$q$,
  '23503');

SELECT hci_test.expect_sqlstate('BITEMP-IMMUTABLE-01',
  $q$UPDATE hci.subject_records SET valid_to = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'$q$,
  '42501');

SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-01',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,system_recorded_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000506','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','2020-01-01T00:00:00Z')$q$,
  '42501');
-- Both server-assigned columns need their own assertion (critic review):
-- withholding system_recorded_at alone does not prove system_superseded_at
-- is withheld too - a row "born already superseded" would be invisible to
-- every _current/_as_of read while still sitting in the base table.
SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-01b',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,system_superseded_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000508','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200',now())$q$,
  '42501');

-- Predecessor A ('...503') and successor B ('...504'): B's insert fires
-- hci.mark_superseded() (AFTER INSERT), which must set A's
-- system_superseded_at to B's own system_recorded_at.
SELECT hci_test.expect_success('BITEMP-SUPERSEDE-SETUP-A',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000503','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200')$q$);
SELECT hci_test.expect_success('BITEMP-SUPERSEDE-SETUP-B',
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000504','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000503','correction test')$q$);

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
  $q$INSERT INTO hci.subject_records (id,tenant_id,person_id,kind,case_id,supersedes_id,corrected_reason)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000505','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','EVIDENCE','aaaaaaaa-0000-0000-0000-000000000200','aaaaaaaa-0000-0000-0000-000000000503','second correction attempt')$q$,
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
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000600','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','synthetic rationale')$q$);
SELECT hci_test.expect_success('BITEMP-DECISION-02',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,supersedes_id,corrected_reason)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000601','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PROCEED','synthetic rationale, revised','aaaaaaaa-0000-0000-0000-000000000600','initial pause was overly cautious')$q$);
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
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,system_recorded_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000602','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','clock probe','2020-01-01T00:00:00Z')$q$,
  '42501');
SELECT hci_test.expect_sqlstate('BITEMP-CLOCK-02b',
  $q$INSERT INTO hci.decisions (id,tenant_id,case_id,outcome,rationale,system_superseded_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000603','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000200','PAUSE','clock probe',now())$q$,
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
-- hci.decisions is not referenced by any FK, so it reaches the trigger
-- directly (TRUNCATE-01/04's shape, not TRUNCATE-02/03-FK's).
SELECT hci_test.expect_sqlstate('TRUNCATE-05',
  $q$TRUNCATE hci.decisions$q$, 'H1003');

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

-- ---------------------------------------------------------------------------
\echo '--- assertion results ---'
SELECT test_id, outcome, actor, detail FROM hci_test.results ORDER BY id;

SELECT hci_test.finish(128);
