// The Gemini fallbacks are metered like their Claude primaries (Codex 2026-10-24): one ai_call_logs row with the model in use.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ logged: [] as Record<string, unknown>[] }));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/log-ai-call")>()),
  logAiCall: vi.fn(async (a: Record<string, unknown>) => { m.logged.push(a); }),
}));
vi.mock("@/lib/ai/gateway", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gateway")>()),
  loadAnthropic: async () => class { messages = { create: async () => { throw new Error("claude down"); } }; },
  loadGoogleGenerativeAI: async () => class {
    getGenerativeModel() {
      return { generateContent: async () => ({ response: {
        text: () => "OK", usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 8, thoughtsTokenCount: 4, cachedContentTokenCount: 20 } } }) };
    }
  },
}));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}) }));

import { GEMINI_LITE_MODEL } from "../gemini-models";
import { geminiUsageTokens } from "../log-ai-call";

beforeEach(() => { m.logged = []; vi.stubEnv("ANTHROPIC_API_KEY", "x"); vi.stubEnv("GEMINI_API_KEY", "x"); });

describe("Gemini calls are metered", () => {
  it("usage maps thinking to output and cached prompt to the cache rate", () => {
    expect(geminiUsageTokens({ promptTokenCount: 120, candidatesTokenCount: 8, thoughtsTokenCount: 4, cachedContentTokenCount: 20 }))
      .toEqual({ inputTokens: 100, outputTokens: 12, cacheReadTokens: 20 });
  });

  it("the cs fallback logs one row with the Gemini model and the caller's org", async () => {
    const { generateText } = await import("@/lib/cs/llm");
    const r = await generateText({ system: "s", user: "u", route: "cs/test", organizationId: "org-1", grant: {} as never });
    expect(r.provider).toBe("gemini");
    expect(m.logged).toEqual([expect.objectContaining({ route: "cs/test", model: GEMINI_LITE_MODEL, organizationId: "org-1", inputTokens: 100, outputTokens: 12 })]);
  });

  it("the inbox classifier logs its Gemini call", async () => {
    const { summarizeIncidentWithGemini } = await import("@/lib/ops-inbox/ai/gemini");
    await summarizeIncidentWithGemini({ id: "i", organization_id: "org-2", source: "uptime-kuma", severity: "low", service: null, environment: "staging",
      title: "t", message: null, occurrence_count: 1, raw: {} } as never);
    expect(m.logged).toEqual([expect.objectContaining({ route: "ops-inbox/classify", model: GEMINI_LITE_MODEL, organizationId: "org-2" })]);
  });
});
