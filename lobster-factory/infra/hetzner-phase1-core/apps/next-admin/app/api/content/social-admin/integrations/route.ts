import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { listAllIntegrations, getPostizConfig } from "@/lib/content/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
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
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
