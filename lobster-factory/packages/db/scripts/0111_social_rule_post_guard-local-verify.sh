#!/usr/bin/env bash
# Verify migration 0111 (a post's own auto-reply rule: queued guard + post version in SQL) on a real Postgres in a throwaway
# container. Touches no production. Same bootstrap as 0105_social_v16-local-verify.sh; then 0096-0103, 0105, 0109
# (0104/0106-0108/0110 do not touch social), 0111 and its assertions, the down migration, a re-apply, a second apply.
#
# Usage: bash packages/db/scripts/0111_social_rule_post_guard-local-verify.sh     (needs docker; PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
# KEEP_CONTAINER=<name>: the container keeps running with the schema applied (C26 tests/e2e/social/smartlink-real-db.sh
# puts PostgREST in front of it); that caller removes it
CONTAINER="${KEEP_CONTAINER:-social-0111-verify-$$}"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"   # production supabase-db is 15.8

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
[ -n "${KEEP_CONTAINER:-}" ] || trap cleanup EXIT

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_run() { docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

echo "▶ bootstrapping what 0096-0103 assume, then 0096-0103"
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
-- as production: service_role bypasses RLS and reads organizations (0105 social_smart_link_click reads the brand's zone)
ALTER ROLE service_role BYPASSRLS;
GRANT SELECT ON public.organizations TO service_role;
INSERT INTO public.organizations (id, type, slug, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'client', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'client', 'brand-b', 'Brand B');
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email varchar(255), created_at timestamptz DEFAULT now(),
  deleted_at timestamptz, is_anonymous boolean NOT NULL DEFAULT false, is_sso_user boolean NOT NULL DEFAULT false,
  email_confirmed_at timestamptz DEFAULT now());
REVOKE ALL ON auth.users FROM PUBLIC;
SQL
psql_file "$DB_DIR/migrations/0011_social_postiz_connections.sql" >/dev/null
psql_file "$DB_DIR/migrations/0094_public_tables_rls_default_deny.sql" >/dev/null
psql_run <<'SQL' >/dev/null
INSERT INTO public.social_postiz_connections (client_id, postiz_integration_id, platform, label, status) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'int-bsky', 'bluesky', 'soulful', 'connected'),
  ('00000000-0000-0000-0000-00000000000b', 'int-fb', 'facebook', NULL, 'connected');
SQL
psql_file "$DB_DIR/migrations/0096_social_manager.sql" >/dev/null
psql_file "$DB_DIR/migrations/0098_social_writes.sql" >/dev/null
psql_run -c "INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform, label) VALUES ('00000000-0000-0000-0000-00000000000a', 'int-x-a', 'x', 'a on x');" >/dev/null
for m in 0100_social_dispatch 0101_social_rotation 0102_social_review 0103_social_brand_members; do
  psql_file "$DB_DIR/migrations/$m.sql" >/dev/null
done

asserting() {
  local out
  out="$(psql_file "$HERE/0111_social_rule_post_guard-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -8; echo "✗ 0111 assertions failed"; return 1; }
  for tag in BEHAVIOUR ACCESS; do
    echo "$out" | grep -q "SOCIAL_0111_${tag}_OK" || { echo "$out" | tail -8; echo "✗ 0111 ${tag} did not pass"; return 1; }
  done
}
echo "▶ applying 0105, 0109, 0111 and asserting"
psql_file "$DB_DIR/migrations/0105_social_v16.sql" >/dev/null
psql_file "$DB_DIR/migrations/0109_social_repeat_version.sql" >/dev/null
psql_file "$DB_DIR/migrations/0111_social_rule_post_guard.sql" >/dev/null
asserting
echo "  SOCIAL_0111_{BEHAVIOUR,ACCESS}_OK"

echo "▶ down: the old functions still work, the new ones are gone"
psql_file "$DB_DIR/migrations/0111_social_rule_post_guard.down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regprocedure('public.social_save_post_rule(uuid,uuid,jsonb,text)') IS NULL AND to_regprocedure('public.social_delete_post_rule(uuid,uuid,text)') IS NULL AND position('SC409' in pg_get_functiondef('public.social_touch_post_rules(uuid,uuid,text)'::regprocedure)) = 0 AND to_regprocedure('public.social_save_auto_rule(uuid,uuid,jsonb,text)') IS NOT NULL")" = "t" ] \
  || { echo "✗ 0111 down did not restore 0105's touch function or left the new ones"; exit 1; }
psql_run <<'SQL' >/dev/null
SET ROLE service_role;
DO $$
DECLARE a uuid := '00000000-0000-0000-0000-00000000000a'; r uuid;
BEGIN
  r := public.social_save_auto_rule(a, NULL, '{"name":"after down","trigger":"dm","platforms":["facebook"],"action":"reply"}', 'verify');
  PERFORM public.social_delete_auto_rule(a, r, 'verify');
END $$;
SQL

echo "▶ re-apply, then apply twice (no-op)"
psql_file "$DB_DIR/migrations/0111_social_rule_post_guard.sql" >/dev/null
asserting
psql_file "$DB_DIR/migrations/0111_social_rule_post_guard.sql" >/dev/null
asserting

echo "✅ 0111 verified: a queued post's own rule can be neither saved nor deleted (SC409, version untouched), save/delete return the post's version from the same transaction (draft +1 per write, brand rule null), the 0105 functions pick up the guard, service_role only, down restores 0105's touch function, re-apply, idempotent"
