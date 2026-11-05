// P6 L1 guards: proxy identity (no X-VW-* headers = 401), per-org data (org B cannot read org A's files),
// VW_ALLOWED_HOSTS / VW_PUBLIC_ORIGIN, /healthz without identity, and local mode keeping the single data dir.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const { createServer } = require("../server.cjs");
const { sign } = require("../backend/session-signature.cjs");
const TOKEN = "internal-secret";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64"),
  bvh = Buffer.from("HIERARCHY\nROOT Hips\n{\n OFFSET 0 0 0\n CHANNELS 3 Xposition Yposition Zposition\n End Site\n {\n  OFFSET 0 1 0\n }\n}\nMOTION\nFrames: 1\nFrame Time: 0.033333\n0 0 0\n"),
  A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
function request(port, method, pathname, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
async function listen(options) {
  const server = createServer(options);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port };
}
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-tenancy-"));
  const proxy = await listen({ dataDir: path.join(dir, "proxy"), env: { VW_TRUST_PROXY_IDENTITY: "1", VW_INTERNAL_TOKEN: TOKEN, VW_ALLOWED_HOSTS: "video.aware-wave.com,127.0.0.1:*", VW_PUBLIC_ORIGIN: "https://video.aware-wave.com" } });
  const local = await listen({ dataDir: path.join(dir, "local"), env: {} });
  try {
    const signed = (org, over = {}) => {
      const f = { userId: "u-" + org.slice(0, 4), orgId: org, billingOrgId: "", userKind: "staff", role: "owner", expires: String(Math.floor(Date.now() / 1000) + 120), ...over };
      return { "X-VW-User-Id": f.userId, "X-VW-Org-Id": f.orgId, "X-VW-Billing-Org-Id": f.billingOrgId, "X-VW-User-Kind": f.userKind, "X-VW-Role": f.role, "X-VW-Expires": f.expires, "X-VW-Signature": sign(TOKEN, f) };
    };
    const as = (org, extra = {}) => ({ ...signed(org), ...extra });
    const upload = async (org, data, name) => {
      const res = await request(proxy.port, "POST", "/api/vw/uploads", as(org, { "Content-Type": "application/json" }), JSON.stringify({ data, name }));
      assert.equal(res.status, 201, res.body.toString());
      return JSON.parse(res.body).url;
    };

    const health = await request(proxy.port, "GET", "/healthz");
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);

    const image = await upload(A, "data:image/png;base64," + png.toString("base64"), "a.png");
    const motion = await upload(A, "data:application/x-bvh;base64," + bvh.toString("base64"), "a.bvh");
    assert.match(image, /^\/generated\//);
    assert.match(motion, /^\/media\/[a-f0-9]{64}\/original\.bvh$/);
    assert(fs.existsSync(path.join(dir, "proxy", "orgs", A, image.slice(1))), "org A 的檔案應存在 orgs/<A>/");

    for (const url of [image, motion]) {
      assert.equal((await request(proxy.port, "GET", url, as(A))).status, 200, "org A 讀自己的檔案");
      assert.equal((await request(proxy.port, "GET", url, as(B))).status, 404, "org B 不能讀 org A 的檔案");
    }
    for (const url of ["/api/vw/state", image, motion]) {
      assert.equal((await request(proxy.port, "GET", url)).status, 401, "缺身分 header = 401：" + url);
      assert.equal((await request(proxy.port, "GET", url, { "X-VW-User-Id": "u" })).status, 401, "缺 org header = 401");
      assert.equal((await request(proxy.port, "GET", url, as("../" + A))).status, 401, "org 非 UUID = 401");
    }

    // Signed identity only: forged headers from another container on the network are refused.
    const forged = { ...signed(A) };
    delete forged["X-VW-Signature"];
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", forged)).status, 401, "無簽章 = 401");
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", { ...signed(A), "X-VW-Signature": sign("wrong-token", { userId: "u-1111", orgId: A, billingOrgId: "", userKind: "staff", role: "owner", expires: signed(A)["X-VW-Expires"] }) })).status, 401, "錯 key 簽章 = 401");
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", { ...signed(A), "X-VW-Org-Id": B })).status, 401, "org 被改 = 401");
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", { ...signed(A), "X-VW-Role": "operator" })).status, 401, "role 被改 = 401");
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", signed(A, { expires: String(Math.floor(Date.now() / 1000) - 120) }))).status, 401, "簽章過期 = 401");
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", signed(A, { expires: String(Math.floor(Date.now() / 1000) - 10) }))).status, 200, "30 秒時鐘偏差內放行");

    assert.equal((await request(proxy.port, "GET", "/api/vw/state", as(A, { Host: "video.aware-wave.com", Origin: "https://video.aware-wave.com" }))).status, 200);
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", as(A, { Host: "video.aware-wave.com", Origin: "http://video.aware-wave.com" }))).status, 403, "Origin 須等於 VW_PUBLIC_ORIGIN");
    assert.equal((await request(proxy.port, "GET", "/api/vw/state", as(A, { Host: "evil.example" }))).status, 403, "Host 不在 VW_ALLOWED_HOSTS");

    // Local mode: no identity headers needed, data stays directly in dataDir, only localhost hosts.
    const res = await request(local.port, "POST", "/api/vw/uploads", { "Content-Type": "application/json" }, JSON.stringify({ data: "data:image/png;base64," + png.toString("base64") }));
    assert.equal(res.status, 201);
    const url = JSON.parse(res.body).url;
    assert(fs.existsSync(path.join(dir, "local", url.slice(1))));
    assert.equal((await request(local.port, "GET", url)).status, 200);
    assert.equal((await request(local.port, "GET", "/api/vw/state", { Host: "video.aware-wave.com" })).status, 403);
    console.log("PASS tenancy：缺身分 401、跨組織 404、Host/Origin 白名單、/healthz、本機模式不變");
  } finally {
    proxy.server.close();
    local.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
