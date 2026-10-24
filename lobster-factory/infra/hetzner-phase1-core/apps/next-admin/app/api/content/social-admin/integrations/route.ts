import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { listAllIntegrations, getPostizConfig } from "@/lib/content/postiz";
import { staffOnly } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists every organization's Postiz channels: staff only, whatever a customer's role reads as.
export async function GET(req: Request): Promise<Response> {
  const denied = staffOnly(req);
  if (denied) return denied;
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  try {
    getPostizConfig();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Postiz not configured",
      { status: 503 }
    );
  }

  try {
    const integrations = await listAllIntegrations();
    return NextResponse.json({ ok: true, integrations });
  } catch (err) {
    console.error("[social-admin/integrations] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "failed to list integrations" }, { status: 502 });
  }
}
