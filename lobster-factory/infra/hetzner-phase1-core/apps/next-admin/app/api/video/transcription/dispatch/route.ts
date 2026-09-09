import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forward a video upload to the explicitly configured local Whisper worker. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const workerUrl = (process.env.MEDIA_TRANSCRIBE_WORKER_URL ?? "").trim();
  const workerToken = (process.env.MEDIA_TRANSCRIBE_WORKER_TOKEN ?? "").trim();
  if (!workerUrl || !workerToken || !/^https:\/\//i.test(workerUrl)) {
    return NextResponse.json({ ok: false, error: "transcription_worker_not_configured" }, { status: 503 });
  }
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "invalid_multipart" }, { status: 400 }); }
  const file = form.get("file");
  const organizationId = String(form.get("organizationId") ?? "").trim();
  const model = String(form.get("model") ?? "large-v3").trim();
  if (!(file instanceof File) || !file.name) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
  if (!organizationId) return NextResponse.json({ ok: false, error: "organizationId required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (file.size <= 0 || file.size > 500 * 1024 * 1024) return NextResponse.json({ ok: false, error: "file size must be 1..500MB" }, { status: 413 });
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(model)) return NextResponse.json({ ok: false, error: "invalid model" }, { status: 400 });
  const outbound = new FormData();
  outbound.append("file", file, file.name);
  outbound.append("model", model);
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/api/video/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}` },
      body: outbound,
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({ ok: false, error: "worker_invalid_json" }));
    return NextResponse.json({ ok: response.ok, worker: payload, organizationId }, { status: response.ok ? 202 : 502 });
  } catch {
    return NextResponse.json({ ok: false, error: "transcription_worker_unreachable" }, { status: 502 });
  }
}
