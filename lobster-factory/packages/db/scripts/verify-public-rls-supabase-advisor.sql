-- Mirrors Supabase Database Linter rule 0013_rls_disabled_in_public (concept).
-- Run in SQL Editor (Studio) or: docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -
--
-- Non-empty result => Security Advisor will keep reporting RLS errors until you
-- apply lobster-factory/packages/db/migrations/0014_enable_public_table_rls.sql
-- (then 0016 for ops/permission policies), or enable RLS per table.

SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND NOT c.relrowsecurity
  AND (
    pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
    OR pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
  )
ORDER BY n.nspname, c.relname;
