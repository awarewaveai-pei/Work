-- Down for 0095_collect_claimreview_mirror.sql. Withdraw the next-admin code first (it only reads and refreshes the
-- mirror; without the tables it answers 無法檢查). The mirror is a public dataset re-downloadable at any time: dropping
-- it loses nothing that cannot be rebuilt by the next daily refresh.

begin;
set local lock_timeout = '5s';

drop function if exists public.collect_claimreview_fail_refresh(bigint, text);
drop function if exists public.collect_claimreview_finish_refresh(bigint, integer, integer, text);
drop function if exists public.collect_claimreview_begin_refresh(integer);
drop function if exists public.collect_claimreview_candidates(text[], integer);
drop table if exists public.collect_claimreview_reviews;
drop table if exists public.collect_claimreview_mirror;
drop function if exists public.collect_claimreview_pieces(text);

notify pgrst, 'reload schema';

commit;
