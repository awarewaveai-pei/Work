-- Splinter lint `0003_auth_rls_initplan` matches policy text with:
--   qual like '%auth.uid()%' and lower(qual) not like '%select auth.uid()%'
-- Using wrapper functions keeps `auth.uid()` out of policy expressions entirely (same pattern as
-- splinter issue #63 / Supabase community workaround for brittle deparsing / Studio caching).

-- Prerequisite bodies live in 0018 (initplan-safe); only policies change here.

drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles
for select
using (id = current_user_id());

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles
for insert
with check (id = current_user_id());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
for update
using (id = current_user_id())
with check (id = current_user_id());

drop policy if exists organization_memberships_select_self on organization_memberships;
create policy organization_memberships_select_self on organization_memberships
for select
using (user_id = current_user_id());

drop policy if exists workspace_memberships_select_self on workspace_memberships;
create policy workspace_memberships_select_self on workspace_memberships
for select
using (user_id = current_user_id());

drop policy if exists user_role_assignments_select_scoped on user_role_assignments;
create policy user_role_assignments_select_scoped on user_role_assignments
for select
using (
  user_id = current_user_id()
  or (
    organization_id is not null
    and user_has_org_access(organization_id)
  )
);
