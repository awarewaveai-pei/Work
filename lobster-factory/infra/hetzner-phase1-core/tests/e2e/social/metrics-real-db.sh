#!/usr/bin/env bash
# C24 real data (SOCIAL_MANAGER_PLAN.md §1b C24): one channel's day written into the database and read back the way the
# 數據分析 page reads it. A throwaway Postgres with 0096-0109 (packages/db/scripts/0105_social_v16-local-verify.sh) and
# PostgREST in front of it; brand A's Bluesky channel is Soulful's real handle, fetched from Bluesky's public API (no
# login). lib/social/__tests__/metrics.e2e.test.ts runs the real snapshot and the real page loader. Touches no production.
#   bash lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/metrics-real-db.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../../../.." && pwd)"
APP="$ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin"
PG="metrics-e2e-pg-$$"
REST="metrics-e2e-rest-$$"
PORT="${METRICS_REST_PORT:-54331}"
SECRET="metrics-e2e-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
HANDLE="${METRICS_BSKY_HANDLE:-soulfulexpression.bsky.social}"

cleanup() { docker rm -f "$REST" "$PG" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ throwaway Postgres with the social schema (0105 verify)"
KEEP_CONTAINER="$PG" bash "$ROOT/lobster-factory/packages/db/scripts/0105_social_v16-local-verify.sh" | tail -1
# system_modes empty = "normal" (the snapshot's production-change gate fails closed on a missing table); brand A in
# Taipei with one connected Bluesky channel on the real handle, every other channel off; the verify's own metrics rows
# (made-up numbers such as reach 40) cleared, so every number read back came from the snapshot
docker exec -i "$PG" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -q >/dev/null <<SQL
GRANT service_role TO postgres; GRANT anon TO postgres;
DELETE FROM public.social_post_metrics; DELETE FROM public.social_metrics_daily;
CREATE TABLE IF NOT EXISTS public.system_modes (scope_type text NOT NULL, scope_id uuid, mode text NOT NULL);
GRANT SELECT ON public.system_modes TO service_role;
UPDATE public.organizations SET default_timezone = 'Asia/Taipei' WHERE id = '00000000-0000-0000-0000-00000000000a';
UPDATE public.social_accounts SET status = 'disabled';
UPDATE public.social_accounts SET status = 'connected', handle = '$HANDLE'
 WHERE organization_id = '00000000-0000-0000-0000-00000000000a' AND platform = 'bluesky';
SQL
PG_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PG")"

echo "▶ PostgREST on 127.0.0.1:$PORT"
docker run -d --name "$REST" -p "127.0.0.1:$PORT:3000" \
  -e PGRST_DB_URI="postgres://postgres:verify@$PG_IP:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" postgrest/postgrest:v14.6 >/dev/null
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 1; done

echo "▶ snapshot (Bluesky public API) -> social_metrics_daily -> the page loader"
cd "$APP"
METRICS_REST="http://127.0.0.1:$PORT" METRICS_JWT_SECRET="$SECRET" npx vitest run lib/social/__tests__/metrics.e2e.test.ts
echo "▶ rows as stored"
docker exec "$PG" psql -h 127.0.0.1 -U postgres -d postgres -c \
  "SELECT day, followers, reach, impressions, engagement, posts FROM public.social_metrics_daily WHERE followers IS NOT NULL OR posts > 0 ORDER BY day DESC LIMIT 5;"
