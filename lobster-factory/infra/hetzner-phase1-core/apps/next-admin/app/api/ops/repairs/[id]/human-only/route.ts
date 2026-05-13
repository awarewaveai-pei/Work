import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { markRunHumanOnly } from "@/lib/repair-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { reason?: string } = {};
  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    body = {};
  }

  const { id } = await params;
  const result = await markRunHumanOnly(id, resolved.role, body.reason ?? "");
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
