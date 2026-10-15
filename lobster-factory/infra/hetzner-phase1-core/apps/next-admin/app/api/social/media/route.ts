// /api/social/media
//   GET  ?brand                              the brand's media, newest first
//   POST { brand, imageUrl, fileName }       imageUrl = https URL or data: URL; uploaded through Postiz (uploadMedia's
//                                            SSRF guard and 10 MB cap apply), recorded for the brand
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { addImage, listMedia } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    return { media: await listMedia(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    if (typeof body.imageUrl !== "string" || !/^(https:\/\/|data:image\/)/.test(body.imageUrl)) throw new BadRequest("imageUrl must be an https URL or a data:image URL");
    const fileName = typeof body.fileName === "string" && /^[\w.\- ]{1,255}$/.test(body.fileName) ? body.fileName : "image.webp";
    return { media: await addImage(brand, body.imageUrl, fileName, actorOf(req)) };
  });
}
