#!/usr/bin/env bash
# Verify migration 0095 (the ClaimReview mirror for collect lookups) against a real Postgres in a throwaway container.
# Touches no production. Applies 0095, runs the assertions, the down migration, a re-apply, the assertions again.
#
# With a JSON-lines dump of real reviews (one {"norm","claim","url",...} per line, e.g. from
#   COLLECT_LOOKUPS_LIVE_FEED=1 COLLECT_LOOKUPS_LIVE_DUMP=<file> npx vitest run lib/collect/__tests__/collect-lookups-live.test.ts
# in apps/next-admin), it also runs two refreshes as next-admin does (500-row inserts, finish, 5000-row prunes), times
# each step, measures the WAL of the second (daily) refresh, prints the table and index sizes after both, and EXPLAIN (ANALYZE, BUFFERS) of the candidate query for an English and a Chinese
# text (the query pieces chosen as claimreview.ts queryPieces does, COMMON_PIECES left out when given as $2).
#
# Usage: bash packages/db/scripts/0095_collect_claimreview_mirror-local-verify.sh [rows.jsonl [common_pieces.txt]]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$HERE/.." && pwd)"
CONTAINER="claimreview-verify-$$"
IMAGE="postgres:16-alpine"
ROWS="${1:-}"
COMMON="${2:-}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ starting $IMAGE as $CONTAINER"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=postgres "$IMAGE" -c shared_buffers=128MB >/dev/null
# Over TCP (kb-local-verify.sh pattern): the image's first-boot server listens on the socket only, then
# restarts, so a socket check can pass before the real server is up.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
sleep 2
docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1 \
  || { echo "✗ postgres never became reachable in the container"; exit 1; }

psql_run() { docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@"; }
psql_file() { psql_run -f - < "$1"; }

psql_run <<'SQL' >/dev/null
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
-- Supabase's public schema grants anon/authenticated everything by default; without this the revokes in 0095 would
-- be untested (a plain Postgres grants them nothing).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

echo "▶ applying 0095 (twice: it is re-runnable)"
psql_file "$DB_DIR/migrations/0095_collect_claimreview_mirror.sql" >/dev/null 2>&1
psql_file "$DB_DIR/migrations/0095_collect_claimreview_mirror.sql" >/dev/null 2>&1
echo "▶ assertions"
psql_file "$HERE/0095_collect_claimreview_mirror-local-verify.sql" | grep "ALL 0095 CHECKS PASSED"
echo "▶ down, then nothing of 0095 is left"
psql_file "$HERE/0095_collect_claimreview_mirror_down.sql" >/dev/null 2>&1
LEFT="$(psql_run -tA -c "select count(*) from pg_proc where proname like 'collect_claimreview%'; select coalesce(to_regclass('public.collect_claimreview_reviews')::text, 'gone');" | tr '\n' ' ')"
[ "$LEFT" = "0 gone " ] || { echo "✗ down left: $LEFT"; exit 1; }
echo "▶ re-apply and assert again"
psql_file "$DB_DIR/migrations/0095_collect_claimreview_mirror.sql" >/dev/null 2>&1
psql_file "$HERE/0095_collect_claimreview_mirror-local-verify.sql" | grep "ALL 0095 CHECKS PASSED"

[ -n "$ROWS" ] || exit 0

echo "▶ loading $ROWS"
psql_run -c "create unlogged table staging (line text)"
# one JSON object per line; \x01 / \x02 never occur in JSON text, so COPY reads each line whole
tr -d '\r' < "$ROWS" | psql_run -c "copy staging (line) from stdin with (format csv, quote E'\\x01', delimiter E'\\x02')"
psql_run -c "alter table staging add column n bigserial" -c "create index on staging (n)" >/dev/null
TOTAL="$(psql_run -tA -c "select count(*) from staging")"
echo "  staged $TOTAL rows"

# One refresh as next-admin runs it: 500-row inserts (each its own statement, as supabase-js sends them), finish, then
# prune in 5000-row calls. Prints seconds per step; the WAL it wrote is measured around the second (daily) refresh.
refresh() {
  local gen="$1"
  psql_run -v gen="$gen" -v total="$TOTAL" <<'SQL'
select clock_timestamp() as t0 \gset
do $$
declare lo bigint := 1; hi bigint;
begin
  while lo <= current_setting('my.total')::bigint loop
    hi := lo + 499;
    insert into public.collect_claimreview_reviews (generation, norm, claim, url, publisher, publisher_url, judged_as, date, claimant, license)
    select current_setting('my.gen')::bigint, j->>'norm', j->>'claim', j->>'url', coalesce(j->>'publisher', ''), coalesce(j->>'publisher_url', ''),
           coalesce(j->>'judged_as', ''), coalesce(j->>'date', ''), coalesce(j->>'claimant', ''), coalesce(j->>'license', '')
    from (select line::jsonb as j from staging where n between lo and hi) as s;
    lo := hi + 1;
  end loop;
end $$;
select round(extract(epoch from clock_timestamp() - :'t0'::timestamptz)::numeric, 1) as insert_s \gset
select clock_timestamp() as t1 \gset
select public.collect_claimreview_finish_refresh(:gen, :total, 0, 'local');
select round(extract(epoch from clock_timestamp() - :'t1'::timestamptz)::numeric, 2) as finish_s \gset
select clock_timestamp() as t2 \gset
do $$ declare n integer; calls integer := 0; begin
  loop n := public.collect_claimreview_prune(5000); exit when n = 0; calls := calls + 1; end loop;
  perform set_config('my.calls', calls::text, false);
end $$;
select round(extract(epoch from clock_timestamp() - :'t2'::timestamptz)::numeric, 1) as prune_s, current_setting('my.calls') as prune_calls \gset
\echo '  generation' :gen ': insert' :insert_s 's, finish' :finish_s 's, prune' :prune_s 's in' :prune_calls 'calls'
SQL
}
# psql variables do not reach inside a DO block's $$...$$: it reads gen and total from session settings
psql_run -c "alter database postgres set my.total = '$TOTAL'" -c "alter database postgres set my.gen = '1'" >/dev/null
refresh 1
psql_run -c "alter database postgres set my.gen = '2'" >/dev/null
WAL0="$(psql_run -tA -c "select pg_current_wal_lsn()")"
refresh 2
WAL1="$(psql_run -tA -c "select pg_current_wal_lsn()")"
psql_run <<SQL
select pg_size_pretty(pg_wal_lsn_diff('$WAL1', '$WAL0')) as wal_one_daily_refresh;
SQL
psql_run <<'SQL'
vacuum analyze public.collect_claimreview_reviews;
select pg_size_pretty(pg_table_size('public.collect_claimreview_reviews')) as table_incl_toast,
       pg_size_pretty(pg_relation_size('public.collect_claimreview_reviews_pieces')) as gin_index,
       pg_size_pretty(pg_total_relation_size('public.collect_claimreview_reviews')) as total_after_two_refreshes;
SQL

if [ -n "$COMMON" ]; then
  psql_run -c "create table common_pieces (piece text primary key)"
  tr -d '\r' < "$COMMON" | psql_run -c "copy common_pieces (piece) from stdin with (format csv, quote E'\\x01', delimiter E'\\x02')"
else
  psql_run -c "create table common_pieces (piece text primary key)"
fi

explain_for() {
  local label="$1" text="$2"
  echo "▶ EXPLAIN (ANALYZE, BUFFERS): $label"
  # quoted heredoc + psql variable: no shell expansion inside the SQL (a heredoc would eat the backslashes)
  psql_run -v txt="$text" <<'SQL'
create temp table q as
  with p as (
    select piece, row_number() over (order by piece collate "C") - 1 as i, count(*) over () as total
    from unnest(tsvector_to_array(public.collect_claimreview_pieces(lower(regexp_replace(:'txt', '\s+', ' ', 'g'))))) as piece
    where piece not in (select piece from common_pieces)
  )
  select array_agg(piece order by i) filter (where i % greatest(1, total / 96) = 0) as pieces from p;
select coalesce(array_length((select pieces[1:96] from q), 1), 0) as query_pieces;
explain (analyze, buffers, costs off)
  select r.url
  from public.collect_claimreview_reviews as r
  join public.collect_claimreview_mirror as m on m.id = 1 and r.generation = m.current_generation
  cross join (select (select string_agg('''' || replace(replace(u.piece, '\', '\\'), '''', '''''') || '''', ' | ')
                      from unnest((select pieces[1:96] from q)) as u(piece))::tsquery as q) as wanted
  where r.pieces @@ wanted.q
  order by ts_rank(r.pieces, wanted.q, 2) desc, r.id
  limit 300;
SQL
}

explain_for "English, 300 characters" "Viral posts claim that the government will ban all cash withdrawals above two thousand dollars starting next week, and that banks have already been instructed to freeze the savings accounts of anyone who refuses to install the new digital wallet application on their phone."
explain_for "Chinese" "網傳政府下週起禁止領現超過兩萬元，銀行已經接到通知，不安裝新的數位錢包應用程式的人，存款帳戶會被凍結。"
