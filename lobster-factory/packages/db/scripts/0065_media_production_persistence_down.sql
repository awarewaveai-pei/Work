-- 0065 down: only for an isolated rehearsal/rollback before any dependent data exists.
drop table if exists public.media_outcome_snapshots;
drop table if exists public.media_delivery_attempts;
drop table if exists public.media_releases;
drop table if exists public.media_qa_reports;
