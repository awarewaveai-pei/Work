import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { orgDesign, orgDesigns } from "@/lib/content/video/opener-designs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/video/workbench/designs?organizationId=<uuid>[&id=<uuid>] -- card R3: the organization's saved designs
 * (我的設計) the editor can open a video with (a banner-tool card as a 片頭); with id, that one design or 404. Only this
 * organization's (lib/content/video/opener-designs.ts). Asked by video-workbench backend (GET /designs, POST /designs/use).
 * Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return fail(401, "unauthorized");
  const q = new URL(req.url).searchParams, organizationId = q.get("organizationId") ?? "", id = q.get("id");
  if (!UUID.test(organizationId)) return fail(400, "organizationId required");
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  try {
    if (id !== null) {
      const design = await orgDesign(db, organizationId, id);
      return design ? NextResponse.json({ ok: true, design }) : fail(404, "design_not_found");
    }
    return NextResponse.json({ ok: true, designs: await orgDesigns(db, organizationId) });
  } catch {
    return fail(502, "design_lookup_failed");
  }
}
