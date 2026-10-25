// Outbound calls to extraction providers — the SECOND door, and a deliberately different one.
//
// ctx.fetch is for crawling: arbitrary attacker-supplied URLs, so it enforces the SSRF gate on every
// hop, robots, per-host politeness, GET/HEAD only, and no caller-supplied credentials. A provider
// call is the opposite situation in every respect: one fixed vendor origin we chose, authenticated,
// usually POST, and robots.txt has nothing to say about an API we pay for. Forcing it through
// ctx.fetch would mean relaxing all of those rules for crawling too.
//
// What this door enforces instead:
//   * the origin comes from the registry below, never from a block — a block passes a PATH;
//   * the API key is injected here and never reaches the block (a block cannot leak what it cannot
//     see, and cannot send it somewhere else);
//   * the same budget, timeout and byte ceiling as crawling, so a provider cannot eat a run either.
//
// Adding a vendor is one entry here plus a driver in a collector. No vendor name appears in any
// business logic (ADR 011 §決策 5, ADR 013 §決策 6).

import type { Budget } from "@/lib/collect/types";
import type { Grant } from "@/lib/entitlements/can";

export interface ProviderSpec {
  id: string;
  /** Fixed origin. A block supplies a path; it can never redirect the call somewhere else. */
  origin: string;
  /** Environment variable holding the key. Absent or empty ⇒ the provider is simply not available. */
  apiKeyEnv: string;
  /** How this vendor wants the key. Defaults to `Authorization: Bearer <key>`. */
  authHeader?: (key: string) => Record<string, string>;
  /** If set, the only URL paths this provider may be called on; anything else is refused before the request. */
  allowedPaths?: readonly string[];
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  // Self-hosted headless browser on the same host (apps/renderer, operator decision 2026-09-21).
  // The default rendered tier: measured on 10 pages the cheap tier could not read, it recovered 4
  // where Cloudflare's hosted browser recovered 2 — including the one authoritative source — at no
  // per-call cost and without a vendor rate limit. The decision this reverses (see firecrawl below)
  // was about standing infrastructure next to a web app; the renderer answers it with its own
  // container, its own network, and an egress policy that only reaches the public internet
  // (apps/renderer/entrypoint.sh). Returns rendered HTML, never extracted text: extraction stays
  // collectors/http-html.ts's docFromHtml, so a page reads the same whichever tier fetched it.
  //
  // Origin from the environment only so a developer can reach the prod renderer through an SSH
  // tunnel for a live end-to-end test; it is still ONE origin per process, never per call.
  renderer: {
    id: "renderer",
    origin: process.env.RENDERER_URL || "http://renderer:3000",
    apiKeyEnv: "RENDERER_SHARED_SECRET",
    authHeader: (key) => ({ "x-renderer-secret": key }),
    allowedPaths: ["/render"],
  },

  // Hosted fetch-and-extract, kept as the second vendor for the same tier (and the only one that can
  // read PDFs today). Originally chosen over a self-hosted headless browser because a browser farm
  // is permanent infrastructure plus an anti-bot arms race; superseded as the DEFAULT by `renderer`
  // above on 2026-09-21, still selectable with COLLECT_EXTRACT_PROVIDER=firecrawl.
  firecrawl: {
    id: "firecrawl",
    origin: "https://api.firecrawl.dev",
    apiKeyEnv: "FIRECRAWL_API_KEY",
  },

  // Open-web search: a query in, ranked result URLs out. Chosen for the index quality the operator
  // asked to match; nothing of its answer text is used, only the URLs (see collectors/web-search.ts
  // for why the snippet is never stored). Swapping vendors is one entry here plus a response parser
  // — COLLECT_SEARCH_PROVIDER already selects between them. Two vendors, so the search source is
  // not one account away from useless. Brave has its own header scheme rather than Bearer — which
  // is exactly why authHeader exists.
  brave: {
    id: "brave",
    origin: "https://api.search.brave.com",
    apiKeyEnv: "BRAVE_SEARCH_API_KEY",
    authHeader: (key) => ({ "x-subscription-token": key }),
  },

  // The operator's chosen default (2026-09-20). Already paid for and proven elsewhere in this app —
  // see lib/content/article/generate-core.ts and lib/content/trending-sources.ts — so this reuses a
  // working account rather than opening a new one. Locked to /search — not because this vendor is
  // known to have an expensive alternate mode (it does not appear to),
  // but because /search is the only endpoint collectors/web-search.ts's driver ever calls, and this
  // codebase has been burned once already by trusting an unverified assumption about a vendor's full
  // pricing surface. Widen this only alongside a caller that actually needs another path.
  serper: {
    id: "serper",
    origin: "https://google.serper.dev",
    apiKeyEnv: "SERPER_API_KEY",
    authHeader: (key) => ({ "x-api-key": key }),
    allowedPaths: ["/search"],
  },
};

export function providerSpec(id: string): ProviderSpec | null {
  return PROVIDERS[id] ?? null;
}

/** Whether this provider can be used at all. Blocks call it from match() and score 0 when false. */
export function providerConfigured(id: string): boolean {
  const spec = providerSpec(id);
  return !!spec && !!process.env[spec.apiKeyEnv];
}

export class ProviderCallError extends Error {
  constructor(
    message: string,
    readonly kind: "unconfigured" | "budget" | "http" | "network",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

export interface ProviderCallInit {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** Extra headers. The Authorization header is set here and cannot be overridden. */
  headers?: Record<string, string>;
}

export type ProviderCall = (providerId: string, init: ProviderCallInit) => Promise<Response>;

export interface ProviderCallOptions {
  budget: Budget;
  /** ADR 017 §4: the run's `collect.fetch` grant. Required (null = refused or unresolved): a paid vendor is never
   *  called without one; the call fails like a missing key, so the free crawl tier still runs. */
  grant: Grant | null;
  timeoutMs?: number;
  maxBytes?: number;
  transport?: typeof fetch;
  log?: (msg: string) => void;
  /** Test seam: read keys from here instead of the environment. */
  env?: Record<string, string | undefined>;
}

export function createProviderCall(opts: ProviderCallOptions): ProviderCall {
  // Extraction of a heavy page legitimately takes tens of seconds — this is a rendering service,
  // not a page fetch — so the default timeout is larger than the crawler's.
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const transport = opts.transport ?? fetch;
  const env = opts.env ?? process.env;
  const log = opts.log ?? (() => {});

  return async function callProvider(providerId, init) {
    const spec = providerSpec(providerId);
    if (!spec) throw new ProviderCallError(`unknown_provider_${providerId}`, "unconfigured");
    const key = env[spec.apiKeyEnv];
    if (!key) throw new ProviderCallError(`missing_${spec.apiKeyEnv}`, "unconfigured");
    if (!opts.budget.ok()) throw new ProviderCallError("budget_exhausted", "budget");
    if (!opts.grant?.allowed) throw new ProviderCallError(`entitlement_${opts.grant?.reason ?? "missing_grant"}`, "unconfigured");

    // Path only. `new URL(path, origin)` with an absolute path keeps the origin; an absolute URL
    // would replace it, so it is rejected rather than silently honoured.
    if (/^[a-z][a-z0-9+.-]*:/i.test(init.path) || init.path.startsWith("//")) {
      throw new ProviderCallError("absolute_path_not_allowed", "unconfigured");
    }
    const url = new URL(init.path, spec.origin);
    if (url.origin !== spec.origin) throw new ProviderCallError("origin_escape", "unconfigured");
    if (spec.allowedPaths && !spec.allowedPaths.includes(url.pathname)) {
      throw new ProviderCallError(`path_not_allowed_${providerId}`, "unconfigured");
    }
    void opts.grant.recordUse({ provider: providerId });

    const auth = spec.authHeader ? spec.authHeader(key) : { authorization: `Bearer ${key}` };
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await transport(url.toString(), {
        method: init.method ?? "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...init.headers,
          ...auth, // last: a caller cannot replace the credential with its own
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        redirect: "error", // an API that redirects us is an API doing something unexpected
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      opts.budget.spend({ fetches: 1, ms: Date.now() - startedAt });
      throw new ProviderCallError(`network_${String(e).slice(0, 120)}`, "network");
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    const bytes = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    opts.budget.spend({ fetches: 1, bytes: bytes.byteLength, ms: Date.now() - startedAt });
    log(`provider ${providerId} ${init.path} -> ${res.status} (${bytes.byteLength}B)`);

    if (!res.ok) {
      // Surfaced as a status so the orchestrator classifies it like any other failure: 429 and 5xx
      // are retried, 402 (out of credit) and 401 are not.
      throw new ProviderCallError(`provider_${providerId}_http_${res.status}`, "http", res.status);
    }
    return new Response(bytes.buffer as ArrayBuffer, { status: res.status, headers: res.headers });
  };
}
