// /api/social/media
//   GET  ?brand                              the brand's media, newest first
//   POST { brand, imageUrl|videoUrl, fileName } uploaded through Postiz and recorded for the brand
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { addImage, addVideo, listMedia } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    return { media: await listMedia(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    const fileName = typeof body.fileName === "string" && /^[\w.\- ]{1,255}$/.test(body.fileName) ? body.fileName : "image.webp";
    if (typeof body.imageUrl === "string") {
      if (!/^(https:\/\/|data:image\/)/.test(body.imageUrl)) throw new BadRequest("imageUrl must be an https URL or a data:image URL");
      return { media: await addImage(brand, body.imageUrl, fileName, actorOf(req)) };
    }
    if (typeof body.videoUrl !== "string" || !/^(https:\/\/|data:video\/[^;,]+;base64,)/.test(body.videoUrl)) throw new BadRequest("videoUrl must be an https URL or a base64 data:video URL");
    return { media: await addVideo(brand, body.videoUrl, fileName === "image.webp" ? "video.mp4" : fileName, actorOf(req)) };
  });
}
