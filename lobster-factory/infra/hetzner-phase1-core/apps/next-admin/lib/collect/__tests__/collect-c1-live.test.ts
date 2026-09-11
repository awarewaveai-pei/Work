// C1's remaining DoD, run against the REAL knowledge base: a real page goes in, retrieval finds it,
// a second identical crawl makes no new version, and changed text makes version 2.
//
// collect-live-smoke.test.ts proves the fetch/extract half against a live site but stores nothing
// (sink/null). collect-c1.test.ts proves the sink half with lib/kb mocked. Neither can fail when
// the versioning contract is broken in the database, which is the half C1 actually promises — so
// this one writes to the configured Supabase and reads back through the six-predicate RPCs.
//
// OFF by default: it costs embedding calls and it writes rows. Run it deliberately:
//   COLLECT_C1_LIVE=1 npx vitest run lib/collect/__tests__/collect-c1-live.test.ts
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (.env.local) and OPENAI_API_KEY.
// Override the org with COLLECT_C1_ORG and the page with COLLECT_C1_URL.
//
// It cleans up after itself in afterAll, including on failure, so a red run does not leave a
// stray document in a customer's knowledge base.

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createBudget } from "@/lib/collect/budget";
import { RobotsCache } from "@/lib/collect/net/robots";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { createKbSink } from "@/lib/collect/sinks/kb";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { deleteKnowledgeSource, retrieve } from "@/lib/kb";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { RawDoc } from "@/lib/collect/types";

// vitest does not read .env.local the way `next dev` does. Without this the Supabase client is
// null, ingest returns no sourceId, and the sink reports `ingest_failed` — which reads like a
// broken knowledge base rather than a missing credential. Loaded before anything imports the
// client, and never overriding a variable the shell already set.
loadEnvFile({ path: path.resolve(__dirname, "../../../.env.local"), override: false });

const LIVE = process.env.COLLECT_C1_LIVE === "1";
const ORG = process.env.COLLECT_C1_ORG ?? "";
const PAGE = process.env.COLLECT_C1_URL ?? "https://en.wikipedia.org/wiki/Retrieval-augmented_generation";

/** Tracked so cleanup removes exactly what this run created, never anything that was already there. */
const created = new Set<string>();
let familyId: string | null = null;
let firstDoc: RawDoc | null = null;

const sink = createKbSink({ organizationIdFor: () => ORG });
const ctx = () => ({ tenantRef: ORG, runId: `c1-live-${Date.now()}`, log: () => {} });

/**
 * Versions of our document family, newest first — read straight from the table.
 * Not via listKnowledgeSources: that surface deliberately hides archived rows and does not return
 * canonicalUrl, and "the superseded version is gone from the ops list" is precisely what must NOT
 * be mistaken here for "the superseded version is gone from retrieval".
 */
async function versionsOfFamily(): Promise<{ id: string; version: number; status: string }[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("no Supabase service client — check SUPABASE_SERVICE_ROLE_KEY");
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select("id,source_version,status,canonical_url")
    .eq("organization_id", ORG)
    .eq("canonical_url", firstDoc?.canonicalUrl ?? "")
    .order("source_version", { ascending: false });
  if (error) throw new Error(`versionsOfFamily: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id as string, version: r.source_version as number, status: r.status as string }));
}

beforeAll(() => {
  if (!LIVE) return;
  // Fail loudly rather than write into whatever org id happens to be the empty string.
  if (!ORG) throw new Error("set COLLECT_C1_ORG to a real organization uuid");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required — ingest embeds the body");
  if (!getSupabaseWriteClient()) throw new Error("no Supabase service client — .env.local not loaded or SUPABASE_SERVICE_ROLE_KEY unset");
});

afterAll(async () => {
  if (!LIVE) return;
  for (const id of created) await deleteKnowledgeSource(ORG, id).catch(() => undefined);
});

describe.skipIf(!LIVE)("C1 — a real page reaches the knowledge base and versions correctly", () => {
  it(
    "crawls a real URL into the knowledge base, and retrieval finds it",
    async () => {
      const budget = createBudget({ fetches: 4, bytes: 5_000_000, ms: 90_000 });
      const robotsFetch = createCollectFetch({
        budget,
        rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }),
        robots: null,
        log: () => {},
      });
      const robots = new RobotsCache(async (u) => {
        const res = await robotsFetch(u);
        return { status: res.status, text: res.status === 200 ? await res.text() : "" };
      }, "AwareWaveCollector");

      // Captured on the way past so the later steps re-use the exact document the crawler produced,
      // rather than a hand-built one that might differ in canonicalUrl and so form a second family.
      const capturing = {
        ...sink,
        async run(docs: RawDoc[], c: Parameters<typeof sink.run>[1]) {
          if (docs.length && !firstDoc) firstDoc = docs[0];
          return sink.run(docs, c);
        },
      };

      const result = await crawl([{ uri: PAGE }], {
        sink: capturing,
        budget,
        tenantRef: ORG,
        runId: ctx().runId,
        maxDepth: 1,
        flushEvery: 5,
        blocks: [httpHtmlCollector],
        log: () => {},
        fetch: createCollectFetch({
          budget,
          robots,
          rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }),
          log: () => {},
        }),
      });

      expect(result.sink.errors ?? []).toEqual([]);
      expect(result.sink.written).toBeGreaterThan(0);
      expect(firstDoc, "the crawl produced no document to version").toBeTruthy();

      const versions = await versionsOfFamily();
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      for (const v of versions) created.add(v.id);
      familyId = versions[0].id;

      // The point of the whole stage: it is retrievable, labelled as a quotation, and attributed.
      const hits = await retrieve({ scope: [ORG], viewer: ORG }, firstDoc!.title ?? "retrieval");
      const mine = hits.filter((h) => h.citation.url === firstDoc!.canonicalUrl);
      expect(mine.length, "the page went in but retrieval cannot see it").toBeGreaterThan(0);
      expect(mine[0].provenance.authorshipState).toBe("SOURCE_QUOTATION");
    },
    180_000,
  );

  it("does not create a second version when the same page comes back unchanged", async () => {
    expect(firstDoc, "depends on the crawl above").toBeTruthy();

    const report = await sink.run([firstDoc!], ctx());
    expect(report.written).toBe(0);
    expect(report.skipped).toBe(1);

    const versions = await versionsOfFamily();
    expect(versions.map((v) => v.version)).toEqual([1]);
    expect(versions[0].id).toBe(familyId); // the same row, not a rewritten one
  }, 120_000);

  it("creates version 2 when the text changes, and stops serving version 1", async () => {
    expect(firstDoc, "depends on the crawl above").toBeTruthy();

    const marker = `C1-LIVE-CHANGED-${Date.now()}`;
    // Same canonicalUrl, different text — exactly what a customer editing their FAQ looks like.
    // contentHash is recomputed by the KB from the body it is given; passing the old one here would
    // test nothing, so it is deliberately left as the sink found it and the BODY is what changes.
    const edited: RawDoc = { ...firstDoc!, text: `${marker}\n\n${firstDoc!.text}` };

    const report = await sink.run([edited], ctx());
    expect(report.errors ?? []).toEqual([]);
    expect(report.written).toBe(1);

    const versions = await versionsOfFamily();
    for (const v of versions) created.add(v.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.find((v) => v.version === 2)!.status).toBe("active");
    expect(versions.find((v) => v.version === 1)!.status).toBe("archived");

    // Archived must mean invisible, not merely flagged. Asserted through a QUERY, because that is
    // the only thing a consumer experiences; a status column that retrieval ignores is a bug that
    // reads as correct in every table listing.
    const hits = await retrieve({ scope: [ORG], viewer: ORG }, marker);
    const stale = hits.filter((h) => h.sourceId === versions.find((v) => v.version === 1)!.id);
    expect(stale, "archived version 1 is still being retrieved").toEqual([]);
  }, 180_000);
});
