-- 0143: staff give / take a product on the client hub (ADR 017 4b-10). Same table, no new store: a gift is comp rows
-- (one per registered feature of the product, ADR 017 §3 "贈送整個產品＝每個功能一列"), source_ref 'staff:<trace>'
-- = the ops_audit_events row written in the same transaction. A seller licence (<product>.resell, 0133) is given and
-- taken the same way but on its own: the use rows and the licence row of one product never move together.
-- Comp only, never contract: a contract row 0120 does not own blocks the customer's own payment for that feature
-- (payment_rejected:feature_in_another_contract) and is suspended by any chargeback on the account.
-- Invariants: one live staff row per (account, product, feature); a gift adds only features with no row of any source
-- usable now (a row that starts later does not count: can() would refuse today); taking back ends only the gifts the
-- page showed (their source_refs), never a contract, a pack, an all-features row, or a gift made since by someone else.
-- Both functions take the payment function's per-account lock (0120/0133), so a payment and a gift never interleave.
begin;
set local lock_timeout = '5s';

create unique index organization_entitlements_staff_live_uniq
  on public.organization_entitlements(organization_id, product_key, feature_key)
  where status = 'active' and source_ref like 'staff:%';

-- Shared precondition of both functions: an owner/admin, a root customer account, then the per-account lock.
create function public.entitlement_staff_account(p_organization_id uuid, p_actor_role text) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_actor_role is null or p_actor_role not in ('owner','admin') then raise exception 'staff_grant:forbidden'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and parent_organization_id is null and kind = 'customer') then
    raise exception 'staff_grant:not_a_customer_account';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
end $$;
revoke all on function public.entitlement_staff_account(uuid, text) from public, anon, authenticated;
grant execute on function public.entitlement_staff_account(uuid, text) to service_role;

create function public.entitlement_staff_grant(p_organization_id uuid, p_product_key text, p_kind text, p_features jsonb,
  p_actor text, p_actor_role text, p_note text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_trace uuid := gen_random_uuid();
  v_licence text := p_product_key || '.resell';
  v_added text[];
begin
  if p_kind is null or p_kind not in ('use','resell') then raise exception 'staff_grant:invalid_kind'; end if;
  if coalesce(length(btrim(p_note)), 0) = 0 or length(p_note) > 200 then raise exception 'staff_grant:invalid_note'; end if;
  if coalesce(length(btrim(p_actor)), 0) = 0 then raise exception 'staff_grant:invalid_actor'; end if;
  if jsonb_typeof(p_features) is distinct from 'array' or jsonb_array_length(p_features) = 0
    or jsonb_path_exists(p_features, '$[*] ? (@.type() != "string" || @ == "")') then
    raise exception 'staff_grant:invalid_features';
  end if;
  -- The licence and the use rows are separate gifts: neither list may carry the other.
  if p_kind = 'resell' and p_features <> jsonb_build_array(v_licence) then raise exception 'staff_grant:invalid_features'; end if;
  if p_kind = 'use' and exists (select 1 from jsonb_array_elements_text(p_features) f where f like '%.resell') then
    raise exception 'staff_grant:invalid_features';
  end if;
  perform public.entitlement_staff_account(p_organization_id, p_actor_role);
  -- An all-features account already has every feature (0118 tops it up daily); a gift beside it is a second live row.
  if p_kind = 'use' and exists (select 1 from public.organization_all_features where organization_id = p_organization_id) then
    raise exception 'staff_grant:all_features_account';
  end if;
  with ins as (
    insert into public.organization_entitlements(organization_id, product_key, feature_key, source, source_ref)
    select p_organization_id, p_product_key, x.f, 'comp', 'staff:' || v_trace
    from (select distinct jsonb_array_elements_text(p_features) as f) x
    where not exists (select 1 from public.organization_entitlements e
      where e.organization_id = p_organization_id and e.product_key = p_product_key and e.feature_key = x.f
        and e.status in ('active','suspended') and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now()))
    returning feature_key)
  select coalesce(array_agg(feature_key order by feature_key), '{}') into v_added from ins;
  if cardinality(v_added) = 0 then return jsonb_build_object('added', 0); end if;
  insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
    values (p_organization_id, p_actor_role, 'entitlement.staff_grant', 'organization_entitlements', 'staff:' || v_trace, v_trace::text,
      jsonb_build_object('product_key', p_product_key, 'kind', p_kind, 'features', to_jsonb(v_added), 'actor', p_actor, 'note', p_note));
  return jsonb_build_object('added', cardinality(v_added), 'source_ref', 'staff:' || v_trace);
end $$;
revoke all on function public.entitlement_staff_grant(uuid, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.entitlement_staff_grant(uuid, text, text, jsonb, text, text, text) to service_role;
comment on function public.entitlement_staff_grant is 'Staff gift (ADR 017 4b-10): comp rows for the features with no live row, source_ref staff:<trace>, one ops_audit_events row in the same transaction. kind use = product features, resell = the <product>.resell licence only. service_role only.';

create function public.entitlement_staff_revoke(p_organization_id uuid, p_product_key text, p_kind text, p_source_refs text[],
  p_actor text, p_actor_role text, p_note text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_trace uuid := gen_random_uuid();
  v_licence text := p_product_key || '.resell';
  v_ended text[];
begin
  if p_kind is null or p_kind not in ('use','resell') then raise exception 'staff_grant:invalid_kind'; end if;
  if coalesce(length(btrim(p_note)), 0) = 0 or length(p_note) > 200 then raise exception 'staff_grant:invalid_note'; end if;
  if coalesce(length(btrim(p_actor)), 0) = 0 then raise exception 'staff_grant:invalid_actor'; end if;
  if coalesce(cardinality(p_source_refs), 0) = 0 or exists (select 1 from unnest(p_source_refs) r where r is null or r not like 'staff:_%') then
    raise exception 'staff_grant:invalid_source_refs';
  end if;
  perform public.entitlement_staff_account(p_organization_id, p_actor_role);
  -- Same end as 0120's: expired now (a row not started yet keeps its dates, ends_at > starts_at holds).
  with upd as (
    update public.organization_entitlements e set status = 'expired', ends_at = case when e.starts_at < now() then now() else e.ends_at end
    where e.organization_id = p_organization_id and e.product_key = p_product_key and e.source = 'comp' and e.source_ref = any(p_source_refs)
      and e.status in ('active','suspended') and (e.ends_at is null or e.ends_at > now())
      and (case when p_kind = 'resell' then e.feature_key = v_licence else e.feature_key <> v_licence end)
    returning e.feature_key)
  select coalesce(array_agg(feature_key order by feature_key), '{}') into v_ended from upd;
  if cardinality(v_ended) = 0 then return jsonb_build_object('ended', 0); end if;
  insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
    values (p_organization_id, p_actor_role, 'entitlement.staff_revoke', 'organization_entitlements', p_product_key, v_trace::text,
      jsonb_build_object('product_key', p_product_key, 'kind', p_kind, 'features', to_jsonb(v_ended), 'source_refs', to_jsonb(p_source_refs),
        'actor', p_actor, 'note', p_note));
  return jsonb_build_object('ended', cardinality(v_ended));
end $$;
revoke all on function public.entitlement_staff_revoke(uuid, text, text, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.entitlement_staff_revoke(uuid, text, text, text[], text, text, text) to service_role;
comment on function public.entitlement_staff_revoke is 'Staff take-back (ADR 017 4b-10): expires only the live comp rows of the named staff:% gifts on this account and product (kind use = every feature but the licence, resell = the licence), one ops_audit_events row in the same transaction. service_role only.';

notify pgrst, 'reload schema';
commit;
