// Service worker for the browser media copy (logic + invariants: shared/media-cache.js). Registered by shared/runtime.js
// with scope "/" (server.cjs sends Service-Worker-Allowed: / for this file). It answers only same-origin GET
// /media/<sha256>/... and /generated/<uuid>.<ext>; every other request (pages, API, engines, next-admin) is untouched.
// Identity: each workbench page navigation asks GET /api/vw/identity in parallel with the page; media reads wait for that
// answer, and an identity older than 60 s is asked again before a read. Any /login or /logout request or a 401 from a
// media read deletes every copy.
"use strict";
importScripts("/shared/media-cache.js");

const DB = "vw-media-cache", ENTRIES = "entries", META = "meta";
let opened = null;
function db() {
  if (!opened)
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(ENTRIES, { keyPath: "id" }).createIndex("scope", "scope");
        request.result.createObjectStore(META);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      opened = null; // private window / blocked storage: retried next time, the cache answers from the network meanwhile
      throw error;
    });
  return opened;
}
async function tx(name, mode, work) {
  const t = (await db()).transaction(name, mode), store = t.objectStore(name);
  return new Promise((resolve, reject) => {
    let result;
    Promise.resolve(work(store, (r) => (result = r))).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = t.onabort = () => reject(t.error || Error("indexeddb aborted"));
  });
}
const req = (r, set) => (r.onsuccess = () => set(r.result));
const store = {
  get: (id) => tx(ENTRIES, "readonly", (s, set) => req(s.get(id), set)),
  put: (record) => tx(ENTRIES, "readwrite", (s) => s.put(record)),
  touch: (id, time) =>
    tx(ENTRIES, "readwrite", (s) => {
      const r = s.get(id);
      r.onsuccess = () => r.result && s.put({ ...r.result, lastUsed: time });
    }),
  remove: (id) => tx(ENTRIES, "readwrite", (s) => s.delete(id)),
  list: () =>
    tx(ENTRIES, "readonly", (s, set) => {
      const rows = [], cursor = s.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return set(rows);
        rows.push({ id: c.value.id, size: c.value.size, lastUsed: c.value.lastUsed });
        c.continue();
      };
    }),
  removeOtherScopes: (scope) =>
    tx(ENTRIES, "readwrite", (s) => {
      const cursor = s.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if (c.value.scope !== scope) c.delete();
        c.continue();
      };
    }),
  clear: () => tx(ENTRIES, "readwrite", (s) => s.clear()),
  getScope: () => tx(META, "readonly", (s, set) => req(s.get("scope"), set)),
  setScope: (scope) => tx(META, "readwrite", (s) => s.put(scope, "scope")),
};

const askIdentity = () =>
  fetch("/api/vw/identity", { credentials: "same-origin", cache: "no-store" }).then(async (r) =>
    r.status === 401 ? "logout" : r.ok ? (await r.json()).scope : null,
  );
const cache = VwMediaCache.createMediaCache({
  store,
  checkIdentity: askIdentity,
  origin: self.location.origin,
  fetchImpl: (input, init) => fetch(input, init),
  limits: async () => VwMediaCache.budget(await navigator.storage?.estimate?.().catch(() => null)),
});
const identityNow = () => cache.identify(askIdentity());
const WORKBENCH_PAGE = /^\/(?:index\.html|pages\/[a-z0-9-]+\.html)?$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim().then(identityNow)));
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Sign-out pages, whether navigated to or fetched by a client-side router (next-admin LogoutButton: router.replace).
  if (/^\/(login|logout)(\/|$)/.test(url.pathname)) {
    event.waitUntil(cache.identify("logout"));
    return;
  }
  if (request.mode === "navigate") {
    if (request.destination === "document" && WORKBENCH_PAGE.test(url.pathname)) event.waitUntil(identityNow());
    return;
  }
  if (cache.handles(request)) event.respondWith(cache.respond(request, (p) => event.waitUntil(p)));
});
