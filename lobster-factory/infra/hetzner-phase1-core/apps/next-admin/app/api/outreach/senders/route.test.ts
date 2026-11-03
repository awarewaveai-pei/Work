// POST /api/outreach/senders test_send (0157): owner/admin only, draft-mode mailboxes only, hours 0/1/8/24.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "00000000-0000-4000-8000-0000000000a1";
const s = vi.hoisted(() => ({ sendMode: "draft", updates: [] as unknown[], timeline: [] as unknown[] }));

vi.mock("@/lib/outreach/db-client", () => ({
  outreachDb: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.update = (p: unknown) => { s.updates.push(p); return q; };
      q.insert = async (p: unknown) => { if (table === "co_timeline_events") s.timeline.push(p); return { error: null }; };
      q.maybeSingle = async () => ({ data: { organization_id: null, email: "main@gmail.com", stream_type: "cold", send_mode: s.sendMode, connector_id: "c1", warmup_started_at: null }, error: null });
      q.then = (res: (v: unknown) => unknown) => res({ error: null });
      return q;
    },
  }),
}));

const { POST } = await import("./route");
const call = (role: string, body: Record<string, unknown>) => POST(new Request("http://app.test/api/outreach/senders", { method: "POST",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": role, "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ action: "test_send", id: ID, hours: 1, recipients: ["me@mine.example"], ...body }) }));

beforeEach(() => { s.sendMode = "draft"; s.updates.length = 0; s.timeline.length = 0; });

describe("POST /api/outreach/senders test_send", () => {
  it("owner opens a window: until and the lower-cased list are saved, one timeline event", async () => {
    const res = await call("owner", { recipients: ["Me@Mine.example", "me@mine.example"] });
    expect(res.status).toBe(200);
    expect(s.updates[0]).toMatchObject({ test_recipients: ["me@mine.example"] });
    expect((s.updates[0] as { test_send_until: string }).test_send_until).toMatch(/^\d{4}-/);
    expect(s.timeline[0]).toMatchObject({ event_type: "test_send_on" });
  });

  it("hours 0 turns it off", async () => {
    const res = await call("admin", { hours: 0, recipients: [] });
    expect(res.status).toBe(200);
    expect(s.updates[0]).toMatchObject({ test_send_until: null });
    expect(s.timeline[0]).toMatchObject({ event_type: "test_send_off" });
  });

  it("an operator is refused (403) and nothing is written", async () => {
    const res = await call("operator", {});
    expect(res.status).toBe(403);
    expect(s.updates).toEqual([]);
  });

  it("a pool mailbox is refused", async () => {
    s.sendMode = "auto";
    expect((await call("owner", {})).status).toBe(400);
    expect(s.updates).toEqual([]);
  });

  it("hours 168 (7 days) opens a week-long window", async () => {
    expect((await call("owner", { hours: 168 })).status).toBe(200);
    const until = Date.parse((s.updates[0] as { test_send_until: string }).test_send_until);
    expect(until - Date.now()).toBeGreaterThan(167 * 3_600_000);
  });

  it.each([2, 12, -1, "8"])("hours %s is refused", async (hours) => {
    expect((await call("owner", { hours })).status).toBe(400);
    expect(s.updates).toEqual([]);
  });

  it("no recipient, a bad address or more than 10 is refused", async () => {
    for (const recipients of [[], ["not-an-email"], Array.from({ length: 11 }, (_, i) => `u${i}@mine.example`)]) {
      expect((await call("owner", { recipients })).status).toBe(400);
    }
    expect(s.updates).toEqual([]);
  });
});
