import { describe, expect, it } from "vitest";
import { validateStoryBible } from "../story-bible";
import { compileEditPlanToTimeline } from "../edit-plan-timeline";
import { validateEditPlan } from "../edit-plan";

const org = "123e4567-e89b-42d3-a456-426614174001";
const asset = "123e4567-e89b-42d3-a456-426614174100";

describe("production document validators", () => {
  it("accepts a minimal Story Bible and rejects missing identity", () => {
    const bible = { schemaVersion: "1.0.0", organizationId: org, seriesId: "series_1", revision: 1, state: "draft", characters: [{ id: "hero", name: "主角", referenceAssetIds: [asset] }], locations: [], props: [], continuity: { currentState: [], prohibitions: [], openThreads: [] }, episode: { episodeId: "ep_1", premise: "premise", hook: "hook", beats: ["beat"], stateDelta: {} }, provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [asset] } };
    expect(validateStoryBible(bible).ok).toBe(true);
    expect(validateStoryBible({ ...bible, organizationId: "bad" }).ok).toBe(false);
  });

  it("bounds EDP decisions and detects overlap", () => {
    const base = { schemaVersion: "1.0.0", organizationId: org, frameRate: 30, sources: [{ assetId: asset, durationMs: 5000 }], decisions: [{ sourceAssetId: asset, inMs: 0, outMs: 2000, destinationStartMs: 0 }, { sourceAssetId: asset, inMs: 2000, outMs: 4000, destinationStartMs: 1000 }] };
    const result = validateEditPlan(base);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "overlap")).toBe(true);
    expect(validateEditPlan({ ...base, decisions: [{ sourceAssetId: asset, inMs: 0, outMs: 2000, destinationStartMs: 0 }] }).ok).toBe(true);
  });

  it("compiles a valid EDP into footage Timeline v1", () => {
    const org = "123e4567-e89b-42d3-a456-426614174100";
    const asset = "123e4567-e89b-42d3-a456-426614174101";
    const edp = { schemaVersion: "1.0.0", organizationId: org, frameRate: 30, sources: [{ assetId: asset, durationMs: 10_000 }], decisions: [{ sourceAssetId: asset, track: "video", inMs: 0, outMs: 3_000, destinationStartMs: 0 }] };
    const result = compileEditPlanToTimeline(edp, { timelineId: "tl_123e4567-e89b-42d3-a456-426614174102", organizationId: org });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.timeline.tracks[0]).toMatchObject({ kind: "video", items: [{ provenance: "footage", durationMs: 3_000 }] });
  });
});
