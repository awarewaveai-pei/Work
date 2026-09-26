import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getJob = vi.hoisted(() => vi.fn());
const finishJob = vi.hoisted(() => vi.fn());
const pollRemotion = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/job-store", () => ({ getJob, finishJob }));
vi.mock("@/lib/content/video/remotion-client", () => ({ pollRemotion }));

// T20: was GET -- moved to POST (the done/error branches finalize the job: media_assets insert +
// job-store write, which a GET must never risk). No GET is exported any more -- Next.js answers a
// raw GET to this route 405 on its own (see the dedicated test below).
import { POST } from "./route";

const req = (kind = "staff", org?: string) => new NextRequest("http://localhost/api/video/remotion-job-status?jobId=j1", { method: "POST", headers: { "x-ops-claims-role": "operator", "x-ops-user-kind": kind, ...(org ? { "x-ops-org-id": org } : {}) } });

describe("tenant-safe Remotion job status", () => {
  it("checks job ownership before polling Remotion", async () => {
    getJob.mockResolvedValue({ id: "j1", status: "running", organizationId: "123e4567-e89b-42d3-a456-426614174001", euJobId: "eu1" });
    pollRemotion.mockResolvedValue({ status: "rendering" });
    expect((await POST(req("client", "123e4567-e89b-42d3-a456-426614174001"))).status).toBe(200);
    getJob.mockClear(); pollRemotion.mockClear();
    expect((await POST(req("client", "123e4567-e89b-42d3-a456-426614174099"))).status).toBe(403);
    expect(pollRemotion).not.toHaveBeenCalled();
  });

  it("does not expose an internal id when no EU job exists", async () => {
    getJob.mockResolvedValue({ id: "j1", status: "running", organizationId: "123e4567-e89b-42d3-a456-426614174001" });
    const response = await POST(req("staff"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "running" });
    expect(pollRemotion).not.toHaveBeenCalled();
  });

  it("T20: no GET is exported -- Next.js answers a raw GET to this route 405 on its own", async () => {
    const mod = await import("./route");
    expect((mod as Record<string, unknown>).GET).toBeUndefined();
  });
});
