// The rendered tier against the real web, through the FULL pipeline: cheap tier first (real fetch,
// real robots.txt), degrade to a real renderer on refusal, then the same extractor, quality gate and
// relevance gate as everything else. Stores nothing.
//
// OFF by default. Needs a running renderer and its secret:
//   RENDERER_LIVE=1 RENDERER_URL=http://127.0.0.1:3991 RENDERER_SHARED_SECRET=... \
//     npx vitest run lib/collect/__tests__/collect-renderer-live.test.ts
// Against prod, tunnel first: ssh -p 58122 -L 3190:127.0.0.1:3190 ubuntu@145.239.195.47
//
// The URL list is the 10 pages a person's background dossier found and could not read
// (WORKLOG 2026-09-21 續94/續95), all robots.txt-allowed at the time.

import { describe, expect, it } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createProviderCall } from "@/lib/collect/net/providers";
import { createBudget } from "@/lib/collect/budget";
import { RobotsCache } from "@/lib/collect/net/robots";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { extractProviderCollector } from "@/lib/collect/collectors/extract-provider";
import type { RawDoc, SinkBlock } from "@/lib/collect/types";
import { collectGrant } from "./grant-fixture";

const GRANT = await collectGrant();

const LIVE = process.env.RENDERER_LIVE === "1";
const ENTITY = { name: "Theo Farrell", kind: "person", anchors: ["La Trobe", "war studies", "Afghanistan"], aliases: [], strictAnchors: false };
const URLS = [
  "https://www.latrobe.edu.au/council/membership/vice-chancellor-professor-theo-farrell",
  "https://www.latrobe.edu.au/news/articles/2023/release/professor-theo-farrell-appointed-vice-chancellor",
  "https://iru.edu.au/news/iru-welcomes-the-appointment-of-next-la-trobe-university-vice-chancellor/",
  "https://thepienews.com/theo-farrell-la-trobe-university/",
  "https://smallwarsjournal.com/2011/04/14/the-battle-for-helmand-interviews-with-professor-theo-farrell-and-mg-nick-carter/",
  "https://www.researchgate.net/scientific-contributions/Theo-Farrell-80943461",
  "https://scholars.latrobe.edu.au/tgfarrell",
  "https://scholar.google.com/citations?user=KJTzz0sAAAAJ&hl=en",
  "https://www.royalsoc.org.au/society-fellow-theo-farrell-appointed-as-next-vice-chancellor-of-la-trobe-university/",
  "https://www.jstor.org/stable/26999268",
];

describe.skipIf(!LIVE)("rendered tier, live", () => {
  it(
    "recovers pages the cheap tier could not read, through the same gates",
    async () => {
      expect(process.env.RENDERER_SHARED_SECRET, "RENDERER_SHARED_SECRET not set").toBeTruthy();
      const budget = createBudget({ fetches: 80, bytes: 80_000_000, ms: 540_000 });
      const log: string[] = [];
      const stored: RawDoc[] = [];
      const sink: SinkBlock = { id: "t", title: "t", run: async (docs) => (stored.push(...docs), { written: docs.length, skipped: 0 }) };

      const robotsFetch = createCollectFetch({ budget, rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }), robots: null, log: (m) => log.push(m) });
      const robots = new RobotsCache(async (u) => {
        const res = await robotsFetch(u);
        return { status: res.status, text: res.status === 200 ? await res.text() : "" };
      }, "AwareWaveCollector");

      const r = await crawl(
        URLS.map((uri) => ({ uri, meta: { entity: ENTITY, maxDepth: 0 } })),
        {
          sink,
          budget,
          tenantRef: "renderer-live",
          runId: `renderer-live-${Date.now()}`,
          flushEvery: 50,
          blocks: [httpHtmlCollector, extractProviderCollector],
          log: (m) => log.push(m),
          fetch: createCollectFetch({ budget, robots, rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }), log: (m) => log.push(m) }),
          callProvider: createProviderCall({ grant: GRANT, budget, log: (m) => log.push(m) }),
        },
      );

      console.log(`\nstored ${stored.length} / ${URLS.length} · dirty ${r.report.dirty.length} · offEntity ${r.report.offEntity.length} · disallowed ${r.report.disallowed.length} · gone ${r.report.gone.length}`);
      for (const d of stored) console.log(`  收 [${d.collector}] [${d.meta.entityConfidence}] ${d.text.length}字 ${d.canonicalUrl}`);
      for (const i of [...r.report.dirty, ...r.report.offEntity, ...r.report.disallowed]) console.log(`  擋 ${i.reason} — ${i.uri}`);

      // The whole point: at least one page reached the store THROUGH the rendered tier.
      expect(stored.some((d) => d.collector === "collect/extract-provider:renderer"), "nothing was recovered by the renderer").toBe(true);
    },
    600_000,
  );
});
