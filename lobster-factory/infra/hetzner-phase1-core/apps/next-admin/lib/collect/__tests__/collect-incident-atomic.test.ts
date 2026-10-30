// raiseCollectionIncident goes through the standard incident path (transition, atomic upsert, notify) with the
// tenant's slug, and keeps dev and prod apart.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ingestMock = vi.fn(async (..._a: unknown[]) => ({ id: "inc-1", error: null }));
const orgChain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { slug: "acme" }, error: null })) };
orgChain.select.mockReturnValue(orgChain);
orgChain.eq.mockReturnValue(orgChain);
const sb = { from: vi.fn(() => orgChain) };

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));
vi.mock("@/lib/ops-inbox/ingest", () => ({ ingestIncident: (...a: unknown[]) => ingestMock(...a) }));

const { raiseCollectionIncident } = await import("@/lib/collect/report-store");

const args = {
  organizationId: "org-1",
  runKey: "r1",
  runId: "run-1",
  severity: "high" as const,
  report: { fetched: 1, dirty: [{ uri: "https://a/x", reason: "r" }], quarantined: [], disallowed: [], offEntity: [], gone: [], retried: 0, stoppedBy: "done" },
  sink: { written: 0, skipped: 0 },
} as unknown as Parameters<typeof raiseCollectionIncident>[0];

type Draft = { fingerprint: string; external_id: string; environment: string; client_slug: string | null };

describe("raiseCollectionIncident", () => {
  beforeEach(() => ingestMock.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it("uses the standard ingest path with the tenant's slug (correlation scope, org attribution, notify)", async () => {
    const r = await raiseCollectionIncident(args);
    expect(r.ok).toBe(true);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(ingestMock.mock.calls[0][1]).toMatchObject({ source: "collection", signal_type: "business", client_slug: "acme" });
  });

  it("uses different fingerprint and external_id for development and production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await raiseCollectionIncident(args);
    vi.stubEnv("NODE_ENV", "production");
    await raiseCollectionIncident(args);
    const dev = ingestMock.mock.calls[0][1] as Draft;
    const prod = ingestMock.mock.calls[1][1] as Draft;
    expect(dev.environment).toBe("development");
    expect(prod.environment).toBe("production");
    expect(dev.fingerprint).not.toBe(prod.fingerprint);
    expect(dev.external_id).not.toBe(prod.external_id);
  });
});
