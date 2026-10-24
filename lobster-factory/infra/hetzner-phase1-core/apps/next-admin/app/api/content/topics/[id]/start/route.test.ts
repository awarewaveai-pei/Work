// 「核准並開始」 counts against the brand's own daily limit (set on /ops/schedules, 0125), the same one its schedule uses.
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  topic: { id: "t1", organization_id: "org-a", status: "approved", version: 2, formats: ["article", "social"] } as Record<string, unknown>,
  start: vi.fn(async () => null),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/entitlements/grant", () => ({ thenRun: {}, withFeature: (_k: string, _h: unknown) => (r: Request, run: () => Promise<Response>) => run() }));
vi.mock("@/lib/schedules/store", () => ({ storedDailyLimit: async () => 7 }));
vi.mock("@/lib/content/topics/store", async (orig) => ({ ...(await orig<typeof import("@/lib/content/topics/store")>()), topicById: async () => m.topic }));
vi.mock("@/lib/content/topics/make", () => ({ topicDeps: () => ({ blocker: async () => null, start: m.start }) }));

const { POST } = await import("./route");

describe("POST /api/content/topics/[id]/start", () => {
  it("uses the brand's own limit and says it when reached", async () => {
    const res = await POST(new Request("http://localhost/api/content/topics/t1/start", {
      method: "POST", headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" },
      body: JSON.stringify({ version: 2 }),
    }), { params: Promise.resolve({ id: "t1" }) });
    expect(m.start).toHaveBeenCalledWith(m.topic, expect.any(String), 7);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("今天已經開始 7 題");
  });
});
