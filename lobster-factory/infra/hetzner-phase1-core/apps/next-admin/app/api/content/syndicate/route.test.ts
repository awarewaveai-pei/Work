// T18: this route has no per-client target (drafts social copy, publishing happens elsewhere) --
// gates with organizationId null, before the Anthropic call (itself an outbound request).
// checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
vi.mock("@/lib/ai/log-ai-call", () => ({ logAiCall: vi.fn() }));
vi.mock("@/lib/ai/cost-calculator", () => ({
  textCallCostUsd: () => 0,
  resolveTextRate: () => ({ rate: { vendor: "anthropic" } }),
}));

const create = vi.hoisted(() =>
  vi.fn(async () => ({
    content: [{ type: "text", text: "{}" }],
    model: "claude-haiku-4-5-20251001",
    usage: { input_tokens: 1, output_tokens: 1 },
  })),
);
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

process.env.ANTHROPIC_API_KEY = "test-key";

const { POST } = await import("./route");

function req(body: unknown) {
  return new Request("http://localhost/api/content/syndicate", { method: "POST", body: JSON.stringify(body) });
}
const BODY = { article: "hello world, this is the article body used for the test.", platforms: ["linkedin"] };

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  create.mockClear();
});

describe("POST /api/content/syndicate -- system-mode gate", () => {
  it("blocked: 423, no Anthropic call", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await POST(req(BODY));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(create).not.toHaveBeenCalled();
  });

  it("allowed: continues to the Anthropic call", async () => {
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
  });

  it("gates with organizationId null (no org param on this route)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable" });
    await POST(req(BODY));
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(null, null);
  });
});
