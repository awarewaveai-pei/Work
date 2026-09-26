// sink/cognitive — RawDoc -> C1 projection, batching, and error accounting (RESEARCH_LINES_MASTER_PLAN WC-P1-10).
// The wire is mocked here; lib/cognitive-os/__tests__/research.test.ts covers the HTTP side.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawDoc, SinkCtx } from "@/lib/collect/types";

const research = vi.hoisted(() => ({ ingestSources: vi.fn() }));
vi.mock("@/lib/cognitive-os/research", () => research);

const { createCognitiveSink, toSourceProjection, INGEST_BATCH } = await import("@/lib/collect/sinks/cognitive");

const C1_KEYS = [
  "author", "canonical_url", "collector", "content_sha256", "content_type", "fetched_at", "mime", "provenance",
  "published_at", "relevance", "schema_version", "source_class", "source_uri", "text", "title",
];

function doc(overrides: Partial<RawDoc> = {}): RawDoc {
  return {
    uri: "https://example.com/a?utm=x",
    canonicalUrl: "https://example.com/a",
    contentHash: "a".repeat(64),
    mime: "text/html",
    title: "A",
    author: null,
    contentType: "web_page",
    text: "hello world",
    raw: { bytes: new Uint8Array([1, 2, 3]), mime: "text/html" },
    fetchedAt: "2026-09-26T00:00:00.000Z",
    publishedAt: null,
    collector: "collect/http-html",
    tenantRef: "research:p1",
    provenance: { epistemic_type: "EVIDENCE", authorship_state: "SOURCE_QUOTATION", locked: null },
    meta: {},
    ...overrides,
  };
}

const ctx: SinkCtx = { tenantRef: "research:p1", runId: "run-1", log: () => {} };
const sink = () => createCognitiveSink({ projectId: "p1", runId: "run-1", grantToken: "tok" });

beforeEach(() => {
  research.ingestSources.mockReset();
  research.ingestSources.mockImplementation(async (_p: string, _r: string, _t: string, sources: Array<{ canonical_url: string }>) => ({
    ok: true,
    value: { results: sources.map((s) => ({ canonical_url: s.canonical_url, outcome: "created", source_id: "s" })) },
  }));
});

describe("toSourceProjection", () => {
  it("emits exactly the fifteen C1 keys -- no raw bytes, no tenantRef, no whole meta", () => {
    const p = toSourceProjection(doc({ meta: { etag: "W/1", entityConfidence: 0.9 } }));
    expect(Object.keys(p).sort()).toEqual(C1_KEYS);
    expect(JSON.stringify(p)).not.toContain("W/1");
  });

  it("keeps only the relevance whitelist from meta", () => {
    const p = toSourceProjection(doc({ meta: { entityConfidence: 0.8, entityAnchorsHit: ["La Trobe"], searchAngle: "career", searchQuery: "x", etag: "e", entitySnippet: "s" } }));
    expect(p.relevance).toEqual({ entityConfidence: 0.8, entityAnchorsHit: ["La Trobe"], searchAngle: "career", searchQuery: "x" });
  });

  it("never shortens the text (COS re-hashes it against content_sha256)", () => {
    const long = "x".repeat(250_000);
    expect(toSourceProjection(doc({ text: long })).text).toBe(long);
  });

  it("classifies the stored URL with the dossier's own rule and falls back to the canonical URL for a missing title", () => {
    const p = toSourceProjection(doc({ canonicalUrl: "https://www.amazon.com/dp/123", title: null }));
    expect(p.source_class).toBe("retail");
    expect(p.title).toBe("https://www.amazon.com/dp/123");
  });
});

describe("createCognitiveSink", () => {
  it("sends 26 documents as two calls of 25 and 1, carrying project, run and grant token", async () => {
    const docs = Array.from({ length: 26 }, (_, i) => doc({ canonicalUrl: `https://example.com/${i}` }));
    const report = await sink().run(docs, ctx);
    expect(INGEST_BATCH).toBe(25);
    expect(research.ingestSources).toHaveBeenCalledTimes(2);
    expect(research.ingestSources.mock.calls[0].slice(0, 3)).toEqual(["p1", "run-1", "tok"]);
    expect(research.ingestSources.mock.calls[0][3]).toHaveLength(25);
    expect(research.ingestSources.mock.calls[1][3]).toHaveLength(1);
    expect(report.written).toBe(26);
  });

  it("counts unchanged as skipped and created/superseded as written", async () => {
    research.ingestSources.mockResolvedValueOnce({
      ok: true,
      value: { results: [
        { canonical_url: "https://example.com/0", outcome: "created", source_id: "a" },
        { canonical_url: "https://example.com/1", outcome: "unchanged", source_id: "b" },
        { canonical_url: "https://example.com/2", outcome: "superseded", source_id: "c" },
      ] },
    });
    const report = await sink().run([0, 1, 2].map((i) => doc({ canonicalUrl: `https://example.com/${i}` })), ctx);
    expect(report).toMatchObject({ written: 2, skipped: 1 });
  });

  it("records a refused batch as ingest_<status> and keeps sending the rest, without throwing", async () => {
    research.ingestSources.mockResolvedValueOnce({ ok: false, status: 401, error: "GRANT_INVALID" });
    const docs = Array.from({ length: 26 }, (_, i) => doc({ canonicalUrl: `https://example.com/${i}` }));
    const report = await sink().run(docs, ctx);
    expect(report.errors).toEqual(expect.arrayContaining([expect.stringMatching(/^ingest_401:/)]));
    expect(research.ingestSources).toHaveBeenCalledTimes(2);
    expect(report.written).toBe(1);
  });

  it("skips an empty or oversized document instead of sending it", async () => {
    const big = "y".repeat(5 * 1024 * 1024 + 1);
    const report = await sink().run([doc({ text: "" }), doc({ text: big, canonicalUrl: "https://example.com/big" })], ctx);
    expect(research.ingestSources).not.toHaveBeenCalled();
    expect(report.skipped).toBe(2);
    expect(report.errors).toHaveLength(2);
  });

  it("has no finalize (completion is the execute route's job, plan K2)", () => {
    expect(sink().finalize).toBeUndefined();
  });
});
