-- 0070: Immutable short-drama Story Bible revisions.
-- Additive. A revision pins characters, continuity and episode intent before Timeline production.
set lock_timeout = '3s';

create table if not exists public.media_story_bible_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  series_id text not null check (series_id ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  revision integer not null check (revision > 0),
  status text not null check (status in ('draft', 'approved', 'superseded')),
  document_json jsonb not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (organization_id, series_id, revision)
);

create index if not exists media_story_bible_revisions_list_idx
  on public.media_story_bible_revisions (organization_id, series_id, revision desc);

-- A Bible document is evidence. Approval state may change, but its content never may.
create or replace function public.prevent_story_bible_document_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'media_story_bible_revisions cannot be deleted';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.series_id is distinct from old.series_id
     or new.revision is distinct from old.revision
     or new.document_json is distinct from old.document_json
     or new.document_sha256 is distinct from old.document_sha256
     or new.created_at is distinct from old.created_at then
    raise exception 'media_story_bible_revisions documents are immutable';
  end if;
  if new.status is distinct from old.status
     and not ((old.status = 'draft' and new.status = 'approved')
              or (old.status = 'approved' and new.status = 'superseded')) then
    raise exception 'invalid Story Bible revision status transition';
  end if;
  return new;
end $$;

create trigger media_story_bible_revisions_immutable
before update or delete on public.media_story_bible_revisions
for each row execute function public.prevent_story_bible_document_mutation();

-- Approval is one transaction: a series never exposes two approved revisions,
-- and a failed approval cannot leave its previous approved revision superseded.
create or replace function public.approve_media_story_bible_revision(p_id uuid)
returns public.media_story_bible_revisions
language plpgsql security invoker set search_path = public as $$
declare target public.media_story_bible_revisions;
begin
  select * into target from public.media_story_bible_revisions where id = p_id for update;
  if not found then raise exception 'story bible revision not found'; end if;
  if target.status <> 'draft' then raise exception 'only draft Story Bible revisions can be approved'; end if;
  update public.media_story_bible_revisions
     set status = 'superseded'
   where organization_id = target.organization_id and series_id = target.series_id and status = 'approved';
  update public.media_story_bible_revisions
     set status = 'approved', approved_at = now()
   where id = target.id
   returning * into target;
  return target;
end $$;

alter table public.media_story_bible_revisions enable row level security;
revoke all on table public.media_story_bible_revisions from anon, authenticated;
grant all on table public.media_story_bible_revisions to service_role;
grant execute on function public.approve_media_story_bible_revision(uuid) to service_role;
comment on table public.media_story_bible_revisions is 'Immutable character and continuity source of truth for short-drama production.';

reset lock_timeout;
notify pgrst, 'reload schema';
