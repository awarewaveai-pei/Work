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
    report: { fetched: 0, outOfScope: 0, unhandled: [], gone: [], dirty: [], quarantined: [], disallowed: [], offEntity: [], retried: 0, stoppedBy: "frontier_empty" },
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

const { runCollection, runResearchCollection, RESEARCH_MAX_MS } = await import("@/lib/collect/run");
const { createBudget } = await import("@/lib/collect/budget");
const { crawl } = await import("@/lib/collect/orchestrator");
const { persistRunReport } = await import("@/lib/collect/report-store");
const { recordRunOutcome } = await import("@/lib/collect/sources-store");

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

// runResearchCollection (RESEARCH_LINES_MASTER_PLAN WC-P1-12): same assembly, research-specific switches.
describe("runResearchCollection wiring", () => {
  const research = (budget?: { ms?: number; fetches?: number }) =>
    runResearchCollection({ projectId: "p1", runId: "run_1", seeds: [{ uri: "https://example.com" }], sink: { id: "sink/test", title: "t", run: vi.fn() }, budget });

  beforeEach(() => {
    vi.mocked(createBudget).mockClear();
    vi.mocked(crawl).mockClear();
    vi.mocked(persistRunReport).mockClear();
    vi.mocked(recordRunOutcome).mockClear();
  });

  it("caps the crawl time so the execute route can still send the completion (Codex review F2)", async () => {
    await research({ ms: 60 * 60_000, fetches: 50 });
    const limits = vi.mocked(createBudget).mock.calls[0][0] as { ms: number; fetches: number };
    expect(limits.ms).toBe(RESEARCH_MAX_MS);
    expect(limits.fetches).toBe(50);
    await research();
    expect((vi.mocked(createBudget).mock.calls[1][0] as { ms: number }).ms).toBe(RESEARCH_MAX_MS);
    expect(RESEARCH_MAX_MS).toBeLessThan(300_000); // the execute route's maxDuration
  });

  it("keeps the durable rate limiter, drops url state, and writes none of this app's run bookkeeping", async () => {
    await research();
    expect(spies.rateLimiterStores).toEqual([{ __marker: "durable-rate-limit-store" }]);
    const opts = vi.mocked(crawl).mock.calls[0][1] as { urlState?: unknown; tenantRef: string; runId: string };
    expect(opts.urlState).toBeUndefined();
    expect(opts.tenantRef).toBe("research:p1");
    expect(opts.runId).toBe("run_1");
    expect(persistRunReport).not.toHaveBeenCalled();
    expect(recordRunOutcome).not.toHaveBeenCalled();
  });

  it("keeps every refused page (keepAside) and reads a pasted URL as that one page (wire v2)", async () => {
    const claim = { uri: "entity://claim/c1", meta: { kind: "claim", entityName: "x" } };
    await runResearchCollection({
      projectId: "p1", runId: "run_1", sink: { id: "sink/test", title: "t", run: vi.fn() },
      seeds: [{ uri: "https://a.example/post", meta: { pasted: true } }, claim],
    });
    const [seeds, opts] = vi.mocked(crawl).mock.calls[0] as unknown as [Array<{ meta?: Record<string, unknown> }>, { keepAside?: boolean }];
    expect(opts.keepAside).toBe(true);
    expect(seeds[0].meta).toEqual({ pasted: true, maxDepth: 0 });
    expect(seeds[1]).toEqual(claim);
    vi.mocked(crawl).mockClear();
    await runCollection({ organizationId: "11111111-1111-4111-8111-111111111111" });
    expect((vi.mocked(crawl).mock.calls[0][1] as { keepAside?: boolean }).keepAside).toBe(false);
  });
});
