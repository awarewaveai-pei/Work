#!/usr/bin/env bash
# 永久刪除 (已刪除貼文, 2026-11-13) against a real database: a binned post and all its own rows are erased, a shared media
# item stays, the log keeps a purge row; a post not in the bin is refused by the DELETE itself. Same throwaway Postgres
# (0096-0116) + PostgREST as smartlink-real-db.sh; then lib/social/__tests__/purge.e2e.test.ts runs the real store.
# Touches no production. Needs docker.
#   bash lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/purge-real-db.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../../../.." && pwd)"
APP="$ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin"
PG="purge-e2e-pg-$$"
REST="purge-e2e-rest-$$"
PORT="${PURGE_REST_PORT:-54331}"
SECRET="purge-e2e-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

cleanup() { docker rm -f "$REST" "$PG" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ throwaway Postgres with the social schema (0113 verify, then 0114 and 0116: the columns the store reads)"
KEEP_CONTAINER="$PG" bash "$ROOT/lobster-factory/packages/db/scripts/0113_social_smart_link_visitor_dedupe-local-verify.sh" | tail -1
for m in 0114_social_meta_webhook_idempotency 0116_social_meta_assets; do
  docker exec -i "$PG" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < "$ROOT/lobster-factory/packages/db/migrations/$m.sql" >/dev/null
done
docker exec "$PG" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -qc "GRANT service_role TO postgres; GRANT anon TO postgres;" >/dev/null
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PG")"

echo "▶ PostgREST on 127.0.0.1:$PORT"
docker run -d --name "$REST" -p "127.0.0.1:$PORT:3000" \
  -e PGRST_DB_URI="postgres://postgres:verify@$PG_IP:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" postgrest/postgrest:v14.6 >/dev/null
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 1; done

echo "▶ the store against it"
cd "$APP"
PURGE_REST="http://127.0.0.1:$PORT" PURGE_JWT_SECRET="$SECRET" npx vitest run lib/social/__tests__/purge.e2e.test.ts
