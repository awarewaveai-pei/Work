-- 0149: Outbound OS v2 card C2 (SPEC §4). Signature, review policy and privacy page; A/B first emails; follow-up rows.
-- Two uniqueness rules close a class each, NULL organization (the agency's own rows) included (NULLS NOT DISTINCT, PG 15):
--   one lead per email per organization (an import cannot create a second lead for the same address);
--   one first email per lead on the way out (approved/drafted/sending/sent): approving a second variant -- by a person or
--   by the sampled policy at the same time -- hits the index, and the API answers 409 variant_already_approved.
--   a lead's service profile belongs to the lead's own organization (trigger): the profile decides the privacy notice and
--   the auto-approve policy, so a cross-organization pair would send one client's notice under another's policy.
-- All three are refused, not repaired, when the data already breaks them: which row to keep is a person's call.
-- An email is "absent" when null or blank; first emails "on the way out" include 'copied' (0048:155 allows it).
-- Folded in from card C1 (critic m2/m3): co_verified_emails is a cache, so a duplicate NULL-organization row is dropped
-- (newest kept); suppression email/domain are stored lowercase (matching already folds case, lib/outreach/normalize.ts).
-- co_messages.status 'sending' is not added here: it arrives with the send claims (0152).
begin;
set local lock_timeout = '5s';

alter table public.co_sender_accounts add column if not exists signature_block text;
alter table public.co_messages add column if not exists followup_delay_days int
  check (followup_delay_days is null or followup_delay_days between 1 and 60);
alter table public.co_messages add column if not exists gate_snapshot jsonb;
alter table public.co_service_profiles add column if not exists privacy_url text;
alter table public.co_service_profiles add column if not exists review_mode text not null default 'manual'
  check (review_mode in ('manual','sampled'));
alter table public.co_service_profiles add column if not exists review_sample_pct int not null default 10
  check (review_sample_pct between 0 and 100);

do $$
declare v_dups text;
begin
  select string_agg(format('%s / %s (%s leads)', coalesce(organization_id::text, 'agency'), e, n), '; ')
    into v_dups
    from (select organization_id, lower(btrim(email)) e, count(*) n from public.co_leads where btrim(email) <> ''
          group by 1, 2 having count(*) > 1) d;
  if v_dups is not null then
    raise exception '0149: co_leads has more than one lead for the same email: %. Keep one lead per address, then apply.', v_dups;
  end if;
  select string_agg(lead_id::text, ', ')
    into v_dups
    from (select lead_id from public.co_messages
          where output_type = 'cold_email' and status in ('approved','drafted','copied','sent')
          group by 1 having count(*) > 1) d;
  if v_dups is not null then
    raise exception '0149: leads with more than one first email approved or sent: %. Skip the extra ones, then apply.', v_dups;
  end if;
  select string_agg(l.id::text, ', ')
    into v_dups
    from public.co_leads l join public.co_service_profiles p on p.id = l.service_profile_id
   where p.organization_id is distinct from l.organization_id;
  if v_dups is not null then
    raise exception '0149: leads whose service profile belongs to another organization: %. Reassign them, then apply.', v_dups;
  end if;
end $$;

create unique index if not exists co_leads_org_email_uniq
  on public.co_leads (organization_id, lower(btrim(email))) nulls not distinct where btrim(email) <> '';
create unique index if not exists co_messages_one_first_email
  on public.co_messages (lead_id) where output_type = 'cold_email' and status in ('approved','drafted','sending','copied','sent');

create or replace function public.co_leads_profile_same_org() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.service_profile_id is not null and not exists (
       select 1 from public.co_service_profiles p
        where p.id = new.service_profile_id and p.organization_id is not distinct from new.organization_id) then
    raise exception 'co_leads: service profile % belongs to another organization', new.service_profile_id
      using errcode = 'P0149';  -- its own code: the API maps it to profile_other_org, not every CHECK failure
  end if;
  return new;
end $$;
drop trigger if exists co_leads_profile_same_org on public.co_leads;
create trigger co_leads_profile_same_org before insert or update of service_profile_id, organization_id on public.co_leads
  for each row execute function public.co_leads_profile_same_org();

delete from public.co_verified_emails v
 using public.co_verified_emails newer
 where v.organization_id is null and newer.organization_id is null and v.email = newer.email
   and (newer.verified_at, newer.id) > (v.verified_at, v.id);
alter table public.co_verified_emails drop constraint if exists co_verified_emails_organization_id_email_key;
alter table public.co_verified_emails add constraint co_verified_emails_organization_id_email_key
  unique nulls not distinct (organization_id, email);

update public.co_suppression_list set email = lower(email) where email <> lower(email);
update public.co_suppression_list set domain = lower(domain) where domain <> lower(domain);
alter table public.co_suppression_list drop constraint if exists co_suppression_list_lowercase;
alter table public.co_suppression_list add constraint co_suppression_list_lowercase
  check ((email is null or email = lower(email)) and (domain is null or domain = lower(domain)));

commit;
