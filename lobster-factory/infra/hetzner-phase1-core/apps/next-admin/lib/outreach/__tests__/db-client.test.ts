// A customer's outreach request always reaches its own organization's database, whatever slug it sends; staff choose.
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ orgClient: vi.fn(async (slug: string | null | undefined) => ({ slug })) }));
vi.mock("@/lib/org-client", () => ({ getOrgSupabaseWriteClient: m.orgClient }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: (_c: string, id: string) => ({
  maybeSingle: async () => ({ data: id === "00000000-0000-4000-8000-0000000000c1" ? { slug: "own-org" } : null, error: null }) }) }) }) }) }));

const { outreachDb } = await import("../db-client");
const req = (h: Record<string, string>) => new Request("http://x/api/outreach/leads", { headers: h });

describe("outreachDb", () => {
  it("a customer gets its own organization's database even when it names another slug", async () => {
    expect(await outreachDb(req({ "x-ops-user-kind": "client", "x-ops-org-id": "00000000-0000-4000-8000-0000000000c1" }), "someone-else")).toEqual({ slug: "own-org" });
  });
  it("a customer whose organization cannot be read gets nothing", async () => {
    expect(await outreachDb(req({ "x-ops-user-kind": "client", "x-ops-org-id": "00000000-0000-4000-8000-0000000000c2" }), "someone-else")).toBeNull();
  });
  it("staff choose the client they operate for", async () => {
    expect(await outreachDb(req({ "x-ops-user-kind": "staff" }), "soulful")).toEqual({ slug: "soulful" });
  });
});
