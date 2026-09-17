import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isCognitiveOsConfigured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cognitive-os/client", () => ({ isCognitiveOsConfigured }));

const importOrganizationSources = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cognitive-os/import-sources", () => ({ importOrganizationSources }));

const { POST } = await import("./route");

const TOKEN = "test-token-value-that-is-long-enough";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

// `auth` default only applies when the argument is OMITTED. Passing `undefined` explicitly would
// also trigger a JS default parameter, so "no header" is spelled `null`, never `undefined`.
function req(body?: unknown, auth: string | null = `Bearer ${TOKEN}`): Request {
  return new Request("http://localhost/api/internal/cognitive-os/import-project-sources", {
    method: "POST",
    headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COGNITIVE_OS_IMPORT_INGEST_TOKEN = TOKEN;
  isCognitiveOsConfigured.mockReturnValue(true);
});

afterEach(() => {
  delete process.env.COGNITIVE_OS_IMPORT_INGEST_TOKEN;
});

describe("POST /api/internal/cognitive-os/import-project-sources", () => {
  it("rejects a missing or wrong bearer token", async () => {
    expect((await POST(req({ organizationId: ORG_ID }, null))).status).toBe(401);
    expect((await POST(req({ organizationId: ORG_ID }, "Bearer wrong"))).status).toBe(401);
    expect(importOrganizationSources).not.toHaveBeenCalled();
  });

  it("fails closed when the token is not configured at all", async () => {
    delete process.env.COGNITIVE_OS_IMPORT_INGEST_TOKEN;
    const res = await POST(req({ organizationId: ORG_ID }));
    expect(res.status).toBe(401);
  });

  it("answers 503 when Cognitive OS credentials are not configured", async () => {
    isCognitiveOsConfigured.mockReturnValue(false);
    const res = await POST(req({ organizationId: ORG_ID }));
    expect(res.status).toBe(503);
    expect(importOrganizationSources).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON and a missing organizationId", async () => {
    const badJson = new Request("http://localhost/x", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{not json" });
    expect((await POST(badJson)).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
  });

  it("runs the import and returns its summary on success", async () => {
    const summary = { organizationId: ORG_ID, projectId: "proj-1", totalCandidates: 3, imported: 2, alreadyImported: 0, rejected: [], errors: [] };
    importOrganizationSources.mockResolvedValue(summary);

    const res = await POST(req({ organizationId: ORG_ID, projectName: "Custom Name" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, summary });
    expect(importOrganizationSources).toHaveBeenCalledWith(ORG_ID, { projectName: "Custom Name" });
  });
});
