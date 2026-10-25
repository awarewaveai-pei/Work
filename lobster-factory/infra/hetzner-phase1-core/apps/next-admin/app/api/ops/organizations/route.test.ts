// POST /api/ops/organizations writes; without the service role key it must answer 503, never fall back to the anon client.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({}), getSupabaseWriteClient: () => null }));
vi.mock("../../../../lib/supabase-server", () => ({ getSupabaseServerClient: () => ({}), getSupabaseWriteClient: () => null }));
import { POST } from "./route";

describe("POST /api/ops/organizations", () => {
  it("returns 503 supabase_write_not_configured when no write client", async () => {
    const res = await POST(new Request("https://app.aware-wave.com/api/ops/organizations", {
      method: "POST",
      headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner" },
      body: JSON.stringify({ slug: "a", name: "A" }),
    }) as never);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("supabase_write_not_configured");
  });
});
