-- Migration 0049: Platform secret backbone — service-role-only wrappers over Supabase Vault.
--
-- WHY: the platform's chosen convention is "secrets → Supabase Vault, referenced by a pointer
-- (secret_ref / credentials_ref); never store raw secrets in normal tables" (see 0024 comment,
-- LOBSTER_FACTORY deployment checklists, packages/workflows secretStore.ts). The vault backend
-- (supabase_vault 0.3.1) is installed on EU, but until now NOTHING wired the actual read/write — it
-- was the acknowledged Phase-4 gap (secretStore.ts putSecret throws "not configured"). This adds the
-- single, shared put/get/delete path so connector BYO keys (cold-outreach T8), per-tenant SSH keys,
-- and tenant-integration secrets all use ONE encrypted-at-rest backend.
--
-- SECURITY:
--   - SECURITY DEFINER: the wrappers run as the function OWNER (supabase_admin), which has vault
--     access. Callers therefore need only EXECUTE on the wrapper, not direct vault privileges.
--   - `set search_path = vault, public` pins resolution (prevents search_path hijack — required for
--     SECURITY DEFINER per CVE-class guidance).
--   - Default PUBLIC EXECUTE is REVOKED; only service_role may call. next-admin reaches these via the
--     service-role client (lib/supabase-server.ts) — same access model as every other co_* table.
--   - Secret VALUES are passed as parameters and never returned by secret_put (returns the name/ref
--     only). Only secret_get returns plaintext, and only to service_role.
--
-- Down migration: packages/db/scripts/0049_secret_vault_wrappers_down.sql
-- Vault function signatures verified on EU 2026-06-24:
--   vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL) -> uuid
--   vault.update_secret(secret_id uuid, new_secret text DEFAULT NULL, new_name text DEFAULT NULL, new_description text DEFAULT NULL, new_key_id uuid DEFAULT NULL) -> void
--   vault.decrypted_secrets(id, name, description, secret, decrypted_secret, key_id, nonce, created_at, updated_at)

BEGIN;

-- Upsert a named secret into the vault. Returns the name (the durable ref to store in *_ref columns).
CREATE OR REPLACE FUNCTION public.secret_put(p_name text, p_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'secret_put: name required';
  END IF;
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'secret_put: value required';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'platform secret (lib/secret-vault.ts)');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, p_name, 'platform secret (lib/secret-vault.ts)');
  END IF;
  RETURN p_name;
END;
$$;

-- Read a secret's plaintext by name. NULL when absent. service_role only.
CREATE OR REPLACE FUNCTION public.secret_get(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
$$;

-- Delete a secret by name. Returns true if a row was removed.
CREATE OR REPLACE FUNCTION public.secret_delete(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM vault.secrets WHERE id = v_id;
  RETURN true;
END;
$$;

-- Lock execution to service_role only (revoke the default PUBLIC grant + the Supabase API roles).
REVOKE ALL ON FUNCTION public.secret_put(text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.secret_get(text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.secret_delete(text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.secret_put(text, text)  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.secret_get(text)         FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.secret_delete(text)      FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.secret_put(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.secret_get(text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.secret_delete(text)     TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback: packages/db/scripts/0049_secret_vault_wrappers_down.sql
