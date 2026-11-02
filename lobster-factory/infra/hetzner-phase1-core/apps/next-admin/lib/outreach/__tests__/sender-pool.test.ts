// Card C8.1: stage caps and round-robin by fill. The caps themselves are counted in SQL (co_begin_send, 0152), raced in
// packages/db/tests/test_0152_sender_pool.py.
import { describe, expect, it } from "vitest";
import { capOf, pickSender, sendCaps, type PoolAccount } from "../sender-pool";

const acc = (id: string, over: Partial<PoolAccount> = {}): PoolAccount => ({ id, organization_id: "org", email: `${id}@a.pool.example`, is_active: true,
  health_status: "healthy", send_mode: "auto", warmup_stage: "w1", daily_limit: 50, connector_id: `c-${id}`, ...over });

describe("sender pool", () => {
  it("each warm-up stage has its cap: 10 / 20 / 35, then the mailbox's own limit up to 50", () => {
    expect(["w1", "w2", "w3", "full"].map((s) => capOf({ warmup_stage: s, daily_limit: 50 }))).toEqual([10, 20, 35, 50]);
    expect(capOf({ warmup_stage: "full", daily_limit: 40 })).toBe(40);
    expect(capOf({ warmup_stage: "full", daily_limit: 80 })).toBe(50);
  });

  it("picks the in-pool mailbox with the lowest share of its cap; paused, draft and unlinked ones never", () => {
    const pool = [acc("a", { warmup_stage: "w2" }), acc("b"), acc("p", { health_status: "paused" }), acc("d", { send_mode: "draft" }), acc("u", { connector_id: null })];
    // a: 6/20 = 0.3, b: 4/10 = 0.4 -> a; the others are empty but out of the pool
    expect(pickSender(pool, new Map([["a", 6], ["b", 4]]))?.id).toBe("a");
    expect(pickSender(pool, new Map([["a", 10], ["b", 4]]))?.id).toBe("b");
    expect(pickSender([acc("p", { health_status: "paused" })], new Map())).toBeNull();
  });

  it("the sender-domain cap is the stage caps of that domain's in-pool mailboxes summed", () => {
    const pool = [acc("a", { warmup_stage: "w2" }), acc("b"), acc("x", { email: "x@other.example" }), acc("p", { health_status: "paused" })];
    expect(sendCaps(pool[0], pool)).toEqual({ mailbox: 20, sender_domain: 30, recipient_30d: 2 });
  });
});
