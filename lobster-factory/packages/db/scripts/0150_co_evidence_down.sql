-- Back to 0149. Revert next-admin first (it reads and writes co_evidence). The evidence rows are lost: research runs
-- again to rebuild them; a person's approvals of third-party evidence are not recoverable.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0150_co_evidence.sql';
  end if;
end $$;
drop trigger if exists co_leads_move_evidence on public.co_leads;
drop function if exists public.co_leads_move_evidence();
drop table if exists public.co_evidence;
drop function if exists public.co_evidence_lead_org();
commit;
