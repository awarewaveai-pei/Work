-- 0112 — keep the media chosen with a reusable post copy (C31).
-- This is intentionally a relation table instead of a uuid[] column: media remains brand-scoped,
-- ordered, and protected by the same composite foreign-key rule as social_post_media.
-- APPLY WITH: node scripts/apply-db-migration.mjs 0112

begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.social_saved_texts'::regclass
      and conname = 'social_saved_texts_id_org_key'
  ) then
    alter table public.social_saved_texts
      add constraint social_saved_texts_id_org_key unique (id, organization_id);
  end if;
end $$;

create table if not exists public.social_saved_text_media (
  saved_text_id  uuid not null,
  media_id       uuid not null,
  organization_id uuid not null,
  position       smallint not null default 0 check (position >= 0),
  primary key (saved_text_id, media_id),
  foreign key (saved_text_id, organization_id)
    references public.social_saved_texts (id, organization_id) on delete cascade,
  foreign key (media_id, organization_id)
    references public.social_media (id, organization_id)
    on delete no action deferrable initially deferred
);
create index if not exists social_saved_text_media_media_idx on public.social_saved_text_media (media_id);
-- RLS: on, service_role only, like every other social table (0096 pattern)
alter table public.social_saved_text_media enable row level security;
drop policy if exists "service_role only" on public.social_saved_text_media;
create policy "service_role only" on public.social_saved_text_media to service_role using (true) with check (true);

create or replace function public.social_save_text(p_org uuid, p_body text, p_media_ids uuid[] default '{}')
returns table(id uuid, body text, media_ids uuid[])
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 10000 then
    raise exception 'body must be 1..10000 characters';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_media_ids, '{}')) as wanted(media_id)
    left join public.social_media m on m.id = wanted.media_id and m.organization_id = p_org
    where m.id is null
  ) then
    raise exception 'media does not belong to this organization';
  end if;
  if exists (
    select wanted.media_id
    from unnest(coalesce(p_media_ids, '{}')) as wanted(media_id)
    group by wanted.media_id
    having count(*) > 1
  ) then
    raise exception 'media ids must be unique';
  end if;
  insert into public.social_saved_texts (organization_id, body)
  values (p_org, btrim(p_body))
  returning social_saved_texts.id into v_id;
  insert into public.social_saved_text_media (saved_text_id, media_id, organization_id, position)
  select v_id, x.media_id, p_org, (x.position - 1)::smallint
  from unnest(coalesce(p_media_ids, '{}')) with ordinality as x(media_id, position);
  return query select v_id, btrim(p_body), coalesce(p_media_ids, '{}');
end $$;

create or replace function public.social_list_saved_texts(p_org uuid)
returns table(id uuid, body text, media_ids uuid[])
language sql
stable
set search_path = public, pg_temp
as $$
  select t.id, t.body,
    coalesce(array_agg(m.media_id order by m.position) filter (where m.media_id is not null), '{}')
  from public.social_saved_texts t
  left join public.social_saved_text_media m
    on m.saved_text_id = t.id and m.organization_id = t.organization_id
  where t.organization_id = p_org
  group by t.id, t.body, t.created_at
  order by t.created_at
  limit 200
$$;

revoke all on public.social_saved_text_media from public, anon, authenticated;
grant all on public.social_saved_text_media to service_role;
revoke all on function public.social_save_text(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.social_save_text(uuid, text, uuid[]) to service_role;
revoke all on function public.social_list_saved_texts(uuid) from public, anon, authenticated;
grant execute on function public.social_list_saved_texts(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
