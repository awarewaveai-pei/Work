-- DOWN for 0061_wp_sites_add_org.sql.
--
-- ORDER MATTERS: revert the application commit FIRST. With the new code deployed and the
-- column gone, resolveWpSite() reads undefined for every site -- staff still pass, client
-- callers are denied every site. Fail-closed, but it breaks client access entirely.
--
-- Dropping the column loses the backfilled mapping. It is reproducible from the UP script
-- (name match + two explicit URL mappings), so this is recoverable, not destructive.

set lock_timeout = '3s';

drop index if exists public.wp_sites_org_id_idx;
alter table public.wp_sites drop column if exists organization_id;

reset lock_timeout;

notify pgrst, 'reload schema';
