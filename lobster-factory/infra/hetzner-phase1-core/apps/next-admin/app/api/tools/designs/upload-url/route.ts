import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { presignPut } from "../../../../../lib/storage/r2-s3";
import { mintPendingKey, pendingTarget, PRESIGN_TTL_SEC } from "../../../../../lib/studio/design-pending";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "../../../../../lib/tenant-guard";

export const runtime = "nodejs";

/**
 * POST {kind:"image"|"source", mime?, ext?, organizationId?} -> {ok, key, putUrl}: step ① of the direct upload
 * (lobster-factory/docs/PLAN-designs-direct-upload.md §2). Same gate as POST /api/tools/designs (the key's org segment is
 * what that route later checks, so the org is resolved exactly as it resolves it). The bytes never pass through here.
 */
export async function POST(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  // default_viewer = no identity header at all (middleware set none): not signed in.
  if (resolved.source === "default_viewer") return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { kind?: unknown; mime?: unknown; ext?: unknown; organizationId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });
  const target = pendingTarget(body.kind, body.mime, body.ext);
  if (!target.ok) return NextResponse.json({ ok: false, error: (target as { ok: false; error: string }).error }, { status: 400 });

  let organizationId: string | null;
  try { organizationId = effectiveOrgId(request, body.organizationId ?? process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const key = organizationId ? mintPendingKey(organizationId, target.ext) : null;
  if (!key) {
    return NextResponse.json({ ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" }, { status: 400 });
  }

  const signed = await presignPut(key, target.contentType, PRESIGN_TTL_SEC);
  if (!signed.ok) {
    const code = (signed as { ok: false; error: string }).error;
    return NextResponse.json({ ok: false, error: code }, { status: code === "r2_s3_not_configured" ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, key, putUrl: signed.url, contentType: target.contentType });
}
