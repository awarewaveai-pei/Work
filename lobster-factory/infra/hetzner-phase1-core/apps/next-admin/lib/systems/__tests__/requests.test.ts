import { describe, expect, it } from "vitest";
import { parseUserRequest } from "../contract";
import { pendingFrom, readPending } from "../store";

describe("契約 3 payloads", () => {
  it("refresh_request: empty or by only", () => {
    expect(parseUserRequest("refresh_request", {})).toEqual({ ok: true, payload: {} });
    expect(parseUserRequest("refresh_request", { by: "u1" })).toEqual({ ok: true, payload: { by: "u1" } });
    expect(parseUserRequest("refresh_request", { name: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/payload\.name/) });
    expect(parseUserRequest("refresh_request", [])).toMatchObject({ ok: false });
  });

  it("system_proposed: name / purpose 1-200 after trim, type one of five", () => {
    expect(parseUserRequest("system_proposed", { by: "u1", name: "  外送系統 ", type: "product", purpose: " 寄信 " }))
      .toEqual({ ok: true, payload: { by: "u1", name: "外送系統", type: "product", purpose: "寄信" } });
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ name: "   ", type: "product", purpose: "x" }, /payload\.name: empty/],
      [{ name: "x".repeat(201), type: "product", purpose: "x" }, /payload\.name/],
      [{ name: "x", type: "toy", purpose: "x" }, /payload\.type/],
      [{ name: "x", type: "client", purpose: "" }, /payload\.purpose/],
      [{ name: "x", type: "client", purpose: "y".repeat(201) }, /payload\.purpose/],
      [{ name: "x", type: "client", purpose: "y", slug: "z" }, /payload\.slug: not allowed/],
    ];
    for (const [payload, err] of bad) expect(parseUserRequest("system_proposed", payload)).toMatchObject({ ok: false, error: expect.stringMatching(err) });
  });

  it("system_proposal_closed: proposal_event_key and a reason", () => {
    expect(parseUserRequest("system_proposal_closed", { by: "u1", proposal_event_key: "user:abc", reason: " 重複 " }))
      .toEqual({ ok: true, payload: { by: "u1", proposal_event_key: "user:abc", reason: "重複" } });
    expect(parseUserRequest("system_proposal_closed", { proposal_event_key: "user:abc", reason: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/payload\.reason/) });
    expect(parseUserRequest("system_proposal_closed", { reason: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/payload\.proposal_event_key/) });
    expect(parseUserRequest("system_proposal_closed", { proposal_event_key: "k", reason: "x", name: "y" })).toMatchObject({ ok: false, error: expect.stringMatching(/payload\.name: not allowed/) });
  });
});

const systems = [{ name: "外送系統", slug: "outbound-os", aliases: ["Outbound OS"] }];
const proposal = (name: string, at: string, purpose = "p") => ({ event_key: `user:${name}:${at}`, payload: { name, type: "product", purpose }, occurred_at: at });
const closing = (key: string) => ({ payload: { proposal_event_key: key, reason: "duplicate" } });

describe("pendingFrom", () => {
  it("refresh only when the newest request is newer than the newest import_run", () => {
    const base = { proposals: [], systems };
    expect(pendingFrom({ ...base, lastRequestAt: null, lastRunAt: null }).refresh).toBe(false);
    expect(pendingFrom({ ...base, lastRequestAt: "2026-11-22T01:00:00Z", lastRunAt: null }).refresh).toBe(true);
    expect(pendingFrom({ ...base, lastRequestAt: "2026-11-22T01:00:00.001Z", lastRunAt: "2026-11-22T01:00:00.000Z" }).refresh).toBe(true);
    expect(pendingFrom({ ...base, lastRequestAt: "2026-11-22T01:00:00Z", lastRunAt: "2026-11-22T01:00:00Z" }).refresh).toBe(false);
    expect(pendingFrom({ ...base, lastRequestAt: "2026-11-22T01:00:00Z", lastRunAt: "2026-11-22T01:05:00Z" }).refresh).toBe(false);
  });

  it("a proposal is pending until a live system has its name, slug or alias (whitespace and case ignored)", () => {
    const out = pendingFrom({
      lastRequestAt: null, lastRunAt: null, systems,
      proposals: [
        proposal("外送 系統", "2026-11-22T01:00:00Z"), // = name
        proposal("OUTBOUND-OS", "2026-11-22T01:01:00Z"), // = slug
        proposal("outboundos", "2026-11-22T01:02:00Z"), // = alias "Outbound OS"
        proposal("記帳本", "2026-11-22T01:04:00Z", "new"),
        proposal("記 帳本", "2026-11-22T01:03:00Z", "old"), // same name asked twice: listed once, newest
        proposal("算命站", "2026-11-22T01:05:00Z"),
      ],
    });
    expect(out.proposals).toEqual([
      { event_key: "user:記帳本:2026-11-22T01:04:00Z", name: "記帳本", type: "product", purpose: "new", at: "2026-11-22T01:04:00Z" },
      { event_key: "user:算命站:2026-11-22T01:05:00Z", name: "算命站", type: "product", purpose: "p", at: "2026-11-22T01:05:00Z" },
    ]);
  });

  it("a closed proposal is gone, with the older copies of its name; a newer one of that name comes back", () => {
    const older = proposal("記帳本", "2026-11-22T01:00:00Z");
    const listed = proposal("記帳本", "2026-11-22T01:01:00Z");
    const base = { lastRequestAt: null, lastRunAt: null, systems };
    expect(pendingFrom({ ...base, proposals: [older, listed], closed: [closing(listed.event_key)] }).proposals).toEqual([]);
    const later = proposal("記帳本", "2026-11-22T02:00:00Z");
    expect(pendingFrom({ ...base, proposals: [older, listed, later], closed: [closing(listed.event_key)] }).proposals.map((p) => p.event_key))
      .toEqual([later.event_key]);
  });
});

describe("readPending", () => {
  it("reads the newest request and run, the open proposals and the live systems", async () => {
    const open = proposal("記帳本", "2026-11-22T01:30:00Z");
    const shut = proposal("算命站", "2026-11-22T01:20:00Z");
    const rows: Record<string, unknown[]> = {
      refresh_request: [{ occurred_at: "2026-11-22T02:00:00Z" }],
      import_run: [{ occurred_at: "2026-11-22T01:00:00Z" }],
      system_proposed: [open, shut],
      system_proposal_closed: [closing(shut.event_key)],
      systems,
    };
    const sb = {
      from(table: string) {
        let key = table;
        const q = {
          select: () => q, order: () => q, limit: () => q,
          eq: (col: string, v: string) => { if (col === "event_type") key = v; if (col === "in_registry") expect(v).toBe(true); return q; },
          then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: rows[key], error: null }).then(ok),
        };
        return q;
      },
    };
    expect(await readPending(sb as never)).toEqual({
      refresh: true, proposals: [{ event_key: open.event_key, name: "記帳本", type: "product", purpose: "p", at: "2026-11-22T01:30:00Z" }],
    });
  });
});
