// /api/social/lists/[id]
//   PUT     { brand, name, weekdays, send_time, active, account_ids } -> replaces the list and its account set
//   DELETE  ?brand -> refused (409) while the list still holds rotation posts (0096; C7 removes them first)
import { WRITE_ROLES, requireBrandRole } from "@/lib/social/authz";
import { handle, jsonBody, uuid } from "@/lib/social/http";
import { parseListInput } from "@/lib/social/lists";
import { deleteList, saveList } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    return { id: await saveList(brand, id, parseListInput(body)) };
  });
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    await deleteList(brand, id);
    return {};
  });
}
