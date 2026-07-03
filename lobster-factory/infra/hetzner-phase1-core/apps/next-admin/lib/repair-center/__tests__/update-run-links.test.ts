import { describe, expect, it, vi, beforeEach } from "vitest";
import { REPAIR_RUN_STATES, REPAIR_DEPLOY_STATUSES } from "../types";
import { isTerminalState, TERMINAL_STATES } from "../run-state";

/**
 * Unit tests for the M1 + m7 validation logic extracted from updateRunLinks.
 * We test the guard logic in isolation (pure functions) rather than mocking
 * Supabase — the integration path is covered by the existing vitest suite.
 */

describe("REPAIR_RUN_STATES const", () => {
  it("contains all 11 expected state values", () => {
    expect(REPAIR_RUN_STATES).toHaveLength(11);
    const expected = [
      "detected", "triage_needed", "approved", "backing_up", "repairing",
      "pr_ready", "deploy_pending", "deploying", "rolled_back", "resolved", "human_only",
    ];
    for (const s of expected) {
      expect(REPAIR_RUN_STATES).toContain(s);
    }
  });

  it("every TERMINAL_STATE is included in REPAIR_RUN_STATES", () => {
    for (const t of TERMINAL_STATES) {
      expect(REPAIR_RUN_STATES).toContain(t);
    }
  });
});

describe("REPAIR_DEPLOY_STATUSES const", () => {
  it("contains all 6 expected deploy status values", () => {
    expect(REPAIR_DEPLOY_STATUSES).toHaveLength(6);
    const expected = ["not_started", "pending_manual", "running", "passed", "failed", "rolled_back"];
    for (const s of expected) {
      expect(REPAIR_DEPLOY_STATUSES).toContain(s);
    }
  });
});

describe("M1: state validation guard (extracted logic)", () => {
  function validateStateInput(bodyState: string, runState: string): { ok: false; error: string } | null {
    if (!(REPAIR_RUN_STATES as readonly string[]).includes(bodyState)) {
      return { ok: false, error: "invalid_state_value" };
    }
    // Mirrors service.ts updateRunLinks: human_only → resolved (結案) is the one
    // permitted write to a terminal run; everything else stays blocked.
    const isCloseHumanOnly = runState === "human_only" && bodyState === "resolved";
    if (isTerminalState(runState) && !isCloseHumanOnly) {
      return { ok: false, error: "run_in_terminal_state" };
    }
    return null;
  }

  it("rejects unknown state values", () => {
    expect(validateStateInput("flying", "repairing")).toEqual({ ok: false, error: "invalid_state_value" });
    expect(validateStateInput("", "repairing")).toEqual({ ok: false, error: "invalid_state_value" });
    expect(validateStateInput("RESOLVED", "repairing")).toEqual({ ok: false, error: "invalid_state_value" }); // case-sensitive
  });

  it("rejects writes when current run state is terminal", () => {
    for (const terminal of TERMINAL_STATES) {
      expect(validateStateInput("repairing", terminal)).toEqual({ ok: false, error: "run_in_terminal_state" });
    }
  });

  it("allows valid state transitions from active states", () => {
    for (const validState of REPAIR_RUN_STATES) {
      if (!isTerminalState(validState)) {
        expect(validateStateInput("pr_ready", validState)).toBeNull();
      }
    }
  });

  it("terminal → terminal write is also blocked (no state resurrection)", () => {
    expect(validateStateInput("resolved", "resolved")).toEqual({ ok: false, error: "run_in_terminal_state" });
    expect(validateStateInput("rolled_back", "human_only")).toEqual({ ok: false, error: "run_in_terminal_state" });
  });

  it("結案 exception: human_only → resolved is allowed (the closeRun button)", () => {
    expect(validateStateInput("resolved", "human_only")).toBeNull();
    // …but only from human_only; other terminal states stay locked.
    expect(validateStateInput("resolved", "rolled_back")).toEqual({ ok: false, error: "run_in_terminal_state" });
    // …and only to resolved; human_only cannot re-enter active states.
    expect(validateStateInput("repairing", "human_only")).toEqual({ ok: false, error: "run_in_terminal_state" });
  });
});

describe("M1: deploy_status validation guard (extracted logic)", () => {
  function validateDeployStatus(status: string): { ok: false; error: string } | null {
    if (!(REPAIR_DEPLOY_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: "invalid_deploy_status_value" };
    }
    return null;
  }

  it("rejects unknown deploy_status values", () => {
    expect(validateDeployStatus("done")).toEqual({ ok: false, error: "invalid_deploy_status_value" });
    expect(validateDeployStatus("PASSED")).toEqual({ ok: false, error: "invalid_deploy_status_value" }); // case-sensitive
    expect(validateDeployStatus("")).toEqual({ ok: false, error: "invalid_deploy_status_value" });
  });

  it("allows all valid deploy_status values", () => {
    for (const status of REPAIR_DEPLOY_STATUSES) {
      expect(validateDeployStatus(status)).toBeNull();
    }
  });
});

describe("m7: github_pr_url hostname guard (extracted logic)", () => {
  function validatePrUrl(url: string): { ok: false; error: string } | null {
    const trimmed = url.trim();
    if (!trimmed) return null; // empty = clear, allowed
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname !== "github.com") return { ok: false, error: "invalid_github_pr_url_hostname" };
    } catch {
      return { ok: false, error: "invalid_github_pr_url_format" };
    }
    return null;
  }

  it("allows valid github.com PR URLs", () => {
    expect(validatePrUrl("https://github.com/owner/repo/pull/42")).toBeNull();
    expect(validatePrUrl("https://github.com/AwareWave/lobster-factory/pull/99")).toBeNull();
  });

  it("rejects javascript: URLs (XSS/injection)", () => {
    expect(validatePrUrl("javascript:alert(1)//github.com/foo/bar/pull/123")).toEqual({ ok: false, error: "invalid_github_pr_url_hostname" });
  });

  it("rejects non-github.com hostnames", () => {
    expect(validatePrUrl("https://evil.com/owner/repo/pull/1")).toEqual({ ok: false, error: "invalid_github_pr_url_hostname" });
    expect(validatePrUrl("https://github.evil.com/owner/repo/pull/1")).toEqual({ ok: false, error: "invalid_github_pr_url_hostname" });
  });

  it("rejects malformed URLs", () => {
    expect(validatePrUrl("not-a-url")).toEqual({ ok: false, error: "invalid_github_pr_url_format" });
    expect(validatePrUrl("://broken")).toEqual({ ok: false, error: "invalid_github_pr_url_format" });
  });

  it("allows empty string (clearing the PR URL)", () => {
    expect(validatePrUrl("")).toBeNull();
    expect(validatePrUrl("   ")).toBeNull();
  });
});
