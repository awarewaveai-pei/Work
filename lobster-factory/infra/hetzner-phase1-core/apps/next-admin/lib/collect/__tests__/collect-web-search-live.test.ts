// A real query against the real search provider, followed by a real fetch of what it found.
//
// collect-web-search.test.ts proves what the block does with a response; it cannot prove the
// response shape is the one we coded against, that the key works, or that the URLs it returns are
// pages our crawler can actually read. That last part is the whole claim of this source, so it is
// exercised here end to end — search → discovered targets → http-html fetch → quality gate.
//
// Stores nothing: sink/null. OFF by default (it spends a paid search call and hits real sites):
//   COLLECT_SEARCH_LIVE=1 npx vitest run lib/collect/__tests__/collect-web-search-live.test.ts
// Override the question with COLLECT_SEARCH_QUERY.

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { describe, expect, it } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createProviderCall } from "@/lib/collect/net/providers";
import { createBudget } from "@/lib/collect/budget";
import { RobotsCache } from "@/lib/collect/net/robots";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { createNullSink } from "@/lib/collect/sinks/null";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { webSearchCollector, SEARCH_SCHEME } from "@/lib/collect/collectors/web-search";
import { collectGrant } from "./grant-fixture";

const GRANT = await collectGrant();

loadEnvFile({ path: path.resolve(__dirname, "../../../.env.local"), override: false });

const LIVE = process.env.COLLECT_SEARCH_LIVE === "1";
const QUERY = process.env.COLLECT_SEARCH_QUERY ?? "台灣 消費者 網購 七日 鑑賞期 規定";

describe.skipIf(!LIVE)("web search, live", () => {
  it(
    "finds real pages and reads them",
    async () => {
      expect(process.env.SERPER_API_KEY, "SERPER_API_KEY is not set").toBeTruthy();

      const budget = createBudget({ fetches: 12, bytes: 12_000_000, ms: 180_000 });
      const log: string[] = [];

      const robotsFetch = createCollectFetch({
        budget,
        rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }),
        robots: null,
        log: (m) => log.push(m),
      });
      const robots = new RobotsCache(async (u) => {
        const res = await robotsFetch(u);
        return { status: res.status, text: res.status === 200 ? await res.text() : "" };
      }, "AwareWaveCollector");

      const result = await crawl([{ uri: `${SEARCH_SCHEME}://${encodeURIComponent(QUERY)}`, meta: { maxResults: 5 } }], {
        sink: createNullSink(),
        budget,
        tenantRef: "search-live",
        runId: `search-live-${Date.now()}`,
        // 2 = the search itself, then the pages it found. At 1 the hits would be discovered and
        // never fetched, and the test would pass while proving half of the claim.
        maxDepth: 2,
        flushEvery: 10,
        blocks: [webSearchCollector, httpHtmlCollector],
        log: (m) => log.push(m),
        fetch: createCollectFetch({
          budget,
          robots,
          rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }),
          log: (m) => log.push(m),
        }),
        callProvider: createProviderCall({ grant: GRANT, budget, log: (m) => log.push(m) }),
      });

      const searchLine = log.find((l) => l.startsWith("search "));
      console.log(`\n${searchLine}`);
      console.log(
        `抓到 ${result.report.fetched} 頁 · 品質閘擋下 ${result.report.dirty.length + result.report.quarantined.length} · ` +
          `robots 不允許 ${result.report.disallowed.length} · 結束原因 ${result.report.stoppedBy}`,
      );
      for (const d of result.report.dirty.concat(result.report.quarantined)) console.log(`  擋下 ${d.reason} — ${d.uri}`);

      // A rejected credential must say so. Without this the next assertion fails as "the block
      // never reported a search", which sends the reader looking for a bug in the block.
      const authFail = [...result.report.dirty, ...result.report.quarantined].find((d) => /http_40[12]/.test(d.reason));
      expect(authFail?.reason, `search provider rejected the credential: ${authFail?.reason} — check SERPER_API_KEY`).toBeUndefined();

      // The search returned usable URLs…
      expect(searchLine, "the block never reported a search").toBeTruthy();
      expect(searchLine).not.toContain("0 usable");
      // …and at least one of them was a page our own crawler could fetch and extract. Asserted on
      // the fetch count rather than on any particular site, which would make this a test of that
      // site's uptime.
      expect(result.report.fetched, "search found pages but none could be read").toBeGreaterThan(0);
    },
    240_000,
  );
});
