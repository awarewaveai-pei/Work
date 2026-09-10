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

  it("tags the retrieval with the model the caller actually used", async () => {
    const other: EmbeddingProvider = { id: "bge-m3", dimensions: 3, embed: async (t) => t.map(() => [1, 0, 0]) };
    await retrieve({ scope: [ORG], viewer: ORG, embedder: other }, "退貨");
    expect(vectorScope()).toMatchObject({ model: "bge-m3" });
  });
});
