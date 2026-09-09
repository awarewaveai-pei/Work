import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { POST } from "./route";

const supabaseFrom = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: supabaseFrom }) }));

const timeline = {
  schemaVersion: "1.0.0", timelineId: "tl_123e4567-e89b-42d3-a456-426614174000", organizationId: "123e4567-e89b-42d3-a456-426614174001", purpose: "marketing", frameRate: 30,
  outputProfiles: ["landscape_16_9"], styleRef: "123e4567-e89b-42d3-a456-426614174003",
  tracks: [{ id: "video", kind: "video", items: [{ id: "shot", startMs: 0, durationMs: 3000, sourceArtifactId: "123e4567-e89b-42d3-a456-426614174002", crop: "cover", transitionOut: "cut", provenance: "generated" }] }],
  provenance: { capabilityVersions: { "media.timeline_plan": "1.0.0" }, sourceArtifacts: ["123e4567-e89b-42d3-a456-426614174002", "123e4567-e89b-42d3-a456-426614174003"] },
};

function request(body: unknown, role = "owner", userKind = "staff", orgId?: string) { return new NextRequest("http://localhost/api/video/timeline/compile", { method: "POST", headers: { "Content-Type": "application/json", "x-ops-claims-role": role, "x-ops-user-kind": userKind, ...(orgId ? { "x-ops-org-id": orgId } : {}) }, body: JSON.stringify(body) }); }

describe("POST /api/video/timeline/compile", () => {
  const configureAssets = (objectUrl = "https://images.pexels.com/image.jpg") => {
    supabaseFrom.mockReturnValue({ select: () => ({ eq: () => ({ in: async () => ({ data: [
      { id: "123e4567-e89b-42d3-a456-426614174002", object_url: objectUrl },
      { id: "123e4567-e89b-42d3-a456-426614174003", object_url: "https://images.pexels.com/style.jpg" },
    ], error: null }) }) }) });
  };

  it("compiles a tenant-scoped timeline without submitting a render", async () => {
    configureAssets();
    const response = await POST(request({ timeline }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, stage: "compiled", renderSubmission: "pending" });
  });

  it("fails closed when an artifact URL cannot be resolved", async () => {
    configureAssets("https://untrusted.example/private.jpg");
    const response = await POST(request({ timeline }));
    expect(response.status).toBe(422);
  });

  it("fails closed when provenance names an asset outside the tenant query", async () => {
    supabaseFrom.mockReturnValue({ select: () => ({ eq: () => ({ in: async () => ({
      data: [{ id: "123e4567-e89b-42d3-a456-426614174002", object_url: "https://images.pexels.com/image.jpg" }],
      error: null,
    }) }) }) });
    const response = await POST(request({ timeline }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: "unresolved_artifact" })],
    });
  });

  it("rejects null timelines", async () => {
    const response = await POST(request({ timeline: null }));
    expect(response.status).toBe(400);
  });

  it("rejects viewers before reading the body", async () => {
    const response = await POST(request({ timeline }, "viewer"));
    expect(response.status).toBe(403);
  });

  it("enforces client organization binding", async () => {
    configureAssets();
    const org = timeline.organizationId;
    expect((await POST(request({ timeline }, "operator", "client", org))).status).toBe(200);
    supabaseFrom.mockClear();
    expect((await POST(request({ timeline }, "operator", "client", "123e4567-e89b-42d3-a456-426614174099"))).status).toBe(403);
    expect(supabaseFrom).not.toHaveBeenCalled();
    supabaseFrom.mockClear();
    expect((await POST(request({ timeline }, "operator", "client"))).status).toBe(403);
    expect(supabaseFrom).not.toHaveBeenCalled();
  });
});
