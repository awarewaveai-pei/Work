// Per-org Supabase client resolver.
// Breaks the circular-import that would arise if getOrgSupabaseWriteClient lived in
// supabase-server.ts (which secret-vault.ts already imports from).
//
// Resolution order (first hit wins):
//  1. Explicit vault keys set via outreach-config API:
//       org:{slug}:supabase_url  /  org:{slug}:supabase_key
//  2. Credentials library (client_credentials table) — automatic bridge:
//       URL row  = identifier contains ".supabase.co"  OR  label ilike "%supabase%url%"
//       Key row  = any other row with label ilike "%supabase%" (not the URL row)
//  3. Agency write client fallback (single-tenant mode).
//
// This means credentials already stored in 憑證庫 are automatically used for outreach
// without needing a separate entry in the outreach-config UI.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getSecret, orgSupabaseRef } from "@/lib/secret-vault";

// secret_ref is nullable when identifier itself IS the value (e.g. a public project URL).
type CredRow = { label: string; identifier: string | null; secret_ref: string | null };

async function resolveFromCredentialsLib(orgSlug: string): Promise<{ url: string; key: string } | null> {
  const agency = getSupabaseWriteClient();
  if (!agency) return null;
  try {
    const { data: org } = await agency.from("organizations").select("id").eq("slug", orgSlug).maybeSingle();
    if (!org) return null;
    // Include rows where secret_ref IS null — URL rows store the value directly in identifier.
    const { data: rows } = await agency
      .from("client_credentials")
      .select("label, identifier, secret_ref")
      .eq("client_id", (org as { id: string }).id);
    if (!rows?.length) return null;
    const creds = rows as CredRow[];

    // URL row: identifier is the Supabase project URL itself, OR label signals "supabase"+"url".
    const urlRow = creds.find(
      c =>
        c.identifier?.includes(".supabase.co") ||
        (c.label.toLowerCase().includes("supabase") && c.label.toLowerCase().includes("url")),
    );

    // Key row: prefer service_role identifier (case-insensitive); fall back to any other
    // supabase-labelled row that isn't the anon/publishable tier.
    // Anon key lacks write access — service_role is required for outreach DB operations.
    const keyRow =
      creds.find(c => c !== urlRow && c.identifier?.toLowerCase() === "service_role") ??
      creds.find(
        c =>
          c !== urlRow &&
          c.label.toLowerCase().includes("supabase") &&
          !c.label.toLowerCase().includes("anon") &&
          !c.label.toLowerCase().includes("publishable"),
      );

    if (!urlRow || !keyRow) {
      console.warn("[org-client] resolveFromCredentialsLib: urlRow=%s keyRow=%s slug=%s", !!urlRow, !!keyRow, orgSlug);
      return null;
    }

    // URL may live directly in identifier (public project endpoint, not a vault secret).
    // Works for both managed (.supabase.co) and self-hosted Supabase instances.
    const url =
      urlRow.identifier?.startsWith("https://")
        ? urlRow.identifier
        : urlRow.secret_ref
          ? await getSecret(urlRow.secret_ref)
          : null;

    const key = keyRow.secret_ref ? await getSecret(keyRow.secret_ref) : null;
    if (!url || !key) return null;
    return { url, key };
  } catch (err) {
    console.warn("[org-client] resolveFromCredentialsLib threw for slug=%s:", orgSlug, err);
    return null;
  }
}

export async function getOrgSupabaseWriteClient(
  orgSlug: string | null | undefined,
): Promise<SupabaseClient | null> {
  if (!orgSlug) return getSupabaseWriteClient();

  // Fast path: explicit vault keys (set via outreach-config or onboarding).
  try {
    const [url, key] = await Promise.all([
      getSecret(orgSupabaseRef(orgSlug, "url")),
      getSecret(orgSupabaseRef(orgSlug, "key")),
    ]);
    if (url && key) return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    // vault unavailable — fall through to credentials library
  }

  // Fallback: credentials library (憑證庫) — auto-bridge, no duplicate entry needed.
  const fromLib = await resolveFromCredentialsLib(orgSlug);
  if (fromLib) {
    return createClient(fromLib.url, fromLib.key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  return getSupabaseWriteClient();
}

/** Exported for use by outreach-config GET to report the credentials source. */
export { resolveFromCredentialsLib };
