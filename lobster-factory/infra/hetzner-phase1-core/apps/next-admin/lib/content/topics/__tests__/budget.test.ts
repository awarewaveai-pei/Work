// N2: a topic's spending cap. Spent = the ledger (ai_call_logs for job_id = the topic) or the budget's own record
// (reservations included), whichever is more; a step that would pass the cap fails the topic there; a topic made before
// N2 counts from TOPIC_BUDGET_EPOCH.
import { describe, expect, it } from "vitest";
import { capGuard, type TopicArtifacts } from "../make";
import { DEFAULT_TOPIC_CAP_TWD, TOPIC_BUDGET_EPOCH, TopicCapReached } from "../budget";

/** A fake ledger: rows of { at, twd }; what the guard reads = the sum since its budget began. */
const ledger = (rows: Array<{ at: string; twd: number }>) => async (startedAt: string) =>
  rows.filter((r) => r.at >= startedAt).reduce((n, r) => n + r.twd, 0);
const AFTER = "2026-11-20T01:00:00.000Z";

describe("topic cap guard", () => {
  it("a step that would pass the cap stops the topic there and names the cap and the step; the spend stays recorded", async () => {
    const artifacts: TopicArtifacts = {};
    const guard = capGuard({ id: "t1" }, artifacts, DEFAULT_TOPIC_CAP_TWD, ledger([{ at: AFTER, twd: 12.5 }]));
    await expect(guard(1, "社群文案")).resolves.toBeUndefined();   // 12.5 + 1 fits under 15, reserved
    const err = await guard(3, "影片").catch((e) => e);
    expect(err).toBeInstanceOf(TopicCapReached);
    expect(err.message).toBe("這一題花到上限 NT$15，停在〈影片〉（已花 NT$13.5，這一步最多要 NT$3）");
    expect(artifacts.budget).toMatchObject({ budgetTwd: 15, spentTwd: 13.5, startedAt: TOPIC_BUDGET_EPOCH });
  });

  it("calls whose ledger rows are not written yet still count: their reservations, until settled at the exact cost", async () => {
    const artifacts: TopicArtifacts = {};
    const guard = capGuard({ id: "t3" }, artifacts, 10, ledger([]));   // the ledger is behind: nothing there yet
    await guard(6, "社群文案");
    await expect(guard(6, "社群文案")).rejects.toThrow("停在〈社群文案〉（已花 NT$6");
    guard.exact(6, 2);   // the first call's exact cost
    await expect(guard(6, "社群文案")).resolves.toBeUndefined();   // 2 + 6 under 10
    expect(artifacts.budget?.spentTwd).toBe(8);
  });

  it("a step that failed before paying gives its reservation back: the retry is not blocked by money never spent", async () => {
    const artifacts: TopicArtifacts = {};
    const guard = capGuard({ id: "t4" }, artifacts, 10, ledger([]));
    await guard(6, "文章");
    guard.exact(6, 0);   // the article call was refused (no key): nothing billed, nothing in the ledger
    const retry = capGuard({ id: "t4" }, { budget: artifacts.budget }, 10, ledger([]));
    await expect(retry(6, "文章")).resolves.toBeUndefined();
  });

  it("an old drafted topic with no budget continues its video step: counted from the N2 switch-over, cap 15", async () => {
    // made before N2: its article and pictures were paid before the switch-over (images already carried the topic id)
    const artifacts: TopicArtifacts = { article: { wp_post_id: 7, wp_edit_url: null, seo_score: 80, summary: "s", source: "x", checks: [] } };
    const rows = [{ at: "2026-11-19T09:00:00.000Z", twd: 14 }];
    await expect(capGuard({ id: "t-old" }, artifacts, DEFAULT_TOPIC_CAP_TWD, ledger(rows))(1.56, "影片")).resolves.toBeUndefined();
    expect(artifacts.budget).toEqual({ budgetTwd: 15, spentTwd: 1.56, startedAt: TOPIC_BUDGET_EPOCH });
    // its video failed after the script was paid; the budget never reached the row. The retry still counts that script.
    rows.push({ at: AFTER, twd: 14 });
    const retry: TopicArtifacts = { article: artifacts.article };
    await expect(capGuard({ id: "t-old" }, retry, DEFAULT_TOPIC_CAP_TWD, ledger(rows))(1.56, "影片")).rejects.toThrow(TopicCapReached);
  });

  it("a budget kept on the row is resumed: its start stays, and the cap is the higher of the kept one and today's", async () => {
    const artifacts = { budget: { budgetTwd: 15, spentTwd: 9, startedAt: "2026-11-20T00:00:00.000Z" } } as TopicArtifacts;
    const guard = capGuard({ id: "t2" }, artifacts, 10, ledger([{ at: "2026-11-20T00:30:00.000Z", twd: 9 }]));   // setting lowered meanwhile
    await expect(guard(5, "影片")).resolves.toBeUndefined();   // 9 + 5 under the kept 15
    expect(artifacts.budget).toEqual({ budgetTwd: 15, spentTwd: 14, startedAt: "2026-11-20T00:00:00.000Z" });
  });
});
