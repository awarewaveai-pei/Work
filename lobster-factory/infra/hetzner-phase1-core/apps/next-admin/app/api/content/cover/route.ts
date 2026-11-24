// POST /api/content/cover (K25): { title, subtitle?, settings?, imageUrl } -> { ok, imageUrl } -- the article page's
// cover laid on its picture and stored, so the publish sends one https featured image. Same gate and same picture rule
// as /api/content/cover-preview (which draws without storing); the picture is required here. Free: no AI call.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import { parseCoverSettings } from "@/lib/content/cover/settings";
import { readCoverBackground, storeCover } from "@/lib/content/cover/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export const POST = withFeature("content.image", handlePost);
async function handlePost(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "invalid_json"); }
  if (!body || typeof body !== "object") return fail(400, "invalid_json");

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return fail(400, "title_required");
  const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim().slice(0, 300) : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!imageUrl) return fail(400, "image_required");
  const bg = await readCoverBackground(imageUrl);
  if (!bg.ok) return fail((bg as { status: number }).status, (bg as { error: string }).error);   // strict:false

  try {
    return NextResponse.json({ ok: true, imageUrl: await storeCover(bg.buffer, { title, subtitle }, parseCoverSettings(body.settings)) });
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "cover_failed");
  }
}
