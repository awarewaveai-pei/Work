// /api/social/texts -- a brand's saved texts (the editor's 常用文字; table social_saved_texts, 0096)
//   GET     ?brand
//   POST    { brand, body, mediaIds? }  1..10000 characters; mediaIds stay in order
//   DELETE  ?brand&id
import { ANY_ROLE, WRITE_ROLES, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { addText, deleteText, listTexts } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { texts: await listTexts(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    if (typeof body.body !== "string" || !body.body.trim() || body.body.length > 10000) throw new BadRequest("body must be 1..10000 characters");
    const rawMediaIds = body.mediaIds;
    if (rawMediaIds !== undefined && (!Array.isArray(rawMediaIds) || rawMediaIds.length > 50)) throw new BadRequest("mediaIds must be an array of at most 50 ids");
    const mediaIds = Array.isArray(rawMediaIds) ? rawMediaIds.map((id: unknown) => uuid(id, "mediaIds")) : [];
    if (new Set(mediaIds).size !== mediaIds.length) throw new BadRequest("mediaIds must be unique");
    return { text: await addText(brand, body.body.trim(), mediaIds) };
  });
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    await deleteText(brand, uuid(q.get("id"), "id"));
    return {};
  });
}
