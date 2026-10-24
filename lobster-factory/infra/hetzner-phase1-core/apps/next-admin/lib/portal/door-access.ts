// Every feature is bought separately or given by us (operator 2026-10-24): a customer enters a product door only when
// its account holds an active row (contract or comp) of that product. Staff pass: they operate for customers.
// Points do not open a door. Inside, each paid button still asks can() for its feature.
import { userKindOf } from "@/lib/tenant-guard";
import { holdsProduct } from "@/lib/entitlements/door-holds";

export type DoorAccess = "open" | "not_held" | "unavailable";
type Holds = typeof holdsProduct;

export async function doorAccess(headers: Headers, productKey: string, holds: Holds = holdsProduct,
  now = Math.floor(Date.now() / 1000)): Promise<DoorAccess> {
  if (userKindOf(headers) !== "client") return "open";
  const organizationId = (headers.get("x-ops-org-id") ?? "").trim();
  if (!organizationId) return "not_held";
  try {
    return (await holds({ organizationId, productKey, now })) ? "open" : "not_held";
  } catch (error) {
    console.error(`[door] ${productKey}: holdsProduct failed: ${String(error).slice(0, 200)}`);
    return "unavailable";
  }
}
