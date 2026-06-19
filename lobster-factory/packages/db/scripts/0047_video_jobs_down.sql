-- DOWN for 0047_video_jobs.sql.
--
-- Safe: video_jobs holds only short-lived (~1h TTL) async render-progress state. The DURABLE
-- artifacts (R2 video file + media_assets gallery row, backfilled by the reconcile cron) are
-- unaffected. After drop, in-flight /status polls 404 (job_not_found) until the table is recreated
-- — non-fatal; reconcile remains the backstop. No FKs point into or out of this table → clean drop.

drop table if exists public.video_jobs;
notify pgrst, 'reload schema';
