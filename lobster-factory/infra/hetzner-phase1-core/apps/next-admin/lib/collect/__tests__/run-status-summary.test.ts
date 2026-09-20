// lib/collect/run.ts's runStatusSummary — added 2026-09-18 (operator report: "按正式抓取後不知道抓到沒,
// 只能去知識庫看"). A source row's persisted `lastStatus` used to be a bare "ok", indistinguishable
// from a run that fetched and stored nothing; this packs real counts into that same string.

import { describe, expect, it } from "vitest";
import { runStatusSummary } from "@/lib/collect/run";
import type { RunReport, SinkReport } from "@/lib/collect/types";

function report(overrides: Partial<RunReport> = {}): RunReport {
  return {
    fetched: 0,
    outOfScope: 0,
    unhandled: [],
    gone: [],
    dirty: [],
    quarantined: [],
    disallowed: [],
    offEntity: [],
    retried: 0,
    stoppedBy: "frontier_empty",
    ...overrides,
  };
}

function sink(overrides: Partial<SinkReport> = {}): SinkReport {
  return { written: 0, skipped: 0, ...overrides };
}

describe("runStatusSummary", () => {
  it("reports real counts instead of a bare 'ok'", () => {
    const summary = runStatusSummary({ report: report({ fetched: 5 }), sink: sink({ written: 4, skipped: 1 }) });
    expect(summary).toContain("抓5");
    expect(summary).toContain("入庫4");
    expect(summary).toContain("未變1");
    expect(summary).toMatch(/^ok/);
  });

  it("a run that fetched and stored nothing is now distinguishable from a real success", () => {
    const empty = runStatusSummary({ report: report({ fetched: 0 }), sink: sink({ written: 0, skipped: 0 }) });
    const real = runStatusSummary({ report: report({ fetched: 3 }), sink: sink({ written: 3, skipped: 0 }) });
    expect(empty).not.toBe(real);
    expect(empty).toContain("抓0");
  });

  it("counts refusals across dirty + quarantined + disallowed together", () => {
    const summary = runStatusSummary({
      report: report({ fetched: 3, dirty: [{ uri: "a", reason: "too_short" }], quarantined: [{ uri: "b", reason: "injection_x" }], disallowed: [{ uri: "c", reason: "robots" }] }),
      sink: sink({ written: 0, skipped: 0 }),
    });
    expect(summary).toContain("擋3");
  });

  it("labels a budget-stopped run distinctly from a completed one", () => {
    const stopped = runStatusSummary({ report: report({ stoppedBy: "budget" }), sink: sink() });
    expect(stopped).toMatch(/^stopped_by_budget/);
  });

  it("fits comfortably under sources-store.ts's 100-char last_status column cap", () => {
    const summary = runStatusSummary({
      report: report({ fetched: 999, dirty: Array(50).fill({ uri: "x", reason: "too_short" }) }),
      sink: sink({ written: 999, skipped: 999 }),
    });
    expect(summary.length).toBeLessThanOrEqual(100);
  });
});
