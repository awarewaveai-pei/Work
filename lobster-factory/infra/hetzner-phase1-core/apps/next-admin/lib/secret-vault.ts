// Platform secret backbone — thin wrapper over the Supabase Vault put/get/delete functions
// (migration 0049). The ONE place app code reads/writes per-tenant secrets (connector BYO keys,
// later: SSH keys, tenant-integration tokens, Gmail OAuth tokens). Encrypted at rest by
// supabase_vault (pgsodium). service-role only — these RPCs are REVOKEd from anon/authenticated.
//
// NEVER log a secret value. putSecret returns only the ref (name); errors never echo the value.
// Convention: the returned name IS the durable ref to store in *_ref columns (co_connector_accounts
// .credentials_ref, tenant_integration_bindings.secret_ref, etc.).

import { getSupabaseWriteClient } from "@/lib/supabase-server";

export class SecretVaultUnavailableError extends Error {
  constructor() {
    super("secret-vault: Supabase service-role client not configured");
    this.name = "SecretVaultUnavailableError";
  }
}

/** Store (or overwrite) a secret under `name`. Returns the ref (= name) to persist in a *_ref column. */
export async function putSecret(name: string, value: string): Promise<string> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SecretVaultUnavailableError();
  const { data, error } = await sb.rpc("secret_put", { p_name: name, p_value: value });
  // error.message is a Postgres/function error (function name / constraint), never the value param.
  if (error) throw new Error(`secret-vault put failed: ${error.message}`);
  return (typeof data === "string" && data) || name;
}

/** Read a secret's plaintext by ref/name. Returns null when absent. */
export async function getSecret(name: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SecretVaultUnavailableError();
  const { data, error } = await sb.rpc("secret_get", { p_name: name });
  if (error) throw new Error(`secret-vault get failed: ${error.message}`);
  return typeof data === "string" ? data : null;
}

/** Delete a secret by ref/name. Returns true when a row was removed. */
export async function deleteSecret(name: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SecretVaultUnavailableError();
  const { data, error } = await sb.rpc("secret_delete", { p_name: name });
  if (error) throw new Error(`secret-vault delete failed: ${error.message}`);
  return data === true;
}

/** Deterministic vault ref for a connector account's secret. */
export function connectorSecretRef(connectorAccountId: string): string {
  return `co_connector:${connectorAccountId}`;
}
