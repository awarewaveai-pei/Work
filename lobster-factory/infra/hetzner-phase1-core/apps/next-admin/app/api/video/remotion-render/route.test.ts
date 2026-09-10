import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const createJob = vi.hoisted(() => vi.fn());
const finishJob = vi.hoisted(() => vi.fn());
const submitRemotion = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/job-store", () => ({ createJob, finishJob }));
vi.mock("@/lib/content/video/remotion-client", () => ({ submitRemotion }));
vi.mock("@/lib/content/blocks/video-pipeline", () => ({ resolveOrgId: () => "123e4567-e89b-42d3-a456-426614174001" }));
vi.mock("@/lib/storage/r2", () => ({ getDesignsPublicBase: () => new URL("https://assets.example.com") }));

import { POST } from "./route";

const request = (body: unknown, org = "123e4567-e89b-42d3-a456-426614174001") => new NextRequest("http://localhost/api/video/remotion-render", {
  method: "POST", headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-org-id": org }, body: JSON.stringify(body),
});

describe("Remotion render job boundary", () => {
  it("creates a tenant-owned internal job and never returns EU id", async () => {
    createJob.mockResolvedValue({ id: "local-1" });
    submitRemotion.mockResolvedValue({ ok: true, jobId: "eu-secret" });
    const response = await POST(request({ templateId: "dynamic-slideshow", props: {} }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, jobId: "local-1" });
    expect(createJob).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174001");
    expect(finishJob).toHaveBeenCalledWith("local-1", expect.objectContaining({ euJobId: "eu-secret" }));
  });

  it("records renderer failure on the durable job", async () => {
    createJob.mockResolvedValue({ id: "local-2" });
    submitRemotion.mockResolvedValue({ ok: false, error: "renderer down" });
    const response = await POST(request({ templateId: "dynamic-slideshow", props: {} }));
    expect(response.status).toBe(502);
    expect(finishJob).toHaveBeenCalledWith("local-2", expect.objectContaining({ status: "error" }));
  });

});
