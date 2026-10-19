#!/usr/bin/env bash
# Verify migration 0105 (V1.5 schema) against a real Postgres in a throwaway container. Touches no production.
# Same bootstrap as 0103_social_brand_members-local-verify.sh; then 0096-0103, a seed of rows as production holds them
# before 0105, 0105 and its assertions, the 0100 and 0101 assertions again (the code deployed today keeps working on
# 0105), the down migration, a re-apply with the assertions, and a second apply (no-op).
#
# Usage: bash packages/db/scripts/0105_social_v16-local-verify.sh     (needs docker; PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
# KEEP_CONTAINER=<name>: the container keeps running with the schema applied (C26 tests/e2e/social/smartlink-real-db.sh
# puts PostgREST in front of it); that caller removes it
CONTAINER="${KEEP_CONTAINER:-social-0105-verify-$$}"
IMAGE="${PG_IMAGE:-postgres:15.8-alpine}"   # production supabase-db is 15.8

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
[ -n "${KEEP_CONTAINER:-}" ] || trap cleanup EXIT

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql_run() { docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

echo "▶ bootstrapping what 0096-0103 assume, then 0096-0103"
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
-- as production: service_role bypasses RLS and reads organizations (0105 social_smart_link_click reads the brand's zone)
ALTER ROLE service_role BYPASSRLS;
GRANT SELECT ON public.organizations TO service_role;
INSERT INTO public.organizations (id, type, slug, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'client', 'brand-a', 'Brand A'),
  ('00000000-0000-0000-0000-00000000000b', 'client', 'brand-b', 'Brand B');
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email varchar(255), created_at timestamptz DEFAULT now(),
  deleted_at timestamptz, is_anonymous boolean NOT NULL DEFAULT false, is_sso_user boolean NOT NULL DEFAULT false,
  email_confirmed_at timestamptz DEFAULT now());
REVOKE ALL ON auth.users FROM PUBLIC;
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
for m in 0100_social_dispatch 0101_social_rotation 0102_social_review 0103_social_brand_members; do
  psql_file "$DB_DIR/migrations/$m.sql" >/dev/null
done

echo "▶ seeding rows as production holds them before 0105 (first_comment on a draft and a published post, a list)"
seed() {
psql_run <<'SQL' >/dev/null
DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  acc uuid; p uuid; v int;
BEGIN
  SELECT id INTO acc FROM public.social_accounts WHERE organization_id = a ORDER BY platform LIMIT 1;
  PERFORM public.social_save_post(a, NULL, NULL, '{"body":"seed-draft","first_comment":"first!"}', NULL, NULL, 'seed');
  SELECT saved_post_id, saved_version INTO p, v FROM public.social_save_post(a, NULL, NULL, '{"body":"seed-published","first_comment":"sent comment"}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'seed');
  UPDATE public.social_posts SET state = 'scheduled', scheduled_at = now() - interval '1 day' WHERE id = p;
  UPDATE public.social_post_targets SET state = 'published' WHERE post_id = p;
  UPDATE public.social_posts SET state = 'published', published_at = now() WHERE id = p;
  PERFORM public.social_save_list(a, NULL, 'seed-list', '{1,4}', '10:00', false, ARRAY[acc], 'seed');
END $$;
SQL
}
seed

assertions() {
  local out
  out="$(psql_file "$HERE/0105_social_v16-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -8; echo "✗ assertions failed"; return 1; }
  for tag in COMPAT CONTENT REPEAT LISTS RULES SMARTLINK BEHAVIOUR CASCADE ACCESS; do
    echo "$out" | grep -q "SOCIAL_0105_${tag}_OK" || { echo "$out" | tail -8; echo "✗ ${tag} assertions did not pass"; return 1; }
  done
}

echo "▶ applying 0105 and asserting"
psql_file "$DB_DIR/migrations/0105_social_v16.sql" >/dev/null
assertions
echo "  SOCIAL_0105_{COMPAT,CONTENT,REPEAT,LISTS,RULES,SMARTLINK,BEHAVIOUR,CASCADE,ACCESS}_OK"

assert_0109() {
  local out
  out="$(psql_file "$HERE/0109_social_repeat_version-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ 0109 assertions failed"; return 1; }
  for tag in BEHAVIOUR ACCESS; do
    echo "$out" | grep -q "SOCIAL_0109_${tag}_OK" || { echo "$out" | tail -5; echo "✗ 0109 ${tag} did not pass"; return 1; }
  done
}
echo "▶ applying 0109 (series slots tied to the template version) and asserting"
psql_file "$DB_DIR/migrations/0109_social_repeat_version.sql" >/dev/null
assert_0109
echo "  SOCIAL_0109_{BEHAVIOUR,ACCESS}_OK"

echo "▶ the 0101 and 0100 assertions on 0105 (callers by the old argument lists and behaviour unchanged)"
clean() { psql_run -c "DELETE FROM public.social_posts; DELETE FROM public.social_media; DELETE FROM public.social_lists; DELETE FROM public.social_postiz_orphans;" >/dev/null; }
clean
out="$(psql_file "$HERE/0101_social_rotation-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ 0101 assertions fail on 0105"; exit 1; }
echo "$out" | grep -q "SOCIAL_0101_BEHAVIOUR_OK" || { echo "$out" | tail -5; echo "✗ 0101 behaviour on 0105"; exit 1; }
clean
out="$(psql_file "$HERE/0100_social_dispatch-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ 0100 assertions fail on 0105"; exit 1; }
echo "$out" | grep -q "SOCIAL_0100_BEHAVIOUR_OK" || { echo "$out" | tail -5; echo "✗ 0100 behaviour on 0105"; exit 1; }
echo "  0101 + 0100 behaviour still OK on 0105"

echo "▶ down, then re-apply"
clean
seed
psql_file "$DB_DIR/migrations/0105_social_v16.sql" >/dev/null   # the seed's comments and slots exist again
psql_file "$DB_DIR/migrations/0109_social_repeat_version.down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regprocedure('public.social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text)') IS NOT NULL AND to_regprocedure('public.social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text,integer)') IS NULL")" = "t" ]   || { echo "✗ 0109 down did not restore 0105's function"; exit 1; }
psql_file "$DB_DIR/migrations/0105_social_v16.down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regclass('public.social_post_comments') IS NULL AND to_regclass('public.social_tags') IS NULL AND to_regclass('public.social_list_slots') IS NULL AND to_regclass('public.social_smart_links') IS NULL AND to_regclass('public.social_reports') IS NULL AND to_regclass('public.social_metrics_daily') IS NULL AND to_regprocedure('public.social_save_post(uuid,uuid,integer,jsonb,jsonb,jsonb,text)') IS NOT NULL AND to_regprocedure('public.social_save_post(uuid,uuid,integer,jsonb,jsonb,jsonb,text,jsonb,uuid[])') IS NULL AND to_regprocedure('public.social_save_list(uuid,uuid,text,smallint[],time,boolean,uuid[],text)') IS NOT NULL AND to_regprocedure('public.social_withdraw_repeat(uuid,uuid,text,text)') IS NULL AND position('social_withdraw_repeat' in pg_get_functiondef('public.social_set_state(uuid,uuid,integer,text,timestamptz,uuid,integer,text,text,jsonb)'::regprocedure)) = 0 AND position('social_post_comments' in pg_get_functiondef('public.social_materialize_list(uuid,timestamptz[],text)'::regprocedure)) = 0 AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('social_posts', 'social_accounts') AND column_name IN ('repeat', 'repeat_of', 'auto_mode', 'picture', 'handle', 'chatwoot_inbox_id'))")" = "t" ] \
  || { echo "✗ down left 0105 behind or did not restore 0098/0101"; exit 1; }
[ "$(psql_run -tAc "SELECT (SELECT first_comment FROM public.social_posts WHERE body = 'seed-draft') = 'first!' AND (SELECT weekdays = '{1,4}' FROM public.social_lists WHERE name = 'seed-list')")" = "t" ] \
  || { echo "✗ down lost first_comment or weekdays"; exit 1; }
# the 0101 assertions pass on the restored functions (down = 0101's behaviour)
clean
out="$(psql_file "$HERE/0101_social_rotation-local-verify.sql" 2>&1)" || { echo "$out" | grep -E 'ERROR|CONTEXT' | head -5; echo "✗ 0101 assertions fail after the down"; exit 1; }
echo "$out" | grep -q "SOCIAL_0101_ACCESS_OK" || { echo "$out" | tail -5; echo "✗ 0101 access after the down"; exit 1; }
clean
seed
psql_file "$DB_DIR/migrations/0105_social_v16.sql" >/dev/null
assertions
psql_file "$DB_DIR/migrations/0105_social_v16.sql" >/dev/null   # twice = no-op
psql_file "$DB_DIR/migrations/0109_social_repeat_version.sql" >/dev/null
assert_0109
psql_file "$DB_DIR/migrations/0109_social_repeat_version.sql" >/dev/null   # twice = no-op
[ "$(psql_run -tAc "SELECT count(*) FROM public.social_post_comments c JOIN public.social_posts p ON p.id = c.post_id WHERE p.body = 'seed-draft'")" = "1" ] \
  || { echo "✗ a second apply copied first_comment twice"; exit 1; }
# db-expert 2026-10-17: the grid list (Mon 08:00, Mon 18:00, Wed 12:00 -> weekdays {1,3}, send_time 08:00) keeps 3 slots
[ "$(psql_run -tAc "SELECT count(*) FROM public.social_list_slots s JOIN public.social_lists l ON l.id = s.list_id WHERE l.name = 'grid'")" = "3" ] \
  || { echo "✗ a second apply widened a saved slot grid"; exit 1; }

echo "✅ V1.5 schema 0105 verified: backfills (first_comment -> comment 0 incl. published, weekdays x send_time -> slots), old 7/8-argument callers and the 0100/0101 behaviour unchanged, comments frozen once sent, brand isolation (tags, comment media, rule posts, report accounts, smart link items), repeat series (shape, draft makes none, once per slot, untouched children follow the template, edited ones stay, stop), list slot grid, rules, smart link slugs and clicks, reports PDF only, metrics nulls, brand cascade, service_role only, down restores 0098/0101 and keeps first_comment/weekdays, re-apply, idempotent"
