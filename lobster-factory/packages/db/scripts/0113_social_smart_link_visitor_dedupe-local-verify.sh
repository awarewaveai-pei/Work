#!/usr/bin/env bash
# Verify 0113 against a disposable PostgreSQL container. Touches no production database.
# The 0105 verifier applies the 0096-0103 social base, 0105 and 0109; this script then applies
# the remaining migrations present through 0112 before testing 0113's up/down/re-apply path.
# Usage: bash packages/db/scripts/0113_social_smart_link_visitor_dedupe-local-verify.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="${KEEP_CONTAINER:-social-0113-verify-$$}"
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

echo "▶ apply the 0096-0112 social chain"
base_out="$(KEEP_CONTAINER="$CONTAINER" bash "$HERE/0105_social_v16-local-verify.sh" 2>&1)"
echo "$base_out" | tail -1
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

# The social verifier intentionally starts from a narrow schema. These are the small pre-0096
# relations needed only so unrelated 0104/0107/0108/0110/0112 migrations can also be applied.
psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.organization_product_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_key text NOT NULL CHECK (product_key IN ('cognitive', 'hci')), status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'canceled')), external_tenant_id uuid,
  started_at timestamptz, current_period_end timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_product_subs_live_uniq ON public.organization_product_subscriptions (organization_id, product_key) WHERE status <> 'canceled';
CREATE OR REPLACE FUNCTION public.user_has_org_membership(p_org uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$ SELECT false $$;
CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY, email text, default_organization_id uuid);
CREATE TABLE IF NOT EXISTS public.organization_memberships (organization_id uuid, user_id uuid, membership_type text, status text);
CREATE TABLE IF NOT EXISTS public.media_credit_ledger (organization_id uuid, units numeric NOT NULL DEFAULT 0);
SQL

for m in 0104_cs_crisis_holding_replies 0107_cs_holding_reply_kinds 0108_cs_conversation_staff_replies; do
  psql_file "$DB_DIR/migrations/$m.sql" >/dev/null
done
psql_file "$DB_DIR/migrations/0110_plans_entitlements.sql" >/dev/null
psql_file "$DB_DIR/migrations/0111_social_rule_post_guard.sql" >/dev/null
psql_file "$DB_DIR/migrations/0112_social_saved_text_media.sql" >/dev/null

echo "▶ apply 0113 and assert atomic visitor-day dedupe"
psql_file "$DB_DIR/migrations/0113_social_smart_link_visitor_dedupe.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$
DECLARE
  item uuid;
  before_n integer;
  after_first integer;
  after_repeat integer;
  first jsonb;
  repeated jsonb;
BEGIN
  SELECT id INTO item FROM public.social_smart_link_items WHERE organization_id = '00000000-0000-0000-0000-00000000000a' ORDER BY position LIMIT 1;
  SELECT n INTO before_n FROM public.social_smart_link_clicks WHERE item_id = item AND day = (now() AT TIME ZONE 'UTC')::date;
  SELECT public.social_smart_link_click('soulful-art', item, repeat('a', 64)) INTO first;
  ASSERT first->>'url' = 'https://soulful.example', 'a valid click returns the URL';
  ASSERT (first->>'counted')::boolean, 'the first visitor-day click counts';
  SELECT n INTO after_first FROM public.social_smart_link_clicks WHERE item_id = item AND day = (now() AT TIME ZONE 'UTC')::date;
  ASSERT after_first = before_n + 1, 'the first visitor increments the aggregate';
  SELECT public.social_smart_link_click('soulful-art', item, repeat('a', 64)) INTO repeated;
  ASSERT repeated->>'url' = 'https://soulful.example' AND NOT (repeated->>'counted')::boolean, 'a duplicate redirects but does not count';
  SELECT n INTO after_repeat FROM public.social_smart_link_clicks WHERE item_id = item AND day = (now() AT TIME ZONE 'UTC')::date;
  ASSERT after_repeat = after_first, 'a duplicate leaves the aggregate unchanged';
  ASSERT (public.social_smart_link_click('soulful-art', item, repeat('c', 64))->>'counted')::boolean, 'another visitor counts';
  ASSERT NOT (public.social_smart_link_click('soulful-art', item, repeat('z', 63))->>'counted')::boolean, 'an invalid hash fails closed';
  INSERT INTO public.social_smart_link_click_dedupe (item_id, day, visitor_hash) VALUES (item, current_date - 4, repeat('b', 64));
  PERFORM public.social_smart_link_click('soulful-art', item, repeat('d', 64));
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_smart_link_click_dedupe WHERE item_id = item AND visitor_hash = repeat('b', 64)), 'old dedupe rows are purged';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.social_smart_link_click_dedupe'::regclass), 'dedupe RLS is on';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_smart_link_click_dedupe'
                AND policyname = 'service_role only' AND roles = '{service_role}'), 'dedupe is service_role only';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_smart_link_click_dedupe' AND column_name IN ('ip', 'user_agent')), 'no raw visitor fields are stored';
END $$;
SQL

echo "▶ down, re-apply, and check idempotence"
psql_file "$DB_DIR/migrations/0113_social_smart_link_visitor_dedupe.down.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regclass('public.social_smart_link_click_dedupe') IS NULL AND to_regprocedure('public.social_smart_link_click(text,uuid)') IS NOT NULL AND to_regprocedure('public.social_smart_link_click(text,uuid,text)') IS NULL")" = "t" ]
psql_file "$DB_DIR/migrations/0113_social_smart_link_visitor_dedupe.sql" >/dev/null
psql_file "$DB_DIR/migrations/0113_social_smart_link_visitor_dedupe.sql" >/dev/null
[ "$(psql_run -tAc "SELECT to_regclass('public.social_smart_link_click_dedupe') IS NOT NULL AND to_regprocedure('public.social_smart_link_click(text,uuid,text)') IS NOT NULL")" = "t" ]

echo "✅ 0113 smart-link dedupe verified: salted hash key, atomic visitor-day idempotence, invalid-hash fail-closed, three-day purge, RLS, down/re-apply and idempotence"
