-- Back to 0148. Revert next-admin first (it writes these columns). Dropped columns lose their values: signatures,
-- privacy pages, review modes, follow-up delays and gate snapshots. The dropped NULL-organization cache rows and the
-- lowercased suppression values are not restored (both were equivalent under the matching code).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0149_outbound_v2_expand.sql';
  end if;
end $$;
alter table public.co_suppression_list drop constraint if exists co_suppression_list_lowercase;
alter table public.co_verified_emails drop constraint if exists co_verified_emails_organization_id_email_key;
alter table public.co_verified_emails add constraint co_verified_emails_organization_id_email_key unique (organization_id, email);
drop trigger if exists co_leads_profile_same_org on public.co_leads;
drop function if exists public.co_leads_profile_same_org();
drop index if exists public.co_messages_one_first_email;
drop index if exists public.co_leads_org_email_uniq;
alter table public.co_service_profiles drop column if exists review_sample_pct;
alter table public.co_service_profiles drop column if exists review_mode;
alter table public.co_service_profiles drop column if exists privacy_url;
alter table public.co_messages drop column if exists gate_snapshot;
alter table public.co_messages drop column if exists followup_delay_days;
alter table public.co_sender_accounts drop column if exists signature_block;
commit;
