// lib/collect/run-jobs.ts — the fix for the run button appearing to do nothing (2026-09-12): a run
// no longer has to finish inside one HTTP request, so something has to remember it happened.

import { afterEach, describe, expect, it, vi } from "vitest";
import { startRunJob, getRunJob } from "../run-jobs";
import type { RunCollectionResult } from "../run";

function fakeResult(overrides: Partial<RunCollectionResult> = {}): RunCollectionResult {
  return {
    runKey: "manual-test",
    sources: 1,
    dryRun: false,
    report: { fetched: 1, outOfScope: 0, unhandled: [], gone: [], dirty: [], quarantined: [], disallowed: [], offEntity: [], retried: 0, stoppedBy: "frontier_empty", aside: [], channels: [] },
    sink: { written: 1, skipped: 0 },
    persistedRunId: "run-1",
    incidentRaised: false,
    errors: [],
    ...overrides,
  };
}

const KIND = "collection-run";

describe("run-jobs", () => {
  it("is unknown before anything registers it", () => {
    expect(getRunJob(KIND, "org1:never-started")).toBeNull();
  });

  it("reports running immediately, then done once the promise resolves", async () => {
    let resolveWork!: (r: RunCollectionResult) => void;
    const work = new Promise<RunCollectionResult>((resolve) => {
      resolveWork = resolve;
    });
    startRunJob(KIND, "org1:manual-a", work);

    expect(getRunJob(KIND, "org1:manual-a")?.status).toBe("running");

    resolveWork(fakeResult());
    await work;
    // The .then() that flips the tracked status runs as a microtask queued by resolveWork; await
    // the same promise from here to land after it, rather than asserting before it has run.
    await Promise.resolve();

    const job = getRunJob(KIND, "org1:manual-a");
    expect(job?.status).toBe("done");
    expect(job?.result?.sink.written).toBe(1);
  });

  it("turns a rejected run into an error status, not an unhandled rejection", async () => {
    const work = Promise.reject(new Error("boom"));
    startRunJob(KIND, "org1:manual-b", work);

    // Real code never awaits `work` again (that would be the double-handling this design avoids);
    // wait on a fresh microtask turn instead so the internal .then/.catch has had a chance to run.
    await new Promise((r) => setTimeout(r, 0));

    const job = getRunJob(KIND, "org1:manual-b");
    expect(job?.status).toBe("error");
    expect(job?.error).toContain("boom");
  });

  it("keys are opaque strings — same runKey under different organizations does not collide", async () => {
    startRunJob(KIND, "org1:manual-c", Promise.resolve(fakeResult({ sources: 1 })));
    startRunJob(KIND, "org2:manual-c", Promise.resolve(fakeResult({ sources: 2 })));
    await new Promise((r) => setTimeout(r, 0));

    expect(getRunJob(KIND, "org1:manual-c")?.result?.sources).toBe(1);
    expect(getRunJob(KIND, "org2:manual-c")?.result?.sources).toBe(2);
  });

  it("a mismatched kind on an existing key reads as not-found, not as the other kind's result (critic finding, 2026-09-18)", async () => {
    startRunJob(KIND, "shared:key-1", Promise.resolve(fakeResult({ sources: 9 })));
    await new Promise((r) => setTimeout(r, 0));

    expect(getRunJob(KIND, "shared:key-1")?.result?.sources).toBe(9);
    expect(getRunJob("cognitive-os-import", "shared:key-1")).toBeNull();
  });

  describe("pruning (critic finding, 2026-09-12: must not touch a still-running job)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never deletes a 'running' job, no matter how old it looks", () => {
      const now = vi.spyOn(Date, "now");
      now.mockReturnValue(0);
      // Never resolves within this test — stands in for a run still genuinely in flight.
      startRunJob(KIND, "org1:still-running", new Promise(() => {}));

      // 31 minutes later, well past the prune threshold — pruning runs as a side effect of this
      // next call, which is the actual trigger this test needs to exercise.
      now.mockReturnValue(31 * 60_000);
      startRunJob(KIND, "org1:new-run", Promise.resolve(fakeResult()));

      expect(getRunJob(KIND, "org1:still-running")?.status).toBe("running");
    });

    it("does prune a finished job once it is old enough", async () => {
      const now = vi.spyOn(Date, "now");
      now.mockReturnValue(0);
      startRunJob(KIND, "org1:long-done", Promise.resolve(fakeResult()));
      await new Promise((r) => setTimeout(r, 0)); // let the .then() land, flipping it to "done"
      expect(getRunJob(KIND, "org1:long-done")?.status).toBe("done");

      now.mockReturnValue(31 * 60_000);
      startRunJob(KIND, "org1:another-new-run", Promise.resolve(fakeResult()));

      expect(getRunJob(KIND, "org1:long-done")).toBeNull();
    });
  });
});
