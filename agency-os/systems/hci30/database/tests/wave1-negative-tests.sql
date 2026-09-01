\set ON_ERROR_STOP on
SET ROLE hci_app_test_a;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM hci.persons WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') THEN RAISE EXCEPTION 'RLS denied own tenant'; END IF;
  IF EXISTS (SELECT 1 FROM hci.persons WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN RAISE EXCEPTION 'RLS leaked tenant B'; END IF;
END $$;
DO $$ BEGIN
  BEGIN
    INSERT INTO hci.subject_records (id,tenant_id,person_id,kind) VALUES ('bbbbbbbb-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','EVIDENCE');
    RAISE EXCEPTION 'expected cross-tenant write rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO hci.subject_records (id,tenant_id,person_id,subject_type,kind) VALUES ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ORGANIZATION','EVIDENCE');
    RAISE EXCEPTION 'expected subject type rejection';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO hci.research_workflows VALUES ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000010');
    RAISE EXCEPTION 'expected authorization rejection';
  EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;

INSERT INTO hci.data_subject_requests VALUES ('aaaaaaaa-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CORRECTION','RECEIVED');
INSERT INTO hci.data_subject_request_events (id,tenant_id,request_id,event_type,detail) VALUES ('aaaaaaaa-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000004','RECEIVED','synthetic fixture');
DO $$ BEGIN
  BEGIN UPDATE hci.data_subject_requests SET status = 'RESOLVED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004'; RAISE EXCEPTION 'expected lifecycle rejection'; EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
DO $$ BEGIN
  BEGIN UPDATE hci.data_subject_request_events SET detail = 'mutated'; RAISE EXCEPTION 'expected append-only rejection'; EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;

INSERT INTO hci.identity_candidates VALUES ('aaaaaaaa-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','CANDIDATE');
INSERT INTO hci.identity_verifications VALUES ('aaaaaaaa-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000006','LLM','synthetic-confidence');
DO $$ BEGIN
  BEGIN UPDATE hci.identity_candidates SET match_state = 'MATCH_CONFIRMED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000006'; RAISE EXCEPTION 'expected LLM-only rejection'; EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
INSERT INTO hci.identity_verifications VALUES ('aaaaaaaa-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000006','HUMAN','synthetic-human-check');
UPDATE hci.identity_candidates SET match_state = 'MATCH_CONFIRMED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000006';

RESET ROLE;
