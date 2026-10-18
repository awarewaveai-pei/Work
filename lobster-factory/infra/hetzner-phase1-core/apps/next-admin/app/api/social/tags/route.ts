// /api/social/tags -- a brand's tags (0105 social_tags; picked in the composer C21, filtered by in the calendar C22)
//   GET     ?brand
//   POST    { brand, id?, name, colour }   create (id absent) or rename / recolour; colour = a..e (a token key)
//   DELETE  ?brand&id                       off every post too
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { deleteTag, listTags, saveTag, type Tag } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLOURS: readonly Tag["colour"][] = ["a", "b", "c", "d", "e"];

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { tags: await listTags(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 40) throw new BadRequest("name must be 1..40 characters");
    if (!COLOURS.includes(body.colour as Tag["colour"])) throw new BadRequest(`colour must be one of ${COLOURS.join(", ")}`);
    return { id: await saveTag(brand, body.id == null ? null : uuid(body.id, "id"), name, body.colour as Tag["colour"], actorOf(req)) };
  });
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    await deleteTag(brand, uuid(q.get("id"), "id"), actorOf(req));
    return {};
  });
}
