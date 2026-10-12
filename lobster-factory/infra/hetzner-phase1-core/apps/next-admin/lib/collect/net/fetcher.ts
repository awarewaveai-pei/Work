// ctx.fetch — the single outward door for every collection block.
//
// Everything a block would otherwise have to remember lives here, once: the SSRF gate on every
// redirect hop, DNS-rebinding-proof connection pinning, a hard byte ceiling, a timeout, robots, the
// per-host token bucket, and budget accounting. A block that called global fetch would skip all
// seven at the same time, which is why lib/collect/__tests__/collect-block-hygiene.test.ts fails
// the build if one does.
//
// Redirects are followed MANUALLY (redirect: "manual"). With the platform's automatic redirects the
// gate only ever sees the first URL, so one 302 to 169.254.169.254 walks straight through it — this
// is the exact hole the existing safeFetchText has (DATA_COLLECTION_PLAN.md §0).

import { Agent, type Dispatcher } from "undici";
import type { Budget } from "@/lib/collect/types";
import { checkUrl, defaultResolver, type Resolver } from "@/lib/collect/net/ssrf";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { RobotsCache } from "@/lib/collect/net/robots";

/**
 * A dispatcher whose TCP connect() always answers with `address`, no matter what hostname undici
 * asks it to resolve. This is what turns checkUrl()'s "I resolved this hostname and it was safe"
 * into a guarantee instead of advice: without it, the platform's fetch resolves the hostname AGAIN
 * at connect time, and a DNS-rebinding host can answer differently the second time. One Agent per
 * request (not shared/pooled) is deliberate — a pinned connection reused for a later request to a
 * DIFFERENT resolved address for the same hostname would silently un-pin it.
 */
export function pinnedDispatcher(address: string): Dispatcher {
  const family = address.includes(":") ? 6 : 4;
  return new Agent({
    connect: {
      lookup(_hostname, _options, callback) {
        callback(null, [{ address, family }]);
      },
    },
  });
}

export const COLLECT_USER_AGENT = "AwareWaveCollector/1.0 (+https://aware-wave.com/bot)";

/**
 * Hosts that are documented, keyless query APIs, not sites being crawled — robots.txt has nothing to
 * say about an endpoint whose only purpose is machine querying. export.arxiv.org's robots.txt is
 * `Disallow: /` for every agent (verified 2026-09-18), which otherwise silently zeroes out every
 * result from collect/academic's arXiv registry option in production — the same conclusion
 * collect-live-smoke.test.ts already reaches for its own test call via `robots: null` ("a documented
 * public API, not a site being crawled"), narrowed here to exactly this host so run.ts's production
 * wiring gets it too, instead of only a test that opts out of the robots gate entirely.
 *
 * Add a host ONLY after reading its actual robots.txt (curl it) — this set turns robots.txt off, per
 * host, for every collector that ever fetches it, not just collect/academic.
 */
const ROBOTS_EXEMPT_API_HOSTS = new Set(["export.arxiv.org"]);

export interface CollectFetchOptions {
  budget: Budget;
  /** Bytes accepted from ONE response before it is truncated. Stops a 500MB endpoint eating a run. */
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  resolver?: Resolver;
  rateLimiter?: RateLimiter;
  /**
   * Omitted ⇒ robots.txt IS consulted, through a cache this function builds itself, for every host
   * except ROBOTS_EXEMPT_API_HOSTS above. Passing `null` is the only way to switch it off for
   * everything else, and it has to be deliberate: the previous shape (`robots?:` with no default)
   * meant a caller who forgot the argument got a crawler that ignored robots everywhere, with every
   * test still green.
   */
  robots?: RobotsCache | null;
  /** Injected so tests never touch the network. Defaults to the platform fetch. */
  transport?: typeof fetch;
  /** Ceiling on one call including every redirect hop and every politeness wait. */
  deadlineMs?: number;
  log?: (msg: string) => void;
  /**
   * Exact hosts THIS fetch may POST to: a documented JSON API (lib/collect/lookups, Cofacts GraphQL). Empty by
   * default — a crawler fetches documents, and a POST to a host named by a crawled page is a different capability.
   * A POST follows no redirect: an API that redirects us is doing something unexpected.
   */
  postHosts?: readonly string[];
}

/** Headers a collector may not set: they would change who we are or who we are talking to. */
const FORBIDDEN_HEADERS = new Set(["user-agent", "host", "cookie", "authorization", "proxy-authorization"]);

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/**
 * Structured failure. `kind` is what the orchestrator classifies on — matching regexes against a
 * message that happens to contain the URL is how a page at /blog/404-explained gets recorded as
 * permanently gone.
 */
export class CollectFetchError extends Error {
  constructor(
    message: string,
    readonly kind: "blocked" | "disallowed" | "budget" | "http" | "network",
    readonly status?: number,
  ) {
    super(message);
    this.name = "CollectFetchError";
  }
}

/**
 * The addresses one request may try: the validated first, then the first validated address of the OTHER family.
 * At most two, so a dead host costs one extra connect attempt, not one per DNS record. Exported for tests.
 */
export function pinnedCandidates(first: string, validated: readonly string[]): string[] {
  const v6 = (a: string) => a.includes(":");
  const other = validated.find((a) => v6(a) !== v6(first));
  return other ? [first, other] : [first];
}

/** The connection was never made: no route for that family, refused, or the connect itself timed out. */
const CONNECT_FAILURES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "EADDRNOTAVAIL"]);
export function connectFailed(e: unknown): boolean {
  const cause = e && typeof e === "object" ? (e as { cause?: unknown }).cause : undefined;
  const code = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : undefined;
  return typeof code === "string" && CONNECT_FAILURES.has(code);
}

/** Statuses whose body must stay empty, per the Response constructor. */
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

/** Statuses that mean "the document is at this other URL". Notably NOT 304. */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

async function readCapped(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > maxBytes
      ? { bytes: buf.slice(0, maxBytes), truncated: true }
      : { bytes: buf, truncated: false };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      // Stop pulling: the point of the cap is to not download the rest, not to discard it later.
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { bytes, truncated };
}

/**
 * Build the fetch a block receives. The returned function throws CollectFetchError for anything the
 * gate refuses, so a block cannot mistake "we would not let you" for "the site said no".
 */
export function createCollectFetch(opts: CollectFetchOptions) {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const userAgent = opts.userAgent ?? COLLECT_USER_AGENT;
  const resolver = opts.resolver ?? defaultResolver;
  const limiter = opts.rateLimiter ?? new RateLimiter();
  const transport = opts.transport ?? fetch;
  const log = opts.log ?? (() => {});
  const deadlineMs = opts.deadlineMs ?? 120_000;

  // robots.txt is itself fetched through this same door (gate, byte cap, timeout, politeness) —
  // with robots checking disabled on the inner one, or asking permission would ask permission.
  const robots =
    opts.robots === null
      ? null
      : (opts.robots ??
        new RobotsCache(async (robotsUrl) => {
          const res = await createCollectFetch({ ...opts, robots: null, maxBytes: 512_000 })(robotsUrl);
          return { status: res.status, text: res.status === 200 ? await res.text() : "" };
        }, userAgent));

  return async function collectFetch(
    url: string,
    /**
     * `stream`: the body is handed back unread, failing once it passes maxBytes (a download too big to hold).
     * `redirect: "manual"`: a redirect is handed back, not followed (where a URL points is the answer).
     */
    init: { headers?: Record<string, string>; method?: string; body?: string; stream?: boolean; redirect?: "manual" } = {},
  ): Promise<Response> {
    let current = url;
    const startedWholeCall = Date.now();

    const method = (init.method ?? "GET").toUpperCase();
    // A collector fetches documents. POST/PUT/DELETE to arbitrary hosts found on crawled pages is a
    // different capability, and it arrives here as a one-word argument if this is not checked.
    let postHost = "";
    try {
      postHost = new URL(url).hostname.toLowerCase();
    } catch {
      // an unparseable URL is refused by the gate below
    }
    const postAllowed = method === "POST" && (opts.postHosts ?? []).includes(postHost);
    if (method !== "GET" && method !== "HEAD" && !postAllowed) {
      throw new CollectFetchError(`method_not_allowed_${method}`, "blocked");
    }

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!opts.budget.ok()) throw new CollectFetchError("budget_exhausted", "budget");
      if (Date.now() - startedWholeCall > deadlineMs) throw new CollectFetchError("call_deadline_exceeded", "network");

      const gate = await checkUrl(current, resolver);
      if (!gate.ok) throw new CollectFetchError(`ssrf_blocked_${gate.reason}`, "blocked");
      // gate.ok guarantees `address` is set (checkUrl's contract) — pin the connection to exactly
      // the addresses just validated, so the platform's own re-resolution at connect time never runs.
      const pinned = pinnedCandidates(gate.address!, gate.addresses ?? []);
      const host = new URL(current).hostname.toLowerCase();

      let crawlDelayMs: number | undefined;
      if (robots && !ROBOTS_EXEMPT_API_HOSTS.has(host)) {
        const verdict = await robots.allows(current);
        if (!verdict.allowed) {
          // Two different situations: the site said no (settled), and we could not ask (transient).
          const kind = verdict.reason === "robots_disallow" ? "disallowed" : "network";
          throw new CollectFetchError(`robots_${verdict.reason}`, kind);
        }
        if (verdict.crawlDelay) crawlDelayMs = verdict.crawlDelay * 1000;
      }

      const waited = await limiter.take(host, { minIntervalMs: crawlDelayMs });
      if (waited) log(`rate-limited ${host} for ${waited}ms`);

      let startedAt = Date.now();
      let res: Response | undefined;
      // The other address family only when the first could not even be CONNECTED to (connectFailed): an answer,
      // whatever its status, is the site's, and a request that timed out after connecting is not retried here.
      for (let a = 0; a < pinned.length && !res; a++) {
        const dispatcher = pinnedDispatcher(pinned[a]);
        startedAt = Date.now();
        try {
          res = await transport(current, {
            method,
            // Caller headers first, ours last: the user agent is what robots.txt was evaluated
            // against, so a collector must not be able to send a different one. Credentials and Host
            // are dropped outright — a crawler has no session to present to anybody.
            headers: {
              accept: "text/html,application/xhtml+xml,*/*;q=0.8",
              ...sanitizeHeaders(init.headers),
              "user-agent": userAgent,
            },
            body: postAllowed ? init.body : undefined,
            redirect: "manual", // load-bearing: see the file header
            signal: AbortSignal.timeout(timeoutMs),
            // Not part of the standard fetch types (a Node/undici extension) — real fetch reads it,
            // a test's injected transport mock is free to ignore it.
            dispatcher,
          } as RequestInit & { dispatcher: Dispatcher });
        } catch (e) {
          opts.budget.spend({ fetches: 1, ms: Date.now() - startedAt });
          const last =
            a + 1 >= pinned.length || !connectFailed(e) || Date.now() - startedWholeCall > deadlineMs || !opts.budget.ok();
          if (last) throw new CollectFetchError(`network_${String(e)}`, "network");
          log(`no answer from ${host} at ${pinned[a]}; trying ${pinned[a + 1]}`);
        } finally {
          // One request per Agent (see pinnedDispatcher's own comment) — close it either way so a
          // crawl of thousands of pages does not leak thousands of idle connection pools.
          void dispatcher.close().catch(() => {});
        }
      }
      if (!res) throw new CollectFetchError("network_no_address_answered", "network");

      // Only the statuses that actually mean "go here instead". 304 lives in the 3xx range but is
      // the answer to a conditional request — treating it as a redirect turns "nothing changed,
      // spend nothing" into a hard error on every unchanged page, which is most pages.
      if (REDIRECT_STATUS.has(res.status)) {
        const location = res.headers.get("location");
        opts.budget.spend({ fetches: 1, ms: Date.now() - startedAt });
        if (postAllowed) throw new CollectFetchError(`redirect_on_post_${res.status}`, "http", res.status);
        if (init.redirect === "manual") {
          const pointer = new Response(null, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
          Object.defineProperty(pointer, "url", { value: current, enumerable: true });
          return pointer;
        }
        if (!location) throw new CollectFetchError(`redirect_without_location_${res.status}`, "http", res.status);
        current = new URL(location, current).toString(); // relative Location headers are legal
        log(`redirect ${res.status} -> ${current}`);
        continue; // and the gate runs again for this new URL
      }

      if (init.stream && res.body && !NULL_BODY_STATUS.has(res.status)) {
        opts.budget.spend({ fetches: 1, ms: Date.now() - startedAt });
        // Errors rather than truncating: half a dataset is not a smaller dataset, it is a wrong one.
        let seen = 0;
        const capped = res.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              seen += chunk.byteLength;
              if (seen > maxBytes) controller.error(new CollectFetchError(`stream_over_${maxBytes}_bytes`, "http"));
              else controller.enqueue(chunk);
            },
          }),
        );
        const streamed = new Response(capped, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
        Object.defineProperty(streamed, "url", { value: current, enumerable: true });
        return streamed;
      }

      const { bytes, truncated } = NULL_BODY_STATUS.has(res.status)
        ? { bytes: new Uint8Array(0), truncated: false }
        : await readCapped(res, maxBytes);
      opts.budget.spend({ fetches: 1, bytes: bytes.byteLength, ms: Date.now() - startedAt });
      if (truncated) log(`truncated ${current} at ${maxBytes} bytes`);

      const headers = new Headers(res.headers);
      if (truncated) headers.set("x-collect-truncated", "1");
      const out = NULL_BODY_STATUS.has(res.status)
        ? new Response(null, { status: res.status, statusText: res.statusText, headers })
        // `bytes` is a freshly allocated, exactly sized buffer (readCapped copies into it), so its
        // ArrayBuffer is the body — no offset arithmetic, and no dependence on the DOM lib's view
        // of which typed arrays count as a BodyInit.
        : new Response(bytes.buffer as ArrayBuffer, { status: res.status, statusText: res.statusText, headers });
      // Response.url is read-only and empty on a constructed Response; blocks need the FINAL url
      // (after redirects) to canonicalise what they actually fetched.
      Object.defineProperty(out, "url", { value: current, enumerable: true });
      return out;
    }

    throw new CollectFetchError(`too_many_redirects_${maxRedirects}`, "http");
  };
}
