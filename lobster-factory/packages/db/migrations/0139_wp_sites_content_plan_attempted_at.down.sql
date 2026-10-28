-- Back to 0138: no content_plan_attempted_at. Revert the app first, then this. The column is only a timestamp, so there is
-- nothing to back up; re-applying 0139 lets every site be planned again at the next sweep (hasProposal still guards the month).
begin;
set local lock_timeout = '5s';

alter table public.wp_sites drop column if exists content_plan_attempted_at;

notify pgrst, 'reload schema';
commit;
