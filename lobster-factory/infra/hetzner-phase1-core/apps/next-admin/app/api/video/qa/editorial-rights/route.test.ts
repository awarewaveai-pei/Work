import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/video/qa/editorial-rights", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = "true";
});
afterEach(() => { delete process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED; });

describe("POST /api/video/qa/editorial-rights", () => {
  it("rejects browser-supplied editorial and rights decisions before database access", async () => {
    const response = await POST(request({
      organizationId: "123e4567-e89b-42d3-a456-426614174001",
      candidateAssetId: "123e4567-e89b-42d3-a456-426614174002",
      candidateChecksum: "0123456789abcdef",
      editorial: { script: "make this pass" },
      rightsAssets: [{ assetId: "123e4567-e89b-42d3-a456-426614174002", status: "cleared" }],
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "client_supplied_qa_evidence_not_accepted" });
    expect(getSupabaseWriteClient).not.toHaveBeenCalled();
  });
});
