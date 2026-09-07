import { describe, expect, it } from "vitest";
import { MEDIA_TIMELINE_V1_MAX_FRAMES, MEDIA_TIMELINE_V1_SCHEMA, validateMediaTimelineV1 } from "../timeline-v1";

const validTimeline = {
  schemaVersion: MEDIA_TIMELINE_V1_SCHEMA,
  timelineId: "tl_123e4567-e89b-42d3-a456-426614174000",
  organizationId: "123e4567-e89b-42d3-a456-426614174001",
  purpose: "marketing",
  frameRate: 30,
  outputProfiles: ["vertical_9_16", "landscape_16_9"],
  tracks: [
    { id: "video_main", kind: "video", items: [
      { id: "shot_001", startMs: 0, durationMs: 3000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174100", crop: "cover", transitionOut: "fade", provenance: "generated" },
      { id: "shot_002", startMs: 3000, durationMs: 3000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174101", crop: "contain", transitionOut: "cut", provenance: "footage" },
    ] },
    { id: "narration", kind: "audio", items: [
      { id: "voice_001", startMs: 0, durationMs: 6000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174102", transcriptRef: "123e4567-e89b-42d3-a456-426614174103" },
    ] },
    { id: "captions", kind: "caption", items: [
      { id: "caption_001", startMs: 0, endMs: 3000, text: "新品登場", sourceTranscriptSegmentIds: ["seg_001"] },
      { id: "caption_002", startMs: 3000, endMs: 6000, text: "立即了解更多", sourceTranscriptSegmentIds: ["seg_002"] },
    ] },
  ],
  styleRef: "123e4567-e89b-42d3-a456-426614174104",
  provenance: { recipeId: "recipe_marketing_short", capabilityVersions: { "media.timeline_plan": "1.0.0" }, sourceArtifacts: ["123e4567-e89b-42d3-a456-426614174100", "123e4567-e89b-42d3-a456-426614174101", "123e4567-e89b-42d3-a456-426614174102", "123e4567-e89b-42d3-a456-426614174103", "123e4567-e89b-42d3-a456-426614174104"] },
} as const;

describe("media timeline v1", () => {
  it("accepts the canonical artifact-reference track contract", () => {
    expect(validateMediaTimelineV1(validTimeline)).toEqual({ ok: true, value: validTimeline });
  });

  it("fails closed for unknown fields, unknown artifacts, overlap and frame misalignment", () => {
    const result = validateMediaTimelineV1({
      ...validTimeline,
      unexpected: true,
      tracks: [{ ...validTimeline.tracks[0], items: [
        { ...validTimeline.tracks[0].items[0], startMs: 1 },
        { ...validTimeline.tracks[0].items[1], startMs: 2000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174109" },
      ] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors.map((error) => error.path)).toEqual(expect.arrayContaining([
      "$.unexpected", "$.tracks[0].items[0].startMs", "$.tracks[0].items[1].sourceArtifactId", "$.tracks[0].items[1]",
    ]));
  });

  it("uses the established LEGO capability-ID grammar for provenance", () => {
    const result = validateMediaTimelineV1({
      ...validTimeline,
      provenance: { ...validTimeline.provenance, capabilityVersions: { "Media.timeline_plan": "1.0.0" } },
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.provenance.capabilityVersions.Media.timeline_plan", code: "value" }),
    ]));
  });

  it("rejects captions that are out of order or unreadably fast", () => {
    const result = validateMediaTimelineV1({
      ...validTimeline,
      tracks: [validTimeline.tracks[0], validTimeline.tracks[1], { ...validTimeline.tracks[2], items: [
        { ...validTimeline.tracks[2].items[0], endMs: 1000, text: "這是一段速度太快而且難以閱讀的字幕內容".repeat(2) },
        { ...validTimeline.tracks[2].items[1], startMs: 500 },
      ] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.tracks[2].items[0].text", code: "limit" }),
      expect.objectContaining({ path: "$.tracks[2].items[1]", code: "overlap" }),
    ]));
  });

  it("rejects a timeline longer than the renderer frame guard", () => {
    const result = validateMediaTimelineV1({
      ...validTimeline, frameRate: 60,
      tracks: [{ id: "video_long", kind: "video", items: Array.from({ length: 120 }, (_, index) => ({
        id: `shot_${index}`, startMs: index * 3000, durationMs: 3000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174100", crop: "cover", transitionOut: "cut", provenance: "generated",
      })) }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.tracks", message: expect.stringContaining(String(MEDIA_TIMELINE_V1_MAX_FRAMES)) }),
    ]));
  });
});
