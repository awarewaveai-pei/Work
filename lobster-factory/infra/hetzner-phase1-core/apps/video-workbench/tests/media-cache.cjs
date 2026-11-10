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
const read = async (cache, url, headers = {}) => {
  const waits = [];
  const response = await cache.respond(new Request(url, { headers }), (p) => waits.push(p));
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
  console.log("media-cache ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
