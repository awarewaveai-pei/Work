-- Back to 0115's job shape; the code from 0119 must be reverted first (createJob writes actor).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0119_tarot_batch_actor.sql';
  end if;
end $$;
alter table public.tarot_batch_jobs drop column if exists actor;
commit;
