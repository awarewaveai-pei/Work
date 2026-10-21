#!/usr/bin/env bash
# C26 e2e against a real database (SOCIAL_MANAGER_PLAN.md §1b C26): add a link -> the public page shows it -> a click ->
# the count is +1. A throwaway Postgres with 0096-0113 (packages/db/scripts/0113_social_smart_link_visitor_dedupe-local-verify.sh) and PostgREST
# (the same image as lobster-factory/infra/supabase) in front of it; then lib/social/__tests__/smartlink.e2e.test.ts runs
# the real page, the real /go route and the real store against them. Touches no production. Needs docker.
#   bash lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/smartlink-real-db.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../../../.." && pwd)"
APP="$ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin"
PG="smartlink-e2e-pg-$$"
REST="smartlink-e2e-rest-$$"
PORT="${SMARTLINK_REST_PORT:-54329}"
SECRET="smartlink-e2e-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

cleanup() { docker rm -f "$REST" "$PG" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ throwaway Postgres with the social schema (0113 verify)"
KEEP_CONTAINER="$PG" bash "$ROOT/lobster-factory/packages/db/scripts/0113_social_smart_link_visitor_dedupe-local-verify.sh" | tail -1
docker exec "$PG" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -qc "GRANT service_role TO postgres; GRANT anon TO postgres;" >/dev/null
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PG")"

echo "▶ PostgREST on 127.0.0.1:$PORT"
docker run -d --name "$REST" -p "127.0.0.1:$PORT:3000" \
  -e PGRST_DB_URI="postgres://postgres:verify@$PG_IP:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" postgrest/postgrest:v14.6 >/dev/null
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 1; done

echo "▶ the page, the click route and the store against it"
cd "$APP"
SMARTLINK_REST="http://127.0.0.1:$PORT" SMARTLINK_JWT_SECRET="$SECRET" SMARTLINK_VISITOR_HASH_SALT="local-test-only-salt" npx vitest run lib/social/__tests__/smartlink.e2e.test.ts
