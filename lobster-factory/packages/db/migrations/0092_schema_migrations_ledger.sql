-- 0092 — a migration ledger: which numbered files have actually been applied becomes a query
-- instead of a guess from schema state. lobster-factory/packages/db/migrations has ~92 numbered
-- files and, until this migration, no table recording which ones ran on any given database --
-- wrong guesses about that happened before (see scripts/apply-db-migration.mjs history).
--
-- Written by scripts/apply-db-migration.mjs: one INSERT injected into each applied file's own
-- transaction, right before its last top-level COMMIT (row and migration commit together) --
-- including this file's own row, since the CREATE TABLE below runs first in the same transaction.
-- --status compares local files with the ledger; --record-only backfills pre-ledger history.
--
-- Locked down like other internal tables (RLS on, service_role only -- see 0091_site_watch.sql for
-- the same pattern): only the deploy/migration tooling ever touches this, never the application.
--
-- APPLY:  node scripts/apply-db-migration.mjs 0092
-- DOWN:   packages/db/scripts/0092_schema_migrations_ledger_down.sql

BEGIN;

-- Keyed by filename, not number: two files share 0011.
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text        PRIMARY KEY CHECK (filename ~ '^\d{4}_[^/]+\.sql$'),
  number      text        NOT NULL CHECK (number ~ '^\d{4}$' AND number = left(filename, 4)),
  sha256      text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text        NOT NULL
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.schema_migrations;
CREATE POLICY "service_role only" ON public.schema_migrations TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.schema_migrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.schema_migrations TO service_role;

COMMENT ON TABLE public.schema_migrations IS
  'Ledger of applied lobster-factory/packages/db/migrations files, keyed by filename. Written '
  'only by scripts/apply-db-migration.mjs (in each migration''s own transaction, or --record-only).';

NOTIFY pgrst, 'reload schema';

COMMIT;
