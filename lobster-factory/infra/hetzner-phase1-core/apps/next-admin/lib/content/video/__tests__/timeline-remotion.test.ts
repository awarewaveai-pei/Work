import { describe, expect, it } from "vitest";
import { MEDIA_TIMELINE_V1_SCHEMA } from "../timeline-v1";
import { compileTimelineV1ToDynamicSlideshow } from "../timeline-remotion";

const artifact = {
  imageOne: "123e4567-e89b-42d3-a456-426614174100",
  imageTwo: "123e4567-e89b-42d3-a456-426614174101",
  audio: "123e4567-e89b-42d3-a456-426614174102",
  style: "123e4567-e89b-42d3-a456-426614174103",
};

const timeline = {
  schemaVersion: MEDIA_TIMELINE_V1_SCHEMA,
  timelineId: "tl_123e4567-e89b-42d3-a456-426614174000",
  organizationId: "123e4567-e89b-42d3-a456-426614174001",
  purpose: "marketing",
  frameRate: 30,
  outputProfiles: ["vertical_9_16", "landscape_16_9"],
  tracks: [{ id: "video_main", kind: "video", items: [
    { id: "shot_001", startMs: 0, durationMs: 3000, sourceArtifactId: artifact.imageOne, crop: "cover", transitionOut: "fade", provenance: "generated" },
    { id: "shot_002", startMs: 3000, durationMs: 3000, sourceArtifactId: artifact.imageTwo, crop: "contain", transitionOut: "slide_right", provenance: "generated" },
  ] }],
  styleRef: artifact.style,
  provenance: { capabilityVersions: { "media.timeline_plan": "1.0.0" }, sourceArtifacts: Object.values(artifact) },
} as const;

const resolver = {
  resolve: (id: string) => `https://media.example.test/assets/${id}.bin`,
};

describe("Timeline v1 DynamicSlideshow compiler", () => {
  it("retains asset, crop, transition, frame rate and output-profile semantics", () => {
    const result = compileTimelineV1ToDynamicSlideshow(timeline, resolver);
    expect(result).toEqual({
      ok: true,
      timelineId: timeline.timelineId,
      specs: [
        expect.objectContaining({ outputProfile: "vertical_9_16", outputFormat: "9x16", props: expect.objectContaining({ fps: 30, width: 1080, height: 1920 }) }),
        expect.objectContaining({ outputProfile: "landscape_16_9", outputFormat: "16x9", props: expect.objectContaining({ fps: 30, width: 1920, height: 1080 }) }),
      ],
    });
    if (result.ok) expect(result.specs[0].props.scenes).toEqual([
      expect.objectContaining({ crop: "cover", transitionOut: "fade", durationInSeconds: 3 }),
      expect.objectContaining({ crop: "contain", transitionOut: "slide_right", durationInSeconds: 3 }),
    ]);
  });

  it("adds only a single audio artifact that covers the full timeline", () => {
    const result = compileTimelineV1ToDynamicSlideshow({
      ...timeline,
      tracks: [...timeline.tracks, { id: "audio_main", kind: "audio", items: [{ id: "voice", startMs: 0, durationMs: 6000, sourceArtifactId: artifact.audio }] }],
    }, resolver);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.specs[0].props.audioUrl).toContain(artifact.audio);
  });

  it("renders validated caption timing while still rejecting footage and timing gaps", () => {
    const caption = { id: "captions", kind: "caption", items: [{ id: "caption", startMs: 0, endMs: 3000, text: "字幕", sourceTranscriptSegmentIds: ["seg_001"] }] } as const;
    const result = compileTimelineV1ToDynamicSlideshow({
      ...timeline,
      tracks: [{ ...timeline.tracks[0], items: [
        { ...timeline.tracks[0].items[0], provenance: "footage" as const },
        { ...timeline.tracks[0].items[1], startMs: 4000 },
      ] }, caption],
    }, resolver);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["unsupported_footage"]));
    const valid = compileTimelineV1ToDynamicSlideshow({ ...timeline, tracks: [...timeline.tracks, caption] }, resolver);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.specs[0].props.captions).toEqual([{ startFrame: 0, endFrame: 90, text: "字幕" }]);
  });

  it("refuses a missing or non-HTTPS resolved artifact URL", () => {
    const result = compileTimelineV1ToDynamicSlideshow(timeline, { resolve: () => undefined });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unresolved_artifact" }),
    ]));
  });
});
