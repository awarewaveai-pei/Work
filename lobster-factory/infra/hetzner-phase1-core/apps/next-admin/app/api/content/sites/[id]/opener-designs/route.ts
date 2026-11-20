import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteRowGate } from "@/lib/content/wp-sites";
import { orgDesigns } from "@/lib/content/video/opener-designs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/content/sites/[id]/opener-designs -- card R3: the saved designs (我的設計) of this site's organization that the
// site setting can take as its banner-card intro (IntroStyleButtons). Only that organization's (opener-designs.ts).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;
  const { data, error } = await supabase.from("wp_sites").select("organization_id").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const org = (data as { organization_id: string | null } | null)?.organization_id;
  if (!org) return NextResponse.json({ ok: true, designs: [] });
  try {
    return NextResponse.json({ ok: true, designs: await orgDesigns(supabase, org) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
