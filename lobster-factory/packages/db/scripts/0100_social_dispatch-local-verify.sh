#!/usr/bin/env bash
# Verify migration 0100 (social sender) against a real Postgres in a throwaway container. Touches no production.
# Same bootstrap as 0098_social_writes-local-verify.sh, then 0096, 0098, 0100, the assertions, the down migration, a re-apply.
#
# Usage: bash packages/db/scripts/0100_social_dispatch-local-verify.sh     (needs docker; PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="social-0100-verify-$$"
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

psql_file "$DB_DIR/migrations/0098_social_writes.sql" >/dev/null
psql_run -c "INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform, label) VALUES ('00000000-0000-0000-0000-00000000000a', 'int-x-a', 'x', 'a on x');" >/dev/null

assertions() {
  local out
  out="$(psql_file "$HERE/0100_social_dispatch-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ assertions failed"; return 1; }
  for tag in BEHAVIOUR ACCESS; do
    echo "$out" | grep -q "SOCIAL_0100_${tag}_OK" || { echo "$out" | tail -5; echo "✗ ${tag} assertions did not pass"; return 1; }
  done
}

echo "▶ applying 0100 and asserting"
psql_file "$DB_DIR/migrations/0100_social_dispatch.sql" >/dev/null
assertions
echo "  SOCIAL_0100_{BEHAVIOUR,ACCESS}_OK"

echo "▶ down, then re-apply"
psql_file "$DB_DIR/scripts/0100_social_dispatch_down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regclass('public.social_dispatch_state') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'social_claim_due' OR proname LIKE 'social_release_post') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_post_targets' AND column_name IN ('send_started_at', 'send_key'))")" = "t" ] \
  || { echo "✗ down left 0100 objects behind"; exit 1; }
[ "$(psql_run -tAc "SELECT to_regprocedure('public.social_save_post(uuid,uuid,integer,jsonb,jsonb,jsonb,text)') IS NOT NULL")" = "t" ] || { echo "✗ down touched 0098"; exit 1; }
psql_run -c "DELETE FROM public.social_posts;" >/dev/null
psql_file "$DB_DIR/migrations/0100_social_dispatch.sql" >/dev/null
assertions
psql_file "$DB_DIR/migrations/0100_social_dispatch.sql" >/dev/null   # twice = no-op

echo "✅ social sender 0100 verified: claim once, send lease (go/busy/uncertain/stale) whose uncertain retry gets the same send_key, write-back only on its claim (a refused one kept as an orphan), 429 keeps pending, outcome follows targets, published target never reset, failed target reset only after its Postiz post was deleted, release refused in flight / undeleted id / published, service_role only, down, re-apply, idempotent"
