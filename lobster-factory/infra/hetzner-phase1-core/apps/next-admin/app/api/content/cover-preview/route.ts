// POST /api/content/cover-preview (K24): { title, subtitle?, settings?, imageUrl? } -> the article cover as image/webp.
// Same gate as /api/content/image (withFeature content.image + canCreateAiImageJob). Free: no AI call, no billing.
// imageUrl is a data: image or one of OUR designs-bucket objects, read through the R2 API by key (getDesignObjectByUrl):
// this route never fetches a caller-given address. No imageUrl -> a generated neutral picture.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import { isDesignsAsset, getDesignObjectByUrl, parseImageDataUrl } from "@/lib/storage/r2";
import { renderCover, neutralCoverBackground } from "@/lib/content/cover/render";
import { parseCoverSettings } from "@/lib/content/cover/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 9_000_000;   // one big photo, as the image route's reference limit
const MAX_TITLE = 200;
const MAX_SUBTITLE = 300;

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export const POST = withFeature("content.image", handlePost);
async function handlePost(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "invalid_json"); }
  if (!body || typeof body !== "object") return fail(400, "invalid_json");

  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
  if (!title) return fail(400, "title_required");
  const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim().slice(0, MAX_SUBTITLE) : "";

  let background: Buffer;
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!imageUrl) {
    background = await neutralCoverBackground();
  } else if (imageUrl.startsWith("data:")) {
    if (imageUrl.length > MAX_IMAGE_BYTES * 1.4) return fail(413, "image_too_large");   // base64 ≈ 4/3 of the bytes
    const parsed = parseImageDataUrl(imageUrl);
    if (!parsed) return fail(400, "image_url_not_allowed");
    background = parsed.buffer;
  } else if (isDesignsAsset(imageUrl)) {
    const got = await getDesignObjectByUrl(imageUrl, MAX_IMAGE_BYTES);
    if (!got.ok) return fail(400, "image_unreadable");
    background = got.body;
  } else {
    return fail(400, "image_url_not_allowed");
  }
  if (background.length > MAX_IMAGE_BYTES) return fail(413, "image_too_large");

  try {
    const out = await renderCover(background, { title, subtitle }, parseCoverSettings(body.settings));
    return new NextResponse(new Uint8Array(out.buffer), { status: 200, headers: { "content-type": out.mime, "cache-control": "no-store" } });
  } catch {
    return fail(400, "image_unreadable");
  }
}
