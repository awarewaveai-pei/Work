// POST /api/video/social-drafts/text { organizationId, fields: { body, notes } }
//   腳本's 「送社群」 in the video workbench (video-unify-plan-20261116 §4 U3, D15): the text as one social draft of the
//   organization's brand, no channel and no media. The video door serves /api/video only (social is optional for video),
//   so it asks here; the check and the save are the social tool's own (lib/social/posts.ts createDraftPost). A customer
//   must also hold social: the same rule the social door makes (lib/portal/door-access.ts), which this door does not ask.
import { NextResponse } from "next/server";
import { doorApiDenial } from "@/lib/portal/door-access";
import { createDraftPost } from "@/lib/social/posts";
import { handle, jsonBody } from "@/lib/social/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const denied = await doorApiDenial(req.headers, "social");
  if (denied) return NextResponse.json({ ok: false, error: denied.error }, { status: denied.status });
  return handle(async () => {
    const body = await jsonBody(req);
    const f = (body.fields ?? {}) as Record<string, unknown>;
    return { post: await createDraftPost(req, { brand: body.organizationId, fields: { body: f.body, notes: f.notes } }) };
  });
}
