-- Down migration for 0049_secret_vault_wrappers.sql
-- Drops the platform secret wrappers. Does NOT touch vault.secrets contents (existing secrets stay
-- encrypted in the vault; only the convenience wrappers are removed). Idempotent.

DROP FUNCTION IF EXISTS public.secret_put(text, text);
DROP FUNCTION IF EXISTS public.secret_get(text);
DROP FUNCTION IF EXISTS public.secret_delete(text);

NOTIFY pgrst, 'reload schema';
