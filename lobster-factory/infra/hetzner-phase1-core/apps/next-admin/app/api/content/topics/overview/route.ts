// GET /api/content/topics/overview -- the auto-content control page's numbers (lib/content/topics/overview-load.ts) for a
// page that may not read the database itself: the content door. Scoped by loadOverview (canAccessOrg on every site).
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/content/topics/overview-load";
import { canAccessOrg } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, overview: await loadOverview(sb, (org) => canAccessOrg(req, org)) });
  } catch (e) {
    console.error("[content/topics/overview] failed:", e);
    return NextResponse.json({ ok: false, error: "overview could not be read" }, { status: 500 });
  }
}
