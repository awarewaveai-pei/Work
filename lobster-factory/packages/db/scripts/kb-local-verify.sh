#!/usr/bin/env bash
# Verify migration 0072 (KB K1) against a real Postgres, in a throwaway container.
#
# Nothing here touches production: it starts pgvector/pgvector:pg16 on a random port, applies a
# minimal organizations stub (the only table 0051 depends on) → 0051 → 0072, runs the behavioural
# assertions in kb-local-verify.sql, then applies the down migration and re-applies 0072 to prove
# the rollback is real and the migration is re-appliable.
#
# Usage: bash packages/db/scripts/kb-local-verify.sh     (needs docker)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="kb-verify-$$"
# The production image, not a generic pgvector one: migration 0076 needs pgroonga, and a harness
# that cannot run a migration cannot verify it. Matching prod also means an extension that exists
# here exists there -- the previous image would have passed a migration that fails on deploy.
IMAGE="supabase/postgres:15.8.1.085"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ starting $IMAGE as $CONTAINER"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" >/dev/null

# Over TCP, not the unix socket: this image puts its socket somewhere pg_isready's default does not
# look, so the old check reported "ready" while psql could not connect at all -- and the bootstrap
# then failed against a server the harness believed was up.
for _ in $(seq 1 120); do
  if docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null   || { echo "✗ postgres never became reachable in the container"; exit 1; }

psql_run() { docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

echo "▶ bootstrapping the dependencies 0051 assumes"
psql_run <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS vector;
-- Minimal stand-in for 0001_core.sql's organizations: 0051 only needs the primary key to reference,
-- and service_role only has to exist for the RLS policies to be creatable.
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
-- Reproduce the Supabase setting that migration 0064 documents: every NEW function in public gets
-- EXECUTE for anon and authenticated automatically, and REVOKE … FROM PUBLIC does not remove it.
-- Without this line the grant assertions in kb-local-verify.sql would pass no matter what.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
SQL

echo "▶ applying 0051 (customer-service core)"
psql_file "$DB_DIR/migrations/0051_cs_core.sql" >/dev/null

echo "▶ applying 0072 (KB versioning + six retrieval predicates)"
psql_file "$DB_DIR/migrations/0072_kb_versioning_and_retrieval_predicates.sql" >/dev/null

echo "▶ applying 0075 (provenance + citation on retrieval)"
psql_file "$DB_DIR/migrations/0075_kb_provenance_and_citation.sql" >/dev/null

echo "▶ applying 0076 (ranked keyword retrieval via pgroonga)"
psql_file "$DB_DIR/migrations/0076_kb_ranked_keyword_retrieval.sql" >/dev/null

echo "▶ proving the harness can fail (a green run of a dead harness proves nothing)"
# Captured first, then matched: under `set -o pipefail` psql's non-zero exit (which is the point of
# this check) would make the whole pipeline non-zero even when grep found the message.
SELF_TEST="$(psql_run -q -c "SET plpgsql.check_asserts = on; DO \$\$ BEGIN ASSERT false, 'harness self-test'; END \$\$;" 2>&1 || true)"
case "$SELF_TEST" in
  *"harness self-test"*) echo "  self-test raised as expected" ;;
  *) echo "✗ ASSERT does not raise here — every assertion below would be a no-op"; exit 1 ;;
esac

echo "▶ running behavioural assertions"
VERIFY_OUT="$(psql_file "$HERE/kb-local-verify.sql" 2>&1)" || { echo "$VERIFY_OUT" | grep -E 'ERROR' ; echo "✗ assertions failed"; exit 1; }
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ retrieval assertions did not report KB_VERIFY_OK"; exit 1; }
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_CONSTRAINTS_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ constraint assertions did not report KB_VERIFY_CONSTRAINTS_OK"; exit 1; }
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_KEYWORD_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ behavioural assertions did not reach the last marker"; exit 1; }
echo "  KB_VERIFY_OK + KB_VERIFY_CONSTRAINTS_OK + KB_VERIFY_PROVENANCE_OK + KB_VERIFY_KEYWORD_OK"

echo "▶ applying the down migrations (newest first)"
psql_file "$DB_DIR/scripts/0076_kb_ranked_keyword_retrieval_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0075_kb_provenance_and_citation_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0072_kb_versioning_and_retrieval_predicates_down.sql" >/dev/null
DOWN_STATE="$(psql_run -tAc "
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='cs_knowledge_sources' AND column_name='canonical_url')
      THEN 'down_left_columns_behind'
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='cs_match_chunks'
                       AND replace(oidvectortypes(p.proargtypes),' ','')='uuid,vector,integer')
      THEN 'down_did_not_restore_0051_rpc'
    WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='cs_match_chunks_keyword')
      THEN 'down_left_keyword_rpc_behind'
    ELSE 'DOWN_OK'
  END")"
[ "$DOWN_STATE" = "DOWN_OK" ] || { echo "✗ down migration did not restore the 0051 state: $DOWN_STATE"; exit 1; }
echo "  DOWN_OK"

echo "▶ re-applying 0072 + 0075 + 0076 (a migration you cannot re-apply is not a rollback path)"
psql_file "$DB_DIR/migrations/0072_kb_versioning_and_retrieval_predicates.sql" >/dev/null
psql_file "$DB_DIR/migrations/0075_kb_provenance_and_citation.sql" >/dev/null
psql_file "$DB_DIR/migrations/0076_kb_ranked_keyword_retrieval.sql" >/dev/null
REAPPLY_OUT="$(psql_file "$HERE/kb-local-verify.sql" 2>&1 || true)"
echo "$REAPPLY_OUT" | grep -q 'KB_VERIFY_KEYWORD_OK' || {
  echo "$REAPPLY_OUT" | grep -E 'ERROR' | head -3; echo "✗ assertions failed after re-apply"; exit 1;
}

echo "✅ KB K1 verified: retrieval predicates, versioning visibility, down migration, re-apply"
