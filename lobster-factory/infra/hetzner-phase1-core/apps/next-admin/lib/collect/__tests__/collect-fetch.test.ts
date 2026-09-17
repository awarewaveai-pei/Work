// ctx.fetch: the gate every block goes through. These are the two C0 requirements that are about
// the network door itself — a redirect must not smuggle the crawler into the private network, and a
// block must not be able to pull more bytes than the run allows — plus robots and politeness.
//
// The transport and the DNS resolver are injected, so nothing here touches a network.

import { describe, expect, it, vi } from "vitest";
import { createCollectFetch, CollectFetchError, COLLECT_USER_AGENT } from "@/lib/collect/net/fetcher";
import { createBudget } from "@/lib/collect/budget";
import { RateLimiter, MemoryRateLimitStore } from "@/lib/collect/net/rate-limit";
import { RobotsCache } from "@/lib/collect/net/robots";
import { checkUrl, isPrivateAddress } from "@/lib/collect/net/ssrf";

const publicResolver = async () => ["93.184.216.34"];
const instantLimiter = () => new RateLimiter({ ratePerSecond: 1000, burst: 1000 });

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
}

describe("SSRF gate", () => {
  it("knows the addresses a crawler must never reach", () => {
    for (const addr of ["127.0.0.1", "169.254.169.254", "10.0.0.5", "192.168.1.1", "172.16.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1"]) {
      expect([addr, isPrivateAddress(addr)]).toEqual([addr, true]);
    }
    for (const addr of ["93.184.216.34", "1.1.1.1", "2606:4700::1111"]) {
      expect([addr, isPrivateAddress(addr)]).toEqual([addr, false]);
    }
  });

  it("blocks a public name that resolves to a private address (DNS rebinding)", async () => {
    const rebinding = async () => ["169.254.169.254"];
    const verdict = await checkUrl("https://totally-public.example.com/x", rebinding);
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.reason).toMatch(/private_address/);
  });

  it("rejects non-http schemes and credentials in the URL", async () => {
    expect((await checkUrl("file:///etc/passwd", publicResolver)).ok).toBe(false);
    expect((await checkUrl("https://user:pw@example.com/", publicResolver)).ok).toBe(false);
  });

  it("does not blindly block a genuinely public IPv4-mapped-IPv6 address (regression: the mapped-address regex used to match on the bare `::ffff:` prefix alone, blocking every mapped address regardless of what it encoded)", async () => {
    // WHATWG URL host serialization always normalizes a bracketed mapped host to this
    // hex-tail canonical form -- verified via `new URL("http://[::ffff:8.8.8.8]/").hostname`
    // -> `[::ffff:808:808]` -- never to a dotted-quad `::ffff:8.8.8.8` for a URL-derived host.
    expect(isPrivateAddress("::ffff:808:808")).toBe(false); // 8.8.8.8
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false); // literal dotted-quad spelling, already worked pre-fix
    expect(isPrivateAddress("::ffff:7f00:1")).toBe(true); // 127.0.0.1, still blocked post-fix
    expect(isPrivateAddress("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254, cloud metadata endpoint
    expect(isPrivateAddress("::ffff:0:808:808")).toBe(true); // malformed tail (not two hex groups) must fail closed

    const verdict = await checkUrl("http://[::ffff:8.8.8.8]/", publicResolver);
    expect(verdict.ok).toBe(true);
  });

  it("rejects a trailing-dot FQDN via the fast literal-string path, not just eventual DNS resolution (regression: the `.internal`/`.local`/`.localhost` suffix check did not strip a trailing dot the way an IPv4 literal is stripped by URL parsing)", async () => {
    expect(isPrivateAddress("evil.internal.")).toBe(true);
    expect(isPrivateAddress("evil.local.")).toBe(true);
    expect(isPrivateAddress("evil.localhost.")).toBe(true);
    expect(isPrivateAddress("localhost.")).toBe(true);
    expect(isPrivateAddress("example.com.")).toBe(false); // sanity: public trailing-dot FQDN still passes

    const resolverThatWouldBeWrong = vi.fn(async () => ["93.184.216.34"]);
    const verdict = await checkUrl("http://evil.internal./x", resolverThatWouldBeWrong);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("private_host_literal");
    expect(resolverThatWouldBeWrong).not.toHaveBeenCalled(); // fast path rejects before any DNS lookup
  });
});

describe("createCollectFetch", () => {
  it("6. re-checks the gate on every redirect hop", async () => {
    // The attack: a public URL that 302s to the cloud metadata endpoint. Automatic redirects would
    // only ever show the gate the first URL.
    const transport = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("start")) return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
      return html("secrets");
    });
    const resolver = async (host: string) => (host === "169.254.169.254" ? ["169.254.169.254"] : ["93.184.216.34"]);

    const f = createCollectFetch({
      budget: createBudget(),
      transport: transport as unknown as typeof fetch,
      resolver,
      rateLimiter: instantLimiter(),
      robots: null,
    });

    await expect(f("https://example.com/start")).rejects.toThrow(/ssrf_blocked_private_host_literal/);
    expect(transport).toHaveBeenCalledTimes(1); // the metadata endpoint was never contacted
  });

  it("follows a legitimate redirect and reports the final url", async () => {
    const transport = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/old")) return new Response(null, { status: 301, headers: { location: "/new" } });
      return html("<h1>moved here</h1>");
    });
    const f = createCollectFetch({
      budget: createBudget(),
      transport: transport as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots: null,
    });

    const res = await f("https://example.com/old");
    expect(res.status).toBe(200);
    expect(res.url).toBe("https://example.com/new"); // blocks canonicalise what they actually got
  });

  it("stops after too many redirects instead of looping", async () => {
    const transport = async () => new Response(null, { status: 302, headers: { location: "https://example.com/loop" } });
    const f = createCollectFetch({
      budget: createBudget(),
      transport: transport as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots: null,
      maxRedirects: 2,
    });
    await expect(f("https://example.com/loop")).rejects.toThrow(/too_many_redirects/);
  });

  it("7. truncates a response at the byte ceiling instead of loading it all", async () => {
    // A single endpoint that would otherwise stream 5MB into memory and eat the whole run.
    const big = "x".repeat(50_000);
    const transport = async () => html(big);
    const budget = createBudget();
    const f = createCollectFetch({
      budget,
      transport: transport as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots: null,
      maxBytes: 1_000,
    });

    const res = await f("https://example.com/huge");
    const text = await res.text();
    expect(text).toHaveLength(1_000);
    expect(res.headers.get("x-collect-truncated")).toBe("1");
    expect(budget.snapshot().spent.bytes).toBe(1_000); // charged for what was read, not what existed
  });

  it("7b. refuses a block that keeps fetching past the run budget", async () => {
    const transport = async () => html("<p>ok</p>");
    const budget = createBudget({ fetches: 2 });
    const f = createCollectFetch({
      budget,
      transport: transport as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots: null,
    });

    await f("https://example.com/1");
    await f("https://example.com/2");
    await expect(f("https://example.com/3")).rejects.toThrow(CollectFetchError);
    await expect(f("https://example.com/3")).rejects.toThrow(/budget_exhausted/);
  });

  it("checks robots by DEFAULT — switching it off has to be deliberate", async () => {
    // The earlier shape (`robots?:` with no default) meant a caller who simply forgot the argument
    // got a crawler that ignored robots.txt everywhere, with every test still green.
    const seen: string[] = [];
    const transport = (async (url: string | URL) => {
      seen.push(String(url));
      return String(url).endsWith("/robots.txt")
        ? new Response("User-agent: *\nDisallow: /\n", { status: 200 })
        : html("<p>ok</p>");
    }) as unknown as typeof fetch;

    const f = createCollectFetch({
      budget: createBudget(),
      transport,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      // robots deliberately not passed
    });

    await expect(f("https://example.com/anything")).rejects.toThrow(/robots_robots_disallow/);
    expect(seen.some((u) => u.endsWith("/robots.txt"))).toBe(true);
  });

  it("refuses a method a collector is not allowed to use", async () => {
    const f = createCollectFetch({
      budget: createBudget(),
      transport: (async () => html("<p>ok</p>")) as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots: null,
    });
    await expect(f("https://example.com/x", { method: "POST" })).rejects.toThrow(/method_not_allowed_POST/);
  });

  it("will not let a collector change who the crawler claims to be", async () => {
    // robots.txt is evaluated against OUR user agent. A block that could send a different one would
    // be asking permission as itself and fetching as somebody else.
    let sentHeaders: Record<string, string> = {};
    const transport = (async (_url: string | URL, init?: RequestInit) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return html("<p>ok</p>");
    }) as unknown as typeof fetch;
    const f = createCollectFetch({
      budget: createBudget(),
      transport,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots: null,
    });

    await f("https://example.com/x", {
      headers: { "user-agent": "Googlebot", cookie: "session=secret", authorization: "Bearer x", "if-none-match": "W/\"abc\"" },
    });
    expect(sentHeaders["user-agent"]).toBe(COLLECT_USER_AGENT);
    expect(sentHeaders.cookie).toBeUndefined();
    expect(sentHeaders.authorization).toBeUndefined();
    expect(sentHeaders["if-none-match"]).toBe('W/"abc"'); // the legitimate one still gets through
  });

  it("refuses a public host on a non-web port", async () => {
    expect((await checkUrl("http://example.com:6379/", publicResolver)).reason).toMatch(/blocked_port_6379/);
    expect((await checkUrl("https://example.com:443/x", publicResolver)).ok).toBe(true);
  });

  it("waits for a Crawl-delay the site asked for", async () => {
    let clock = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      ratePerSecond: 100, // tokens are plentiful; the delay is what must hold it back
      burst: 100,
      now: () => clock,
      sleep: async (ms) => { slept.push(ms); clock += ms; },
    });
    const robots = new RobotsCache(
      async () => ({ status: 200, text: "User-agent: *\nCrawl-delay: 5\n" }),
      "AwareWaveCollector",
    );
    const f = createCollectFetch({
      budget: createBudget(),
      transport: (async () => html("<p>ok</p>")) as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: limiter,
      robots,
    });

    await f("https://slow.example.com/1");
    await f("https://slow.example.com/2");
    expect(slept).toEqual([5000]);
  });

  it("stops refusing a site once its robots.txt is reachable again", async () => {
    // Fail-closed is right; fail-closed FOREVER is not. One hiccup used to mean the whole origin
    // was off limits until the process restarted.
    let clock = 0;
    let broken = true;
    const robots = new RobotsCache(
      async () => {
        if (broken) throw new Error("network down");
        return { status: 200, text: "User-agent: *\nDisallow:\n" };
      },
      "AwareWaveCollector",
      { errorTtlMs: 1000, now: () => clock },
    );

    expect((await robots.allows("https://flaky.example.com/x")).allowed).toBe(false);
    broken = false;
    expect((await robots.allows("https://flaky.example.com/x")).allowed).toBe(false); // still cached
    clock += 1001;
    expect((await robots.allows("https://flaky.example.com/x")).allowed).toBe(true);
  });

  it("honours robots.txt, and treats an unreachable robots.txt as a refusal", async () => {
    const robots = new RobotsCache(
      async (u) =>
        u.includes("nice.example.com")
          ? { status: 200, text: "User-agent: *\nDisallow: /private\nAllow: /private/public-note\n" }
          : Promise.reject(new Error("network down")),
      "AwareWaveCollector",
    );
    const f = createCollectFetch({
      budget: createBudget(),
      transport: (async () => html("<p>ok</p>")) as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: instantLimiter(),
      robots,
    });

    await expect(f("https://nice.example.com/private/secret")).rejects.toThrow(/robots_robots_disallow/);
    await expect(f("https://nice.example.com/private/public-note")).resolves.toBeInstanceOf(Response); // Allow wins
    await expect(f("https://broken.example.com/x")).rejects.toThrow(/robots_unavailable/);
  });

  it("makes the second request to a host wait for a token", async () => {
    let clock = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      ratePerSecond: 1,
      burst: 1,
      store: new MemoryRateLimitStore(),
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    const f = createCollectFetch({
      budget: createBudget(),
      transport: (async () => html("<p>ok</p>")) as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: limiter,
      robots: null,
    });

    await f("https://example.com/1");
    await f("https://example.com/2");
    expect(slept).toEqual([1000]); // one request per second, as configured
  });

  it("keeps buckets per host, so one slow site does not throttle another", async () => {
    let clock = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      ratePerSecond: 1,
      burst: 1,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    const f = createCollectFetch({
      budget: createBudget(),
      transport: (async () => html("<p>ok</p>")) as unknown as typeof fetch,
      resolver: publicResolver,
      rateLimiter: limiter,
      robots: null,
    });

    await f("https://a.example.com/1");
    await f("https://b.example.com/1");
    expect(slept).toEqual([]);
  });

  it("shares one bucket across runs when the store is shared", async () => {
    // The reason the bucket lives behind a store at all: two scheduled runs politely taking 1 req/s
    // each is 2 req/s at the target, and the blocked IP is the one also serving production.
    let clock = 0;
    const store = new MemoryRateLimitStore();
    const slept: number[] = [];
    const mk = () =>
      new RateLimiter({ ratePerSecond: 1, burst: 1, store, now: () => clock, sleep: async (ms) => { slept.push(ms); clock += ms; } });

    await mk().take("shared.example.com"); // "run A"
    await mk().take("shared.example.com"); // "run B", a different limiter instance
    expect(slept).toEqual([1000]);
  });
});
