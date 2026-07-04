import { describe, expect, it } from "vitest";
import { collapseStormChildren } from "../correlate";
import {
  BACKUP_STATE,
  DEFAULT_ACTION_STALE_HOURS,
  DEFAULT_BACKUP_STALE_HOURS,
  DEFAULT_FAST_STALE_HOURS,
  FAST_TRANSIENT_STATES,
  staleCutoffIso,
} from "../hygiene";

describe("collapseStormChildren", () => {
  const row = (id: string, parent?: string | null) => ({ id, parent_incident_id: parent ?? null });

  it("hides children whose parent is present and counts them on the parent", () => {
    const { visible, childCount } = collapseStormChildren([
      row("kuma"),
      row("sentry", "kuma"),
      row("netdata", "kuma"),
      row("independent"),
    ]);
    expect(visible.map((r) => r.id)).toEqual(["kuma", "independent"]);
    expect(childCount.get("kuma")).toBe(2);
    expect(childCount.get("independent")).toBeUndefined();
  });

  it("keeps a child visible when its parent is NOT in the list (parent already resolved)", () => {
    const { visible, childCount } = collapseStormChildren([row("orphan-child", "resolved-parent")]);
    expect(visible.map((r) => r.id)).toEqual(["orphan-child"]);
    expect(childCount.size).toBe(0);
  });

  it("empty input → empty output", () => {
    const { visible, childCount } = collapseStormChildren([]);
    expect(visible).toEqual([]);
    expect(childCount.size).toBe(0);
  });
});

describe("reaper predicates", () => {
  it("fast transient states are the between-step trio — never repairing/triage_needed/backing_up", () => {
    expect([...FAST_TRANSIENT_STATES]).toEqual(["approved", "deploying"]);
    // repairing is a legitimate multi-day state (waiting for PR) — reaping it would
    // fight the humans. backing_up gets its own longer ceiling, not the fast one.
    expect([...FAST_TRANSIENT_STATES]).not.toContain("repairing");
    expect([...FAST_TRANSIENT_STATES]).not.toContain("triage_needed");
    expect([...FAST_TRANSIENT_STATES]).not.toContain("backing_up");
  });

  it("backing_up has a longer ceiling than the fast states (slow backup must not be reaped)", () => {
    expect(BACKUP_STATE).toBe("backing_up");
    expect(DEFAULT_BACKUP_STALE_HOURS).toBeGreaterThan(DEFAULT_FAST_STALE_HOURS);
  });

  it("staleCutoffIso computes the cutoff from a fixed clock", () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    expect(staleCutoffIso(6, now)).toBe("2026-07-03T06:00:00.000Z");
    expect(staleCutoffIso(DEFAULT_ACTION_STALE_HOURS, now)).toBe("2026-07-03T10:00:00.000Z");
    expect(DEFAULT_FAST_STALE_HOURS).toBe(6);
  });
});
