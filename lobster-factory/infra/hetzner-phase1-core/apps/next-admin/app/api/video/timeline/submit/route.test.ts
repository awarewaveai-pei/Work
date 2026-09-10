import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseFrom = vi.hoisted(() => vi.fn());
const createJob = vi.hoisted(() => vi.fn());
const finishJob = vi.hoisted(() => vi.fn());
const submitRemotion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: supabaseFrom }),
}));
vi.mock("@/lib/storage/r2", () => ({
  getDesignsPublicBase: () => new URL("https://assets.example.com"),
}));
vi.mock("@/lib/content/video/job-store", () => ({ createJob, finishJob }));
vi.mock("@/lib/content/video/remotion-client", () => ({ submitRemotion }));

import { POST } from "./route";

const organizationId = "123e4567-e89b-42d3-a456-426614174001";
const imageId = "123e4567-e89b-42d3-a456-426614174002";
const styleId = "123e4567-e89b-42d3-a456-426614174003";
const timeline = {
  schemaVersion: "1.0.0",
  timelineId: "tl_123e4567-e89b-42d3-a456-426614174000",
  organizationId,
  purpose: "marketing",
  frameRate: 30,
  outputProfiles: ["landscape_16_9"],
  styleRef: styleId,
  tracks: [{
    id: "video",
    kind: "video",
    items: [{
      id: "shot",
      startMs: 0,
      durationMs: 3000,
      sourceArtifactId: imageId,
      crop: "cover",
      transitionOut: "cut",
      provenance: "generated",
    }],
  }],
  provenance: {
    capabilityVersions: { "media.timeline_plan": "1.0.0" },
    sourceArtifacts: [imageId, styleId],
  },
};

function request(
  body: unknown,
  options: { role?: string; kind?: string; org?: string } = {},
): NextRequest {
  const { role = "operator", kind = "staff", org = organizationId } = options;
  return new NextRequest("http://localhost/api/video/timeline/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ops-claims-role": role,
      "x-ops-user-kind": kind,
      "x-ops-org-id": org,
    },
    body: JSON.stringify(body),
  });
}

function configureAssets(imageUrl = "https://images.pexels.com/image.jpg"): void {
  supabaseFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        in: async () => ({
          data: [
            { id: imageId, object_url: imageUrl, organization_id: organizationId },
            { id: styleId, object_url: "https://assets.example.com/style.json", organization_id: organizationId },
          ],
          error: null,
        }),
      }),
    }),
  });
}

describe("POST /api/video/timeline/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureAssets();
    createJob.mockResolvedValue({ id: "internal-job", organizationId, status: "running" });
    finishJob.mockResolvedValue(undefined);
    submitRemotion.mockResolvedValue({ ok: true, jobId: "eu-private-job" });
  });

  it("submits one profile through a tenant-owned durable job without exposing the EU id", async () => {
    const response = await POST(request({ timeline }));
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({
      ok: true,
      timelineId: timeline.timelineId,
      outputProfile: "landscape_16_9",
      jobId: "internal-job",
    });
    expect(JSON.stringify(payload)).not.toContain("eu-private-job");
    expect(createJob).toHaveBeenCalledWith(organizationId);
    expect(submitRemotion).toHaveBeenCalledWith(
      "dynamic-slideshow",
      expect.objectContaining({ fps: 30, width: 1920, height: 1080 }),
      { outputFormat: "16x9", fps: 30 },
    );
    expect(finishJob).toHaveBeenCalledWith("internal-job", expect.objectContaining({
      status: "running",
      euJobId: "eu-private-job",
      recordParams: expect.objectContaining({
        timelineId: timeline.timelineId,
        outputProfile: "landscape_16_9",
        organizationId,
        formats: ["16x9"],
      }),
    }));
  });

  it("requires an explicit profile for a multi-output Timeline before creating a job", async () => {
    const response = await POST(request({
      timeline: { ...timeline, outputProfiles: ["vertical_9_16", "landscape_16_9"] },
    }));
    expect(response.status).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
    expect(submitRemotion).not.toHaveBeenCalled();
  });

  it("submits only the requested profile with matching renderer dimensions", async () => {
    const response = await POST(request({
      timeline: { ...timeline, outputProfiles: ["vertical_9_16", "landscape_16_9"] },
      outputProfile: "vertical_9_16",
    }));
    expect(response.status).toBe(202);
    expect(submitRemotion).toHaveBeenCalledWith(
      "dynamic-slideshow",
      expect.objectContaining({ width: 1080, height: 1920 }),
      { outputFormat: "9x16", fps: 30 },
    );
  });

  it("blocks a mismatched client tenant before database or renderer access", async () => {
    const response = await POST(request(
      { timeline },
      { kind: "client", org: "123e4567-e89b-42d3-a456-426614174099" },
    ));
    expect(response.status).toBe(403);
    expect(supabaseFrom).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(submitRemotion).not.toHaveBeenCalled();
  });

  it("rejects an untrusted artifact host before creating a job", async () => {
    configureAssets("https://metadata.internal.example/image.jpg");
    const response = await POST(request({ timeline }));
    expect(response.status).toBe(422);
    expect(createJob).not.toHaveBeenCalled();
    expect(submitRemotion).not.toHaveBeenCalled();
  });

  it("records a renderer rejection on the internal job", async () => {
    submitRemotion.mockResolvedValue({ ok: false, error: "renderer unavailable" });
    const response = await POST(request({ timeline }));
    expect(response.status).toBe(502);
    expect(finishJob).toHaveBeenCalledWith("internal-job", {
      status: "error",
      error: "renderer unavailable",
      statusCode: 502,
    });
    expect(JSON.stringify(await response.json())).not.toContain("eu-private-job");
  });
});
