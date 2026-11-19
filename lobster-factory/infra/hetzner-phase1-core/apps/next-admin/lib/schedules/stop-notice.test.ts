import { describe, expect, it, vi } from "vitest";
import { topicStopNotice, withTopicStopNotices, type Notice } from "./stop-notice";
import type { TickDeps } from "@/lib/content/topics/tick";

const topic = { id: "t1", title: "夏季防曬", status: "generating" };
const baseDeps = (moved: boolean) => ({ move: vi.fn(async (t: typeof topic, to: string) => (moved ? { ...t, status: to } : null)) }) as unknown as TickDeps;

describe("withTopicStopNotices", () => {
  it("a topic that fails raises one notice with title, status, reason, link and a per-topic-per-status fingerprint", async () => {
    const raise = vi.fn(async (_n: Notice) => {});
    const deps = withTopicStopNotices(baseDeps(true), raise);
    await deps.move(topic as never, "failed", { last_error: "WordPress 回 401" });
    expect(raise).toHaveBeenCalledTimes(1);
    const n = raise.mock.calls[0][0] as ReturnType<typeof topicStopNotice>;
    expect(n.fingerprint).toBe("content_pipeline:t1:failed");
    expect(n.title).toBe("題目〈夏季防曬〉停在失敗：WordPress 回 401");
    expect(n.message).toContain("/tools/content/topics");
  });

  it("a return to the person (proposed) notifies; other moves and lost races do not; a raise error never fails the move", async () => {
    const raise = vi.fn(async (_n: Notice) => { throw new Error("down"); });
    const deps = withTopicStopNotices(baseDeps(true), raise);
    await expect(deps.move(topic as never, "proposed", { last_error: "網站不見了" })).resolves.toBeTruthy();
    expect(raise.mock.calls[0][0]).toMatchObject({ fingerprint: "content_pipeline:t1:proposed" });
    await deps.move(topic as never, "reviewed");
    expect(raise).toHaveBeenCalledTimes(1);
    const lost = withTopicStopNotices(baseDeps(false), raise);
    await lost.move(topic as never, "failed", { last_error: "x" });
    expect(raise).toHaveBeenCalledTimes(1);
  });
});
