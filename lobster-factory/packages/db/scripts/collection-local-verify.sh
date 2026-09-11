#!/usr/bin/env bash
# Verify migration 0073 (collection C2) against a real Postgres, in a throwaway container.
#
# Nothing here touches production. It applies the dependencies 0073 assumes (an organizations stub,
# then the ops_inbox tables and the 0031 source constraint it extends), then 0073, then the
# behavioural assertions, then the down migration.
#
# Usage: bash packages/db/scripts/collection-local-verify.sh     (needs docker)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="collect-verify-$$"
IMAGE="postgres:16-alpine"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ starting $IMAGE as $CONTAINER"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null

psql_run() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

echo "▶ bootstrapping what 0013/0073 assume"
psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.organizations (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
SQL

echo "▶ applying 0013 (ops inbox), 0028 (tenant scope) and 0031 (deploy source)"
psql_file "$DB_DIR/migrations/0013_ops_inbox.sql" >/dev/null
# 0028 is what gives ops_incidents its organization_id — the column the collection alert writes.
# Only the ops_incidents part of it is needed here; the rest of that migration builds repair-os
# tables this harness has no reason to stand up.
psql_run <<'SQL' >/dev/null
ALTER TABLE public.ops_incidents
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_slug text;
SQL
psql_file "$DB_DIR/migrations/0031_ops_incidents_deploy_source.sql" >/dev/null

echo "▶ applying 0073 (collection runs + issues + collection incident source)"
psql_file "$DB_DIR/migrations/0073_collection_runs_and_issues.sql" >/dev/null

echo "▶ proving the harness can fail"
SELF_TEST="$(psql_run -q -c "SET plpgsql.check_asserts = on; DO \$\$ BEGIN ASSERT false, 'harness self-test'; END \$\$;" 2>&1 || true)"
case "$SELF_TEST" in
  *"harness self-test"*) echo "  self-test raised as expected" ;;
  *) echo "✗ ASSERT does not raise here — every assertion below would be a no-op"; exit 1 ;;
esac

echo "▶ running behavioural assertions"
OUT="$(psql_file "$HERE/collection-local-verify.sql" 2>&1)" || { echo "$OUT" | grep -E 'ERROR'; echo "✗ assertions failed"; exit 1; }
echo "$OUT" | grep -q 'COLLECTION_VERIFY_RUNS_OK'  || { echo "$OUT" | tail -5; echo "✗ run/issue assertions did not pass"; exit 1; }
echo "$OUT" | grep -q 'COLLECTION_VERIFY_ALERT_OK' || { echo "$OUT" | tail -5; echo "✗ alert-path assertions did not pass"; exit 1; }
echo "  COLLECTION_VERIFY_RUNS_OK + COLLECTION_VERIFY_ALERT_OK"

echo "▶ applying the down migration"
psql_file "$DB_DIR/scripts/0073_collection_runs_and_issues_down.sql" >/dev/null
DOWN_STATE="$(psql_run -tAc "
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name IN ('collection_runs','collection_issues'))
      THEN 'down_left_tables_behind'
    WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='ops_incidents_source_check')) LIKE '%collection%'
      THEN 'down_left_collection_source_allowed'
    ELSE 'DOWN_OK'
  END")"
[ "$DOWN_STATE" = "DOWN_OK" ] || { echo "✗ down migration did not restore the previous state: $DOWN_STATE"; exit 1; }
echo "  DOWN_OK"

echo "▶ re-applying 0073 (a migration you cannot re-apply is not a rollback path)"
psql_file "$DB_DIR/migrations/0073_collection_runs_and_issues.sql" >/dev/null
psql_file "$HERE/collection-local-verify.sql" 2>&1 | grep -q 'COLLECTION_VERIFY_ALERT_OK' || {
  echo "✗ assertions failed after re-apply"; exit 1;
}

echo "✅ collection C2 verified: run/issue persistence, alert path, down migration, re-apply"
