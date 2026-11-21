import { describe, expect, it } from "vitest";
import { projectSystem, type FeatureRow, type PhaseRow, type UpdateRow } from "../projection";

const SYS = "00000000-0000-4000-8000-000000000001";
const phase = (id: string, legacy: string | null = null): PhaseRow => ({ id, system_id: SYS, slug: id, name: id, legacy_source_path: legacy, position: 0 });
const feature = (id: string, phase_id: string | null = null, position = 0): FeatureRow => ({ id, system_id: SYS, phase_id, slug: id, name: id, position });
let n = 0;
const ev = (event_type: string, payload: Record<string, unknown>, at: string, extra: Partial<UpdateRow> = {}): UpdateRow => ({
  id: `e${++n}`, event_key: `k${n}`, system_id: SYS, phase_id: null, feature_id: null, event_type, source: "agent",
  commit_sha: null, occurred_at: at, payload, ...extra,
});

describe("projectSystem", () => {
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
});
