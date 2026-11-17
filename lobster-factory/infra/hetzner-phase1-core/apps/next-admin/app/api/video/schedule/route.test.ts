import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
import { GET } from "./route";
const org = "123e4567-e89b-42d3-a456-426614174001", other = "123e4567-e89b-42d3-a456-426614174009";
const req = (id: string) => new NextRequest(`http://localhost/api/video/schedule?organizationId=${id}`, { headers: { "x-ops-claims-role": "owner", "x-ops-user-kind": "client", "x-ops-org-id": org } });
it("refuses a foreign brand before querying", async () => { getSupabaseWriteClient.mockClear(); expect((await GET(req(other))).status).toBe(403); expect(getSupabaseWriteClient).not.toHaveBeenCalled(); });
it("scopes the queue to the brand and reports DB failure", async () => {
  const eq = vi.fn(); let failed = false;
  const q = { select: () => q, eq: (...args: unknown[]) => { eq(...args); return q; }, order: () => q, limit: async () => ({ data: [{ title: "排程", status: "failed", last_error: "停止原因" }], error: failed ? { message: "db" } : null }) };
  getSupabaseWriteClient.mockReturnValue({ from: () => q });
  expect((await (await GET(req(org))).json()).items[0].last_error).toBe("停止原因"); expect(eq).toHaveBeenCalledWith("organization_id", org);
  failed = true; expect((await GET(req(org))).status).toBe(500);
});
