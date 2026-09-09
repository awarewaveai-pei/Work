import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const loadAuthoritativeReleaseEvidence = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/content/video/release-evidence", () => ({ loadAuthoritativeReleaseEvidence }));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const asset = "123e4567-e89b-42d3-a456-426614174002";
const checksum = "0123456789abcdef";
const request = (role: string, body: unknown) => new NextRequest("http://localhost/api/video/release", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-claims-role": role, "x-ops-user-kind": "staff" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = "true";
  insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "123e4567-e89b-42d3-a456-426614174003", organization_id: org, candidate_asset_id: asset, status: "release_approved", qa_report_ids: ["server-qa"], created_at: "2026-09-09T00:00:00Z", approved_at: "2026-09-09T00:00:00Z" }, error: null }) }) });
  getSupabaseWriteClient.mockReturnValue({ from: () => ({ insert }) });
});

afterEach(() => { delete process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED; });

describe("POST /api/video/release", () => {
  it("rejects operator release approval before database access", async () => {
    const response = await POST(request("operator", { organizationId: org, candidateAssetId: asset, candidateChecksum: checksum }));
    expect(response.status).toBe(403);
    expect(getSupabaseWriteClient).not.toHaveBeenCalled();
  });

  it("does not accept forged client reports when server evidence blocks", async () => {
    loadAuthoritativeReleaseEvidence.mockResolvedValue({ ok: true, reports: [], gate: { ok: false, code: "missing_qa", message: "missing required QA", reportIds: [] } });
    const response = await POST(request("owner", { organizationId: org, candidateAssetId: asset, candidateChecksum: checksum, reports: [{ id: "forged", status: "passed" }], requiredKinds: ["technical"] }));
    expect(response.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });

  it("stores only server-selected report IDs for an owner-approved Release", async () => {
    loadAuthoritativeReleaseEvidence.mockResolvedValue({ ok: true, reports: [], gate: { ok: true, code: "approved", message: "approved", reportIds: ["server-qa"] } });
    const response = await POST(request("owner", { organizationId: org, candidateAssetId: asset, candidateChecksum: checksum, reports: [{ id: "forged" }], releaseJson: { title: "approved" } }));
    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ qa_report_ids: ["server-qa"] }));
  });
});
