// A real crawl against a real site, through the real stack, storing nothing.
//
// Everything else in this directory stubs the transport, which proves the wiring but not that the
// extractor survives actual markup, that robots.txt parses on a live file, or that a real response
// passes the quality gate. This one does — against our own site, at one page, into sink/null.
//
// OFF by default (network in a unit-test run is a flaky test waiting to happen). Run it deliberately:
//   COLLECT_LIVE_SMOKE=1 npx vitest run lib/collect/__tests__/collect-live-smoke.test.ts
// Point it elsewhere with COLLECT_LIVE_URL=<https url>.

import { describe, expect, it } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createBudget } from "@/lib/collect/budget";
import { RobotsCache } from "@/lib/collect/net/robots";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { createNullSink } from "@/lib/collect/sinks/null";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { grade } from "@/lib/collect/quality";

const LIVE = process.env.COLLECT_LIVE_SMOKE === "1";
const URL_UNDER_TEST = process.env.COLLECT_LIVE_URL ?? "https://aware-wave.com/";

describe.skipIf(!LIVE)("live smoke", () => {
  it(
    "fetches a real page, extracts text, and stores nothing",
    async () => {
      const sink = createNullSink();
      const budget = createBudget({ fetches: 3, bytes: 3_000_000, ms: 60_000 });
      const log: string[] = [];

      // robots.txt is fetched through the same gate as everything else — a crawler that ignores it
      // on its own robots lookup is not a polite crawler.
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

      const result = await crawl([{ uri: URL_UNDER_TEST }], {
        sink,
        budget,
        tenantRef: "live-smoke",
        runId: `live-${Date.now()}`,
        maxDepth: 1, // the seed page only
        flushEvery: 5,
        blocks: [httpHtmlCollector],
        log: (m) => log.push(m),
        fetch: createCollectFetch({
          budget,
          robots,
          rateLimiter: new RateLimiter({ ratePerSecond: 1, burst: 2 }),
          log: (m) => log.push(m),
        }),
      });

      // eslint-disable-next-line no-console -- the point of this test is the evidence it prints
      console.log(
        JSON.stringify(
          {
            url: URL_UNDER_TEST,
            fetched: result.report.fetched,
            handedToSink: sink.received.length,
            dirty: result.report.dirty.map((d) => ({ reason: d.reason, checks: d.checks })),
            quarantined: result.report.quarantined,
            gone: result.report.gone,
            stoppedBy: result.report.stoppedBy,
            budget: budget.snapshot().spent,
            firstDoc: sink.received[0]
              ? {
                  title: sink.received[0].title,
                  canonicalUrl: sink.received[0].canonicalUrl,
                  textChars: sink.received[0].text.length,
                  grade: grade(sink.received[0]).checks,
                  provenance: sink.received[0].provenance,
                  head: sink.received[0].text.slice(0, 160),
                }
              : null,
            log: log.slice(0, 10),
          },
          null,
          2,
        ),
      );

      // Either the page was collected, or it was refused for a reason the run can name. Silence is
      // the only unacceptable outcome.
      expect(result.report.fetched + result.report.dirty.length + result.report.gone.length).toBeGreaterThan(0);
      expect(sink.received.every((d) => d.provenance.epistemic_type === "EVIDENCE")).toBe(true);
      expect(budget.snapshot().spent.fetches).toBeGreaterThan(0);
    },
    60_000,
  );
});
