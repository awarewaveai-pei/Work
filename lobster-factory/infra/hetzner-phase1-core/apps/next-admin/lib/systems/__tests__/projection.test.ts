import { describe, expect, it } from "vitest";
import { effectiveStatus } from "../overview";
import { projectSystem, spreadCommits, type FeatureRow, type PhaseRow, type UpdateRow } from "../projection";
import { readProjectionInput } from "../store";

const SYS = "00000000-0000-4000-8000-000000000001";
const phase = (id: string, legacy: string | null = null): PhaseRow => ({ id, system_id: SYS, slug: id, name: id, legacy_source_path: legacy, position: 0 });
const feature = (id: string, phase_id = "p0", position = 0): FeatureRow => ({ id, system_id: SYS, phase_id, slug: id, name: id, position });
let n = 0;
const ev = (event_type: string, payload: Record<string, unknown>, at: string, extra: Partial<UpdateRow> = {}): UpdateRow => ({
  id: `e${++n}`, event_key: `k${n}`, system_id: SYS, phase_id: null, feature_id: null, event_type, source: "agent",
  commit_sha: null, occurred_at: at, payload, ...extra,
});

describe("projectSystem", () => {
  it("the inferred status reads lastCommitAt as given: a review today leaves a 94-day-silent system 暫停（推定）", () => {
    const NOW = Date.parse("2026-11-22T00:00:00Z");
    const old = "2026-08-20T00:00:00Z"; // 94 days before NOW
    const p = projectSystem({ phases: [], features: [feature("f1")], lastCommitAt: old, events: [
      ev("review", { status: "verified", by: "u" }, "2026-11-21T00:00:00Z", { source: "user", feature_id: "f1", event_key: "user:r1" }),
    ] });
    expect(p.lastCommitAt).toBe(old);
    expect(p.lastActivityAt).toBe("2026-11-21T00:00:00Z");
    expect(effectiveStatus(p.status, p.lastCommitAt, NOW)).toEqual({ status: "paused", inferred: true });
    // not derived from events: a git handoff in the input does not move it
    const q = projectSystem({ phases: [], features: [], events: [ev("handoff", { subject: "x" }, "2026-11-20T00:00:00Z", { event_key: "git:abc:1", commit_sha: "abc" })] });
    expect(q.lastCommitAt).toBeNull();
  });

  it("a system with only trailer-less commits (activity, left out of the state read) is 開發中 when its last commit is 5 days old", async () => {
    const NOW = Date.parse("2026-11-22T00:00:00Z");
    const fiveDays = "2026-11-17T00:00:00Z";
    // the state reads return nothing (activity is not read), the view has the commit
    const reads: string[] = [];
    const sb = {
      from(table: string) {
        reads.push(table);
        const data = table === "system_last_commit" ? [{ system_id: SYS, last_commit_at: fiveDays }] : [];
        const q: Record<string, unknown> = {};
        for (const m of ["select", "not", "order", "limit", "eq", "in"]) q[m] = () => q;
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
        return q;
      },
    };
    const input = await readProjectionInput(sb as never, SYS);
    expect(reads).toContain("system_last_commit");
    const p = projectSystem({ phases: [], features: [], events: input.events, history: input.history, lastCommitAt: input.lastCommitAt[SYS] ?? null });
    expect(effectiveStatus(p.status, p.lastCommitAt, NOW)).toEqual({ status: "active", inferred: true });
  });

  it("handoff card: next is kept when a later handoff leaves it out; blocker clears only on blocker_cleared", () => {
    const p = projectSystem({ phases: [], features: [], events: [
      ev("handoff", { subject: "a", next: "write the route", blocker: "waiting on token" }, "2026-11-01T00:00:00Z"),
      ev("handoff", { subject: "b" }, "2026-11-02T00:00:00Z"),
    ] });
    expect(p.handoff.next).toBe("write the route");
    expect(p.handoff.blocker).toBe("waiting on token");
    expect(p.handoff.lastSubject).toBe("b");

    const cleared = projectSystem({ phases: [], features: [], events: [
      ev("handoff", { subject: "a", blocker: "waiting on token" }, "2026-11-01T00:00:00Z"),
      ev("handoff", { subject: "c", blocker_cleared: true, next: "ship" }, "2026-11-03T00:00:00Z"),
    ] });
    expect(cleared.handoff.blocker).toBeNull();
    expect(cleared.handoff.next).toBe("ship");
  });

  it("a Next: the old importer pasted on several systems is skipped; one named by System: (explicit) is kept", () => {
    const OTHER = "00000000-0000-4000-8000-000000000002";
    const spread = spreadCommits([
      { commit_sha: "aaa", system_id: SYS }, { commit_sha: "aaa", system_id: OTHER },
      { commit_sha: "bbb", system_id: SYS }, { commit_sha: "bbb", system_id: OTHER },
      { commit_sha: "ccc", system_id: SYS },
    ]);
    expect([...spread].sort()).toEqual(["aaa", "bbb"]);
    const p = projectSystem({ phases: [], features: [], spreadCommits: spread, events: [
      ev("handoff", { subject: "mine", next: "own step", blocker: "token" }, "2026-11-01T00:00:00Z", { commit_sha: "ccc" }),
      ev("handoff", { subject: "rename", next: "pasted everywhere", blocker_cleared: true }, "2026-11-02T00:00:00Z", { commit_sha: "aaa" }),
    ] });
    expect(p.handoff.next).toBe("own step");
    expect(p.handoff.lastSubject).toBe("mine");
    expect(p.handoff.blocker).toBeNull(); // a pasted Blocker-Cleared still clears
    const named = projectSystem({ phases: [], features: [], spreadCommits: spread, events: [
      ev("handoff", { subject: "both", next: "named step", explicit: true }, "2026-11-03T00:00:00Z", { commit_sha: "bbb" }),
    ] });
    expect(named.handoff.next).toBe("named step");
  });

  it("completion = verified / features not cancelled; no features = 尚未盤點 (null)", () => {
    expect(projectSystem({ phases: [], features: [], events: [] }).completion).toBeNull();
    const p = projectSystem({
      phases: [],
      features: [feature("f1"), feature("f2"), feature("f3"), feature("f4")],
      events: [
        ev("review", { status: "verified" }, "2026-11-01T00:00:00Z", { feature_id: "f1", source: "user" }),
        ev("feature_update", { status: "implemented" }, "2026-11-01T00:00:00Z", { feature_id: "f2" }),
        ev("feature_update", { status: "cancelled" }, "2026-11-01T00:00:00Z", { feature_id: "f3" }),
      ],
    });
    expect(p.counted).toBe(3);
    expect(p.verified).toBe(1);
    expect(p.implemented).toBe(1);
    expect(p.completion).toBeCloseTo(1 / 3);
  });

  it("verified comes only from a review: a feature_update or migration claiming it counts as implemented", () => {
    const p = projectSystem({
      phases: [],
      features: [feature("f1"), feature("f2")],
      events: [
        ev("feature_update", { status: "verified" }, "2026-11-01T00:00:00Z", { feature_id: "f1" }),
        ev("migration", { mapped_status: "verified", legacy_status: "done" }, "2026-11-01T00:00:00Z", { feature_id: "f2", source: "migration" }),
      ],
    });
    expect(p.features.map((f) => f.status)).toEqual(["implemented", "implemented"]);
    expect(p.verified).toBe(0);
  });

  it("a phase still on its old supervisor page is left out of completion until a migration event moves it", () => {
    const features = [feature("f1", "old"), feature("f2", "new")];
    const before = projectSystem({ phases: [phase("old", "agency-os/handoffs/x/"), phase("new")], features, events: [] });
    expect(before.counted).toBe(1);
    expect(before.features[0].legacy).toBe(true);
    const after = projectSystem({ phases: [phase("old", "agency-os/handoffs/x/"), phase("new")], features, events: [
      ev("migration", { mapped_status: "implemented" }, "2026-11-01T00:00:00Z", { feature_id: "f1", source: "migration" }),
    ] });
    expect(after.counted).toBe(2);
    expect(after.phases.find((x) => x.phase.id === "old")!.legacy).toBe(false);
  });

  it("a revert of a revert brings the original commit back; the history may come from another system's events", () => {
    const work = ev("handoff", { subject: "a", next: "from A" }, "2026-11-01T00:00:00Z", { commit_sha: "A" });
    const revertA = ev("revert", { reverted_sha: "A" }, "2026-11-02T00:00:00Z", { commit_sha: "B", system_id: null });
    const revertB = ev("revert", { reverted_sha: "B" }, "2026-11-03T00:00:00Z", { commit_sha: "C", system_id: null });
    expect(projectSystem({ phases: [], features: [], events: [work], history: [revertA] }).handoff.next).toBeNull();
    expect(projectSystem({ phases: [], features: [], events: [work], history: [revertA, revertB] }).handoff.next).toBe("from A");
  });

  it("an orphaned commit's events stop counting, and so do its reverts; the events themselves stay in the input", () => {
    const work = ev("handoff", { subject: "a", next: "from A" }, "2026-11-01T00:00:00Z", { commit_sha: "A" });
    const later = ev("handoff", { subject: "x", next: "from X" }, "2026-11-02T00:00:00Z", { commit_sha: "X" });
    const revertA = ev("revert", { reverted_sha: "A" }, "2026-11-03T00:00:00Z", { commit_sha: "R" });
    const gone = (sha: string) => ev("orphaned", { sha }, "2026-11-04T00:00:00Z", { system_id: null });
    expect(projectSystem({ phases: [], features: [], events: [work, later], history: [gone("X")] }).handoff.next).toBe("from A");
    expect(projectSystem({ phases: [], features: [], events: [work, revertA], history: [gone("R")] }).handoff.next).toBe("from A");
  });
});
