// Lists every organization's Postiz channels, so a customer gets 403 even if its role ever read as admin (step-8 C-R4).
import { describe, expect, it, vi } from "vitest";

const listAllIntegrations = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canWriteTenantConfig: () => true }));
vi.mock("@/lib/content/postiz", () => ({ listAllIntegrations, getPostizConfig: () => ({}) }));
import { GET } from "./route";

const at = "https://content.aware-wave.com/api/content/social-admin/integrations";

describe("GET /api/content/social-admin/integrations", () => {
  it("refuses a customer before listing anything", async () => {
    const res = await GET(new Request(at, { headers: { "x-ops-user-kind": "client", "x-ops-org-id": "11111111-1111-4111-8111-111111111111" } }));
    expect(res.status).toBe(403);
    expect(listAllIntegrations).not.toHaveBeenCalled();
  });
  it("lists for staff", async () => {
    expect((await GET(new Request(at, { headers: { "x-ops-user-kind": "staff" } }))).status).toBe(200);
  });
});
