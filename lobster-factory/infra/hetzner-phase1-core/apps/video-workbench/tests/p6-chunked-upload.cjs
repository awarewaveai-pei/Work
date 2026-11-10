// Card P6.20 acceptance (docs/p6-golive-plan-20261103.md "P6.20 大檔分段上傳"), connected mode against a fake next-admin:
// a >100 MB file uploaded in chunks is joined, has the same sha256 and lands in the library (and the main ledger);
// after an interruption the status lists what arrived and only the missing chunks are sent; another user's chunk,
// status or complete for the session is refused.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
const { createServer } = require("../server.cjs");
const ffmpeg = require("ffmpeg-static");

const ORG = "11111111-1111-4111-8111-111111111111", USER = "44444444-4444-4444-8444-444444444444",
  OTHER = "55555555-5555-4555-8555-555555555555", BASE = "http://next-admin.test:3000";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
function request(port, method, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p620-"));
  // 60 raw 720p UYVY frames = 110.6 MB: above the 100 MB single-request cap, and a real video the media store can probe.
  const source = path.join(dir, "big.mov");
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=25", "-frames:v", "60", "-c:v", "rawvideo", "-pix_fmt", "uyvy422", source]);
  const bytes = fs.readFileSync(source);
  assert(bytes.length > 100 * 1024 * 1024, "合成檔要大於 100 MB：" + bytes.length);

  const ledger = [];
  async function fetchImpl(url, options = {}) {
    url = String(url);
    if (url === BASE + "/api/internal/video/workbench/assets") {
      const got = Buffer.from(await new Response(options.body).arrayBuffer());
      ledger.push(sha(got));
      return Response.json({ ok: true, existing: false, assetId: "aaaaaaaa-0000-4000-8000-000000000001", checksumSha256: sha(got), objectUrl: "https://cdn.test/a", qa: {} }, { status: 201 });
    }
    throw Error("unexpected " + url);
  }
  const env = { VW_TRUST_PROXY_IDENTITY: "1", VW_ALLOWED_HOSTS: "127.0.0.1:*", VW_INTERNAL_BASE: BASE + "/", VW_INTERNAL_TOKEN: "internal-secret" };
  const dataDir = path.join(dir, "data");
  const server = createServer({ dataDir, env, fetchImpl });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const who = (user, extra) => {
    const h = { "X-VW-User-Id": user, "X-VW-Org-Id": ORG, "X-VW-Billing-Org-Id": ORG, "X-VW-User-Kind": "staff", "X-VW-Role": "owner", "X-VW-Expires": String(Math.floor(Date.now() / 1000) + 300), ...extra };
    return { ...h, "X-VW-Signature": require("../backend/session-signature.cjs").sign("internal-secret", { userId: h["X-VW-User-Id"], orgId: h["X-VW-Org-Id"], billingOrgId: h["X-VW-Billing-Org-Id"], userKind: h["X-VW-User-Kind"], role: h["X-VW-Role"], expires: h["X-VW-Expires"] }) };
  };
  const api = (user, method, route, value) =>
    request(port, method, "/api/vw" + route, who(user, value === undefined ? {} : { "Content-Type": "application/json" }), value === undefined ? undefined : JSON.stringify(value));
  const sent = [];
  const sendChunk = (user, id, index, chunkBytes) => {
    const piece = bytes.subarray(index * chunkBytes, Math.min(bytes.length, (index + 1) * chunkBytes));
    if (user === USER) sent.push(index);
    return request(port, "POST", `/api/vw/uploads/sessions/${id}/chunks/${index}`, who(user, { "Content-Type": "application/octet-stream", "X-VW-Chunk-Sha256": sha(piece) }), piece);
  };
  try {
    const created = await api(USER, "POST", "/uploads/sessions", { size: bytes.length, type: "video/quicktime" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id, chunkBytes, chunks } = created.body;
    assert(chunkBytes < 100 * 1024 * 1024 && chunks >= 2, JSON.stringify(created.body));

    // Interrupted after the first half: the status lists exactly what arrived.
    const half = Math.floor(chunks / 2);
    for (let i = 0; i < half; i++) assert.equal((await sendChunk(USER, id, i, chunkBytes)).status, 200);
    const status = await api(USER, "GET", "/uploads/sessions/" + id);
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.deepEqual(status.body.received, [...Array(half).keys()]);
    // ...with each chunk's sha256, so a resuming page skips a chunk only when its own bytes match.
    assert.deepEqual(status.body.hashes, status.body.received.map((i) => sha(bytes.subarray(i * chunkBytes, (i + 1) * chunkBytes))));
    const early = await api(USER, "POST", `/uploads/sessions/${id}/complete`, { name: "big.mov" });
    assert.equal(early.status, 409, "缺段時不能完成：" + JSON.stringify(early.body));

    // Another user of the same organization: chunk, status and complete are all refused, and nothing is stored.
    const foreign = await sendChunk(OTHER, id, half, chunkBytes);
    assert.equal(foreign.status, 404, "別人的段要被拒：" + JSON.stringify(foreign.body));
    assert.equal((await api(OTHER, "GET", "/uploads/sessions/" + id)).status, 404);
    assert.equal((await api(OTHER, "POST", `/uploads/sessions/${id}/complete`, { name: "x" })).status, 404);
    assert.deepEqual((await api(USER, "GET", "/uploads/sessions/" + id)).body.received, [...Array(half).keys()]);

    // Resume: only the missing chunks are sent.
    for (const i of [...Array(chunks).keys()].filter((i) => !status.body.received.includes(i)))
      assert.equal((await sendChunk(USER, id, i, chunkBytes)).status, 200);
    assert.deepEqual(sent, [...Array(chunks).keys()], "每段只送一次");

    const done = await api(USER, "POST", `/uploads/sessions/${id}/complete`, { name: "big.mov", rightsConfirmed: true });
    assert.equal(done.status, 201, JSON.stringify(done.body));
    const asset = done.body;
    assert.equal(asset.checksum_sha256, sha(bytes), "組裝後 sha256 要和原檔相同");
    assert.deepEqual(ledger, [sha(bytes)], "登記到主系統的位元組要和原檔相同");
    assert.equal(asset.kind, "video");
    assert.equal(asset.size, bytes.length);
    assert.equal(asset.assetId, "aaaaaaaa-0000-4000-8000-000000000001");
    const stored = path.join(dataDir, "orgs", ORG, asset.url.slice(1));
    assert.equal(sha(fs.readFileSync(stored)), sha(bytes), "素材庫裡的原檔 sha256 要相同");
    assert.equal(fs.readdirSync(path.join(dataDir, "orgs", ORG, "uploads")).length, 0, "完成後分段要清掉");
    assert.equal((await api(USER, "GET", "/uploads/sessions/" + id)).status, 404, "完成後 session 結束");
    console.log("p6-chunked-upload ok:", bytes.length, "bytes in", chunks, "chunks");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
