// The control page's all-sites table (AUTO_CONTENT P9.3): off without a schedule row, B1 "proposed" condition, problems first, B4 gate reading.
import { describe, expect, it } from "vitest";
import { buildOverview, type OverviewInput } from "../overview";

const site = (id: string, org: string, defaults: Record<string, unknown> | null = {}) =>
  ({ id, name: `site-${id}`, organizationId: org, orgName: `org-${org}`, defaults, attemptedAt: null }) as OverviewInput["sites"][number];
const topic = (siteId: string, status: string, source = "plan") => ({ siteId, status, source }) as OverviewInput["topics"][number];
const base = (over: Partial<OverviewInput>): OverviewInput => ({ sites: [], schedules: [], topics: [], canPlan: { a: true, b: true }, spendUsd: {}, ...over });

describe("buildOverview", () => {
  it("(a) a client without a content_pipeline row is off", () => {
    const [r] = buildOverview(base({ sites: [site("s1", "a")] }));
    expect(r.enabled).toBe(false);
    const [on] = buildOverview(base({ sites: [site("s1", "a")], schedules: [{ organizationId: "a", enabled: true, dailyLimit: 3, lastError: null }] }));
    expect([on.enabled, on.dailyLimit]).toEqual([true, 3]);
  });

  it("(b) a site with only manual topics has no proposal this month", () => {
    const [r] = buildOverview(base({ sites: [site("s1", "a")], topics: [topic("s1", "proposed", "manual")] }));
    expect(r.proposedThisMonth).toBe(false);
    const [p] = buildOverview(base({ sites: [site("s1", "a")], topics: [topic("s1", "proposed", "kb")] }));
    expect(p.proposedThisMonth).toBe(true);
  });

  it("(c) one failed topic sorts before another site's three waiting topics", () => {
    const rows = buildOverview(base({
      sites: [site("waiting", "a"), site("broken", "b")],
      topics: [topic("waiting", "proposed"), topic("waiting", "proposed"), topic("waiting", "proposed"), topic("broken", "failed")],
    }));
    expect(rows.map((r) => r.siteId)).toEqual(["broken", "waiting"]);
    expect([rows[1].pending, rows[0].failed]).toEqual([3, 1]);
  });

  it("(d) topicMode AI_PICK (wrong case) shows a person; the exact value shows AI (B4)", () => {
    const [bad, ok, none] = buildOverview(base({ sites: [site("s1", "a", { topicMode: "AI_PICK" }), site("s2", "a", { topicMode: "ai_pick" }), site("s3", "a", null)] }));
    expect(bad.topicGate).toBe("human");
    expect(ok.topicGate).toBe("ai");
    expect(none.topicGate).toBe("human");
  });

  it("a client without content.plan, or with a last error, counts as a problem and sorts first", () => {
    const rows = buildOverview(base({
      sites: [site("fine", "a"), site("noplan", "b"), site("err", "c")],
      canPlan: { a: true, b: false, c: true },
      schedules: [{ organizationId: "c", enabled: true, dailyLimit: null, lastError: "boom" }],
    }));
    expect(rows.map((r) => [r.siteId, r.problem])).toEqual([["noplan", true], ["err", true], ["fine", false]]);
  });

  it("counts in-progress topics and carries the client's month spend", () => {
    const [r] = buildOverview(base({
      sites: [site("s1", "a")],
      topics: [topic("s1", "generating"), topic("s1", "drafted"), topic("s1", "approved"), topic("s1", "published")],
      spendUsd: { a: 1.25 },
    }));
    expect([r.inProgress, r.spendUsd]).toEqual([2, 1.25]);
  });
});
