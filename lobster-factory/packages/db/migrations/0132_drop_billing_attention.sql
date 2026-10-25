-- 0132: contract step of 0130 (expand/contract). billing_attention (0127) has no caller since 44dd16561 is live
-- (deployed f706f5f0b, 2026-10-25T11:10Z): /ops/billing reads billing_ledger. Down restores 0127's function verbatim.
begin;
set local lock_timeout = '5s';
drop function if exists public.billing_attention(integer, integer);
notify pgrst, 'reload schema';
commit;
