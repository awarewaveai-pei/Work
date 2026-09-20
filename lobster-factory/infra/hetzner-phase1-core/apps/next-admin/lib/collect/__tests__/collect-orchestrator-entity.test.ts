// The four orchestrator invariants added for entity research (2026-09-20), each pinned to the
// concrete way its absence failed in run manual-2026-09-20051728 — a search for one person's name
// that fetched 190 pages, stored 161, and filed 2.
//
// Kept apart from collect-orchestrator.test.ts, which pins the eight behaviours the plan requires
// of C0: those are the contract, these are scar tissue, and mixing them makes it impossible to see
// later which of the two a change broke.

import { describe, expect, it } from "vitest";
import { crawl, type SeedInput } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { createNullSink } from "@/lib/collect/sinks/null";
import { canonicalize } from "@/lib/collect/canonical";
import type { CollectBlock, RawDoc, Target } from "@/lib/collect/types";

const HOST = "example.com";
const ABOUT_HER = "Theo Farrell is Vice-Chancellor of La Trobe University. ".repeat(20);
const ABOUT_BOOKS = "Browse romance, fantasy, crime and thrillers. New releases every week. ".repeat(20);

function doc(uri: string, text: string, title: string | null = null): RawDoc {
  return {
    uri,
    canonicalUrl: canonicalize(uri),
    contentHash: `hash-${uri}`,
    mime: "text/html",
    title,
    author: null,
    contentType: "web_page",
    text,
    raw: { bytes: new TextEncoder().encode(`<html><body>${text}</body></html>`), mime: "text/html" },
    fetchedAt: new Date().toISOString(),
    publishedAt: null,
    collector: "test/fake",
    tenantRef: "t1",
    provenance: { epistemic_type: "EVIDENCE", authorship_state: "SOURCE_QUOTATION", locked: null },
    meta: {},
  };
}

function link(uri: string, depth: number, meta?: Record<string, unknown>): Target {
  return { uri, canonicalUri: canonicalize(uri), scope: { hosts: [HOST] }, tier: 0, depth, meta };
}

function collector(
  handler: (t: Target) => Promise<{ docs: RawDoc[]; discovered: Target[] }>,
): CollectBlock & { seen: Target[] } {
  const seen: Target[] = [];
  return {
    id: "test/fake",
    title: "fake",
    seen,
    match: () => 1,
    async run(t) {
      seen.push(t);
      return handler(t);
    },
  };
}

const base = (blocks: CollectBlock[]) => ({
  sink: createNullSink(),
  budget: createBudget(),
  tenantRef: "t1",
  runId: `run-${Math.random()}`,
  blocks,
  fetch: (async () => new Response("")) as never,
});

const ENTITY = { name: "Theo Farrell", kind: "person" as const, anchors: ["La Trobe"], aliases: [], strictAnchors: true };

describe("orchestrator — entity invariants", () => {
  it("honours the SOURCE's own maxDepth instead of one global number", async () => {
    // The knob http-html has advertised since it was written, read by nothing until now.
    const block = collector(async (t) => ({
      docs: [doc(t.uri, ABOUT_HER)],
      discovered: [link(`${t.uri}/deeper`, t.depth + 1)],
    }));
    const seeds: SeedInput[] = [{ uri: `https://${HOST}/root`, meta: { maxDepth: 1 } }];

    const r = await crawl(seeds, { ...base([block]), maxDepth: 5 });

    expect(block.seen.map((t) => t.uri)).toEqual([`https://${HOST}/root`]);
    expect(r.report.fetched).toBe(1);
  });

  it("treats depth-0 discoveries as roots, so maxDepth 0 still reads the search results", async () => {
    // A `search://…` target is not a page; its results are roots, not hops. Without the exemption,
    // "read exactly these, follow nothing" would refuse the results as well and collect nothing.
    const block = collector(async (t) =>
      t.uri.startsWith("search://")
        ? { docs: [], discovered: [link(`https://${HOST}/hit`, 0)] }
        : { docs: [doc(t.uri, ABOUT_HER)], discovered: [link(`https://${HOST}/hit/sub`, t.depth + 1)] },
    );

    const r = await crawl([{ uri: "search://q", meta: { maxDepth: 0 } }], base([block]));

    expect(block.seen.map((t) => t.uri)).toEqual(["search://q", `https://${HOST}/hit`]);
    // 2, not 1: `report.fetched` counts every block run that returned a result, and the search
    // itself is one of them. The number that matters here is that /hit/sub never appears above.
    expect(r.report.fetched).toBe(2);
  });

  it("does not expand the links of a page whose every document was refused", async () => {
    // One rejected think-tank profile page put its cookie policy, ethics statement and DEI strategy
    // into the crawl. A page that is chrome links to chrome.
    const block = collector(async (t) => ({
      docs: [doc(t.uri, "too short")],
      discovered: [link(`${t.uri}/cookie-policy`, t.depth + 1)],
    }));

    const r = await crawl([{ uri: `https://${HOST}/profile` }], base([block]));

    expect(block.seen.map((t) => t.uri)).toEqual([`https://${HOST}/profile`]);
    expect(r.report.dirty).toHaveLength(1);
  });

  it("still expands a block that produced no documents at all — discovery is its whole job", async () => {
    const block = collector(async (t) =>
      t.uri.endsWith("/index")
        ? { docs: [], discovered: [link(`https://${HOST}/page`, 1)] }
        : { docs: [doc(t.uri, ABOUT_HER)], discovered: [] },
    );

    await crawl([{ uri: `https://${HOST}/index` }], base([block]));

    expect(block.seen.map((t) => t.uri)).toContain(`https://${HOST}/page`);
  });

  it("refuses a clean page that is about somebody else, in its own bucket", async () => {
    const block = collector(async (t) => ({ docs: [doc(t.uri, ABOUT_BOOKS, "Romance | Penguin")], discovered: [] }));

    const r = await crawl([{ uri: `https://${HOST}/browse/romance`, meta: { entity: ENTITY } }], base([block]));

    expect(r.report.offEntity).toEqual([{ uri: `https://${HOST}/browse/romance`, reason: "entity_absent" }]);
    // Not `dirty`: nothing failed. Mixing them would raise an incident on correct behaviour.
    expect(r.report.dirty).toHaveLength(0);
  });

  it("stores the page that IS about her, with the evidence of why", async () => {
    const stored: RawDoc[] = [];
    const sink = { id: "s", title: "s", run: async (docs: RawDoc[]) => { stored.push(...docs); return { written: docs.length, skipped: 0 }; } };
    const block = collector(async (t) => ({ docs: [doc(t.uri, ABOUT_HER)], discovered: [] }));

    await crawl([{ uri: `https://${HOST}/vc`, meta: { entity: ENTITY } }], { ...base([block]), sink });

    expect(stored).toHaveLength(1);
    expect(stored[0].meta).toMatchObject({
      entityName: "Theo Farrell",
      entityConfidence: "anchored",
      entityAnchorsHit: ["La Trobe"],
    });
    expect(stored[0].meta.entitySnippet).toContain("theo farrell");
  });

  it("carries the entity and the search query to pages found one hop later", async () => {
    // 159 of 161 documents landed unfiled because `searchQuery` stopped at the first hop, and the
    // relevance gate would have stopped at the same place.
    const block = collector(async (t) =>
      t.depth === 0
        ? { docs: [doc(t.uri, ABOUT_HER)], discovered: [link(`https://${HOST}/child`, 1)] }
        : { docs: [doc(t.uri, ABOUT_BOOKS)], discovered: [] },
    );

    const r = await crawl(
      [{ uri: `https://${HOST}/root`, meta: { entity: ENTITY, searchQuery: "Theo Farrell", maxDepth: 2 } }],
      base([block]),
    );

    const child = block.seen.find((t) => t.uri.endsWith("/child"));
    expect(child?.meta).toMatchObject({ entity: ENTITY, searchQuery: "Theo Farrell" });
    expect(r.report.offEntity.map((i) => i.uri)).toEqual([`https://${HOST}/child`]);
  });

  it("never hands a child its parent's etag — that would 304 a page nobody has read", async () => {
    const block = collector(async (t) =>
      t.depth === 0
        ? { docs: [doc(t.uri, ABOUT_HER)], discovered: [link(`https://${HOST}/child`, 1)] }
        : { docs: [doc(t.uri, ABOUT_HER)], discovered: [] },
    );

    await crawl(
      [{ uri: `https://${HOST}/root`, meta: { etag: 'W/"parent"', lastModified: "Mon, 01 Jan 2024 00:00:00 GMT", maxDepth: 2 } }],
      base([block]),
    );

    const child = block.seen.find((t) => t.uri.endsWith("/child"));
    expect(child?.meta?.etag).toBeUndefined();
    expect(child?.meta?.lastModified).toBeUndefined();
  });

  it("is completely inert for a source that makes no entity claim", async () => {
    const block = collector(async (t) => ({ docs: [doc(t.uri, ABOUT_BOOKS)], discovered: [] }));

    const r = await crawl([{ uri: `https://${HOST}/browse` }], base([block]));

    expect(r.report.offEntity).toHaveLength(0);
    expect(r.report.fetched).toBe(1);
  });
});
