// SSRF gate for the collection fetcher.
//
// WHY NOT REUSE lib/content/trending-sources.ts's isSafePublicHttps: that one is documented as
// literal-host-only and is applied to operator-configured feed URLs, which is a different threat
// model. Here the URLs come from crawled pages — an attacker controls them — and every redirect hop
// is another chance to point at 169.254.169.254.
//
// WHAT THIS STOPS: a private address written literally in the URL, and a hostname that resolves to
// a private address at the moment we check it (the ordinary misconfigured-or-malicious host).
//
// WHAT THIS DOES NOT STOP — stated plainly, because a comfortable comment here is worse than the
// gap itself: DNS REBINDING. This function resolves the name, and then the platform's fetch
// resolves it AGAIN when it connects. A record with TTL 0 can answer "public" to the first query
// and "127.0.0.1" to the second, and nothing here sees it. Closing it needs the connection pinned
// to the address that was validated (an undici Agent with a custom `lookup`, which needs undici as
// a direct dependency). Tracked in TASKS.md; until then this is a narrowing, not a seal.

import { lookup } from "node:dns/promises";

export type Resolver = (hostname: string) => Promise<string[]>;

/** Node's resolver, wrapped to return every address for a hostname. */
export const defaultResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

function stripBrackets(host: string): string {
  const h = host.toLowerCase();
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}

/** True for an address that must never be reachable from a crawler. */
export function isPrivateAddress(addr: string): boolean {
  const a = stripBrackets(addr);
  if (a === "localhost" || a.endsWith(".localhost") || a.endsWith(".internal") || a.endsWith(".local")) return true;

  // IPv4 (and the IPv4 half of a mapped address)
  const v4 = a.startsWith("::ffff:") ? a.slice(7) : a;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    const [x, y] = v4.split(".").map(Number);
    if (x === 0 || x === 10 || x === 127) return true;
    if (x === 169 && y === 254) return true; // link-local, incl. the cloud metadata endpoint
    if (x === 172 && y >= 16 && y <= 31) return true;
    if (x === 192 && y === 168) return true;
    if (x === 100 && y >= 64 && y <= 127) return true; // CGNAT
    if (x >= 224) return true; // multicast + reserved
    return false;
  }

  // IPv6
  if (a === "::" || a === "::1") return true;
  if (/^::(0:)*1$/.test(a) || /^::ffff:0*:?/.test(a)) return true; // compressed loopback / mapped forms
  if (/^64:ff9b::/i.test(a)) return true; // NAT64 — an IPv4 destination wearing an IPv6 address
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique local
  if (/^fe[89ab]/.test(a)) return true; // link-local
  if (a.startsWith("::ffff:")) return true; // mapped, but not a dotted-quad we could parse above
  return false;
}

export interface UrlGateResult {
  ok: boolean;
  reason: string | null;
}

/**
 * Check one URL — literal form first, then every resolved address.
 * Called for the initial request AND for each redirect hop; a gate applied only to the first URL is
 * a gate an attacker skips with one 302.
 */
export async function checkUrl(rawUrl: string, resolver: Resolver = defaultResolver): Promise<UrlGateResult> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unparseable_url" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: `blocked_scheme_${u.protocol}` };
  if (u.username || u.password) return { ok: false, reason: "credentials_in_url" };
  // Public hosts run private things on odd ports (6379, 9200, 5432). A crawler has no business on
  // any port but the web's two.
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: `blocked_port_${u.port}` };

  const host = stripBrackets(u.hostname);
  if (!host) return { ok: false, reason: "empty_host" };
  if (isPrivateAddress(host)) return { ok: false, reason: "private_host_literal" };

  let addresses: string[];
  try {
    addresses = await resolver(host);
  } catch {
    return { ok: false, reason: "dns_failed" };
  }
  if (!addresses.length) return { ok: false, reason: "dns_empty" };
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) return { ok: false, reason: `private_address_${addr}` };
  }
  return { ok: true, reason: null };
}
