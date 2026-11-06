// A client's own Gemini key (Connectors page, connector "gemini") serves every outreach AI step, so each client brings its
// own daily quota. No client key (or it is refused / out of quota) = the platform key, the same client -> platform order as
// generation (generate.ts). The agency's "gemini" row is not read here: the agency fallback is the platform env key.
// SECURITY: never log the key; a vault error is reported without its text.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCheapJsonText, type CheapJsonTextResult } from "@/lib/ai/cheap-json";
import type { Grant } from "@/lib/entitlements/can";
import { billedOrgId } from "@/lib/ai/log-ai-call";
import { connectorSecretRef, getSecret } from "@/lib/secret-vault";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { key: string | null; exp: number }>();

export function resetOrgAiKeyCache(): void { cache.clear(); }

export async function outreachGeminiKey(db: SupabaseClient, organizationId: string): Promise<string | null> {
  const hit = cache.get(organizationId);
  if (hit && hit.exp > Date.now()) return hit.key;
  let key: string | null = null;
  try {
    const { data } = await db.from("co_connector_accounts").select("id").eq("connector_name", "gemini").eq("is_enabled", true)
      .not("credentials_ref", "is", null).eq("organization_id", organizationId).limit(1).maybeSingle();
    // The vault name is derived from the row id, never read from it (generate.ts pickRef).
    const id = (data as { id?: string } | null)?.id;
    key = id ? ((await getSecret(connectorSecretRef(id)))?.trim() || null) : null;
  } catch {
    console.warn("outreach-ai-key: vault read failed, using the platform key");
  }
  cache.set(organizationId, { key, exp: Date.now() + TTL_MS });
  return key;
}

const KEY_REFUSED = new Set(["gemini_429_daily_quota", "gemini_key_invalid", "gemini_403"]);

/** generateCheapJsonText on the lead's organization's own Gemini key; the platform key when it has none or it is refused. */
export async function outreachJson(db: SupabaseClient | null, args: Parameters<typeof generateCheapJsonText>[0]): Promise<CheapJsonTextResult> {
  const orgId = billedOrgId(args.grant as Grant);
  const key = db && orgId ? await outreachGeminiKey(db, orgId) : null;
  if (!key) return generateCheapJsonText(args);
  const r = await generateCheapJsonText({ ...args, apiKey: key });
  return r.ok === false && KEY_REFUSED.has(r.error) ? generateCheapJsonText(args) : r;
}
