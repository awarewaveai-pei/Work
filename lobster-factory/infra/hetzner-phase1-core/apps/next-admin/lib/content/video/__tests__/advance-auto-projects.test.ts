// B24: projects still waiting for their video do not use up the per-organization slots of a firing.
import { beforeEach, describe, expect, it, vi } from "vitest";

const advanceProject = vi.fn();
vi.mock("../project-advance", () => ({ advanceProject: (...a: unknown[]) => advanceProject(...a) }));
vi.mock("../project-advance-deps", () => ({ advanceDeps: () => ({}) }));

import { AUTO_ADVANCE_CANDIDATES, AUTO_ADVANCE_PER_ORG, autoAdvanceDeps } from "../advance-auto-projects";

/** Fake supabase: serves the requested range of the rows; a row listed in `gone` has left the auto set once advanced. */
function fakeSb(rows: { id: string }[]) {
  const seen = { ranges: [] as number[][] };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
  q.range = async (from: number, to: number) => { seen.ranges.push([from, to]); return { data: rows.slice(from, to + 1).map((r) => ({ ...r, title: r.id, source_ref: "", updated_at: "2026-01-01T00:00:00Z", brief_json: null })), error: null }; };
  return { sb: { from: () => q } as never, seen };
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
const outcomeFor = (results: Record<string, "waiting" | "done" | "stopped">) =>
  advanceProject.mockImplementation(async (_d: unknown, p: { id: string }) => ({ projectId: p.id, result: results[p.id] ?? "done", note: "", stage: "review" }));

beforeEach(() => { advanceProject.mockReset(); }); // braces: a returned mock would be run as the teardown

describe("autoAdvanceDeps.advanceOrganization", () => {
  it("the three oldest are waiting, the fourth can finish -> the fourth is advanced", async () => {
    outcomeFor({ p1: "waiting", p2: "waiting", p3: "waiting", p4: "done" });
    const { sb, seen } = fakeSb(ids(4));
    const out = await autoAdvanceDeps(sb, async () => {}).advanceOrganization("o1");
    expect(seen.ranges).toEqual([[0, AUTO_ADVANCE_CANDIDATES - 1]]);
    expect(out.map((o) => `${o.projectId} ${o.result}`)).toEqual(["p1 waiting", "p2 waiting", "p3 waiting", "p4 done"]);
  });

  it("three done -> the fourth is not touched; a stop counts as moved too", async () => {
    outcomeFor({ p1: "done", p2: "stopped", p3: "done" });
    const { sb } = fakeSb(ids(5));
    const out = await autoAdvanceDeps(sb, async () => {}).advanceOrganization("o1");
    expect(out).toHaveLength(AUTO_ADVANCE_PER_ORG);
    expect(advanceProject).toHaveBeenCalledTimes(AUTO_ADVANCE_PER_ORG);
  });

  it("more waiting projects than one page -> the next page is read and the first finished one after them is advanced", async () => {
    const n = AUTO_ADVANCE_CANDIDATES + 1;
    const waiting = Object.fromEntries(Array.from({ length: AUTO_ADVANCE_CANDIDATES }, (_, i) => [`p${i + 1}`, "waiting" as const]));
    outcomeFor({ ...waiting, [`p${n}`]: "done" });
    const { sb, seen } = fakeSb(ids(n));
    const out = await autoAdvanceDeps(sb, async () => {}).advanceOrganization("o1");
    expect(out.at(-1)).toMatchObject({ projectId: `p${n}`, result: "done" });
    expect(seen.ranges).toEqual([[0, 19], [20, 39]]);
  });
});
