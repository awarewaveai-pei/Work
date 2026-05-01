-- Supabase Performance Advisor: "Auth RLS Initialization Plan"
-- Replace bare auth.uid() / auth.jwt() in policy expressions and helper bodies with
-- subquery form so Postgres evaluates them once per statement (initplan), not per row.
-- Ref: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Also: drop redundant duplicate indexes on public.workflow_runs (same pg_get_indexdef),
-- keeping canonical names idx_workflow_runs_org / idx_workflow_runs_site from 0002_factory.sql.

-- ─── Helper functions (ADR 006 / 0004) ───────────────────────────────────────

create or replace function current_clerk_org_id_from_jwt()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(j ->> 'org_id'), ''),
    nullif(trim(j ->> 'clerk_org_id'), ''),
    nullif(trim(j -> 'app_metadata' ->> 'org_id'), ''),
    nullif(trim(j -> 'user_metadata' ->> 'org_id'), '')
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

-- ─── Policies: use (select auth.uid()) in expressions (0010) ─────────────────

drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles
for select
using (id = (select auth.uid())::uuid);

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles
for insert
with check (id = (select auth.uid())::uuid);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
for update
using (id = (select auth.uid())::uuid)
with check (id = (select auth.uid())::uuid);

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

-- ─── workflow_runs: remove duplicate btree indexes (same definition) ─────────
-- Keeps idx_workflow_runs_org / idx_workflow_runs_site when present in the duplicate set.

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

-- ─── Re-lock search_path after CREATE OR REPLACE (matches 0017) ──────────────

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
