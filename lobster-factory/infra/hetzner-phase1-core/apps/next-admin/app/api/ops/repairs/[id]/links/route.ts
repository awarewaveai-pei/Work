import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { updateRunLinks } from "@/lib/repair-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: {
    github_pr_url?: string;
    github_issue_url?: string;
    deploy_ref?: string;
    state?: string;
    deploy_status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { id } = await params;
  const result = await updateRunLinks(id, resolved.role, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
