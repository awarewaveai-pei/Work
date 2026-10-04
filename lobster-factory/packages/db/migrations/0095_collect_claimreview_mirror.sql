-- 0095 — collect lookups v1: the ClaimReview fact-check mirror (Projects/internal/cognitive-engineering-os/specs/wire/
-- lookup.v1.json, R4/R5). The cognitive platform fetches nothing itself (operator 2026-09-17); its fact-check lookup is
-- asked of collect, which answers from this public dataset (Data Commons ClaimReview feed, CC BY 4.0), refreshed once a
-- day by the hourly collection heartbeat (lib/collect/lookups/claimreview.ts). Nothing from any case is stored here.
--
-- MATCHING (ported from the engine's claimreview.py): the index only proposes candidates; next-admin keeps a review
-- when >= 0.6 of the REVIEWED CLAIM's 3-character pieces are in the looked-up text. The candidate index is full text
-- over exactly those pieces (array_to_tsvector, no parser), not pg_trgm: pg_trgm's index answers "is the query inside
-- the column" (the column here is the short claim that must be inside the long query), and its trigrams drop
-- punctuation and pad words, so they are not the pieces the match counts. ts_rank(..., 2) (divided by the claim's
-- piece count) orders candidates the way the share does. next-admin leaves the 1,669 pieces found in >= 1% of claims
-- out of the query (claimreview.ts COMMON_PIECES). Measured on the real 99,391-review feed (Postgres 16, the
-- local-verify script): an English 300-character text matched 67,394 rows / 13,104 heap blocks / 1.87 s without the
-- cut, 14,471 rows / 8,374 blocks / 0.26 s with it; a Chinese text 3 rows / 0.5 ms either way.
--
-- SIZE (same run): one generation is 181 MB (table 127 MB + GIN 51 MB); 350 MB on disk after two refreshes (the old
-- generation's pages are reused, vacuum_truncate is off); one daily refresh writes ~1.2 GB of WAL (no
-- wal_compression); inserting 99k rows in 500-row statements ~26 s, finish 0.07 s, prune 0.6 s in 20 calls.
--
-- GENERATIONS: a refresh inserts a new generation beside the current one. finish_refresh only counts and moves the
-- pointer (refusing an incomplete generation); prune deletes at most p_batch rows of any other generation per call,
-- never the current one, and next-admin calls it until it returns 0 -- after finish and before each refresh's first
-- insert, so rows left by a failed refresh or a restart mid-download are removed too. Every statement stays short
-- (Supabase's authenticator statement_timeout is 8 s; the database has 1 CPU and 768 MB).
--
-- Additive only: two new tables, six new functions, nothing existing touched. Deploy order: this migration, then
-- the next-admin code (old code never calls it; new code without it answers 無法檢查 and logs the refresh failure).
-- Go-live check after the first hourly heartbeat: select current_generation, reviews, built_at, last_attempt_at,
-- last_error from public.collect_claimreview_mirror; -- built_at set and last_error null, or last_error says why.
-- Local proof: bash packages/db/scripts/0095_collect_claimreview_mirror-local-verify.sh
--
-- APPLY WITH (Medium risk, additive; needs go-ahead): node scripts/apply-db-migration.mjs 0095
-- Down migration: packages/db/scripts/0095_collect_claimreview_mirror_down.sql

begin;
set local lock_timeout = '5s';

-- The distinct 3-character runs of an already normalised claim (code points, = claimreview.ts pieces()).
create or replace function public.collect_claimreview_pieces(p_norm text)
returns tsvector
language sql
immutable strict parallel safe
set search_path = public, pg_temp
as $$
  select array_to_tsvector(coalesce(array_agg(distinct cut.piece), '{}'::text[]))
  from (select substr(p_norm, i, 3) as piece from generate_series(1, char_length(p_norm) - 2) as i) as cut
  where btrim(cut.piece) <> ''
$$;

create table if not exists public.collect_claimreview_mirror (
  id                 smallint primary key default 1 check (id = 1),
  current_generation bigint,
  reviews            integer not null default 0,
  publishers         integer not null default 0,
  feed_modified      text not null default '',
  built_at           timestamptz,
  last_attempt_at    timestamptz,
  last_error         text
);
insert into public.collect_claimreview_mirror (id) values (1) on conflict (id) do nothing;

-- vacuum_truncate off: a daily delete of a whole generation must not make autovacuum take ACCESS EXCLUSIVE to cut the
-- table's tail (it would stall the lookups reading it); the freed pages are reused by the next generation.
create table if not exists public.collect_claimreview_reviews (
  id            bigserial primary key,
  generation    bigint not null,
  norm          text not null,
  claim         text not null,
  url           text not null,
  publisher     text not null default '',
  publisher_url text not null default '',
  judged_as     text not null default '',
  date          text not null default '',
  claimant      text not null default '',
  license       text not null default '',
  pieces        tsvector generated always as (public.collect_claimreview_pieces(norm)) stored
) with (vacuum_truncate = false);
create index if not exists collect_claimreview_reviews_pieces on public.collect_claimreview_reviews using gin (pieces);
create index if not exists collect_claimreview_reviews_generation on public.collect_claimreview_reviews (generation);

alter table public.collect_claimreview_mirror enable row level security;
alter table public.collect_claimreview_reviews enable row level security;
drop policy if exists "service_role only" on public.collect_claimreview_mirror;
create policy "service_role only" on public.collect_claimreview_mirror to service_role using (true) with check (true);
drop policy if exists "service_role only" on public.collect_claimreview_reviews;
create policy "service_role only" on public.collect_claimreview_reviews to service_role using (true) with check (true);
revoke all on public.collect_claimreview_mirror, public.collect_claimreview_reviews from public, anon, authenticated;
grant all on public.collect_claimreview_mirror, public.collect_claimreview_reviews to service_role;
revoke all on sequence public.collect_claimreview_reviews_id_seq from public, anon, authenticated;
grant usage, select on sequence public.collect_claimreview_reviews_id_seq to service_role;

-- Up to p_limit candidates of the current generation sharing a piece with p_pieces, best covered first. Each piece
-- is quoted as a tsquery lexeme (backslash and quote escaped), so no piece is ever parsed as an operator.
create or replace function public.collect_claimreview_candidates(p_pieces text[], p_limit integer)
returns table (norm text, claim text, url text, publisher text, publisher_url text, judged_as text, date text, claimant text, license text)
language sql
stable
set search_path = public, pg_temp
as $$
  with wanted as (
    select (
      select string_agg('''' || replace(replace(u.piece, '\', '\\'), '''', '''''') || '''', ' | ')
      from unnest(p_pieces) as u(piece)
    )::tsquery as q
  )
  select r.norm, r.claim, r.url, r.publisher, r.publisher_url, r.judged_as, r.date, r.claimant, r.license
  from public.collect_claimreview_reviews as r
  join public.collect_claimreview_mirror as m on m.id = 1 and r.generation = m.current_generation
  cross join wanted
  where r.pieces @@ wanted.q
  order by ts_rank(r.pieces, wanted.q, 2) desc, r.id
  limit least(greatest(coalesce(p_limit, 1), 1), 1000)
$$;

-- True for exactly one caller when a refresh is due: the last success is p_success_hours old (or none) and the last
-- attempt p_retry_hours old (a failed refresh is retried an hour later, not a day later). The row lock serialises
-- two heartbeats arriving together.
create or replace function public.collect_claimreview_begin_refresh(p_success_hours integer, p_retry_hours integer)
returns boolean
language sql
volatile
set search_path = public, pg_temp
as $$
  with claimed as (
    update public.collect_claimreview_mirror
    set last_attempt_at = now()
    where id = 1
      and (built_at is null or built_at < now() - make_interval(hours => p_success_hours))
      and (last_attempt_at is null or last_attempt_at < now() - make_interval(hours => p_retry_hours))
    returning 1
  )
  select exists (select 1 from claimed)
$$;

-- Count and pointer only: the old generation is removed by prune, in short statements.
create or replace function public.collect_claimreview_finish_refresh(p_generation bigint, p_reviews integer, p_publishers integer, p_feed_modified text)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.collect_claimreview_reviews where generation = p_generation;
  if p_reviews is null or p_reviews < 1 or v_rows <> p_reviews then
    raise exception 'collect_claimreview_finish_refresh: generation % holds % rows, the download counted % -- the current mirror stays', p_generation, v_rows, p_reviews;
  end if;
  update public.collect_claimreview_mirror
  set current_generation = p_generation, reviews = p_reviews, publishers = coalesce(p_publishers, 0),
      feed_modified = left(coalesce(p_feed_modified, ''), 40), built_at = now(), last_error = null
  where id = 1;
end $$;

-- Records why a refresh failed; deletes nothing (prune removes what it wrote), so it cannot time out on 100k rows.
create or replace function public.collect_claimreview_fail_refresh(p_error text)
returns void
language sql
volatile
set search_path = public, pg_temp
as $$
  update public.collect_claimreview_mirror set last_error = left(coalesce(p_error, ''), 500) where id = 1
$$;

-- At most p_batch rows of any generation but the current one; how many it deleted (0 = nothing left to prune).
create or replace function public.collect_claimreview_prune(p_batch integer)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_current bigint;
  v_deleted integer;
begin
  select current_generation into v_current from public.collect_claimreview_mirror where id = 1;
  -- `<` / `>` rather than `<>`: two ranges of the generation index, so the last batches do not scan the whole table.
  delete from public.collect_claimreview_reviews
  where id in (
    select r.id from public.collect_claimreview_reviews as r
    where v_current is null or r.generation < v_current or r.generation > v_current
    limit least(greatest(coalesce(p_batch, 1), 1), 20000)
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.collect_claimreview_pieces(text) from public, anon, authenticated;
revoke all on function public.collect_claimreview_candidates(text[], integer) from public, anon, authenticated;
revoke all on function public.collect_claimreview_begin_refresh(integer, integer) from public, anon, authenticated;
revoke all on function public.collect_claimreview_finish_refresh(bigint, integer, integer, text) from public, anon, authenticated;
revoke all on function public.collect_claimreview_fail_refresh(text) from public, anon, authenticated;
revoke all on function public.collect_claimreview_prune(integer) from public, anon, authenticated;
grant execute on function public.collect_claimreview_pieces(text) to service_role;
grant execute on function public.collect_claimreview_candidates(text[], integer) to service_role;
grant execute on function public.collect_claimreview_begin_refresh(integer, integer) to service_role;
grant execute on function public.collect_claimreview_finish_refresh(bigint, integer, integer, text) to service_role;
grant execute on function public.collect_claimreview_fail_refresh(text) to service_role;
grant execute on function public.collect_claimreview_prune(integer) to service_role;

-- Every call is PostgREST (supabase-js); without this the schema cache misses the new tables and functions.
notify pgrst, 'reload schema';

commit;
