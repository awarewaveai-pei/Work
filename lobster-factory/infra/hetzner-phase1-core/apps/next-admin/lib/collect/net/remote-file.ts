// One file a person pasted the URL of (a post's image or video; lib/content/postiz.ts passes it on to Postiz). It goes
// out through collect's fetcher like every outside call (R6): the address gate on every redirect hop, the connection
// pinned to the checked address, a byte ceiling. robots.txt is not asked: a person chose this one file.

import { createBudget } from "@/lib/collect/budget";
import { CollectFetchError, createCollectFetch } from "@/lib/collect/net/fetcher";
import type { Resolver } from "@/lib/collect/net/ssrf";

export interface RemoteFile {
  bytes: Uint8Array;
  contentType: string;
}

/** Why the file could not be fetched, safe to show whoever pasted the URL: never an internal host or error text. */
export class RemoteFileError extends Error {
  constructor(readonly reason: "refused" | "unreachable" | "not_found" | "too_large" | "wrong_type") {
    super(`remote file ${reason}`);
    this.name = "RemoteFileError";
  }
}

export async function fetchRemoteFile(
  url: string,
  opts: { maxBytes: number; timeoutMs: number; accept: (contentType: string) => boolean; log?: (msg: string) => void },
  deps: { resolver?: Resolver; transport?: typeof fetch } = {},
): Promise<RemoteFile> {
  if (!url.startsWith("https://")) throw new RemoteFileError("refused");
  const get = createCollectFetch({
    budget: createBudget({ fetches: 6 }),   // the file and up to five redirects
    robots: null,
    maxBytes: opts.maxBytes,                // a longer body comes back truncated (x-collect-truncated) = too large
    timeoutMs: opts.timeoutMs,
    deadlineMs: opts.timeoutMs + 5_000,
    log: opts.log,
    ...deps,
  });
  let res: Response;
  try {
    res = await get(url, { headers: { accept: "image/*,video/*;q=0.9,*/*;q=0.1" } });
  } catch (e) {
    if (e instanceof CollectFetchError) throw new RemoteFileError(e.kind === "blocked" ? "refused" : "unreachable");
    throw e;
  }
  if (!res.ok) throw new RemoteFileError(res.status === 404 || res.status === 410 ? "not_found" : "unreachable");
  if (res.headers.get("x-collect-truncated")) throw new RemoteFileError("too_large");
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!opts.accept(contentType)) throw new RemoteFileError("wrong_type");
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType };
}

/** A web page a person pasted, as plain text (scripts, styles and tags dropped), at most maxChars; same gate and errors. */
export async function fetchRemotePageText(
  url: string,
  opts: { maxBytes: number; timeoutMs: number; maxChars: number },
  deps: { resolver?: Resolver; transport?: typeof fetch } = {},
): Promise<string> {
  const { bytes } = await fetchRemoteFile(url, {
    maxBytes: opts.maxBytes, timeoutMs: opts.timeoutMs, accept: (t) => t.startsWith("text/") || t === "application/xhtml+xml",
  }, deps);
  return pageText(new TextDecoder().decode(bytes)).slice(0, opts.maxChars);
}

/** Tags, scripts and styles dropped in linear time: the page is the stranger's, and `<[^>]+>` or a lazy
 *  `<script[\s\S]*?</script>` over a body of unclosed `<` is quadratic (minutes of CPU at the 2 MB cap). */
export function pageText(html: string): string {
  const lower = html.replace(/[A-Z]/g, (c) => c.toLowerCase());   // ASCII only: indexes stay aligned with html
  let out = "";
  let i = 0;
  let s = -2;
  let t = -2;
  for (;;) {
    if (s !== -1 && s < i) s = lower.indexOf("<script", i);
    if (t !== -1 && t < i) t = lower.indexOf("<style", i);
    const start = s < 0 ? t : t < 0 ? s : Math.min(s, t);
    if (start < 0) { out += html.slice(i); break; }
    out += `${html.slice(i, start)} `;
    const close = lower.indexOf(start === s ? "</script" : "</style", start);
    const end = close < 0 ? -1 : lower.indexOf(">", close);
    if (end < 0) break;                                            // never closed: the rest is script
    i = end + 1;
  }
  return out.replace(/<[^<>]*>/g, " ").replace(/\s{2,}/g, " ").trim();
}
