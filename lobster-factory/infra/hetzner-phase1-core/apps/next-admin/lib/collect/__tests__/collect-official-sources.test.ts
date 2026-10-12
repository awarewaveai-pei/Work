// The 2026-10-11 run (「台灣的合夥契約，一方可以單方面修改條件嗎？」): 民法第 670 條, 有限合夥法 and 法務部's 函釋 were set
// aside for reasons the collector made up, and a law firm's post was skipped unread. Fixtures are the real page shapes (fixtures/, MOJ pages saved
// 2026-10-11; the Elementor one is synthetic in the same shape). No network.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CollectCtx, RawDoc, SinkBlock } from "@/lib/collect/types";
import { crawl, type CrawlProgress } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { httpHtmlCollector, extractText } from "@/lib/collect/collectors/http-html";
import { classifySource } from "@/lib/collect/source-class";
import { createCollectFetch, connectFailed, pinnedCandidates } from "@/lib/collect/net/fetcher";
import { asideWhy } from "@/lib/collect/sinks/cognitive";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const LAW_670 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=670";
const RULING = "https://mojlaw.moj.gov.tw/LawContentExShow.aspx?id=FE074619&type=E";

function web(pages: Record<string, string>): CollectCtx["fetch"] {
  return async (url: string) => {
    const html = pages[url];
    if (html === undefined) throw new Error(`unexpected fetch ${url}`);
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
}

function capture(): { sink: SinkBlock; docs: RawDoc[] } {
  const docs: RawDoc[] = [];
  return { docs, sink: { id: "sink/test", title: "t", async run(batch) { docs.push(...batch); return { written: batch.length, skipped: 0 }; } } };
}

/** A research crawl (keepAside) of pages a search named, each with the title the search gave it. */
async function research(pages: Record<string, string>, titles: Record<string, string> = {}, onProgress?: (p: CrawlProgress) => void) {
  const { sink, docs } = capture();
  const result = await crawl(
    Object.keys(pages).map((uri) => ({ uri, meta: { maxDepth: 0, searchTitle: titles[uri] } })),
    { sink, budget: createBudget(), tenantRef: "t", runId: "r", fetch: web(pages), blocks: [httpHtmlCollector], keepAside: true, onProgress },
  );
  return { docs, report: result.report };
}

describe("an official primary source is read, not set aside for a reason the collector made", () => {
  it("reads a statute page whose whole body is one ASP.NET <form> (law.moj.gov.tw)", async () => {
    const { docs, report } = await research({ [LAW_670]: fixture("moj-law-single-article-webforms.html") });
    expect(report.aside).toEqual([]);
    expect(docs).toHaveLength(1);
    expect(docs[0].meta.aside).toBeUndefined();
    expect(docs[0].text).toContain("非經合夥人全體三分之二以上之同意，不得為之");
  });

  it("reads 法務部's administrative ruling page, the same WebForms shape (mojlaw.moj.gov.tw)", async () => {
    const { docs, report } = await research({ [RULING]: fixture("moj-admin-ruling-webforms.html") });
    expect(report.aside).toEqual([]);
    expect(docs[0].text).toContain("發文字號");
  });

  it("says a firewall refused it, under the search's title, instead of 「抓到的字太少」, and keeps no text", async () => {
    const { docs, report } = await research(
      { [RULING]: fixture("moj-firewall-refusal.html") },
      { [RULING]: "法務部-相關行政函釋" },
    );
    expect(docs).toEqual([]);
    expect(report.aside).toEqual([{ url: RULING, title: "法務部-相關行政函釋", reason: "blocked_page" }]);
    expect(asideWhy("blocked_page")).toContain("擋下了系統");
  });

  it("reads a post whose only <article> elements are a related-posts grid", () => {
    const text = extractText(fixture("wp-elementor-post-with-related-grid.html"));
    expect(text).toContain("仍須合夥人全體三分之二以上同意");
  });

  it("does not skip a WordPress numeric permalink as a listing; real listings still are", () => {
    expect(classifySource("https://www.chenyinlaw.com.tw/archives/443")).toBe("unknown");
    expect(classifySource("https://example.tw/archives/")).toBe("aggregator");
    expect(classifySource("https://example.tw/category/contracts/")).toBe("aggregator");
  });
});

describe("an address family with no route is not 「這個網站一直沒有回應」", () => {
  const resolver = async () => ["2001:db8::3", "93.184.216.34"];
  const unreachable = Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });

  it("tries the other family's validated address when the first cannot be connected to", async () => {
    const transport = vi.fn().mockRejectedValueOnce(unreachable).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const fetchIt = createCollectFetch({ budget: createBudget(), robots: null, resolver, transport: transport as unknown as typeof fetch });
    expect((await fetchIt("https://law.example.gov.tw/a")).status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not retry on another address after a connection was made (a timeout mid-request)", async () => {
    const timedOut = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const transport = vi.fn().mockRejectedValue(timedOut);
    const fetchIt = createCollectFetch({ budget: createBudget(), robots: null, resolver, transport: transport as unknown as typeof fetch });
    await expect(fetchIt("https://law.example.gov.tw/a")).rejects.toMatchObject({ kind: "network" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(connectFailed(unreachable)).toBe(true);
    expect(pinnedCandidates("2001:db8::3", ["2001:db8::3", "2001:db8::4", "93.184.216.34"])).toEqual(["2001:db8::3", "93.184.216.34"]);
  });
});

describe("a research crawl reports its counts as it goes (B5)", () => {
  it("ends with every page found, checked, ingested or set aside", async () => {
    const seen: CrawlProgress[] = [];
    await research(
      { [LAW_670]: fixture("moj-law-single-article-webforms.html"), [RULING]: fixture("moj-firewall-refusal.html") },
      {},
      (p) => seen.push(p),
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)).toEqual({ pagesFound: 2, pagesChecked: 2, ingested: 1, setAside: 1 });
  });
});
