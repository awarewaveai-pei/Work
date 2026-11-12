// Edge-cacheable static files (backend/static-version.cjs): container pages carry ?v=<build> on every local script/stylesheet,
// a static file asked for with the current build is `immutable`, an older build's is 404, anything else (missing ?v=, HTML, config.js,
// /awarewave/*, the service worker, local start.cmd mode) stays no-store. Invariant: a cached URL names the bytes it holds.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { createServer } = require("../server.cjs");
const sv = require("../backend/static-version.cjs");
const root = path.join(__dirname, "..");

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pathname }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, cc: res.headers["cache-control"], body: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}
async function listen(options) {
  const server = createServer(options);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}

(async () => {
  // Build id follows content: same tree = same id, one changed byte = new id.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vw-static-version-"));
  fs.mkdirSync(path.join(tmp, "shared"));
  fs.writeFileSync(path.join(tmp, "shared", "a.js"), "1");
  const id1 = sv.buildId(tmp);
  assert.equal(sv.buildId(tmp), id1, "same files, same build");
  fs.writeFileSync(path.join(tmp, "shared", "a.js"), "2");
  assert.notEqual(sv.buildId(tmp), id1, "a changed file changes the build");
  fs.rmSync(tmp, { recursive: true, force: true });

  const html = sv.versionHtml('<html lang="x"><link rel="stylesheet" href="../styles/a.css" /><link rel="icon" href="x.png"><link href="b.css" rel="stylesheet">' +
    '<script src="../shared/b.js"></script><script src="https://cdn.example/x.js"></script><script src="c.js?x=1"></script><script>inline()</script>', "abc");
  assert.match(html, /<html data-vw-build="abc" lang="x">/);
  assert.match(html, /href="\.\.\/styles\/a\.css\?v=abc"/, "stylesheet versioned");
  assert.match(html, /href="b\.css\?v=abc" rel="stylesheet"/, "rel after href still versioned");
  assert.match(html, /href="x\.png"/, "non-stylesheet link untouched");
  assert.match(html, /src="\.\.\/shared\/b\.js\?v=abc"/);
  assert.match(html, /src="https:\/\/cdn\.example\/x\.js"/, "other origins untouched");
  assert.match(html, /src="c\.js\?x=1"/, "URLs that already carry a query untouched");

  const build = sv.buildId(root);
  const proxy = await listen({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "vw-sv-p-")), env: { VW_TRUST_PROXY_IDENTITY: "1", VW_INTERNAL_TOKEN: "t", VW_CONFIG_MODE: "http" } });
  const local = await listen({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "vw-sv-l-")), env: {} });
  try {
    for (const page of ["/index.html", ...fs.readdirSync(path.join(root, "pages")).filter((f) => f.endsWith(".html")).map((f) => "/pages/" + f)]) {
      const r = await get(proxy.port, page);
      assert.equal(r.status, 200, page);
      assert.equal(r.cc, "no-store", page + " HTML is never cached");
      assert(r.body.includes(`data-vw-build="${build}"`), page + " carries the build");
      // Every local script/stylesheet is versioned and, asked for that way, comes back immutable.
      const refs = [...r.body.matchAll(/<(?:script\b[^>]*\ssrc|link\b[^>]*\srel="stylesheet"[^>]*\shref)="([^"]+)"/gi)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));
      assert(refs.length, page + " has local refs");
      for (const ref of refs) {
        assert(ref.endsWith("?v=" + build), `${page}: ${ref} is versioned`);
        const url = new URL(ref, "http://x" + page);
        const res = await get(proxy.port, url.pathname + url.search);
        assert.equal(res.status, 200, url.pathname);
        assert.equal(res.cc, url.pathname === "/config.js" ? "no-store" : "public, max-age=31536000, immutable", url.pathname);
      }
    }
    const stale = await get(proxy.port, "/shared/runtime.js?v=0000000000000000");
    assert.deepEqual([stale.status, stale.cc], [404, "no-store"], "an older build's file is refused, never served as this build's bytes");
    assert.equal((await get(proxy.port, "/shared/runtime.js")).cc, "no-store", "no build is not cached");
    assert.equal((await get(proxy.port, "/scripts/media-cache-sw.js?v=" + build)).cc, "no-store", "service worker keeps its own update check");
    assert.equal((await get(proxy.port, "/awarewave/theme.css?v=" + build)).cc, "no-store", "saved theme stays live");
    assert.equal((await get(proxy.port, "/pages/tools.html?v=" + build)).cc, "no-store");

    const l = await get(local.port, "/pages/tools.html");
    assert.equal(l.cc, "no-store");
    assert(!l.body.includes("data-vw-build") && !l.body.includes("?v="), "local start.cmd: files may change while running, nothing versioned");
    assert.equal((await get(local.port, "/shared/runtime.js?v=" + build)).cc, "no-store");
  } finally {
    proxy.server.close();
    local.server.close();
  }
  console.log("static-version ok");
})().catch((e) => { console.error(e); process.exit(1); });
