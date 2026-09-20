-- 0090 — collection: a page can now be refused for being about somebody else.
--
-- WHY A NEW BUCKET RATHER THAN `dirty`: the four existing kinds all mean "collection had a problem".
-- `off_entity` means collection worked and the SEARCH ENGINE returned something irrelevant, which is
-- normal and expected — a search for a person's name returns a bookshop's catalogue page, and
-- refusing it is the system succeeding. Folded into `dirty` it would drag every entity run over
-- report-store.ts's `refused / attempted >= 0.5` threshold and raise an incident on correct
-- behaviour, until somebody turned that alert down — and then it is gone for the case that mattered
-- (the same argument 0073 made for keeping `disallowed` separate).
--
-- Evidence this is not hypothetical: run manual-2026-09-20051728 stored 159 pages of
-- penguin.com.au's browse catalogue for a search on a person's name. Every one of them passed the
-- quality gate, because quality asks "is this the article or the navigation bar" and never asks
-- "is this about the thing you searched for".
--
-- DEPLOY ORDER IS PART OF THIS MIGRATION: schema FIRST, then the new code. Additive-only, so old
-- code against the new schema notices nothing (the column has a default, the CHECK is widened).
-- New code against the OLD schema loses the entire run report — the collection_runs upsert fails
-- on an unknown column, report-store.ts returns early, and no issue rows and no incident are
-- written. Rollback runs the other way: withdraw the code first, then the down migration.
--
-- THE CHECK IS SWAPPED BY CATALOGUE LOOKUP, NOT BY NAME. 0073 declared it inline
-- (`kind text NOT NULL CHECK (...)`), so its name is whatever ChooseConstraintName() generated —
-- almost certainly collection_issues_kind_check, but "almost certainly" is not a deployment
-- standard. A `DROP CONSTRAINT IF EXISTS <guessed name>` that guesses wrong does not fail: it
-- silently no-ops, the ADD succeeds under a fresh name, the table ends up with BOTH checks, the old
-- four-value one still wins, and psql reports success while every off_entity insert dies at runtime
-- with 23514. The DO-block below removes whatever is actually there and then asserts that exactly
-- one CHECK on `kind` survives, so the migration cannot succeed while leaving the wrong state.
--
-- GROWTH NOTE: collection_issues gains a row per refused page and has no retention policy. The
-- DROP+ADD CHECK pattern used here revalidates the whole table under ACCESS EXCLUSIVE, which is
-- free at a few hundred rows and an outage at a million. Past ~100k rows, switch to
-- `ADD CONSTRAINT ... NOT VALID` plus a separate `VALIDATE CONSTRAINT` (SHARE UPDATE EXCLUSIVE,
-- does not block readers or writers).
--
-- APPLY WITH (Medium risk — additive only; no existing row changes meaning):
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0090_collection_off_entity.sql
-- Down migration: packages/db/scripts/0090_collection_off_entity_down.sql

BEGIN;

-- Fail fast rather than queueing. All three statements below take ACCESS EXCLUSIVE, and a lock
-- REQUEST that waits puts every subsequent read and write behind it (the lock queue is FIFO) — one
-- idle-in-transaction session would otherwise stall the ops tables indefinitely. Re-running a
-- migration is cheap; a stalled table is not.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE public.collection_runs
  ADD COLUMN IF NOT EXISTS off_entity int NOT NULL DEFAULT 0;

-- IF NOT EXISTS above is silent about TYPE: a pre-existing off_entity of the wrong type would sail
-- through and be wrong forever. Assert what we actually got.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'collection_runs'
      AND column_name = 'off_entity' AND data_type = 'integer'
  ) THEN
    RAISE EXCEPTION '0090: collection_runs.off_entity missing or not integer';
  END IF;
END $$;

-- Remove every CHECK on `kind`, whatever it is called, then install the one we mean.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.collection_issues'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.collection_issues DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.collection_issues
  ADD CONSTRAINT collection_issues_kind_check
  CHECK (kind IN ('dirty','quarantined','disallowed','gone','off_entity'));

DO $$
BEGIN
  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.collection_issues'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  ) <> 1 THEN
    RAISE EXCEPTION '0090: expected exactly one CHECK on collection_issues.kind after the swap';
  END IF;
END $$;

COMMENT ON COLUMN public.collection_runs.off_entity IS
  'Pages fetched and extracted cleanly, then refused for not being about the entity the source asserted (lib/collect/relevance.ts). Normal in an entity dossier run; a run where this is the ONLY outcome means the anchors are wrong.';

-- Every write here goes through PostgREST (report-store.ts uses supabase-js). Without this the
-- schema cache does not know about off_entity, the first upsert fails with PGRST204, and the whole
-- run report is dropped. The supabase image's pgrst_ddl_watch trigger usually does this, but it is
-- declared nowhere in this repo and therefore cannot be relied on (0073 said this line explicitly;
-- 0084 and 0087-0089 omitted it and have been getting away with it).
NOTIFY pgrst, 'reload schema';

COMMIT;
