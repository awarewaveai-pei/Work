/**
 * The hosts a Replicate prediction's output is downloaded from (SSRF guard): ONE list for every reader in next-admin and in
 * video-workbench (backend/replicate-run.cjs requires this file; awarewave-files.txt bundles it). https only, exact hosts.
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
