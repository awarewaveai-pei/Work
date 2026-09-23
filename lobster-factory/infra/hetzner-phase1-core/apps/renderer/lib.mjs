// Pure pieces of the renderer: no browser, no network, no filesystem. Everything here is unit-tested
// (test/lib.test.mjs) and is the part a code change is most likely to get subtly wrong.
//
// The SECURITY BOUNDARY IS NOT HERE. It is the OUTPUT iptables policy entrypoint.sh installs in this
// container's network namespace before the server starts: that is what stops a hostile page from
// reaching Supabase, n8n or the cloud metadata endpoint, including via DNS rebinding, which no
// URL-level check can see. These checks are the fast, legible first refusal in front of it — they
// turn "the browser hung for 45s on a dropped packet" into a clear 400 for the common mistakes.

import net from "node:net";

/** RFC1918, loopback, link-local (incl. cloud metadata), CGNAT, unspecified, multicast/reserved. */
const PRIVATE_V4 = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["100.64.0.0", 10],
  ["0.0.0.0", 8],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip) {
  return ip.split(".").reduce((n, octet) => (n << 8) + Number(octet), 0) >>> 0;
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    // The container has no IPv6 route at all (enable_ipv6: false, ip6tables default-deny); any v6
    // literal is refused outright rather than half-classified.
    return true;
  }
  return false;
}

/**
 * Decide whether a URL may be rendered at all. Returns the parsed URL or throws with a code the HTTP
 * layer maps to 400.
 *
 * Refused: non-http(s) schemes (file:, chrome:, data:, javascript:), embedded credentials, IP
 * literals in private ranges, and single-label hostnames — a bare `renderer`, `supabase-db` or
 * `lobster-next-admin` is a Docker service name, never a public website.
 */
export function validateTargetUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) throw codeError("url_invalid");
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw codeError("url_invalid");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw codeError("url_scheme_not_allowed");
  if (u.username || u.password) throw codeError("url_credentials_not_allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw codeError("url_private_address");
    return u;
  }
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    throw codeError("url_internal_hostname");
  }
  return u;
}

export function codeError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

/**
 * Constant-time secret comparison. A plain `===` leaks the matching prefix length through timing;
 * cheap to avoid, so avoided.
 */
export function secretMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || expected.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * At most N renders at once, the rest wait. A browser page is ~100-300MB; an unbounded fan-out from
 * one crawl is how a render service gets OOM-killed and takes its in-flight work with it.
 */
export class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }
  get pending() {
    return this.queue.length;
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
  }
  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

/** Clamp a caller-supplied timeout into a range the server is willing to honour. */
export function clampTimeout(value, { min = 5_000, max = 45_000, fallback = 30_000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

/**
 * /snapshot failure codes (site-watch C5; glossary in packages/db/migrations/0091_site_watch.sql). About the SITE,
 * not about us: a page that loads fine but is too big to screenshot is not a failure (see
 * SNAPSHOT_SKIP), and a renderer crash surfaces as an HTTP error, not as one of these.
 */
export const SNAPSHOT_FAILURE_CODES = ["timeout", "http_4xx", "http_5xx", "dns", "connect", "blocked", "navigation"];

/** Map a Playwright page.goto() error message to a failure code. */
export function classifyNavigationError(message) {
  const m = String(message || "");
  if (/Timeout \d+ms exceeded|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT/.test(m)) return "timeout";
  if (/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/.test(m)) return "dns";
  if (/ERR_BLOCKED_BY_CLIENT/.test(m)) return "blocked";
  if (/ERR_CONNECTION_(REFUSED|RESET|CLOSED|FAILED)|ERR_ADDRESS_UNREACHABLE|ERR_SSL_|ERR_CERT_|ERR_EMPTY_RESPONSE|ERR_TOO_MANY_REDIRECTS/.test(m)) {
    return "connect";
  }
  return "navigation";
}

/** HTTP status of the main document → failure code, or null when the page is up. */
export function classifyStatus(status) {
  const n = Number(status);
  if (!Number.isInteger(n) || n <= 0) return "navigation";
  if (n >= 500) return "http_5xx";
  if (n >= 400) return "http_4xx";
  return null;
}

/** Keep at most `max` entries of at most `len` chars — a noisy page must not bloat the response. */
export function pushCapped(list, text, max = 20, len = 300) {
  if (list.length < max) list.push(String(text ?? "").slice(0, len));
}

/**
 * The URL a snapshot reports back: no query string or fragment. Query strings are where tracking
 * and session tokens live, and this value is stored and shown in the ops console (C12).
 */
export function publicUrlOnly(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "";
  }
}

/**
 * The User-Agent: the browser's own (it already says HeadlessChrome — nothing is disguised) plus the
 * same bot identity the crawler presents, so a site's robots.txt and its logs see who is asking.
 * Pretending to be a person's browser would be evading detection, which this service never does.
 */
export function honestUserAgent(browserUa) {
  const id = "AwareWaveCollector/1.0 (+https://aware-wave.com/bot)";
  return browserUa && !browserUa.includes("AwareWaveCollector") ? `${browserUa} ${id}` : browserUa || id;
}
