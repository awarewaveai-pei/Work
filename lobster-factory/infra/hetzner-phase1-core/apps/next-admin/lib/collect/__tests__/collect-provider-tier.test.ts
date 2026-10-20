// The degradation tier: what happens to a page the cheap collector cannot read.
//
// The gap this closes was measured, not imagined — a live crawl of aware-wave.com extracted 202
// bytes at density 0.0027 and was refused as `too_short`, because the page is JavaScript-rendered.
// The quality gate was right; there was simply nothing below it to fall through to.
//
// Nothing here talks to a vendor: the provider transport is injected, and the whole tier stays
// inert unless an API key is configured.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { createNullSink } from "@/lib/collect/sinks/null";
import { canonicalize } from "@/lib/collect/canonical";
import { createProviderCall, ProviderCallError, providerConfigured, PROVIDERS } from "@/lib/collect/net/providers";
import { extractProviderCollector, extractProviderId, markdownToText } from "@/lib/collect/collectors/extract-provider";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import type { Target } from "@/lib/collect/types";
import { collectGrant } from "./grant-fixture";
import { can } from "@/lib/entitlements/can";
import { CUSTOMER, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";

const GRANT = await collectGrant();

const KEY_ENV = "FIRECRAWL_API_KEY";
const ARTICLE = "退貨政策：商品到貨後七日內可申請退貨，商品需保持完整包裝與配件，恕不接受人為損壞。".repeat(6);

/** A page that is nothing but an empty shell plus a big inline JSON blob — the real shape. */
const JS_RENDERED_SHELL = `<!doctype html><html lang="zh-TW"><head><title>退貨政策</title></head>
<body><div id="__next"></div>
<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { x: "y".repeat(40_000) } } })}</script>
</body></html>`;

function firecrawlResponse(markdown: string, meta: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ success: true, data: { markdown, metadata: { title: "退貨政策", language: "zh-TW", ...meta } } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const target = (uri: string): Target => ({ uri, canonicalUri: canonicalize(uri), scope: { hosts: ["shop.example.com"] }, tier: 0, depth: 0 });

beforeEach(() => {
  delete process.env[KEY_ENV];
  delete process.env.COLLECT_EXTRACT_PROVIDER;
  // The self-hosted renderer now wins vendor auto-detection (2026-09-21); a developer shell that has
  // its secret set would otherwise silently route every test in this file to the other driver.
  delete process.env.RENDERER_SHARED_SECRET;
});

describe("provider configuration", () => {
  it("is inert without a key — the tier simply does not exist", () => {
    expect(providerConfigured("firecrawl")).toBe(false);
    expect(extractProviderCollector.match(target("https://shop.example.com/faq"))).toBe(0);
  });

  it("offers itself BELOW the cheap tier once configured", () => {
    process.env[KEY_ENV] = "fc-test";
    const t = target("https://shop.example.com/faq");
    expect(extractProviderCollector.match(t)).toBe(0.5);
    // Ordering is the cost control: an HTTP GET is free, a rendering call is not.
    expect(httpHtmlCollector.match(t)).toBeGreaterThan(extractProviderCollector.match(t));
  });

  it("takes PDFs, which the cheap tier declines", () => {
    process.env[KEY_ENV] = "fc-test";
    const t = target("https://shop.example.com/terms.pdf");
    expect(httpHtmlCollector.match(t)).toBe(0);
    expect(extractProviderCollector.match(t)).toBe(0.5);
  });

  it("names the vendor in one environment variable, nowhere else", () => {
    expect(extractProviderId({})).toBe("firecrawl");
    expect(extractProviderId({ COLLECT_EXTRACT_PROVIDER: "someone-else" })).toBe("someone-else");
  });
});

describe("createProviderCall", () => {
  const env = { [KEY_ENV]: "fc-secret" };

  it("injects the credential and refuses to let a caller replace it", async () => {
    let sent: Record<string, string> = {};
    const call = createProviderCall({ grant: GRANT,
      budget: createBudget(),
      env,
      transport: (async (_u: string | URL, init?: RequestInit) => {
        sent = (init?.headers ?? {}) as Record<string, string>;
        return firecrawlResponse("x");
      }) as unknown as typeof fetch,
    });

    await call("firecrawl", { path: "/v1/scrape", body: { url: "https://shop.example.com/faq" }, headers: { authorization: "Bearer attacker" } });
    expect(sent.authorization).toBe("Bearer fc-secret");
  });

  it("a paid vendor is never called without an allowed collect.fetch grant (ADR 017 §4)", async () => {
    const transport = vi.fn(async () => firecrawlResponse("x"));
    const refused = await can(CUSTOMER, "collect.fetch", "system", gateFixture({ balance: 0 }).deps);
    for (const grant of [null, refused]) {
      const call = createProviderCall({ grant, budget: createBudget(), env, transport: transport as unknown as typeof fetch });
      await expect(call("firecrawl", { path: "/v1/scrape", body: { url: "https://shop.example.com/" } }))
        .rejects.toMatchObject({ message: expect.stringMatching(/^entitlement_/), kind: "unconfigured" });
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("will not let a block send the call somewhere else", async () => {
    const call = createProviderCall({ grant: GRANT, budget: createBudget(), env, transport: (async () => firecrawlResponse("x")) as unknown as typeof fetch });
    // A path, never a URL: the origin belongs to the registry.
    await expect(call("firecrawl", { path: "https://attacker.test/steal" })).rejects.toThrow(/absolute_path_not_allowed/);
    await expect(call("firecrawl", { path: "//attacker.test/steal" })).rejects.toThrow(/absolute_path_not_allowed/);
  });

  it("says so plainly when the provider is not configured", async () => {
    const call = createProviderCall({ grant: GRANT, budget: createBudget(), env: {}, transport: (async () => firecrawlResponse("x")) as unknown as typeof fetch });
    await expect(call("firecrawl", { path: "/v1/scrape" })).rejects.toThrow(/missing_FIRECRAWL_API_KEY/);
    await expect(call("nope", { path: "/v1/scrape" })).rejects.toThrow(/unknown_provider_nope/);
  });

  it("charges the run budget, and stops when it is gone", async () => {
    const budget = createBudget({ fetches: 1 });
    const call = createProviderCall({ grant: GRANT, budget, env, transport: (async () => firecrawlResponse("x")) as unknown as typeof fetch });
    await call("firecrawl", { path: "/v1/scrape" });
    expect(budget.snapshot().spent.fetches).toBe(1);
    await expect(call("firecrawl", { path: "/v1/scrape" })).rejects.toThrow(/budget_exhausted/);
  });

  it("reports a vendor error as a status the orchestrator can classify", async () => {
    const call = createProviderCall({ grant: GRANT,
      budget: createBudget(),
      env,
      transport: (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch,
    });
    // 402 means out of credit: retrying it would spend the run on a call that cannot succeed.
    await expect(call("firecrawl", { path: "/v1/scrape" })).rejects.toMatchObject({ kind: "http", status: 402 });
    await expect(call("firecrawl", { path: "/v1/scrape" })).rejects.toBeInstanceOf(ProviderCallError);
  });

  it("allows Perplexity only on /search — chat/agent endpoints never leave the process", async () => {
    const hit: string[] = [];
    const call = createProviderCall({ grant: GRANT,
      budget: createBudget(),
      env: { PERPLEXITY_API_KEY: "pplx-test" },
      transport: (async (u: string | URL) => {
        hit.push(String(u));
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch,
    });

    for (const path of ["/chat/completions", "/v1/sonar", "/v1/agent", "/v1/embeddings", "/search/../chat/completions", "/SEARCH"]) {
      await expect(call("perplexity", { path })).rejects.toThrow(/path_not_allowed_perplexity/);
    }
    expect(hit).toEqual([]);

    await call("perplexity", { path: "/search", body: { query: "q" } });
    expect(hit).toEqual(["https://api.perplexity.ai/search"]);
  });

  it("every provider pointing at perplexity.ai is locked to /search, under any id", () => {
    const pplx = Object.values(PROVIDERS).filter((p) => new URL(p.origin).hostname.endsWith("perplexity.ai"));
    expect(pplx.length).toBeGreaterThan(0);
    for (const p of pplx) expect(p.allowedPaths, p.id).toEqual(["/search"]);
  });
});

describe("markdownToText", () => {
  it("keeps the prose and drops the markup", () => {
    const out = markdownToText("# 退貨政策\n\n請見 [說明頁](https://x.test/a)。\n\n![圖](https://x.test/i.png)\n\n```js\nvar a=1;\n```\n\n- 七日內");
    expect(out).toContain("退貨政策");
    expect(out).toContain("說明頁");
    expect(out).not.toContain("https://x.test/a");
    expect(out).not.toContain("var a=1");
    expect(out).not.toContain("![");
  });
});

describe("degradation: JS-rendered page", () => {
  it("falls through to the provider when the cheap tier returns an empty shell", async () => {
    process.env[KEY_ENV] = "fc-secret";
    const sink = createNullSink();
    const budget = createBudget({ fetches: 10 });
    const providerCalls: unknown[] = [];

    const r = await crawl([{ uri: "https://shop.example.com/faq" }], {
      sink,
      budget,
      tenantRef: "tenant-1",
      runId: "run-degrade",
      blocks: [httpHtmlCollector, extractProviderCollector],
      maxDepth: 1,
      fetch: createCollectFetch({
        budget,
        transport: (async () =>
          new Response(JS_RENDERED_SHELL, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch,
        resolver: async () => ["93.184.216.34"],
        rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }),
        robots: null,
      }),
      callProvider: createProviderCall({ grant: GRANT,
        budget,
        env: { [KEY_ENV]: "fc-secret" },
        transport: (async (_u: string | URL, init?: RequestInit) => {
          providerCalls.push(JSON.parse(String(init?.body)));
          return firecrawlResponse(`# 退貨政策\n\n${ARTICLE}`, { sourceURL: "https://shop.example.com/faq", author: "客服中心" });
        }) as unknown as typeof fetch,
      }),
    });

    // The cheap tier ran first and produced nothing usable; the provider tier salvaged the page.
    expect(providerCalls).toEqual([{ url: "https://shop.example.com/faq", formats: ["markdown"], onlyMainContent: true }]);
    expect(sink.received).toHaveLength(1);
    expect(sink.received[0].collector).toBe("collect/extract-provider:firecrawl");
    expect(sink.received[0].text).toContain("七日內可申請退貨");
    expect(sink.received[0].author).toBe("客服中心");
    expect(sink.received[0].raw).toBeNull(); // no payload of our own ⇒ density check does not apply
    expect(sink.received[0].provenance.epistemic_type).toBe("EVIDENCE");
    expect(r.report.dirty).toHaveLength(0);
  });

  it("does not call the provider for a page the cheap tier could read", async () => {
    process.env[KEY_ENV] = "fc-secret";
    const sink = createNullSink();
    const budget = createBudget({ fetches: 10 });
    const callProvider = vi.fn();

    const good = `<!doctype html><html lang="zh-TW"><head><title>退貨政策</title></head><body><main><p>${ARTICLE}</p></main></body></html>`;
    await crawl([{ uri: "https://shop.example.com/faq" }], {
      sink,
      budget,
      tenantRef: "tenant-1",
      runId: "run-cheap",
      blocks: [httpHtmlCollector, extractProviderCollector],
      maxDepth: 1,
      fetch: createCollectFetch({
        budget,
        transport: (async () => new Response(good, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch,
        resolver: async () => ["93.184.216.34"],
        rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }),
        robots: null,
      }),
      callProvider,
    });

    expect(callProvider).not.toHaveBeenCalled(); // the expensive tier is a fallback, not a default
    expect(sink.received[0].collector).toBe("collect/http-html");
  });
});
