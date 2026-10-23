import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { MEDIA_TIMELINE_V1_SCHEMA } from "@/lib/content/video/timeline-v1";
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
function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/video/timeline/validate", { method: "POST", headers: { "Content-Type": "application/json", "x-ops-claims-role": "owner", "x-ops-user-kind": "staff", ...headers }, body: JSON.stringify(body) });
}

describe("POST /api/video/timeline/validate", () => {
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

  it("rejects a client Timeline that names a different organization", async () => {
    const response = await POST(request(
      { timeline: validTimeline },
      { "x-ops-claims-role": "operator", "x-ops-user-kind": "client", "x-ops-org-id": "123e4567-e89b-42d3-a456-426614174999" },
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden: org mismatch" });
  });

  it("allows a client Timeline only for the bound organization", async () => {
    const response = await POST(request(
      { timeline: validTimeline },
      { "x-ops-claims-role": "operator", "x-ops-user-kind": "client", "x-ops-org-id": validTimeline.organizationId },
    ));
    expect(response.status).toBe(200);
  });

  it("rejects a client's Timeline bound to another organization", async () => {
    const response = await POST(request(
      { timeline: validTimeline },
      { "x-ops-user-kind": "client", "x-ops-org-id": "123e4567-e89b-42d3-a456-426614174999" },
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden: org mismatch" });
  });

  it("refuses a client with no organization binding before reading Timeline content", async () => {
    const response = await POST(request({ timeline: validTimeline }, { "x-ops-claims-role": "operator", "x-ops-user-kind": "client" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
  });

  it("blocks a viewer before reading Timeline content", async () => {
    const response = await POST(request({ timeline: validTimeline }, { "x-ops-claims-role": "viewer" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "forbidden" });
  });
});
