// One download per opened design (DesignsGallery 改邊緣). Invariant: the same design, opened once, crosses the network
// once; every brush / strength change reuses the local blob: URL. 2026-11-15: applyEdgeStyle fetched
// bucketDownloadHref(original) on every brush click and that route answers `no-store` (5362617a4 swapped the 5-minute
// proxy-image for the download route), so five brushes = five 3.9 MB downloads through the EU host.
// The blob: URL is accepted by applyEdgeMask(sourceUrl) (public/editor-shared/edge-mask.js) like any same-origin URL.
// Test: lib/studio/__tests__/original-image-cache.test.ts.

export interface OriginalImageCache {
  /** blob: URL of the original for `key` (one network fetch per key; concurrent callers share the in-flight fetch). */
  get(key: string, href: string): Promise<string>;
  /** Revoke the held blob: URL and forget the key (close the editor, unmount). */
  release(): void;
}

export interface OriginalImageCacheDeps {
  fetch?: (href: string) => Promise<{ ok: boolean; status: number; blob(): Promise<Blob> }>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

export function createOriginalImageCache(deps: OriginalImageCacheDeps = {}): OriginalImageCache {
  const doFetch = deps.fetch ?? ((href: string) => fetch(href));
  const create = deps.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const revoke = deps.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
  let key: string | null = null;
  let pending: Promise<string> | null = null;
  let url: string | null = null;
  // Every get() that starts a download and every release() is a new generation: a download that finishes under
  // another generation (switched design, or closed and reopened the same design while it was in flight -- Codex
  // 2026-11-15) revokes its own URL instead of overwriting the live one.
  let gen = 0;

  const release = () => {
    gen++;
    if (url) revoke(url);
    url = null;
    key = null;
    pending = null;
  };

  return {
    get(k, href) {
      if (k === key && pending) return pending;
      release();
      key = k;
      const mine = ++gen;
      const p = (async () => {
        const res = await doFetch(href);
        if (!res.ok) throw new Error(`原圖下載失敗（HTTP ${res.status}）`);
        const u = create(await res.blob());
        if (mine !== gen) {
          revoke(u);
          throw new Error("original_replaced");
        }
        url = u;
        return u;
      })();
      pending = p;
      // a failed download is not cached: the next brush click fetches again
      p.catch(() => { if (pending === p) pending = null; });
      return p;
    },
    release,
  };
}
