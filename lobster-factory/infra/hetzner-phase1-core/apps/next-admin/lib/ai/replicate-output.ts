/**
 * The hosts a Replicate prediction's output is downloaded from (SSRF guard): ONE list for every reader in next-admin and in
 * video-workbench (backend/replicate-run.cjs requires this file; awarewave-files.txt bundles it). https only, exact hosts.
 * Downloads go through fetchReplicateOutput below, which applies the list to every redirect hop too.
 * - replicate.delivery and its subdomains: Replicate's file delivery (replicate.com/docs/topics/predictions/output-files).
 * - ai-gateway-outputs.<account>.r2.cloudflarestorage.com: seen 2026-11-14 as the `output` of our own succeeded prediction
 *   ctjyp7g701rzr0d1ty9brqqf4m (black-forest-labs/flux-2-klein-4b, official model by name) read from
 *   api.replicate.com/v1/predictions -- a presigned (X-Amz-*) URL. Pinned to that one bucket host, never *.cloudflarestorage.com:
 *   another account id is refused until it is seen the same way and added here.
 */
export const REPLICATE_OUTPUT_HOSTS: readonly string[] = [
  "replicate.delivery",
  "*.replicate.delivery",
  "ai-gateway-outputs.0d37909e38d3e99c29fa2cd343ac421a.r2.cloudflarestorage.com",
];

/** Redirect hops one output download may follow; each hop is re-checked against the list. */
export const MAX_OUTPUT_REDIRECTS = 3;
/** A refused output download: code = "output_url_not_allowed" (a hop off the list) or "output_redirects_exceeded". */
export class ReplicateOutputError extends Error {
  readonly code: "output_url_not_allowed" | "output_redirects_exceeded";
  constructor(code: "output_url_not_allowed" | "output_redirects_exceeded") {
    super(code);
    this.code = code;
  }
}

/**
 * The ONE way to download a Replicate output, in both apps. Invariant: every hop is on REPLICATE_OUTPUT_HOSTS -- redirects
 * are followed by hand (redirect "manual"), at most MAX_OUTPUT_REDIRECTS, each Location resolved and re-checked, so an
 * allowed host answering 302 to an internal address (169.254.169.254) is refused before that address is fetched.
 * (2026-11-15: fresh replicate.delivery outputs answered HEAD/GET 200 with no redirect.) `fetchOnce` = one plain request
 * (the caller's fetch, signal in init); the final response is returned as is -- the caller checks ok / size.
 */
export async function fetchReplicateOutput(
  url: unknown,
  fetchOnce: (url: string, init: RequestInit) => Promise<Response>,
  init: RequestInit = {},
): Promise<Response> {
  let current = url;
  for (let hop = 0; ; hop++) {
    if (!isReplicateOutputUrl(current)) throw new ReplicateOutputError("output_url_not_allowed");
    const res = await fetchOnce(current as string, { ...init, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    if (hop >= MAX_OUTPUT_REDIRECTS) throw new ReplicateOutputError("output_redirects_exceeded");
    current = new URL(location, current as string).toString();
  }
}

export function isReplicateOutputUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return REPLICATE_OUTPUT_HOSTS.some((h) => (h.startsWith("*.") ? host.endsWith(h.slice(1)) && host.length > h.length - 1 : host === h));
}
