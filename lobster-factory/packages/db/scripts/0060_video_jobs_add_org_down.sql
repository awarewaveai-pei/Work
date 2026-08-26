-- DOWN for 0060_video_jobs_add_org.sql.
--
-- Safe: the column is nullable, has no default, and only one consumer reads it
-- (/api/video/status's assertOrgAccess). After the drop that assert sees undefined --
-- staff still pass, client callers are blocked. That is fail-closed and identical to the
-- behaviour of an unmigrated in-flight row. video_jobs holds ~1h of progress state only;
-- the durable artifacts (R2 video file + media_assets row) are untouched.
--
-- ORDER MATTERS: revert the application commit FIRST. With the new code deployed and the
-- column gone, every createJob() insert throws -> /api/video/generate and /render-draft
-- return 500. Loud rather than silent, but still an outage.

set lock_timeout = '3s';

alter table public.video_jobs drop column if exists organization_id;

reset lock_timeout;

notify pgrst, 'reload schema';
