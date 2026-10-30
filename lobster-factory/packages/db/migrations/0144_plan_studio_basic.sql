-- 0144: the first AwareWave plan (operator 2026-10-30: Claude decides). studio_basic opens every studio feature and
-- every use is paid from the account's one wallet: {"pay":"credits"} on each feature (can.ts issuePermit). Without the
-- marker a contract row covers its use for free. The debit itself waits on per-feature prices: until then every paid
-- seam reports 0 units (grant.ts recordUse), so a balance >= 1 still means unlimited use. Credits work across products the
-- same way: each product's plan marks its credit features; a credit pack sent without plan_key only tops up the wallet.
-- Price and trial live on the Woo product (meta _awarewave_plan_key = studio_basic), never here.
-- A feature added to studio later is not in this plan until a new migration rewrites features and limits together.
begin;
set local lock_timeout = '5s';
insert into public.plans(plan_key, product_key, kind, features, limits)
select 'studio_basic', 'studio', 'base', jsonb_agg(f order by f), jsonb_object_agg(f, '{"pay":"credits"}'::jsonb)
from unnest(array['studio.image','studio.product-copy','studio.edit-prompt','studio.remove-bg','studio.inpaint','studio.fill','studio.upscale']) f;
commit;
