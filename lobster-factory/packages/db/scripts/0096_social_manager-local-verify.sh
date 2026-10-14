#!/usr/bin/env bash
# Verify migration 0096 (social manager) against a real Postgres in a throwaway container. Touches no production.
# Applies what 0096 assumes (organizations stub, Supabase roles, 0011 with two mappings, 0094's RLS event trigger),
# then 0096, the assertions, a refused apply when 0011 maps one integration to two orgs, the down migration, a re-apply.
#
# Usage: bash packages/db/scripts/0096_social_manager-local-verify.sh     (needs docker; PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="social-0096-verify-$$"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"   # production supabase-db is 15.8 (2026-10-14); PG_IMAGE=postgres:16-alpine for the next major

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ starting $IMAGE as $CONTAINER"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
# Over TCP (kb-local-verify.sh pattern): the image's first-boot server listens on the socket only, then
# restarts, so a socket check can pass before the real server is up.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 \
  || { echo "✗ postgres never became reachable in the container"; exit 1; }

psql_run() { docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

seed_0011() {
  psql_run <<'SQL' >/dev/null
DELETE FROM public.social_postiz_connections;
INSERT INTO public.social_postiz_connections (client_id, postiz_integration_id, platform, label, status) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'int-bsky', 'bluesky', 'soulful', 'connected'),
  ('00000000-0000-0000-0000-00000000000b', 'int-fb', 'facebook', NULL, 'expired'),
  ('00000000-0000-0000-0000-00000000000b', 'int-x', 'x', 'X', 'connected');
SQL
}

echo "▶ bootstrapping what 0096 assumes"
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
-- Supabase's default ACL: anon/authenticated get every privilege on new public tables (0094 header)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
INSERT INTO public.organizations (id, type, slug, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'client', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'client', 'brand-b', 'Brand B');
SQL
psql_file "$DB_DIR/migrations/0011_social_postiz_connections.sql" >/dev/null
psql_file "$DB_DIR/migrations/0094_public_tables_rls_default_deny.sql" >/dev/null
seed_0011

echo "▶ applying 0096"
psql_file "$DB_DIR/migrations/0096_social_manager.sql" >/dev/null

echo "▶ proving the harness can fail"
SELF_TEST="$(psql_run -q -c "SET plpgsql.check_asserts = on; DO \$\$ BEGIN ASSERT false, 'harness self-test'; END \$\$;" 2>&1 || true)"
case "$SELF_TEST" in
  *"harness self-test"*) echo "  self-test raised as expected" ;;
  *) echo "✗ ASSERT does not raise here — every assertion below would be a no-op"; exit 1 ;;
esac

run_assertions() {
  local out
  out="$(psql_file "$HERE/0096_social_manager-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ assertions failed"; return 1; }
  local tag
  for tag in BEHAVIOUR DEFERRED AUDIT BRAND_DELETE ACCESS; do
    echo "$out" | grep -q "SOCIAL_0096_${tag}_OK" || { echo "$out" | tail -5; echo "✗ ${tag} assertions did not pass"; return 1; }
  done
}

echo "▶ running behavioural assertions"
run_assertions
echo "  SOCIAL_0096_{BEHAVIOUR,DEFERRED,AUDIT,BRAND_DELETE,ACCESS}_OK"

echo "▶ applying the down migration"
psql_file "$DB_DIR/scripts/0096_social_manager_down.sql" >/dev/null
DOWN_STATE="$(psql_run -tAc "
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'social\_%' AND table_name <> 'social_postiz_connections')
      THEN 'down_left_tables_behind'
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'social\_%') THEN 'down_left_functions_behind'
    WHEN (SELECT count(*) FROM public.social_postiz_connections) <> 3 THEN 'down_touched_0011'
    ELSE 'DOWN_OK'
  END")"
[ "$DOWN_STATE" = "DOWN_OK" ] || { echo "✗ down migration did not restore the previous state: $DOWN_STATE"; exit 1; }
echo "  DOWN_OK"

echo "▶ 0011 mapping one integration to two orgs must abort 0096"
psql_run -c "INSERT INTO public.social_postiz_connections (client_id, postiz_integration_id, platform) VALUES ('00000000-0000-0000-0000-00000000000b', 'int-bsky', 'bluesky');" >/dev/null
DUP_OUT="$(psql_file "$DB_DIR/migrations/0096_social_manager.sql" 2>&1 || true)"
case "$DUP_OUT" in
  *"more than one org: int-bsky"*) echo "  refused: $(echo "$DUP_OUT" | grep -o 'more than one org: int-bsky')" ;;
  *) echo "✗ 0096 applied over a two-org mapping"; echo "$DUP_OUT" | tail -3; exit 1 ;;
esac
[ "$(psql_run -tAc "SELECT to_regclass('public.social_posts') IS NULL")" = "t" ] || { echo "✗ the refused apply left tables behind"; exit 1; }
seed_0011

echo "▶ re-applying 0096 (a migration you cannot re-apply is not a rollback path)"
psql_file "$DB_DIR/migrations/0096_social_manager.sql" >/dev/null
run_assertions

echo "▶ applying 0096 twice is a no-op"
BEFORE="$(psql_run -tAc "SELECT count(*) FROM public.social_accounts")"
psql_file "$DB_DIR/migrations/0096_social_manager.sql" >/dev/null
[ "$(psql_run -tAc "SELECT count(*) FROM public.social_accounts")" = "$BEFORE" ] || { echo "✗ second apply duplicated accounts"; exit 1; }

echo "✅ social manager 0096 verified: data copy (incl. X), one brand per integration, isolation, state shape, frozen published posts and children, restore stays published, lists and slot idempotence, deferred FKs, append-only audit for service_role, brand delete, access, down, refused duplicate, re-apply, idempotent"
