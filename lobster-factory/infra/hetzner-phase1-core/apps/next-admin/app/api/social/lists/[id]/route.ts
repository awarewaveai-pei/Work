// /api/social/lists/[id]
//   GET     ?brand -> the list, its items in order (rotation posts), and what it has put on the calendar
//   PUT     { brand, name, weekdays, send_time, active, account_ids } -> replaces the list and its account set; the save
//           withdraws its unsent materialised posts (0101) and the list is materialised again from what was saved
//   DELETE  ?brand -> refused (409) while the list still holds items; its unsent materialised posts are withdrawn
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { handle, jsonBody, uuid } from "@/lib/social/http";
import { parseListInput } from "@/lib/social/lists";
import { deleteList, listQueue, materializeList } from "@/lib/social/rotation";
import { listLists, saveList, SocialStoreError } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    const list = (await listLists(brand)).find((l) => l.id === id);
    if (!list) throw new SocialStoreError(404, "no such list in this brand");
    return { list, ...(await listQueue(brand, id)) };
  });
}

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    await saveList(brand, id, parseListInput(body), actorOf(req));
    return { id, materialized: await materializeList(brand, id) };
  });
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    await deleteList(brand, id, actorOf(req));
    return {};
  });
}
