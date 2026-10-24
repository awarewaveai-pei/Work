#!/usr/bin/env bash
# Verify 0122 against a disposable PostgreSQL container. Touches no production database.
# Bootstraps what 0121 assumes, applies 0121 then 0122, checks that a topic cannot use another organization's site or
# an unowned one, that a used site cannot change organization, that deleting a site clears only site_id, then runs the
# down (old single-column key back) and re-applies. Usage: bash packages/db/scripts/0122_content_topics_site_org-local-verify.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="content-0122-verify-$$"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"   # production supabase-db is 15.8
if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then DOCKER=docker; else DOCKER=docker.exe; fi
cleanup() { "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$DOCKER" run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  "$DOCKER" exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO service_role;
CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
CREATE TABLE public.wp_sites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id));
CREATE TABLE public.client_schedules (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_key text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CONSTRAINT client_schedules_frequency_check CHECK (frequency IN ('daily','weekly')),
  hour_utc int NOT NULL DEFAULT 3, day_of_week_utc int NOT NULL DEFAULT 1, PRIMARY KEY (organization_id, job_key));
CREATE TABLE public.schema_migrations (filename text PRIMARY KEY, number text NOT NULL, sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL);
INSERT INTO public.organizations (id, slug) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'brand-a'), ('00000000-0000-4000-8000-00000000000b', 'brand-b');
INSERT INTO public.wp_sites (id, name, organization_id) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'A', '00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-0000000000b1', 'B', '00000000-0000-4000-8000-00000000000b'),
  ('00000000-0000-4000-8000-0000000000c1', 'unowned', NULL);
SQL
psql_file "$DB_DIR/migrations/0121_content_topics.sql" >/dev/null

# 0122 refuses to run over a topic that already uses another organization's site
psql_run -c "INSERT INTO public.content_topics (id, organization_id, site_id, title, keyword, source, month, created_by)
  VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b1', 'bad', 'bad', 'manual', '2026-11-01', 'verify')" >/dev/null
if psql_file "$DB_DIR/migrations/0122_content_topics_site_org.sql" >/dev/null 2>&1; then echo "FAIL: 0122 ran over a cross-organization topic"; exit 1; fi
psql_run -c "DELETE FROM public.content_topics" >/dev/null

apply_up() { psql_file "$DB_DIR/migrations/0122_content_topics_site_org.sql" >/dev/null; }
apply_up

checks() {
psql_run <<'SQL' >/dev/null
DO $$
DECLARE a uuid := '00000000-0000-4000-8000-00000000000a'; b uuid := '00000000-0000-4000-8000-00000000000b';
  sa uuid := '00000000-0000-4000-8000-0000000000a1'; sb uuid := '00000000-0000-4000-8000-0000000000b1'; sc uuid := '00000000-0000-4000-8000-0000000000c1';
  t uuid;
BEGIN
  INSERT INTO public.content_topics (organization_id, site_id, title, keyword, source, month, created_by)
    VALUES (a, sa, 'ok', 'ok', 'manual', '2026-11-01', 'verify') RETURNING id INTO t;
  INSERT INTO public.content_topics (organization_id, site_id, title, keyword, source, month, created_by)
    VALUES (a, NULL, 'no site', 'no site', 'manual', '2026-11-01', 'verify');
  BEGIN INSERT INTO public.content_topics (organization_id, site_id, title, keyword, source, month, created_by)
    VALUES (a, sb, 'x', 'x1', 'manual', '2026-11-01', 'verify'); RAISE EXCEPTION 'another organization''s site accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.content_topics (organization_id, site_id, title, keyword, source, month, created_by)
    VALUES (a, sc, 'x', 'x2', 'manual', '2026-11-01', 'verify'); RAISE EXCEPTION 'unowned site accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN UPDATE public.content_topics SET site_id = sb WHERE id = t; RAISE EXCEPTION 'site moved to another organization''s';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN UPDATE public.wp_sites SET organization_id = b WHERE id = sa; RAISE EXCEPTION 'a used site changed organization';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  UPDATE public.wp_sites SET organization_id = a WHERE id = sb;          -- an unused site still may
  UPDATE public.wp_sites SET organization_id = b WHERE id = sb;
  DELETE FROM public.wp_sites WHERE id = sa;
  IF (SELECT site_id FROM public.content_topics WHERE id = t) IS NOT NULL THEN RAISE EXCEPTION 'site delete kept site_id'; END IF;
  IF (SELECT organization_id FROM public.content_topics WHERE id = t) <> a THEN RAISE EXCEPTION 'site delete changed organization'; END IF;
  INSERT INTO public.wp_sites (id, name, organization_id) VALUES (sa, 'A', a);
  DELETE FROM public.content_topics;
END $$;
SQL
}
checks
echo "constraints: ok"

psql_file "$DB_DIR/migrations/0122_content_topics_site_org.down.sql" >/dev/null
psql_run -tA -c "SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.content_topics'::regclass AND contype = 'f'" \
  | grep -qx "content_topics_organization_id_fkey,content_topics_site_id_fkey" || { echo "FAIL: down did not restore the 0121 keys"; exit 1; }
psql_run -tA -c "SELECT count(*) FROM pg_constraint WHERE conname = 'wp_sites_id_organization_key'" | grep -qx 0 || { echo "FAIL: down kept the unique key"; exit 1; }
echo "down: ok"

apply_up
checks
echo "re-apply: ok"
echo "0122 local verify PASS ($IMAGE)"
