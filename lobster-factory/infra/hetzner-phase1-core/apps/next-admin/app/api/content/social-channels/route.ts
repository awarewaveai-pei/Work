import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { listIntegrations, getPostizConfig } from "@/lib/content/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return new NextResponse("clientId required", { status: 400 });

  try { assertOrgAccess(req, clientId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  try {
    getPostizConfig();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Postiz not configured",
      { status: 503 }
    );
  }

  try {
    const channels = await listIntegrations(clientId);
    return NextResponse.json({ ok: true, channels });
  } catch (err) {
    console.error("[social-channels] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "failed to load channels" }, { status: 500 });
  }
}
