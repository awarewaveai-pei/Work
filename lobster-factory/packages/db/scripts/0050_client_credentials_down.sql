-- Down migration for 0050_client_credentials.sql
-- Safe: no other table references client_credentials.
-- Vault entries (namespaced `client_cred:{id}`) are NOT removed by this script —
-- clean them via: SELECT secret_delete(secret_ref) FROM client_credentials WHERE secret_ref IS NOT NULL;
-- before running this if you need a clean vault.

DROP TABLE IF EXISTS public.client_credentials;
