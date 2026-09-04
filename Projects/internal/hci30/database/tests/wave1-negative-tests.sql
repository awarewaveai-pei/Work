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
     VALUES ('aaaaaaaa-0000-0000-0000-000000000210','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic lifecycle case','R1','synthetic fixture')$q$);

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
     VALUES ('aaaaaaaa-0000-0000-0000-000000000211','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic lifecycle case 2','R1','synthetic fixture')$q$);

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
     VALUES ('aaaaaaaa-0000-0000-0000-000000000216','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic fixture','R0','synthetic fixture','OPEN')$q$,
  '42501');
SELECT hci_test.expect_sqlstate('CASE-OPENEDAT-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context,opened_at)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000217','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic fixture','R0','synthetic fixture',now())$q$,
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
     VALUES ('aaaaaaaa-0000-0000-0000-000000000220','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic repoint-target case','R1','synthetic fixture')$q$);
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
     VALUES ('aaaaaaaa-0000-0000-0000-000000000215','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic project-ref case','R0','synthetic fixture','nonexistent-project-xyz-999')$q$);

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

-- TRUNCATE does not fire row-level triggers and is a separate privilege, so it
-- is the one statement that would otherwise walk past both layers at once.
SELECT hci_test.expect_sqlstate('TRUNCATE-01',
  $q$TRUNCATE hci.data_subject_request_events$q$, 'H1003');
-- subject_records is referenced by a foreign key, and PostgreSQL refuses that
-- TRUNCATE before any trigger runs. Recorded as its own layer rather than
-- relabelled as trigger evidence: TRUNCATE-01 is what proves the trigger.
SELECT hci_test.expect_sqlstate('TRUNCATE-02-FK',
  $q$TRUNCATE hci.subject_records$q$, '0A000');

-- hci.cases' owner-bypass layer (2026-09-04 critic review): the original
-- migration gave hci.cases a grant layer only, unlike every other protected
-- table in this schema, which get both layers from 0001's declarative
-- append_only/no_delete lists (0001:284-293). These prove the INSERT-side
-- lifecycle guard and the DELETE guard both hold for a connection whose
-- privileges bypass grants entirely.
SELECT hci_test.expect_sqlstate('CASE-LIFECYCLE-TRIGGER-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context,status)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000221','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic fixture','R0','synthetic fixture','ACTIVE')$q$,
  'H1010');

SELECT hci_test.expect_success('CASE-NODELETE-TRIGGER-SETUP-01',
  $q$INSERT INTO hci.cases (id,tenant_id,tenant_authorization_id,purpose,risk_tier,requester_context)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000222','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','synthetic fixture, no children',
             'R0','synthetic fixture')$q$);
SELECT hci_test.expect_sqlstate('CASE-NODELETE-TRIGGER-01',
  $q$DELETE FROM hci.cases WHERE id = 'aaaaaaaa-0000-0000-0000-000000000222'$q$,
  'H1003');

-- ---------------------------------------------------------------------------
\echo '--- assertion results ---'
SELECT test_id, outcome, actor, detail FROM hci_test.results ORDER BY id;

SELECT hci_test.finish(75);
