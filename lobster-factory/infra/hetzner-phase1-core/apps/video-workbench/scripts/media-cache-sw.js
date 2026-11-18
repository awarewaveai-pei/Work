// Service worker for the browser media copy (logic + invariants: shared/media-cache.js). Registered by shared/runtime.js
// with scope "/" (server.cjs sends Service-Worker-Allowed: / for this file). It answers only same-origin GET
// /media/<sha256>/... and /generated/<uuid>.<ext>; every other request (pages, API, engines, next-admin) is untouched.
// Every media read checks identity first and pins that request's cache scope and network org together. Cookie changes
// between that check and the network read are denied by the session gate instead of storing bytes under another org.
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
      request.onsuccess = () => {
        // A delete or upgrade elsewhere (the kill switch's retiring worker) must never be blocked by this connection.
        request.result.onversionchange = () => {
          request.result.close();
          opened = null;
        };
        resolve(request.result);
      };
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

const askIdentity = async () => {
  const response = await fetch("/api/vw/identity", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { status: response.status === 401 ? 401 : 503 };
  const context = await response.json();
  if (typeof context.scope !== "string" || !context.scope ||
      (context.scope !== "local" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.organizationId || "")))
    return { status: 503 };
  return { scope: context.scope, organizationId: context.organizationId };
};
const cache = VwMediaCache.createMediaCache({
  store,
  origin: self.location.origin,
  fetchImpl: (input, init) => fetch(input, init),
  limits: async () => VwMediaCache.budget(await navigator.storage?.estimate?.().catch(() => null)),
});
async function documentOrganization(clientId) {
  const client = clientId && await self.clients.get(clientId);
  if (!client || new URL(client.url).origin !== self.location.origin) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (organizationId) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(organizationId || null);
    };
    const timer = setTimeout(() => finish(null), 3000);
    channel.port1.onmessage = (event) => finish(event.data?.organizationId);
    try { client.postMessage({ type: "vw:document-organization" }, [channel.port2]); }
    catch { finish(null); }
  });
}
async function media(request, background, clientId) {
  let context;
  try { context = await askIdentity(); } catch { context = { status: 503 }; }
  if (context.status) {
    await cache.identify(context.status === 401 ? "logout" : null);
    return new Response(null, { status: context.status, headers: { "Cache-Control": "no-store" } });
  }
  if (context.scope !== "local") {
    let organizationId;
    try { organizationId = await documentOrganization(clientId); } catch { organizationId = null; }
    if (!organizationId || organizationId !== context.organizationId)
      return new Response(null, { status: organizationId ? 403 : 503, headers: { "Cache-Control": "no-store" } });
  }
  return cache.respond(request, background, context);
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
// Switching clients must first confirm that this protocol is implemented by the controlling worker.
self.addEventListener("message", (event) => {
  if (event.data?.type === "vw:media-context" && event.data.version === 1)
    event.ports?.[0]?.postMessage({ type: "vw:media-context", version: 1, ok: true });
});
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Sign-out pages, whether navigated to or fetched by a client-side router (next-admin LogoutButton: router.replace).
  if (/^\/(login|logout)(\/|$)/.test(url.pathname)) {
    event.waitUntil(cache.identify("logout"));
    return;
  }
  if (cache.handles(request)) event.respondWith(media(request, (p) => event.waitUntil(p), event.clientId));
});
