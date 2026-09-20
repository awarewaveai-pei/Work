-- Down migration for 0090.
--
-- ORDER: withdraw the CODE first, then run this. Between this transaction committing and the old
-- code being live, a running crawl that writes kind='off_entity' gets 23514 and loses its whole
-- issue batch (report-store.ts inserts them as one multi-row statement).
--
-- WHY THE ROWS MUST GO: not because the run counts would stop adding up — collection_runs' counters
-- are independent columns and stay correct without off_entity. The only reason is mechanical: the
-- four-value CHECK cannot be re-added while rows violate it.
--
-- DESTRUCTIVE. The deleted rows and the dropped counter cannot be recovered, and this instance has
-- no automatic schema backup. The backup table below is the whole safety net; drop it by hand once
-- the rollback has been confirmed good.

BEGIN;

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- Taken BEFORE the DELETE, not left to the first DDL statement. Otherwise a concurrent crawl can
-- commit a fresh off_entity row in the window between the DELETE and the DROP CONSTRAINT, and then
-- the re-added CHECK fails validation and aborts the rollback — precisely when a rollback is the
-- thing being relied on.
LOCK TABLE public.collection_issues IN ACCESS EXCLUSIVE MODE;

-- Schema first, rows second, and the rows APPEND. `CREATE TABLE ... AS SELECT` with
-- IF NOT EXISTS looks like a backup but is not one on the second rollback cycle: the table already
-- exists from the first, so the SELECT never runs, and the DELETE below then destroys rows that
-- were never copied anywhere (cross-model oracle finding, 2026-09-20). Duplicated rows across
-- cycles are harmless; a silently skipped backup is not.
CREATE TABLE IF NOT EXISTS public.collection_issues_0090_backup
  (LIKE public.collection_issues);

INSERT INTO public.collection_issues_0090_backup
  SELECT * FROM public.collection_issues WHERE kind = 'off_entity';

DELETE FROM public.collection_issues WHERE kind = 'off_entity';

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
  CHECK (kind IN ('dirty','quarantined','disallowed','gone'));

ALTER TABLE public.collection_runs
  DROP COLUMN IF EXISTS off_entity;

NOTIFY pgrst, 'reload schema';

COMMIT;
