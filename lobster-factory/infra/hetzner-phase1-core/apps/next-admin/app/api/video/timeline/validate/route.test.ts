import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MEDIA_TIMELINE_V1_SCHEMA } from "@/lib/content/video/timeline-v1";

const mocks = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/ops-role", () => ({
  resolveOpsRole: () => ({ role: "owner" }),
  canCreateAiImageJob: () => mocks.allowed,
}));
import { POST } from "./route";

const validTimeline = {
  schemaVersion: MEDIA_TIMELINE_V1_SCHEMA,
  timelineId: "tl_123e4567-e89b-42d3-a456-426614174000",
  organizationId: "123e4567-e89b-42d3-a456-426614174001",
  purpose: "marketing",
  frameRate: 30,
  outputProfiles: ["vertical_9_16"],
  tracks: [{ id: "video_main", kind: "video", items: [{ id: "shot_001", startMs: 0, durationMs: 3000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174100", crop: "cover", transitionOut: "cut", provenance: "generated" }] }],
  styleRef: "123e4567-e89b-42d3-a456-426614174104",
  provenance: { capabilityVersions: { "media.timeline_plan": "1.0.0" }, sourceArtifacts: ["123e4567-e89b-42d3-a456-426614174100", "123e4567-e89b-42d3-a456-426614174104"] },
};
function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/video/timeline/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/video/timeline/validate", () => {
  beforeEach(() => { mocks.allowed = true; });

  it("returns a structural-only receipt and never claims render readiness", async () => {
    const response = await POST(request({ timeline: validTimeline }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true, stage: "structural_only", readyForRender: false,
      pendingChecks: expect.arrayContaining(["artifact_ownership", "renderer_feasibility"]),
    }));
  });

  it("returns structured validation errors for an invalid Timeline", async () => {
    const response = await POST(request({ timeline: { ...validTimeline, frameRate: 29 } }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "Timeline v1 結構驗證失敗" });
  });

  it("blocks an unauthorized caller before reading Timeline content", async () => {
    mocks.allowed = false;
    const response = await POST(request({ timeline: validTimeline }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
  });
});
