// POST /api/content/cover-preview (K24): { title, subtitle?, settings?, imageUrl? } -> the article cover as image/webp.
// Same gate as /api/content/image (withFeature content.image + canCreateAiImageJob). Free: no AI call, no billing.
// imageUrl is a data: image or one of OUR designs-bucket objects (lib/content/cover/store.ts readCoverBackground): this
// route never fetches a caller-given address. No imageUrl -> a generated neutral picture. Nothing is stored
// (/api/content/cover stores the one a publish uses).
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import { renderCover, neutralCoverBackground } from "@/lib/content/cover/render";
import { parseCoverSettings } from "@/lib/content/cover/settings";
import { readCoverBackground } from "@/lib/content/cover/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!imageUrl) background = await neutralCoverBackground();
  else {
    const bg = await readCoverBackground(imageUrl);
    if (!bg.ok) return fail((bg as { status: number }).status, (bg as { error: string }).error);   // strict:false
    background = bg.buffer;
  }

  try {
    const out = await renderCover(background, { title, subtitle }, parseCoverSettings(body.settings));
    return new NextResponse(new Uint8Array(out.buffer), { status: 200, headers: { "content-type": out.mime, "cache-control": "no-store" } });
  } catch {
    return fail(400, "image_unreadable");
  }
}
