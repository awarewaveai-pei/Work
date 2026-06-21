import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import {
  getPostizConfig,
  listIntegrations,
  uploadMedia,
  createSocialPost,
  assertCanPublishNow,
} from "@/lib/content/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  clientId: string;
  mode: "draft" | "now";
  platforms: Array<{ platform: string; content: string }>;
  imageUrl?: string;
  confirmPublishNow?: boolean;
};

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const { clientId, mode, platforms, imageUrl, confirmPublishNow = false } = body;

  if (!clientId) return new NextResponse("clientId required", { status: 400 });
  if (!mode || (mode !== "draft" && mode !== "now")) {
    return new NextResponse("mode must be 'draft' or 'now'", { status: 400 });
  }
  if (!platforms || platforms.length === 0) {
    return new NextResponse("platforms array required", { status: 400 });
  }

  if (mode === "now") {
    try {
      assertCanPublishNow(role, confirmPublishNow);
    } catch (err) {
      return new NextResponse(
        err instanceof Error ? err.message : "publish now denied",
        { status: 400 }
      );
    }
  }

  try {
    getPostizConfig();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Postiz not configured",
      { status: 503 }
    );
  }

  let channels;
  try {
    channels = await listIntegrations(clientId);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed to list integrations" },
      { status: 500 }
    );
  }

  const connectedMap = new Map<string, typeof channels[number]>(
    channels
      .filter((c) => c.status === "connected")
      .map((c) => [c.platform, c] as [string, typeof channels[number]])
  );

  const requestedPosts = platforms
    .map((p) => {
      const ch = connectedMap.get(p.platform);
      if (!ch) return null;
      return {
        integrationId: ch.postizIntegrationId,
        platform: p.platform,
        content: p.content,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const skipped = platforms
    .filter((p) => !connectedMap.has(p.platform))
    .map((p) => ({ platform: p.platform, status: "skipped", error: "channel not connected" }));

  if (requestedPosts.length === 0) {
    return NextResponse.json({ ok: false, error: "no connected channels for requested platforms", skipped });
  }

  let media: { id: string; path: string } | undefined;
  if (imageUrl) {
    try {
      media = await uploadMedia({ imageUrl });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `media upload failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  const results = await createSocialPost({ clientId, mode, posts: requestedPosts, media });

  return NextResponse.json({ ok: true, results, skipped });
}
