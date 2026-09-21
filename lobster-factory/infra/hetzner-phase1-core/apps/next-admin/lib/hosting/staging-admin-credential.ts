// Staging WP admin password custody for /api/internal/hosting/provision-staging.
//
// Invariant: the generated password never leaves this process except into Supabase Vault.
// provisioningNotes flow into Trigger.dev run output (create-wp-site.ts `vendorStaging` +
// `next.createStagingEnvironmentRecord.notes`) and ops_action_runs.output_payload, so a note may
// only carry the client_credentials id. Storage reuses the per-client credential vault (migration
// 0050 + lib/secret-vault.ts, ref convention clientCredSecretRef(id)) — same shape the
// /api/ops/clients/credentials/secret route writes, so its DELETE cleans up these rows too.
// There is no reveal endpoint by design; recover access with `wp user update admin --user_pass=...`.

import { randomBytes } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { putSecret, deleteSecret, clientCredSecretRef } from "@/lib/secret-vault";

/** CSPRNG password; base64url charset keeps it safe inside the single-quoted wp-cli argument. */
export function generateStagingAdminPassword(): string {
  return `Stg${randomBytes(18).toString("base64url")}`;
}

export type StagingAdminVaultDeps = {
  insertCredential(row: {
    client_id: string;
    category: "hosting";
    label: string;
    identifier: string;
    note: string;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string } | { error: string }>;
  attachSecretRef(credentialId: string, ref: string): Promise<string | null>;
  /** Returns an error message, or null on success. */
  deleteCredential(credentialId: string): Promise<string | null>;
  putSecret(name: string, value: string): Promise<string>;
  deleteSecret(name: string): Promise<boolean>;
};

export function defaultStagingAdminVaultDeps(): StagingAdminVaultDeps | null {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  return {
    async insertCredential(row) {
      const { data, error } = await sb.from("client_credentials").insert(row).select("id").single();
      if (error || !data) return { error: error?.message ?? "no row returned" };
      return { id: (data as { id: string }).id };
    },
    async attachSecretRef(credentialId, ref) {
      const { error } = await sb
        .from("client_credentials")
        .update({ secret_ref: ref, updated_at: new Date().toISOString() })
        .eq("id", credentialId);
      return error ? error.message : null;
    },
    async deleteCredential(credentialId) {
      const { error } = await sb.from("client_credentials").delete().eq("id", credentialId);
      return error ? error.message : null;
    },
    putSecret,
    deleteSecret,
  };
}

/**
 * Vault the admin password and return a provisioning note that is safe to persist anywhere.
 * Best-effort like wireClientToContentTools: failure yields a WARN note, never the password.
 * Note text must not start with "Admin:" — the legacy redactors in build/runs + trigger-build
 * rewrite any such note to "Admin: admin / [redacted]", which would drop the credential id.
 */
export async function vaultStagingAdminPassword(
  args: {
    organizationId: string | undefined;
    siteId: string;
    slug: string;
    stagingSiteUrl: string;
    adminUser: string;
    password: string;
  },
  deps: StagingAdminVaultDeps | null = defaultStagingAdminVaultDeps(),
): Promise<string> {
  const reset = `reset with: wp user update ${args.adminUser} --user_pass=<new> --path=<wpRoot>`;
  if (!args.organizationId) return `WARN admin password not vaulted: no organizationId; ${reset}`;
  if (!deps) return `WARN admin password not vaulted: no DB client; ${reset}`;
  let credentialId: string | null = null;
  try {
    const ins = await deps.insertCredential({
      client_id: args.organizationId,
      category: "hosting",
      label: `WordPress staging admin (${args.slug})`,
      identifier: args.adminUser,
      note: args.stagingSiteUrl,
      metadata: { source: "provision-staging", site_id: args.siteId, staging_url: args.stagingSiteUrl },
    });
    if ("error" in ins) return `WARN admin password not vaulted: credential insert failed (${ins.error}); ${reset}`;
    credentialId = ins.id;
    const ref = clientCredSecretRef(credentialId);
    await deps.putSecret(ref, args.password);
    const attachErr = await deps.attachSecretRef(credentialId, ref);
    if (attachErr) {
      const orphan = await compensate(deps, credentialId);
      return `WARN admin password not vaulted: secret_ref attach failed (${attachErr})${orphan}; ${reset}`;
    }
    return `Admin password vaulted: client_credentials ${credentialId} (user ${args.adminUser})`;
  } catch (e) {
    // secret-vault errors never echo the value (secret-vault.ts header); still scrub + cap length.
    // putSecret may have committed before throwing (timeout after RPC), so compensate the vault too.
    const orphan = credentialId ? await compensate(deps, credentialId) : "";
    const msg = (e instanceof Error ? e.message : String(e)).split(args.password).join("[redacted]");
    return `WARN admin password not vaulted: ${msg.slice(0, 200)}${orphan}; ${reset}`;
  }
}

/** Remove the vault entry + row; returns "" or an orphan marker for the note. */
async function compensate(deps: StagingAdminVaultDeps, credentialId: string): Promise<string> {
  const leftovers: string[] = [];
  try { await deps.deleteSecret(clientCredSecretRef(credentialId)); } catch { leftovers.push(`vault ${clientCredSecretRef(credentialId)}`); }
  let rowErr: string | null;
  try { rowErr = await deps.deleteCredential(credentialId); } catch (e) { rowErr = e instanceof Error ? e.message : String(e); }
  if (rowErr) leftovers.push(`client_credentials ${credentialId}`);
  return leftovers.length ? ` [orphan: ${leftovers.join(", ")}]` : "";
}
