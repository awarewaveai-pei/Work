// /api/social/lists -- rotation lists (Metricool autolists; C7, lib/social/rotation.ts, migration 0101)
//   GET  ?brand            the brand's lists with their accounts
//   POST { brand, name, weekdays[1..7], send_time "HH:MM", active, account_ids[] } -> the new list, materialised now
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { handle, jsonBody, uuid } from "@/lib/social/http";
import { parseListInput } from "@/lib/social/lists";
import { materializeList } from "@/lib/social/rotation";
import { listLists, saveList } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { lists: await listLists(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const id = await saveList(brand, null, parseListInput(body), actorOf(req));
    return { id, materialized: await materializeList(brand, id) };
  });
}
