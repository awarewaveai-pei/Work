// GET /api/ops/clients/[slug]/site-watch/image?result=<id>&which=evidence|diff
// GET /api/ops/clients/[slug]/site-watch/image?page=<pageId>&which=baseline
// C12: the private bucket is only readable through this authenticated route, addressed by row ids
// scoped to the client in the path — no object key, no public or signed URL ever leaves the server.

import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { orgBySlug, readImage } from "@/lib/site-watch/console";
import { createSiteWatchObjects } from "@/lib/site-watch/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // viewer+ (middleware enforces the session)
  const q = new URL(request.url).searchParams;
  const which = q.get("which");
  if (which !== "evidence" && which !== "diff" && which !== "baseline") {
    return NextResponse.json({ ok: false, error: "which_invalid" }, { status: 400 });
  }
  const resultId = q.get("result") ?? undefined;
  if (resultId && !UUID_RE.test(resultId)) return NextResponse.json({ ok: false, error: "result_invalid" }, { status: 400 });

  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const org = await orgBySlug(sb, (await context.params).slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const img = await readImage(sb, createSiteWatchObjects(), org.id, { resultId, pageId: q.get("page") ?? undefined, which });
  if (!img) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return new NextResponse(new Uint8Array(img), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
