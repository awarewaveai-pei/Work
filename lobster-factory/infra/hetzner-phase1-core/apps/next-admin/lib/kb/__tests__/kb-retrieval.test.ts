// Retrieval context handling (lib/kb/rag.ts): the per-call embedding provider, fail-closed scope,
// and the guarantee that both halves of hybrid retrieval are asked the same question.
// The predicate itself lives in SQL and is verified against a real Postgres by
// packages/db/scripts/kb-local-verify.sh.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "@/lib/kb/types";

type Scope = { scope: string[]; spaces: string[] | null; viewer: string; asOf: string | null; model: string };

const db = vi.hoisted(() => ({
  matchChunksVector: vi.fn(),
  matchChunksKeyword: vi.fn(),
}));

vi.mock("@/lib/kb/db", () => ({
  matchChunksVector: db.matchChunksVector,
  matchChunksKeyword: db.matchChunksKeyword,
  insertSource: vi.fn(),
  insertChunks: vi.fn(),
  archiveOtherVersions: vi.fn(),
  deleteKnowledgeSource: vi.fn(),
  getFamilyState: vi.fn(),
}));

const { retrieve } = await import("@/lib/kb/rag");

const ORG = "11111111-1111-4111-8111-111111111111";
const PARENT = "22222222-2222-4222-8222-222222222222";

let embedder: EmbeddingProvider;

beforeEach(() => {
  vi.clearAllMocks();
  embedder = { id: "test-embedder", dimensions: 3, embed: vi.fn(async (t: string[]) => t.map(() => [0.1, 0.2, 0.3])) };
  db.matchChunksVector.mockResolvedValue([{ id: "c1", sourceId: "s1", content: "退貨期限 7 天", similarity: 0.91 }]);
  db.matchChunksKeyword.mockResolvedValue([{ id: "c2", sourceId: "s2", content: "keyword only hit" }]);
});

const vectorScope = () => db.matchChunksVector.mock.calls[0]![0] as Scope;
const keywordScope = () => db.matchChunksKeyword.mock.calls[0]![0] as Scope;

describe("retrieve", () => {
  it("asks both halves the same question", async () => {
    await retrieve(
      { scope: [ORG, PARENT], viewer: ORG, spaces: ["space-a"], asOf: "2026-01-01T00:00:00Z", embedder },
      "退貨",
    );
    expect(keywordScope()).toEqual(vectorScope());
    expect(vectorScope()).toEqual({
      scope: [ORG, PARENT],
      spaces: ["space-a"],
      viewer: ORG,
      asOf: "2026-01-01T00:00:00Z",
      model: "test-embedder",
    });
  });

  it("leaves the default space and now() to be resolved in SQL", async () => {
    await retrieve({ scope: [ORG], viewer: ORG, embedder }, "退貨");
    expect(vectorScope()).toMatchObject({ spaces: null, asOf: null });
  });

  it("returns nothing when the caller brings no scope", async () => {
    expect(await retrieve({ scope: [], viewer: ORG, embedder }, "退貨")).toEqual([]);
    expect(db.matchChunksVector).not.toHaveBeenCalled();
    expect(embedder.embed).not.toHaveBeenCalled(); // fail closed before spending an embedding call
  });

  it("refuses a viewer that is not part of the scope chain", async () => {
    // Today both call sites pass the same id for both. When this module becomes a network service,
    // the pair arrives from the caller, and an unchecked pair is a cross-tenant read.
    expect(await retrieve({ scope: [ORG], viewer: PARENT, embedder }, "退貨")).toEqual([]);
    expect(db.matchChunksVector).not.toHaveBeenCalled();
  });

  it("treats an empty space list as unspecified rather than as an impossible filter", async () => {
    await retrieve({ scope: [ORG], viewer: ORG, spaces: [], embedder }, "退貨");
    expect(vectorScope()).toMatchObject({ spaces: null });
  });

  it("scores keyword-only hits 0 so they never raise a consumer's knowledge-gap gate", async () => {
    const out = await retrieve({ scope: [ORG], viewer: ORG, embedder }, "退貨");
    expect(out.find((c) => c.id === "c1")?.score).toBeCloseTo(0.91);
    expect(out.find((c) => c.id === "c2")?.score).toBe(0);
    expect(out.find((c) => c.id === "c2")?.sourceId).toBe("s2"); // keyword hits carry their source
  });

  it("never lets keyword-boosted documents evict the single best vector match", async () => {
    // The bug migration 0076 (which finally made the keyword half return real hits) exposed: RRF
    // ranks by RECIPROCAL RANK, not by similarity magnitude. c0 has the highest cosine similarity of
    // anything retrieve() saw, but is absent from the keyword list; c1..c4 each rank decently in
    // BOTH lists. Hand-computed RRF (k=60): c0 = 1/61 ≈ 0.01639 (vector rank 0 only). c1 = 1/62
    // (vector rank 1) + 1/61 (keyword rank 0) ≈ 0.03252. c2/c3/c4 land between those two. So plain
    // fusion ranks all four ahead of c0 and fills every one of the 4 context slots without it —
    // silently dropping the strongest evidence retrieve() found, and (via CS_THRESHOLDS.
    // minRetrievalScore) a knowledge-gap handoff that should not fire, would.
    db.matchChunksVector.mockResolvedValue([
      { id: "c0", sourceId: "s0", content: "退貨期限為七天，需附發票。", similarity: 0.9 },
      { id: "c1", sourceId: "s1", content: "退款作業流程說明。", similarity: 0.5 },
      { id: "c2", sourceId: "s2", content: "換貨作業流程說明。", similarity: 0.4 },
      { id: "c3", sourceId: "s3", content: "配送作業流程說明。", similarity: 0.3 },
      { id: "c4", sourceId: "s4", content: "客訴處理流程說明。", similarity: 0.2 },
    ]);
    db.matchChunksKeyword.mockResolvedValue([
      { id: "c1", sourceId: "s1", content: "退款作業流程說明。" },
      { id: "c2", sourceId: "s2", content: "換貨作業流程說明。" },
      { id: "c3", sourceId: "s3", content: "配送作業流程說明。" },
      { id: "c4", sourceId: "s4", content: "客訴處理流程說明。" },
    ]);

    const out = await retrieve({ scope: [ORG], viewer: ORG, embedder }, "我要退錢");

    expect(out).toHaveLength(4); // KB_RETRIEVAL.contextTopK — the guarantee costs a slot, not a cap raise
    expect(out.map((c) => c.id)).toContain("c0");
    // The whole point: the max score in what's returned is c0's real similarity, not whatever the
    // best-ranked-but-lower-similarity keyword-boosted document happened to be.
    expect(Math.max(...out.map((c) => c.score))).toBeCloseTo(0.9);
    // The keyword arm's actual benefit is not thrown away: the strongest combined-signal document
    // still made it in over c4, which the vector half alone ranked ahead of c1/c2/c3.
    expect(out.map((c) => c.id)).toContain("c1");
    expect(out.map((c) => c.id)).not.toContain("c4");
  });

  it("tags the retrieval with the model the caller actually used", async () => {
    const other: EmbeddingProvider = { id: "bge-m3", dimensions: 3, embed: async (t) => t.map(() => [1, 0, 0]) };
    await retrieve({ scope: [ORG], viewer: ORG, embedder: other }, "退貨");
    expect(vectorScope()).toMatchObject({ model: "bge-m3" });
  });
});
