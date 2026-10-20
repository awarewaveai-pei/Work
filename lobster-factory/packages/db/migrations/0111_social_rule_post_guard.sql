-- 0111 -- a post's own auto-reply rule: the queued-post guard and the post version move into SQL (C21 follow-up).
-- store.ts used to read the post's state, then call 0105's save/delete (a sender claim landing between the two was a
-- window), then read the version in a third call. INVARIANT: saving or deleting a post's own rule never moves the version
-- of a post the sender has claimed -- social_touch_post_rules locks the post row (for no key update, the 0098 lock
-- order) and refuses state 'queued' with SC409 -- and the version the editor compares against next is the one this
-- transaction left (it holds the row lock until commit; social_repeat_materialize never updates its template).
-- Additive: 0105's social_save_auto_rule / social_delete_auto_rule stay (they pick up the new guard, they call the touch
-- function); the code deployed today keeps working. A later migration drops them once store.ts only calls the new pair.
--
-- APPLY WITH (High: production schema; operator go-ahead first): node scripts/apply-db-migration.mjs 0111
-- DOWN: packages/db/migrations/0111_social_rule_post_guard.down.sql
-- LOCAL PROOF: bash packages/db/scripts/0111_social_rule_post_guard-local-verify.sh

begin;
set local lock_timeout = '5s';

create or replace function public.social_touch_post_rules(p_org uuid, p_post uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_state text;
begin
  if p_post is null then
    return;
  end if;
  select state into v_state from public.social_posts where id = p_post and organization_id = p_org for no key update;
  -- a version moved mid-send makes the sender's record refused and its Postiz post an orphan (0100)
  if v_state = 'queued' then
    raise exception 'the post is being sent: unschedule it before changing its own auto-reply rule' using errcode = 'SC409';
  end if;
  update public.social_posts set updated_at = now() where id = p_post and organization_id = p_org;
  perform public.social_withdraw_repeat(p_org, p_post, 'template_rule', p_actor);
end $$;

-- the rule's id and, for a post's own rule, the post's version after this write (null = the brand's rule)
create or replace function public.social_save_post_rule(p_org uuid, p_rule_id uuid, p_rule jsonb, p_actor text)
returns table (rule_id uuid, post_version integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_post uuid;
  v_version integer;
begin
  v_id := public.social_save_auto_rule(p_org, p_rule_id, p_rule, p_actor);
  select r.post_id into v_post from public.social_auto_rules r where r.id = v_id and r.organization_id = p_org;
  if v_post is not null then
    select p.version into v_version from public.social_posts p where p.id = v_post and p.organization_id = p_org;
  end if;
  return query select v_id, v_version;
end $$;

create or replace function public.social_delete_post_rule(p_org uuid, p_rule_id uuid, p_actor text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_post uuid;
  v_version integer;
begin
  select r.post_id into v_post from public.social_auto_rules r where r.id = p_rule_id and organization_id = p_org;
  perform public.social_delete_auto_rule(p_org, p_rule_id, p_actor);
  if v_post is not null then
    select p.version into v_version from public.social_posts p where p.id = v_post and p.organization_id = p_org;
  end if;
  return v_version;
end $$;

revoke all on function public.social_save_post_rule(uuid, uuid, jsonb, text), public.social_delete_post_rule(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.social_save_post_rule(uuid, uuid, jsonb, text), public.social_delete_post_rule(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
