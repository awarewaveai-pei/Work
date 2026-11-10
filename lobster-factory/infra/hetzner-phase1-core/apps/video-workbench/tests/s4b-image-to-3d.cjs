// Card S4b.1 (docs/s4-image-to-3d-providers-20261103.md §7): one image -> 3D button over three ways, price shown first.
// (1) each way with a fake vendor reply: one job id = one vendor call (Stability sync GLB, Replicate TRELLIS prediction,
//     local SF3D process = a fake WSL entry script); a cancelled TRELLIS job's prediction is resumed by the next job, not re-sent;
//     a job that already called the vendor never calls again.
// (2) the page shows every way with its TOOL_RATES price and repeats the picked way's price on the 產生 button.
// No real vendor call: fetchImpl is fake; the browser only renders the panel (no 3D viewer).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const imageTo3d = require("../backend/image-to-3d.cjs");

let passed = 0;
const pass = (label) => (passed++, console.log("PASS " + label));
// Smallest file the media store accepts as GLB 2.0: magic, version 2, total length.
const GLB = Buffer.alloc(20);
GLB.write("glTF", 0, "latin1");
GLB.writeUInt32LE(2, 4);
GLB.writeUInt32LE(20, 8);
const png = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "test-image-1.png")).toString("base64");

// Fake local SF3D: an entry script WSL runs in place of scripts/sf3d/run-wsl.sh (same arguments: <image> <out>); it
// counts its runs and writes <out>/0/mesh.glb. Needs WSL (Ubuntu), as the real way does; skipped without it.
const wsl = process.platform === "win32" && require("node:child_process").spawnSync("wsl.exe", ["-d", "Ubuntu", "--", "true"]).status === 0;
const sf3dDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-s4b-sf3d-"));
fs.writeFileSync(path.join(sf3dDir, "entry.sh"), `#!/usr/bin/env bash\nset -e\necho 1 >> "$(dirname "$0")/runs.txt"\nmkdir -p "$2/0"\necho ${GLB.toString("base64")} | base64 -d > "$2/0/mesh.glb"\n`);

(async () => {
  const calls = [];
  const predictions = {}; // id -> status; a POST starts one "processing", cancel marks it "canceled"
  const fetchImpl = async (url, init = {}) => {
    calls.push((init.method || "GET") + " " + url);
    if (url === "https://api.stability.ai/v2beta/3d/stable-point-aware-3d") {
      assert.ok(init.body instanceof FormData && init.body.get("image") && init.body.get("texture_resolution") === "1024");
      return new Response(GLB, { status: 200, headers: { "content-type": "model/gltf-binary" } });
    }
    if (url === "https://api.stability.ai/v2beta/3d/stable-fast-3d")
      return new Response(JSON.stringify({ id: "e1", name: "bad_request", errors: ["image: too small"] }), { status: 400 });
    if (url === "https://api.replicate.com/v1/predictions" && init.method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(body.version, imageTo3d.TRELLIS.version);
      assert.equal(body.input.generate_model, true);
      const id = "p" + (Object.keys(predictions).length + 1);
      predictions[id] = "processing";
      return new Response(JSON.stringify({ id, status: "starting" }), { status: 201 });
    }
    if (/^https:\/\/api\.replicate\.com\/v1\/predictions\/p\d+$/.test(url)) {
      const id = url.split("/").pop(), status = predictions[id];
      return new Response(JSON.stringify({ id, status, output: status === "succeeded" ? { model_file: "https://replicate.delivery/x/model.glb" } : null, metrics: status === "succeeded" ? { predict_time: 20 } : {} }), { status: 200 });
    }
    if (/\/v1\/predictions\/p\d+\/cancel$/.test(url)) {
      const id = url.split("/").at(-2);
      setTimeout(() => (predictions[id] = "canceled"), 300); // Replicate takes a moment to stop a prediction
      return new Response("{}", { status: 200 });
    }
    if (url === "https://replicate.delivery/x/model.glb") return new Response(GLB, { status: 200 });
    throw Error("unexpected provider call " + url);
  };
  const env = { STABILITY_API_KEY: "stability-test-only", REPLICATE_API_TOKEN: "replicate-test-only", ...(wsl ? { VW_SF3D_WSL: "Ubuntu", VW_SF3D_ENTRY: path.join(sf3dDir, "entry.sh") } : {}), VW_3D_POLL_MS: "30" };
  const { base, dataDir } = await isolatedServer("vw-s4b-", { fetchImpl, env });
  const call = async (route, data, method = "POST", ok = true) => {
    const r = await fetch(base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const v = await r.json();
    if (ok) assert(r.ok, JSON.stringify(v));
    return v;
  };
  const until = async (id, done) => {
    for (let i = 0; i < 400; i++) {
      const v = await call("/generations/" + id, undefined, "GET");
      if (done(v)) return v;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("job never reached the expected state: " + id);
  };
  const image = await call("/uploads", { name: "cup.png", data: png });
  const job = (method) => call("/generations", { type: "model", operation: "image-to-3d", prompt: "圖片轉 3D", references: { image: { url: image.url, id: "img" } }, settings: { method } });
  const ended = (v) => ["succeeded", "failed", "cancelled"].includes(v.status);
  const count = (call) => calls.filter((c) => c === call).length;

  // (1) Stability: one POST, the GLB becomes a model asset priced from TOOL_RATES; a refused request is not re-sent.
  {
    const done = await until((await job("stability-spar3d")).id, ended);
    assert.equal(done.status, "succeeded", done.error);
    assert.equal(count("POST https://api.stability.ai/v2beta/3d/stable-point-aware-3d"), 1);
    assert.deepEqual([done.result.kind, done.result.origin.provider, done.result.origin.costUsd, done.vendorCall.method], ["model", "Stability AI", 0.04, "stability-spar3d"]);
    const failed = await until((await job("stability-sf3d")).id, ended);
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /Stability 回應 400：bad_request：image: too small/);
    assert.equal(count("POST https://api.stability.ai/v2beta/3d/stable-fast-3d"), 1);
    pass("Stability：一個任務一次 POST，GLB 入素材庫、成本 0.04（TOOL_RATES）；400 失敗不重送");
  }
  // TRELLIS: one prediction per job. A cancelled job's prediction is cancelled at Replicate, so the next job sends its own;
  // an earlier prediction still running (job failed or server restarted) is resumed without a new POST.
  {
    const a = await job("replicate-trellis");
    await until(a.id, (v) => v.vendorTaskId === "p1");
    await call("/generations/" + a.id + "/cancel");
    const b = await job("replicate-trellis"); // at once: p1 still reports "processing" (Codex 2026-11-10 #3)
    await until(b.id, (v) => v.vendorTaskId === "p2");
    predictions.p2 = "succeeded";
    const done = await until(b.id, ended);
    assert.equal(done.status, "succeeded", done.error);
    assert.equal(count("POST https://api.replicate.com/v1/predictions"), 2, "one POST per job");
    assert.equal(count("POST https://api.replicate.com/v1/predictions/p1/cancel"), 1);
    assert.deepEqual([done.result.origin.provider, done.result.origin.taskId, done.result.origin.costUsd], ["Replicate", "p2", 0.028], "20 s x US$0.0014 (metrics.predict_time)");
    predictions.p3 = "processing";
    setTimeout(() => (predictions.p3 = "succeeded"), 100);
    const resumed = { id: "r", input: { operation: "image-to-3d", references: { image: { url: image.url, id: "img" } }, settings: { method: "replicate-trellis" } } };
    const { localFile } = { localFile: (u) => (u === image.url ? path.join(dataDir, u.slice(1)) : null) };
    const result = await imageTo3d.run(resumed, { env, fetchImpl, localFile, persist() {}, resumeId: "p3", mediaStore: { ingest: async () => ({ url: "/media/x/original.glb" }) }, onProgress() {} });
    assert.equal(count("POST https://api.replicate.com/v1/predictions"), 2, "resumed p3: no new POST");
    assert.deepEqual([result.origin.taskId, resumed.vendorCall], ["p3", undefined]);
    pass("TRELLIS：每個任務一次 POST；取消 → Replicate cancel，立刻重送的新任務不接正在取消的 p1、自己送；仍在跑的舊預測被沿用，零次 POST；成本＝實際秒數×0.0014（20 秒 → 0.028）");
  }
  // Local SF3D (through WSL): one process run, free.
  if (!wsl) console.log("SKIP local SF3D case: no WSL Ubuntu");
  else {
    const done = await until((await job("local-sf3d")).id, ended);
    assert.equal(done.status, "succeeded", done.error);
    assert.equal(fs.readFileSync(path.join(sf3dDir, "runs.txt"), "utf8").trim(), "1");
    assert.deepEqual([done.result.origin.provider, done.result.origin.costUsd], ["本機", 0]);
    pass("本機 SF3D（WSL）：獨立程序跑一次，輸出 GLB，免費");
  }
  // A job that already called the vendor never calls again (restart / double run).
  {
    const before = calls.length;
    const again = { id: "x", input: { operation: "image-to-3d", references: { image: { url: image.url } }, settings: { method: "stability-spar3d" } }, vendorCall: { method: "stability-spar3d" } };
    await assert.rejects(imageTo3d.run(again, { env, fetchImpl, localFile: () => null, persist() {} }), /已呼叫過廠商/);
    assert.equal(calls.length, before);
    pass("已呼叫過廠商的任務再跑 → 直接拒絕，零次呼叫");
  }

  // (2) prices on the page.
  const cap = await call("/capabilities", undefined, "GET");
  assert.deepEqual(cap.imageTo3d.methods.map((m) => [m.id, m.usd, m.available]), [["local-sf3d", 0, wsl], ["stability-spar3d", 0.04, true], ["stability-sf3d", 0.1, true], ["replicate-trellis", 0.038, true]], "free first (backend/providers.cjs); Meshy is not listed without its key");
  // Preselected = the first free way that can run here, else the first paid one.
  assert.equal(cap.imageTo3d.methods.find((m) => m.default)?.id, wsl ? "local-sf3d" : "stability-spar3d");
  // Connected to the main system every paid way needs a USD price: Meshy (credits only) is listed but unavailable.
  const meshy = imageTo3d.capability({ MESHY_API_KEY: "k" }, { priced: true }).methods.find((m) => m.id === "meshy");
  assert.deepEqual([meshy.available, meshy.reason], [false, "無美元價目"]);
  assert.equal(imageTo3d.capability({ MESHY_API_KEY: "k" }).methods.find((m) => m.id === "meshy").available, true);
  pass("連主系統時 Meshy（只有點數、無美元價目）顯示不可用「無美元價目」；本機模式可用");
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--force_high_performance_gpu"] });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#3d");
    await page.evaluate(async (stored) => VideoWorkbench.assets.save({ ...stored, name: "杯子.png", createdAt: new Date().toISOString() }), image);
    await page.goto(base + "/pages/tools.html?r=1#3d");
    const ways = page.locator("[data-t3-methods] button");
    await ways.first().waitFor();
    assert.deepEqual(await ways.allTextContents(), [wsl ? "本機 SF3D · 免費" : "本機 SF3D · 免費（未安裝）", "Stability SPAR3D · NT$1.28", "Stability SF3D · NT$3.20", "Replicate TRELLIS · 約 NT$1.22"]);
    const go = page.locator('[data-t3-action="i3"]');
    const preselected = wsl ? "local-sf3d" : "stability-spar3d"; // free first (backend/providers.cjs)
    assert.equal(await page.locator(`[data-t3-action="i3-method:${preselected}"]`).getAttribute("aria-pressed"), "true", preselected + " preselected");
    assert.equal(await go.isDisabled(), true, "no image yet");
    await page.locator('[data-t3-action="i3-method:replicate-trellis"]').click();
    await page.getByRole("button", { name: "圖片：杯子.png", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-t3-action="i3"]')?.textContent === "產生 3D 模型（約 NT$1.22）");
    assert.equal(await page.locator('[data-t3-action="i3"]').isDisabled(), false);
    pass("頁面：四種方式各自標價（含免費、約），免費的本機 SF3D 排第一且裝好時預設選它（否則 SPAR3D）；選 TRELLIS＋圖片後按鈕顯示「產生 3D 模型（約 NT$1.22）」（US$ × twdRate 32）");
  } finally {
    await browser.close();
  }
  console.log(`s4b-image-to-3d: ${passed} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
