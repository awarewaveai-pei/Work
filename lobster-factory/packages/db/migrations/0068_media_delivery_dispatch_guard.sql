-- 0068: Atomic external-delivery claim.  A receipt must be claimed before
-- Postiz or WordPress can be called; an interrupted claim is held for manual
-- reconciliation rather than automatically replayed and risking duplicate publication.
begin;
set lock_timeout = '3s';

alter table public.media_delivery_attempts
  add column if not exists dispatch_token uuid,
  add column if not exists dispatch_claimed_at timestamptz;

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.media_delivery_attempts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
      and pg_get_constraintdef(oid) like '%queued%'
  loop
    execute format('alter table public.media_delivery_attempts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.media_delivery_attempts
  add constraint media_delivery_attempts_status_check
  check (status in ('queued', 'dispatching', 'drafted', 'scheduled', 'published', 'failed', 'withdrawn')) not valid;

create or replace function public.media_delivery_claim(p_idempotency_key text)
returns table(
  id uuid, release_id uuid, destination text, status text, external_id text,
  idempotency_key text, attempt integer, dispatch_token uuid, claimed boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.media_delivery_attempts%rowtype;
begin
  select * into row
  from public.media_delivery_attempts
  where media_delivery_attempts.idempotency_key = p_idempotency_key
  for update;
  if not found then raise exception 'delivery receipt not found'; end if;

  -- Never reissue an uncertain external side effect.  A staff reconciliation
  -- path must inspect the provider before it changes a stuck dispatching row.
  if row.status = 'dispatching' then
    return query select row.id, row.release_id, row.destination, row.status, row.external_id,
      row.idempotency_key, row.attempt, row.dispatch_token, false;
    return;
  end if;
  if row.status not in ('queued', 'failed') then
    return query select row.id, row.release_id, row.destination, row.status, row.external_id,
      row.idempotency_key, row.attempt, row.dispatch_token, false;
    return;
  end if;

  update public.media_delivery_attempts
  set status = 'dispatching', dispatch_token = gen_random_uuid(),
      dispatch_claimed_at = now(), attempt = row.attempt + 1, updated_at = now()
  where media_delivery_attempts.id = row.id
  returning * into row;
  return query select row.id, row.release_id, row.destination, row.status, row.external_id,
    row.idempotency_key, row.attempt, row.dispatch_token, true;
end $$;

revoke all on function public.media_delivery_claim(text) from public, anon, authenticated;
grant execute on function public.media_delivery_claim(text) to service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
commit;
