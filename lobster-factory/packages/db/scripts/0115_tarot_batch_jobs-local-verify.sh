#!/usr/bin/env bash
# Verify 0115 against a disposable PostgreSQL container. Touches no production database.
# Bootstraps what 0115 assumes (organizations stub, Supabase roles + default ACL, 0094 RLS event trigger,
# schema_migrations), applies 0115, checks schema/RLS/grants and the claim/finish rules on real Postgres,
# runs the down migration, then re-applies twice.
# Usage: bash packages/db/scripts/0115_tarot_batch_jobs-local-verify.sh   (PG_IMAGE overrides the image)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="${KEEP_CONTAINER:-tarot-0115-verify-$$}"
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
  if "$DOCKER" exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }
ledger() {
  psql_run -c "INSERT INTO public.schema_migrations (filename, number, sha256, applied_by) VALUES ('0115_tarot_batch_jobs.sql', '0115', repeat('0', 64), 'local-verify') ON CONFLICT (filename) DO NOTHING" >/dev/null
}

psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
-- Supabase's default ACL: anon/authenticated get every privilege on new public tables and functions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
INSERT INTO public.organizations (id, slug) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'org-a'), ('00000000-0000-0000-0000-00000000000b', 'org-b');
SQL
psql_file "$DB_DIR/migrations/0094_public_tables_rls_default_deny.sql" >/dev/null
psql_run <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY, number text NOT NULL, sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL);
INSERT INTO public.schema_migrations (filename, number, sha256, applied_by)
VALUES ('0114_social_meta_webhook_idempotency.sql', '0114', repeat('0', 64), 'local-verify');
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
SQL
echo "OK bootstrap"

psql_file "$DB_DIR/migrations/0115_tarot_batch_jobs.sql" >/dev/null
ledger
psql_run <<'SQL' >/dev/null
DO $$
DECLARE o text; u text; s text;
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tarot_batch_jobs'::regclass), 'jobs RLS off';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tarot_batch_cards'::regclass), 'cards RLS off';
  ASSERT NOT has_table_privilege('anon', 'public.tarot_batch_jobs', 'SELECT'), 'anon can select jobs';
  ASSERT NOT has_table_privilege('authenticated', 'public.tarot_batch_cards', 'SELECT'), 'authenticated can select cards';
  ASSERT NOT has_function_privilege('anon', 'public.tarot_batch_claim_card(uuid,integer,text,integer)', 'EXECUTE'), 'anon can claim';
  ASSERT NOT has_function_privilege('authenticated', 'public.tarot_batch_finish_card(uuid,integer,text,text)', 'EXECUTE'), 'authenticated can finish';
  ASSERT has_function_privilege('service_role', 'public.tarot_batch_claim_card(uuid,integer,text,integer)', 'EXECUTE'), 'service_role cannot claim';

  INSERT INTO public.tarot_batch_jobs (id, organization_id, model, aspect_ratio, total_cards, deadline_at)
  VALUES ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000a', 'm', '2:3', 3, now() + interval '1 hour');

  SELECT claim_outcome INTO o FROM public.tarot_batch_claim_card('22222222-2222-2222-2222-222222222222', 0, 'Fool', 180);
  ASSERT o = 'no_job', 'unknown job: ' || o;
  SELECT claim_outcome INTO o FROM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 0, 'Fool', 180);
  ASSERT o = 'claimed', 'first claim: ' || o;
  SELECT claim_outcome INTO o FROM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 0, 'Fool', 180);
  ASSERT o = 'in_progress', 'fresh claim held: ' || o;
  ASSERT public.tarot_batch_finish_card('11111111-1111-1111-1111-111111111111', 0, 'https://r2/x/000.png', NULL) = 'done', 'finish done';
  SELECT claim_outcome, done_url INTO o, u FROM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 0, 'Fool', 180);
  ASSERT o = 'done' AND u = 'https://r2/x/000.png', 'retry after done must return the stored url: ' || o;
  ASSERT public.tarot_batch_finish_card('11111111-1111-1111-1111-111111111111', 0, NULL, 'late error') = 'done', 'late error overwrote done';
  ASSERT (SELECT attempts FROM public.tarot_batch_cards WHERE card_index = 0) = 1, 'done card was re-claimed';

  PERFORM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 1, 'Magician', 180);
  ASSERT public.tarot_batch_finish_card('11111111-1111-1111-1111-111111111111', 1, NULL, 'replicate_failed') = 'error', 'finish error';
  SELECT claim_outcome INTO o FROM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 1, 'Magician', 180);
  ASSERT o = 'claimed', 'error card must be claimable again: ' || o;

  PERFORM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 2, 'Priestess', 180);
  UPDATE public.tarot_batch_cards SET claimed_at = now() - interval '10 minutes' WHERE card_index = 2;
  SELECT claim_outcome INTO o FROM public.tarot_batch_claim_card('11111111-1111-1111-1111-111111111111', 2, 'Priestess', 180);
  ASSERT o = 'claimed', 'stale claim must be claimable again: ' || o;
  ASSERT (SELECT count(*) FROM public.tarot_batch_cards) = 3, 'one row per card';

  DELETE FROM public.organizations WHERE id = '00000000-0000-0000-0000-00000000000a';
  ASSERT (SELECT count(*) FROM public.tarot_batch_cards) = 0, 'org delete did not cascade';
END $$;
SQL
if psql_run -c "SET ROLE anon; SELECT 1 FROM public.tarot_batch_jobs LIMIT 1;" >/dev/null 2>&1; then
  echo "anon can select tarot_batch_jobs" >&2; exit 1
fi
if ! psql_run -c "SET ROLE service_role; SELECT 1 FROM public.tarot_batch_cards LIMIT 1;" >/dev/null 2>&1; then
  echo "service_role cannot select tarot_batch_cards" >&2; exit 1
fi
echo "OK up 0115 tables, RLS, service_role-only grants, claim/finish rules, cascade"

psql_file "$DB_DIR/migrations/0115_tarot_batch_jobs.down.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  ASSERT to_regclass('public.tarot_batch_jobs') IS NULL, 'jobs table remains after down';
  ASSERT to_regclass('public.tarot_batch_cards') IS NULL, 'cards table remains after down';
  ASSERT to_regprocedure('public.tarot_batch_claim_card(uuid,integer,text,integer)') IS NULL, 'claim fn remains';
  ASSERT to_regprocedure('public.tarot_batch_finish_card(uuid,integer,text,text)') IS NULL, 'finish fn remains';
  ASSERT NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0115_tarot_batch_jobs.sql'), 'ledger row remains';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0114_social_meta_webhook_idempotency.sql'), 'down removed an earlier ledger row';
END $$;
SQL
echo "OK down 0115 tables, functions, ledger row gone"

psql_file "$DB_DIR/migrations/0115_tarot_batch_jobs.sql" >/dev/null
ledger
psql_file "$DB_DIR/migrations/0115_tarot_batch_jobs.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  ASSERT to_regclass('public.tarot_batch_cards') IS NOT NULL, 'cards table missing after re-up';
  ASSERT to_regprocedure('public.tarot_batch_claim_card(uuid,integer,text,integer)') IS NOT NULL, 'claim fn missing after re-up';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename IN ('tarot_batch_jobs', 'tarot_batch_cards')) = 2, 'policy count after re-up';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0115_tarot_batch_jobs.sql'), 'ledger row missing after re-up';
END $$;
SQL
echo "OK re-up + second up idempotent"
