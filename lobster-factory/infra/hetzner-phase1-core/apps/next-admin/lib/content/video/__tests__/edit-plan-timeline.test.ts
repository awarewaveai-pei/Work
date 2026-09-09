import { describe, expect, it } from "vitest";
import { compileEditPlanToTimeline } from "../edit-plan-timeline";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const ASSET = "123e4567-e89b-42d3-a456-426614174100";

describe("edit plan → footage Timeline", () => {
  it("retains source in-point for the dedicated footage renderer", () => {
    const result = compileEditPlanToTimeline({
      schemaVersion: "1.0.0",
      kind: "edit-decision-plan",
      organizationId: ORG,
      frameRate: 30,
      sources: [{ assetId: ASSET, durationMs: 10_000, storageKey: "video/source.mp4", name: "source" }],
      decisions: [{ sourceAssetId: ASSET, track: "video", inMs: 2_000, outMs: 5_000, destinationStartMs: 0 }],
    }, { timelineId: "tl_123e4567-e89b-42d3-a456-426614174999", organizationId: ORG });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.timeline.tracks[0]).toMatchObject({ items: [{ sourceArtifactId: ASSET, sourceStartMs: 2_000, durationMs: 3_000 }] });
  });
});

