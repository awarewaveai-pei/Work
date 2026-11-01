// The database an outreach request reads and writes. Staff pick the client they operate for (?orgSlug=, the 代操
// switcher), which may route to that client's own Supabase (lib/org-client.ts). A customer on the outreach door is bound
// to one organization by middleware, so a slug in its request is ignored: it always gets its own organization's
// database. Without this, the slug alone could point a customer's writes at another client's project.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveTenant } from "@/lib/tenant-guard";

/** The org slug whose database this caller uses (null = the main database); undefined = a customer whose organization
 *  cannot be read, who gets no database at all. The OAuth state carries it so the callback opens the same one. */
export async function outreachSlug(req: Request, requestedSlug: string | null | undefined): Promise<string | null | undefined> {
  const tenant = resolveTenant(req);
  if (tenant.userKind !== "client") return requestedSlug?.trim() || null;
  if (!tenant.orgId) return undefined;
  const main = getSupabaseWriteClient();
  if (!main) return undefined;
  const { data, error } = await main.from("organizations").select("slug").eq("id", tenant.orgId).maybeSingle();
  if (error || !data) return undefined;
  return (data as { slug: string | null }).slug ?? null;
}

export async function outreachDb(req: Request, requestedSlug: string | null | undefined): Promise<SupabaseClient | null> {
  const slug = await outreachSlug(req, requestedSlug);
  return slug === undefined ? null : getOrgSupabaseWriteClient(slug);
}
