-- Run in Supabase SQL Editor to see which policies Splinter 0003 would still flag.
-- Same logic as: github.com/supabase/splinter/blob/main/lints/0003_auth_rls_initplan.sql
--
-- Optional shortcut (if your project exposes lint views):
--   select * from lint."0003_auth_rls_initplan";

with policies as (
  select
    nsp.nspname as schema_name,
    pb.tablename as table_name,
    pc.relrowsecurity as is_rls_active,
    pol.polname as policy_name,
    pg_get_expr(pol.polqual, pol.polrelid) as qual,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
  from pg_catalog.pg_policy pol
  join pg_catalog.pg_class pc on pol.polrelid = pc.oid
  join pg_catalog.pg_namespace nsp on pc.relnamespace = nsp.oid
  join pg_catalog.pg_policies pb
    on pc.relname = pb.tablename
   and nsp.nspname = pb.schemaname
   and pol.polname = pb.policyname
  where nsp.nspname = 'public'
)
select schema_name, table_name, policy_name, qual, with_check
from policies
where is_rls_active
  and (
    (
      qual like '%auth.uid()%'
      and lower(qual) not like '%select auth.uid()%'
    )
    or (
      qual like '%auth.jwt()%'
      and lower(qual) not like '%select auth.jwt()%'
    )
    or (
      qual like '%auth.role()%'
      and lower(qual) not like '%select auth.role()%'
    )
    or (
      qual like '%auth.email()%'
      and lower(qual) not like '%select auth.email()%'
    )
    or (
      with_check like '%auth.uid()%'
      and lower(with_check) not like '%select auth.uid()%'
    )
    or (
      with_check like '%auth.jwt()%'
      and lower(with_check) not like '%select auth.jwt()%'
    )
    or (
      with_check like '%auth.role()%'
      and lower(with_check) not like '%select auth.role()%'
    )
    or (
      with_check like '%auth.email()%'
      and lower(with_check) not like '%select auth.email()%'
    )
  )
order by table_name, policy_name;
