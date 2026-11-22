import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), runSub: vi.fn(), apiText: "" }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({ actor: "ops:x:someone" }) }));
vi.mock("@/lib/ai/gateway", () => ({
  loadAnthropic: async () => function Anthropic() { return { beta: { messages: { create: m.create } } }; },
  CLAUDE_DEFAULT_MODEL: "claude-opus-5-5",
  claudeFallback: () => ({}),
  claudeIncomplete: () => null,
  claudeParams: () => ({ model: "claude-opus-5-5", max_tokens: 4096 }),
  claudeText: () => m.apiText,
}));
vi.mock("@/lib/ai/log-ai-call", () => ({ logAiCall: vi.fn() }));
// The worker bridge is the seam: runSubText runs for real (lane/owner rules, error text), the queue is replaced.
vi.mock("@/lib/tarot/codex-bridge", async (orig) => ({ ...(await orig<typeof import("@/lib/tarot/codex-bridge")>()), runSubJob: m.runSub }));

import { generateVideoScript } from "../video-script-core";

const scenes = JSON.stringify({ title: "T", description: "D",
  scenes: [{ id: 1, narration: "n", image_prompt: "p", broll_keyword: "k", visual: "custom" }] });
const run = (extra: object) => generateVideoScript({ topic: "感恩日記", lane: "schedule", ...extra } as never, "k");

describe("video script through the subscription chain", () => {
  beforeEach(() => { m.create.mockReset().mockResolvedValue({}); m.runSub.mockReset(); m.apiText = scenes; });

  it("a subscription answer is parsed into scenes and the API is not called", async () => {
    m.runSub.mockResolvedValue({ text: scenes });
    const r = await run({ chain: "claude+api" });
    expect(r).toMatchObject({ ok: true, title: "T", scenes: [{ id: 1 }] });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("a non-JSON subscription answer ends in the existing parse error", async () => {
    m.runSub.mockResolvedValue({ text: "not json" });
    expect(await run({ chain: "claude+api" })).toMatchObject({ ok: false, status: 502, error: expect.stringContaining("JSON 解析失敗") });
  });

  it("an offline subscription segment falls to the API and says why", async () => {
    m.runSub.mockResolvedValue({ error: "sub_worker_offline" });
    const r = await run({ chain: "claude+api" });
    expect(m.create).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ ok: true, skipped: [{ model: "sub-claude-opus", error: "sub_worker_offline" }] });
  });

  it("no chain = the API call alone", async () => {
    const r = await run({});
    expect(m.runSub).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true });
    expect((r as { skipped?: unknown }).skipped).toBeUndefined();
  });

  it("the owner lane for someone who is not the operator never reaches the worker", async () => {
    await generateVideoScript({ topic: "x", chain: "claude+api" }, "k");
    expect(m.runSub).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledOnce();
  });
});
