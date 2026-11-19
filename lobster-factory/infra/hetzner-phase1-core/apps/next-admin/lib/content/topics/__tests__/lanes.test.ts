import { describe, expect, it } from "vitest";
import { approvedStartText, draftPrivacy, draftUrl, inLane, laneCounts, minutesToNextRun, nextStep, publishConfirm, publishTargets, topicLane,
  youtubePrivacyMismatch } from "../lanes";

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

  // N6 risk fix: the YouTube line names the draft's own privacy (fixed when the draft was made), not the site's setting now
  it("the 發布 confirmation names the YouTube draft's privacy; a site changed since gets a reminder; unreadable = says so", () => {
    const t = { formats: ["article", "video"] as never, artifacts: { social: { youtube_post_id: "yt-1" }, article: { wp_post_id: 5 } } };
    // the draft was made public, the site was switched to 不公開 afterwards
    const draft = draftPrivacy([{ format: "post" }]);
    const to = publishTargets(t, draft);
    const confirm = publishConfirm("題目", to, false, youtubePrivacyMismatch(draft, "unlisted"));
    expect(to[0]).toBe("YouTube（這則草稿：公開）");
    expect(confirm.reminder).toContain("提醒：網站設定現在是「不公開」，但這則 YouTube 草稿是「公開」");
    // unreadable draft: no guess, no reminder
    const unknown = publishTargets(t, draftPrivacy(undefined));
    expect(unknown[0]).toBe("YouTube（這則草稿：無法確認，請到社群草稿看）");
    expect(publishConfirm("題目", unknown, false, youtubePrivacyMismatch(null, "unlisted")).reminder).toBeNull();
  });
});
