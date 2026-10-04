// Collect lookups v1 against the real outside world, through collect's own fetcher. collect-lookups.test.ts proves the
// contract against fakes; only live calls prove the registry, the archive, Cofacts and the feed still answer.
//
// OFF by default. Prints states, counts and hosts only.
//   COLLECT_LOOKUPS_LIVE=1       one RDAP record + one archive capture (describe), one Cofacts text (factcheck)
//   COLLECT_LOOKUPS_LIVE_FEED=1  one real streamed ClaimReview download into a counting store, with peak memory;
//                                COLLECT_LOOKUPS_LIVE_SAMPLE=<file> also writes 300 normalised claims there;
//                                COLLECT_LOOKUPS_LIVE_DUMP=<file> appends every row as JSON lines (for a real-Postgres
//                                check: packages/db/scripts/0095_collect_claimreview_mirror-local-verify.sh <file>)
//   COLLECT_LOOKUPS_COMMON_FROM=<dump file>  regenerates lib/collect/lookups/claimreview-common-pieces.json from a dump

import fs from "node:fs";
import { EOL } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answerLookup, lookupFetch } from "@/lib/collect/lookups/answer";
import { RdapCache } from "@/lib/collect/lookups/describe";
import { createBudget } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { COMMON_PIECE_SHARE, pieces, refreshClaimReview, type ClaimReviewRow, type ClaimReviewStore } from "@/lib/collect/lookups/claimreview";

const LIVE = process.env.COLLECT_LOOKUPS_LIVE === "1";
const FEED = process.env.COLLECT_LOOKUPS_LIVE_FEED === "1";
const COMMON_FROM = process.env.COLLECT_LOOKUPS_COMMON_FROM;
const log = () => {};

describe.skipIf(!LIVE)("collect lookups, live", () => {
  it(
    "describes one site (its registry and the archive) and asks Cofacts one text",
    async () => {
      const fetch = lookupFetch(log);
      const described = await answerLookup({ kind: "describe", projectId: "live", urls: ["https://www.bbc.com/news"] }, { fetch, claimreview: null, cache: new RdapCache() });
      const checked = await answerLookup({ kind: "factcheck", projectId: "live", texts: ["喝鹽水可以預防新冠肺炎"], dbs: ["cofacts"] }, { fetch, claimreview: null });
      const site = described.items[0] as unknown as Record<string, { state: string; value?: string }> & { site: string };
      const cofacts = (checked.items[0] as unknown as { dbs: Array<{ db: string; state: string; hits: Array<{ replies: unknown[] }> }> }).dbs[0];
      console.log(
        JSON.stringify({
          site: site.site,
          registered: [site.registered.state, site.registered.value ?? ""],
          country: site.country.state,
          first_archived: [site.first_archived.state, site.first_archived.value ?? ""],
          cofacts: { db: cofacts.db, state: cofacts.state, articles: cofacts.hits.length, replies: cofacts.hits.reduce((n, h) => n + h.replies.length, 0) },
        }),
      );
      expect(site.registered.state).toBe("查到");
      expect(site.first_archived.state).toBe("查到");
      expect(cofacts.db).toBe("cofacts");
      expect(["查到", "查不到"]).toContain(cofacts.state);
    },
    60_000,
  );
});

describe.skipIf(!FEED)("ClaimReview feed, live and streamed", () => {
  it(
    "downloads and parses the whole feed without holding it",
    async () => {
      let rows = 0;
      let batches = 0;
      let licensed = 0;
      const sample: string[] = [];
      let finished: { reviews: number; publishers: number; feedModified: string } | null = null;
      const counting: ClaimReviewStore = {
        candidates: async () => ({ kind: "no_mirror" }),
        currentReviews: async () => null,
        prune: async () => 0,
        beginRefresh: async () => true,
        async insert(_g: number, batch: ClaimReviewRow[]) {
          const dump = process.env.COLLECT_LOOKUPS_LIVE_DUMP;
          if (dump) fs.appendFileSync(dump, batch.map((r) => `${JSON.stringify(r)}${EOL}`).join(""), "utf8");
          rows += batch.length;
          batches++;
          licensed += batch.filter((row) => row.license).length;
          for (const row of batch) if (sample.length < 300 && row.norm) sample.push(row.norm);
        },
        async finish(_g, info) {
          finished = info;
        },
        async fail() {},
      };
      const fetch = createCollectFetch({ budget: createBudget({ fetches: 5 }), robots: null, timeoutMs: 15 * 60_000, deadlineMs: 16 * 60_000, maxBytes: 512 * 1024 * 1024 });
      const base = process.memoryUsage();
      let peakRss = base.rss;
      let peakHeap = base.heapUsed;
      const timer = setInterval(() => {
        const m = process.memoryUsage();
        peakRss = Math.max(peakRss, m.rss);
        peakHeap = Math.max(peakHeap, m.heapUsed);
      }, 100);
      const started = Date.now();
      const result = await refreshClaimReview({ fetch, store: counting, log });
      clearInterval(timer);
      if (process.env.COLLECT_LOOKUPS_LIVE_SAMPLE) fs.writeFileSync(process.env.COLLECT_LOOKUPS_LIVE_SAMPLE, JSON.stringify(sample), "utf8");
      const mb = (n: number) => Math.round(n / 1024 / 1024);
      console.log(
        JSON.stringify({
          result,
          rows,
          batches,
          licensed,
          finished,
          seconds: Math.round((Date.now() - started) / 1000),
          rssMbBefore: mb(base.rss),
          peakRssMb: mb(peakRss),
          heapMbBefore: mb(base.heapUsed),
          peakHeapMb: mb(peakHeap),
        }),
      );
      expect(result.ok).toBe(true);
      expect(rows).toBeGreaterThan(10_000);
    },
    20 * 60_000,
  );
});

describe.skipIf(!COMMON_FROM)("the common-piece list, regenerated from a feed dump", () => {
  it("writes every piece in at least COMMON_PIECE_SHARE of the claims, through the same pieces() lookups use", () => {
    const lines = fs.readFileSync(COMMON_FROM!, "utf8").split(EOL === "\n" ? "\n" : EOL).map((l) => l.trim()).filter(Boolean);
    const df = new Map<string, number>();
    for (const line of lines) for (const piece of pieces((JSON.parse(line) as { norm: string }).norm)) df.set(piece, (df.get(piece) ?? 0) + 1);
    const common = [...df].filter(([, n]) => n >= COMMON_PIECE_SHARE * lines.length).map(([piece]) => piece).sort();
    fs.writeFileSync(path.resolve(__dirname, "../lookups/claimreview-common-pieces.json"), JSON.stringify(common) + "\n", "utf8");
    console.log(JSON.stringify({ claims: lines.length, distinctPieces: df.size, common: common.length }));
    expect(common.length).toBeGreaterThan(100);
  });
});
