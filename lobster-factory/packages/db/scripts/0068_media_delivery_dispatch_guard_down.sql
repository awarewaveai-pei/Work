-- Roll back only after no delivery is dispatching; otherwise first reconcile it.
begin;
set lock_timeout = '3s';
do $$ begin
  if exists (select 1 from public.media_delivery_attempts where status = 'dispatching') then
    raise exception 'cannot roll back 0068 while delivery is dispatching';
  end if;
end $$;
drop function if exists public.media_delivery_claim(text);
alter table public.media_delivery_attempts drop constraint if exists media_delivery_attempts_status_check;
alter table public.media_delivery_attempts
  add constraint media_delivery_attempts_status_check
  check (status in ('queued', 'drafted', 'scheduled', 'published', 'failed', 'withdrawn')) not valid;
alter table public.media_delivery_attempts drop column if exists dispatch_claimed_at;
alter table public.media_delivery_attempts drop column if exists dispatch_token;
reset lock_timeout;
notify pgrst, 'reload schema';
commit;
