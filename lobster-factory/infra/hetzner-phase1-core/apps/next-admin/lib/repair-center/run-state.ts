/** Terminal states: once entered, no further automated transitions are possible. */
export const TERMINAL_STATES = ["resolved", "rolled_back", "human_only"] as const;
export type TerminalState = (typeof TERMINAL_STATES)[number];

/** Forgiving — undefined returns true (defensive for UI display). Do NOT use in write gates. */
export function isTerminalState(state?: string): boolean {
  return !state || (TERMINAL_STATES as readonly string[]).includes(state);
}

/** Strict — for write gates where state is guaranteed non-null (DB NOT NULL constraint). */
export function isStrictTerminalState(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/** Returns the visibility of each action button for a repair run row. */
export function visibleRunButtons(
  runState: string | undefined,
  canEscalate: boolean,
  archivedAt?: string | null,
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
    archive: !archivedAt && Boolean(runState) && (TERMINAL_STATES as readonly string[]).includes(runState!),
  };
}

/**
 * Pure guard for the escalate-to-auto_repair operation.
 * Callers must resolve can_escalate_to_pr from the policy catalog before calling.
 */
export function escalateGuard(
  run: { policy: string; state: string; github_issue_number: number | null },
  canEscalateToPr: boolean,
): { can: boolean; reason?: string } {
  if (run.policy !== "analysis_only") return { can: false, reason: "not_analysis_only" };
  if (!canEscalateToPr) return { can: false, reason: "source_cannot_escalate" };
  if (isTerminalState(run.state)) return { can: false, reason: "run_in_terminal_state" };
  // Escalation works by commenting on the run's issue; with no issue (backup or issue creation
  // failed) the policy would flip while GitHub never hears of it. Approve the repair again first.
  if (run.github_issue_number == null) return { can: false, reason: "no_github_issue" };
  return { can: true };
}
