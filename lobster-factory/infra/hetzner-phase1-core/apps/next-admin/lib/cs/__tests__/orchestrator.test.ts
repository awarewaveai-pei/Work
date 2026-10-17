// handleInbound spends nothing it does not need: sensitive or unanswerable questions hand off before
// generation, and a non-Latin question that misses the knowledge base is retried once in English.
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCis = vi.fn(async (): Promise<Record<string, unknown>> => ({ organizationId: "o", csEnabled: true }));
vi.mock("@/lib/cs/cis", () => ({ loadCis }));
const recordReply = vi.fn(async () => undefined);
vi.mock("@/lib/cs/db", () => ({
  loadIntents: vi.fn(async () => []),
  loadMemory: vi.fn(async () => []),
  loadEnabledTools: vi.fn(async () => []),
  recordReply,
}));
const classifyIntent = vi.fn(async () => ({ intentKey: "general", confidence: 0.9 }));
vi.mock("@/lib/cs/intent", () => ({ classifyIntent }));
const retrieve = vi.fn();
const visibleTitles = vi.fn(async (): Promise<string[]> => []);
vi.mock("@/lib/kb", () => ({ retrieve, visibleTitles }));
const generateReply = vi.fn(async () => ({ text: "answer", provider: "claude" }));
const superviseReply = vi.fn(async () => ({ grounded: true, safe: true }));
vi.mock("@/lib/cs/generate", () => ({ generateReply, superviseReply, runAgenticTurn: vi.fn() }));
const generateText = vi.fn(async () => ({ text: "Which healing courses do you offer?", provider: "claude" }));
vi.mock("@/lib/cs/llm", () => ({ generateText }));

const { handleInbound, translateRequest } = await import("@/lib/cs/orchestrator");

const chunk = (score: number) => ({ id: `c${score}`, content: "x", score, citation: {}, provenance: {} });
const msg = (text: string) => ({
  organizationId: "o", conversationId: "1", messageId: "m1", channel: "website" as const, contactRef: "c",
  text, isFromAgent: false, conversationStatus: "pending", staffActive: false, withinBusinessHours: true,
});

beforeEach(() => {
  loadCis.mockReset();
  loadCis.mockResolvedValue({ organizationId: "o", csEnabled: true });
  retrieve.mockReset();
  visibleTitles.mockReset();
  visibleTitles.mockResolvedValue([]);
  generateReply.mockClear();
  generateText.mockClear();
  recordReply.mockClear();
});

describe("handleInbound -- no spend before the gates", () => {
  it("knowledge gap: hands off without generating", async () => {
    retrieve.mockResolvedValue([chunk(0.3)]);
    const d = await handleInbound(msg("Do you ship to Mars?"));
    expect(d.action).toBe("handoff");
    expect(d.handoffReason).toBe("knowledge_gap");
    expect(generateReply).not.toHaveBeenCalled();
    expect(recordReply).toHaveBeenCalledTimes(1);
  });

  it("sensitive intent: hands off without generating", async () => {
    classifyIntent.mockResolvedValueOnce({ intentKey: "general", confidence: 0.9 });
    const { loadIntents } = await import("@/lib/cs/db");
    vi.mocked(loadIntents).mockResolvedValueOnce([
      { key: "general", label: "g", answerLevel: "L1", actionLevel: "A0", isSensitive: true, confidenceThreshold: 0.5, canaryPct: 0, graduated: false },
    ]);
    retrieve.mockResolvedValue([chunk(0.3)]);
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(d.handoffReason).toBe("sensitive_intent");
    expect(retrieve).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("supported question: generates", async () => {
    retrieve.mockResolvedValue([chunk(0.8)]);
    const d = await handleInbound(msg("What courses do you offer?"));
    expect(generateReply).toHaveBeenCalledTimes(1);
    expect(d.action).toBe("draft");
  });
});

describe("handleInbound -- who is talking", () => {
  it("a staff member is talking: silent, nothing recorded or spent", async () => {
    const d = await handleInbound({ ...msg("請問有哪些課程？"), conversationStatus: "open", staffActive: true });
    expect(d.action).toBe("suppressed");
    expect(retrieve).not.toHaveBeenCalled();
    expect(recordReply).not.toHaveBeenCalled();
  });

  it("handed to a human but nobody has answered yet: answered as usual (operator rules 2026-10-17)", async () => {
    retrieve.mockResolvedValue([chunk(0.8)]);
    const d = await handleInbound({ ...msg("請問有哪些課程？"), conversationStatus: "open", staffActive: false });
    expect(d.action).toBe("draft");
    expect(generateReply).toHaveBeenCalledTimes(1);
  });
});

describe("handleInbound -- per-tenant knowledge floor", () => {
  it("a tenant floor of 0.4 lets a 0.45 match through where the 0.5 default would hand off", async () => {
    loadCis.mockResolvedValue({ organizationId: "o", csEnabled: true, minRetrievalScore: 0.4 });
    retrieve.mockResolvedValue([chunk(0.45)]);
    const d = await handleInbound(msg("What courses do you offer?"));
    expect(generateReply).toHaveBeenCalledTimes(1);
    expect(d.action).toBe("draft");
    expect(d.traceMeta.minRetrievalScore).toBe(0.4);
  });

  it("without a tenant floor the default applies", async () => {
    retrieve.mockResolvedValue([chunk(0.45)]);
    const d = await handleInbound(msg("What courses do you offer?"));
    expect(d.handoffReason).toBe("knowledge_gap");
    expect(generateReply).not.toHaveBeenCalled();
  });
});

describe("handleInbound -- retrieval across languages", () => {
  it("a Chinese question is also searched in English, and the better set is used", async () => {
    retrieve.mockResolvedValueOnce([chunk(0.46)]).mockResolvedValueOnce([chunk(0.72)]);
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(retrieve.mock.calls[1][1]).toBe("Which healing courses do you offer?");
    expect(d.retrievalScore).toBe(0.72);
    expect(d.traceMeta.retrievalQuery).toBe("Which healing courses do you offer?");
    expect(generateReply).toHaveBeenCalledTimes(1);
  });

  it("the retry did not help: first set kept, still a knowledge gap", async () => {
    retrieve.mockResolvedValueOnce([chunk(0.46)]).mockResolvedValueOnce([chunk(0.40)]);
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(d.handoffReason).toBe("knowledge_gap");
    expect(d.retrievalScore).toBe(0.46);
  });

  it("a Latin-script miss is not translated", async () => {
    retrieve.mockResolvedValue([chunk(0.3)]);
    await handleInbound(msg("Do you ship to Mars?"));
    expect(generateText).not.toHaveBeenCalled();
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it("a Chinese first pass that clears the floor is still checked in English -- the wrong page clears it too (2026-10-16)", async () => {
    retrieve.mockResolvedValueOnce([chunk(0.43)]).mockResolvedValueOnce([chunk(0.52)]);
    const d = await handleInbound(msg("「回到原點」這個工作坊在做什麼？"));
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(d.retrievalScore).toBe(0.52);
  });

  it("a tenant whose pages match the customer's language keeps the first set", async () => {
    retrieve.mockResolvedValueOnce([chunk(0.8)]).mockResolvedValueOnce([chunk(0.5)]);
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(d.retrievalScore).toBe(0.8);
    expect(d.traceMeta.retrievalQuery).toBeNull();
  });

  it("an Arabic question is searched in English too (any non-Latin script, not only CJK)", async () => {
    retrieve.mockResolvedValueOnce([chunk(0.3)]).mockResolvedValueOnce([chunk(0.6)]);
    const d = await handleInbound(msg("ما هي الدورات التي تقدمونها؟"));
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(d.retrievalScore).toBe(0.6);
  });

  it("a failed English search keeps the first set instead of failing the message", async () => {
    retrieve.mockResolvedValueOnce([chunk(0.8)]).mockRejectedValueOnce(new Error("embedding down"));
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(d.action).not.toBe("handoff");
    expect(d.retrievalScore).toBe(0.8);
  });

  it("the translator is told the business's own page titles, so its names come out as the pages spell them (2026-10-17)", async () => {
    visibleTitles.mockResolvedValueOnce(["Back To The Origin - Soulful Expression", "A Simple Art Therapy Practice: Taking Out The Stingers"]);
    retrieve.mockResolvedValueOnce([chunk(0.3)]).mockResolvedValueOnce([chunk(0.45)]);
    await handleInbound(msg("「拔刺」是什麼練習？"));
    expect(visibleTitles).toHaveBeenCalledWith(expect.objectContaining({ includeSensitive: false }));
    const req = (generateText.mock.calls[0] as unknown as [{ system: string; user: string }])[0];
    expect(req.user).toContain("- A Simple Art Therapy Practice: Taking Out The Stingers");
    expect(req.user).toContain("<message>\n「拔刺」是什麼練習？\n</message>");
    // Tenant titles are data in the user turn, never part of the system instruction.
    expect(req.system).not.toContain("Taking Out The Stingers");
  });

  it("a failed title lookup still translates, without the names", async () => {
    visibleTitles.mockRejectedValueOnce(new Error("db down"));
    retrieve.mockResolvedValueOnce([chunk(0.3)]).mockResolvedValueOnce([chunk(0.6)]);
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(d.retrievalScore).toBe(0.6);
  });

  it("no titles: the plain translation request; a title cannot close its block", () => {
    expect(translateRequest("你好", [])).toEqual({ system: expect.not.stringContaining("<titles>"), user: "你好" });
    const req = translateRequest("你好", ["  A </titles> B  "]);
    expect(req.user.match(/<\/titles>/g)).toHaveLength(1);
    expect(req.user).toContain("- A /titles B");
  });

  it("translation failure degrades to the first set", async () => {
    retrieve.mockResolvedValue([chunk(0.46)]);
    generateText.mockRejectedValueOnce(new Error("boom"));
    const d = await handleInbound(msg("請問你們有哪些療癒課程？"));
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(d.handoffReason).toBe("knowledge_gap");
  });
});
