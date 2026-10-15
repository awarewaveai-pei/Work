// GET /api/social/brands -- the brands this caller may open, with the role they hold there (lib/social/authz.ts).
import { callerOf, roleOn } from "@/lib/social/authz";
import { handle } from "@/lib/social/http";
import { listBrands } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const caller = await callerOf(req);
    if (!caller) return { brands: [] };
    // a client sees its own organization and the brands it is a member of; a client bound to neither sees none
    const ids = caller.kind === "client" ? [...new Set([...(caller.orgId ? [caller.orgId] : []), ...caller.members.keys()])] : null;
    const brands = await listBrands(ids);
    return { brands: brands.map((b) => ({ ...b, role: roleOn(caller, b.id) })).filter((b) => b.role) };
  });
}
