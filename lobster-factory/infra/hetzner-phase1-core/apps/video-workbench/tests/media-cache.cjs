// Browser media copy (shared/media-cache.js): the card's two node tests.
// 1. Same file, new signed url: the second read is a hit with no network request; a deleted copy falls back to the
//    network with the same bytes.
// 2. Privacy guard: org B never reads org A's copy, even when the wipe on the identity change fails.
const assert = require("node:assert/strict");
const { createMediaCache, identityKey } = require("../shared/media-cache.js");
const ORIGIN = "https://video.aware-wave.com",
  SHA = "a".repeat(64),
  BASE = ORIGIN + "/media/" + SHA + "/original.mp4";

function memoryStore({ failWipe = false } = {}) {
  const rows = new Map();
  let scope = null;
  return {
    rows,
    get: async (id) => rows.get(id) || null,
    put: async (r) => void rows.set(r.id, r),
    touch: async (id, t) => rows.has(id) && (rows.get(id).lastUsed = t),
    remove: async (id) => void rows.delete(id),
    list: async () => [...rows.values()].map((r) => ({ id: r.id, size: r.size, lastUsed: r.lastUsed })),
    removeOtherScopes: async (keep) => {
      if (failWipe) throw Error("wipe failed");
      for (const [id, r] of rows) if (r.scope !== keep) rows.delete(id);
    },
    clear: async () => rows.clear(),
    getScope: async () => scope,
    setScope: async (s) => void (scope = s),
  };
}
// The server answers per organization (server.cjs serves orgs/<org>/media), like nginx + the session cookie.
function network(bodyFor) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
    const body = Buffer.from(bodyFor());
    return new Response(body, { status: 200, headers: { "Content-Type": "video/mp4", "Content-Length": String(body.length) } });
  };
  return { calls, fetchImpl };
}
const limits = async () => ({ maxBytes: 1e6, entryMaxBytes: 5e5 });
const read = async (cache, url, headers = {}, context) => {
  const waits = [];
  const response = await cache.respond(new Request(url, { headers }), (p) => waits.push(p), context);
  const text = await response.text();
  await Promise.all(waits);
  await cache.flush();
  return { status: response.status, text, hit: response.headers.get("x-vw-media-cache") === "hit", range: response.headers.get("content-range") };
};

(async () => {
  // Identity key: origin-relative path only; signatures and other hosts do not change / do not get one.
  assert.equal(identityKey(BASE + "?X-Amz-Signature=1", ORIGIN), "media/" + SHA + "/original.mp4");
  assert.equal(identityKey(BASE + "?X-Amz-Signature=2#t=3", ORIGIN), "media/" + SHA + "/original.mp4");
  assert.equal(identityKey("https://cdn.example/media/" + SHA + "/original.mp4", ORIGIN), null);
  assert.equal(identityKey(ORIGIN + "/api/vw/state", ORIGIN), null);

  // --- Test 1: new signed url still hits; deleted copy falls back to the network.
  {
    const store = memoryStore(), net = network(() => "0123456789-video-bytes");
    const cache = createMediaCache({ store, fetchImpl: net.fetchImpl, origin: ORIGIN, limits });
    await cache.identify("scope-A");
    const first = await read(cache, BASE + "?sig=one");
    assert.equal(first.hit, false);
    assert.equal(net.calls.length, 1);
    const second = await read(cache, BASE + "?sig=two&expires=999");
    assert.equal(second.hit, true, "a new signature must hit the same copy");
    assert.equal(net.calls.length, 1, "a hit makes no network request");
    assert.equal(second.text, first.text);
    const ranged = await read(cache, BASE + "?sig=three", { Range: "bytes=2-5" });
    assert.deepEqual([ranged.status, ranged.text, ranged.range, net.calls.length], [206, "2345", "bytes 2-5/22", 1]);
    store.rows.clear(); // the browser evicted the copy
    const after = await read(cache, BASE + "?sig=four");
    assert.deepEqual([after.hit, after.text, net.calls.length], [false, first.text, 2], "missing copy = network, same bytes");
    // Storage that throws (private window, blocked site data): every read still works from the network.
    const broken = new Proxy(memoryStore(), { get: () => async () => { throw Error("storage blocked"); } });
    const fallback = createMediaCache({ store: broken, fetchImpl: net.fetchImpl, origin: ORIGIN, limits });
    await fallback.identify("scope-A");
    assert.equal((await read(fallback, BASE)).text, first.text);
    console.log("PASS 換簽名網址仍命中副本（網路請求 1 次）；副本刪掉或儲存壞掉退回網路，內容相同");
  }

  // --- Test 2 (privacy guard): org B cannot read org A's copy. The wipe is made to fail, so the entry id is the guard.
  {
    let org = "A";
    const store = memoryStore({ failWipe: true }), net = network(() => "bytes-of-org-" + org);
    const cache = createMediaCache({ store, fetchImpl: net.fetchImpl, origin: ORIGIN, limits });
    await cache.identify("scope-A");
    assert.equal((await read(cache, BASE)).text, "bytes-of-org-A");
    assert.equal((await read(cache, BASE)).hit, true);
    org = "B";
    await cache.identify("scope-B");
    const b = await read(cache, BASE);
    assert.equal(b.hit, false, "org B must not hit org A's copy");
    assert.equal(b.text, "bytes-of-org-B");
    assert.equal(net.calls.length, 2);
    console.log("PASS A 組織的副本，B 組織讀不到（清除失敗時也一樣）");
  }

  // A request owns its scope even while another request changes the worker's housekeeping scope.
  {
    const A = { scope: "scope-A", organizationId: "11111111-1111-4111-8111-111111111111" };
    const B = { scope: "scope-B", organizationId: "22222222-2222-4222-8222-222222222222" };
    const store = memoryStore({ failWipe: true });
    let cookieOrg = A.organizationId;
    const seen = [];
    const fetchImpl = async (input, init) => {
      const headers = typeof input === "string" ? new Headers(init?.headers) : input.headers;
      seen.push(headers.get("x-vw-org"));
      if (headers.get("x-vw-org") !== cookieOrg) return new Response(null, { status: 403 });
      return new Response(cookieOrg === A.organizationId ? "A bytes" : "B bytes");
    };
    const cache = createMediaCache({ store, fetchImpl, origin: ORIGIN, limits });
    await read(cache, BASE, {}, A);
    cookieOrg = B.organizationId;
    const firstB = await read(cache, BASE, {}, B);
    assert.deepEqual([firstB.hit, firstB.text], [false, "B bytes"]);
    let releaseA, enteredA;
    const entered = new Promise((resolve) => { enteredA = resolve; });
    const get = store.get;
    store.get = async (id) => {
      if (id.startsWith(A.scope)) {
        enteredA();
        await new Promise((resolve) => { releaseA = resolve; });
      }
      return get(id);
    };
    const pendingA = cache.respond(new Request(BASE), () => {}, A);
    await entered;
    const responseB = await cache.respond(new Request(BASE), () => {}, B);
    releaseA();
    const responseA = await pendingA;
    assert.deepEqual([await responseA.text(), await responseB.text()], ["A bytes", "B bytes"]);
    assert.equal((await read(cache, BASE, { "X-VW-Org": B.organizationId }, A)).status, 403,
      "an explicit request pin must not be silently replaced by another identity");
    // The cookie changes after identity resolution but before an uncached network read: the pinned request is denied.
    store.get = get;
    const changed = await read(cache, BASE.replace(SHA, "b".repeat(64)), {}, A);
    assert.equal(changed.status, 403);
    assert.equal(store.rows.size, 2, "a rejected media read must never populate a cache entry");
    assert.deepEqual(seen, [A.organizationId, B.organizationId, A.organizationId]);
    console.log("PASS 並發請求各自固定 scope；cookie 中途切換時固定 org 的網路讀取拒絕、不寫副本");
  }

  // A partial range needs a full background fill; both network requests retain the same organization pin.
  {
    const context = { scope: "scope-A", organizationId: "11111111-1111-4111-8111-111111111111" }, calls = [];
    const cache = createMediaCache({ store: memoryStore(), origin: ORIGIN, limits, fetchImpl: async (input, init) => {
      const headers = typeof input === "string" ? new Headers(init?.headers) : input.headers;
      calls.push([headers.get("x-vw-org"), headers.get("range")]);
      return headers.has("range")
        ? new Response("234", { status: 206, headers: { "Content-Range": "bytes 2-4/10" } })
        : new Response("0123456789");
    } });
    await read(cache, BASE, { Range: "bytes=2-4" }, context);
    assert.deepEqual(calls, [[context.organizationId, "bytes=2-4"], [context.organizationId, null]]);
    assert.equal((await read(cache, BASE, {}, context)).text, "0123456789");
    console.log("PASS Range 背景補檔保留 org header，清除 Range 後完整保存");
  }

  // Run the actual worker listener with a memory store: every hit revalidates identity, unknown identities fail closed,
  // and a MessageChannel handshake proves the controlling worker implements the pinned-context protocol.
  {
    const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
    const listeners = {}, store = memoryStore({ failWipe: true }), calls = [];
    const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
    let org = A, documentOrg = A, unavailable = false, signedOut = false, malformed = false, identityCalls = 0, deferredIdentities = null;
    const worker = {
      location: { origin: ORIGIN }, clients: { claim: async () => {}, get: async (id) => id === "page" ? {
        url: ORIGIN + "/video/projects",
        postMessage: (message, ports) => {
          assert.equal(message.type, "vw:document-organization");
          ports[0].postMessage({ organizationId: documentOrg });
        },
      } : id === "silent" ? { url: ORIGIN + "/video/projects", postMessage: () => {} } : null }, skipWaiting: async () => {},
      addEventListener: (type, handler) => { listeners[type] = handler; },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../scripts/media-cache-sw.js"), "utf8"), {
      self: worker, importScripts: () => {}, Request, Response, Headers, URL, AbortController, MessageChannel, setTimeout, clearTimeout,
      navigator: { storage: { estimate: async () => ({ quota: 1e6 }) } },
      VwMediaCache: { budget: () => ({ maxBytes: 1e6, entryMaxBytes: 5e5 }),
        createMediaCache: (options) => createMediaCache({ ...options, store }) },
      fetch: async (input, init) => {
        if (input === "/api/vw/identity") {
          identityCalls++;
          if (unavailable) throw Error("offline");
          if (signedOut) return new Response(null, { status: 401 });
          const body = { scope: "scope-" + org, ...(malformed ? {} : { organizationId: org }) };
          if (deferredIdentities) return new Promise((resolve) => deferredIdentities.push(() => resolve(Response.json(body))));
          return Response.json(body);
        }
        const headers = typeof input === "string" ? new Headers(init?.headers) : input.headers;
        calls.push(headers.get("x-vw-org"));
        return new Response(headers.get("x-vw-org") === org ? org : null,
          { status: headers.get("x-vw-org") === org ? 200 : 403 });
      },
    });
    const workerRead = async (clientId = "page") => {
      let response;
      const waits = [];
      listeners.fetch({ clientId, request: new Request(BASE), respondWith: (value) => { response = value; }, waitUntil: (p) => waits.push(p) });
      const result = await response;
      const body = await result.text();
      await Promise.all(waits);
      return { status: result.status, body, hit: result.headers.get("x-vw-media-cache") };
    };
    assert.equal((await workerRead()).body, A);
    assert.equal((await workerRead()).hit, "hit");
    org = B;
    assert.equal((await workerRead()).status, 403, "an old A document cannot follow the new B cookie");
    assert.equal((await workerRead("")).status, 503, "a remote media read needs an identified client");
    documentOrg = null;
    assert.equal((await workerRead()).status, 503, "a locked document cannot read media");
    documentOrg = B;
    const switched = await workerRead();
    assert.deepEqual([switched.body, switched.hit, identityCalls], [B, null, 6]);
    deferredIdentities = [];
    org = A;
    documentOrg = A;
    const oldRead = workerRead();
    org = B;
    documentOrg = B;
    const newRead = workerRead();
    assert.equal(deferredIdentities.length, 2);
    deferredIdentities[1](); // the newer B identity completes before the older A answer
    assert.equal((await newRead).body, B);
    deferredIdentities[0]();
    assert.equal((await oldRead).status, 403, "late A identity cannot override the B document's context");
    deferredIdentities = null;
    assert.equal((await workerRead("silent")).status, 503, "an old document without the protocol times out closed");
    unavailable = true;
    assert.equal((await workerRead()).status, 503, "offline identity must not reveal a cached body");
    unavailable = false;
    malformed = true;
    assert.equal((await workerRead()).status, 503, "remote identity without org is incompatible and fails closed");
    malformed = false;
    signedOut = true;
    assert.equal((await workerRead()).status, 401);
    assert.equal(store.rows.size, 0);
    assert.deepEqual(calls, [A, B]);
    let ack;
    listeners.message({ data: { type: "vw:media-context", version: 1 }, ports: [{ postMessage: (reply) => { ack = reply; } }] });
    assert.equal(JSON.stringify(ack), JSON.stringify({ type: "vw:media-context", version: 1, ok: true }));
    console.log("PASS 實際 worker 每次命中前查身份、切換隔離、離線/不相容/登出拒絕、版本握手");
  }

  // Logout and the size cap (LRU) -- invariants 3 and 4.
  {
    const store = memoryStore(), net = network(() => "x".repeat(400));
    let t = 0;
    const cache = createMediaCache({ store, fetchImpl: net.fetchImpl, origin: ORIGIN, limits: async () => ({ maxBytes: 1000, entryMaxBytes: 500 }), now: () => ++t });
    await cache.identify("scope-A");
    const url = (n) => ORIGIN + "/media/" + String(n).repeat(64) + "/original.mp4";
    await read(cache, url(1));
    await read(cache, url(2));
    await read(cache, url(1)); // 1 is now the most recently used
    await read(cache, url(3)); // 1200 bytes > 1000: 2 goes
    assert.deepEqual([...store.rows.keys()].map((k) => k.slice(-71, -70)).sort(), ["1", "3"]);
    await cache.identify("logout");
    assert.equal(store.rows.size, 0, "logout deletes every copy");
    assert.equal((await read(cache, url(1))).hit, false);
    assert.equal(store.rows.size, 0, "no identity = nothing written");
    console.log("PASS 登出清空；超過上限刪最久沒用的");
  }

  // A sign-out the worker never saw (client-side router, Codex finding 2026-11-10): after maxAgeMs the next read asks
  // the identity again; a 401 answer ("logout") means no copy is served.
  {
    let clock = 0, answer = "scope-A", asked = 0;
    const store = memoryStore(), net = network(() => "v");
    const cache = createMediaCache({ store, fetchImpl: net.fetchImpl, origin: ORIGIN, limits, now: () => clock,
      maxAgeMs: 60000, checkIdentity: async () => (asked++, answer) });
    await read(cache, BASE);
    assert.equal((await read(cache, BASE)).hit, true);
    assert.equal(asked, 1, "one identity check for a burst of reads");
    answer = "logout";
    clock = 61000;
    const after = await read(cache, BASE);
    assert.deepEqual([after.hit, asked, store.rows.size], [false, 2, 0], "stale identity is re-checked; signed out = no copy");
    console.log("PASS 身分超過 60 秒先重問；已登出就不給副本");
  }
  // A <video>'s first read ("bytes=0-", answered 206 with the whole file) downloads once: the page and the copy share it.
  {
    const body = Buffer.from("whole-video-file-bytes"), calls = [];
    const fetchImpl = async (input) => {
      calls.push(typeof input === "string" ? "fill" : input.headers.get("range"));
      return new Response(body, { status: 206, headers: { "Content-Type": "video/mp4", "Content-Length": String(body.length), "Content-Range": `bytes 0-${body.length - 1}/${body.length}` } });
    };
    const cache = createMediaCache({ store: memoryStore(), fetchImpl, origin: ORIGIN, limits });
    await cache.identify("scope-A");
    const first = await read(cache, BASE, { Range: "bytes=0-" });
    assert.deepEqual([first.status, first.text, first.hit], [206, body.toString(), false]);
    const again = await read(cache, BASE, { Range: "bytes=6-10" });
    assert.deepEqual([again.hit, again.text], [true, "video"]);
    assert.deepEqual(calls, ["bytes=0-"], "one network request, no background second download");
    console.log("PASS 影片第一次播放只下載一次，同一份同時存成副本");
  }
  // Kill switch (server.cjs): while <dataDir>/media-cache-off exists the worker url serves the retiring worker and config.js
  // stops new registrations; deleting the file restores both. One running server: no restart is needed either way.
  {
    const { createServer } = require("../server.cjs"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-media-cache-ks-")), flag = path.join(dataDir, "media-cache-off");
    const server = createServer({ dataDir, env: { VW_CONFIG_MODE: "http" } });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const get = async (url) => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${url}`);
      return { text: await r.text(), cache: r.headers.get("cache-control"), allowed: r.headers.get("service-worker-allowed") };
    };
    try {
      assert.match((await get("/scripts/media-cache-sw.js")).text, /importScripts/);
      assert.doesNotMatch((await get("/config.js")).text, /mediaCache/);
      fs.writeFileSync(flag, "");
      const off = await get("/scripts/media-cache-sw.js");
      assert.deepEqual([off.cache, off.allowed], ["no-store", "/"]);
      assert.match(off.text, /deleteDatabase\("vw-media-cache"\)/);
      assert.match(off.text, /registration\.unregister\(\)/);
      assert.doesNotMatch(off.text, /addEventListener\("fetch"/);
      assert.doesNotMatch(off.text, /onblocked/, "a blocked delete must not count as done (Codex 2026-11-14)");
      assert.match((await get("/config.js")).text, /mediaCache: false/);
      fs.rmSync(flag);
      assert.match((await get("/scripts/media-cache-sw.js")).text, /importScripts/, "deleting the file restores the real worker");
    } finally {
      server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    console.log("PASS 收回開關：資料目錄有 media-cache-off 時同一網址給退場 worker（刪副本、取消註冊、不攔請求）、頁面不再註冊；刪檔即恢復");
  }
  console.log("media-cache ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
