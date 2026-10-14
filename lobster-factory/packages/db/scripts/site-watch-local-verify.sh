#!/usr/bin/env bash
# Verify migration 0091 (site-watch) against a real Postgres in a throwaway container. Touches no
# production. Applies what 0091 assumes (organizations stub, ops_inbox 0013 + org columns, 0031,
# 0073 for the current source constraint), then 0091, the assertions, the down migration, a re-apply.
#
# Usage: bash packages/db/scripts/site-watch-local-verify.sh     (needs docker)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="site-watch-verify-$$"
IMAGE="postgres:16-alpine"

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

echo "▶ bootstrapping what 0091 assumes"
psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.organizations (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type     text NOT NULL,
  slug     text UNIQUE NOT NULL,
  name     text NOT NULL,
  status   text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
SQL
psql_file "$DB_DIR/migrations/0013_ops_inbox.sql" >/dev/null
psql_run <<'SQL' >/dev/null
ALTER TABLE public.ops_incidents
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_slug text;
SQL
psql_file "$DB_DIR/migrations/0031_ops_incidents_deploy_source.sql" >/dev/null
psql_file "$DB_DIR/migrations/0073_collection_runs_and_issues.sql" >/dev/null

echo "▶ applying 0091"
psql_file "$DB_DIR/migrations/0091_site_watch.sql" >/dev/null

echo "▶ proving the harness can fail"
SELF_TEST="$(psql_run -q -c "SET plpgsql.check_asserts = on; DO \$\$ BEGIN ASSERT false, 'harness self-test'; END \$\$;" 2>&1 || true)"
case "$SELF_TEST" in
  *"harness self-test"*) echo "  self-test raised as expected" ;;
  *) echo "✗ ASSERT does not raise here — every assertion below would be a no-op"; exit 1 ;;
esac

run_assertions() {
  local out
  out="$(psql_file "$HERE/site-watch-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ assertions failed"; return 1; }
  echo "$out" | grep -q 'SITE_WATCH_VERIFY_STATE_OK' || { echo "$out" | tail -5; echo "✗ state assertions did not pass"; return 1; }
  echo "$out" | grep -q 'SITE_WATCH_VERIFY_OPS_OK'   || { echo "$out" | tail -5; echo "✗ ops assertions did not pass"; return 1; }
}

echo "▶ running behavioural assertions"
run_assertions
echo "  SITE_WATCH_VERIFY_STATE_OK + SITE_WATCH_VERIFY_OPS_OK"

echo "▶ applying the down migration"
psql_file "$DB_DIR/scripts/0091_site_watch_down.sql" >/dev/null
DOWN_STATE="$(psql_run -tAc "
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'site_watch%')
      THEN 'down_left_tables_behind'
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'site_watch%')
      THEN 'down_left_functions_behind'
    WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='ops_incidents_source_check')) LIKE '%site_watch%'
      THEN 'down_left_source_allowed'
    WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='ops_incidents_source_check')) NOT LIKE '%collection%'
      THEN 'down_dropped_collection_source'
    ELSE 'DOWN_OK'
  END")"
[ "$DOWN_STATE" = "DOWN_OK" ] || { echo "✗ down migration did not restore the previous state: $DOWN_STATE"; exit 1; }
echo "  DOWN_OK"

echo "▶ re-applying 0091 (a migration you cannot re-apply is not a rollback path)"
psql_run -c "DELETE FROM public.organizations; DELETE FROM public.ops_incidents;" >/dev/null
psql_file "$DB_DIR/migrations/0091_site_watch.sql" >/dev/null
run_assertions

echo "✅ site-watch 0091 verified: lease fencing, episode/notification state machine, config, cleanup, down, re-apply"
