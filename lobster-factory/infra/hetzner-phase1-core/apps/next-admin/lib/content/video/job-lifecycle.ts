/**
 * Versioned lifecycle contract for the durable media-render job executor.
 *
 * This is deliberately pure: database persistence, Trigger execution and a
 * renderer HTTP adapter must all use this same transition vocabulary, but none
 * of them are allowed to hide a transition inside their implementation.
 *
 * The current database schema still stores legacy running/done/error.
 * Phase 1B's additive migration will persist this contract. Until then this
 * module is a tested SSOT for that migration and its adapters, not a claim
 * that the legacy database already has these states.
 */

export const VIDEO_JOB_LIFECYCLE_VERSION = 1 as const;

export const VIDEO_JOB_LIFECYCLE_STATES = [
  "queued",
  "claimed",
  "submitting",
  "submitted",
  "rendering",
  "finalizing",
  "succeeded",
  "failed",
  "unknown",
  "reconciling",
  "retry_queued",
] as const;

export type VideoJobLifecycleState = (typeof VIDEO_JOB_LIFECYCLE_STATES)[number];

const TERMINAL_STATES = new Set<VideoJobLifecycleState>(["succeeded", "failed"]);

const TRANSITIONS: Readonly<Record<VideoJobLifecycleState, readonly VideoJobLifecycleState[]>> = {
  queued: ["claimed", "failed"],
  claimed: ["submitting", "failed", "unknown"],
  submitting: ["submitted", "failed", "unknown"],
  submitted: ["rendering", "finalizing", "failed", "unknown"],
  rendering: ["finalizing", "failed", "unknown"],
  finalizing: ["succeeded", "failed", "unknown"],
  succeeded: [],
  failed: [],
  unknown: ["reconciling"],
  reconciling: ["succeeded", "failed", "retry_queued", "unknown"],
  retry_queued: ["claimed", "failed"],
};

export interface VideoJobLifecycleTransition {
  readonly from: VideoJobLifecycleState;
  readonly to: VideoJobLifecycleState;
}

export type LifecycleTransitionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "terminal_state" | "transition_not_allowed" };

/** Only these states may ever accept a retry claim; terminal work never reopens. */
export function isRetryableVideoJobState(state: VideoJobLifecycleState): boolean {
  return state === "retry_queued";
}

export function isTerminalVideoJobState(state: VideoJobLifecycleState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Checks an actual lifecycle edge. A no-op transition is rejected: callers
 * must record their observation separately and may not use an update as a
 * hidden lease renewal or accidental replay.
 */
export function checkVideoJobLifecycleTransition(
  transition: VideoJobLifecycleTransition,
): LifecycleTransitionCheck {
  if (isTerminalVideoJobState(transition.from)) {
    return { ok: false, reason: "terminal_state" };
  }
  return TRANSITIONS[transition.from].includes(transition.to)
    ? { ok: true }
    : { ok: false, reason: "transition_not_allowed" };
}

/** Fails closed for an executor that tries to make an illegal state change. */
export function assertVideoJobLifecycleTransition(
  transition: VideoJobLifecycleTransition,
): void {
  const result = checkVideoJobLifecycleTransition(transition);
  if (result.ok === false) {
    throw new Error(
      "[video-job-lifecycle] " + result.reason + ": " + transition.from + " -> " + transition.to,
    );
  }
}

/**
 * Read-only compatibility mapping for existing short-lived video_jobs rows.
 * It is intentionally one-way: Phase 1B may read old rows, but it must not
 * collapse the durable lifecycle back into running.
 */
export function legacyVideoJobStatusToLifecycle(
  status: "running" | "done" | "error",
): VideoJobLifecycleState {
  switch (status) {
    case "running":
      return "rendering";
    case "done":
      return "succeeded";
    case "error":
      return "failed";
  }
}
