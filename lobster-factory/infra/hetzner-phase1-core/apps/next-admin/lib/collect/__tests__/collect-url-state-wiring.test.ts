// Closes TASKS.md 2026-09-11 "蒐集 C3 前必修": a 304 has no body, so a naive handler drops every
// link the unchanged page pointed to for that whole crawl round — its own children may have changed
// even though it did not. lib/collect/url-state.ts is the cache that survives across runs; this file
// proves the ORCHESTRATOR wiring around it: hydration before a fetch, persistence after one, and
// replay on a confirmed-unchanged response. collect-orchestrator.test.ts covers everything else the
// orchestrator guarantees and is intentionally left alone — this is a new, separate concern.

import { describe, expect, it } from "vitest";
import { crawl, type SeedInput } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { createNullSink } from "@/lib/collect/sinks/null";
import { canonicalize } from "@/lib/collect/canonical";
import { MemoryUrlStateStore } from "@/lib/collect/url-state";
import type { CollectBlock, RawDoc, Target } from "@/lib/collect/types";

const HOST = "docs.example.com";
const BODY = "客戶服務條款說明。".repeat(60);

function doc(uri: string, extraMeta: Record<string, unknown> = {}): RawDoc {
  return {
    uri,
    canonicalUrl: canonicalize(uri),
    contentHash: `hash-${uri}`,
    mime: "text/html",
    title: "條款",
    author: null,
    contentType: "web_page",
    text: BODY,
    raw: { bytes: new TextEncoder().encode(`<html><body>${BODY}</body></html>`), mime: "text/html" },
    fetchedAt: new Date().toISOString(),
    publishedAt: null,
    collector: "test/fake",
    tenantRef: "tenant-1",
    provenance: { epistemic_type: "EVIDENCE", authorship_state: "SOURCE_QUOTATION", locked: null },
    meta: extraMeta,
  };
}

type Result = { docs: RawDoc[]; discovered: Target[]; notModified?: boolean };

function fakeCollector(id: string, handler: (t: Target) => Promise<Result>): CollectBlock & { calls: Target[] } {
  const calls: Target[] = [];
  return {
    id,
    title: id,
    calls,
    match: () => 1,
    async run(t) {
      calls.push(t);
      return handler(t);
    },
  };
}

const seeds: SeedInput[] = [{ uri: `https://${HOST}/index` }];
const baseOpts = () => ({
  sink: createNullSink(),
  budget: createBudget(),
  tenantRef: "tenant-1",
  runId: "run-1",
  fetch: (async () => new Response("")) as never,
});

describe("orchestrator × url-state — the conditional-GET round trip", () => {
  it("hydrates a target's meta.etag/lastModified from a PREVIOUS run's cached state", async () => {
    const urlState = new MemoryUrlStateStore();
    await urlState.set("tenant-1", canonicalize(`https://${HOST}/index`), {
      etag: 'W/"cached-etag"',
      lastModified: null,
      discoveredLinks: [],
    });

    const seenMeta: Array<Record<string, unknown> | undefined> = [];
    const block = fakeCollector("reads-meta", async (t) => {
      seenMeta.push(t.meta);
      return { docs: [doc(t.uri)], discovered: [] };
    });

    await crawl(seeds, { ...baseOpts(), blocks: [block], urlState });
    expect(seenMeta[0]?.etag).toBe('W/"cached-etag"');
  });

  it("persists etag/lastModified/discoveredLinks after a real (non-304) fetch", async () => {
    const urlState = new MemoryUrlStateStore();
    const block = fakeCollector("writes-meta", async (t) => ({
      docs: [doc(t.uri, { etag: 'W/"fresh"', lastModified: "Tue, 01 Jan 2030 00:00:00 GMT" })],
      discovered: [{ uri: `https://${HOST}/child`, canonicalUri: canonicalize(`https://${HOST}/child`), scope: t.scope, tier: 0, depth: t.depth + 1 }],
    }));

    await crawl(seeds, { ...baseOpts(), blocks: [block], urlState });

    const saved = await urlState.get("tenant-1", canonicalize(`https://${HOST}/index`));
    expect(saved?.etag).toBe('W/"fresh"');
    expect(saved?.lastModified).toBe("Tue, 01 Jan 2030 00:00:00 GMT");
    expect(saved?.discoveredLinks).toEqual([`https://${HOST}/child`]);
  });

  it("replays cached discoveredLinks on notModified instead of losing them", async () => {
    const urlState = new MemoryUrlStateStore();
    // What the LAST successful (200) fetch of /index found, from a run that no longer exists.
    await urlState.set("tenant-1", canonicalize(`https://${HOST}/index`), {
      etag: 'W/"same"',
      lastModified: null,
      discoveredLinks: [`https://${HOST}/child-a`, `https://${HOST}/child-b`],
    });

    const block = fakeCollector("confirms-unchanged", async (t) => {
      if (t.uri.endsWith("/index")) return { docs: [], discovered: [], notModified: true };
      return { docs: [doc(t.uri)], discovered: [] };
    });

    const r = await crawl(seeds, { ...baseOpts(), blocks: [block], urlState, maxDepth: 3 });

    // Both cached children were visited even though /index itself answered 304 with no body.
    expect(block.calls.map((t) => t.uri).sort()).toEqual(
      [`https://${HOST}/index`, `https://${HOST}/child-a`, `https://${HOST}/child-b`].sort(),
    );
    // notModified must not count as a fetch: nothing about /index's content changed this run.
    expect(r.report.fetched).toBe(2); // the two children, not the unchanged parent
  });

  it("does not replay a cached link that would exceed maxDepth", async () => {
    const urlState = new MemoryUrlStateStore();
    await urlState.set("tenant-1", canonicalize(`https://${HOST}/index`), {
      etag: 'W/"same"',
      lastModified: null,
      discoveredLinks: [`https://${HOST}/too-deep`],
    });
    const block = fakeCollector("shallow", async (t) =>
      t.uri.endsWith("/index") ? { docs: [], discovered: [], notModified: true } : { docs: [doc(t.uri)], discovered: [] },
    );

    const r = await crawl(seeds, { ...baseOpts(), blocks: [block], urlState, maxDepth: 1 });
    expect(block.calls.map((t) => t.uri)).toEqual([`https://${HOST}/index`]); // child never queued
    expect(r.report.fetched).toBe(0);
  });

  it("behaves exactly like before this feature existed when no urlState is passed", async () => {
    // NO_URL_STATE is the default (see crawl()'s own opts.urlState ?? NO_URL_STATE) — this proves
    // omitting the option is not merely "compiles", it produces the pre-existing behaviour.
    const block = fakeCollector("no-cache", async (t) => ({ docs: [doc(t.uri)], discovered: [] }));
    const r = await crawl(seeds, { ...baseOpts(), blocks: [block] });
    expect(r.report.fetched).toBe(1);
    expect(r.sink.written).toBe(0); // createNullSink from baseOpts() records nothing but does not error
  });
});
