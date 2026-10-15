// /api/social/lists -- rotation lists (Metricool autolists; materialised into posts by C7's social-rotation task)
//   GET  ?brand            the brand's lists with their accounts
//   POST { brand, name, weekdays[1..7], send_time "HH:MM", active, account_ids[] }
import { ANY_ROLE, WRITE_ROLES, requireBrandRole } from "@/lib/social/authz";
import { handle, jsonBody, uuid } from "@/lib/social/http";
import { parseListInput } from "@/lib/social/lists";
import { listLists, saveList } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    return { lists: await listLists(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    return { id: await saveList(brand, null, parseListInput(body)) };
  });
}
