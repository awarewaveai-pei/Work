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
