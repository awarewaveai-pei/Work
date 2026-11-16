// R26: every AI video in an org's /generated/ gets the media store's own thumbnail, <uuid>.thumb.jpg -- recorded after settle for
// a new job (result.thumbUrl), on first read for an old one, once per video, never across orgs, and a video that cannot
// give one is not retried per request.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
// Counted before the server loads: media-store takes run / inspectMedia when it is required.
const media = require("../backend/media.cjs"), inspect = require("../backend/media-inspect.cjs");
let thumbRuns = 0, probes = 0;
const run = media.run, inspectMedia = inspect.inspectMedia;
media.run = (args, signal) => (args.includes("-frames:v") && thumbRuns++, run(args, signal));
inspect.inspectMedia = (file, signal) => (probes++, inspectMedia(file, signal));
const { createServer } = require("../server.cjs");
const { sign } = require("../backend/session-signature.cjs");
const TOKEN = "internal-secret", A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

function request(port, method, pathname, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks) }));
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
const jpeg = (r) => r.status === 200 && r.type === "image/jpeg" && r.body[0] === 0xff && r.body[1] === 0xd8;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-r26-")), clip = path.join(dir, "clip.mp4");
  const made = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", clip], { windowsHide: true });
  assert.equal(made.status, 0, made.stderr?.toString().slice(-400));
  const local = await listen({ dataDir: path.join(dir, "local"), env: {} });
  const proxy = await listen({ dataDir: path.join(dir, "proxy"), env: { VW_TRUST_PROXY_IDENTITY: "1", VW_INTERNAL_TOKEN: TOKEN, VW_ALLOWED_HOSTS: "127.0.0.1:*" } });
  const signed = (org) => {
    const f = { userId: "u-" + org.slice(0, 4), orgId: org, billingOrgId: "", userKind: "staff", role: "owner", expires: String(Math.floor(Date.now() / 1000) + 120) };
    return { "X-VW-User-Id": f.userId, "X-VW-Org-Id": f.orgId, "X-VW-Billing-Org-Id": f.billingOrgId, "X-VW-User-Kind": f.userKind, "X-VW-Role": f.role, "X-VW-Expires": f.expires, "X-VW-Signature": sign(TOKEN, f) };
  };
  const old = (root, id = crypto.randomUUID(), bytes = fs.readFileSync(clip)) => {
    fs.mkdirSync(path.join(root, "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, "generated", id + ".mp4"), bytes);
    return id;
  };
  try {
    // 1. A new job: the result the browser first sees already carries thumbUrl, and that file is a JPEG.
    {
      const post = async (route, body) => {
        const r = await request(local.port, "POST", "/api/vw" + route, { "Content-Type": "application/json" }, JSON.stringify(body));
        assert.equal(r.status < 300, true, r.body.toString());
        return JSON.parse(r.body);
      };
      const source = await post("/uploads", { name: "source.mp4", data: "data:video/mp4;base64," + fs.readFileSync(clip).toString("base64") });
      let job = await post("/generations", { type: "video", operation: "edit", references: { src: source }, settings: { trimStart: 0, trimEnd: 1.5 } });
      for (let i = 0; i < 200 && !["succeeded", "failed"].includes(job.status); i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = JSON.parse((await request(local.port, "GET", "/api/vw/generations/" + job.id)).body);
      }
      assert.equal(job.status, "succeeded", job.error);
      assert.match(job.result.url, /^\/generated\/[0-9a-f-]{36}\.mp4$/);
      // The url the card derives (shared/assets-ui.js mediaFile) answers at once; settle then records it as thumbUrl.
      const derived = job.result.url.replace(/\.mp4$/, ".thumb.jpg");
      assert(jpeg(await request(local.port, "GET", derived)));
      for (let i = 0; i < 100 && !job.result.thumbUrl; i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = JSON.parse((await request(local.port, "GET", "/api/vw/generations/" + job.id)).body);
      }
      assert.equal(job.result.thumbUrl, derived);
      console.log("PASS 新生成的影片：推得出的縮圖網址立刻是 JPEG，結果隨後記下同一個 thumbUrl");
    }
    // 2. An old video (no thumbnail yet): made on the first read, sent as a file on the second; five at once make one.
    {
      const id = old(path.join(dir, "local")), url = "/generated/" + id + ".thumb.jpg", before = thumbRuns;
      const first = await request(local.port, "GET", url);
      assert(jpeg(first));
      assert.equal(thumbRuns, before + 1);
      assert(jpeg(await request(local.port, "GET", url)));
      assert.equal(thumbRuns, before + 1, "second read must not run ffmpeg");
      const many = old(path.join(dir, "local")), runs = thumbRuns;
      const answers = await Promise.all(Array.from({ length: 5 }, () => request(local.port, "GET", "/generated/" + many + ".thumb.jpg")));
      assert(answers.every(jpeg));
      assert.equal(thumbRuns, runs + 1, "five concurrent reads must make one thumbnail");
      console.log("PASS 舊影片第一次讀到時產生縮圖、第二次直接送檔；同時 5 個請求只產 1 次");
    }
    // 3. A broken video answers 404 and is not probed again on the next request.
    {
      const id = old(path.join(dir, "local"), undefined, Buffer.from("not a video")), url = "/generated/" + id + ".thumb.jpg";
      assert.equal((await request(local.port, "GET", url)).status, 404);
      const seen = probes + thumbRuns;
      assert.equal((await request(local.port, "GET", url)).status, 404);
      assert.equal(probes + thumbRuns, seen, "a failed video must not be retried per request");
      console.log("PASS 壞掉的影片回 404，第二次請求不再跑 ffprobe／ffmpeg");
    }
    // 4. Org scope and names: org B cannot read or cause org A's thumbnail; made-up names are 404 and make nothing.
    {
      const orgA = path.join(dir, "proxy", "orgs", A), id = old(orgA), url = "/generated/" + id + ".thumb.jpg", runs = thumbRuns;
      assert.equal((await request(proxy.port, "GET", url)).status, 401);
      assert.equal((await request(proxy.port, "GET", url, signed(B))).status, 404);
      assert.equal(fs.existsSync(path.join(orgA, "generated", id + ".thumb.jpg")), false);
      assert.equal(thumbRuns, runs);
      assert(jpeg(await request(proxy.port, "GET", url, signed(A))));
      for (const bad of [
        "/generated/" + id.toUpperCase() + ".thumb.jpg", "/generated/" + id + ".THUMB.jpg", "/generated/" + id.slice(1) + ".thumb.jpg",
        "/generated/..%2f" + id + ".thumb.jpg", "/generated/../orgs/" + A + "/generated/" + id + ".thumb.jpg",
        "/generated/" + crypto.randomUUID() + ".thumb.jpg", "/generated/" + id + ".thumb.tmp-x.jpg",
      ])
        assert.equal((await request(proxy.port, "GET", bad, signed(B))).status, 404, bad);
      assert.equal(thumbRuns, runs + 1);
      console.log("PASS 組織範圍：未登入 401、別的組織 404 且不會替 A 產縮圖；亂造檔名一律 404");
    }
  } finally {
    for (const s of [local, proxy]) {
      s.server.closeAllConnections();
      await new Promise((r) => s.server.close(r));
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
