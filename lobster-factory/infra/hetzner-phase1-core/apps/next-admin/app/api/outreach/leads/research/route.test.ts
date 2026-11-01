// leads/research POST: every lead is authorized and its outreach.research grant obtained before the background run
// starts -- a customer naming another organization's lead, a do_not_contact lead or a refused grant starts nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const LEAD = "00000000-0000-4000-8000-00000000001a";
const m = vi.hoisted(() => ({ lead: {} as Record<string, unknown>, started: 0, grant: vi.fn(), job: null as unknown }));

vi.mock("@/lib/entitlements/grant", () => ({ grantFor: m.grant }));
vi.mock("@/lib/outreach/billing", () => ({ billedTo: async () => ({}) }));
vi.mock("@/lib/outreach/research", () => ({ researchLead: async () => ({ status: "done" }) }));
vi.mock("@/lib/collect/run-jobs", () => ({ startRunJob: () => { m.started++; }, getRunJob: () => m.job }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "org-c1" }, error: null }) }) }) }) }) }));
vi.mock("@/lib/org-client", () => ({
  getOrgSupabaseWriteClient: async () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [m.lead], error: null }) }) }) }),
}));

const { POST, GET } = await import("./route");
const { EntitlementRequired } = await import("@/lib/entitlements/can");
const STAFF = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1" };
const CLIENT = { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-user-id": "c-1" };
const call = (who: Record<string, string> = STAFF) => POST(new Request("http://app.test/api/outreach/leads/research", { method: "POST",
  headers: { ...who, "content-type": "application/json" }, body: JSON.stringify({ leadId: LEAD }) }));

beforeEach(() => {
  m.started = 0;
  m.lead = { id: LEAD, organization_id: ORG, name: "小樹", website: "https://tree.example", email: null, do_not_contact: false };
  m.grant.mockReset(); m.grant.mockResolvedValue({ allowed: true });
});

describe("POST /api/outreach/leads/research", () => {
  it("starts a run for a lead the caller may act on", async () => {
    const res = await call();
    expect(res.status).toBe(202);
    expect(m.started).toBe(1);
    expect(m.grant).toHaveBeenCalledWith("outreach.research", expect.anything());
  });

  it("a customer cannot research another organization's lead", async () => {
    m.lead = { ...m.lead, organization_id: "00000000-0000-4000-8000-0000000000c2" };
    expect((await call(CLIENT)).status).toBe(403);
    expect(m.started).toBe(0);
  });

  it("a do_not_contact or warm lead and a refused grant start nothing", async () => {
    m.lead = { ...m.lead, do_not_contact: true };
    expect((await call()).status).toBe(409);
    m.lead = { ...m.lead, do_not_contact: false, status: "replied" };
    expect((await call()).status).toBe(409);
    m.lead = { ...m.lead, status: "qualified" };
    m.grant.mockRejectedValue(new EntitlementRequired("no_entitlement"));
    expect((await call()).status).toBe(403);
    expect(m.started).toBe(0);
  });

  it("polling shows a customer only the outcomes of its own organization, whoever holds the key", async () => {
    m.job = { status: "done", result: [{ leadId: "a", organizationId: ORG }, { leadId: "b", organizationId: "00000000-0000-4000-8000-0000000000c2" }] };
    const res = await GET(new Request(`http://app.test/api/outreach/leads/research?runKey=research-${crypto.randomUUID()}`, { headers: CLIENT }));
    expect((await res.json()).outcomes.map((o: { leadId: string }) => o.leadId)).toEqual(["a"]);
    m.job = null;
  });
});
