// Ingest ordering and versioning (lib/kb/rag.ts).
//
// The data-access layer is mocked, not a fake database: what is under test here is the ORDER of
// operations, which is the only thing standing between a failed embedding call and a document whose
// knowledge-base content silently becomes empty (supabase-js has no transactions). Whether the SQL
// then hides the archived version from retrieval is proven separately, against a real Postgres:
// packages/db/scripts/kb-local-verify.sh.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider, KnowledgeInput } from "@/lib/kb/types";
import { contentHash } from "@/lib/kb/family";
import { KB_DEFAULT_SPACE_ID } from "@/lib/kb/config";

type LiveVersion = {
  id: string; version: number; contentHash: string | null;
  isSensitive: boolean; spaceId: string | null; canonicalUrl: string | null;
  validFrom: string | null; validTo: string | null;
};
type FamilyState = { live: LiveVersion | null; maxVersion: number };
type SourceArg = { docFamilyId: string; sourceVersion: number };
type ChunkArg = { docFamilyId: string; sourceVersion: number; sourceId: string; embedModel: string };

const db = vi.hoisted(() => ({
  insertSource: vi.fn(),
  insertChunks: vi.fn(),
  archiveOtherVersions: vi.fn(),
  deleteKnowledgeSource: vi.fn(),
  getFamilyState: vi.fn(),
}));

vi.mock("@/lib/kb/db", () => ({
  insertSource: db.insertSource,
  insertChunks: db.insertChunks,
  archiveOtherVersions: db.archiveOtherVersions,
  deleteKnowledgeSource: db.deleteKnowledgeSource,
  getFamilyState: db.getFamilyState,
  matchChunksVector: vi.fn(),
  matchChunksKeyword: vi.fn(),
}));

const { ingestKnowledge } = await import("@/lib/kb/rag");

const fakeEmbedder: EmbeddingProvider = {
  id: "test-embedder",
  dimensions: 3,
  embed: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
};

const doc: KnowledgeInput = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  kind: "sop",
  title: "退貨政策",
  body: "退貨期限 7 天。\n\n需附發票。",
};

/** Write operations in the order they actually happened. */
const calls: string[] = [];
function liveVersion(over: Partial<LiveVersion> = {}): LiveVersion {
  return {
    id: "src-old", version: 1, contentHash: "old-hash",
    isSensitive: false, spaceId: KB_DEFAULT_SPACE_ID, canonicalUrl: null, validFrom: null, validTo: null,
    ...over,
  };
}
const hadPreviousVersion: FamilyState = { live: liveVersion(), maxVersion: 1 };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  db.getFamilyState.mockResolvedValue({ live: null, maxVersion: 0 } satisfies FamilyState);
  db.insertSource.mockImplementation(async () => {
    calls.push("insertSource");
    return "src-new";
  });
  db.insertChunks.mockImplementation(async (rows: ChunkArg[]) => {
    calls.push("insertChunks");
    return rows.length;
  });
  db.archiveOtherVersions.mockImplementation(async () => {
    calls.push("archiveOtherVersions");
    return { archived: 1, failed: false };
  });
  db.deleteKnowledgeSource.mockImplementation(async () => {
    calls.push("deleteKnowledgeSource");
    return true;
  });
});

describe("ingestKnowledge", () => {
  it("stores the new version before archiving the old one", async () => {
    db.getFamilyState.mockResolvedValue(hadPreviousVersion);
    const r = await ingestKnowledge(doc, fakeEmbedder);

    expect(r.version).toBe(2);
    expect(r.unchanged).toBe(false);
    expect(calls).toEqual(["insertSource", "insertChunks", "archiveOtherVersions"]);
  });

  it("leaves the previous version active when embedding fails", async () => {
    db.getFamilyState.mockResolvedValue(hadPreviousVersion);
    const brokenEmbedder: EmbeddingProvider = {
      id: "broken",
      dimensions: 3,
      embed: async () => {
        throw new Error("openai_embeddings_500");
      },
    };

    await expect(ingestKnowledge(doc, brokenEmbedder)).rejects.toThrow("openai_embeddings_500");
    expect(db.archiveOtherVersions).not.toHaveBeenCalled(); // the old version is still retrievable
    expect(db.deleteKnowledgeSource).toHaveBeenCalled(); // the half-written new version is gone
  });

  it("leaves the previous version active when no chunk could be stored", async () => {
    db.getFamilyState.mockResolvedValue(hadPreviousVersion);
    db.insertChunks.mockResolvedValueOnce(0);

    const r = await ingestKnowledge(doc, fakeEmbedder);
    expect(r.sourceId).toBeNull();
    expect(db.archiveOtherVersions).not.toHaveBeenCalled();
    expect(db.deleteKnowledgeSource).toHaveBeenCalled();
  });

  it("does not create a version when the content is unchanged", async () => {
    db.getFamilyState.mockResolvedValue({
      live: liveVersion({ version: 3, contentHash: contentHash(doc.body) }),
      maxVersion: 3,
    } satisfies FamilyState);

    const r = await ingestKnowledge(doc, fakeEmbedder);
    expect(r).toMatchObject({ sourceId: "src-old", version: 3, unchanged: true, chunks: 0 });
    expect(db.insertSource).not.toHaveBeenCalled();
  });

  it("treats a metadata-only change as a change, not as unchanged", async () => {
    // Same text, sensitive flag newly ticked. Comparing the body hash alone would report "unchanged"
    // and silently drop a change the operator believes they just made.
    db.getFamilyState.mockResolvedValue({
      live: liveVersion({ version: 3, contentHash: contentHash(doc.body), isSensitive: false }),
      maxVersion: 3,
    } satisfies FamilyState);

    const r = await ingestKnowledge({ ...doc, isSensitive: true }, fakeEmbedder);
    expect(r.unchanged).toBe(false);
    expect(r.version).toBe(4);
  });

  it("stores nothing when the provider returns fewer vectors than chunks", async () => {
    db.getFamilyState.mockResolvedValue(hadPreviousVersion);
    const shortEmbedder: EmbeddingProvider = {
      id: "short",
      dimensions: 3,
      embed: async (texts) => texts.slice(1).map(() => [0.1, 0.2, 0.3]), // one vector missing
    };

    await expect(ingestKnowledge(doc, shortEmbedder)).rejects.toThrow(/embedding_count_mismatch/);
    expect(db.insertChunks).not.toHaveBeenCalled(); // never store a document minus a paragraph
    expect(db.archiveOtherVersions).not.toHaveBeenCalled();
    expect(db.deleteKnowledgeSource).toHaveBeenCalled();
  });

  it("reports a failed supersede instead of leaving two silent active versions", async () => {
    db.getFamilyState.mockResolvedValue(hadPreviousVersion);
    db.archiveOtherVersions.mockResolvedValue({ archived: 0, failed: true });

    const r = await ingestKnowledge(doc, fakeEmbedder);
    expect(r.supersedeFailed).toBe(true);
    expect(r.sourceId).toBe("src-new"); // the new version IS stored; the old one just is not archived
  });

  it("rolls back when only some chunks were stored", async () => {
    // A document long enough to split into several chunks, so "1 row stored" is genuinely partial.
    const longDoc = { ...doc, body: Array.from({ length: 6 }, (_, i) => `段落 ${i} `.repeat(60)).join("\n\n") };
    db.getFamilyState.mockResolvedValue(hadPreviousVersion);
    db.insertChunks.mockResolvedValueOnce(1); // fewer rows than the document has chunks

    const r = await ingestKnowledge(longDoc, fakeEmbedder);
    expect(r.sourceId).toBeNull();
    expect(db.archiveOtherVersions).not.toHaveBeenCalled();
    expect(db.deleteKnowledgeSource).toHaveBeenCalled();
  });

  it("numbers the next version above every version ever used, archived ones included", async () => {
    db.getFamilyState.mockResolvedValue({ live: null, maxVersion: 4 } satisfies FamilyState);
    const r = await ingestKnowledge(doc, fakeEmbedder);
    expect(r.version).toBe(5);
  });

  it("writes chunks with the family and version of the source row it just created", async () => {
    await ingestKnowledge(doc, fakeEmbedder);
    const rows = db.insertChunks.mock.calls[0]![0] as ChunkArg[];
    const sourceArg = db.insertSource.mock.calls[0]![0] as SourceArg;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.docFamilyId).toBe(sourceArg.docFamilyId);
      expect(row.sourceVersion).toBe(sourceArg.sourceVersion);
      expect(row.sourceId).toBe("src-new");
      expect(row.embedModel).toBe("test-embedder");
    }
  });

  it("never touches the store for an empty document", async () => {
    const r = await ingestKnowledge({ ...doc, body: "   " }, fakeEmbedder);
    expect(r.sourceId).toBeNull();
    expect(db.insertSource).not.toHaveBeenCalled();
    expect(db.deleteKnowledgeSource).not.toHaveBeenCalled();
  });
});
