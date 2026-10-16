// An exam's verdict certifies one intent on the golden set present when its run started:
// only the run that still owns the record writes it, and a case answered under another intent
// proves nothing about this one (Codex 2026-10-16, partialreview-1e95d4c4 F1/F4).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  writeResult: "ok" as "ok" | "superseded" | "error",
  written: [] as unknown[],
  cases: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/cs/db", () => ({
  loadEvalCases: vi.fn(async () => state.cases),
  loadIntents: vi.fn(async () => []),
  loadIntent: vi.fn(async () => ({ key: "courses", confidenceThreshold: 0.7, isSensitive: false, actionLevel: "A0" })),
  loadKnowledgeFloor: vi.fn(async () => 0.4),
  setIntentGraduation: vi.fn(async (_o: string, _k: string, g: unknown) => { state.written.push(g); return state.writeResult; }),
}));
vi.mock("@/lib/cs/cis", () => ({ loadCis: vi.fn(async () => ({ organizationId: "o" })) }));
const planReply = vi.fn();
vi.mock("@/lib/cs/orchestrator", () => ({ planReply }));
const generateText = vi.fn();
vi.mock("@/lib/cs/llm", () => ({ generateText, parseJsonObject: vi.fn() }));

const { examIntent, runEvalCase } = await import("@/lib/cs/eval");

const run = { runId: "r1", startedAt: "2026-10-16T00:00:00Z" };

beforeEach(() => {
  state.writeResult = "ok";
  state.written = [];
  state.cases = [];
  generateText.mockReset();
});

describe("examIntent", () => {
  it("returns the verdict when its conditional write lands, fingerprinted with what it examined", async () => {
    const g = await examIntent("o", "courses", run);
    expect(g).not.toBeNull();
    expect(state.written).toHaveLength(1);
    expect(g?.basis).toMatch(/^[0-9a-f]{64}$/);
  });

  it("drops the verdict when the run no longer owns the record", async () => {
    state.writeResult = "superseded";
    expect(await examIntent("o", "courses", run)).toBeNull();
  });

  it("a verdict that could not be stored is an error, never reported as finished", async () => {
    state.writeResult = "error";
    await expect(examIntent("o", "courses", run)).rejects.toThrow("graduation_write_failed");
  });
});

describe("runEvalCase", () => {
  it("an answer given under another intent does not pass, and the judge is not asked", async () => {
    planReply.mockResolvedValueOnce({ decision: { action: "draft", replyText: "ok", intentKey: "booking", retrievedChunkIds: [], toolCalls: [], traceMeta: {} } });
    const r = await runEvalCase({ organizationId: "o" } as never, [], {
      question: "喜悅卡一次多久？", intentKey: "courses", expectedPoints: ["90–120 分鐘"], expectHandoff: false, isAdversarial: false,
    });
    expect(r.pass).toBe(false);
    expect(r.judgeReason).toBe("classified_as:booking");
    expect(generateText).not.toHaveBeenCalled();
  });
});
