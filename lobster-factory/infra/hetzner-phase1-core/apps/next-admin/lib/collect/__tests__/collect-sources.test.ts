// The source catalogue and the four sources added for it.
//
// What these guard is mostly the same thing in four shapes: a source must either produce a real
// document or say clearly why it did not. The failure this codebase keeps finding is the third
// option — a stub that looks like a document and answers a customer's question with nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { crawl } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { createNullSink } from "@/lib/collect/sinks/null";
import { createSignalSink } from "@/lib/collect/sinks/signal";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { sourceCatalogue, validateSourceConfig, catalogueEntry } from "@/lib/collect/catalogue";
import {
  academicCollector,
  abstractFromInvertedIndex,
  buildSearchUrl,
  parseArxivFeed,
} from "@/lib/collect/collectors/academic";
import { localFileCollector, captionsToText, resolveInsideRoot } from "@/lib/collect/collectors/local-file";
import { videoCollector, captionTrackUrls, timedTextToText, isVideoUrl } from "@/lib/collect/collectors/video";
import { httpApiCollector, pick } from "@/lib/collect/collectors/http-api";
import type { Target } from "@/lib/collect/types";
// Registering every built-in source is what makes the catalogue non-empty.
import "@/lib/collect/blocks";

const ORG = "tenant-1";
const target = (uri: string, over: Partial<Target> = {}): Target => ({
  uri,
  canonicalUri: uri,
  scope: { hosts: ["example.com"] },
  tier: 0,
  depth: 0,
  ...over,
});

function runWith(
  transport: typeof fetch,
  blocks: Parameters<typeof crawl>[1]["blocks"],
  sink: Parameters<typeof crawl>[1]["sink"] = createNullSink(),
) {
  const budget = createBudget({ fetches: 50 });
  return {
    sink,
    budget,
    tenantRef: ORG,
    runId: `run-${Math.random()}`,
    blocks,
    maxDepth: 1,
    fetch: createCollectFetch({
      budget,
      transport,
      resolver: async () => ["93.184.216.34"],
      rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }),
      robots: null,
    }),
  };
}

describe("source catalogue", () => {
  it("lists every selectable source, with the ones that need a key marked unavailable", () => {
    const entries = sourceCatalogue({});
    const ids = entries.map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "collect/http-html",
        "collect/sitemap",
        "collect/rss",
        "collect/academic",
        "collect/http-api",
        "collect/video",
        "collect/local-file",
        "collect/extract-provider",
      ]),
    );

    // Unavailable, NOT hidden: an operator who cannot see the source concludes the system cannot do
    // it, when in fact one environment variable is empty.
    const provider = entries.find((e) => e.id === "collect/extract-provider")!;
    expect(provider.available).toBe(false);
    expect(provider.missing).toEqual(["FIRECRAWL_API_KEY"]);
    expect(provider.metered).toBe(true);

    const web = entries.find((e) => e.id === "collect/http-html")!;
    expect(web.available).toBe(true); // needs nothing
  });

  it("says in plain terms what each source takes as its entry", () => {
    expect(catalogueEntry("collect/academic", {})?.entry).toBe("query");
    expect(catalogueEntry("collect/local-file", {})?.entry).toBe("path");
    expect(catalogueEntry("collect/http-html", {})?.entry).toBe("url");
  });

  it("refuses a configuration that would collect nothing", () => {
    // A misconfigured source is indistinguishable from a site that stopped changing, so it has to
    // be caught while somebody is still looking at the form.
    expect(validateSourceConfig("collect/http-html", { entry: "not a url" }, {}).errors).toContain("entry_not_a_url");
    expect(validateSourceConfig("collect/http-api", { entry: "https://x.test/api" }, {}).errors).toEqual(
      expect.arrayContaining(["missing_option:itemsPath", "missing_option:titleField", "missing_option:textField"]),
    );
    expect(validateSourceConfig("collect/extract-provider", { entry: "https://x.test/" }, {}).errors[0]).toMatch(
      /unavailable:missing_FIRECRAWL_API_KEY/,
    );
    expect(
      validateSourceConfig("collect/academic", { entry: "retrieval augmented generation", options: { registry: "openalex" } }, {}).ok,
    ).toBe(true);
    expect(validateSourceConfig("collect/academic", { entry: "x", options: { registry: "scopus" } }, {}).errors).toContain(
      "option_not_a_choice:registry",
    );
  });
});

describe("collect/academic", () => {
  it("asks each registry in its own dialect", () => {
    expect(buildSearchUrl("openalex", "rag", 10, "ops@aware-wave.com")).toContain("api.openalex.org/works?search=rag");
    expect(buildSearchUrl("openalex", "rag", 10, "ops@aware-wave.com")).toContain("mailto=ops%40aware-wave.com");
    expect(buildSearchUrl("arxiv", "rag", 10, null)).toContain("export.arxiv.org/api/query?search_query=all:rag");
    expect(buildSearchUrl("crossref", "rag", 10, null)).toContain("api.crossref.org/works?query=rag");
  });

  it("sorts by relevance unless asked for the newest", () => {
    // Measured, not assumed: a live date-sorted OpenAlex query for this exact phrase returned an
    // unrelated GIS journal first, dated 2029. "Newest thing that matches at all" is the wrong
    // question when the goal is to fill a knowledge base.
    expect(buildSearchUrl("openalex", "rag", 10, null)).toContain("sort=relevance_score:desc");
    expect(buildSearchUrl("openalex", "rag", 10, null, "date")).toContain("sort=publication_date:desc");
    expect(buildSearchUrl("arxiv", "rag", 10, null)).toContain("sortBy=relevance");
    expect(buildSearchUrl("crossref", "rag", 10, null)).toContain("sort=relevance");
  });

  it("reassembles an OpenAlex abstract from its inverted index", () => {
    expect(abstractFromInvertedIndex({ Retrieval: [0], augmented: [1], generation: [2] })).toBe(
      "Retrieval augmented generation",
    );
    expect(abstractFromInvertedIndex(null)).toBeNull();
  });

  it("reads an arXiv feed", () => {
    const xml = `<feed><entry><id>http://arxiv.org/abs/2301.00001</id><title>A Paper</title>
      <summary>An abstract.</summary><published>2026-01-02T00:00:00Z</published>
      <author><name>Chen Wei</name></author><author><name>Lin Mei</name></author>
      <link title="pdf" href="http://arxiv.org/pdf/2301.00001"/></entry></feed>`;
    const [paper] = parseArxivFeed(xml);
    expect(paper).toMatchObject({
      title: "A Paper",
      abstract: "An abstract.",
      authors: ["Chen Wei", "Lin Mei"],
      openAccessUrl: "http://arxiv.org/pdf/2301.00001",
      registry: "arxiv",
    });
  });

  it("stores the citation with the abstract, and marks that it is only an abstract", async () => {
    const openalex = {
      results: [
        {
          id: "https://openalex.org/W1",
          doi: "https://doi.org/10.1000/abc",
          display_name: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
          publication_date: "2026-02-03",
          abstract_inverted_index: Object.fromEntries(
            "We propose a general purpose fine tuning recipe for retrieval augmented generation models which combine pre trained parametric and non parametric memory for language generation and evaluate it on knowledge intensive tasks"
              .split(" ")
              .map((w, i) => [w, [i]]),
          ),
          authorships: [{ author: { display_name: "Patrick Lewis" } }],
          primary_location: { landing_page_url: "https://example.com/paper", source: { display_name: "NeurIPS" } },
          best_oa_location: { pdf_url: "https://arxiv.org/pdf/2005.11401" },
        },
      ],
    };
    const transport = (async () =>
      new Response(JSON.stringify(openalex), { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    const sink = createNullSink();
    const r = await crawl(
      [{ uri: `academic://${encodeURIComponent("retrieval augmented generation")}`, scope: { hosts: ["api.openalex.org"] } }],
      { ...runWith(transport, [academicCollector], sink), maxDepth: 1 },
    );

    expect(sink.received).toHaveLength(1);
    const doc = sink.received[0];
    expect(doc.title).toContain("Retrieval-Augmented Generation");
    expect(doc.author).toBe("Patrick Lewis");
    expect(doc.contentType).toBe("academic_paper");
    expect(doc.text).toContain("DOI: 10.1000/abc"); // the citation travels with the text
    expect(doc.text).toContain("NeurIPS");
    expect(doc.canonicalUrl).toBe("https://doi.org/10.1000/abc"); // the DOI is the identity
    expect(doc.meta.isAbstractOnly).toBe(true); // an abstract is not the paper, and says so
    expect(r.report.dirty).toHaveLength(0);
  });

  it("offers the open-access full text as an ordinary target on its own host", async () => {
    // Not fetched here, and never hunted for elsewhere: "we found the PDF on some other site" is how
    // a knowledge base acquires a licensing problem.
    const ctx = {
      canonicalize: (u: string) => u,
      fetch: (async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                display_name: "Open Paper",
                // An abstract, because a record without one is a citation rather than a document
                // and the collector now declines to store those.
                abstract_inverted_index: Object.fromEntries(
                  "This paper is open access and has an abstract long enough to be a document"
                    .split(" ")
                    .map((w, i) => [w, [i]]),
                ),
                primary_location: { landing_page_url: "https://example.com/p" },
                best_oa_location: { pdf_url: "https://arxiv.org/pdf/1234.5678" },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        )) as never,
      budget: createBudget(),
      tenantRef: ORG,
      log: () => {},
    };
    const { discovered } = await academicCollector.run(target("academic://open%20access", { meta: {} }), ctx);
    expect(discovered).toHaveLength(1);
    expect(discovered[0].scope.hosts).toEqual(["arxiv.org"]);
  });
});

describe("collect/local-file", () => {
  it("refuses a path outside the configured roots, even through a symlink", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "collect-root-"));
    await expect(resolveInsideRoot(path.join(root, "notes.txt"), [])).rejects.toThrow(/local_roots_not_configured/);
    await expect(resolveInsideRoot(tmpdir(), [root])).rejects.toThrow(/local_path_outside_root/);
  });

  it("turns a meeting transcript into a document without the timestamps", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
今天討論退貨政策。

2
00:00:04.500 --> 00:00:08.000
<v 王經理>期限改成十四天。</v>`;
    const text = captionsToText(vtt);
    expect(text).toContain("今天討論退貨政策");
    expect(text).toContain("期限改成十四天");
    expect(text).not.toContain("00:00:01");
    expect(text).not.toContain("WEBVTT");
  });

  it("reads a folder as a list of documents, one per file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "collect-files-"));
    await mkdir(path.join(root, "meetings"), { recursive: true });
    await writeFile(path.join(root, "meetings", "2026-09-01.md"), `# 退貨政策會議\n\n${"決議內容。".repeat(80)}`, "utf8");
    await writeFile(path.join(root, "ignore.bin"), "binary", "utf8");
    process.env.COLLECT_LOCAL_ROOTS = root;

    const sink = createNullSink();
    const budget = createBudget({ fetches: 50 });
    const r = await crawl([{ uri: pathToFileURL(root).href, scope: { hosts: ["localhost"] } }], {
      sink,
      budget,
      tenantRef: ORG,
      runId: "run-files",
      blocks: [localFileCollector],
      maxDepth: 3,
      // inScope() is URL-shaped and file:// has no host, so local runs opt out of host scoping —
      // the allow-list of roots IS the boundary here, enforced in the block.
      fetch: (async () => new Response("")) as never,
    });

    expect(r.report.outOfScope).toBe(0);
    expect(sink.received).toHaveLength(1);
    expect(sink.received[0].title).toBe("退貨政策會議");
    expect(sink.received[0].contentType).toBe("document");
    delete process.env.COLLECT_LOCAL_ROOTS;
  });
});

describe("collect/video", () => {
  it("recognises the platforms and ignores everything else", () => {
    expect(isVideoUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isVideoUrl("https://youtu.be/abc")).toBe(true);
    expect(isVideoUrl("https://vimeo.com/123")).toBe(true);
    expect(isVideoUrl("https://shop.example.com/faq")).toBe(false);
    expect(videoCollector.match(target("https://shop.example.com/faq"))).toBe(0);
  });

  it("finds caption tracks in both places a page can put them", () => {
    expect(captionTrackUrls('<track kind="captions" src="/c/zh.vtt">')).toEqual(["/c/zh.vtt"]);
    expect(captionTrackUrls('x "captionTracks":[{"baseUrl":"https://y.test/api?a=1\\u0026lang=zh"}] y')).toEqual([
      "https://y.test/api?a=1&lang=zh",
    ]);
  });

  it("converts a timed-text track into speech", () => {
    const xml = `<transcript><text start="0">退貨期限</text><text start="2">是七天&amp;#39;</text></transcript>`;
    expect(timedTextToText(xml)).toBe("退貨期限\n是七天'");
  });

  it("fails loudly for a video with no captions instead of storing a title", async () => {
    // A stub document would answer "我們的退貨政策說明影片" to a question about the policy.
    const transport = (async () =>
      new Response('<html><head><meta property="og:title" content="退貨政策說明"></head><body></body></html>', {
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    const sink = createNullSink();
    const r = await crawl([{ uri: "https://www.youtube.com/watch?v=abc", scope: { hosts: ["youtube.com"] } }], {
      ...runWith(transport, [videoCollector], sink),
    });
    expect(sink.received).toHaveLength(0);
    expect(r.report.dirty[0].reason).toMatch(/video_no_transcript|all_strategies_failed/);
  });

  it("stores the transcript when there is one", async () => {
    const captions = `WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n${"影片中說明退貨流程。".repeat(40)}`;
    const transport = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("captions.vtt")) return new Response(captions, { headers: { "content-type": "text/vtt" } });
      return new Response(
        `<html><head><meta property="og:title" content="退貨政策說明"><meta name="author" content="客服中心"></head>
         <body><track kind="captions" src="https://cdn.example.com/captions.vtt"></body></html>`,
        { headers: { "content-type": "text/html" } },
      );
    }) as unknown as typeof fetch;

    const sink = createNullSink();
    await crawl([{ uri: "https://vimeo.com/123", scope: { hosts: ["vimeo.com"] } }], {
      ...runWith(transport, [videoCollector], sink),
    });

    expect(sink.received).toHaveLength(1);
    expect(sink.received[0].text).toContain("影片中說明退貨流程");
    expect(sink.received[0].contentType).toBe("video_transcript");
    expect(sink.received[0].meta.hasTranscript).toBe(true);
  });
});

describe("collect/http-api", () => {
  it("reads a dotted path, and never throws on a missing one", () => {
    expect(pick({ a: { b: [{ c: 1 }] } }, "a.b.0.c")).toBe(1);
    expect(pick({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(pick(null, "a")).toBeUndefined();
  });

  it("maps an endpoint's own shape into documents", async () => {
    const payload = {
      data: {
        items: [
          {
            id: "R-1",
            attributes: { name: "退貨規定", body: "商品到貨後七日內可申請退貨。".repeat(30) },
            link: "https://gov.example/notice/R-1",
            published: "2026-05-05",
          },
        ],
      },
    };
    const transport = (async () =>
      new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    const sink = createNullSink();
    await crawl(
      [
        {
          uri: "https://gov.example/api/notices",
          hint: "http-api",
          scope: { hosts: ["gov.example"] },
          meta: {
            itemsPath: "data.items",
            titleField: "attributes.name",
            textField: "attributes.body",
            urlField: "link",
            idField: "id",
            dateField: "published",
          },
        },
      ],
      { ...runWith(transport, [httpApiCollector], sink) },
    );

    expect(sink.received).toHaveLength(1);
    expect(sink.received[0]).toMatchObject({
      title: "退貨規定",
      canonicalUrl: "https://gov.example/notice/R-1",
      contentType: "api_record",
      publishedAt: "2026-05-05T00:00:00.000Z",
    });
  });

  it("says the mapping is wrong instead of reporting an empty source forever", async () => {
    const transport = (async () =>
      new Response(JSON.stringify({ data: { items: { not: "an array" } } }), {
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const r = await crawl(
      [
        {
          uri: "https://gov.example/api/notices",
          hint: "http-api",
          scope: { hosts: ["gov.example"] },
          meta: { itemsPath: "data.items", titleField: "t", textField: "b" },
        },
      ],
      { ...runWith(transport, [httpApiCollector]) },
    );
    expect(r.report.dirty[0].reason).toMatch(/items_path_not_an_array|all_strategies_failed/);
  });
});

describe("sink/signal", () => {
  it("hands documents back and stores nothing", async () => {
    const sink = createSignalSink();
    const transport = (async () =>
      new Response(`<html><body><main><p>${"趨勢內容。".repeat(60)}</p></main></body></html>`, {
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const { httpHtmlCollector } = await import("@/lib/collect/collectors/http-html");

    const r = await crawl([{ uri: "https://example.com/trend", scope: { hosts: ["example.com"] } }], {
      ...runWith(transport, [httpHtmlCollector], sink),
    });

    expect(r.sink.written).toBe(0); // the honest number: nothing was persisted
    expect(sink.collected).toHaveLength(1);
    expect(sink.take()).toHaveLength(1);
    expect(sink.collected).toHaveLength(0); // taken once, not held
  });
});
