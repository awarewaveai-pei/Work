import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { archiveStaleRuns } from "@/lib/repair-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  let retentionDays = 90;
  try {
    const body: unknown = await request.json();
    if (
      body &&
      typeof body === "object" &&
      "retention_days" in body &&
      typeof (body as Record<string, unknown>).retention_days === "number" &&
      ((body as Record<string, unknown>).retention_days as number) > 0
    ) {
      retentionDays = (body as Record<string, unknown>).retention_days as number;
    }
  } catch {
    // no body or invalid JSON — use default
  }
  const result = await archiveStaleRuns(retentionDays);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
