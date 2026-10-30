-- 0145: one credit plan per live product (operator 2026-10-30: 「全部處理好」 + sign-up gift; decision
-- agency-os/reports/decisions/2026-10-30-customer-self-signup-email-google.md). <product>_credits = an add-on plan of
-- every feature the registry bills in credits (lib/portal/products.ts billing:"credits"), each {"pay":"credits"}: a credit
-- pack naming it opens that product, every use paid from the one wallet (0128, can.ts). design has no credits feature
-- (design.edit is contract-only) and gets none; cs, collect, outreach doors are closed. From here plans are edited on
-- /ops/plans (0147); this file only seeds them.
-- studio_basic (0144, base) is removed: it held the same 7 studio features, and a base and an add-on of one product may
-- not share a feature (0146 feature_in_another_contract; a gift holder could never subscribe -- critic 2026-10-30 C1).
-- Unused when removed: 0 contracts, 0 Woo products (2026-10-30). studio is sold by credit packs like the other four.
begin;
set local lock_timeout = '5s';
do $$
begin
  if exists (select 1 from public.organization_product_subscriptions where plan_key = 'studio_basic') then
    raise exception '0145 refused: studio_basic has contracts';
  end if;
end $$;
delete from public.plans where plan_key = 'studio_basic';
insert into public.plans(plan_key, product_key, kind, features, limits)
select p.plan_key, p.product_key, 'addon', jsonb_agg(f order by f), jsonb_object_agg(f, '{"pay":"credits"}'::jsonb)
from (values
  ('social_credits',  'social',  array['social.rewrite']),
  ('video_credits',   'video',   array['video.script','video.image','video.motion','video.tts','video.transcribe']),
  ('tarot_credits',   'tarot',   array['tarot.image','tarot.prompt']),
  ('studio_credits',  'studio',  array['studio.image','studio.product-copy','studio.edit-prompt','studio.remove-bg','studio.inpaint','studio.fill','studio.upscale']),
  ('content_credits', 'content', array['content.article','content.humanize','content.seo-fix','content.brand-voice','content.outline','content.title',
                                       'content.keywords','content.hook-brief','content.syndicate','content.market-analysis','content.plan','content.trending','content.image'])
) as p(plan_key, product_key, feats), unnest(p.feats) f
group by p.plan_key, p.product_key;
commit;
