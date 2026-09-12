// createSupabaseRateLimitStore()'s own call shape and failure behaviour — separate from
// scripts/collect-rate-limit-verify.ts, which proves the DB FUNCTION's arithmetic matches
// nextBucket() against a real Postgres. This file never touches a database: it proves the
// TypeScript side calls the RPC with the right arguments and degrades safely when it cannot.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ client: null as unknown, calls: [] as unknown[] }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => db.client,
}));

const { createSupabaseRateLimitStore } = await import("@/lib/collect/net/rate-limit");

function fakeClient(rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return rpcImpl(fn, args);
    },
  };
}

beforeEach(() => {
  db.client = null;
  db.calls = [];
});

describe("createSupabaseRateLimitStore", () => {
  it("calls collection_rate_limit_take with lowercased host and the request's own fields", async () => {
    db.client = fakeClient(async () => ({ data: 0, error: null }));
    const store = createSupabaseRateLimitStore();

    await store.take({ host: "EXAMPLE.com", ratePerSecond: 2, burst: 3, minIntervalMs: 500, now: 1000 });

    expect(db.calls).toEqual([
      {
        fn: "collection_rate_limit_take",
        args: { p_host: "example.com", p_rate_per_second: 2, p_burst: 3, p_min_interval_ms: 500, p_now: 1000 },
      },
    ]);
  });

  it("passes p_min_interval_ms as null, not undefined, when the caller omits it", async () => {
    db.client = fakeClient(async () => ({ data: 0, error: null }));
    const store = createSupabaseRateLimitStore();

    await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now: 1000 });

    expect((db.calls[0] as { args: Record<string, unknown> }).args.p_min_interval_ms).toBeNull();
  });

  it("returns the RPC's waitMs verbatim", async () => {
    db.client = fakeClient(async () => ({ data: 4321, error: null }));
    const store = createSupabaseRateLimitStore();
    const { waitMs } = await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now: 1000 });
    expect(waitMs).toBe(4321);
  });

  it("falls back to an in-memory bucket (not unconditional grant) when there is no Supabase client, and logs it loudly", async () => {
    db.client = null;
    const log = vi.fn();
    const store = createSupabaseRateLimitStore(log);
    const now = 1000;
    const first = await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now });
    const second = await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now }); // same instant, burst=1
    expect(first.waitMs).toBe(0);
    expect(second.waitMs).toBeGreaterThan(0); // proves the fallback still enforces the limit
    // Critic finding (2026-09-12): a permanently misconfigured Supabase env used to fall back to
    // memory FOREVER with zero signal — production quietly reverts to the exact per-run-bucket bug
    // this whole store exists to close, and nothing short of the target site blocking IPs again
    // would reveal it. `log` must fire on every such fallback so it reaches existing alerting.
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatch(/rate_limit_rpc_unavailable_falling_back_to_memory/);
  });

  it("falls back to the in-memory bucket when the RPC errors, instead of granting unconditionally, and logs it loudly", async () => {
    db.client = fakeClient(async () => ({ data: null, error: { message: "boom" } }));
    const log = vi.fn();
    const store = createSupabaseRateLimitStore(log);
    const now = 1000;
    const first = await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now });
    const second = await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now });
    expect(first.waitMs).toBe(0);
    expect(second.waitMs).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatch(/rate_limit_rpc_failed_falling_back_to_memory/);
    expect(log.mock.calls[0][0]).toContain("boom");
  });

  it("never logs when the RPC succeeds — the signal must stay reserved for actual degradation", async () => {
    db.client = fakeClient(async () => ({ data: 0, error: null }));
    const log = vi.fn();
    const store = createSupabaseRateLimitStore(log);
    await store.take({ host: "a.com", ratePerSecond: 1, burst: 1, now: 1000 });
    expect(log).not.toHaveBeenCalled();
  });

  it("the same store instance's fallback is shared across calls (module-scoped, not per-call)", async () => {
    db.client = null;
    const store = createSupabaseRateLimitStore();
    await store.take({ host: "shared.com", ratePerSecond: 1, burst: 1, now: 1000 });
    const second = await store.take({ host: "shared.com", ratePerSecond: 1, burst: 1, now: 1000 });
    expect(second.waitMs).toBeGreaterThan(0); // would be 0 if a fresh fallback were built per call
  });
});
