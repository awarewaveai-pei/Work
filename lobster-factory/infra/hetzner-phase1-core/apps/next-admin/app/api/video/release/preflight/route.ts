import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { evaluateReleaseGate, type QaKind, type ReleaseQaRecord } from "@/lib/content/video/release-gate";

const KINDS: readonly QaKind[] = ["technical", "caption", "editorial", "rights"];
const STATUSES = ["passed", "warned", "failed", "superseded"] as const;
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }

/** Release preflight: validates evidence only; it never creates a Release or publishes media. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : undefined;
  const candidateAssetId = typeof body.candidateAssetId === "string" ? body.candidateAssetId : undefined;
  const candidateChecksum = typeof body.candidateChecksum === "string" ? body.candidateChecksum : undefined;
  if (!organizationId || !candidateAssetId || !candidateChecksum || !Array.isArray(body.requiredKinds) || !Array.isArray(body.reports)) return NextResponse.json({ ok: false, error: "organizationId、candidate 與 QA evidence 為必填" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }
  if (body.requiredKinds.some((kind) => typeof kind !== "string" || !KINDS.includes(kind as QaKind))) return NextResponse.json({ ok: false, error: "requiredKinds 含未知 QA kind" }, { status: 400 });
  const reports: ReleaseQaRecord[] = [];
  for (const [index, value] of body.reports.entries()) {
    if (!object(value) || typeof value.id !== "string" || !KINDS.includes(value.kind as QaKind) || !STATUSES.includes(value.status as typeof STATUSES[number]) || typeof value.candidateAssetId !== "string" || typeof value.candidateChecksum !== "string" || typeof value.profileId !== "string" || typeof value.profileVersion !== "string") return NextResponse.json({ ok: false, error: `reports[${index}] 格式無效` }, { status: 400 });
    reports.push(value as unknown as ReleaseQaRecord);
  }
  const result = evaluateReleaseGate({ candidateAssetId, candidateChecksum, requiredKinds: body.requiredKinds as QaKind[], reports });
  return NextResponse.json({ ok: result.ok, code: result.code, message: result.message, reportIds: result.reportIds, releaseCreatable: result.ok });
}
