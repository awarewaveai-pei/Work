// The 給／收產品 decision for one form post (ADR 017 4b-10). Not a "use server" module on purpose: every export of one is
// a client-callable endpoint, and this takes the request headers it trusts as an argument (entitlement-actions.ts
// passes the real ones).
import { canWriteTenantConfig, readOpsRole } from "@/lib/ops-role";
import { staffGrantOf, staffMayUseTool, staffUnrestricted } from "@/lib/staff-access";
import { requestActor, resolveSubject } from "@/lib/entitlements/subject";
import { giveProduct, takeProduct, STAFF_GRANT_KINDS, type StaffGrantChange } from "@/lib/entitlements/staff-grants";
import { PRODUCTS } from "@/lib/portal/products";
import { HUB_TAB_TOOL } from "./hub-tab-tools";

const GIFTS = /^staff:[0-9a-f-]{36}(?:,staff:[0-9a-f-]{36}){0,19}$/;

export const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

/** The 帳務 tab's 給／收產品 form: a checkbox per product (use) and per licence (resell); `was:<kind>:<product>` is the
 *  state the page showed, so only boxes the staff member changed are written (a stale page never undoes another's
 *  change). Owner or admin only, and only with the 帳務 tool. Returns the redirect query. */
export async function staffGrantOutcome(form: FormData, h: Headers): Promise<URLSearchParams> {
  const q = new URLSearchParams();
  const req = new Request("http://localhost", { headers: h });
  const role = readOpsRole(req);
  const grant = staffGrantOf(h);
  if (!canWriteTenantConfig(role) || (!staffUnrestricted(grant) && !staffMayUseTool(grant!, HUB_TAB_TOOL["帳務"]))) {
    q.set("r", "forbidden");
    return q;
  }
  const changes: Array<Pick<StaffGrantChange, "productKey" | "kind" | "sourceRefs"> & { give: boolean }> = [];
  for (const p of PRODUCTS) for (const kind of STAFF_GRANT_KINDS) {
    // was = "0" (shown unticked) or the gifts shown ticked; anything else -- not on the page, disabled there, or
    // malformed -- is never read as unticked.
    const was = form.get(`was:${kind}:${p.key}`);
    const gifts = typeof was === "string" && GIFTS.test(was) ? was.split(",") : null;
    if (was !== "0" && !gifts) continue;
    const now = form.get(`${kind}:${p.key}`) === "on";
    if (now !== !!gifts) changes.push({ productKey: p.key, kind, give: now, ...(gifts ? { sourceRefs: gifts } : {}) });
  }
  if (!changes.length) {
    q.set("r", "nothing_changed");
    return q;
  }
  const note = text(form, "note").trim();
  if (!note || note.length > 200) {
    q.set("r", "note_required");
    return q;
  }
  // The billing account (a brand's root): can() reads that account's rows, so the gift goes there too.
  const account = await resolveSubject({ slug: text(form, "slug") }).catch(() => null);
  if (!account) {
    q.set("r", "account_not_found");
    return q;
  }
  if (account.kind !== "customer") {
    q.set("r", "internal_account");
    return q;
  }
  let given = 0, taken = 0, skipped = 0;
  for (const c of changes) {
    const change = { accountId: account.orgId, productKey: c.productKey, kind: c.kind, sourceRefs: c.sourceRefs, actor: requestActor(req), actorRole: role, note };
    const outcome = await (c.give ? giveProduct(change) : takeProduct(change)).catch((e: unknown) => {
      console.error(`[staff-grants] ${c.give ? "give" : "take"} ${c.kind} ${c.productKey}: ${e instanceof Error ? e.message : String(e)}`);
      return "db_error";
    });
    if (outcome === "given") given++;
    else if (outcome === "taken") taken++;
    else if (outcome === "already" || outcome === "nothing_to_take") skipped++;   // someone already did it
    else {
      q.set("r", outcome);
      q.set("p", c.productKey);
      break;
    }
  }
  if (!q.has("r")) q.set("r", "saved");
  q.set("g", String(given));
  q.set("t", String(taken));
  q.set("s", String(skipped));
  return q;
}
