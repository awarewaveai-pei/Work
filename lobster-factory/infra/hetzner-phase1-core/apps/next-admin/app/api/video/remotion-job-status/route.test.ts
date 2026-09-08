import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getJob = vi.hoisted(() => vi.fn());
const pollRemotion = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/job-store", () => ({ getJob }));
vi.mock("@/lib/content/video/remotion-client", () => ({ pollRemotion }));

import { GET } from "./route";

const req = (kind = "staff", org?: string) => new NextRequest("http://localhost/api/video/remotion-job-status?jobId=j1", { headers: { "x-ops-claims-role": "operator", "x-ops-user-kind": kind, ...(org ? { "x-ops-org-id": org } : {}) } });

describe("tenant-safe Remotion job status", () => {
  it("checks job ownership before polling Remotion", async () => {
    getJob.mockResolvedValue({ id: "j1", status: "running", organizationId: "123e4567-e89b-42d3-a456-426614174001", euJobId: "eu1" });
    pollRemotion.mockResolvedValue({ status: "rendering" });
    expect((await GET(req("client", "123e4567-e89b-42d3-a456-426614174001"))).status).toBe(200);
    getJob.mockClear(); pollRemotion.mockClear();
    expect((await GET(req("client", "123e4567-e89b-42d3-a456-426614174099"))).status).toBe(403);
    expect(pollRemotion).not.toHaveBeenCalled();
  });

  it("does not expose an internal id when no EU job exists", async () => {
    getJob.mockResolvedValue({ id: "j1", status: "running", organizationId: "123e4567-e89b-42d3-a456-426614174001" });
    const response = await GET(req("staff"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "running" });
    expect(pollRemotion).not.toHaveBeenCalled();
  });
});
