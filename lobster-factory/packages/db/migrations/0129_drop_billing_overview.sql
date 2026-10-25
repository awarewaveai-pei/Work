-- 0129: contract step of 0127 (expand/contract). billing_overview (0120) has no caller since 5bdf7f9f9 is live
-- (deployed cd42c9030, 2026-10-25): /ops/billing reads billing_attention, the client hub 帳務 tab billing_account.
-- Down restores 0120's billing_overview verbatim.
begin;
set local lock_timeout = '5s';
drop function if exists public.billing_overview(integer, integer);
notify pgrst, 'reload schema';
commit;
