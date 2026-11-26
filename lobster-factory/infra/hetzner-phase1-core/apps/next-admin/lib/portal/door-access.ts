// Every feature is bought separately or given by us (operator 2026-10-24): a customer enters a product door only when
// its account holds an active row (contract or comp) of that product. Staff pass: they operate for customers.
// Points do not open a door. Inside, each paid button still asks can() for its feature.
import { userKindOf } from "@/lib/tenant-guard";
import { holdsProduct } from "@/lib/entitlements/door-holds";

export type DoorAccess = "open" | "not_held" | "unavailable";
type Holds = typeof holdsProduct;

// middleware.ts asks this for every customer API call: a page firing a dozen calls must not become a dozen PostgREST
// reads through the Cloudflare-fronted host (the 06-14 rate-limit cause, lib/supabase/session-cache.ts). A held product
// is remembered a minute, a refusal or a failed lookup a few seconds, so a purchase opens the door almost at once.
const HELD_MS = 60_000;
const NOT_HELD_MS = 10_000;
const FAILED_MS = 5_000;
const MAX_ENTRIES = 5_000;
const remembered = new Map<string, { access: DoorAccess; until: number }>();
// A page's calls arrive together, before the first lookup returns: they share that one lookup.
const inFlight = new Map<string, Promise<DoorAccess>>();
// Bumped by forgetDoorAccessFor: a lookup that started before the account's rights changed answers its caller but is
// neither remembered nor shared with later calls.
const epochs = new Map<string, number>();
/** Tests only. */
export function forgetDoorAccess(): void { remembered.clear(); inFlight.clear(); epochs.clear(); }
/** A payment changed this account's rights (U28): its next door check looks up again; other accounts keep theirs.
 *  In-memory, this module instance only (middleware.ts runs in its own edge sandbox, another container in its own process). */
export function forgetDoorAccessFor(organizationId: string): void {
  epochs.set(organizationId, (epochs.get(organizationId) ?? 0) + 1);
  for (const key of [...remembered.keys()]) if (key.startsWith(`${organizationId}:`)) remembered.delete(key);
  for (const key of [...inFlight.keys()]) if (key.startsWith(`${organizationId}:`)) inFlight.delete(key);
}

export async function doorAccess(headers: Headers, productKey: string, holds: Holds = holdsProduct,
  now = Math.floor(Date.now() / 1000)): Promise<DoorAccess> {
  if (userKindOf(headers) !== "client") return "open";
  const organizationId = (headers.get("x-ops-org-id") ?? "").trim();
  if (!organizationId) return "not_held";
  const key = `${organizationId}:${productKey}`;
  const at = Date.now();
  const hit = remembered.get(key);
  if (hit && hit.until > at) return hit.access;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const epoch = epochs.get(organizationId) ?? 0;
  const lookup = (async (): Promise<DoorAccess> => {
    let access: DoorAccess;
    try {
      access = (await holds({ organizationId, productKey, now })) ? "open" : "not_held";
    } catch (error) {
      console.error(`[door] ${productKey}: holdsProduct failed: ${String(error).slice(0, 200)}`);
      access = "unavailable";
    }
    if ((epochs.get(organizationId) ?? 0) !== epoch) return access;
    if (remembered.size >= MAX_ENTRIES) remembered.clear();
    remembered.set(key, { access, until: Date.now() + (access === "open" ? HELD_MS : access === "not_held" ? NOT_HELD_MS : FAILED_MS) });
    return access;
  })().finally(() => { if (inFlight.get(key) === lookup) inFlight.delete(key); });
  inFlight.set(key, lookup);
  return lookup;
}

/** The same rule for a door's APIs: a customer calls them only while holding the product, so an expired account cannot
 *  keep using a door it may no longer open. middleware.ts asks this once for every API request on a product door; no
 *  route repeats it. null = pass. */
export async function doorApiDenial(headers: Headers, productKey: string, holds: Holds = holdsProduct):
  Promise<{ status: 403 | 503; error: "product_not_held" | "entitlements_unavailable" } | null> {
  const access = await doorAccess(headers, productKey, holds);
  if (access === "open") return null;
  return access === "not_held" ? { status: 403, error: "product_not_held" } : { status: 503, error: "entitlements_unavailable" };
}
