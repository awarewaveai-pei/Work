import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveSocialOrg } from "@/lib/content/social-org";
import { listIntegrations, getPostizConfig } from "@/lib/content/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const scope = await resolveSocialOrg(req, {
    siteId: url.searchParams.get("siteId") ?? undefined,
    clientId: url.searchParams.get("clientId") ?? undefined,
  });
  if ("response" in scope) return scope.response; // strict:false -- `!scope.ok` does not narrow

  try {
    getPostizConfig();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Postiz not configured",
      { status: 503 }
    );
  }

  try {
    const channels = await listIntegrations(scope.organizationId);
    return NextResponse.json({ ok: true, channels });
  } catch (err) {
    console.error("[social-channels] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "failed to load channels" }, { status: 500 });
  }
}
