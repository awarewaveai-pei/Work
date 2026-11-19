begin;
drop function if exists public.media_credit_reserve(uuid, integer, text, text, text);
drop table if exists public.media_provider_profiles;
drop table if exists public.media_credit_ledger;
drop table if exists public.media_billing_accounts;
do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0066_media_billing_and_provider_profiles.sql';
  end if;
end $$;
commit;
