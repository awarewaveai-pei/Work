-- lobster-factory/packages/db/migrations/0033_repair_runs_rls_deny_anon.sql
-- m11 fix: add explicit deny-anon RLS policy on repair_runs.
--
-- 0027 enabled RLS on repair_runs with no policies. PostgreSQL behaviour:
-- RLS enabled + no matching policy = PostgREST returns 0 rows (not 403).
-- This silent-empty-result is confusing for any future client-side direct query
-- using the anon key and could mask logic errors.
--
-- Fix: explicit USING (false) policy for anon role, so any anon-key attempt
-- returns 0 rows with a clear policy denial rather than relying on the
-- "no policy = deny" implicit behaviour.
--
-- service_role: unaffected (service_role bypasses RLS in PostgreSQL by design).
-- authenticated role: unaffected (no authenticated policy exists; authenticated
--   queries continue to be handled by application-layer API routes that use
--   service_role internally).

create policy "deny_anon_all"
  on public.repair_runs
  for all
  to anon
  using (false)
  with check (false);

-- ⚠️ Maintenance: if a future feature requires direct anon-key access to repair_runs
-- (unlikely — all access is via service_role API routes), this policy must be
-- replaced with a scoped USING predicate rather than simply dropped.
