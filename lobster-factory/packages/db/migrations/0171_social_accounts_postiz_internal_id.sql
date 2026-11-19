-- 0171: the platform's own id of each social channel (Postiz "Integration"."internalId": YouTube channel id, Facebook
-- page id...). Postiz reconnects a channel only when `refresh` = that id (its own UI sends integration.internalId;
-- youtube.provider.ts reConnect requires it among the authorized account's channels). next-admin sent the Postiz row id
-- instead, so every 重新連接 ended in "Channel not found" (2026-11-19). The public API does not return internalId, so the
-- 5-minute host mirror (scripts/social-channel-health.sh -> lib/social/channel-health.ts) fills this column.
-- Additive, nullable (catalog-only ALTER, no table rewrite). Rollback: 0171_social_accounts_postiz_internal_id.down.sql.
begin;
set local lock_timeout = '5s';

alter table public.social_accounts add column if not exists postiz_internal_id text;

notify pgrst, 'reload schema';
commit;
