#!/usr/bin/env bash
# Verify 0112 against a disposable PostgreSQL container. Touches no production database.
# Usage: bash packages/db/scripts/0112_social_saved_text_media-local-verify.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="${KEEP_CONTAINER:-social-0112-verify-$$}"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"
if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then
  DOCKER=docker
elif command -v docker.exe >/dev/null 2>&1; then
  DOCKER=docker.exe
else
  echo "docker or docker.exe is required" >&2
  exit 1
fi

cleanup() { "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
[ -n "${KEEP_CONTAINER:-}" ] || trap cleanup EXIT

"$DOCKER" run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  "$DOCKER" exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

echo "▶ bootstrap the 0096-shaped tables used by 0112"
psql_run <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.social_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'video')), file_name text NOT NULL, storage_path text NOT NULL,
  postiz_media_id text, postiz_path text, bytes bigint, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);
CREATE TABLE public.social_saved_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000), created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.organizations VALUES
  ('00000000-0000-0000-0000-00000000000a', 'A'), ('00000000-0000-0000-0000-00000000000b', 'B');
INSERT INTO public.social_media (id, organization_id, kind, file_name, storage_path, created_by) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-00000000000a', 'image', 'one.png', 'one', 'test'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-00000000000a', 'video', 'two.mp4', 'two', 'test'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-00000000000b', 'image', 'other.png', 'other', 'test');
SQL

echo "▶ apply and assert isolation, order, duplicate refusal and cascade"
psql_file "$DB_DIR/migrations/0112_social_saved_text_media.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  m1 uuid := '10000000-0000-4000-8000-000000000001';
  m2 uuid := '10000000-0000-4000-8000-000000000002';
  mb uuid := '20000000-0000-4000-8000-000000000001';
  saved uuid;
  got uuid[];
BEGIN
  SELECT id, media_ids INTO saved, got FROM public.social_save_text(a, 'hello', ARRAY[m2, m1]);
  ASSERT got = ARRAY[m2, m1], 'save keeps media order';
  SELECT media_ids INTO got FROM public.social_list_saved_texts(a) WHERE id = saved;
  ASSERT got = ARRAY[m2, m1], 'list keeps media order';
  BEGIN
    PERFORM public.social_save_text(a, 'cross-brand', ARRAY[mb]);
    RAISE EXCEPTION 'cross-brand media was accepted';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLSTATE = 'P0001', 'cross-brand media has the expected refusal';
  END;
  BEGIN
    PERFORM public.social_save_text(a, 'duplicate', ARRAY[m1, m1]);
    RAISE EXCEPTION 'duplicate media was accepted';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLSTATE = 'P0001', 'duplicate media has the expected refusal';
  END;
  ASSERT (SELECT count(*) FROM public.social_saved_texts WHERE organization_id = a) = 1, 'failed saves leave no text row';
  DELETE FROM public.social_saved_texts WHERE id = saved AND organization_id = a;
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_saved_text_media WHERE saved_text_id = saved), 'text delete cascades media links';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.social_saved_text_media'::regclass), 'RLS is on';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_saved_text_media'
                 AND policyname = 'service_role only' AND roles = '{service_role}'), 'only the service_role policy';
END $$;
SQL

echo "▶ down, re-apply, and check idempotence"
psql_file "$DB_DIR/migrations/0112_social_saved_text_media.down.sql" >/dev/null
psql_run -c "SELECT to_regclass('public.social_saved_text_media') IS NULL AND to_regprocedure('public.social_save_text(uuid,text,uuid[])') IS NULL" | grep -q t
psql_file "$DB_DIR/migrations/0112_social_saved_text_media.sql" >/dev/null
psql_file "$DB_DIR/migrations/0112_social_saved_text_media.sql" >/dev/null
psql_run -c "SELECT to_regclass('public.social_saved_text_media') IS NOT NULL AND to_regprocedure('public.social_save_text(uuid,text,uuid[])') IS NOT NULL" | grep -q t

echo "✅ 0112 saved media relation verified: brand isolation, order, duplicate refusal, cascade, down/re-apply and idempotence"
