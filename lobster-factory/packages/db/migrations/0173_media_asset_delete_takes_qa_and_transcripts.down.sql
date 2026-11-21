-- Back to 0172: RESTRICT again (QA reports / transcription jobs block an asset delete). Revert the app first: the
-- delete routes then fail at the row delete as before 0173. Rows already cascaded away are not restored.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0173_media_asset_delete_takes_qa_and_transcripts.sql';
  end if;
end $$;

alter table public.media_qa_reports
  drop constraint media_qa_reports_candidate_asset_id_fkey,
  add constraint media_qa_reports_candidate_asset_id_fkey
    foreign key (candidate_asset_id) references public.media_assets(id) on delete restrict,
  drop constraint media_qa_reports_supersedes_report_id_fkey,
  add constraint media_qa_reports_supersedes_report_id_fkey
    foreign key (supersedes_report_id) references public.media_qa_reports(id) on delete restrict;

alter table public.media_transcription_jobs
  drop constraint media_transcription_jobs_source_asset_id_fkey,
  add constraint media_transcription_jobs_source_asset_id_fkey
    foreign key (source_asset_id) references public.media_assets(id) on delete restrict;

notify pgrst, 'reload schema';
commit;
