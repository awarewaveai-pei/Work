begin;
drop function if exists public.media_credit_reserve(uuid, integer, text, text, text);
drop table if exists public.media_provider_profiles;
drop table if exists public.media_credit_ledger;
drop table if exists public.media_billing_accounts;
commit;
