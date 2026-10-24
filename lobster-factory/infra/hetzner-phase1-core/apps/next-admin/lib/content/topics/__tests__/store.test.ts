// content_topics store: moves only along NEXT, guarded by the status and version read; DB errors throw.
import { describe, expect, it, vi } from "vitest";
import { NEXT, TOPIC_STATUSES, TopicMoveRefused, monthKey, move, proposeTopics, startTopic, startedOn } from "../store";

/** A query builder that records every filter and answers with `result`. */
function fakeSb(result: { data?: unknown; error?: { message: string } | null; count?: number }) {
  const calls: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "update", "upsert", "order"]) q[k] = (...a: unknown[]) => { calls.push([k, a]); return q; };
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count }).then(res);
  return { sb: { from: vi.fn(() => q) } as never, calls };
}

const t = { id: "t1", organization_id: "org", status: "approved" as const, version: 3 };

describe("NEXT", () => {
  it("covers every status, points only at real statuses, and published is the end", () => {
    expect(Object.keys(NEXT).sort()).toEqual([...TOPIC_STATUSES].sort());
    for (const tos of Object.values(NEXT)) for (const s of tos) expect(TOPIC_STATUSES).toContain(s);
    expect(NEXT.published).toEqual([]);
    expect(NEXT.proposed).not.toContain("generating");     // nothing is made before someone approves it
  });
});

describe("move", () => {
  it("updates only the row still at the status and version read, bumping the version", async () => {
    const { sb, calls } = fakeSb({ data: [{ ...t, status: "proposed", version: 4 }] });
    const r = await move(sb, t, "proposed", { formats: ["article"] });
    expect(r?.version).toBe(4);
    const upd = calls.find(([k]) => k === "update")![1][0] as Record<string, unknown>;
    expect(upd).toMatchObject({ status: "proposed", version: 4, formats: ["article"] });
    expect(calls.filter(([k]) => k === "eq").map(([, a]) => a)).toEqual([["id", "t1"], ["organization_id", "org"], ["status", "approved"], ["version", 3]]);
  });

  it("someone else moved it first: null, nothing thrown", async () => {
    expect(await move(fakeSb({ data: [] }).sb, t, "proposed")).toBeNull();
  });

  it("starting goes only through startTopic (the daily cap)", async () => {
    await expect(move(fakeSb({ data: [] }).sb, t, "generating")).rejects.toThrow("startTopic");
  });

  it("an error longer than the column is cut, so recording a failure cannot fail", async () => {
    const { sb, calls } = fakeSb({ data: [] });
    await move(sb, { ...t, status: "generating" }, "failed", { last_error: "x".repeat(2000) });
    expect((calls.find(([k]) => k === "update")![1][0] as { last_error: string }).last_error).toHaveLength(500);
  });

  it("a move not in NEXT is refused before the database", async () => {
    const { sb } = fakeSb({ data: [] });
    await expect(move(sb, { ...t, status: "proposed" }, "published")).rejects.toBeInstanceOf(TopicMoveRefused);
    expect((sb as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("a database error throws", async () => {
    await expect(move(fakeSb({ error: { message: "down" } }).sb, t, "proposed")).rejects.toThrow("content_topics:move:down");
  });
});

describe("startTopic", () => {
  it("one call to content_topics_start with the organization, version, day and cap; null when refused", async () => {
    const rpc = vi.fn(async () => ({ data: [{ ...t, status: "generating", version: 4 }], error: null }));
    expect((await startTopic({ rpc } as never, t, "2026-10-24", 2))?.version).toBe(4);
    expect(rpc).toHaveBeenCalledWith("content_topics_start", { p_org: "org", p_id: "t1", p_version: 3, p_day: "2026-10-24", p_cap: 2 });
    expect(await startTopic({ rpc: async () => ({ data: [], error: null }) } as never, t, "d", 2)).toBeNull();
    await expect(startTopic({ rpc: async () => ({ data: null, error: { message: "x" } }) } as never, t, "d", 2)).rejects.toThrow("content_topics:start:x");
  });
});

describe("proposeTopics / startedOn / monthKey", () => {
  it("skips a keyword the brand already has that month", async () => {
    const { sb, calls } = fakeSb({ data: [] });
    await proposeTopics(sb, [{ organization_id: "org", site_id: null, title: " 標題 ", keyword: " 感恩 ", source: "plan", month: "2026-11-17", created_by: "x" }]);
    const [rows, opts] = calls.find(([k]) => k === "upsert")![1] as [Array<Record<string, unknown>>, unknown];
    expect(rows[0]).toMatchObject({ month: "2026-11-01", keyword: "感恩", title: "標題" });
    expect(opts).toEqual({ onConflict: "organization_id,month,keyword", ignoreDuplicates: true });
  });

  it("counts the day's starts and throws on error", async () => {
    expect(await startedOn(fakeSb({ count: 2 }).sb, "org", "2026-10-24")).toBe(2);
    await expect(startedOn(fakeSb({ error: { message: "x" } }).sb, "org", "d")).rejects.toThrow("content_topics:started_on:x");
  });

  it("monthKey takes a month or any date in it", () => {
    expect(monthKey("2026-11")).toBe("2026-11-01");
    expect(monthKey(new Date("2026-02-28T23:00:00Z"))).toBe("2026-02-01");
    expect(() => monthKey("nope")).toThrow();
    expect(() => monthKey("2026-13")).toThrow();          // a month that does not exist
    expect(() => monthKey("2026-00-10")).toThrow();
  });
});
