import { describe, expect, it } from "vitest";
import { TERMINAL_STATES, escalateGuard, isStrictTerminalState, isTerminalState, visibleRunButtons } from "../run-state";

describe("TERMINAL_STATES", () => {
  it("contains exactly resolved, rolled_back, human_only", () => {
    expect([...TERMINAL_STATES].sort()).toEqual(["human_only", "resolved", "rolled_back"]);
  });
});

describe("isTerminalState", () => {
  it.each([...TERMINAL_STATES])("%s → true", (state) => {
    expect(isTerminalState(state)).toBe(true);
  });

  it.each(["detected", "triage_needed", "approved", "backing_up", "repairing", "pr_ready", "deploy_pending", "deploying"])(
    "%s → false (active state)",
    (state) => {
      expect(isTerminalState(state)).toBe(false);
    },
  );

  it("undefined → true (missing state treated as terminal, buttons hidden)", () => {
    expect(isTerminalState(undefined)).toBe(true);
  });

  it("empty string → true (coerced missing)", () => {
    expect(isTerminalState("")).toBe(true);
  });
});

describe("isStrictTerminalState", () => {
  it.each([...TERMINAL_STATES])("%s → true", (state) => {
    expect(isStrictTerminalState(state)).toBe(true);
  });

  it.each(["detected", "triage_needed", "approved", "backing_up", "repairing", "pr_ready", "deploy_pending", "deploying"])(
    "%s → false (active state)",
    (state) => {
      expect(isStrictTerminalState(state)).toBe(false);
    },
  );

  it("unknown string → false (no false-positive terminal detection)", () => {
    expect(isStrictTerminalState("some_future_state")).toBe(false);
  });

  // Contract difference vs isTerminalState: strict rejects empty/whitespace (treats as non-terminal)
  it('empty string → false (strict; contrast: isTerminalState("") → true)', () => {
    expect(isStrictTerminalState("")).toBe(false);
  });

  it('whitespace padding → false (" resolved " is not a terminal state)', () => {
    expect(isStrictTerminalState(" resolved ")).toBe(false);
  });

  it("RESOLVED (uppercase) → false (case-sensitive)", () => {
    expect(isStrictTerminalState("RESOLVED")).toBe(false);
  });
});

describe("visibleRunButtons — active states show action buttons", () => {
  it("repairing: addPr + humanOnly + markDeployPending visible; closeRun / confirmDeployed / escalate hidden", () => {
    const b = visibleRunButtons("repairing", false);
    expect(b.addPr).toBe(true);
    expect(b.humanOnly).toBe(true);
    expect(b.markDeployPending).toBe(true);
    expect(b.closeRun).toBe(false);
    expect(b.confirmDeployed).toBe(false);
    expect(b.escalate).toBe(false);
  });

  it("pr_ready: addPr + humanOnly + markDeployPending visible", () => {
    const b = visibleRunButtons("pr_ready", false);
    expect(b.addPr).toBe(true);
    expect(b.markDeployPending).toBe(true);
    expect(b.humanOnly).toBe(true);
    expect(b.confirmDeployed).toBe(false);
  });

  it("deploy_pending: addPr + humanOnly + confirmDeployed visible; markDeployPending hidden (already there)", () => {
    const b = visibleRunButtons("deploy_pending", false);
    expect(b.addPr).toBe(true);
    expect(b.humanOnly).toBe(true);
    expect(b.confirmDeployed).toBe(true);
    expect(b.markDeployPending).toBe(false);
  });

  it("deploying: confirmDeployed visible", () => {
    const b = visibleRunButtons("deploying", false);
    expect(b.confirmDeployed).toBe(true);
    expect(b.markDeployPending).toBe(false);
  });
});

describe("visibleRunButtons — terminal states hide destructive buttons", () => {
  it.each([...TERMINAL_STATES])("%s: addPr + humanOnly + markDeployPending + confirmDeployed hidden", (state) => {
    const b = visibleRunButtons(state, true);
    expect(b.addPr).toBe(false);
    expect(b.humanOnly).toBe(false);
    expect(b.markDeployPending).toBe(false);
    expect(b.confirmDeployed).toBe(false);
    expect(b.escalate).toBe(false);
  });

  it("human_only: closeRun shown, others hidden", () => {
    const b = visibleRunButtons("human_only", false);
    expect(b.closeRun).toBe(true);
    expect(b.addPr).toBe(false);
    expect(b.humanOnly).toBe(false);
  });

  it("resolved: closeRun hidden (already resolved)", () => {
    expect(visibleRunButtons("resolved", false).closeRun).toBe(false);
  });
});

describe("visibleRunButtons — escalate button", () => {
  it("canEscalate=true + active state → escalate shown", () => {
    expect(visibleRunButtons("repairing", true).escalate).toBe(true);
  });

  it("canEscalate=true + terminal state → escalate hidden", () => {
    for (const state of TERMINAL_STATES) {
      expect(visibleRunButtons(state, true).escalate).toBe(false);
    }
  });

  it("canEscalate=false + any state → escalate hidden", () => {
    expect(visibleRunButtons("repairing", false).escalate).toBe(false);
    expect(visibleRunButtons("detected", false).escalate).toBe(false);
  });

  it("canEscalate=true + undefined state → escalate hidden (treated as terminal)", () => {
    expect(visibleRunButtons(undefined, true).escalate).toBe(false);
  });
});

describe("escalateGuard", () => {
  const escalatableRun = { policy: "analysis_only", state: "repairing" };

  it("allows escalation when all conditions met", () => {
    const g = escalateGuard(escalatableRun, true);
    expect(g.can).toBe(true);
    expect(g.reason).toBeUndefined();
  });

  it("blocks when policy is not analysis_only", () => {
    const g = escalateGuard({ policy: "auto_repair", state: "repairing" }, true);
    expect(g.can).toBe(false);
    expect(g.reason).toBe("not_analysis_only");
  });

  it("blocks when policy is human_only", () => {
    expect(escalateGuard({ policy: "human_only", state: "repairing" }, false).reason).toBe("not_analysis_only");
  });

  it("blocks when source cannot escalate (can_escalate_to_pr=false)", () => {
    const g = escalateGuard(escalatableRun, false);
    expect(g.can).toBe(false);
    expect(g.reason).toBe("source_cannot_escalate");
  });

  it.each([...TERMINAL_STATES])("blocks when run is in terminal state: %s", (state) => {
    const g = escalateGuard({ policy: "analysis_only", state }, true);
    expect(g.can).toBe(false);
    expect(g.reason).toBe("run_in_terminal_state");
  });

  it("priority order: policy check before source check", () => {
    const g = escalateGuard({ policy: "auto_repair", state: "repairing" }, false);
    expect(g.reason).toBe("not_analysis_only");
  });

  it("priority order: source check before terminal state check", () => {
    const g = escalateGuard({ policy: "analysis_only", state: "resolved" }, false);
    expect(g.reason).toBe("source_cannot_escalate");
  });
});

describe("visibleRunButtons — archive button", () => {
  it("terminal state + not archived → archive shown", () => {
    for (const state of TERMINAL_STATES) {
      expect(visibleRunButtons(state, false).archive).toBe(true);
    }
  });

  it("active state → archive hidden", () => {
    for (const state of ["detected", "repairing", "pr_ready", "deploy_pending"]) {
      expect(visibleRunButtons(state, false).archive).toBe(false);
    }
  });

  it("undefined state → archive hidden", () => {
    expect(visibleRunButtons(undefined, false).archive).toBe(false);
  });

  it("terminal state + archivedAt set → archive hidden (縱深防禦)", () => {
    for (const state of TERMINAL_STATES) {
      expect(visibleRunButtons(state, false, "2026-05-21T00:00:00Z").archive).toBe(false);
    }
  });

  it("terminal state + archivedAt null → archive shown", () => {
    expect(visibleRunButtons("resolved", false, null).archive).toBe(true);
  });
});
