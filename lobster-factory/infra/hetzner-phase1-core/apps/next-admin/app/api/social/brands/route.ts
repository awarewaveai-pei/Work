// GET /api/social/brands -- the brands this caller may open, with the role they hold there (lib/social/authz.ts).
import { resolveTenant } from "@/lib/tenant-guard";
import { brandRole } from "@/lib/social/authz";
import { handle } from "@/lib/social/http";
import { listBrands } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const tenant = resolveTenant(req);
    if (tenant.userKind === "client" && !tenant.orgId) return { brands: [] };   // a client account bound to no brand
    const brands = await listBrands(tenant.userKind === "client" ? tenant.orgId : null);
    return { brands: brands.map((b) => ({ ...b, role: brandRole(req, b.id) })).filter((b) => b.role) };
  });
}
