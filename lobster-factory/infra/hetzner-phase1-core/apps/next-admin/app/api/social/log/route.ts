// GET /api/social/log?brand[&before=<id>][&limit=50] -- the brand's audit log, newest first (append-only, 0096).
import { ANY_ROLE, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, uuid } from "@/lib/social/http";
import { listLog } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    const before = q.get("before");
    if (before !== null && !/^\d+$/.test(before)) throw new BadRequest("before must be a log id");
    const limit = Number(q.get("limit") ?? 50);
    return { log: await listLog(brand, before ? Number(before) : null, Number.isFinite(limit) ? limit : 50) };
  });
}
