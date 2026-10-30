// The served doors an account holds, by the same check each door makes (holdsProduct, lib/portal/door-access.ts), so a
// list of doors (portal launcher, the staff invite form) never disagrees with the door itself. Kept out of door-access.ts:
// every door page imports that file, and lib/portal/__tests__/registry-code.test.ts reads what door pages import.
import { holdsProduct } from "@/lib/entitlements/door-holds";
import { servedNextAdminProducts, type NextAdminProduct } from "./doors";

/** Asked per door, not one read of every row (an all-features account has hundreds, past PostgREST's row cap).
 *  Throws when the entitlement read fails. */
export async function heldDoors(organizationId: string, holds: typeof holdsProduct = holdsProduct,
  now = Math.floor(Date.now() / 1000)): Promise<NextAdminProduct[]> {
  const served = servedNextAdminProducts();
  const held = await Promise.all(served.map((p) => holds({ organizationId, productKey: p.key, now })));
  return served.filter((_, i) => held[i]);
}
