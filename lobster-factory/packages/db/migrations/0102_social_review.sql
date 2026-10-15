-- 0102 — per-brand review setting (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C8; tables 0096).
-- require_review = a brand's posts go out only after an owner (or reviewer) approved them: an editor submits instead of
-- scheduling or publishing now, and an approved post's content is not edited by an editor without unscheduling it
-- first (lib/social/state.ts transition, lib/social/review.ts). Off by default = the behaviour before 0102.
-- A brand without a row is "off"; the row exists once someone changed the setting.
--
-- APPLY WITH (Medium, additive; ship with C8): node scripts/apply-db-migration.mjs 0102
-- DOWN: packages/db/scripts/0102_social_review_down.sql

begin;
set local lock_timeout = '5s';

create table if not exists public.social_brand_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  require_review  boolean not null default false,
  updated_by      text not null check (length(updated_by) <= 320),
  updated_at      timestamptz not null default now()
);

-- the setting and its log row in one transaction (review 2026-10-15: two writes could leave a change without its row)
create or replace function public.social_set_review(p_org uuid, p_on boolean, p_actor text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.social_brand_settings (organization_id, require_review, updated_by, updated_at)
  values (p_org, p_on, p_actor, now())
  on conflict (organization_id) do update set require_review = excluded.require_review, updated_by = excluded.updated_by, updated_at = now();
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'review_setting', jsonb_build_object('require_review', p_on));
  return p_on;
end $$;
revoke all on function public.social_set_review(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.social_set_review(uuid, boolean, text) to service_role;

alter table public.social_brand_settings enable row level security;
drop policy if exists "service_role only" on public.social_brand_settings;
create policy "service_role only" on public.social_brand_settings to service_role using (true) with check (true);
revoke all on public.social_brand_settings from public, anon, authenticated;
grant all on public.social_brand_settings to service_role;

notify pgrst, 'reload schema';

commit;
