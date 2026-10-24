import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveWpSite } from "@/lib/content/wp-sites";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";
import { updateWpPost, wpPostPatch } from "@/lib/content/publish/wp-post-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve site auth server-side from siteId.
// `req` 必須傳進來：租戶檢查在 resolveWpSite 裡，少了 req 就沒有身分可驗 —— 這條 route 會
// **發文到該站**，是本批七條裡風險最高的兩條之一。
// @throws OrgAccessError（呼叫端轉 403）；回 null = 找不到站或缺 token（呼叫端回 404）。
async function getSiteAuth(
  req: Request,
  siteId: string,
): Promise<{ url: string; authHeader: string; organizationId: string | null } | null> {
  const resolved = await resolveWpSite(req, siteId);
  if (!resolved || !resolved.token) return null;
  return { url: resolved.site.url, authHeader: resolved.authHeader, organizationId: resolved.site.organizationId };
}

// PATCH /api/content/wp-post — update WP post (date, status, title, content); the change itself is
// lib/content/publish/wp-post-core.ts (shared with the content pipeline's auto publish).
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
  const rawId = typeof body.postId === "number" ? body.postId : parseInt(String(body.postId), 10);
  const postId = Number.isInteger(rawId) && rawId > 0 ? rawId : NaN;
  if (!siteId) return NextResponse.json({ ok: false, error: "siteId required" }, { status: 400 });
  if (isNaN(postId)) return NextResponse.json({ ok: false, error: "postId must be a positive integer" }, { status: 400 });

  let r;
  try { r = await updateWpPost(req, siteId, postId, wpPostPatch(body)); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!r.ok) {
    const failed = r as Extract<typeof r, { ok: false }>;   // strict:false: !ok does not narrow
    if (failed.mode !== undefined) return blockedChangeResponse(failed.mode);
    return NextResponse.json({ ok: false, error: failed.error }, { status: failed.status ?? 500 });
  }
  return NextResponse.json({ ok: true, post: r.post });
}

// DELETE /api/content/wp-post — move WP post to trash
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
  const rawDelId = typeof body.postId === "number" ? body.postId : parseInt(String(body.postId), 10);
  const postId = Number.isInteger(rawDelId) && rawDelId > 0 ? rawDelId : NaN;
  if (!siteId || isNaN(postId))
    return NextResponse.json({ ok: false, error: "siteId and postId (positive integer) required" }, { status: 400 });

  let site;
  try { site = await getSiteAuth(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!site) return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });

  const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), site.organizationId);
  if (!gate.allowed) {
    return blockedChangeResponse(gate.mode);
  }

  let res: Response;
  try {
    res = await fetch(`${site.url}/wp-json/wp/v2/posts/${postId}`, {
      method: "DELETE",
      headers: { Authorization: site.authHeader },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "WordPress connection failed" }, { status: 502 });
  }

  if (!res.ok) return NextResponse.json({ ok: false, error: `WP error ${res.status}` }, { status: res.status });
  return NextResponse.json({ ok: true });
}
