import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb } from "@/lib/content/video/__tests__/fake-db";
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb(() => ({ wp_sites: [] })) }));
vi.mock("@/lib/social/store", () => ({ listAccounts: async () => [{ id: "fb", platform: "facebook", status: "connected" }] }));
import { POST } from "./route";
beforeEach(() => {
  vi.stubEnv("VW_INTERNAL_TOKEN", "test-only");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ capabilities: { openai_tts: false } })));
});
const call = async (until: string) => (await POST(new Request("http://localhost/api/internal/video/workbench/quick-render/quote", {
  method: "POST", headers: { authorization: "Bearer test-only", "content-type": "application/json" },
  body: JSON.stringify({ organizationId: "123e4567-e89b-42d3-a456-426614174001", scenes: 2, ttsChars: 4, ratios: ["16x9"], until, scriptText: "豆花很好吃",
    fill: { mode: "ai", pictures: 2, shots: [{ id: "s1", imageModel: "flux-schnell" }, { id: "s2", imageModel: "openai-high" }] } }),
}))).json();
it("quotes each missing shot's actual selected model", async () => {
  const q = await call("video");
  expect(q.ok).toBe(true);
  expect(q.fill.byShotTwd.s1).toBeLessThan(q.fill.byShotTwd.s2);
  expect(q.totalUsd).toBe(q.fill.usd + q.perRatioUsd);
});
it("includes social writer calls only when the stop point is drafts", async () => {
  const q = await call("drafts");
  expect(q.draftsUsd).toBeGreaterThan(0);
  expect(q.totalUsd).toBe(q.fill.usd + q.perRatioUsd + q.draftsUsd);
});
