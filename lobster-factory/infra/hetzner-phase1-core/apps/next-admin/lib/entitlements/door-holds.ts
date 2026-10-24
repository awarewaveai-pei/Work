// Whether an organization holds a product: any active, current row (contract or comp) of it in
// organization_entitlements (service-role-only since 0110). The one service-role read a door page makes, and only for
// the caller's own organization (lib/portal/door-access.ts passes x-ops-org-id, which middleware sets).
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export async function holdsProduct({ organizationId, productKey, now }: { organizationId: string; productKey: string; now: number }): Promise<boolean> {
  const db = getSupabaseWriteClient();
  if (!db) throw new Error("entitlements_db_unavailable");
  const time = new Date(now * 1000).toISOString();
  const { data, error } = await db.from("organization_entitlements").select("id")
    .eq("organization_id", organizationId).eq("product_key", productKey).eq("status", "active").lte("starts_at", time)
    .or(`ends_at.is.null,ends_at.gt.${time}`).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
