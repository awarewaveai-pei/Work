// GET /api/content/sites filters (client-rail card K3): ?organizationId= goes through effectiveOrgId (a customer
// always gets its own organization), ?siteId= narrows to one row, bad ids are 400, no parameter = unchanged.
// ops-role and tenant-guard are the real ones; the table fake filters like the database does.
import { beforeEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = (id: string, org: string | null) => ({ id, name: id, url: `https://${id}.example`, color: "#111", active: true,
  note: null, created_at: "2026-01-01", token: "t", username: "u", content_defaults: null, organization_id: org });
const ROWS = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from() {
      let rows = ROWS;
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        order: async () => ({ data: rows, error: null }),
      };
      return q;
    },
  }),
}));
import { GET } from "../route";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const clientOf = (org: string) => ({ "x-ops-user-kind": "client", "x-ops-org-id": org });
const at = "https://app.aware-wave.com/api/content/sites";
const get = async (qs: string, h: Record<string, string>) => {
  const r = await GET(new Request(at + qs, { headers: h }));
  return { status: r.status, body: await r.json() };
};
const ids = (b: { sites: { id: string }[] }) => b.sites.map((s) => s.id);

beforeEach(() => { ROWS.length = 0; ROWS.push(row(S1, A), row(S2, B)); });

describe("GET /api/content/sites filters", () => {
  it("staff: ?organizationId= keeps only that client's sites", async () => {
    expect(ids((await get(`?organizationId=${B}`, staff)).body)).toEqual([S2]);
  });

  it("a customer asking for another organization still gets only its own", async () => {
    expect(ids((await get(`?organizationId=${B}`, clientOf(A))).body)).toEqual([S1]);
  });

  it("?siteId= returns one row, or none when a customer asks for another customer's site", async () => {
    expect(ids((await get(`?siteId=${S1}`, staff)).body)).toEqual([S1]);
    expect(ids((await get(`?siteId=${S2}`, clientOf(A))).body)).toEqual([]);
  });

  it("a malformed id is 400 invalid_id", async () => {
    for (const qs of ["?organizationId=nope", "?siteId=nope"]) {
      expect(await get(qs, staff)).toEqual({ status: 400, body: { ok: false, error: "invalid_id" } });
    }
  });

  it("no parameter: staff see every site, a customer its own", async () => {
    expect(ids((await get("", staff)).body)).toEqual([S1, S2]);
    expect(ids((await get("", clientOf(B))).body)).toEqual([S2]);
  });
});
