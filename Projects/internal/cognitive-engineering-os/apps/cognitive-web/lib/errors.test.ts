import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { failureReason, humanError } from "./errors";

describe("humanError", () => {
  it("turns a known detail code into Chinese, with no 'API' and no UPPER_SNAKE code left showing", () => {
    const text = humanError(new ApiError(409, "PROJECT_BUSY: an analysis is still running; wait for it to finish, then delete"));
    expect(text).not.toContain("API");
    expect(text).not.toMatch(/[A-Z]{2,}/);
    expect(text).toBe("有一次分析還在跑，等它跑完再刪除這個專案。");
  });

  it("reads the code out of a {code: ...} or {error: ...} object detail, not just a string", () => {
    expect(humanError(new ApiError(404, { code: "SOURCE_NOT_FOUND" }))).toContain("找不到這個來源");
    expect(humanError(new ApiError(422, { error: "METHOD_GATES_FAILED", gate_results: [] }))).toContain("沒有通過檢查");
  });

  it("falls back to a status-level sentence for an unlisted code, still with no code or 'API' showing", () => {
    const text = humanError(new ApiError(404, "SOME_FUTURE_CODE_NOT_YET_MAPPED"));
    expect(text).not.toContain("API");
    expect(text).not.toMatch(/[A-Z_]{5,}/);
    expect(text).toContain("找不到");
  });

  it("A7: a 429 is the AI budget only when it says so; the site's request limit (no code, an HTML body) asks for 10 seconds", () => {
    expect(humanError(new ApiError(429, "AI_DAILY_TOKEN_BUDGET_EXCEEDED: 6699/200000 tokens used today (UTC)"))).toContain("AI 額度用完");
    expect(humanError(new ApiError(429, {}))).toContain("等 10 秒");
    expect(humanError(new ApiError(429, {}))).not.toContain("明天");
    expect(humanError(new ApiError(422, "AI_ANSWER_TRUNCATED: stopped at max_tokens"))).toContain("截斷");
    expect(humanError(new ApiError(424, "AI_PROVIDER_SOMETHING_NEW: x"))).toContain("AI 服務");   // a new family member still reads as a sentence
    for (const status of [502, 504, 520]) expect(humanError(new ApiError(status, {}))).not.toMatch(/[<>]|API|狀態碼/);
    expect(humanError(new TypeError("Failed to fetch"))).toContain("連不上系統");   // a page's own fetch(), not apiFetch
  });

  it("passes a plain Error's own message through unchanged (a real ApiFetch() network failure, not a designed code)", () => {
    expect(humanError(new Error("toggle failed"))).toBe("toggle failed");
  });
});

describe("failureReason", () => {
  it("says why a FAILED analysis stopped in words, for known and unknown codes alike", () => {
    for (const error of ["INTERPRETATION_RUNNER_LOST: the analysis stopped", "INTERPRETATION_REJECTED_AFTER_REPAIR: INTERPRETATION_GATE_FAILED: citation_integrity", "AI_PROVIDER_UNAVAILABLE", null]) {
      expect(failureReason(error)).not.toMatch(/[A-Z0-9]+_[A-Z0-9_]+/);   // no code ("AI" in a sentence is fine)
    }
    expect(failureReason("INTERPRETATION_RUNNER_LOST: x")).toContain("重新啟動");
  });
});
