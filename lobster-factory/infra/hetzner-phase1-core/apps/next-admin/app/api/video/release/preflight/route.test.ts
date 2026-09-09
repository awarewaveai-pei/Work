import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const loadAuthoritativeReleaseEvidence = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/content/video/release-evidence", () => ({ loadAuthoritativeReleaseEvidence }));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const request = (body: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/video/release/preflight", { method: "POST", headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff", ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  getSupabaseWriteClient.mockReturnValue({ from: vi.fn() });
});

describe("POST /api/video/release/preflight", () => {
  it("uses server evidence and ignores client-supplied passed reports", async () => {
    loadAuthoritativeReleaseEvidence.mockResolvedValue({ ok: true, reports: [], gate: { ok: false, code: "missing_qa", message: "missing required QA: technical", reportIds: [] } });
    const response = await POST(request({ organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "0123456789abcdef", requiredKinds: ["technical"], reports: [{ id: "forged", kind: "technical", status: "passed" }] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "missing_qa", releaseCreatable: false });
    expect(loadAuthoritativeReleaseEvidence).toHaveBeenCalledWith(expect.anything(), { organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "0123456789abcdef" });
  });
  it("returns the server gate without creating a Release", async () => {
    loadAuthoritativeReleaseEvidence.mockResolvedValue({ ok: true, reports: [], gate: { ok: true, code: "approved", message: "all required QA passed", reportIds: ["server-qa-1"] } });
    const response = await POST(request({ organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "0123456789abcdef" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, code: "approved", releaseCreatable: true, reportIds: ["server-qa-1"] });
  });
  it("rejects a client preflight for a foreign organization", async () => {
    const response = await POST(request({ organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "0123456789abcdef" }, { "x-ops-user-kind": "client", "x-ops-org-id": "123e4567-e89b-42d3-a456-426614174999" }));
    expect(response.status).toBe(403);
    expect(loadAuthoritativeReleaseEvidence).not.toHaveBeenCalled();
  });
});
