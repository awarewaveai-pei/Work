#!/usr/bin/env bash
# Verify 0116 against a disposable PostgreSQL container. Touches no production database.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="${KEEP_CONTAINER:-social-0116-verify-$$}"
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

KEEP_CONTAINER="$CONTAINER" bash "$HERE/0115_tarot_batch_jobs-local-verify.sh" >/dev/null
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

psql_run <<'SQL' >/dev/null
INSERT INTO public.schema_migrations (filename, number, sha256, applied_by)
VALUES ('0115_tarot_batch_jobs.sql', '0115', repeat('0', 64), 'local-verify')
ON CONFLICT (filename) DO NOTHING;
INSERT INTO public.organizations (id, slug)
VALUES ('00000000-0000-0000-0000-00000000000a', 'org-a')
ON CONFLICT (id) DO NOTHING;
SQL
psql_file "$DB_DIR/migrations/0116_social_meta_assets.sql" >/dev/null
psql_run <<'SQL' >/dev/null
INSERT INTO public.schema_migrations (filename, number, sha256, applied_by)
VALUES ('0116_social_meta_assets.sql', '0116', repeat('0', 64), 'local-verify')
ON CONFLICT (filename) DO NOTHING;
DO $$
BEGIN
  ASSERT to_regclass('public.social_meta_assets') IS NOT NULL, 'asset table is missing';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.social_meta_assets'::regclass), 'asset RLS is off';
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_meta_assets') = 1, 'asset policy count is wrong';
  ASSERT NOT has_table_privilege('anon', 'public.social_meta_assets', 'SELECT'), 'anon can select asset table';
  ASSERT NOT has_table_privilege('authenticated', 'public.social_meta_assets', 'SELECT'), 'authenticated can select asset table';
  INSERT INTO public.social_meta_assets (organization_id, kind, external_id, page_external_id)
  VALUES ('00000000-0000-0000-0000-00000000000a', 'instagram_account', 'ig-1', 'page-1');
  ASSERT (SELECT page_external_id FROM public.social_meta_assets WHERE external_id = 'ig-1') = 'page-1', 'linked page is missing';
END $$;
SQL
echo "OK up 0116 schema, linked Page check, RLS and service_role-only access"

psql_file "$DB_DIR/migrations/0116_social_meta_assets.down.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
BEGIN
  ASSERT to_regclass('public.social_meta_assets') IS NULL, 'asset table remains after down';
  ASSERT NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0116_social_meta_assets.sql'), '0116 ledger row remains after down';
END $$;
SQL
echo "OK down 0116 table and ledger row gone"

psql_file "$DB_DIR/migrations/0116_social_meta_assets.sql" >/dev/null
psql_run -c "INSERT INTO public.schema_migrations (filename, number, sha256, applied_by) VALUES ('0116_social_meta_assets.sql', '0116', repeat('0', 64), 'local-verify') ON CONFLICT (filename) DO NOTHING" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
BEGIN
  ASSERT to_regclass('public.social_meta_assets') IS NOT NULL, 'asset table missing after re-up';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0116_social_meta_assets.sql'), '0116 ledger row missing after re-up';
END $$;
SQL
echo "OK re-up 0116 schema and ledger row restored"
