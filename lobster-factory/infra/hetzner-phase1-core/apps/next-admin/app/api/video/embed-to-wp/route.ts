import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveWpSite } from "@/lib/content/wp-sites";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import {
  ensureDeliveryReceipt,
  claimDeliveryReceipt,
  mediaPersistenceEnabled,
  recordDeliveryReceipt,
  type DeliveryReceipt,
} from "@/lib/content/video/delivery-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/video/embed-to-wp
 * Fetches a WP post's content, replaces <!-- VIDEO_PLACEHOLDER --> with the video URL
 * (as a bare URL on its own line → WP autoembed renders it), and PATCHes the post back.
 *
 * Called by ContentStudio after video render completes (fire-and-forget polling loop).
 * The article was already pushed; this just patches the video into its placeholder slot.
 */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const siteId  = typeof body.siteId  === "string" ? body.siteId.trim()  : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const releaseId = typeof body.releaseId === "string" ? body.releaseId.trim() : "";
  const variant = typeof body.variant === "string" && body.variant.trim() ? body.variant.trim() : "default";
  const rawId    = typeof body.postId   === "number" ? body.postId : parseInt(String(body.postId), 10);
  const postId   = Number.isInteger(rawId) && rawId > 0 ? rawId : NaN;

  if (!videoUrl) return NextResponse.json({ ok: false, error: "videoUrl required" }, { status: 400 });
  if (!/^https:\/\//i.test(videoUrl)) return NextResponse.json({ ok: false, error: "videoUrl must start with https://" }, { status: 400 });
  if (isNaN(postId)) return NextResponse.json({ ok: false, error: "postId must be a positive integer" }, { status: 400 });
  if (releaseId && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(releaseId)) {
    return NextResponse.json({ ok: false, error: "releaseId must be a UUID" }, { status: 400 });
  }
  if (variant.length > 64) return NextResponse.json({ ok: false, error: "variant too long" }, { status: 400 });

  // Resolve site auth
  let resolved;
  try { resolved = await resolveWpSite(req, siteId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!resolved) return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
  if (!resolved.token) return NextResponse.json({ ok: false, error: "No token for site" }, { status: 503 });

  let receipt: DeliveryReceipt | null = null;
  if (releaseId && mediaPersistenceEnabled()) {
    const organizationId = resolved.site.organizationId;
    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "WordPress site is not linked to an organization" }, { status: 422 });
    }
    try {
      receipt = await ensureDeliveryReceipt({
        organizationId,
        releaseId,
        destination: "wordpress",
        variant: `${variant}:post-${postId}`,
      });
      if (receipt) {
        const claim = await claimDeliveryReceipt(receipt);
        if (claim && !claim.claimed) {
          return NextResponse.json({ ok: true, idempotent: true, postId, videoUrl, delivery: claim.receipt });
        }
        if (claim) receipt = claim.receipt;
      }
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "failed to reserve delivery receipt" }, { status: 503 });
    }
  }
  const markReceipt = async (ok: boolean, externalId?: string, response?: Record<string, unknown>) => {
    if (!receipt) return;
    try {
      if (!ok) {
        await recordDeliveryReceipt(receipt, { type: "failed" }, response);
        return;
      }
      const drafted = await recordDeliveryReceipt(receipt, { type: "drafted", externalId: externalId ?? String(postId) }, response);
      if (drafted) await recordDeliveryReceipt(drafted, { type: "published", externalId: externalId ?? String(postId) }, response);
    } catch (err) {
      console.error("[video/embed-to-wp] receipt persistence failed", err);
    }
  };
  const authHdr = resolved.authHeader;
  const base = resolved.site.url.replace(/\/+$/, "");

  // Fetch current post content
  let currentContent = "";
  try {
    const getRes = await fetch(`${base}/wp-json/wp/v2/posts/${postId}?context=edit`, {
      headers: { Authorization: authHdr },
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) {
      const e = await getRes.json().catch(() => ({})) as { message?: string };
      await markReceipt(false, undefined, { phase: "fetch", status: getRes.status, error: e.message });
      return NextResponse.json({ ok: false, error: e.message ?? `WP GET error ${getRes.status}` }, { status: getRes.status });
    }
    const post = await getRes.json() as { content?: { raw?: string } };
    currentContent = post.content?.raw ?? "";
  } catch {
    await markReceipt(false, undefined, { phase: "fetch", error: "network" });
    return NextResponse.json({ ok: false, error: "Failed to fetch post from WordPress" }, { status: 502 });
  }

  if (!currentContent.includes("<!-- VIDEO_PLACEHOLDER -->")) {
    // Placeholder not found — append video at end instead of failing
    currentContent = currentContent.trimEnd() + `\n\n${videoUrl}\n`;
  } else {
    // Replace ALL placeholders with the bare video URL (WP autoembed → responsive iframe).
    // Global regex + function replacer: replaces every occurrence (not just the first) AND prevents
    // $ in the URL being interpreted as a replacement pattern. The needle has no regex-special chars.
    currentContent = currentContent.replace(/<!-- VIDEO_PLACEHOLDER -->/g, () => videoUrl);
  }

  // PATCH the post content back
  try {
    const patchRes = await fetch(`${base}/wp-json/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHdr,
        "X-HTTP-Method-Override": "PUT",
      },
      body: JSON.stringify({ content: currentContent }),
      signal: AbortSignal.timeout(12_000),
    });
    const pj = await patchRes.json().catch(() => ({})) as { message?: string };
    if (!patchRes.ok) {
      await markReceipt(false, undefined, { phase: "patch", status: patchRes.status, error: pj.message });
      return NextResponse.json({ ok: false, error: pj.message ?? `WP PATCH error ${patchRes.status}` }, { status: patchRes.status });
    }
  } catch {
    await markReceipt(false, undefined, { phase: "patch", error: "network" });
    return NextResponse.json({ ok: false, error: "Failed to update post in WordPress" }, { status: 502 });
  }

  await markReceipt(true, String(postId), { postId, videoUrl });
  return NextResponse.json({ ok: true, postId, videoUrl });
}
