/**
 * POST /api/video/remotion-render
 *
 * Forwards { templateId, props } to the EU remotion-service and returns
 * a job-store UUID for polling via /api/video/remotion-job-status.
 *
 * Env: REMOTION_SERVICE_URL (default http://127.0.0.1:8733), REMOTION_AUTH_TOKEN
 */
import { NextRequest, NextResponse } from "next/server";
import { submitRemotion } from "@/lib/content/video/remotion-client";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { createJob, finishJob } from "@/lib/content/video/job-store";

/** All templateIds the EU remotion-service accepts (mirrors TEMPLATE_MAP in server.ts). */
const ALLOWED_TEMPLATE_IDS = new Set([
  "scale-bg-text-slideup",
  "pan-slide-text-left-3scenes",
  "circle-mask-text-slideup-reveal",
  "product-review-typewriter",
  "photo-highlights-slides-zoom",
  "dynamic-slideshow",
]);

/** Recursively collect all absolute-URL strings from an arbitrary props object. */
function extractUrls(obj: unknown): string[] {
  if (typeof obj === "string") {
    return obj.startsWith("http://") || obj.startsWith("https://") ? [obj] : [];
  }
  if (Array.isArray(obj)) return obj.flatMap(extractUrls);
  if (obj !== null && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).flatMap(extractUrls);
  }
  return [];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { templateId?: string; props?: Record<string, unknown>; organizationId?: string };
  try {
    body = (await req.json()) as { templateId?: string; props?: Record<string, unknown>; organizationId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 });
  }

  if (!body.templateId) {
    return NextResponse.json({ ok: false, error: "templateId 為必填" }, { status: 400 });
  }

  // VideoPipeline wizard（② 選租戶）可覆蓋預設租戶——同 render-draft/route.ts 2026-09-11 修，理由同註解。
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requestedOrgId = typeof body.organizationId === "string" && UUID_RE.test(body.organizationId)
    ? body.organizationId
    : undefined;
  const { resolveOrgId: resolveDefaultOrgId } = await import("@/lib/content/blocks/video-pipeline");
  let orgId: string | null;
  try { orgId = effectiveOrgId(req, requestedOrgId ?? resolveDefaultOrgId()); }
  catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error) as NextResponse; throw error; }
  if (!orgId) return NextResponse.json({ ok: false, error: "影片工作必須綁定組織" }, { status: 403 });

  // Fix 2a: templateId whitelist — prevent forwarding arbitrary composition IDs to the EU renderer.
  if (!ALLOWED_TEMPLATE_IDS.has(body.templateId)) {
    return NextResponse.json(
      { ok: false, error: `不允許的 templateId：${body.templateId}。允許清單：${[...ALLOWED_TEMPLATE_IDS].join(", ")}` },
      { status: 400 },
    );
  }

  // Fix 2b: SSRF guard — validate all absolute URLs in props against known-safe origins.
  // Remotion templates embed image/audio/logo URLs in props; we must not forward arbitrary hosts
  // to the EU box (which would allow using it as an open fetch-proxy). Same pattern as render-draft.
  const { getDesignsPublicBase } = await import("@/lib/storage/r2");
  const r2PublicBase = getDesignsPublicBase();
  const R2_VIDEO_PUBLIC_BASE = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  const ALLOWED_HOSTS = new Set<string>([
    new URL(r2PublicBase).hostname,
    ...(R2_VIDEO_PUBLIC_BASE ? [new URL(R2_VIDEO_PUBLIC_BASE).hostname] : []),
    "images.pexels.com",
    "videos.pexels.com",
    "player.vimeo.com",
  ]);

  const urlsInProps = extractUrls(body.props ?? {});
  for (const url of urlsInProps) {
    try {
      const h = new URL(url).hostname;
      if (!ALLOWED_HOSTS.has(h)) {
        return NextResponse.json(
          { ok: false, error: `props 含非允許來源的 URL：${h}` },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ ok: false, error: `props 含格式無效的 URL：${url}` }, { status: 400 });
    }
  }

  let job: Awaited<ReturnType<typeof createJob>>;
  try { job = await createJob(orgId); }
  catch (error) {
    console.error("[video/remotion-render] createJob failed", error);
    return NextResponse.json({ ok: false, error: "無法建立影片工作" }, { status: 500 });
  }
  let result: Awaited<ReturnType<typeof submitRemotion>>;
  try { result = await submitRemotion(body.templateId, body.props ?? {}); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Remotion 提交失敗";
    console.error("[video/remotion-render] submitRemotion threw", message);
    try { await finishJob(job.id, { status: "error", error: message, statusCode: 502 }); }
    catch (e2) { console.error("[video/remotion-render] finishJob (submitRemotion-throw path) failed", e2); }
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
  if (result.ok === false) {
    console.error("[video/remotion-render] submitRemotion returned ok:false", result.error);
    try { await finishJob(job.id, { status: "error", error: result.error, statusCode: 502 }); }
    catch (e2) { console.error("[video/remotion-render] finishJob (submitRemotion-fail path) failed", e2); }
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  const scenes = Array.isArray((body.props as Record<string, unknown> | undefined)?.scenes)
    ? ((body.props as Record<string, unknown>).scenes as unknown[]).length : 0;
  try {
    await finishJob(job.id, {
      status: "running", euJobId: result.jobId,
      recordParams: { title: "Remotion template", sceneCount: scenes, organizationId: orgId, source: "draft", rendererKind: "remotion" },
    });
  } catch (e2) {
    console.error("[video/remotion-render] finishJob (success path) failed", e2);
    return NextResponse.json({ ok: false, error: "渲染已送出但工作記錄失敗" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
