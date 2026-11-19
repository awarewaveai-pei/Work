-- Back to 0165. Revert next-admin first (it reads and writes vendor_invoices). Refuses while any row exists:
-- the rows are the only record of what each vendor billed and what was paid.
begin;
set local lock_timeout = '5s';
do $$
declare n bigint;
begin
  if to_regclass('public.vendor_invoices') is not null then
    select count(*) into n from public.vendor_invoices;
    if n > 0 then
      raise exception '0166 down: % vendor_invoices row(s) exist; they are the only record of the vendor bills', n;
    end if;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0166_vendor_invoices.sql';
  end if;
end $$;

drop table if exists public.vendor_invoices;
drop function if exists public.vendor_invoices_append_only();

notify pgrst, 'reload schema';
commit;
