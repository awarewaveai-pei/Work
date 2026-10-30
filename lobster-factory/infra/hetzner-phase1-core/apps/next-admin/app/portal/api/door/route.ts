// POST /portal/api/door -- a signed-in portal client presses 開啟 / 我的作品 on the launcher; we mint the one-time
// sign-in link for that product's door (lib/auth/door-link.ts, same checks as wp-handoff) and 303 the browser to it.
// POST only: a GET link would be burned by a link pre-fetcher. Every refusal is a 303 back to the launcher with ?door=<code>
// (a relative Location under /portal: right with nginx's idempotent rewrite and without it).
import { holdsProduct } from "@/lib/entitlements/door-holds";
import { mintDoorLink } from "@/lib/auth/door-link";
import { productHost, servedNextAdminProducts } from "@/lib/portal/doors";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PortalAccessError, requireClientOrg } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const see = (location: string): Response => new Response(null, { status: 303, headers: { Location: location } });
const refuse = (code: string): Response => see(`/portal/launcher?door=${code}`);

export async function POST(req: Request): Promise<Response> {
  let orgId: string;
  try {
    ({ orgId } = requireClientOrg(req));
  } catch (e) {
    if (e instanceof PortalAccessError) return refuse("not_a_client");
    throw e;
  }
  const userId = req.headers.get("x-ops-user-id")?.trim();
  if (!userId) return refuse("not_a_client");
  let form: FormData;
  try { form = await req.formData(); } catch { return refuse("unknown_product"); }
  const productKey = form.get("product_key");
  const product = servedNextAdminProducts().find((p) => p.key === productKey);
  if (!product) return refuse("unknown_product");
  try {
    if (!(await holdsProduct({ organizationId: orgId, productKey: product.key, now: Math.floor(Date.now() / 1000) }))) return refuse("product_not_held");
    // next goes into the door's fragment and then to window.location.replace: only the door's own menu pages qualify
    const allowed = ["/", ...(product.door.nav ?? []).map((n) => "/" + n.path)];
    const asked = form.get("next");
    const next = typeof asked === "string" && allowed.includes(asked) ? asked : "/";
    const db = getSupabaseWriteClient();
    if (!db) return refuse("auth_unavailable");
    const out = await mintDoorLink(db, { userId, organizationId: orgId }, productHost(product), next);
    if (out.ok === false) return refuse(out.error);
    return see(out.url);
  } catch (error) {
    console.error("[portal/api/door] failed", String(error).slice(0, 200));
    return refuse("auth_unavailable");
  }
}
