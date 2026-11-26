// The unit's manager = the app account holding the unit's member link (ADR 021 D5; customer_identities, one per unit
// since 0182). The one place this is decided: /portal/api/account, /portal/api/people and the product doors' frame
// (app/PlatformFrame.tsx, the phone bar's 成員) all import it. On a product door it is one of the service-role reads the
// door may make (lib/portal/__tests__/registry-code.test.ts DOOR_OWN_ORG_READS): only the caller's own organization and
// user id (x-ops-org-id / x-ops-user-id, set by middleware), pinned by __tests__/account-manager.test.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

/** Fails closed: a failed or empty lookup reads as "not the manager" (a screen shows less, never more). */
export async function isAccountManager(db: SupabaseClient, organizationId: string, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("customer_identities")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

/** The signed-in customer's own answer, for a page that has only the request headers (the door frame). No client, no
 *  ids, or any error = false. */
export async function callerManagesUnit(organizationId: string | null | undefined, userId: string | null | undefined): Promise<boolean> {
  const db = getSupabaseWriteClient();
  const user = userId?.trim();
  if (!db || !organizationId || !user) return false;
  try {
    return await isAccountManager(db, organizationId, user);
  } catch {
    return false;
  }
}
