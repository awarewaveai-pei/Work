import { describe, expect, it } from "vitest";
import { approvedStartText, draftUrl, inLane, laneCounts, minutesToNextRun, nextStep, topicLane } from "../lanes";

const now = new Date("2026-11-19T03:02:00Z");
const row = (status: string, scheduled_for: string | null = null) => ({ status, scheduled_for });

describe("topic lanes", () => {
  it("puts each status in one lane; an old 'proposed' row from October is 過期, not 等你處理", () => {
    expect(["generating", "drafted", "waiting_video", "embedded"].map((s) => topicLane(row(s), now))).toEqual(["running", "running", "running", "running"]);
    expect(["reviewed", "failed"].map((s) => topicLane(row(s), now))).toEqual(["waiting", "waiting"]);
    expect(topicLane(row("proposed", "2026-11-25T01:00:00Z"), now)).toBe("waiting");
    expect(topicLane(row("proposed"), now)).toBe("waiting");
    // an October row written before any of this existed: only status + scheduled_for are read
    expect(topicLane(row("proposed", "2026-10-12T01:00:00Z"), now)).toBe("overdue");
    // a past time on any other status is not overdue
    expect(topicLane(row("approved", "2026-10-12T01:00:00Z"), now)).toBeNull();
    expect(["rejected", "scheduled", "published"].map((s) => topicLane(row(s), now))).toEqual([null, null, null]);
  });

  it("filters and counts with the same function", () => {
    const rows = [row("proposed", "2026-10-12T01:00:00Z"), row("proposed", "2026-11-25T01:00:00Z"), row("failed"), row("waiting_video"), row("published")];
    expect(laneCounts(rows, now)).toEqual({ all: 5, running: 1, waiting: 2, overdue: 1 });
    expect(inLane(rows, "overdue", now)).toEqual([rows[0]]);
    expect(inLane(rows, "all", now)).toHaveLength(5);
  });

  it("gives one next step per row; running rows have none", () => {
    expect(nextStep(row("proposed", "2026-11-25T01:00:00Z"), now)).toEqual({ action: "approve", label: "核准" });
    expect(nextStep(row("proposed", "2026-10-12T01:00:00Z"), now)).toEqual({ action: "reject", label: "退回" });
    expect(nextStep(row("failed"), now)).toEqual({ action: "retry", label: "重試" });
    expect(nextStep(row("reviewed"), now)).toEqual({ action: "publish", label: "發布" });
    expect(nextStep(row("generating"), now)).toBeNull();
    expect(nextStep(row("published"), now)).toBeNull();
  });

  it("says when an approved topic starts: the next 5-minute run if its time has passed, else its time", () => {
    expect(minutesToNextRun(now)).toBe(3);
    expect(minutesToNextRun(new Date("2026-11-19T03:05:00Z"))).toBe(5);
    expect(approvedStartText(row("approved", "2026-11-19T01:00:00Z"), now, "19日 09:00")).toBe("下一輪排程（約 3 分鐘內）開始；今天的額度滿了會順延");
    expect(approvedStartText(row("approved"), now, "—")).toBe("下一輪排程（約 3 分鐘內）開始；今天的額度滿了會順延");
    expect(approvedStartText(row("approved", "2026-11-25T01:00:00Z"), now, "25日 09:00")).toBe("排定 25日 09:00 開始");
    expect(approvedStartText(row("proposed"), now, "—")).toBeNull();
  });

  it("opens only an https draft link", () => {
    expect(draftUrl({ artifacts: { article: { wp_edit_url: "https://wp.example/edit" } } })).toBe("https://wp.example/edit");
    expect(draftUrl({ artifacts: { article: { wp_edit_url: "javascript:alert(1)" } } })).toBeNull();
    expect(draftUrl({ artifacts: {} })).toBeNull();
  });
});
