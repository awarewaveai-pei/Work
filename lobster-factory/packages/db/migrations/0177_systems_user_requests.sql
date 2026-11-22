-- 0177: /ops/systems page buttons 「立即更新」「新增系統」 (agency-os/handoffs/2026-11-21-systems-control-center/briefs/
-- COMMON.md 契約 3, W9). Only widens system_updates.event_type (0174) with three user events, all system_id null:
--   refresh_request  {} (+ by)                      pending = one newer than the newest import_run
--   system_proposed  { name, type, purpose } (+ by) pending = name matches no live system's name / slug / aliases
--                                                    and no system_proposal_closed names it
--   system_proposal_closed { proposal_event_key, reason } (+ by)  withdraws a proposal without a registry entry
-- The host importer reads them through next-admin GET /api/internal/systems/pending; the projection ignores all three.
-- Also view system_last_commit: newest git commit event per system (the importer's activity / handoff /
-- feature_update, key git:<sha>:<n>), so the inferred status (next-admin lib/systems/overview.ts effectiveStatus) sees
-- trailer-less commits too -- the capped state read leaves activity out. security_invoker: read with the caller's
-- rights (service_role only, as the table). No table or row changes; the re-check scans system_updates under the lock.
-- Rollback: 0177_systems_user_requests.down.sql.
begin;
set local lock_timeout = '5s';

alter table public.system_updates drop constraint system_updates_event_type_check;
alter table public.system_updates add constraint system_updates_event_type_check check (event_type in
  ('activity', 'handoff', 'feature_update', 'status_change', 'review', 'revert', 'orphaned', 'migration', 'import_run',
   'refresh_request', 'system_proposed', 'system_proposal_closed'));

create view public.system_last_commit with (security_invoker = true) as
  select system_id, max(occurred_at) as last_commit_at
  from public.system_updates
  where event_key like 'git:%' and commit_sha is not null and system_id is not null
    and event_type in ('activity', 'handoff', 'feature_update')
  group by system_id;
revoke all on public.system_last_commit from public, anon, authenticated, service_role;
grant select on public.system_last_commit to service_role;

notify pgrst, 'reload schema';
commit;
