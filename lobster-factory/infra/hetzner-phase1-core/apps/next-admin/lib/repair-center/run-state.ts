/** Terminal states: once entered, no further automated transitions are possible. */
export const TERMINAL_STATES = ["resolved", "rolled_back", "human_only"] as const;
export type TerminalState = (typeof TERMINAL_STATES)[number];

export function isTerminalState(state?: string): boolean {
  return !state || (TERMINAL_STATES as readonly string[]).includes(state);
}

/** Returns the visibility of each action button for a repair run row. */
export function visibleRunButtons(
  runState: string | undefined,
  canEscalate: boolean,
): {
  addPr: boolean;
  markDeployPending: boolean;
  humanOnly: boolean;
  closeRun: boolean;
  confirmDeployed: boolean;
  escalate: boolean;
  archive: boolean;
} {
  const terminal = isTerminalState(runState);
  return {
    addPr: !terminal,
    markDeployPending: runState === "repairing" || runState === "pr_ready",
    humanOnly: !terminal,
    closeRun: runState === "human_only",
    confirmDeployed: runState === "deploy_pending" || runState === "deploying",
    escalate: canEscalate && !terminal,
    // Archive is available for any known terminal state (excludes undefined/empty)
    archive: Boolean(runState) && (TERMINAL_STATES as readonly string[]).includes(runState!),
  };
}

/**
 * Pure guard for the escalate-to-auto_repair operation.
 * Callers must resolve can_escalate_to_pr from the policy catalog before calling.
 */
export function escalateGuard(
  run: { policy: string; state: string },
  canEscalateToPr: boolean,
): { can: boolean; reason?: string } {
  if (run.policy !== "analysis_only") return { can: false, reason: "not_analysis_only" };
  if (!canEscalateToPr) return { can: false, reason: "source_cannot_escalate" };
  if (isTerminalState(run.state)) return { can: false, reason: "run_in_terminal_state" };
  return { can: true };
}
