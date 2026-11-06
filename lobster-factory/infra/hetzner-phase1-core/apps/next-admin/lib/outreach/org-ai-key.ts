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
// Per database, then per organization: the main database and a client's own project can hold the same organization id
// with different connectors (Codex 2026-11-06 069b4239).
let cache = new WeakMap<SupabaseClient, Map<string, { key: string | null; exp: number }>>();

export function resetOrgAiKeyCache(): void { cache = new WeakMap(); }

/** The organization's own enabled Gemini key in the database that holds its connectors; null = it has none. A query or
 *  vault error throws: the caller uses the platform key for this call and nothing is cached. */
export async function outreachGeminiKey(db: SupabaseClient, organizationId: string): Promise<string | null> {
  let perDb = cache.get(db);
  if (!perDb) { perDb = new Map(); cache.set(db, perDb); }
  const hit = perDb.get(organizationId);
  if (hit && hit.exp > Date.now()) return hit.key;
  const { data, error } = await db.from("co_connector_accounts").select("id").eq("connector_name", "gemini").eq("is_enabled", true)
    .not("credentials_ref", "is", null).eq("organization_id", organizationId).limit(1).maybeSingle();
  if (error) throw new Error("connector read failed");
  // The vault name is derived from the row id, never read from it (generate.ts pickRef).
  const id = (data as { id?: string } | null)?.id;
  const key = id ? ((await getSecret(connectorSecretRef(id)))?.trim() || null) : null;
  perDb.set(organizationId, { key, exp: Date.now() + TTL_MS });
  return key;
}

/** Whose key an outreach AI step may use: `db` is the database the caller reads that organization's lead / reply from
 *  (a client with its own project keeps its connectors there); `organizationId` is the organization the lead or reply
 *  belongs to. null for either = the platform key. */
export interface AiScope { db: SupabaseClient | null; organizationId: string | null }

async function scopeKey(scope: AiScope | undefined, grant: Grant | undefined): Promise<string | null> {
  if (!scope?.db) return null;
  // The acting organization first (generate.ts pickRef), then the account that is billed (a child org without its own key).
  const orgs = [...new Set([scope.organizationId, billedOrgId(grant as Grant)].filter((o): o is string => !!o))];
  try {
    for (const o of orgs) { const k = await outreachGeminiKey(scope.db, o); if (k) return k; }
  } catch {
    console.warn("outreach-ai-key: key lookup failed, using the platform key");
  }
  return null;
}

const KEY_REFUSED = new Set(["gemini_429_daily_quota", "gemini_key_invalid", "gemini_403"]);

/** generateCheapJsonText on the lead's own Gemini key; the platform key when it has none or it is refused. */
export async function outreachJson(scope: AiScope | undefined, args: Parameters<typeof generateCheapJsonText>[0]): Promise<CheapJsonTextResult> {
  const key = await scopeKey(scope, args.grant);
  if (!key) return generateCheapJsonText(args);
  const r = await generateCheapJsonText({ ...args, apiKey: key });
  return r.ok === false && KEY_REFUSED.has(r.error) ? generateCheapJsonText(args) : r;
}
