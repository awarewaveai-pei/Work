#!/usr/bin/env bash
# Verify migration 0098 (social writes) against a real Postgres in a throwaway container. Touches no production.
# Same bootstrap as 0096_social_manager-local-verify.sh (organizations stub, Supabase roles, 0011 rows, 0094), then 0096,
# 0098, the assertions, the down migration, a re-apply.
#
# Usage: bash packages/db/scripts/0098_social_writes-local-verify.sh     (needs docker; PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="social-0098-verify-$$"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"   # production supabase-db is 15.8

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_run() { docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

echo "▶ bootstrapping what 0096 assumes, then 0096"
psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL, slug text UNIQUE NOT NULL, name text NOT NULL,
  status text NOT NULL DEFAULT 'active', default_timezone text NOT NULL DEFAULT 'UTC', metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;   -- as Supabase does: the revokes must win
GRANT USAGE ON SCHEMA public TO service_role;
INSERT INTO public.organizations (id, type, slug, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'client', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'client', 'brand-b', 'Brand B');
SQL
psql_file "$DB_DIR/migrations/0011_social_postiz_connections.sql" >/dev/null
psql_file "$DB_DIR/migrations/0094_public_tables_rls_default_deny.sql" >/dev/null
psql_run <<'SQL' >/dev/null
INSERT INTO public.social_postiz_connections (client_id, postiz_integration_id, platform, label, status) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'int-bsky', 'bluesky', 'soulful', 'connected'),
  ('00000000-0000-0000-0000-00000000000b', 'int-fb', 'facebook', NULL, 'connected');
SQL
psql_file "$DB_DIR/migrations/0096_social_manager.sql" >/dev/null

assertions() {
  local out
  out="$(psql_file "$HERE/0098_social_writes-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ assertions failed"; return 1; }
  for tag in BEHAVIOUR ACCESS; do
    echo "$out" | grep -q "SOCIAL_0098_${tag}_OK" || { echo "$out" | tail -5; echo "✗ ${tag} assertions did not pass"; return 1; }
  done
}

echo "▶ applying 0098 and asserting"
psql_file "$DB_DIR/migrations/0098_social_writes.sql" >/dev/null
assertions
echo "  SOCIAL_0098_{BEHAVIOUR,ACCESS}_OK"

echo "▶ another brand's account as a target is refused at COMMIT (the deferred foreign key, as in production)"
before="$(psql_run -tAc "SELECT count(*) FROM public.social_posts")"
out="$(psql_run -c '\set VERBOSITY verbose' -c "SET ROLE service_role; SELECT * FROM public.social_save_post('00000000-0000-0000-0000-00000000000a', NULL, NULL, '{}',
  jsonb_build_array(jsonb_build_object('account_id', (SELECT id FROM public.social_accounts WHERE organization_id = '00000000-0000-0000-0000-00000000000b' LIMIT 1))), NULL, 'verify')" 2>&1 || true)"
echo "$out" | grep -q 23503 || { echo "$out" | tail -3; echo "✗ cross-brand target was not refused at commit"; exit 1; }
[ "$(psql_run -tAc "SELECT count(*) FROM public.social_posts")" = "$before" ] || { echo "✗ the refused save left a post behind"; exit 1; }

echo "▶ down, then re-apply"
psql_file "$DB_DIR/scripts/0098_social_writes_down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regclass('public.social_connect_attempts') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('social_save_post','social_set_state','social_save_list'))")" = "t" ] \
  || { echo "✗ down left 0098 objects behind"; exit 1; }
[ "$(psql_run -tAc "SELECT to_regclass('public.social_posts') IS NOT NULL")" = "t" ] || { echo "✗ down touched 0096"; exit 1; }
psql_run -c "DELETE FROM public.social_posts; DELETE FROM public.social_media; DELETE FROM public.social_lists; DELETE FROM public.social_accounts WHERE postiz_integration_id = 'int-x-a';" >/dev/null
psql_file "$DB_DIR/migrations/0098_social_writes.sql" >/dev/null
assertions
psql_file "$DB_DIR/migrations/0098_social_writes.sql" >/dev/null   # twice = no-op

echo "✅ social writes 0098 verified: atomic save with children and one version bump, stale version refused, brand isolation (edit, target, state, list), cross-brand target refused at commit, 0096 shape kept, delete/restore, deleted not editable, sent targets keep their write-back, list + accounts atomic, one open attempt per brand and one new-channel attempt per Postiz, service_role only despite default grants, down, re-apply, idempotent"
