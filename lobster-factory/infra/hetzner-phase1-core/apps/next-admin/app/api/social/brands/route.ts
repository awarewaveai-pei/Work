// GET /api/social/brands -- the brands this caller may open, with the role they hold there (lib/social/authz.ts).
// A client: its own organization and its member brands. Staff (every organization is a brand): the first page,
// ?q= = name or slug contains q, ?id= = that one brand (a link that names it). total = how many the first page was cut from.
import { callerOf, roleOn } from "@/lib/social/authz";
import { handle } from "@/lib/social/http";
import { listBrands, searchBrands } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const caller = await callerOf(req);
    if (!caller) return { brands: [], total: 0 };
    const withRole = (list: Awaited<ReturnType<typeof listBrands>>) =>
      list.map((b) => ({ ...b, role: roleOn(caller, b.id) })).filter((b) => b.role);
    // a client sees its own organization and the brands it is a member of; a client bound to neither sees none
    if (caller.kind === "client") {
      const brands = withRole(await listBrands([...new Set([...(caller.orgId ? [caller.orgId] : []), ...caller.members.keys()])]));
      return { brands, total: brands.length };
    }
    const params = new URL(req.url).searchParams;
    const id = params.get("id");
    if (id) {
      const brands = withRole(await listBrands([id]));
      return { brands, total: brands.length };
    }
    const { brands, total } = await searchBrands(params.get("q"));
    return { brands: withRole(brands), total };
  });
}
