// service-profiles PATCH (SPEC D20, D23): sampled review unlocks only after enough emails a person approved; a privacy
// page is saved only when it answers and the operator confirmed the list.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "00000000-0000-4000-8000-0000000000p1";
const m = vi.hoisted(() => ({ count: vi.fn(async () => 0), fetch: vi.fn(async () => ({})), updates: [] as unknown[] }));

vi.mock("@/lib/outreach/review-policy", () => ({ humanApprovedCount: m.count, SAMPLED_MIN_HUMAN_APPROVED: 50 }));
vi.mock("@/lib/collect/net/remote-file", () => {
  class RemoteFileError extends Error { constructor(readonly reason: string) { super(reason); } }
  return { fetchRemoteFile: m.fetch, RemoteFileError };
});
vi.mock("@/lib/org-client", () => {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit"]) q[k] = () => q;
  q.update = (p: unknown) => { m.updates.push(p); return q; };
  q.maybeSingle = async () => ({ data: { organization_id: null, id: ID }, error: null });
  return { getOrgSupabaseWriteClient: async () => ({ from: () => q }) };
});

const { PATCH } = await import("./route");
const call = (body: Record<string, unknown>) => PATCH(new Request("http://app.test/api/outreach/service-profiles", { method: "PATCH",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", ...body }) }));

beforeEach(() => { m.updates.length = 0; m.count.mockReset(); m.fetch.mockReset(); m.fetch.mockResolvedValue({}); });

describe("PATCH service profile policy", () => {
  it("refuses sampled below the human-approved threshold and allows it at the threshold", async () => {
    m.count.mockResolvedValue(49);
    const refused = await call({ reviewMode: "sampled" });
    expect(refused.status).toBe(409);
    expect(m.updates).toEqual([]);
    m.count.mockResolvedValue(50);
    expect((await call({ reviewMode: "sampled" })).status).toBe(200);
    expect(m.updates[0]).toMatchObject({ review_mode: "sampled" });
  });

  it("saves a privacy page only with the checklist confirmed and a page that answers", async () => {
    expect((await call({ privacyUrl: "https://p.example/privacy" })).status).toBe(400);
    const { RemoteFileError } = await import("@/lib/collect/net/remote-file");
    m.fetch.mockRejectedValueOnce(new (RemoteFileError as unknown as new (r: string) => Error)("not_found"));
    expect((await call({ privacyUrl: "https://p.example/privacy", privacyChecklistConfirmed: true })).status).toBe(400);
    expect(m.updates).toEqual([]);
    expect((await call({ privacyUrl: "https://p.example/privacy", privacyChecklistConfirmed: true })).status).toBe(200);
    expect(m.updates[0]).toMatchObject({ privacy_url: "https://p.example/privacy" });
  });
});
