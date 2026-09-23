// Sibling of ../cognitive-os-import/route.test.ts: same kill switch (lib/research-bridges.ts, plan P0
// 2026-09-23), same three orderings asserted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canWriteTenantConfig = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ops-role", () => ({ canWriteTenantConfig, resolveOpsRole: () => ({ role: "admin", source: "test" }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
const importOrganizationSourcesToHci = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hci/import-sources", () => ({ importOrganizationSourcesToHci }));
const isHciConfigured = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hci/client", () => ({ isHciConfigured }));
vi.mock("@/lib/collect/run-jobs", () => ({ startRunJob: vi.fn(), getRunJob: vi.fn() }));

const { POST } = await import("./route");

function post(): Promise<Response> {
  const request = new Request("http://localhost/api/ops/clients/acme/hci-import", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return POST(request, { params: Promise.resolve({ slug: "acme" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteTenantConfig.mockReturnValue(true);
  isHciConfigured.mockReturnValue(true);
  delete process.env.RESEARCH_BRIDGES_ENABLED;
});

afterEach(() => {
  delete process.env.RESEARCH_BRIDGES_ENABLED;
});

describe("POST /api/ops/clients/[slug]/hci-import (research bridge kill switch)", () => {
  it("answers 410 research_bridges_frozen by default and never consults HCI-30", async () => {
    const res = await post();
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("research_bridges_frozen");
    expect(isHciConfigured).not.toHaveBeenCalled();
    expect(importOrganizationSourcesToHci).not.toHaveBeenCalled();
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
    expect(isHciConfigured).toHaveBeenCalledTimes(1);
  });
});
