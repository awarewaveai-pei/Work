#!/usr/bin/env bash
# Verify 0114 against a disposable PostgreSQL container. Touches no production database.
# The 0113 verifier applies the 0096-0113 social chain; this script then applies 0114,
# checks its schema and ledger row, runs its down migration, and re-applies it twice.
# Usage: bash packages/db/scripts/0114_social_meta_webhook_idempotency-local-verify.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="${KEEP_CONTAINER:-social-0114-verify-$$}"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"
if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then
  DOCKER=docker
elif command -v docker.exe >/dev/null 2>&1; then
  DOCKER=docker.exe
else
  echo "docker or docker.exe is required" >&2
  exit 1
fi

cleanup() { "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
[ -n "${KEEP_CONTAINER:-}" ] || trap cleanup EXIT

base_out="$(KEEP_CONTAINER="$CONTAINER" bash "$HERE/0113_social_smart_link_visitor_dedupe-local-verify.sh" 2>&1)"
printf '%s\n' "$base_out" >/dev/null
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  number text NOT NULL,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL
);
INSERT INTO public.schema_migrations (filename, number, sha256, applied_by)
VALUES ('0113_social_smart_link_visitor_dedupe.sql', '0113', repeat('0', 64), 'local-verify')
ON CONFLICT (filename) DO NOTHING;
SQL
echo "OK bootstrap 0096-0113"

psql_file "$DB_DIR/migrations/0114_social_meta_webhook_idempotency.sql" >/dev/null
psql_run <<'SQL' >/dev/null
INSERT INTO public.schema_migrations (filename, number, sha256, applied_by)
VALUES ('0114_social_meta_webhook_idempotency.sql', '0114', repeat('0', 64), 'local-verify')
ON CONFLICT (filename) DO NOTHING;
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_post_targets' AND column_name = 'meta_post_id'
  ), 'meta_post_id column is missing';
  ASSERT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.oid = 'public.social_post_targets_meta_idx'::regclass
      AND i.indpred IS NOT NULL
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%meta_post_id IS NOT NULL%'
  ), 'meta partial index is missing';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.social_auto_rule_events'::regclass), 'event RLS is off';
  ASSERT (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'social_auto_rule_events') = 1, 'event policy count is wrong';
  ASSERT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'social_auto_rule_events'
                   AND policyname = 'service_role only' AND roles = '{service_role}'), 'event policy is not service_role only';
  ASSERT NOT has_table_privilege('anon', 'public.social_auto_rule_events', 'SELECT'), 'anon can select event table';
  ASSERT NOT has_table_privilege('authenticated', 'public.social_auto_rule_events', 'SELECT'), 'authenticated can select event table';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations
                 WHERE filename = '0114_social_meta_webhook_idempotency.sql'), '0114 ledger row is missing';
END $$;
SQL
if ! psql_run -c "SET ROLE service_role; SELECT 1 FROM public.social_auto_rule_events LIMIT 1;" >/dev/null 2>&1; then
  echo "service_role cannot select event table" >&2
  exit 1
fi
if psql_run -c "SET ROLE anon; SELECT 1 FROM public.social_auto_rule_events LIMIT 1;" >/dev/null 2>&1; then
  echo "anon can select event table" >&2
  exit 1
fi
if psql_run -c "SET ROLE authenticated; SELECT 1 FROM public.social_auto_rule_events LIMIT 1;" >/dev/null 2>&1; then
  echo "authenticated can select event table" >&2
  exit 1
fi
echo "OK up 0114 column, partial index, RLS, service_role-only access, ledger row"

psql_file "$DB_DIR/migrations/0114_social_meta_webhook_idempotency.down.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_post_targets' AND column_name = 'meta_post_id'
  ), 'meta_post_id column remains after down';
  ASSERT to_regclass('public.social_post_targets_meta_idx') IS NULL, 'meta partial index remains after down';
  ASSERT to_regclass('public.social_auto_rule_events') IS NULL, 'event table remains after down';
  ASSERT NOT EXISTS (SELECT 1 FROM public.schema_migrations
                     WHERE filename = '0114_social_meta_webhook_idempotency.sql'), '0114 ledger row remains after down';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations
                 WHERE filename = '0113_social_smart_link_visitor_dedupe.sql'), 'down removed an earlier ledger row';
END $$;
SQL
echo "OK down 0114 column, partial index, table, ledger row gone"

psql_file "$DB_DIR/migrations/0114_social_meta_webhook_idempotency.sql" >/dev/null
psql_run -c "INSERT INTO public.schema_migrations (filename, number, sha256, applied_by) VALUES ('0114_social_meta_webhook_idempotency.sql', '0114', repeat('0', 64), 'local-verify') ON CONFLICT (filename) DO NOTHING" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'social_post_targets' AND column_name = 'meta_post_id'), 'meta_post_id column missing after re-up';
  ASSERT to_regclass('public.social_post_targets_meta_idx') IS NOT NULL, 'meta partial index missing after re-up';
  ASSERT to_regclass('public.social_auto_rule_events') IS NOT NULL, 'event table missing after re-up';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations
                 WHERE filename = '0114_social_meta_webhook_idempotency.sql'), '0114 ledger row missing after re-up';
END $$;
SQL
echo "OK re-up 0114 schema and ledger row restored"

psql_file "$DB_DIR/migrations/0114_social_meta_webhook_idempotency.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'social_post_targets' AND column_name = 'meta_post_id'), 'meta_post_id column missing after second up';
  ASSERT to_regclass('public.social_post_targets_meta_idx') IS NOT NULL, 'meta partial index missing after second up';
  ASSERT to_regclass('public.social_auto_rule_events') IS NOT NULL, 'event table missing after second up';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations
                 WHERE filename = '0114_social_meta_webhook_idempotency.sql'), '0114 ledger row missing after second up';
END $$;
SQL
echo "OK second up 0114 idempotent no-op"
