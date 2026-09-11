-- Down migration for 0079_organizations_chatwoot_account_id_unique.sql
BEGIN;

DROP INDEX IF EXISTS public.organizations_chatwoot_account_id_unique;

COMMIT;
