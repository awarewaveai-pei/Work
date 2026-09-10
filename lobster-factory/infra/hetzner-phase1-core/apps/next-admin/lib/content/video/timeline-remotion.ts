import {
  type MediaTimelineV1,
  type MediaTimelineV1AudioItem,
  type MediaTimelineV1VideoItem,
  validateMediaTimelineV1,
} from "./timeline-v1";

/**
 * Renderer-neutral Timeline v1 -> Remotion DynamicSlideshow compilation boundary.
 *
 * This module does not fetch storage, submit a renderer job, or authorize a tenant.
 * Its caller must resolve only already-authorized media_assets into short-lived HTTPS
 * URLs. Unsupported Timeline semantics are rejected instead of being silently lost.
 */
export type DynamicSlideshowTransition = "cut" | "fade" | "slide_left" | "slide_right";
export type DynamicSlideshowCrop = "cover" | "contain";

export interface DynamicSlideshowSceneV1 {
  readonly imageUrl: string;
  readonly text: string;
  readonly durationInSeconds: number;
  readonly crop: DynamicSlideshowCrop;
  readonly transitionOut: DynamicSlideshowTransition;
}
export interface DynamicSlideshowCaptionV1 {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly text: string;
}

export interface DynamicSlideshowPropsV1 {
  readonly scenes: readonly DynamicSlideshowSceneV1[];
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly transitionDurationSeconds: number;
  readonly audioUrl?: string;
  readonly captions?: readonly DynamicSlideshowCaptionV1[];
}

export interface TimelineRemotionRenderSpec {
  readonly outputProfile: MediaTimelineV1["outputProfiles"][number];
  readonly outputFormat: "9x16" | "4x5" | "16x9" | "1x1";
  readonly templateId: "dynamic-slideshow";
  readonly props: DynamicSlideshowPropsV1;
}

export interface TimelineArtifactUrlResolver {
  /** Returns an already-authorized, renderer-fetchable HTTPS URL, or undefined. */
  readonly resolve: (artifactId: string, use: "image" | "audio") => string | undefined;
}

export type TimelineRemotionCompileErrorCode =
  | "invalid_timeline"
  | "unsupported_track"
  | "unsupported_footage"
  | "unsupported_audio_shape"
  | "unresolved_artifact";

export interface TimelineRemotionCompileError {
  readonly code: TimelineRemotionCompileErrorCode;
  readonly path: string;
  readonly message: string;
}

export type TimelineRemotionCompileResult =
  | { readonly ok: true; readonly timelineId: string; readonly specs: readonly TimelineRemotionRenderSpec[] }
  | { readonly ok: false; readonly errors: readonly TimelineRemotionCompileError[] };

const PROFILE_DIMENSIONS = {
  vertical_9_16: { outputFormat: "9x16", width: 1080, height: 1920 },
  square_4_5: { outputFormat: "4x5", width: 1080, height: 1350 },
  landscape_16_9: { outputFormat: "16x9", width: 1920, height: 1080 },
  square_1_1: { outputFormat: "1x1", width: 1080, height: 1080 },
} as const;

function rendererUrl(
  resolver: TimelineArtifactUrlResolver,
  artifactId: string,
  use: "image" | "audio",
  path: string,
  errors: TimelineRemotionCompileError[],
): string | undefined {
  const resolved = resolver.resolve(artifactId, use);
  try {
    const url = typeof resolved === "string" ? new URL(resolved) : undefined;
    if (!url || url.protocol !== "https:" || !url.hostname) throw new Error("not an HTTPS URL");
    return url.toString();
  } catch {
    errors.push({
      code: "unresolved_artifact",
      path,
      message: "素材必須由受控 resolver 解析為 HTTPS renderer URL",
    });
    return undefined;
  }
}

function singleVideoTrack(timeline: MediaTimelineV1, errors: TimelineRemotionCompileError[]): readonly MediaTimelineV1VideoItem[] | undefined {
  const videoTracks = timeline.tracks.filter((track) => track.kind === "video");
  const nonVideoTracks = timeline.tracks.filter((track) => track.kind !== "video");
  if (videoTracks.length !== 1) {
    errors.push({ code: "unsupported_track", path: "$.tracks", message: "DynamicSlideshow 必須剛好有一條 video track" });
    return undefined;
  }
  if (nonVideoTracks.filter((track) => track.kind === "audio").length > 1) {
    errors.push({ code: "unsupported_track", path: "$.tracks", message: "DynamicSlideshow v1 最多接受一條完整 audio track" });
  }

  const items = [...videoTracks[0].items].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  let cursor = 0;
  for (const [index, item] of items.entries()) {
    if (item.startMs !== cursor) errors.push({ code: "unsupported_track", path: `$.tracks.video.items[${index}]`, message: "DynamicSlideshow 不支援 video track 的時間空洞或重排" });
    if (item.provenance !== "generated") errors.push({ code: "unsupported_footage", path: `$.tracks.video.items[${index}].provenance`, message: "實拍素材必須走 footage editor；不可當成靜態圖片渲染" });
    cursor = item.startMs + item.durationMs;
  }
  return items;
}

function compileCaptions(timeline: MediaTimelineV1): readonly DynamicSlideshowCaptionV1[] {
  const captionTrack = timeline.tracks.find((track): track is Extract<typeof track, { kind: "caption" }> => track.kind === "caption");
  if (!captionTrack) return [];
  return [...captionTrack.items]
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
    .map((item) => ({
      startFrame: Math.round((item.startMs * timeline.frameRate) / 1_000),
      endFrame: Math.round((item.endMs * timeline.frameRate) / 1_000),
      text: item.text,
    }));
}

function resolveContinuousAudio(
  timeline: MediaTimelineV1,
  totalDurationMs: number,
  resolver: TimelineArtifactUrlResolver,
  errors: TimelineRemotionCompileError[],
): string | undefined {
  const audioTracks = timeline.tracks.filter((track): track is Extract<typeof track, { kind: "audio" }> => track.kind === "audio");
  if (audioTracks.length === 0) return undefined;
  if (audioTracks.length !== 1 || audioTracks[0].items.length !== 1) {
    errors.push({ code: "unsupported_audio_shape", path: "$.tracks", message: "DynamicSlideshow 只支援一段完整覆蓋時間線的 audio" });
    return undefined;
  }
  const audio: MediaTimelineV1AudioItem = audioTracks[0].items[0];
  if (audio.startMs !== 0 || audio.durationMs !== totalDurationMs) {
    errors.push({ code: "unsupported_audio_shape", path: "$.tracks.audio.items[0]", message: "audio 必須從 0 開始且完整覆蓋 video 時長" });
    return undefined;
  }
  return rendererUrl(resolver, audio.sourceArtifactId, "audio", "$.tracks.audio.items[0].sourceArtifactId", errors);
}

/** Compiles only the semantics that DynamicSlideshow can reproduce exactly. */
export function compileTimelineV1ToDynamicSlideshow(
  input: unknown,
  resolver: TimelineArtifactUrlResolver,
): TimelineRemotionCompileResult {
  const validation = validateMediaTimelineV1(input);
  if (validation.ok === false) {
    return {
      ok: false,
      errors: validation.errors.map((error) => ({ code: "invalid_timeline", path: error.path, message: error.message })),
    };
  }
  const timeline = validation.value;
  const errors: TimelineRemotionCompileError[] = [];
  const video = singleVideoTrack(timeline, errors);
  if (!video || errors.length) return { ok: false, errors };

  const scenes: DynamicSlideshowSceneV1[] = video.map((item, index) => {
    const imageUrl = rendererUrl(resolver, item.sourceArtifactId, "image", `$.tracks.video.items[${index}].sourceArtifactId`, errors);
    return {
      imageUrl: imageUrl ?? "",
      text: "",
      durationInSeconds: item.durationMs / 1_000,
      crop: item.crop,
      transitionOut: item.transitionOut,
    };
  });
  const totalDurationMs = video.reduce((duration, item) => duration + item.durationMs, 0);
  const audioUrl = resolveContinuousAudio(timeline, totalDurationMs, resolver, errors);
  const captions = compileCaptions(timeline);
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    timelineId: timeline.timelineId,
    specs: timeline.outputProfiles.map((outputProfile) => {
      const dimension = PROFILE_DIMENSIONS[outputProfile];
      return {
        outputProfile,
        outputFormat: dimension.outputFormat,
        templateId: "dynamic-slideshow",
        props: {
          scenes,
          fps: timeline.frameRate,
          width: dimension.width,
          height: dimension.height,
          transitionDurationSeconds: 1,
          ...(audioUrl ? { audioUrl } : {}),
          ...(captions.length ? { captions } : {}),
        },
      };
    }),
  };
}
