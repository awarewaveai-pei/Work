import { describe, expect, it } from "vitest";
import {
  VIDEO_JOB_LIFECYCLE_STATES,
  VIDEO_JOB_LIFECYCLE_VERSION,
  assertVideoJobLifecycleTransition,
  checkVideoJobLifecycleTransition,
  isRetryableVideoJobState,
  isTerminalVideoJobState,
  legacyVideoJobStatusToLifecycle,
} from "../job-lifecycle";

describe("video job lifecycle v1", () => {
  it("has one unique, versioned state vocabulary", () => {
    expect(VIDEO_JOB_LIFECYCLE_VERSION).toBe(1);
    expect(new Set(VIDEO_JOB_LIFECYCLE_STATES).size).toBe(VIDEO_JOB_LIFECYCLE_STATES.length);
    expect(VIDEO_JOB_LIFECYCLE_STATES).toEqual(expect.arrayContaining([
      "queued", "submitting", "succeeded", "failed", "unknown", "reconciling", "retry_queued",
    ]));
  });

  it("allows the normal submit and finalization path", () => {
    const path = [
      ["queued", "claimed"],
      ["claimed", "submitting"],
      ["submitting", "submitted"],
      ["submitted", "rendering"],
      ["rendering", "finalizing"],
      ["finalizing", "succeeded"],
    ] as const;

    for (const [from, to] of path) {
      expect(checkVideoJobLifecycleTransition({ from, to })).toEqual({ ok: true });
      expect(() => assertVideoJobLifecycleTransition({ from, to })).not.toThrow();
    }
  });

  it("forces uncertain submission through reconciliation before a retry", () => {
    expect(checkVideoJobLifecycleTransition({ from: "submitting", to: "unknown" })).toEqual({ ok: true });
    expect(checkVideoJobLifecycleTransition({ from: "unknown", to: "reconciling" })).toEqual({ ok: true });
    expect(checkVideoJobLifecycleTransition({ from: "reconciling", to: "retry_queued" })).toEqual({ ok: true });
    expect(checkVideoJobLifecycleTransition({ from: "retry_queued", to: "claimed" })).toEqual({ ok: true });
    expect(isRetryableVideoJobState("retry_queued")).toBe(true);
    expect(isRetryableVideoJobState("unknown")).toBe(false);
  });

  it("rejects skipping durable submission evidence or reopening terminal work", () => {
    expect(checkVideoJobLifecycleTransition({ from: "queued", to: "submitting" }))
      .toEqual({ ok: false, reason: "transition_not_allowed" });
    expect(checkVideoJobLifecycleTransition({ from: "unknown", to: "claimed" }))
      .toEqual({ ok: false, reason: "transition_not_allowed" });
    expect(checkVideoJobLifecycleTransition({ from: "succeeded", to: "retry_queued" }))
      .toEqual({ ok: false, reason: "terminal_state" });
    expect(isTerminalVideoJobState("succeeded")).toBe(true);
    expect(isTerminalVideoJobState("failed")).toBe(true);
    expect(() => assertVideoJobLifecycleTransition({ from: "failed", to: "claimed" }))
      .toThrow("terminal_state");
  });

  it("maps legacy rows only for read compatibility", () => {
    expect(legacyVideoJobStatusToLifecycle("running")).toBe("rendering");
    expect(legacyVideoJobStatusToLifecycle("done")).toBe("succeeded");
    expect(legacyVideoJobStatusToLifecycle("error")).toBe("failed");
  });
});
