// Can a customer pay on aware-wave.com now? = aware-wave.com's own seller_sites row is active (lib/payments/sites.ts; the
// row's status is the one switch the payment and hand-off routes already refuse on, `site_disabled`). A missing client,
// a missing row or a failed read all mean no: the wallet page then says to contact us instead of linking to a closed shop.
import { AWARE_WAVE_KEY_ID, findSiteByKeyId } from "@/lib/payments/sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export async function canTopUp(): Promise<boolean> {
  try {
    const db = getSupabaseWriteClient();
    if (!db) return false;
    return (await findSiteByKeyId(db, AWARE_WAVE_KEY_ID))?.status === "active";
  } catch {
    return false;
  }
}
