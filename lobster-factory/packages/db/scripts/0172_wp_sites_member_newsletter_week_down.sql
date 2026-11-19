-- Back to 0170: no member_newsletter_week. Revert the app first, then this. The column is only a once-a-week claim mark
-- (no customer data): dropping it lets each enabled site be claimed again the next firing, nothing else is lost.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0172_wp_sites_member_newsletter_week.sql';
  end if;
end $$;

alter table public.wp_sites drop column if exists member_newsletter_week;

notify pgrst, 'reload schema';
commit;
