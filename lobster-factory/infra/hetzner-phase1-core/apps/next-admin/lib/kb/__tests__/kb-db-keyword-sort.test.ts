// matchChunksKeyword (lib/kb/db.ts) — the client-side sort added alongside migration 0076.
//
// Every other kb-*.test.ts mocks `@/lib/kb/db` wholesale to test lib/kb/rag.ts's fusion logic; none
// of them exercise db.ts's own mapping/sorting of a raw RPC response. Added specifically because
// this function now sorts explicitly instead of trusting RPC row order (a critic review flagged the
// implicit-order dependency as the same "ranking silently degrades, no error" class 0076 exists to
// fix in SQL) — so the client-side sort itself needs its own proof, not just the SQL's ORDER BY.

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ rpc }),
}));

const { matchChunksKeyword } = await import("@/lib/kb/db");

const SCOPE = { scope: ["11111111-1111-4111-8111-111111111111"], spaces: null, viewer: "11111111-1111-4111-8111-111111111111", asOf: null, model: "m" };

beforeEach(() => vi.clearAllMocks());

describe("matchChunksKeyword sorts by score explicitly", () => {
  it("does not trust the RPC's row order, even when it's already wrong", async () => {
    // The RPC has its own ORDER BY, but this test feeds rows back OUT of score order on purpose —
    // if the client-side sort were removed, this would fail even though the real SQL is fine, which
    // is exactly the point: this proves the JS side does not merely happen to agree with SQL.
    rpc.mockResolvedValue({
      data: [
        { id: "low", source_id: "s", content: "c", score: 1, title: null, canonical_url: null, author: null, published_at: null, venue: null, doi: null, epistemic_type: null, authorship_state: null, locked: null },
        { id: "high", source_id: "s", content: "c", score: 5, title: null, canonical_url: null, author: null, published_at: null, venue: null, doi: null, epistemic_type: null, authorship_state: null, locked: null },
        { id: "mid", source_id: "s", content: "c", score: 3, title: null, canonical_url: null, author: null, published_at: null, venue: null, doi: null, epistemic_type: null, authorship_state: null, locked: null },
      ],
      error: null,
    });

    const out = await matchChunksKeyword(SCOPE, "退貨", 50);

    expect(out.map((r) => r.id)).toEqual(["high", "mid", "low"]);
    expect(out.map((r) => r.score)).toEqual([5, 3, 1]);
  });

  it("returns [] and logs rather than throwing when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await matchChunksKeyword(SCOPE, "退貨", 50)).toEqual([]);
  });

  it("skips the call entirely when the question has no usable terms", async () => {
    expect(await matchChunksKeyword(SCOPE, "!!! ???", 50)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
