// A real dossier against the real search provider and the real internet.
//
// collect-entity-dossier.test.ts proves what the block does with a prepared response. It cannot
// prove the thing this source is FOR: that a person's name turns into pages that are actually about
// that person. That claim can only be tested against the live web, because the failure it replaced
// was made entirely of real pages passing every offline check — run manual-2026-09-20051728 stored
// 159 pages of a bookshop's browse catalogue for a search on one person's name.
//
// Stores nothing: sink/null. OFF by default (it spends several paid search calls and hits real
// sites):
//   COLLECT_DOSSIER_LIVE=1 npx vitest run lib/collect/__tests__/collect-entity-dossier-live.test.ts
// Override with COLLECT_DOSSIER_NAME / COLLECT_DOSSIER_ANCHORS / COLLECT_DOSSIER_KIND.

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { describe, expect, it } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createProviderCall } from "@/lib/collect/net/providers";
import { createBudget } from "@/lib/collect/budget";
import { RobotsCache } from "@/lib/collect/net/robots";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { entityDossierCollector, ENTITY_SCHEME } from "@/lib/collect/collectors/entity-dossier";
import type { RawDoc, SinkBlock } from "@/lib/collect/types";

loadEnvFile({ path: path.resolve(__dirname, "../../../.env.local"), override: false });

const LIVE = process.env.COLLECT_DOSSIER_LIVE === "1";
const NAME = process.env.COLLECT_DOSSIER_NAME ?? "Theo Farrell";
const ANCHORS = process.env.COLLECT_DOSSIER_ANCHORS ?? "La Trobe, war studies";
const KIND = process.env.COLLECT_DOSSIER_KIND ?? "person";

describe.skipIf(!LIVE)("entity dossier, live", () => {
  it(
    "collects pages that are actually about the person, and refuses the ones that are not",
    async () => {
      expect(process.env.SERPER_API_KEY, "SERPER_API_KEY is not set").toBeTruthy();

      const budget = createBudget({ fetches: 40, bytes: 40_000_000, ms: 300_000 });
      const log: string[] = [];
      const stored: RawDoc[] = [];
      const sink: SinkBlock = {
        id: "test/collect",
        title: "collect",
        run: async (docs) => {
          stored.push(...docs);
          return { written: docs.length, skipped: 0 };
        },
      };

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

      const result = await crawl(
        [
          {
            uri: `${ENTITY_SCHEME}://${encodeURIComponent(NAME)}`,
            meta: {
              kind: KIND,
              anchors: ANCHORS,
              angles: "identity,affiliation,works",
              languages: "en",
              maxResultsPerQuery: 5,
              // The point of the whole design: read the results, follow nothing.
              maxDepth: 0,
            },
          },
        ],
        {
          sink,
          budget,
          tenantRef: "dossier-live",
          runId: `dossier-live-${Date.now()}`,
          flushEvery: 50,
          blocks: [entityDossierCollector, httpHtmlCollector],
          log: (m) => log.push(m),
          fetch: createCollectFetch({
            budget,
            robots,
            rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }),
            log: (m) => log.push(m),
          }),
          callProvider: createProviderCall({ budget, log: (m) => log.push(m) }),
        },
      );

      console.log(`\n${log.filter((l) => l.startsWith("dossier ")).join("\n")}`);
      console.log(
        `抓到 ${result.report.fetched} · 入庫 ${stored.length} · 非本人 ${result.report.offEntity.length} · ` +
          `品質擋下 ${result.report.dirty.length} · robots ${result.report.disallowed.length} · ${result.report.stoppedBy}`,
      );
      for (const d of stored) console.log(`  收 [${d.meta.entityConfidence}] ${d.title ?? d.canonicalUrl}\n     ${d.canonicalUrl}`);
      for (const i of result.report.offEntity) console.log(`  丟 ${i.reason} — ${i.uri}`);
      for (const i of result.report.dirty) console.log(`  擋 ${i.reason} — ${i.uri}`);

      const authFail = result.report.dirty.find((d) => /http_40[12]/.test(d.reason));
      expect(authFail?.reason, `search provider rejected the credential: ${authFail?.reason}`).toBeUndefined();

      // 1. The dossier found and read real pages.
      expect(stored.length, "nothing survived — check the anchors before blaming the gate").toBeGreaterThan(0);

      // 2. THE claim of this source: every stored document names the person. Asserted on the
      //    documents themselves rather than on the gate's own verdict, so a gate that silently
      //    stopped running would fail this test instead of passing it.
      for (const doc of stored) {
        expect(`${doc.title ?? ""} ${doc.text}`.toLowerCase(), `stored a page that never names ${NAME}: ${doc.canonicalUrl}`)
          .toContain(NAME.split(" ").pop()!.toLowerCase());
        expect(doc.meta.entityName).toBe(NAME);
      }

      // 3. Nothing was crawled BEYOND the search results: every stored page is one a search named.
      //    This is what stops a bookshop's author page from dragging in its browse catalogue.
      const shopPaths = stored.filter((d) => /\/(browse|category|collections|tag)\//i.test(d.canonicalUrl));
      expect(shopPaths.map((d) => d.canonicalUrl), "followed links out of a result page").toEqual([]);
    },
    300_000,
  );
});
