// Per-org Supabase client resolver.
// Breaks the circular-import that would arise if getOrgSupabaseWriteClient lived in
// supabase-server.ts (which secret-vault.ts already imports from).
//
// Vault key convention (set once per client onboarding):
//   putSecret(orgSupabaseRef(slug,'url'), 'https://<ref>.supabase.co')
//   putSecret(orgSupabaseRef(slug,'key'), '<service_role_key>')
//
// When no org-specific credentials exist, falls back to the agency write client.
// This means existing single-tenant routes work unchanged — orgSlug is always optional.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getSecret, orgSupabaseRef } from "@/lib/secret-vault";

export async function getOrgSupabaseWriteClient(
  orgSlug: string | null | undefined,
): Promise<SupabaseClient | null> {
  if (!orgSlug) return getSupabaseWriteClient();
  try {
    const [url, key] = await Promise.all([
      getSecret(orgSupabaseRef(orgSlug, "url")),
      getSecret(orgSupabaseRef(orgSlug, "key")),
    ]);
    if (!url || !key) return getSupabaseWriteClient();
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    return getSupabaseWriteClient();
  }
}
