-- ONE paste into Supabase Dashboard → SQL Editor → Run (same project as Performance Advisor).
-- Self-hosted: functions may be owned by supabase_admin — if role `postgres` fails with
-- "must be owner", use `-U supabase_admin` / DSN user supabase_admin (see SUPABASE_SELF_HOSTED_RUNBOOK §3.4).
-- Fixes Splinter 0003 (auth RLS initplan) + 0009 (duplicate indexes on workflow_runs).
--
-- Contents: 0018 (functions + interim policies + search_path) then 0020 (Splinter-aligned
-- index dedupe + drop ALL policies on four tables + recreate with current_user_id only).
-- Skips 0019 (0020 policy section supersedes it).
--
-- After Run: Database → Performance Advisor → refresh. Expect 0 rows from
--   scripts/diag-splinter-auth-rls-initplan.sql


-- ========== 0018_rls_initplan_and_workflow_runs_index_dedupe.sql ==========

create or replace function current_clerk_org_id_from_jwt()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(j ->> 'org_id'), ''),
    nullif(trim(j ->> 'clerk_org_id'), ''),
    nullif(trim(j -> 'app_metadata' ->> 'org_id'), '')
    -- no user_metadata: the signed-in user can rewrite it (0136)
  )
  from (select auth.jwt() as j) s;
$$;

create or replace function user_has_org_membership(org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from organization_memberships om
    where om.organization_id = org_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  );
$$;

create or replace function user_has_org_access(org_id uuid)
returns boolean
language sql
stable
as $$
  select
    user_has_org_membership(org_id)
    or (
      current_clerk_org_id_from_jwt() is not null
      and exists (
        select 1
        from clerk_organization_mappings m
        where m.organization_id = org_id
          and m.status = 'active'
          and m.clerk_organization_id = current_clerk_org_id_from_jwt()
      )
    );
$$;

create or replace function current_user_id()
returns uuid
language sql
stable
as $$
  select (select auth.uid())::uuid
$$;

create or replace function user_has_workspace_access(ws_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workspace_memberships wm
    where wm.workspace_id = ws_id
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
  )
$$;

drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles
for select
using (id = (select auth.uid())::uuid);

-- profiles_insert_self / profiles_update_self are gone since 0135 (profiles is written only by the control plane);
-- recreating them here would reopen that hole.
drop policy if exists profiles_insert_self on profiles;
drop policy if exists profiles_update_self on profiles;
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;

drop policy if exists organization_memberships_select_self on organization_memberships;
create policy organization_memberships_select_self on organization_memberships
for select
using (user_id = (select auth.uid())::uuid);

drop policy if exists workspace_memberships_select_self on workspace_memberships;
create policy workspace_memberships_select_self on workspace_memberships
for select
using (user_id = (select auth.uid())::uuid);

drop policy if exists user_role_assignments_select_scoped on user_role_assignments;
create policy user_role_assignments_select_scoped on user_role_assignments
for select
using (
  user_id = (select auth.uid())::uuid
  or (
    organization_id is not null
    and user_has_org_access(organization_id)
  )
);

do $$
declare
  r record;
begin
  for r in
    with ix as (
      select
        c.relname as idx_name,
        pg_get_indexdef(i.indexrelid) as def,
        i.indexrelid
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'workflow_runs'
        and not i.indisprimary
    ),
    ranked as (
      select
        idx_name,
        row_number() over (
          partition by def
          order by
            case idx_name
              when 'idx_workflow_runs_org' then 0
              when 'idx_workflow_runs_site' then 1
              else 2
            end,
            idx_name
        ) as rn
      from ix
    )
    select idx_name from ranked where rn > 1
  loop
    execute format('drop index if exists public.%I', r.idx_name);
  end loop;
end
$$;

do $$
begin
  if to_regprocedure('public.current_user_id()') is not null then
    execute 'alter function public.current_user_id() set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.user_has_workspace_access(uuid)') is not null then
    execute 'alter function public.user_has_workspace_access(uuid) set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.current_clerk_org_id_from_jwt()') is not null then
    execute 'alter function public.current_clerk_org_id_from_jwt() set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.user_has_org_membership(uuid)') is not null then
    execute 'alter function public.user_has_org_membership(uuid) set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.user_has_org_access(uuid)') is not null then
    execute 'alter function public.user_has_org_access(uuid) set search_path = public, pg_temp';
  end if;
end
$$;


-- ========== 0020_splinter_duplicate_indexes_and_rls_stray_policies.sql ==========

do $$
declare
  r record;
begin
  for r in
    with defs as (
      select
        indexname,
        replace(indexdef, indexname, '') as def_norm
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'workflow_runs'
        and indexname is not null
    ),
    ranked as (
      select
        indexname,
        row_number() over (
          partition by def_norm
          order by
            case indexname
              when 'idx_workflow_runs_org' then 0
              when 'idx_workflow_runs_site' then 1
              else 2
            end,
            indexname
        ) as rn
      from defs
    )
    select indexname from ranked where rn > 1
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end
$$;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'organization_memberships',
        'workspace_memberships',
        'user_role_assignments'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      pol.policyname,
      pol.tablename
    );
  end loop;
end
$$;

create policy profiles_select_self on profiles
for select
using (id = current_user_id());
-- No profiles insert/update policy: 0135.

create policy organization_memberships_select_self on organization_memberships
for select
using (user_id = current_user_id());

create policy workspace_memberships_select_self on workspace_memberships
for select
using (user_id = current_user_id());

create policy user_role_assignments_select_scoped on user_role_assignments
for select
using (
  user_id = current_user_id()
  or (
    organization_id is not null
    and user_has_org_access(organization_id)
  )
);
