import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const baseReport = (kind: "technical" | "caption", status = "passed") => ({ id: `${kind}-1`, kind, status, candidateAssetId: "asset-1", candidateChecksum: "sha-a", profileId: "default", profileVersion: "1" });
const request = (body: unknown, headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/video/release/preflight", { method: "POST", headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff", ...headers }, body: JSON.stringify(body) });

describe("POST /api/video/release/preflight", () => {
  it("approves matching current QA and never claims publication", async () => {
    const response = await POST(request({ organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "sha-a", requiredKinds: ["technical", "caption"], reports: [baseReport("technical"), baseReport("caption")] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, code: "approved", releaseCreatable: true });
  });
  it("blocks stale/failed evidence", async () => {
    const response = await POST(request({ organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "sha-a", requiredKinds: ["technical"], reports: [baseReport("technical", "failed")] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "failed_qa", releaseCreatable: false });
  });
  it("rejects a client preflight for a foreign organization", async () => {
    const response = await POST(request({ organizationId: org, candidateAssetId: "asset-1", candidateChecksum: "sha-a", requiredKinds: ["technical"], reports: [baseReport("technical")] }, { "x-ops-user-kind": "client", "x-ops-org-id": "123e4567-e89b-42d3-a456-426614174999" }));
    expect(response.status).toBe(403);
  });
});
