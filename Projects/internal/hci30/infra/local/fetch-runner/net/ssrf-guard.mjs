// HCI-30 isolated fetch runner -- SSRF gate (ADR-0029 gate 4-5;
// HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 4).
//
// This is a STANDALONE reimplementation of the technique proven in
// lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/ssrf.ts
// (checkUrl + isPrivateAddress). It deliberately does NOT import that file: this
// runner is on the other side of a deliberate security boundary from
// lobster-factory (agency-os/docs/architecture/decisions/011-collection-ingestion-boundary.md),
// and the plan doc's Task 4 Input line is explicit that the code itself must not be
// shared even though the technique is identical. Any bug found in one copy must be
// checked against the other by hand -- there is no shared source of truth to fix once.
//
// WHAT THIS STOPS: a private address written literally in the URL (including
// decimal/octal/hex-encoded IPv4 forms and IPv4-mapped IPv6 -- Node's WHATWG URL
// parser normalizes all of those to a canonical hostname before this code ever sees
// them, verified against the WHATWG URL "IPv4 parser" and "host serializer"
// algorithms), a hostname that resolves to a private address at check time, and DNS
// rebinding (a hostname that answers "public" to this check and "private" to a
// hypothetical second lookup at connect time -- closed by net/pinned-http-client.mjs
// never performing that second lookup at all, not by anything in this file).
//
// WHAT THIS STILL DOES NOT STOP: a server behind a validated public IP that itself
// proxies the request to a private address server-side. That is a different threat,
// out of scope for a network-layer/DNS-layer gate.

import { lookup as dnsLookup } from 'node:dns/promises';

/** Ports a runner has any business connecting to. Public hosts run private services
 * (redis, postgres, memcached) on non-web ports -- a fetch runner has no reason to be
 * on any of them. */
const ALLOWED_PORTS = new Set(['80', '443']);

function stripBrackets(host) {
  const h = host.toLowerCase();
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
}

/** Decodes the two-hex-group tail of a canonical `::ffff:HHHH:HHHH` mapped address (the
 * form the WHATWG URL host serializer ALWAYS produces for a bracketed IPv4-mapped host --
 * verified: `new URL('http://[::ffff:8.8.8.8]/').hostname` -> `[::ffff:808:808]`, never the
 * dotted-quad form) into its dotted-quad string, or null if the tail isn't that shape. */
function decodeMappedIPv4Tail(tail) {
  const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (!m) return null;
  const hi = parseInt(m[1], 16);
  const lo = parseInt(m[2], 16);
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.');
}

/** True for an address that must never be reachable from the isolated runner. */
export function isPrivateAddress(addr) {
  // A trailing dot marks an absolute FQDN (RFC 1035) and is not part of the hostname the
  // literal-suffix checks below compare against. Unlike an IPv4 literal -- which the WHATWG
  // URL parser strips the trailing dot from -- a domain keeps it (verified: `new
  // URL('http://evil.internal./').hostname` is still `evil.internal.`). Left unstripped,
  // "evil.internal." skips this fast literal-string path and falls through to a real DNS
  // lookup -- still blocked if it resolves to a private address, just slower.
  const a = stripBrackets(addr).replace(/\.$/, '');
  if (a === 'localhost' || a.endsWith('.localhost') || a.endsWith('.internal') || a.endsWith('.local')) return true;

  // IPv4 (and the dotted-quad form of a mapped address, e.g. from inet_ntop-style DNS
  // resolver output -- NOT from URL parsing, which always yields the hex-tail form below).
  const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    const [x, y] = v4.split('.').map(Number);
    if (x === 0 || x === 10 || x === 127) return true;
    if (x === 169 && y === 254) return true; // link-local, incl. the cloud metadata endpoint
    if (x === 172 && y >= 16 && y <= 31) return true;
    if (x === 192 && y === 168) return true;
    if (x === 100 && y >= 64 && y <= 127) return true; // CGNAT
    if (x >= 224) return true; // multicast + reserved
    return false;
  }

  // IPv6
  if (a === '::' || a === '::1') return true;
  if (/^::(0:)*1$/.test(a)) return true; // compressed loopback forms
  if (a.startsWith('::ffff:')) {
    // Reached for the hex-tail canonical mapped form (see decodeMappedIPv4Tail doc) --
    // decode it and re-run the same IPv4 range table, instead of blanket-blocking every
    // `::ffff:` host. The old blanket block was fail-safe (over-blocks) but wrongly
    // treated public mapped addresses -- e.g. `::ffff:808:808` (8.8.8.8) -- as private.
    const decoded = decodeMappedIPv4Tail(a.slice(7));
    return decoded === null ? true : isPrivateAddress(decoded);
  }
  if (/^64:ff9b::/i.test(a)) return true; // NAT64 -- an IPv4 destination wearing an IPv6 address
  if (a.startsWith('fc') || a.startsWith('fd')) return true; // unique local
  if (/^fe[89ab]/.test(a)) return true; // link-local
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(reason) {
    super(`ssrf_blocked_${reason}`);
    this.name = 'SsrfBlockedError';
    this.reason = reason;
  }
}

/** A hostname-to-addresses resolver. Injected so tests never touch real DNS. */
export const defaultResolver = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/**
 * Check one URL -- literal form first, then every resolved address. Must be called
 * for the initial request AND independently for each redirect hop by the caller
 * (net/pinned-http-client.mjs does this): a gate applied only to the first URL is a
 * gate an attacker skips with one 3xx response.
 *
 * On success, `address`/`family` are the EXACT values the caller must pin its
 * connection to -- returning "ok" without the caller using this address specifically
 * (instead letting the platform re-resolve the hostname at connect time) is the precise
 * TOCTOU gap DNS rebinding exploits.
 */
export async function checkUrl(rawUrl, resolver = defaultResolver) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'unparseable_url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: `blocked_scheme_${u.protocol}` };
  if (u.username || u.password) return { ok: false, reason: 'credentials_in_url' };
  if (u.port && !ALLOWED_PORTS.has(u.port)) return { ok: false, reason: `blocked_port_${u.port}` };

  const host = stripBrackets(u.hostname);
  if (!host) return { ok: false, reason: 'empty_host' };
  if (isPrivateAddress(host)) return { ok: false, reason: 'private_host_literal' };

  // A literal IP (including the decimal/octal/hex forms the URL parser already
  // normalized into this dotted-quad or bracketed-v6 hostname) has nothing to resolve
  // -- and nothing to rebind either, so it pins to itself.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return { ok: true, reason: null, address: host, family: host.includes(':') ? 6 : 4 };
  }

  let addresses;
  try {
    addresses = await resolver(host);
  } catch {
    return { ok: false, reason: 'dns_failed' };
  }
  if (!addresses.length) return { ok: false, reason: 'dns_empty' };
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) return { ok: false, reason: `private_address_${addr}` };
  }
  // First of the validated set -- deterministic given what the resolver returned, and
  // the same address net/pinned-http-client.mjs's pinned connection will actually use,
  // so "what we checked" and "what we connect to" can never diverge.
  const address = addresses[0];
  return { ok: true, reason: null, address, family: address.includes(':') ? 6 : 4 };
}
