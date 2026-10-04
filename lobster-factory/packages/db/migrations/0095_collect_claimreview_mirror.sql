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
-- piece count) orders candidates the way the share does.
--
-- GENERATIONS: a refresh inserts a new generation beside the current one; collect_claimreview_finish_refresh switches
-- only when the new generation holds exactly the rows the download counted, then drops the others, in one
-- transaction. A failed refresh deletes only its own rows (never the current generation): the old mirror answers on.
--
-- Additive only: two new tables, five new functions, nothing existing touched. Deploy order: this migration, then
-- the next-admin code (old code never calls it; new code without it answers 無法檢查 and logs the refresh failure).
-- APPLY (Medium risk, additive; needs go-ahead): node scripts/apply-db-migration.mjs 0095
-- Down migration: packages/db/scripts/0095_collect_claimreview_mirror_down.sql

begin;
set local lock_timeout = '5s';

-- The distinct 3-character runs of an already normalised claim (code points, = claimreview.ts pieces()).
create or replace function public.collect_claimreview_pieces(p_norm text)
returns tsvector
language sql
immutable strict parallel safe
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
  pieces        tsvector generated always as (public.collect_claimreview_pieces(norm)) stored
);
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
grant usage, select on sequence public.collect_claimreview_reviews_id_seq to service_role;

-- Up to p_limit candidates of the current generation sharing a piece with p_pieces, best covered first. Each piece
-- is quoted as a tsquery lexeme (backslash and quote escaped), so no piece is ever parsed as an operator.
create or replace function public.collect_claimreview_candidates(p_pieces text[], p_limit integer)
returns table (norm text, claim text, url text, publisher text, publisher_url text, judged_as text, date text, claimant text)
language sql
stable
as $$
  with wanted as (
    select (
      select string_agg('''' || replace(replace(u.piece, '\', '\\'), '''', '''''') || '''', ' | ')
      from unnest(p_pieces) as u(piece)
    )::tsquery as q
  )
  select r.norm, r.claim, r.url, r.publisher, r.publisher_url, r.judged_as, r.date, r.claimant
  from public.collect_claimreview_reviews as r
  join public.collect_claimreview_mirror as m on m.id = 1 and r.generation = m.current_generation
  cross join wanted
  where r.pieces @@ wanted.q
  order by ts_rank(r.pieces, wanted.q, 2) desc, r.id
  limit least(greatest(coalesce(p_limit, 1), 1), 1000)
$$;

-- True for exactly one caller per p_min_hours: the row lock serialises two heartbeats arriving together.
create or replace function public.collect_claimreview_begin_refresh(p_min_hours integer)
returns boolean
language sql
volatile
as $$
  with claimed as (
    update public.collect_claimreview_mirror
    set last_attempt_at = now()
    where id = 1 and (last_attempt_at is null or last_attempt_at < now() - make_interval(hours => p_min_hours))
    returning 1
  )
  select exists (select 1 from claimed)
$$;

create or replace function public.collect_claimreview_finish_refresh(p_generation bigint, p_reviews integer, p_publishers integer, p_feed_modified text)
returns void
language plpgsql
volatile
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
  delete from public.collect_claimreview_reviews where generation <> p_generation;
end $$;

create or replace function public.collect_claimreview_fail_refresh(p_generation bigint, p_error text)
returns void
language plpgsql
volatile
as $$
begin
  delete from public.collect_claimreview_reviews as r
  using public.collect_claimreview_mirror as m
  where m.id = 1 and r.generation = p_generation and r.generation is distinct from m.current_generation;
  update public.collect_claimreview_mirror set last_error = left(coalesce(p_error, ''), 500) where id = 1;
end $$;

revoke all on function public.collect_claimreview_pieces(text) from public, anon, authenticated;
revoke all on function public.collect_claimreview_candidates(text[], integer) from public, anon, authenticated;
revoke all on function public.collect_claimreview_begin_refresh(integer) from public, anon, authenticated;
revoke all on function public.collect_claimreview_finish_refresh(bigint, integer, integer, text) from public, anon, authenticated;
revoke all on function public.collect_claimreview_fail_refresh(bigint, text) from public, anon, authenticated;
grant execute on function public.collect_claimreview_pieces(text) to service_role;
grant execute on function public.collect_claimreview_candidates(text[], integer) to service_role;
grant execute on function public.collect_claimreview_begin_refresh(integer) to service_role;
grant execute on function public.collect_claimreview_finish_refresh(bigint, integer, integer, text) to service_role;
grant execute on function public.collect_claimreview_fail_refresh(bigint, text) to service_role;

-- Every call is PostgREST (supabase-js); without this the schema cache misses the new tables and functions.
notify pgrst, 'reload schema';

commit;
