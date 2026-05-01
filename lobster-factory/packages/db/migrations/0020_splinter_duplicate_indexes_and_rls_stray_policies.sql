-- Follow-up for Performance Advisor when 0018/0019 were applied but WARNs remain.
--
-- (A) Duplicate indexes on workflow_runs
--     Splinter 0009 groups by replace(indexdef, indexname, '') (definition minus name).
--     0018 partitioned by full pg_get_indexdef (includes the index name), so true duplicates
--     with different names were never grouped → nothing dropped.
--
-- (B) Auth RLS initplan (0003)
--     Extra permissive policies from Dashboard/templates on profiles/memberships tables
--     keep bare auth.uid() in qual; drop policy if exists <our names> does not remove them.
--
-- Prerequisites: 0018 + 0019 already applied (functions + canonical policies).


-- ─── (A) Drop duplicate btree indexes on workflow_runs (Splinter-aligned grouping) ───

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


-- ─── (B) Remove ALL policies on four tables, then restore canonical 0019 definitions ───

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

create policy profiles_insert_self on profiles
for insert
with check (id = current_user_id());

create policy profiles_update_self on profiles
for update
using (id = current_user_id())
with check (id = current_user_id());

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
