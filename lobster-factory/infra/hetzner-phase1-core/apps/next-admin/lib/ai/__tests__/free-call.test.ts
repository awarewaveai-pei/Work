// logFreeCall (a free vendor call, recorded at cost 0), the spend report's reading of it, and the free-quota max rule.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], client: true }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => (m.client ? { from: () => ({ insert: async (r: Record<string, unknown>) => { m.rows.push(r); return { error: null }; } }) } : null),
}));

import { logFreeCall } from "../log-ai-call";
import { summarizeSpend, type SpendRow } from "../spend-report";
import { verifierUsed } from "../free-quota";

beforeEach(() => { m.rows = []; m.client = true; });

const row = (over: Partial<SpendRow>): SpendRow => ({ id: "x", created_at: "2026-11-06T00:00:00Z", route: "r", model: "m", vendor: "v", cost_usd: 0,
  kind: "tool", tool: "outreach", job_id: null, organization_id: null, input_tokens: 0, output_tokens: 0, metadata: null, ...over });

describe("logFreeCall", () => {
  it("writes one kind tool row at cost 0 flagged free, with the caller's metadata and org", async () => {
    await logFreeCall({ route: "outreach/verify-email", vendor: "Reoon", model: "reoon.verify", organizationId: "org-1", tool: "outreach", metadata: { status: 200 } });
    expect(m.rows).toEqual([expect.objectContaining({ kind: "tool", cost_usd: 0, organization_id: "org-1", model: "reoon.verify", metadata: { status: 200, free: true } })]);
  });
  it("is a no-op without a client and never throws", async () => {
    m.client = false;
    await expect(logFreeCall({ route: "r", vendor: "v", model: "m", organizationId: null })).resolves.toBeUndefined();
    expect(m.rows).toEqual([]);
  });
});

describe("zero-cost accounting", () => {
  it("a free row is not a missing price; an unflagged 0 row still is", () => {
    const s = summarizeSpend([row({ metadata: { free: true } }), row({ id: "y" })]);
    expect(s.zeroCostCount).toBe(1);
    expect(s.count).toBe(2);
  });
});

describe("verifierUsed", () => {
  it("takes the larger of the call ledger and the stored verdicts", () => {
    expect(verifierUsed(3, 10)).toBe(10);
    expect(verifierUsed(12, 10)).toBe(12);
  });
  it("one read failing falls back to the other; both failing is unknown, not 0", () => {
    expect(verifierUsed(null, 4)).toBe(4);
    expect(verifierUsed(5, null)).toBe(5);
    expect(verifierUsed(null, null)).toBeNull();
  });
});
