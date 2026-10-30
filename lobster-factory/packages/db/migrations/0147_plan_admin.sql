-- 0147: staff create / change AwareWave's own plans on /ops/plans (until now a plan was a migration, e.g. 0144).
-- Only plans with owner_organization_id null (AwareWave's) are written here; a seller's plan is read-only to this page.
-- The structure the payment path refuses is refused here too, so a saved plan can never fail at checkout:
--   limits keys are plan features, each value an object; {"pay":"credits"} is the only pay marker (can.ts issuePermit);
--   an addon (credit pack) carries {"pay":"credits"} on every feature (0133 payment function, pack_plan_not_credits).
-- Which features a product has, and which of them bill in credits, is the next-admin registry (lib/portal/products.ts),
-- not the database: the page checks that before it calls these functions (the product list is the plans table's own CHECK).
--   an addon shares no feature with any other plan of its product, and a base none with an addon of it (0146
--   feature_in_another_contract: a gift or pack holder could never subscribe -- critic 2026-10-30 C1).
-- plan_key, product_key and kind never change after create; there is no delete: a WooCommerce product may name a plan
-- the database cannot see, and a deleted (or re-created) key would refuse or misroute paid orders (critic 2026-10-30 M1).
-- A wrong plan is edited. Each function writes one ops_audit_events row in the same transaction, under the
-- awarewave-ops account (organization_id is not null there).
begin;
set local lock_timeout = '5s';

create function public.plan_admin_check(p_plan_key text, p_product_key text, p_kind text, p_features jsonb, p_limits jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_kind is null or p_kind not in ('base','addon') then raise exception 'plan_admin:invalid_kind'; end if;
  if jsonb_typeof(p_features) is distinct from 'array' or jsonb_array_length(p_features) = 0
    or jsonb_path_exists(p_features, '$[*] ? (@.type() != "string" || @ == "")')
    or (select count(distinct f) from jsonb_array_elements_text(p_features) f) <> jsonb_array_length(p_features) then
    raise exception 'plan_admin:invalid_features';
  end if;
  if jsonb_typeof(p_limits) is distinct from 'object' then raise exception 'plan_admin:invalid_limits'; end if;
  if exists (select 1 from jsonb_each(p_limits) l
      where not (p_features ? l.key) or jsonb_typeof(l.value) <> 'object'
        or (l.value ? 'pay' and l.value->'pay' <> '"credits"'::jsonb)) then
    raise exception 'plan_admin:invalid_limits';
  end if;
  if p_kind = 'addon' and exists (select 1 from jsonb_array_elements_text(p_features) f(feature)
      where (p_limits->f.feature->>'pay') is distinct from 'credits') then
    raise exception 'plan_admin:addon_needs_credits';
  end if;
  if exists (select 1 from public.plans o, jsonb_array_elements_text(p_features) f(feature)
      where o.product_key = p_product_key and o.plan_key <> p_plan_key and (p_kind = 'addon' or o.kind = 'addon') and o.features ? f.feature) then
    raise exception 'plan_admin:overlaps_plan';
  end if;
end $$;
revoke all on function public.plan_admin_check(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.plan_admin_check(text, text, text, jsonb, jsonb) to service_role;

-- Shared precondition: owner/admin, a named actor; returns the account the audit row is filed under.
create function public.plan_admin_guard(p_actor text, p_actor_role text) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  if p_actor_role is null or p_actor_role not in ('owner','admin') then raise exception 'plan_admin:forbidden'; end if;
  if coalesce(length(btrim(p_actor)), 0) = 0 then raise exception 'plan_admin:invalid_actor'; end if;
  select id into v_org from public.organizations where slug = 'awarewave-ops' and kind = 'internal';
  if v_org is null then raise exception 'plan_admin:audit_account_missing'; end if;
  return v_org;
end $$;
revoke all on function public.plan_admin_guard(text, text) from public, anon, authenticated;
grant execute on function public.plan_admin_guard(text, text) to service_role;

create function public.plan_admin_create(p_plan_key text, p_product_key text, p_kind text, p_features jsonb, p_limits jsonb,
  p_actor text, p_actor_role text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.plan_admin_guard(p_actor, p_actor_role);
  v_trace uuid := gen_random_uuid();
begin
  if p_plan_key is null or p_plan_key !~ '^[a-z0-9][a-z0-9_.-]{0,99}$' then raise exception 'plan_admin:invalid_plan_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan:' || p_product_key, 0));   -- per product: the overlap check reads its plans
  perform public.plan_admin_check(p_plan_key, p_product_key, p_kind, p_features, p_limits);
  if exists (select 1 from public.plans where plan_key = p_plan_key) then raise exception 'plan_admin:plan_exists'; end if;
  insert into public.plans(plan_key, product_key, kind, features, limits) values (p_plan_key, p_product_key, p_kind, p_features, p_limits);
  insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
    values (v_org, p_actor_role, 'plan.create', 'plans', p_plan_key, v_trace::text,
      jsonb_build_object('product_key', p_product_key, 'kind', p_kind, 'features', p_features, 'limits', p_limits, 'actor', p_actor));
  return jsonb_build_object('plan_key', p_plan_key);
end $$;
revoke all on function public.plan_admin_create(text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.plan_admin_create(text, text, text, jsonb, jsonb, text, text) to service_role;
comment on function public.plan_admin_create is 'Staff plan create (/ops/plans): AwareWave-owned plan, structure checked as the payment path will read it, one ops_audit_events row in the same transaction. service_role only.';

create function public.plan_admin_update(p_plan_key text, p_features jsonb, p_limits jsonb, p_actor text, p_actor_role text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid := public.plan_admin_guard(p_actor, p_actor_role);
  v_trace uuid := gen_random_uuid();
  v_plan public.plans%rowtype;
begin
  select * into v_plan from public.plans where plan_key = p_plan_key;
  if not found then raise exception 'plan_admin:not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan:' || v_plan.product_key, 0));
  select * into v_plan from public.plans where plan_key = p_plan_key for update;
  if v_plan.owner_organization_id is not null then raise exception 'plan_admin:not_editable'; end if;
  perform public.plan_admin_check(v_plan.plan_key, v_plan.product_key, v_plan.kind, p_features, p_limits);
  update public.plans set features = p_features, limits = p_limits where plan_key = p_plan_key;
  insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
    values (v_org, p_actor_role, 'plan.update', 'plans', p_plan_key, v_trace::text,
      jsonb_build_object('product_key', v_plan.product_key, 'kind', v_plan.kind, 'actor', p_actor,
        'before', jsonb_build_object('features', v_plan.features, 'limits', v_plan.limits),
        'after', jsonb_build_object('features', p_features, 'limits', p_limits)));
  return jsonb_build_object('plan_key', p_plan_key);
end $$;
revoke all on function public.plan_admin_update(text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.plan_admin_update(text, jsonb, jsonb, text, text) to service_role;
comment on function public.plan_admin_update is 'Staff plan change (/ops/plans): features and limits only; a used plan may change (subscribers get it at their next renewal, 0133). service_role only.';

notify pgrst, 'reload schema';
commit;
