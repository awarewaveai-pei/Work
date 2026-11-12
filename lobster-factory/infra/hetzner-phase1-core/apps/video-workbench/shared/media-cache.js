// Browser copy of media bytes (card: R2 正本＋瀏覽器副本). Loaded by scripts/media-cache-sw.js (importScripts) and by
// tests/media-cache.cjs (require). Invariants:
// 1. The key is the file's immutable identity, never the full url: /media/<sha256>/<name> is content-addressed and
//    /generated/<uuid>.<ext> is written once, so origin, query string (a signature) and hash are ignored.
// 2. A copy only speeds things up: any store failure, a missing entry or an unreadable body falls back to the network.
// 3. Every entry id starts with the identity scope (user + org, from GET /api/vw/identity); a read under scope B can
//    never name scope A's entry, even when the wipe that runs on a scope change failed.
// 4. Total size is capped; the least recently used entries go first.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VwMediaCache = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MEDIA = /^\/media\/([a-f0-9]{64})\/((?:original|proxy|preview720)\.[a-z0-9]{2,5}|thumb\.jpg|waveform\.json|probe\.json)$/,
    GENERATED = /^\/generated\/([a-f0-9-]{36}\.[a-z0-9]{2,5})$/,
    GB = 1024 * 1024 * 1024,
    TEE_MAX = 256 * 1024 * 1024;

  // Immutable identity of a same-origin media url, or null (not cached).
  function identityKey(url, origin) {
    let u;
    try {
      u = new URL(url, origin);
    } catch {
      return null;
    }
    if (u.origin !== origin) return null;
    const media = MEDIA.exec(u.pathname);
    if (media) return "media/" + media[1] + "/" + media[2];
    const generated = GENERATED.exec(u.pathname);
    return generated ? "generated/" + generated[1] : null;
  }
  const entryId = (scope, key) => scope + "\n" + key;

  // RFC 7233 single range. null = no Range header, false = unsatisfiable.
  function parseRange(header, size) {
    if (!header) return null;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!m || (!m[1] && !m[2])) return false;
    let start, end;
    if (!m[1]) {
      const suffix = Number(m[2]);
      if (!suffix) return false;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    }
    return start <= end && start < size ? { start, end } : false;
  }

  function fromRecord(record, rangeHeader) {
    const size = record.blob.size,
      headers = { "Content-Type": record.type || "application/octet-stream", "Accept-Ranges": "bytes", "X-VW-Media-Cache": "hit" };
    const range = parseRange(rangeHeader, size);
    if (range === false) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    if (!range) return new Response(record.blob, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
    return new Response(record.blob.slice(range.start, range.end + 1), {
      status: 206,
      headers: { ...headers, "Content-Length": String(range.end - range.start + 1), "Content-Range": `bytes ${range.start}-${range.end}/${size}` },
    });
  }

  // store: get(id) / put(record) / touch(id, time) / remove(id) / list() -> [{ id, size, lastUsed }] /
  //        removeOtherScopes(scope) / clear() / getScope() / setScope(scope). Any of them may throw or reject.
  // limits(): { maxBytes, entryMaxBytes } (async; the service worker reads the browser quota).
  // checkIdentity(): promise of an identity result (see identify). A copy is never served on an identity confirmed more
  // than maxAgeMs ago: a sign-out the worker cannot see (client-side router, another host) ends copies within that time.
  function createMediaCache({ store, fetchImpl, origin, limits, checkIdentity = null, maxAgeMs = 60000, now = () => Date.now() }) {
    let scopeReady = Promise.resolve().then(() => store.getScope()).catch(() => null),
      checkedAt = -Infinity,
      tail = Promise.resolve();
    const fills = new Map();
    const serial = (work) => (tail = tail.then(work, work).catch(() => {}));
    const quiet = (promise) => Promise.resolve(promise).catch(() => null);

    // Identity check result: a scope string, null (unknown: copies are neither read nor written) or "logout".
    // A new scope deletes every other scope's entries (invariant 3 housekeeping; the entry id is the guard).
    function identify(result) {
      checkedAt = now();
      scopeReady = Promise.resolve(result)
        .catch(() => null)
        .then(async (scope) => {
          if (scope === "logout") {
            await quiet(store.clear());
            await quiet(store.setScope(null));
            return null;
          }
          if (typeof scope !== "string" || !scope) return null;
          const before = await quiet(store.getScope());
          if (before !== scope) {
            await quiet(store.removeOtherScopes(scope));
            await quiet(store.setScope(scope));
          }
          return scope;
        });
      return scopeReady;
    }

    async function evict(maxBytes) {
      const rows = (await store.list()).sort((a, b) => a.lastUsed - b.lastUsed);
      let total = rows.reduce((sum, r) => sum + r.size, 0);
      for (const row of rows) {
        if (total <= maxBytes) break;
        await store.remove(row.id);
        total -= row.size;
      }
    }

    // Saves a full 200 body when the identity is still the one the request started under.
    function save(scope, key, response) {
      return serial(async () => {
        const { maxBytes, entryMaxBytes } = await limits();
        const declared = Number(response.headers.get("content-length"));
        if (declared > entryMaxBytes) return;
        const blob = await response.blob();
        // A cut-short body (page left, network dropped) is never stored as the file.
        if (blob.size > entryMaxBytes || (declared && blob.size !== declared) || (await scopeReady) !== scope) return;
        const record = { id: entryId(scope, key), scope, key, type: response.headers.get("content-type") || "", size: blob.size, lastUsed: now(), blob };
        try {
          await store.put(record);
        } catch {
          await evict(maxBytes / 2); // quota full: make room once, then give up quietly
          await store.put(record);
        }
        await evict(maxBytes);
      });
    }

    // A ranged miss (a <video> element) is answered from the network; the full file is fetched once in the background.
    function fill(scope, key, url) {
      const id = entryId(scope, key);
      if (fills.has(id)) return fills.get(id);
      const job = (async () => {
        const { entryMaxBytes } = await limits();
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const response = await fetchImpl(url, { credentials: "same-origin", ...(controller ? { signal: controller.signal } : {}) });
        if (response.status !== 200 || Number(response.headers.get("content-length")) > entryMaxBytes) {
          controller?.abort();
          return;
        }
        await save(scope, key, response);
      })()
        .catch(() => {})
        .finally(() => fills.delete(id));
      fills.set(id, job);
      return job;
    }

    // true when the request is a media read this cache answers (the service worker calls respondWith only then).
    function handles(request) {
      return request.method === "GET" && !!identityKey(request.url, origin);
    }
    // background(promise) keeps the worker alive for saves (FetchEvent.waitUntil).
    async function respond(request, background = () => {}) {
      const key = identityKey(request.url, origin),
        rangeHeader = request.headers.get("range");
      if (key && checkIdentity && now() - checkedAt > maxAgeMs) identify(checkIdentity()); // one check per burst of reads
      const scope = await scopeReady;
      if (!key || !scope) return fetchImpl(request);
      const id = entryId(scope, key);
      let record = null;
      try {
        record = await store.get(id);
        // An evicted or unreadable body must not reach the page as a broken response.
        if (record && !(record.blob && record.blob.size === record.size && (await record.blob.slice(0, 1).arrayBuffer()))) {
          await quiet(store.remove(id));
          record = null;
        }
      } catch {
        record = null;
      }
      if (record) {
        background(quiet(store.touch(id, now())));
        return fromRecord(record, rangeHeader);
      }
      const response = await fetchImpl(request);
      if (response.status === 401) background(identify("logout"));
      else if (!rangeHeader && response.status === 200) background(save(scope, key, response.clone()));
      else if (rangeHeader && (response.status === 206 || response.status === 200)) {
        const teed = await teeWholeFile(scope, key, response, background);
        if (teed) return teed;
        background(fill(scope, key, request.url));
      }
      return response;
    }

    // A <video>'s first request is "bytes=0-": the 206 answer is the whole file, so one download feeds both the page and
    // the copy. Capped at TEE_MAX: tee() buffers whatever the slower side has not read yet in memory.
    async function teeWholeFile(scope, key, response, background) {
      const id = entryId(scope, key),
        m = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || ""),
        size = m && Number(m[1]) + 1 === Number(m[2]) ? Number(m[2]) : 0;
      if (response.status !== 206 || !size || !response.body || fills.has(id)) return null;
      const { entryMaxBytes } = await limits().catch(() => ({ entryMaxBytes: 0 }));
      if (size > Math.min(entryMaxBytes, TEE_MAX)) return null;
      const [page, copy] = response.body.tee();
      const headers = { "Content-Type": response.headers.get("content-type") || "", "Content-Length": String(size) };
      const job = save(scope, key, new Response(copy, { status: 200, headers })).finally(() => fills.delete(id));
      fills.set(id, job);
      background(job);
      return new Response(page, { status: 206, statusText: response.statusText, headers: response.headers });
    }

    return { handles, respond, identify, flush: () => Promise.all([tail, ...fills.values()]) };
  }

  // Budget: 2 GB or half of the browser's quota for this origin, whichever is smaller; one file at most a quarter of it.
  function budget(estimate) {
    const quota = Number(estimate && estimate.quota) || 0,
      maxBytes = quota > 0 ? Math.min(2 * GB, Math.floor(quota / 2)) : 2 * GB;
    return { maxBytes, entryMaxBytes: Math.floor(maxBytes / 4) };
  }

  return { identityKey, entryId, parseRange, budget, createMediaCache };
});
