import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import {
  getPostizConfig,
  listIntegrations,
  uploadMedia,
  uploadVideo,
  createSocialPost,
  assertCanPublishNow,
  PLATFORM_VIDEO_FORMAT,
  type PostizMediaRef,
} from "@/lib/content/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  clientId: string;
  mode: "draft" | "now";
  platforms: Array<{ platform: string; content: string }>;
  imageUrl?: string;
  /** Per-format video URLs from the video generation step.
   *  Keys: "16x9" | "9x16" | "4x5". When present, each platform receives
   *  its preferred format via PLATFORM_VIDEO_FORMAT routing. */
  videoUrls?: Partial<Record<"16x9" | "9x16" | "4x5", string>>;
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

  const { clientId, mode, platforms, imageUrl, videoUrls, confirmPublishNow = false } = body;

  if (!clientId || typeof clientId !== "string") {
    return new NextResponse("clientId required", { status: 400 });
  }
  if (!mode || (mode !== "draft" && mode !== "now")) {
    return new NextResponse("mode must be 'draft' or 'now'", { status: 400 });
  }
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return new NextResponse("platforms array required", { status: 400 });
  }
  const invalidPlatform = platforms.find(
    (p) => !p || typeof p.platform !== "string" || !p.platform || typeof p.content !== "string"
  );
  if (invalidPlatform) {
    return new NextResponse("each platforms entry must have non-empty platform and content strings", {
      status: 400,
    });
  }
  const VALID_VIDEO_FORMAT_KEYS = new Set(["16x9", "9x16", "4x5"]);
  if (videoUrls !== undefined) {
    if (typeof videoUrls !== "object" || videoUrls === null || Array.isArray(videoUrls)) {
      return new NextResponse("videoUrls must be an object", { status: 400 });
    }
    for (const [k, v] of Object.entries(videoUrls)) {
      if (!VALID_VIDEO_FORMAT_KEYS.has(k)) {
        return new NextResponse(`videoUrls key must be one of: 16x9, 9x16, 4x5 (got: ${k})`, { status: 400 });
      }
      if (typeof v !== "string" || !v.trim()) {
        return new NextResponse(`videoUrls["${k}"] must be a non-empty string`, { status: 400 });
      }
    }
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
    return NextResponse.json(
      { ok: false, error: "no connected channels for requested platforms", skipped },
      { status: 422 }
    );
  }

  let media: PostizMediaRef | undefined;
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

  // Per-platform video routing: upload each unique video URL once (dedup), then map platforms.
  let mediaPerPlatform: Record<string, PostizMediaRef> | undefined;
  if (videoUrls && Object.keys(videoUrls).length > 0) {
    // Collect unique URLs needed by the requested platforms
    const urlToRef = new Map<string, PostizMediaRef>();
    const uploadErrors: string[] = [];

    for (const post of requestedPosts) {
      const preferredFormat = PLATFORM_VIDEO_FORMAT[post.platform] ?? "16x9";
      // Fall back through format priority if the preferred format wasn't generated
      const candidateFormats: Array<"9x16" | "4x5" | "16x9"> =
        preferredFormat === "9x16" ? ["9x16", "4x5", "16x9"]
        : preferredFormat === "4x5" ? ["4x5", "9x16", "16x9"]
        : ["16x9", "4x5", "9x16"];

      const videoUrl = candidateFormats.map(f => videoUrls[f]).find(Boolean);
      if (!videoUrl) continue;

      if (!urlToRef.has(videoUrl)) {
        try {
          const ref = await uploadVideo({ videoUrl });
          urlToRef.set(videoUrl, ref);
        } catch (err) {
          uploadErrors.push(`${post.platform}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const ref = urlToRef.get(videoUrl);
      if (ref) {
        mediaPerPlatform ??= {};
        mediaPerPlatform[post.platform] = ref;
      }
    }

    if (uploadErrors.length > 0) {
      return NextResponse.json(
        { ok: false, error: `video upload failed: ${uploadErrors.join("; ")}` },
        { status: 500 }
      );
    }
  }

  const results = await createSocialPost({ clientId, mode, posts: requestedPosts, media, mediaPerPlatform });

  return NextResponse.json({ ok: true, results, skipped });
}
