// The one canonicalisation function (ADR 011 §決策 2).
//
// "One document = one canonicalUrl + one contentHash + one canonical extraction." Two blocks
// producing different canonical forms for the same URL violates that directly, which is why blocks
// receive this through ctx and are never expected to write their own.
//
// Conservative on purpose: it removes things that provably do not change what a server returns
// (fragment, default port, tracking parameters, case of scheme/host) and touches nothing else.
// Stripping more — trailing slashes on paths, `index.html`, arbitrary query parameters — merges
// URLs that really can serve different documents, and a wrong merge is invisible: the second
// document simply never gets stored.

/** Parameters that identify a campaign or a click, never a document. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ga_/i,
  /^_ga$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^fbclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^igshid$/i,
  /^ref_src$/i,
  /^s_kwcid$/i,
  /^yclid$/i,
];

export function canonicalize(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl.trim(); // not a URL we can reason about — return it unchanged rather than guess
  }

  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    u.port = "";
  }

  const keep: Array<[string, string]> = [];
  u.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAMS.some((re) => re.test(key))) keep.push([key, value]);
  });
  // Sorted so that ?a=1&b=2 and ?b=2&a=1 are one document. Order never changes the response.
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);

  // A bare origin and the same origin with "/" are the same document; deeper paths are left alone.
  if (u.pathname === "") u.pathname = "/";

  return u.toString();
}

/** Whether a target is inside the crawl boundary its seed declared. */
export function inScope(uri: string, scope: { hosts: string[]; pathPrefix?: string }): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const hostOk = scope.hosts.some((h) => {
    const allowed = h.toLowerCase();
    // A subdomain of an allowed host is in scope; "evil-example.com" against "example.com" is not.
    return host === allowed || host.endsWith(`.${allowed}`);
  });
  if (!hostOk) return false;
  if (scope.pathPrefix && !u.pathname.startsWith(scope.pathPrefix)) return false;
  return true;
}
