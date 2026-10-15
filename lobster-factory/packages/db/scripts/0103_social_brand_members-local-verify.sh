#!/usr/bin/env bash
# Verify migration 0103 (brand members) against a real Postgres in a throwaway container. Touches no production.
# Same bootstrap as 0101_social_rotation-local-verify.sh plus a minimal auth.users, then 0096, 0103, the assertions, the
# down migration, a re-apply.
#
# Usage: bash packages/db/scripts/0103_social_brand_members-local-verify.sh     (needs docker; PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="social-0103-verify-$$"
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

echo "▶ bootstrapping what 0096 and 0103 assume, then 0096"
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
-- auth.users as production has it (2026-10-15: email varchar, deleted_at, is_anonymous); service_role cannot read it
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email varchar(255), created_at timestamptz DEFAULT now(),
  deleted_at timestamptz, is_anonymous boolean NOT NULL DEFAULT false, is_sso_user boolean NOT NULL DEFAULT false,
  email_confirmed_at timestamptz DEFAULT now());
REVOKE ALL ON auth.users FROM PUBLIC;
INSERT INTO auth.users (id, email, deleted_at, is_anonymous, is_sso_user) VALUES
  ('10000000-0000-0000-0000-000000000001', 'ann@example.com', NULL, false, false),
  ('10000000-0000-0000-0000-000000000002', 'Bob@Example.com', NULL, false, false),
  ('10000000-0000-0000-0000-000000000003', 'gone@example.com', now(), false, false),
  ('10000000-0000-0000-0000-000000000004', 'anon@example.com', NULL, true, false),
  ('10000000-0000-0000-0000-000000000005', 'twin@example.com', NULL, false, false),
  ('10000000-0000-0000-0000-000000000006', 'TWIN@example.com', NULL, false, true);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000007', 'unconfirmed@example.com', NULL);
INSERT INTO public.organizations (id, type, slug, name) VALUES ('00000000-0000-0000-0000-00000000000c', 'client', 'brand-c', 'Brand C');
SQL
psql_file "$DB_DIR/migrations/0011_social_postiz_connections.sql" >/dev/null
psql_file "$DB_DIR/migrations/0094_public_tables_rls_default_deny.sql" >/dev/null
psql_file "$DB_DIR/migrations/0096_social_manager.sql" >/dev/null

assertions() {
  local out
  out="$(psql_file "$HERE/0103_social_brand_members-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ assertions failed"; return 1; }
  for tag in BEHAVIOUR ACCESS; do
    echo "$out" | grep -q "SOCIAL_0103_${tag}_OK" || { echo "$out" | tail -5; echo "✗ ${tag} assertions did not pass"; return 1; }
  done
}

echo "▶ applying 0103 and asserting"
psql_file "$DB_DIR/migrations/0103_social_brand_members.sql" >/dev/null
assertions
echo "  SOCIAL_0103_{BEHAVIOUR,ACCESS}_OK"

echo "▶ two sessions demote the brand's two owners at once: one wins, the other is refused (invariant 2 under concurrency)"
C=00000000-0000-0000-0000-00000000000c; ANN=10000000-0000-0000-0000-000000000001; BOB=10000000-0000-0000-0000-000000000002
psql_run -c "INSERT INTO public.social_brand_members (organization_id, user_id, role) VALUES ('$C', '$ANN', 'owner'), ('$C', '$BOB', 'owner');" >/dev/null
# session 1 demotes ann and holds its locks for 3 s; session 2 demotes bob meanwhile and must wait, then see ann demoted
psql_run -c "SET ROLE service_role; BEGIN; SELECT public.social_set_member_role('$C', '$ANN', 'editor', 's1'); SELECT pg_sleep(3); COMMIT;" >/dev/null &
S1=$!
sleep 1
S2="$(psql_run -c "SET ROLE service_role; SELECT public.social_set_member_role('$C', '$BOB', 'editor', 's2');" 2>&1 || true)"
wait $S1
echo "$S2" | grep -q "the last owner stays" || { echo "$S2" | tail -3; echo "✗ concurrent demotions both passed"; exit 1; }
[ "$(psql_run -tAc "SELECT count(*) FROM public.social_brand_members WHERE organization_id = '$C' AND role = 'owner'")" = "1" ]   || { echo "✗ brand c does not have exactly one owner left"; exit 1; }
echo "  concurrent: one owner left, the second demotion refused"

echo "▶ down, then re-apply"
psql_file "$DB_DIR/scripts/0103_social_brand_members_down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regprocedure('public.social_add_member(uuid,text,text,text)') IS NULL AND to_regprocedure('public.social_list_members(uuid)') IS NULL AND to_regprocedure('public.social_remove_member(uuid,uuid,text)') IS NULL AND to_regprocedure('public.social_set_member_role(uuid,uuid,text,text)') IS NULL AND to_regprocedure('public.social_lock_members_for_change(uuid,uuid,text)') IS NULL AND to_regclass('public.social_brand_members') IS NOT NULL")" = "t" ] \
  || { echo "✗ down left 0103 behind or took the table"; exit 1; }
psql_run -c "DELETE FROM public.social_brand_members; DELETE FROM public.social_audit_log;" >/dev/null
psql_file "$DB_DIR/migrations/0103_social_brand_members.sql" >/dev/null
assertions
psql_file "$DB_DIR/migrations/0103_social_brand_members.sql" >/dev/null   # twice = no-op

echo "✅ brand members 0103 verified: found by email (case, spaces), unknown/deleted/anonymous/unconfirmed/ambiguous refused, concurrent demotions keep one owner, no duplicate, last owner stays, audit rows without email, service_role only, down keeps the table, re-apply, idempotent"
