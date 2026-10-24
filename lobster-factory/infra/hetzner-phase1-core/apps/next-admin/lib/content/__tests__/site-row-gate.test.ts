// siteRowGate: the one tenant check for the by-id site routes (edit, delete, connection test).
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ row: { data: null as unknown, error: null as { message: string } | null } }));
vi.mock("@/lib/supabase-server", () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => m.row };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});

import { siteRowGate } from "../wp-sites";

const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const req = (h: Record<string, string>) => new Request("http://localhost/x", { headers: h });
const STAFF = req({ "x-ops-user-kind": "staff" });
const CLIENT_A = req({ "x-ops-user-kind": "client", "x-ops-org-id": ORG_A });
const CLIENT_B = req({ "x-ops-user-kind": "client", "x-ops-org-id": "bbbbbbbb-0000-4000-8000-00000000000b" });

describe("siteRowGate", () => {
  beforeEach(() => { m.row = { data: { organization_id: ORG_A }, error: null }; });

  it("lets staff and the owning client through", async () => {
    expect(await siteRowGate(STAFF, "s")).toBeNull();
    expect(await siteRowGate(CLIENT_A, "s")).toBeNull();
  });

  it("refuses a client of another organization with 403", async () => {
    expect((await siteRowGate(CLIENT_B, "s"))?.status).toBe(403);
  });

  it("refuses a client on a site nobody owns", async () => {
    m.row = { data: { organization_id: null }, error: null };
    expect((await siteRowGate(CLIENT_A, "s"))?.status).toBe(403);
  });

  it("answers 404 for a missing row and throws on a database error", async () => {
    m.row = { data: null, error: null };
    expect((await siteRowGate(STAFF, "s"))?.status).toBe(404);
    m.row = { data: null, error: { message: "down" } };
    await expect(siteRowGate(STAFF, "s")).rejects.toThrow("wp_sites:owner:down");
  });
});
