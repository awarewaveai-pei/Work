import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getWpSites, wpAuthHeader } from "@/lib/content/wp-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve site auth server-side from siteId
async function getSiteAuth(siteId: string): Promise<{ url: string; authHeader: string } | null> {
  const { sites, tokens, usernames } = await getWpSites();
  const site = sites.find(s => s.id === siteId);
  if (!site) return null;
  const token = tokens[siteId];
  if (!token) return null;
  return { url: site.url, authHeader: wpAuthHeader(usernames[siteId] ?? "", token) };
}

// PATCH /api/content/wp-post — update WP post (date, status, title)
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

  const site = await getSiteAuth(siteId);
  if (!site) return NextResponse.json({ ok: false, error: "Site not found or token missing" }, { status: 404 });

  // Build WP patch payload — only include explicitly provided fields
  const wpPatch: Record<string, unknown> = {};
  if (typeof body.date === "string" && body.date.trim()) wpPatch.date = body.date.trim();
  if (typeof body.status === "string" && ["draft", "publish", "future", "pending"].includes(body.status))
    wpPatch.status = body.status;
  if (typeof body.title === "string" && body.title.trim()) wpPatch.title = body.title.trim();
  // content: used for video embedding — replaces <!-- VIDEO_PLACEHOLDER --> with the embed URL.
  // WARNING: this overwrites the entire post_content; only use when you have the full patched HTML.
  if (typeof body.content === "string" && body.content.trim()) wpPatch.content = body.content.trim();

  if (Object.keys(wpPatch).length === 0)
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });

  const endpoint = `${site.url}/wp-json/wp/v2/posts/${postId}`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST", // WP REST API uses POST for updates (with _method or just POST)
      headers: {
        "Content-Type": "application/json",
        Authorization: site.authHeader,
        "X-HTTP-Method-Override": "PUT",
      },
      body: JSON.stringify(wpPatch),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "WordPress connection failed" }, { status: 502 });
  }

  const json = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message.slice(0, 200) : `WP error ${res.status}`;
    return NextResponse.json({ ok: false, error: msg }, { status: res.status });
  }

  return NextResponse.json({
    ok: true,
    post: {
      id: json.id,
      status: json.status,
      date: json.date,
      link: json.link,
    },
  });
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

  const site = await getSiteAuth(siteId);
  if (!site) return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });

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
