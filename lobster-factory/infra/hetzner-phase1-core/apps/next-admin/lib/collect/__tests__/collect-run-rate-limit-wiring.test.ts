// runCollection()'s own wiring, isolated from crawl()/sinks/report-store's real behaviour (all
// mocked below) — proves the ONE thing this change is about: a non-dry run's fetch gets a
// RateLimiter backed by the durable Supabase store, not the fresh in-memory default that made two
// concurrently scheduled runs invisible to each other (DATA_COLLECTION_PLAN.md C3 DoD). Store
// arithmetic itself is covered by collect-rate-limit-supabase-store.test.ts (TS side) and
// scripts/collect-rate-limit-verify.ts (DB function vs. nextBucket() parity).

import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  fetchOptions: [] as Array<Record<string, unknown>>,
  rateLimiterStores: [] as unknown[],
  supabaseStoreBuilds: 0,
  supabaseStoreLogArgs: [] as unknown[],
}));

vi.mock("@/lib/collect/blocks", () => ({}));
vi.mock("@/lib/collect/orchestrator", () => ({
  crawl: vi.fn(async () => ({
    report: { fetched: 0, outOfScope: 0, unhandled: [], gone: [], dirty: [], quarantined: [], disallowed: [], retried: 0, stoppedBy: "frontier_empty" },
    sink: { written: 0, skipped: 0 },
  })),
}));
vi.mock("@/lib/collect/budget", () => ({
  createBudget: vi.fn(() => ({ ok: () => true, spend: vi.fn(), snapshot: () => ({ spent: {} }) })),
}));
vi.mock("@/lib/collect/net/fetcher", () => ({
  createCollectFetch: vi.fn((opts: Record<string, unknown>) => {
    spies.fetchOptions.push(opts);
    return vi.fn();
  }),
}));
vi.mock("@/lib/collect/net/providers", () => ({
  createProviderCall: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/collect/net/rate-limit", () => ({
  RateLimiter: vi.fn(function RateLimiterMock(this: unknown, opts: { store?: unknown } = {}) {
    spies.rateLimiterStores.push(opts.store);
    return { take: vi.fn() };
  }),
  createSupabaseRateLimitStore: vi.fn((log?: unknown) => {
    spies.supabaseStoreBuilds += 1;
    spies.supabaseStoreLogArgs.push(log);
    return { __marker: "durable-rate-limit-store" };
  }),
}));
vi.mock("@/lib/collect/registry", () => ({ collectors: vi.fn(() => []) }));
vi.mock("@/lib/collect/sources-store", () => ({
  approvedSeeds: vi.fn(async () => [{ source: { id: "s1", entry: {} }, seed: { uri: "https://example.com" } }]),
  recordRunOutcome: vi.fn(async () => {}),
}));
vi.mock("@/lib/collect/report-store", () => ({
  persistRunReport: vi.fn(async () => ({ runId: "run-1", incidentRaised: false, errors: [] })),
}));
vi.mock("@/lib/collect/sinks/kb", () => ({ createKbSink: vi.fn(() => ({})) }));
vi.mock("@/lib/collect/sinks/null", () => ({ createNullSink: vi.fn(() => ({})) }));
vi.mock("@/lib/collect/url-state", () => ({
  createSupabaseUrlStateStore: vi.fn(() => ({ __marker: "durable-url-state-store" })),
}));

const { runCollection } = await import("@/lib/collect/run");

beforeEach(() => {
  spies.fetchOptions = [];
  spies.rateLimiterStores = [];
  spies.supabaseStoreBuilds = 0;
  spies.supabaseStoreLogArgs = [];
});

describe("runCollection × rate limiter wiring", () => {
  it("a real (non-dry) run builds its RateLimiter from the durable Supabase store", async () => {
    await runCollection({ organizationId: "11111111-1111-4111-8111-111111111111" });
    expect(spies.supabaseStoreBuilds).toBe(1);
    expect(spies.rateLimiterStores).toEqual([{ __marker: "durable-rate-limit-store" }]);
  });

  it("passes runCollection's own log() into the store — omitting it would make a permanent RPC failure invisible", async () => {
    const log = () => {};
    await runCollection({ organizationId: "11111111-1111-4111-8111-111111111111", log });
    expect(spies.supabaseStoreLogArgs).toEqual([log]);
  });

  it("createCollectFetch receives the rateLimiter — omitting it would silently revert to a fresh in-memory bucket per call", async () => {
    await runCollection({ organizationId: "11111111-1111-4111-8111-111111111111" });
    expect(spies.fetchOptions).toHaveLength(1);
    expect(spies.fetchOptions[0]).toHaveProperty("rateLimiter");
    expect(spies.fetchOptions[0].rateLimiter).toBeTruthy();
  });

  it("a dry run does NOT reach for the durable store — matches the existing 'a dry run leaves no trace anywhere' contract", async () => {
    await runCollection({ organizationId: "11111111-1111-4111-8111-111111111111", dryRun: true });
    expect(spies.supabaseStoreBuilds).toBe(0);
    expect(spies.rateLimiterStores).toEqual([undefined]);
  });
});
