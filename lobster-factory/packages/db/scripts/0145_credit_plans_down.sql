-- Fails (foreign key, on delete restrict) once any account holds one of these plans: end those contracts first.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0145_credit_plans.sql';
  end if;
end $$;
delete from public.plans where plan_key in ('social_credits','video_credits','tarot_credits','studio_credits','content_credits');
-- 0144's studio_basic, back as it was
insert into public.plans(plan_key, product_key, kind, features, limits)
select 'studio_basic', 'studio', 'base', jsonb_agg(f order by f), jsonb_object_agg(f, '{"pay":"credits"}'::jsonb)
from unnest(array['studio.image','studio.product-copy','studio.edit-prompt','studio.remove-bg','studio.inpaint','studio.fill','studio.upscale']) f;
commit;
