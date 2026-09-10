import type { NextRequest } from "next/server";
import { assertOrgAccess } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getDesignsPublicBase } from "@/lib/storage/r2";
import { validateMediaTimelineV1, type MediaTimelineV1 } from "./timeline-v1";
import {
  compileTimelineV1ToDynamicSlideshow,
  type TimelineRemotionRenderSpec,
} from "./timeline-remotion";

interface TimelineRemotionRequestFailure {
  readonly ok: false;
  readonly status: 400 | 422 | 503;
  readonly body: Record<string, unknown>;
}

interface TimelineRemotionRequestSuccess {
  readonly ok: true;
  readonly timeline: MediaTimelineV1;
  readonly timelineId: string;
  readonly specs: readonly TimelineRemotionRenderSpec[];
}

export type TimelineRemotionRequestResult =
  | TimelineRemotionRequestFailure
  | TimelineRemotionRequestSuccess;

/**
 * Shared authorization and artifact-resolution boundary for Timeline compile
 * and submit. No renderer request or job write occurs here.
 */
export async function prepareTimelineRemotionRequest(
  req: NextRequest,
  input: unknown,
): Promise<TimelineRemotionRequestResult> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, status: 400, body: { ok: false, error: "timeline 必須是物件" } };
  }

  // Validate before a service-role query so malformed/unbounded input never
  // reaches the database or renderer boundary.
  const validation = validateMediaTimelineV1(input);
  if (validation.ok === false) {
    return {
      ok: false,
      status: 422,
      body: {
        ok: false,
        error: "Timeline 無法編譯",
        errors: validation.errors.map((error) => ({
          code: "invalid_timeline",
          path: error.path,
          message: error.message,
        })),
      },
    };
  }

  const timeline = validation.value;
  assertOrgAccess(req, timeline.organizationId);

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return { ok: false, status: 503, body: { ok: false, error: "Supabase not configured" } };
  }

  const artifactIds = [...timeline.provenance.sourceArtifacts];
  const { data: assets, error } = await supabase
    .from("media_assets")
    .select("id, object_url, organization_id")
    .eq("organization_id", timeline.organizationId)
    .in("id", artifactIds);
  if (error) {
    return { ok: false, status: 503, body: { ok: false, error: "素材解析失敗" } };
  }

  const urls = new Map(
    (assets ?? []).map((asset) => [String(asset.id), String(asset.object_url ?? "")]),
  );
  const missingArtifacts = artifactIds.filter((artifactId) => !urls.has(artifactId));
  if (missingArtifacts.length > 0) {
    return {
      ok: false,
      status: 422,
      body: {
        ok: false,
        error: "Timeline 無法編譯",
        errors: missingArtifacts.map((artifactId) => ({
          code: "unresolved_artifact",
          path: "$.provenance.sourceArtifacts",
          message: `素材不存在或不屬於此組織：${artifactId}`,
        })),
      },
    };
  }

  const videoPublicBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  const allowedHosts = new Set([
    new URL(getDesignsPublicBase()).hostname,
    ...(videoPublicBase ? [new URL(videoPublicBase).hostname] : []),
    "images.pexels.com",
    "videos.pexels.com",
    "player.vimeo.com",
  ]);
  const result = compileTimelineV1ToDynamicSlideshow(timeline, {
    resolve: (artifactId: string) => {
      const value = urls.get(artifactId);
      if (!value) return undefined;
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return undefined;
        return url.toString();
      } catch {
        return undefined;
      }
    },
  });
  if (result.ok === false) {
    return {
      ok: false,
      status: 422,
      body: { ok: false, error: "Timeline 無法編譯", errors: result.errors },
    };
  }

  return { ok: true, timeline, timelineId: result.timelineId, specs: result.specs };
}
