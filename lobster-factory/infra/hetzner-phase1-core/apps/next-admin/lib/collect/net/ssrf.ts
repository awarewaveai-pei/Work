// SSRF gate for the collection fetcher.
//
// WHY NOT REUSE lib/content/public-https.ts's isSafePublicHttps: that one is documented as
// literal-host-only and is applied to operator-configured feed URLs, which is a different threat
// model. Here the URLs come from crawled pages — an attacker controls them — and every redirect hop
// is another chance to point at 169.254.169.254.
//
// WHAT THIS STOPS: a private address written literally in the URL, a hostname that resolves to a
// private address at the moment we check it, AND DNS REBINDING — a record with TTL 0 answering
// "public" to this query and "127.0.0.1" to a second query made moments later at connect time. The
// second query is exactly the hole: checkUrl() resolves once, and net/fetcher.ts pins the actual
// TCP connection to THAT SAME address (an undici `Agent` with a custom `connect.lookup`, verified
// live against a real HTTP server: an unresolvable hostname reached a 127.0.0.1 listener with no
// real DNS query ever leaving the process). The platform's fetch never gets a second chance to
// re-resolve, because it never resolves at all — the lookup override always answers with the one
// address `checkUrl` already validated.
//
// WHAT THIS STILL DOES NOT STOP: a server behind a validated public IP that itself proxies the
// request to a private address server-side (SSRF via an intentionally-cooperating public host).
// That is a different threat — the address we connect to really is the public one we checked — and
// out of scope for a network-layer gate.

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

/** Decodes the two-hex-group tail of a canonical `::ffff:HHHH:HHHH` mapped address (the
 * form the WHATWG URL host serializer ALWAYS produces for a bracketed IPv4-mapped host --
 * verified: `new URL("http://[::ffff:8.8.8.8]/").hostname` -> `[::ffff:808:808]`, never the
 * dotted-quad form) into its dotted-quad string, or null if the tail isn't that shape. */
function decodeMappedIPv4Tail(tail: string): string | null {
  const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (!m) return null;
  const hi = parseInt(m[1], 16);
  const lo = parseInt(m[2], 16);
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
}

/** True for an address that must never be reachable from a crawler. */
export function isPrivateAddress(addr: string): boolean {
  // A trailing dot marks an absolute FQDN (RFC 1035) and is not part of the hostname the
  // literal-suffix checks below compare against. Unlike an IPv4 literal -- which the WHATWG
  // URL parser strips the trailing dot from -- a domain keeps it (verified: `new
  // URL("http://evil.internal./").hostname` is still `evil.internal.`). Left unstripped,
  // "evil.internal." skips this fast literal-string path and falls through to a real DNS
  // lookup -- still blocked if it resolves to a private address, just slower.
  const a = stripBrackets(addr).replace(/\.$/, "");
  if (a === "localhost" || a.endsWith(".localhost") || a.endsWith(".internal") || a.endsWith(".local")) return true;

  // IPv4 (and the dotted-quad form of a mapped address, e.g. from inet_ntop-style DNS
  // resolver output -- NOT from URL parsing, which always yields the hex-tail form below).
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
  if (/^::(0:)*1$/.test(a)) return true; // compressed loopback forms
  if (a.startsWith("::ffff:")) {
    // Reached for the hex-tail canonical mapped form (see decodeMappedIPv4Tail doc) --
    // decode it and re-run the same IPv4 range table, instead of blanket-blocking every
    // `::ffff:` host. The old blanket block was fail-safe (over-blocks) but wrongly
    // treated public mapped addresses -- e.g. `::ffff:808:808` (8.8.8.8) -- as private.
    const decoded = decodeMappedIPv4Tail(a.slice(7));
    return decoded === null ? true : isPrivateAddress(decoded);
  }
  if (/^64:ff9b::/i.test(a)) return true; // NAT64 — an IPv4 destination wearing an IPv6 address
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique local
  if (/^fe[89ab]/.test(a)) return true; // link-local
  return false;
}

export interface UrlGateResult {
  ok: boolean;
  reason: string | null;
  /**
   * The address the caller MUST pin its connection to when ok — the exact one this function
   * validated. A literal-IP URL (host is already an address) pins to that literal; a hostname pins
   * to the first of its validated resolved addresses. Absent when !ok.
   */
  address?: string;
  /**
   * Every validated address, `address` first. A host with an AAAA record reached from a network without an IPv6
   * route (a container, this laptop) fails on its first address only; trying the next validated one is the same
   * gate's answer, not a new one. Without it law.moj.gov.tw read as 「這個網站一直沒有回應」 (2026-10-11).
   */
  addresses?: string[];
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

  // A literal IP has nothing to resolve — and nothing to rebind either, so it pins to itself.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return { ok: true, reason: null, address: host, addresses: [host] };
  }

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
  // First of the validated set — deterministic given what the resolver returned, and the same
  // address the pinned connection below will actually use, so "what we checked" and "what we
  // connect to" can never diverge.
  return { ok: true, reason: null, address: addresses[0], addresses };
}
