// leads PATCH (SPEC §5.3, D23): a lead takes only a service profile of its own organization; database refusals
// (0149: one lead per email, profile of the same organization) are 409s, not 500s.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const LEAD = "00000000-0000-4000-8000-00000000001a";
const PROFILE = "00000000-0000-4000-8000-0000000000b1";
const s = vi.hoisted(() => ({ profileOrg: null as string | null, updates: [] as unknown[], updateError: null as unknown, filters: [] as unknown[][], curEmail: null as string | null }));

vi.mock("@/lib/org-client", () => {
  const query = (table: string) => {
    let updating = false;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (...a: unknown[]) => { s.filters.push(["eq", table, ...a]); return q; };
    q.is = (...a: unknown[]) => { s.filters.push(["is", table, ...a]); return q; };
    q.update = (p: unknown) => { updating = true; s.updates.push(p); return q; };
    q.maybeSingle = async () => {
      if (table === "co_service_profiles") {
        // the profile row matches only a filter on its own organization
        const want = s.filters.filter((f) => f[1] === "co_service_profiles" && f[2] === "organization_id").at(-1);
        const matches = want && (want[0] === "is" ? s.profileOrg === null : want[3] === s.profileOrg);
        return { data: matches ? { id: PROFILE } : null, error: null };
      }
      if (updating) return s.updateError ? { data: null, error: s.updateError } : { data: { id: LEAD }, error: null };
      return { data: { organization_id: ORG, email: s.curEmail }, error: null };
    };
    return q;
  };
  return { getOrgSupabaseWriteClient: async () => ({ from: query }) };
});

const { PATCH, POST } = await import("./route");
const call = (serviceProfileId: string | null) => PATCH(new Request("http://app.test/api/outreach/leads", { method: "PATCH",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ id: LEAD, serviceProfileId }) }));

beforeEach(() => { s.updates.length = 0; s.filters.length = 0; s.updateError = null; s.profileOrg = ORG; s.curEmail = null; });

describe("PATCH /api/outreach/leads assigns a service profile", () => {
  it("assigns a profile of the lead's organization", async () => {
    expect((await call(PROFILE)).status).toBe(200);
    expect(s.updates[0]).toMatchObject({ service_profile_id: PROFILE });
  });

  it("refuses a profile of another organization (the agency's included) and writes nothing", async () => {
    s.profileOrg = null;
    expect((await call(PROFILE)).status).toBe(404);
    s.profileOrg = "00000000-0000-4000-8000-0000000000c2";
    expect((await call(PROFILE)).status).toBe(404);
    expect(s.updates).toEqual([]);
  });

  it("clears the profile with null", async () => {
    expect((await call(null)).status).toBe(200);
    expect(s.updates[0]).toMatchObject({ service_profile_id: null });
  });

  it("the database's own refusal is 409 profile_other_org", async () => {
    s.updateError = { code: "P0149", message: "co_leads: service profile belongs to another organization" };
    const res = await call(PROFILE);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("profile_other_org");
  });
});

describe("POST update: a changed address loses its source (SPEC D25)", () => {
  const save = (email: string) => POST(new Request("http://app.test/api/outreach/leads", { method: "POST",
    headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
    body: JSON.stringify({ id: LEAD, name: "店", email }) }));
  it("another address clears consent_source (a self_published mark never carries over); the same one keeps it", async () => {
    s.curEmail = "info@shop.example";
    await save("guess@shop.example");
    expect(s.updates[0]).toMatchObject({ email: "guess@shop.example", consent_source: null });
    await save("INFO@shop.example");
    expect(s.updates[1]).not.toHaveProperty("consent_source");
  });
});
