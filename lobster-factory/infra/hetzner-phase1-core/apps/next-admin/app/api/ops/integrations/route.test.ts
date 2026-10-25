// GET /api/ops/integrations reads one client's connections (?organization_id=), never every organization; a client
// account may read only its own organization. ops-role and tenant-guard are the real ones.
import { beforeEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const eqs = vi.hoisted(() => [] as Array<[string, string, unknown]>);
vi.mock("@/lib/supabase-server", () => {
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        order: () => q,
        eq: (col: string, v: unknown) => { eqs.push([table, col, v]); return q; },
        then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }),
      };
      return q;
    },
  };
  return { getSupabaseServerClient: () => client, getSupabaseWriteClient: () => client };
});
import { GET } from "./route";

const at = (qs: string, h: Record<string, string>) => GET(new Request(`https://app.aware-wave.com/api/ops/integrations${qs}`, { headers: h }));
const client = (org: string) => ({ "x-ops-user-kind": "client", "x-ops-org-id": org, "x-ops-claims-role": "owner" });
const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner" };

beforeEach(() => { eqs.length = 0; });

describe("GET /api/ops/integrations", () => {
  it("needs one organization_id and reads only that organization", async () => {
    expect((await at("", staff)).status).toBe(400);
    expect(eqs).toEqual([]);
    expect((await at(`?organization_id=${A}`, staff)).status).toBe(200);
    expect(eqs).toEqual(expect.arrayContaining([["organizations", "id", A], ["assets", "organization_id", A], ["tenant_integration_bindings", "organization_id", A]]));
  });

  // the role gate refuses a client account before the organization check (assertOrgAccess stays as the second wall)
  it("a client account reads nothing, its own organization included", async () => {
    expect((await at(`?organization_id=${B}`, client(A))).status).toBe(403);
    expect((await at(`?organization_id=${A}`, client(A))).status).toBe(403);
    expect(eqs).toEqual([]);
  });
});
