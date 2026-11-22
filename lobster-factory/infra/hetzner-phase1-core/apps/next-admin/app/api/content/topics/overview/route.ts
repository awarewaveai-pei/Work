// GET /api/content/topics/overview -- the auto-content control page's numbers (lib/content/topics/overview-load.ts) for a
// page that may not read the database itself: the content door. ?organizationId= = the current client (ADR 020), through
// effectiveOrgId (a client account always gets its own); none = nothing read. loadOverview also checks canAccessOrg per site.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/content/topics/overview-load";
import { canAccessOrg, effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  let org: string | null;
  try { org = effectiveOrgId(req, new URL(req.url).searchParams.get("organizationId")); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, overview: await loadOverview(sb, org, (o) => canAccessOrg(req, o)) });
  } catch (e) {
    console.error("[content/topics/overview] failed:", e);
    return NextResponse.json({ ok: false, error: "overview could not be read" }, { status: 500 });
  }
}
