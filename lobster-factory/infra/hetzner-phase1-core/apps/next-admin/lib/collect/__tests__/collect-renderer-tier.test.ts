// The self-hosted renderer as the rendered tier. No browser here: the provider transport is
// injected. What these pin is the contract next-admin relies on — which vendor gets picked, that a
// refused cheap-tier page actually reaches the renderer, that the rendered HTML goes through the
// SAME extractor, and that the origin's own status survives the extra hop.

import { beforeEach, describe, expect, it } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { createNullSink } from "@/lib/collect/sinks/null";
import { canonicalize } from "@/lib/collect/canonical";
import { createProviderCall } from "@/lib/collect/net/providers";
import { extractProviderCollector, extractProviderId } from "@/lib/collect/collectors/extract-provider";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import type { Target } from "@/lib/collect/types";
import { collectGrant } from "./grant-fixture";

const GRANT = await collectGrant();

const SECRET_ENV = "RENDERER_SHARED_SECRET";
const ARTICLE = "Theo Farrell is Vice-Chancellor and President of La Trobe University. ".repeat(20);

/** What a real browser hands back for a modern site: the article, plus a large hydration blob. */
const RENDERED_PAGE = `<!doctype html><html lang="en"><head><title>Theo Farrell | About | La Trobe University</title>
<style>${"body{margin:0}".repeat(2_000)}</style></head>
<body><nav>Home About Research</nav><main><h1>Theo Farrell</h1><p>${ARTICLE}</p></main>
<script id="__NEXT_DATA__">${JSON.stringify({ props: { x: "y".repeat(120_000) } })}</script>
</body></html>`;

const target = (uri: string): Target => ({ uri, canonicalUri: canonicalize(uri), scope: { hosts: ["scholars.example.edu"] }, tier: 0, depth: 0 });

function rendererReply(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, status: 200, finalUrl: "https://scholars.example.edu/tgfarrell", contentType: "text/html; charset=utf-8", html: RENDERED_PAGE, truncated: false, ...body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  delete process.env[SECRET_ENV];
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.COLLECT_EXTRACT_PROVIDER;
});

describe("vendor selection", () => {
  it("prefers the self-hosted renderer whenever it is configured", () => {
    expect(extractProviderId({ RENDERER_SHARED_SECRET: "s", FIRECRAWL_API_KEY: "k" })).toBe("renderer");
    expect(extractProviderId({ FIRECRAWL_API_KEY: "k" })).toBe("firecrawl");
  });

  it("lets an explicit choice override auto-detection", () => {
    expect(extractProviderId({ RENDERER_SHARED_SECRET: "s", COLLECT_EXTRACT_PROVIDER: "firecrawl" })).toBe("firecrawl");
  });

  it("does not send PDFs to a browser that cannot extract them", () => {
    process.env[SECRET_ENV] = "s";
    expect(extractProviderCollector.match(target("https://scholars.example.edu/tgfarrell"))).toBe(0.5);
    expect(extractProviderCollector.match(target("https://scholars.example.edu/cv.pdf"))).toBe(0);
  });

  it("stays below the cheap tier so a readable page never costs a render", () => {
    process.env[SECRET_ENV] = "s";
    const t = target("https://scholars.example.edu/tgfarrell");
    expect(httpHtmlCollector.match(t)).toBeGreaterThan(extractProviderCollector.match(t));
  });
});

describe("provider seam", () => {
  it("sends the secret in its own header, only to /render, and never lets a caller replace it", async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const call = createProviderCall({ grant: GRANT,
      budget: createBudget(),
      env: { [SECRET_ENV]: "real-secret" },
      transport: (async (u: string | URL, init?: RequestInit) => {
        seen.push({ url: String(u), headers: init?.headers as Record<string, string> });
        return rendererReply({});
      }) as unknown as typeof fetch,
    });
    await call("renderer", { path: "/render", body: { url: "https://x.example.com/" }, headers: { "x-renderer-secret": "attacker" } });
    expect(seen[0].url).toMatch(/\/render$/);
    expect(seen[0].headers["x-renderer-secret"]).toBe("real-secret");
    await expect(call("renderer", { path: "/healthz" })).rejects.toThrow(/path_not_allowed_renderer/);
  });
});

async function crawlOnce(cheap: Response, reply: () => Response) {
  process.env[SECRET_ENV] = "s";
  const sink = createNullSink();
  const budget = createBudget({ fetches: 10 });
  const rendered: unknown[] = [];
  const r = await crawl([{ uri: "https://scholars.example.edu/tgfarrell" }], {
    sink,
    budget,
    tenantRef: "t1",
    runId: `run-${Math.random()}`,
    blocks: [httpHtmlCollector, extractProviderCollector],
    maxDepth: 1,
    fetch: createCollectFetch({
      budget,
      transport: (async () => cheap.clone()) as unknown as typeof fetch,
      resolver: async () => ["93.184.216.34"],
      rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }),
      robots: null,
    }),
    callProvider: createProviderCall({ grant: GRANT,
      budget,
      env: { [SECRET_ENV]: "s" },
      transport: (async (_u: string | URL, init?: RequestInit) => {
        rendered.push(JSON.parse(String(init?.body)));
        return reply();
      }) as unknown as typeof fetch,
    }),
  });
  return { r, sink, rendered };
}

describe("degradation into the renderer", () => {
  it("renders a page the cheap tier was refused with 403, and reads it with the SAME extractor", async () => {
    const { r, sink, rendered } = await crawlOnce(new Response("Forbidden", { status: 403 }), () => rendererReply({}));

    expect(rendered).toEqual([{ url: "https://scholars.example.edu/tgfarrell", timeoutMs: 40_000 }]);
    expect(sink.received).toHaveLength(1);
    const doc = sink.received[0];
    expect(doc.collector).toBe("collect/extract-provider:renderer");
    expect(doc.title).toBe("Theo Farrell | About | La Trobe University");
    expect(doc.text).toContain("Vice-Chancellor and President");
    // The same extractor as the cheap tier: script and style never become content.
    expect(doc.text).not.toContain("__NEXT_DATA__");
    expect(doc.text).not.toContain("margin:0");
    expect(r.report.dirty).toHaveLength(0);
  });

  it("measures density against the rendered DOM WITHOUT script/style, not against the framework's bundle", async () => {
    const { sink } = await crawlOnce(new Response("Forbidden", { status: 403 }), () => rendererReply({}));
    const doc = sink.received[0];
    const raw = new TextDecoder().decode(doc.raw!.bytes);
    // The hydration blob and the stylesheet are gone from the payload the gate measures...
    expect(raw).not.toContain("__NEXT_DATA__");
    expect(raw).not.toContain("margin:0");
    // ...but the navigation is still there, because navigation IS the chrome density exists to catch.
    expect(raw).toContain("<nav>");
  });

  it("keeps the origin's own status across the extra hop — a 404 is still a tombstone", async () => {
    const { r, sink } = await crawlOnce(new Response("Forbidden", { status: 403 }), () => rendererReply({ status: 404 }));
    expect(sink.received).toHaveLength(0);
    expect(r.report.gone).toContain("https://scholars.example.edu/tgfarrell");
  });

  it("refuses a truncated render instead of storing half a document", async () => {
    const { r, sink } = await crawlOnce(new Response("Forbidden", { status: 403 }), () => rendererReply({ truncated: true }));
    expect(sink.received).toHaveLength(0);
    expect(r.report.dirty.length + r.report.retried).toBeGreaterThan(0);
  });

  it("reports a renderer failure instead of pretending the page was empty", async () => {
    const { r, sink } = await crawlOnce(
      new Response("Forbidden", { status: 403 }),
      () => new Response(JSON.stringify({ ok: false, error: "download_not_page" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(sink.received).toHaveLength(0);
    expect(r.report.dirty[0]?.reason).toMatch(/renderer_no_content_download_not_page/);
  });
});
