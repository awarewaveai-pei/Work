-- Assertions for migration 0095 (the ClaimReview mirror), run by 0095_collect_claimreview_mirror-local-verify.sh against
-- a throwaway Postgres. Every block raises on a wrong answer; the script prints ALL 0095 CHECKS PASSED at the end.
\set ON_ERROR_STOP 1
set role service_role;

do $$ begin
  if (select array_length(tsvector_to_array(public.collect_claimreview_pieces('疫苗含有晶片')), 1)) <> 4 then raise exception 'pieces: expected 4'; end if;
  if public.collect_claimreview_pieces('ab') <> ''::tsvector then raise exception 'pieces: a short text has none'; end if;
  if (select tsvector_to_array(public.collect_claimreview_pieces('a😀bc'))) <> array['a😀b', '😀bc'] then raise exception 'pieces: code points'; end if;
end $$;

-- no mirror yet: no candidates, even with rows present
insert into public.collect_claimreview_reviews (generation, norm, claim, url) values
  (10, '疫苗含有晶片', '疫苗含有晶片', 'https://fc.example/1'),
  (10, 'it''s a \ test of quoting', 'quote claim', 'https://fc.example/2'),
  (10, '疫苗含有毒素會致命', '疫苗含有毒素會致命', 'https://fc.example/3');
do $$ begin
  if (select count(*) from public.collect_claimreview_candidates(array['疫苗含'], 10)) <> 0 then raise exception 'no mirror: no candidates'; end if;
end $$;

-- an incomplete generation is refused; the mirror stays empty
do $$ begin
  begin
    perform public.collect_claimreview_finish_refresh(10, 4, 1, '2026-10-01');
    raise exception 'finish with a wrong count must raise';
  exception when raise_exception then
    if sqlerrm like 'finish with a wrong count%' then raise; end if;
  end;
  begin
    perform public.collect_claimreview_finish_refresh(99, 0, 0, '');
    raise exception 'finish with no rows must raise';
  exception when raise_exception then
    if sqlerrm like 'finish with no rows%' then raise; end if;
  end;
  if (select current_generation from public.collect_claimreview_mirror) is not null then raise exception 'switched on a bad finish'; end if;
end $$;

select public.collect_claimreview_finish_refresh(10, 3, 1, '2026-10-01');
do $$ begin
  if (select current_generation from public.collect_claimreview_mirror) <> 10 then raise exception 'finish did not switch'; end if;
  if (select count(*) from public.collect_claimreview_candidates(array['t''s', ' \ ', 'f q', '|&!'], 10)) <> 1 then raise exception 'quoted pieces matched other than one row'; end if;
  if (select url from public.collect_claimreview_candidates(array['疫苗含', '苗含有', '含有晶', '有晶片'], 10) limit 1) <> 'https://fc.example/1' then raise exception 'ranking'; end if;
  if (select count(*) from public.collect_claimreview_candidates('{}'::text[], 10)) <> 0 then raise exception 'empty pieces'; end if;
end $$;

-- a failed refresh only records why; prune removes what it wrote, a batch at a time, never the current generation
insert into public.collect_claimreview_reviews (generation, norm, claim, url)
select 11, 'x' || g, 'x' || g, 'https://fc.example/x' || g from generate_series(1, 7) as g;
insert into public.collect_claimreview_reviews (generation, norm, claim, url) values (9, '更舊的', '更舊的', 'https://fc.example/old');
select public.collect_claimreview_fail_refresh('feed truncated');
do $$
declare n integer; total integer := 0; calls integer := 0;
begin
  if (select last_error from public.collect_claimreview_mirror) <> 'feed truncated' then raise exception 'last_error'; end if;
  if (select count(*) from public.collect_claimreview_reviews where generation = 11) <> 7 then raise exception 'fail deleted rows'; end if;
  loop
    n := public.collect_claimreview_prune(3);
    exit when n = 0;
    if n > 3 then raise exception 'prune deleted more than its batch'; end if;
    total := total + n; calls := calls + 1;
  end loop;
  if total <> 8 or calls <> 3 then raise exception 'prune: expected 8 rows in 3 calls, got % in %', total, calls; end if;
  if (select count(*) from public.collect_claimreview_reviews where generation = 10) <> 3 then raise exception 'prune touched the current generation'; end if;
end $$;

-- the next good refresh switches; prune then removes the old generation
insert into public.collect_claimreview_reviews (generation, norm, claim, url) values (12, '新的一批', '新的一批', 'https://fc.example/5');
select public.collect_claimreview_finish_refresh(12, 1, 1, '2026-10-02');
do $$ begin
  if (select count(*) from public.collect_claimreview_reviews where generation = 10) <> 3 then raise exception 'finish deleted rows (prune does)'; end if;
  perform public.collect_claimreview_prune(5000);
  if (select array_agg(distinct generation) from public.collect_claimreview_reviews) <> array[12::bigint] then raise exception 'old generation left'; end if;
  if (select last_error from public.collect_claimreview_mirror) is not null then raise exception 'last_error not cleared by a success'; end if;
end $$;

-- due: once per success window; a failure is retried after the retry window, not the success window
update public.collect_claimreview_mirror set built_at = null, last_attempt_at = null;
do $$ begin
  if not public.collect_claimreview_begin_refresh(23, 1) then raise exception 'first begin must be true'; end if;
  if public.collect_claimreview_begin_refresh(23, 1) then raise exception 'second begin in the same hour must be false'; end if;
  update public.collect_claimreview_mirror set last_attempt_at = now() - interval '2 hours';   -- that attempt failed
  if not public.collect_claimreview_begin_refresh(23, 1) then raise exception 'a failed refresh must be retried after 1 h'; end if;
  update public.collect_claimreview_mirror set built_at = now() - interval '5 hours', last_attempt_at = now() - interval '5 hours';
  if public.collect_claimreview_begin_refresh(23, 1) then raise exception 'a success 5 h ago is not due'; end if;
end $$;

reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.collect_claimreview_reviews;
    raise exception 'anon read the mirror';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.collect_claimreview_candidates(array['新的一'], 5);
    raise exception 'anon ran the candidates function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform nextval('public.collect_claimreview_reviews_id_seq');
    raise exception 'anon used the sequence';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname like 'collect_claimreview%'
               and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%', false)) then
    raise exception 'a 0095 function without a fixed search_path';
  end if;
  if not exists (select 1 from pg_class where relname = 'collect_claimreview_reviews' and 'vacuum_truncate=false' = any(reloptions)) then
    raise exception 'vacuum_truncate is not off';
  end if;
end $$;
select 'ALL 0095 CHECKS PASSED' as result;
