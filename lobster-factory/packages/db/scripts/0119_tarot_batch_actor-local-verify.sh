#!/usr/bin/env bash
# Verify 0119 against a disposable PostgreSQL container. Touches no production database.
# Builds on the 0115 verify (same bootstrap, leaves 0115 applied), then: up adds a nullable, length-checked actor
# column; existing rows stay null; down drops it and its ledger row only; up twice is idempotent.
# Usage: bash packages/db/scripts/0119_tarot_batch_actor-local-verify.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="tarot-0119-verify-$$"
if command -v docker >/dev/null 2>&1 && docker version >/dev/null 2>&1; then DOCKER=docker; else DOCKER=docker.exe; fi
cleanup() { "$DOCKER" rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

KEEP_CONTAINER="$CONTAINER" bash "$HERE/0115_tarot_batch_jobs-local-verify.sh"
psql_run() { "$DOCKER" exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

psql_run -c "INSERT INTO public.tarot_batch_jobs (id, model, aspect_ratio, total_cards, deadline_at) VALUES ('00000000-0000-4000-8000-000000000001', 'm', '2:3', 1, now() + interval '1 hour')" >/dev/null
psql_file "$DB_DIR/migrations/0119_tarot_batch_actor.sql" >/dev/null
psql_run -c "INSERT INTO public.schema_migrations (filename, number, sha256, applied_by) VALUES ('0119_tarot_batch_actor.sql', '0119', repeat('0', 64), 'local-verify')" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  ASSERT (SELECT actor IS NULL FROM public.tarot_batch_jobs WHERE id = '00000000-0000-4000-8000-000000000001'), 'existing row not null';
  INSERT INTO public.tarot_batch_jobs (id, actor, model, aspect_ratio, total_cards, deadline_at)
    VALUES ('00000000-0000-4000-8000-000000000002', 'client:org:u', 'm', '2:3', 1, now() + interval '1 hour');
  BEGIN
    INSERT INTO public.tarot_batch_jobs (id, actor, model, aspect_ratio, total_cards, deadline_at)
      VALUES ('00000000-0000-4000-8000-000000000003', '', 'm', '2:3', 1, now() + interval '1 hour');
    RAISE EXCEPTION 'empty actor accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SQL
echo "OK up 0119: nullable actor, old rows null, empty actor refused"
psql_file "$DB_DIR/migrations/0119_tarot_batch_actor.down.sql" >/dev/null
psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tarot_batch_jobs' AND column_name = 'actor'), 'actor remains after down';
  ASSERT (SELECT count(*) FROM public.tarot_batch_jobs) = 2, 'down lost job rows';
  ASSERT NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0119_tarot_batch_actor.sql'), 'ledger row remains';
  ASSERT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '0115_tarot_batch_jobs.sql'), 'down removed 0115 ledger row';
END $$;
SQL
echo "OK down 0119: column and its ledger row gone, rows and 0115 kept"
psql_file "$DB_DIR/migrations/0119_tarot_batch_actor.sql" >/dev/null
psql_file "$DB_DIR/migrations/0119_tarot_batch_actor.sql" >/dev/null
echo "OK re-up + second up idempotent"
diff -q "$DB_DIR/migrations/0119_tarot_batch_actor.down.sql" "$DB_DIR/scripts/0119_tarot_batch_actor_down.sql" >/dev/null
echo "PASS 0119"
