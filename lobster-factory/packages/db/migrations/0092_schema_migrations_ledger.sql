-- 0092 — a migration ledger: which numbered files have actually been applied becomes a query
-- instead of a guess from schema state. lobster-factory/packages/db/migrations has ~92 numbered
-- files and, until this migration, no table recording which ones ran on any given database --
-- wrong guesses about that happened before (see scripts/apply-db-migration.mjs history).
--
-- This table is written by scripts/apply-db-migration.mjs, which injects one INSERT into each
-- applied file's own transaction, immediately before that file's last top-level COMMIT; -- so the
-- ledger row commits atomically with the migration itself (both or neither). It also supports
-- --status (read-only comparison of local files vs ledger rows) and --record-only (backfill rows
-- for files already applied before this ledger existed, e.g. 0001..0091 -- no migration SQL runs
-- for those; see the runner's own header for the exact flag).
--
-- Locked down like other internal tables (RLS on, service_role only -- see 0091_site_watch.sql for
-- the same pattern): only the deploy/migration tooling ever touches this, never the application.
--
-- APPLY:  node scripts/apply-db-migration.mjs 0092
-- DOWN:   packages/db/scripts/0092_schema_migrations_ledger_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  number      text        PRIMARY KEY CHECK (number ~ '^\d{4}$'),
  filename    text        NOT NULL,
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
  'Ledger of applied lobster-factory/packages/db/migrations files. Written by '
  'scripts/apply-db-migration.mjs (one INSERT injected into each migration''s own transaction, '
  'right before its last COMMIT;, or via --record-only for pre-ledger history). service_role '
  'only -- revoked from public AND anon/authenticated explicitly (Supabase''s default grant on '
  'new public functions/tables; this is a table, but the same house pattern applies uniformly).';

-- This INSERT records 0092 itself. It is intentionally hand-written here (not injected by the
-- runner, which cannot inject into a file that doesn't have the table it's inserting into yet) --
-- the one exception to "the runner always writes this row". sha256 is a placeholder the runner
-- overwrites: --record-only 0092 --i-verified after applying, using the real file's sha256, keeps
-- this row consistent with every other one (which store a real content hash, not a marker).
INSERT INTO public.schema_migrations (number, filename, sha256, applied_by)
VALUES ('0092', '0092_schema_migrations_ledger.sql', repeat('0', 64), 'migration_0092_bootstrap')
ON CONFLICT (number) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
