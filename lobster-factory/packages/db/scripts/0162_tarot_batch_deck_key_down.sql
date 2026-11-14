-- Back to 0119's job shape; the code from 0162 must be reverted first (createJob writes deck_key).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0162_tarot_batch_deck_key.sql';
  end if;
end $$;
drop index if exists public.tarot_batch_jobs_deck_key_idx;
alter table public.tarot_batch_jobs drop column if exists deck_key;
commit;
