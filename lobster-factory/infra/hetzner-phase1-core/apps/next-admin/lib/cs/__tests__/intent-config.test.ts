// The 客服 tab's intent settings: a save writes only what it was sent, a bad value is refused, and the
// sentence shown per intent matches what decideAnswerAction does (2026-10-16 Soulful: "L2 自動" could
// be shown while the engine only drafted, and every save reset canary_pct to 0).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const { intentColumns } = await import("@/lib/cs/db");
const { examInFlight, intentBehavior, parseEvalCases, parseIntentPatch } = await import("@/lib/cs/intent-config");

describe("intentColumns", () => {
  it("writes only the fields given -- canary_pct and confidence_threshold survive a level change", () => {
    expect(intentColumns({ answerLevel: "L1" })).toEqual({ answer_level: "L1" });
  });
});

describe("parseIntentPatch", () => {
  it("a present but invalid field is an error, not a default", () => {
    expect(parseIntentPatch({ answerLevel: "L9" })).toEqual({ error: "invalid_answerLevel" });
    expect(parseIntentPatch({ canaryPct: 150 })).toEqual({ error: "invalid_canaryPct" });
  });
});

describe("intentBehavior", () => {
  const base = { answerLevel: "L2", canaryPct: 100, isSensitive: false, graduated: true };
  it("L2 without a passed exam is described as drafting", () => {
    expect(intentBehavior({ ...base, graduated: false })).toContain("照草稿處理");
  });
  it("L2 at 0% is described as drafting", () => {
    expect(intentBehavior({ ...base, canaryPct: 0 })).toContain("照草稿處理");
  });
  it("graduated L2 at 100% answers customers directly", () => {
    expect(intentBehavior(base)).toContain("AI 直接回客人");
  });
});

describe("parseEvalCases", () => {
  it("an answer case without expected points is refused -- it could never be judged", () => {
    expect(parseEvalCases([{ question: "有哪些課程？", expectedPoints: [], expectHandoff: false }])).toEqual({ error: "case_1_needs_expectedPoints" });
  });
});

describe("examInFlight", () => {
  const t0 = Date.parse("2026-10-16T00:00:00Z");
  it("a long exam with a fresh heartbeat is still running, however long ago it started", () => {
    const g = { status: "running" as const, startedAt: "2026-10-15T00:00:00Z", heartbeatAt: new Date(t0 - 60_000).toISOString() };
    expect(examInFlight(g, t0)).toBe(true);
  });
  it("a heartbeat older than the stale limit means the run died", () => {
    const g = { status: "running" as const, startedAt: "2026-10-15T00:00:00Z", heartbeatAt: new Date(t0 - 10 * 60_000).toISOString() };
    expect(examInFlight(g, t0)).toBe(false);
  });
});
