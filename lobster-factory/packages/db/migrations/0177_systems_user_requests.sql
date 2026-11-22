-- 0177: /ops/systems page buttons 「立即更新」「新增系統」 (agency-os/handoffs/2026-11-21-systems-control-center/briefs/
-- COMMON.md 契約 3, W9). Only widens system_updates.event_type (0174) with two user events, both system_id null:
--   refresh_request  {} (+ by)                      pending = one newer than the newest import_run
--   system_proposed  { name, type, purpose } (+ by) pending = name matches no live system's name / slug / aliases
-- The host importer reads them through next-admin GET /api/internal/systems/pending; the projection ignores both.
-- No table, row or other constraint changes (the re-check scans system_updates under the lock: a small table).
-- Rollback: 0177_systems_user_requests.down.sql.
begin;
set local lock_timeout = '5s';

alter table public.system_updates drop constraint system_updates_event_type_check;
alter table public.system_updates add constraint system_updates_event_type_check check (event_type in
  ('activity', 'handoff', 'feature_update', 'status_change', 'review', 'revert', 'orphaned', 'migration', 'import_run',
   'refresh_request', 'system_proposed'));

notify pgrst, 'reload schema';
commit;
