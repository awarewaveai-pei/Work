-- 0079 — partial unique index on organizations.metadata.client_config.chatwoot.accountId
--
-- lib/cs/db.ts findOrganizationIdByChatwootAccountId() resolves an inbound Chatwoot webhook's
-- account.id to a tenant by querying this JSONB path with no uniqueness guarantee underneath it.
-- Two orgs misconfigured with the same accountId would make Chatwoot traffic silently resolve to
-- whichever org Postgres happens to return first (LIMIT 1, no ORDER BY) — cross-tenant customer
-- data landing in the wrong org's cs_ai_replies/knowledge base. Flagged by critic review during the
-- U6 Chatwoot integration (2026-09-11, WORKLOG); this closes that gap at the DB layer rather than
-- trusting every future admin-UI/manual client_config edit to check it by hand.
--
-- No CONCURRENTLY: organizations is a 5-row admin table (checked live before writing this), the
-- SHARE lock this takes is sub-millisecond, and apply-db-migration.mjs refuses CONCURRENTLY inside
-- a file's own transaction anyway. Checked live for existing collisions before writing this file —
-- exactly one org has chatwoot config set (accountId=1), zero duplicates.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   node scripts/apply-db-migration.mjs 0079
-- Down migration: 0079_organizations_chatwoot_account_id_unique.down.sql

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_chatwoot_account_id_unique
  ON public.organizations (((metadata -> 'client_config' -> 'chatwoot' ->> 'accountId')))
  WHERE metadata -> 'client_config' -> 'chatwoot' ->> 'accountId' IS NOT NULL;

COMMIT;
