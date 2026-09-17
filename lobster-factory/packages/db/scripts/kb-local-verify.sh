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
-- and service_role only has to exist for the RLS policies to be creatable. `metadata` was added for
-- 0086 (cs_match_chunks_keyword reads organizations.metadata.client_config.kbKeywordModeDefault) --
-- real production 0001_core.sql already has it (`metadata jsonb not null default '{}'::jsonb`); a
-- run against this stub without it errors with "column o.metadata does not exist" (caught live,
-- 2026-09-17, running this harness for the first time after adding 0086 -- the migration itself was
-- correct against the real schema; only this minimal stub was missing the column).
CREATE TABLE IF NOT EXISTS public.organizations (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug     text UNIQUE NOT NULL,
  name     text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
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

echo "▶ applying 0083 (is_sensitive gets a real audience gate)"
psql_file "$DB_DIR/migrations/0083_kb_sensitive_audience_gate.sql" >/dev/null

echo "▶ applying 0084 (source body text, for the content-viewer)"
psql_file "$DB_DIR/migrations/0084_kb_source_body.sql" >/dev/null

echo "▶ applying 0085 (nested KB folders)"
psql_file "$DB_DIR/migrations/0085_kb_folders.sql" >/dev/null

echo "▶ applying 0086 (precise vs fuzzy keyword matching, per document)"
psql_file "$DB_DIR/migrations/0086_kb_keyword_mode.sql" >/dev/null

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
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_SENSITIVE_GATE_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ 0083 sensitive-audience-gate assertions did not report OK"; exit 1; }
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_FOLDERS_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ 0085 folder assertions did not report OK"; exit 1; }
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_FOLDER_MOVE_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ 0085 cs_folder_move assertions did not report OK"; exit 1; }
echo "$VERIFY_OUT" | grep -q 'KB_VERIFY_KEYWORD_MODE_OK' || { echo "$VERIFY_OUT" | tail -5; echo "✗ 0086 keyword-mode assertions did not report OK"; exit 1; }
echo "  KB_VERIFY_OK + KB_VERIFY_CONSTRAINTS_OK + KB_VERIFY_PROVENANCE_OK + KB_VERIFY_KEYWORD_OK + KB_VERIFY_SENSITIVE_GATE_OK + KB_VERIFY_FOLDERS_OK + KB_VERIFY_FOLDER_MOVE_OK + KB_VERIFY_KEYWORD_MODE_OK"

echo "▶ applying the down migrations (newest first — each replaced the previous one's function signature)"
psql_file "$DB_DIR/scripts/0086_kb_keyword_mode_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0085_kb_folders_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0084_kb_source_body_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0083_kb_sensitive_audience_gate_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0076_kb_ranked_keyword_retrieval_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0075_kb_provenance_and_citation_down.sql" >/dev/null
psql_file "$DB_DIR/scripts/0072_kb_versioning_and_retrieval_predicates_down.sql" >/dev/null
DOWN_STATE="$(psql_run -tAc "
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='cs_knowledge_sources' AND column_name='canonical_url')
      THEN 'down_left_columns_behind'
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='cs_knowledge_sources' AND column_name IN ('body','folder_id','keyword_mode'))
      THEN 'down_left_0084_0085_0086_columns_behind'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cs_knowledge_folders')
      THEN 'down_left_folders_table_behind'
    WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='cs_folder_descendants')
      THEN 'down_left_folder_descendants_rpc_behind'
    WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='cs_folder_move')
      THEN 'down_left_folder_move_rpc_behind'
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

echo "▶ re-applying 0072 + 0075 + 0076 + 0083 + 0084 + 0085 + 0086 (a migration you cannot re-apply is not a rollback path)"
psql_file "$DB_DIR/migrations/0072_kb_versioning_and_retrieval_predicates.sql" >/dev/null
psql_file "$DB_DIR/migrations/0075_kb_provenance_and_citation.sql" >/dev/null
psql_file "$DB_DIR/migrations/0076_kb_ranked_keyword_retrieval.sql" >/dev/null
psql_file "$DB_DIR/migrations/0083_kb_sensitive_audience_gate.sql" >/dev/null
psql_file "$DB_DIR/migrations/0084_kb_source_body.sql" >/dev/null
psql_file "$DB_DIR/migrations/0085_kb_folders.sql" >/dev/null
psql_file "$DB_DIR/migrations/0086_kb_keyword_mode.sql" >/dev/null
REAPPLY_OUT="$(psql_file "$HERE/kb-local-verify.sql" 2>&1 || true)"
echo "$REAPPLY_OUT" | grep -q 'KB_VERIFY_KEYWORD_MODE_OK' || {
  echo "$REAPPLY_OUT" | grep -E 'ERROR' | head -3; echo "✗ assertions failed after re-apply"; exit 1;
}

echo "✅ KB K1 verified: retrieval predicates, versioning visibility, down migration, re-apply"
