// The kill switch (lib/research-bridges.ts, plan P0 2026-09-23) sits between the role check and the
// configuration check. Three orderings are asserted: forbidden role wins over the switch, the switch
// wins over configuration (410 with COGNITIVE_OS_* unset or set), and with the switch on the route
// proceeds exactly as before (here: to the organisation lookup).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canWriteTenantConfig = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ops-role", () => ({ canWriteTenantConfig, resolveOpsRole: () => ({ role: "admin", source: "test" }) }));
// null client -> orgOf() answers null -> 404 client_not_found, which is the first thing after the
// switch; enough to prove the request got past it.
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
const importOrganizationSources = vi.hoisted(() => vi.fn());
const importFolderSources = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cognitive-os/import-sources", () => ({ importOrganizationSources, importFolderSources }));
const isCognitiveOsConfigured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cognitive-os/client", () => ({ isCognitiveOsConfigured }));
vi.mock("@/lib/collect/run-jobs", () => ({ startRunJob: vi.fn(), getRunJob: vi.fn() }));

const { POST } = await import("./route");

function post(): Promise<Response> {
  const request = new Request("http://localhost/api/ops/clients/acme/cognitive-os-import", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return POST(request, { params: Promise.resolve({ slug: "acme" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteTenantConfig.mockReturnValue(true);
  isCognitiveOsConfigured.mockReturnValue(true);
  delete process.env.RESEARCH_BRIDGES_ENABLED;
});

afterEach(() => {
  delete process.env.RESEARCH_BRIDGES_ENABLED;
});

describe("POST /api/ops/clients/[slug]/cognitive-os-import (research bridge kill switch)", () => {
  it("answers 410 research_bridges_frozen by default and never consults Cognitive OS", async () => {
    const res = await post();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("research_bridges_frozen");
    expect(body.hint).toContain("Cognitive OS");
    expect(isCognitiveOsConfigured).not.toHaveBeenCalled();
    expect(importOrganizationSources).not.toHaveBeenCalled();
    expect(importFolderSources).not.toHaveBeenCalled();
  });

  it("keeps the role check ahead of the switch: a forbidden role is 403, not 410", async () => {
    canWriteTenantConfig.mockReturnValue(false);
    expect((await post()).status).toBe(403);
  });

  it("proceeds as before when RESEARCH_BRIDGES_ENABLED=true (rollback path)", async () => {
    process.env.RESEARCH_BRIDGES_ENABLED = "true";
    const res = await post();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("client_not_found");
    expect(isCognitiveOsConfigured).toHaveBeenCalledTimes(1);
  });
});
