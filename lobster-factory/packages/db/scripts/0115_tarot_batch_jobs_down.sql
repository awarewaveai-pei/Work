begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0115_tarot_batch_jobs.sql';
  end if;
end $$;
drop function if exists public.tarot_batch_finish_card(uuid, integer, text, text);
drop function if exists public.tarot_batch_claim_card(uuid, integer, text, integer);
drop table if exists public.tarot_batch_cards;
drop table if exists public.tarot_batch_jobs;
commit;
