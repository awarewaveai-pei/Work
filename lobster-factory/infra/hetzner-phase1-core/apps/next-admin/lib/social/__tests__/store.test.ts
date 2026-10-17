// Store rules that are not a query: which Postiz integration a new-channel attempt produced (ADR 016 §4), and how the
// 0105 fields travel (C20: repeat / tags / comments written and read). The database side is 0105_social_v16-local-verify.sh.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => h.client }));
const { pickFreshIntegration, savePost, getPost, POST_COLUMNS } = await import("../store");
const { repeatSlots } = await import("../repeat-rule");

const int = (id: string, identifier = "facebook") => ({ id, name: id, identifier, picture: null, disabled: false, profile: "" });

describe("pickFreshIntegration", () => {
  it("only a new integration of the platform that no brand owns yet", () => {
    const live = [int("known"), int("owned"), int("other", "x"), int("new")];
    expect(pickFreshIntegration(live, ["known"], new Set(["owned"]), "facebook")?.id).toBe("new");
  });

  // review 2026-10-15 C1: another brand's page connected meanwhile was attached to this brand
  it("never one that already belongs to a brand, and never a guess between two", () => {
    expect(pickFreshIntegration([int("b-page")], [], new Set(["b-page"]), "facebook")).toBeNull();
    expect(pickFreshIntegration([int("one"), int("two")], [], new Set(), "facebook")).toBeNull();
  });
});

describe("0105 fields: repeat, tags, comments", () => {
  const weekly = { freq: "week" as const, days: [2, 4], end: "never" as const };
  let rpc: ReturnType<typeof vi.fn>;
  let select: ReturnType<typeof vi.fn>;
  let row: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
    row = { id: "p1", organization_id: "b1", version: 2, repeat: weekly, scheduled_at: "2026-10-20T02:00:00Z", organization: { default_timezone: "Asia/Taipei" } };
    rpc = vi.fn(async (name: string) => name === "social_save_post"
      ? { data: [{ saved_post_id: "p1", saved_version: 2 }], error: null } : { data: 16, error: null });
    select = vi.fn(() => q);
    const q = { select, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) };
    h.client = { rpc, from: () => q };
  });
  afterEach(() => vi.useRealTimers());

  it("a save sends them to social_save_post, then makes a template's children for 60 days", async () => {
    const saved = await savePost("b1", "p1", 1, { body: "weekly", repeat: weekly, auto_mode: "own" }, null, null, "ops:owner",
      { comments: [{ body: "one" }, { body: "two", delay_minutes: 5 }], tags: ["t1"] });
    expect(rpc.mock.calls[0]).toEqual(["social_save_post", expect.objectContaining({
      p_post: { body: "weekly", repeat: weekly, auto_mode: "own" },
      p_comments: [{ body: "one" }, { body: "two", delay_minutes: 5 }], p_tags: ["t1"],
    })]);
    const [name, args] = rpc.mock.calls[1] as [string, { p_slots: string[]; p_withdraw: boolean; p_template: string }];
    expect(name).toBe("social_repeat_materialize");
    expect(args.p_template).toBe("p1");
    expect(args.p_withdraw).toBe(false);   // the save withdrew the untouched children itself (0105)
    expect((args as unknown as { p_expected_version: number }).p_expected_version).toBe(2);   // slots tied to the version read (0109)
    // Tue 2026-10-20 10:00 Taipei is the template; then every Tue / Thu 10:00 until 60 days from now
    expect(args.p_slots.slice(0, 3)).toEqual(["2026-10-22T02:00:00.000Z", "2026-10-27T02:00:00.000Z", "2026-10-29T02:00:00.000Z"]);
    expect(args.p_slots).toHaveLength(16);
    expect(saved).toEqual({ id: "p1", version: 2, repeat: { made: 16 } });
  });

  // critic 2026-10-17 (0109): a save between the read and the call must not get children on the old slots
  it("a template that moved since it was read is read again and its slots recomputed", async () => {
    let calls = 0;
    rpc.mockImplementation(async (name: string, args: { p_expected_version?: number }) => {
      if (name === "social_save_post") return { data: [{ saved_post_id: "p1", saved_version: 2 }], error: null };
      calls++;
      if (calls === 1) { row = { ...row, version: 3, repeat: { freq: "day", end: "count", count: 2 } }; return { data: -1, error: null }; }
      return { data: args.p_expected_version === 3 ? 1 : 99, error: null };
    });
    const saved = await savePost("b1", "p1", 1, { body: "x" }, null, null, "ops:owner");
    const last = rpc.mock.calls[2] as [string, { p_slots: string[]; p_expected_version: number }];
    expect(last[1].p_expected_version).toBe(3);
    expect(last[1].p_slots).toEqual(["2026-10-21T02:00:00.000Z"]);   // the new rule: daily, 2 in all
    expect(saved.repeat).toEqual({ made: 1 });
  });

  it("unchanged children are sent as null, and a post without a series makes no second call", async () => {
    row = { ...row, repeat: null };
    await savePost("b1", "p1", 1, { notes: "x" }, null, null, "ops:owner");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_comments: null, p_tags: null }));
  });

  it("a post is read with its series, comments and tags", async () => {
    await getPost("b1", "p1");
    expect(select).toHaveBeenCalledWith(POST_COLUMNS);
    for (const part of ["repeat", "repeat_of", "origin_slot", "auto_mode", "comments:social_post_comments(position, body, delay_minutes, media_id)", "tags:social_post_tags(tag_id)"]) {
      expect(POST_COLUMNS).toContain(part);
    }
  });

  it("end=count counts the template's day as the first", () => {
    expect(repeatSlots({ freq: "day", end: "count", count: 3 }, "2026-10-20T02:00:00Z", "Asia/Taipei", new Date("2026-10-17T00:00:00Z")))
      .toEqual(["2026-10-21T02:00:00.000Z", "2026-10-22T02:00:00.000Z"]);
  });
});
