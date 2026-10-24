import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}) }));
// video-script-core imports this module under two paths; one mock covers both.
vi.mock("@/lib/ai/gateway", () => ({
  loadAnthropic: async () => function Anthropic() { return { beta: { messages: { create: m.create } } }; },
  CLAUDE_DEFAULT_MODEL: "claude-opus",
  claudeFallback: () => ({}),
  claudeIncomplete: () => null,
  claudeParams: () => ({ model: "claude-opus", max_tokens: 4096 }),
  claudeText: () => "not json",
}));

import { generateVideoScript } from "../video-script-core";

const sent = () => m.create.mock.calls[0][0].messages[0].content as string;

describe("video script prompt carries the site's brand voice", () => {
  beforeEach(() => { m.create.mockReset().mockResolvedValue({}); });

  it("adds the brand block when a voice is given", async () => {
    await generateVideoScript({ topic: "感恩日記", brandVoice: "語氣: 溫暖\n避免使用/禁用聲明: 保證治癒" }, "k");
    expect(sent()).toContain("品牌語氣（旁白、標題、描述都要遵守；不得使用禁用聲明）：\n語氣: 溫暖\n避免使用/禁用聲明: 保證治癒");
  });

  it("leaves the prompt unchanged without one", async () => {
    await generateVideoScript({ topic: "感恩日記", brandVoice: "  " }, "k");
    expect(sent()).not.toContain("品牌語氣");
  });
});
