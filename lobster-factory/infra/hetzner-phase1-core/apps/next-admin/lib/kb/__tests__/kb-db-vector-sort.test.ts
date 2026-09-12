// matchChunksVector (lib/kb/db.ts) — closes TASKS.md 2026-09-12 deferred item #4: the vector half
// had the same implicit-RPC-row-order dependency already found and fixed on matchChunksKeyword.
// Mirrors kb-db-keyword-sort.test.ts's structure/rationale for the keyword half.
//
// Matters more here: rag.ts's retrieve() reads vec[0] directly to enforce "the best vector match is
// never evicted" (the migration-0076 fix). An unsorted vec[] would make that invariant pick whatever
// row the RPC happened to return first, not the highest-similarity row.

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ rpc }),
}));

const { matchChunksVector } = await import("@/lib/kb/db");

const SCOPE = { scope: ["11111111-1111-4111-8111-111111111111"], spaces: null, viewer: "11111111-1111-4111-8111-111111111111", asOf: null, model: "m", includeSensitive: false };

beforeEach(() => vi.clearAllMocks());

describe("matchChunksVector sorts by similarity explicitly", () => {
  it("does not trust the RPC's row order, even when it's already wrong", async () => {
    // SQL has its own ORDER BY c.embedding <=> p_embedding, but this test feeds rows back OUT of
    // similarity order on purpose — if the client-side sort were removed, this would fail even
    // though the real SQL is fine, proving the JS side does not merely happen to agree with SQL.
    rpc.mockResolvedValue({
      data: [
        { id: "low", source_id: "s", content: "c", similarity: 0.2, title: null, canonical_url: null, author: null, published_at: null, venue: null, doi: null, epistemic_type: null, authorship_state: null, locked: null },
        { id: "high", source_id: "s", content: "c", similarity: 0.9, title: null, canonical_url: null, author: null, published_at: null, venue: null, doi: null, epistemic_type: null, authorship_state: null, locked: null },
        { id: "mid", source_id: "s", content: "c", similarity: 0.5, title: null, canonical_url: null, author: null, published_at: null, venue: null, doi: null, epistemic_type: null, authorship_state: null, locked: null },
      ],
      error: null,
    });

    const out = await matchChunksVector(SCOPE, [0.1, 0.2], 50);

    expect(out.map((r) => r.id)).toEqual(["high", "mid", "low"]);
    expect(out[0]?.id).toBe("high"); // vec[0] is what rag.ts's evict-guard invariant reads
  });

  it("returns [] and logs rather than throwing when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await matchChunksVector(SCOPE, [0.1, 0.2], 50)).toEqual([]);
  });
});
