-- 0173: deleting a media_assets row takes its QA reports and transcription jobs with it (CASCADE): they describe that
-- file only, and RESTRICT here made every My Designs video delete fail (2026-11-21). A release (immutable publication
-- evidence; delivery rows hang off it) and a project's active candidate stay RESTRICT: the delete routes refuse those
-- before touching R2 (next-admin lib/content/media-asset-delete.ts; its test keeps the list equal to these FKs).
-- supersedes_report_id -> SET NULL: a report superseding a deleted one keeps itself, never blocks the delete.
-- APPLY:  node scripts/apply-db-migration.mjs 0173
-- Down:   packages/db/migrations/0173_media_asset_delete_takes_qa_and_transcripts.down.sql
begin;
set local lock_timeout = '5s';

alter table public.media_qa_reports
  drop constraint media_qa_reports_candidate_asset_id_fkey,
  add constraint media_qa_reports_candidate_asset_id_fkey
    foreign key (candidate_asset_id) references public.media_assets(id) on delete cascade,
  drop constraint media_qa_reports_supersedes_report_id_fkey,
  add constraint media_qa_reports_supersedes_report_id_fkey
    foreign key (supersedes_report_id) references public.media_qa_reports(id) on delete set null;

alter table public.media_transcription_jobs
  drop constraint media_transcription_jobs_source_asset_id_fkey,
  add constraint media_transcription_jobs_source_asset_id_fkey
    foreign key (source_asset_id) references public.media_assets(id) on delete cascade;

notify pgrst, 'reload schema';
commit;
