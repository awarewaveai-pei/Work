// DNS-rebinding fix (TASKS.md 2026-09-11 "蒐集 C0｜安全", closed 2026-09-12).
//
// checkUrl() (net/ssrf.ts) resolves a hostname once and rejects it if any resolved address is
// private. Without a second guarantee, the platform's real fetch resolves the SAME hostname AGAIN
// at connect time — a DNS record with TTL 0 can answer "public" to the first query and
// "127.0.0.1"/a cloud metadata address to the second, and checkUrl never sees the second answer.
//
// Two things need proof, and neither alone is enough:
//   A) the underlying mechanism — an undici Agent with a custom connect.lookup genuinely overrides
//      what address Node's global fetch connects to, with no real DNS query involved. This CANNOT
//      be exercised through checkUrl()/createCollectFetch(), because every real routable address
//      that could host a test listener (127.0.0.1, 10.x, etc.) is exactly what the SSRF gate exists
//      to reject — the two concerns are untestable together on purpose.
//   B) the wiring — createCollectFetch() actually builds a dispatcher from the address checkUrl()
//      validated and hands it to transport() on every attempt, including across a redirect (where a
//      stale, reused dispatcher pinned to the FIRST hop's address would silently defeat the point).
//
// (A) is a real HTTP server and the real global fetch — no mocks. (B) mocks transport, which is the
// only way to inspect what createCollectFetch actually constructed and passed.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { Agent } from "undici";
import { createCollectFetch, pinnedDispatcher } from "@/lib/collect/net/fetcher";
import { createBudget } from "@/lib/collect/budget";

describe("pinnedDispatcher — the mechanism (real server, real global fetch, no mocks)", () => {
  it("connects to the pinned address even when the hostname cannot really resolve", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pinned-ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      // A hostname with no real DNS record at all: the ONLY way this fetch can succeed is if the
      // dispatcher's lookup override supplied an address without ever asking real DNS.
      const res = await fetch(`http://this-host-does-not-exist-anywhere.invalid:${port}/`, {
        dispatcher: pinnedDispatcher("127.0.0.1"),
      } as RequestInit & { dispatcher: unknown });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("pinned-ok");
    } finally {
      server.close();
    }
  });

  it("is a fresh Agent each call, not a shared/cached one", () => {
    const a = pinnedDispatcher("203.0.113.1");
    const b = pinnedDispatcher("203.0.113.1");
    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(Agent);
    void a.close();
    void b.close();
  });
});

describe("createCollectFetch wiring — every attempt gets a dispatcher pinned to what checkUrl saw", () => {
  it("passes a dispatcher to transport on the very first attempt", async () => {
    const calls: Array<{ url: string; dispatcher: unknown }> = [];
    const transport = (async (url: string, init?: RequestInit & { dispatcher?: unknown }) => {
      calls.push({ url: String(url), dispatcher: init?.dispatcher });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const f = createCollectFetch({
      budget: createBudget({ fetches: 100, bytes: 10_000_000, ms: 60_000 }),
      transport,
      resolver: async () => ["93.184.216.34"], // a real public address, never dialled by the test
      robots: null,
    });
    await f("https://totally-public.example.com/page");

    expect(calls).toHaveLength(1);
    expect(calls[0].dispatcher).toBeDefined();
    expect(calls[0].dispatcher).toBeInstanceOf(Agent);
  });

  it("pins a NEW dispatcher per redirect hop — never reuses the previous hop's pin", async () => {
    const calls: Array<{ url: string; dispatcher: unknown }> = [];
    let hop = 0;
    const transport = (async (url: string, init?: RequestInit & { dispatcher?: unknown }) => {
      calls.push({ url: String(url), dispatcher: init?.dispatcher });
      hop++;
      if (hop === 1) {
        return new Response(null, { status: 302, headers: { location: "https://second-host.example.com/dst" } });
      }
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const f = createCollectFetch({
      budget: createBudget({ fetches: 100, bytes: 10_000_000, ms: 60_000 }),
      transport,
      resolver: async () => ["93.184.216.34"],
      robots: null,
    });
    await f("https://first-host.example.com/src");

    expect(calls).toHaveLength(2);
    expect(calls[0].dispatcher).toBeInstanceOf(Agent);
    expect(calls[1].dispatcher).toBeInstanceOf(Agent);
    // The whole point of pinning per-hop: hop 2's address was validated independently of hop 1's,
    // so hop 2 must not silently inherit hop 1's pinned connection.
    expect(calls[1].dispatcher).not.toBe(calls[0].dispatcher);
  });
});
