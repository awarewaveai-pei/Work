// Collect lookups v1 against the real outside world, through collect's own fetcher. collect-lookups.test.ts proves the
// contract against fakes; only live calls prove the registry, the archive, Cofacts and the feed still answer.
//
// OFF by default. Prints states, counts and hosts only.
//   COLLECT_LOOKUPS_LIVE=1       one RDAP record + one archive capture (describe), one Cofacts text (factcheck)
//   COLLECT_LOOKUPS_LIVE_FEED=1  one real streamed ClaimReview download into a counting store, with peak memory;
//                                COLLECT_LOOKUPS_LIVE_SAMPLE=<file> also writes 300 normalised claims there

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { answerLookup, lookupFetch } from "@/lib/collect/lookups/answer";
import { RdapCache } from "@/lib/collect/lookups/describe";
import { createBudget } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { refreshClaimReview, type ClaimReviewRow, type ClaimReviewStore } from "@/lib/collect/lookups/claimreview";

const LIVE = process.env.COLLECT_LOOKUPS_LIVE === "1";
const FEED = process.env.COLLECT_LOOKUPS_LIVE_FEED === "1";
const log = () => {};

describe.skipIf(!LIVE)("collect lookups, live", () => {
  it(
    "describes one site (its registry and the archive) and asks Cofacts one text",
    async () => {
      const fetch = lookupFetch(log);
      const described = await answerLookup({ kind: "describe", projectId: "live", urls: ["https://www.bbc.com/news"] }, { fetch, claimreview: null, cache: new RdapCache() });
      const checked = await answerLookup({ kind: "factcheck", projectId: "live", texts: ["喝鹽水可以預防新冠肺炎"] }, { fetch, claimreview: null });
      const site = described.items[0] as unknown as Record<string, { state: string; value?: string }> & { site: string };
      const cofacts = (checked.items[0] as unknown as { dbs: Array<{ db: string; state: string; hits: Array<{ replies: unknown[] }> }> }).dbs[1];
      console.log(
        JSON.stringify({
          site: site.site,
          registered: [site.registered.state, site.registered.value ?? ""],
          country: site.country.state,
          first_archived: [site.first_archived.state, site.first_archived.value ?? ""],
          cofacts: { state: cofacts.state, articles: cofacts.hits.length, replies: cofacts.hits.reduce((n, h) => n + h.replies.length, 0) },
        }),
      );
      expect(site.registered.state).toBe("查到");
      expect(site.first_archived.state).toBe("查到");
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
      const sample: string[] = [];
      let finished: { reviews: number; publishers: number; feedModified: string } | null = null;
      const counting: ClaimReviewStore = {
        candidates: async () => ({ kind: "no_mirror" }),
        beginRefresh: async () => true,
        async insert(_g: number, batch: ClaimReviewRow[]) {
          rows += batch.length;
          batches++;
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
