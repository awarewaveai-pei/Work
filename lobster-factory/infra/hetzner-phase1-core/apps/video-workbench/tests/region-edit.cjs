// 圖片局部編輯器 (scripts/tools-region.js, backend/image-edit.cjs):
// 1. /capabilities imageEdit = next-admin's catalog fill rows (image-models.js modelsFor("fill")), each priced by the
//    charge's function (provider-cost.cjs fillUsd); a size no row states is not offered.
// 2. The page shows every model's NT$ price from that function, cheapest first; the button price follows the model.
// 3. Missing-prompt guard: a box without an instruction and no 整體指令 shows the red line and sends nothing.
// 4. An old draft (selection.regions + values.regionQuality, no model) opens with its boxes and prompts; an old job's
//    settings run the default row; a model outside the catalog is refused before any call.
// 5. Each vendor gets the mask in its own form and only the boxes change: the server pastes them onto the original.
// Usage: node tests/region-edit.cjs [screenshot.png]
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const ffmpeg = require("ffmpeg-static"), { chromium } = require("playwright");
const { createServer } = require("../server.cjs"), costs = require("../backend/provider-cost.cjs");
const catalog = require("../../next-admin/public/editor-shared/image-models.js"), { MEDIA_MODELS } = require("../../next-admin/lib/ai/cost-model.ts");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-region-"));
const ff = (args) => { const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], { windowsHide: true, maxBuffer: 1 << 22 }); assert.equal(r.status, 0, String(r.stderr)); return r.stdout; };
const pngOf = (color, size) => { const file = path.join(dir, color + size + ".png"); ff(["-f", "lavfi", "-i", `color=c=${color}:s=${size}`, "-frames:v", "1", file]); return fs.readFileSync(file); };
// Gray / RGB of an image's left and right halves (scaled to 2x1).
const halves = (buffer, fmt = "rgb24") => {
  const file = path.join(dir, "probe-" + Math.random().toString(36).slice(2) + ".png");
  fs.writeFileSync(file, buffer);
  const raw = ff(["-i", file, "-vf", "scale=2:1:flags=area", "-f", "rawvideo", "-pix_fmt", fmt, "-"]), n = fmt === "gray" ? 1 : 3;
  return [[...raw.subarray(0, n)], [...raw.subarray(n, 2 * n)]];
};
const dataOf = (url) => Buffer.from(url.split(",")[1], "base64");
(async () => {
  const blue = pngOf("blue", "40x20"), red = pngOf("red", "64x36");
  // Mask = the region tool's: white keeps, transparent (left half) is the box.
  const maskFile = path.join(dir, "mask.png");
  ff(["-f", "lavfi", "-i", "color=c=white:s=40x20,format=rgba", "-vf", "geq=r=255:g=255:b=255:a='if(lt(X,20),0,255)'", "-frames:v", "1", maskFile]);
  const calls = [];
  let hang = false;
  const server = createServer({
    dataDir: dir,
    env: { OPENAI_API_KEY: "test-only", REPLICATE_API_TOKEN: "test-only" },
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: options.body });
      // hang = the next run stays "processing" until the job is cancelled (rule 2 of replicate-run.cjs).
      if (/^https:\/\/api\.replicate\.com\/v1\/(models\/.+\/)?predictions$/.test(url)) return Response.json(hang ? { id: "p-hang", status: "processing" } : { id: "p1", status: "succeeded", output: "https://replicate.delivery/x/out.png" });
      if (url === "https://api.replicate.com/v1/predictions/p-hang") return Response.json({ id: "p-hang", status: "processing" });
      if (url === "https://api.replicate.com/v1/predictions/p-hang/cancel") return Response.json({ id: "p-hang", status: "canceled" });
      if (url === "https://replicate.delivery/x/out.png") return new Response(red);
      if (url.endsWith("/images/edits")) return Response.json({ data: [{ b64_json: red.toString("base64") }], usage: { input_tokens: 900, input_tokens_details: { text_tokens: 100, image_tokens: 800 }, output_tokens: 1500 } });
      throw Error("unexpected call " + url);
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port, api = base + "/api/vw";
  const post = (route, body) => fetch(api + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const poll = async (job) => { for (let i = 0; i < 200 && !["succeeded", "failed"].includes(job.status); i++) { await new Promise((r) => setTimeout(r, 50)); job = await (await fetch(api + "/generations/" + job.id)).json(); } return job; };
  let browser;
  try {
    // 1. The catalog's fill rows, priced by the charge's function.
    const caps = await (await fetch(api + "/capabilities")).json(), rows = caps.imageEdit.models;
    assert.deepEqual(rows.map((m) => m.id), catalog.modelsFor("fill").map((m) => m.value), "the catalog's fill rows, cheapest first");
    assert(rows.length >= 6 && rows.every((m) => m.available), "every fill row is wired: " + rows.filter((m) => !m.available).map((m) => m.id));
    for (const m of rows) {
      assert.deepEqual(m.sizes, ["1K"]);
      assert.equal(m.prices["1K"].usd, costs.fillUsd(m.id), m.id + " = the charge's function");
      assert.equal(m.prices["1K"].usd, catalog.modelsFor("fill").find((r) => r.value === m.id).usd, m.id + " = the catalog price");
    }
    assert.equal(caps.imageEdit.defaultModel, "ideogram-4-5-edit-low", "cheapest row that needs no description");
    // The paid-job price check (api.cjs start): every fill row and the generator's image model have a price.
    for (const m of rows) costs.priceOf("fill", m.id);
    costs.priceOf("image", caps.models.image);
    assert.throws(() => costs.priceOf("fill", "gemini-nano-banana-2.1"), /尚無價目/);
    console.log("PASS /capabilities imageEdit: " + rows.length + " catalog fill rows, catalog prices, 1K");

    // 5. Each vendor's mask form; only the box changes; the charge.
    const image = { url: "data:image/png;base64," + blue.toString("base64") }, mask = "data:image/png;base64," + fs.readFileSync(maskFile).toString("base64");
    const settings = { imageLayout: "region-preserve", regionWidth: 40, regionHeight: 20 };
    const runRow = async (model) => {
      const from = calls.length;
      const job = await poll(await (await post("/generations", { type: "image", operation: "region", prompt: "區域 1：改紅", settings: { ...settings, model }, references: { images: [image] }, mask })).json());
      assert.equal(job.status, "succeeded", model + ": " + job.error);
      const [left, right] = halves(fs.readFileSync(path.join(dir, job.result.url.slice(1))));
      assert(left[0] > 200 && left[2] < 60, model + ": inside the box = the edit " + left);
      assert(right[2] > 200 && right[0] < 60, model + ": outside the box = the original " + right);
      assert.equal(job.result.origin.model, model);
      return { job, sent: calls.slice(from) };
    };
    const ideo = await runRow("ideogram-4-5-edit-low"), ideoBody = JSON.parse(ideo.sent[0].body);
    assert.equal(ideoBody.version, MEDIA_MODELS["ideogram-ai/ideogram-4-5-precise-edit"].version);
    assert.equal(ideoBody.input.quality, "low");
    assert.deepEqual(halves(dataOf(ideoBody.input.mask), "gray").map((v) => v[0] > 127), [false, true], "ideogram: black = edit");
    assert.equal(ideo.job.result.origin.costUsd, 0.03);
    const fill = JSON.parse((await runRow("flux-fill-pro")).sent[0].body);
    assert.equal(fill.version, MEDIA_MODELS["black-forest-labs/flux-fill-pro"].version);
    assert.deepEqual(halves(dataOf(fill.input.mask), "gray").map((v) => v[0] > 127), [true, false], "flux fill: white = edit");
    const klein = await runRow("flux-2-klein-4b");
    assert.match(klein.sent[0].url, /\/models\/black-forest-labs\/flux-2-klein-4b\/predictions$/);
    assert.equal(JSON.parse(klein.sent[0].body).input.mask, undefined, "a row without a mask gets none");
    assert.equal(klein.job.result.origin.costUsd, costs.fillUsd("flux-2-klein-4b", { inputMp: 40 * 20 / 1e6, outputMp: 64 * 36 / 1e6 }));
    const gpt = await runRow("openai-26-edit"), form = gpt.sent[0].body;
    assert.equal(form.get("model"), "gpt-image-2.6-sunburst");
    assert(form.has("mask"));
    assert.equal(gpt.job.result.origin.costUsd, costs.imageUsd("gpt-image-2.6-sunburst", { input_tokens: 900, input_tokens_details: { text_tokens: 100, image_tokens: 800 }, output_tokens: 1500 }));
    console.log("PASS ideogram (black mask), flux fill (white mask), klein (no mask), gpt 2.6 (alpha mask): only the box changes; charged");

    // A job cancelled while its Replicate run is still processing cancels that run at Replicate (it would keep billing).
    hang = true;
    const hung = await (await post("/generations", { type: "image", operation: "region", prompt: "區域 1：改紅", settings: { ...settings, model: "ideogram-4-5-edit-low" }, references: { images: [image] }, mask })).json();
    for (let i = 0; i < 100 && !calls.some((c) => c.url.endsWith("/predictions/p-hang")); i++) await new Promise((r) => setTimeout(r, 50));
    await post("/generations/" + hung.id + "/cancel", {});
    for (let i = 0; i < 100 && !calls.some((c) => c.url.endsWith("/p-hang/cancel")); i++) await new Promise((r) => setTimeout(r, 50));
    assert(calls.some((c) => c.url === "https://api.replicate.com/v1/predictions/p-hang/cancel"), "the abandoned run is cancelled at Replicate");
    hang = false;
    console.log("PASS a job cancelled mid-poll cancels its Replicate run");

    // 4 (server). An old job's settings (no model, 2K) run the default row at 1K; a model outside the catalog is refused.
    const old = await poll(await (await post("/generations", { type: "image", operation: "region", prompt: "整張變亮", settings: { ...settings, quality: "2K" }, references: { images: [image] }, mask })).json());
    assert.equal(old.status, "succeeded", old.error);
    assert.deepEqual([old.input.settings.model, old.input.settings.quality], ["ideogram-4-5-edit-low", "1K"]);
    const before = calls.length, bad = await post("/generations", { type: "image", operation: "region", prompt: "x", settings: { ...settings, model: "gemini-nano-banana-2.1" }, references: { images: [image] }, mask });
    assert.equal(bad.status, 400);
    assert.equal(calls.length, before);
    console.log("PASS old job settings run the default at 1K; a model outside the catalog is refused");

    // 2 + 3 + 4 in the page.
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(base + "/pages/tools.html");
    await p.waitForFunction(() => typeof VideoWorkbench !== "undefined" && VideoWorkbench.storage);
    await p.evaluate(() => VideoWorkbench.storage.setItem("awarewave_app_tools_state", JSON.stringify({ region: {
      values: { regionPrompt: "", regionQuality: "4K" },
      files: { image: { name: "舊草稿.png", url: "/assets/test-image-1.png", type: "image/png" } },
      selection: { regions: [{ x: 0.08, y: 0.12, w: 0.3, h: 0.32, prompt: "花朵改為淺藍色" }, { x: 0.55, y: 0.5, w: 0.3, h: 0.3, prompt: "" }] },
    } })));
    await p.goto(base + "/pages/tools.html#region");
    await p.reload(); // a hash-only goto keeps the page: reload so the draft is read at boot
    await p.locator("#regionBoard img").waitFor();
    await p.waitForFunction(() => document.querySelectorAll(".region-selection").length === 2 && document.querySelector("#regionRatio")?.textContent !== "—");
    assert.deepEqual(await p.locator(".region-badge").allTextContents(), ["1", "2"]);
    assert.deepEqual(await p.locator(".region-summary").allTextContents(), ["花朵改為淺藍色", "尚未填寫指令"]);
    assert.equal(await p.locator("#regionCount").textContent(), "2/8");
    assert.equal((await p.locator(".side h3 .region-of").textContent()).trim(), "1/1");
    assert.match(await p.locator("#regionRatio").textContent(), /^\d+:\d+$/);
    assert.match(await p.locator("#regionMissing").textContent(), /還有 1 個區域沒有填寫指令/);
    assert.deepEqual(await p.locator('[aria-label="解析度"] button').allTextContents(), ["1K"], "the draft's 4K shows as the 1K every row makes");
    // Every model button: its NT$ from the charge's function through the one money format, cheapest first.
    const money = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/models.js"), "utf8"), { window: money, crypto: globalThis.crypto });
    const nt = (id) => "約 " + money.VideoWorkbenchMoney(costs.fillUsd(id), caps) + "／張";
    const byPrice = [...rows].sort((a, b) => costs.fillUsd(a.id) - costs.fillUsd(b.id));
    assert.deepEqual(await p.locator('[aria-label="模型"] button').allTextContents(), byPrice.map((m) => `${m.label} · ${nt(m.id)}`), "NT$ from the charge's function, cheapest first");
    assert.match(await p.locator('[aria-label="模型"] .selected').textContent(), /Ideogram 4\.5 Edit（省）/);
    const submit = p.locator("[data-act=submit]");
    await p.waitForFunction((t) => document.querySelector("[data-act=submit]").textContent.includes(t), nt("ideogram-4-5-edit-low"));
    console.log("PASS old draft opens: 2 numbered boxes, rows, 2/8, 1/1, ratio, red missing line; NT$ on every model, cheapest first");

    const posts = calls.length;
    await submit.click();
    await p.waitForTimeout(300);
    assert.equal(calls.length, posts, "nothing sent while a box has no instruction");
    await p.getByRole("button", { name: /FLUX Fill Pro/ }).click();
    await p.waitForFunction((t) => document.querySelector("[data-act=submit]").textContent.includes(t), nt("flux-fill-pro"));
    console.log("PASS missing-prompt guard; the generate button's NT$ follows the model");

    // Draw a third box: its instruction opens next to it.
    const img = await p.locator("#regionBoard img").boundingBox();
    await p.mouse.move(img.x + img.width * 0.62, img.y + img.height * 0.1);
    await p.mouse.down();
    await p.mouse.move(img.x + img.width * 0.9, img.y + img.height * 0.35, { steps: 5 });
    await p.mouse.up();
    const pop = p.locator(".region-popover textarea");
    assert.equal(await pop.getAttribute("placeholder"), "描述你想在區域 3 中修改的內容");
    await pop.fill("加一隻小鳥");
    assert.equal(await p.locator("[data-region-counter]").textContent(), "5/5000");
    await p.locator("[data-region-done]").click();
    assert.equal(await p.locator(".region-popover").count(), 0);
    assert.equal(await p.locator("#regionCount").textContent(), "3/8");
    await p.locator(".region-row").nth(1).click();
    await p.locator(".region-popover textarea").fill("把車改成紅色");
    await p.locator("[data-region-done]").click();
    assert.equal(await p.locator("#regionMissing").isHidden(), true, "every box has an instruction: no red line");
    if (process.argv[2]) await p.screenshot({ path: process.argv[2], fullPage: true });
    await submit.click();
    await p.waitForFunction(() => document.querySelector(".job-view"));
    // The page's job reaches FLUX Fill Pro with all three instructions.
    const isFill = (c) => /\/predictions$/.test(c.url) && JSON.parse(c.body).version === MEDIA_MODELS["black-forest-labs/flux-fill-pro"].version;
    for (let i = 0; i < 100 && calls.slice(posts).filter(isFill).length < 1; i++) await p.waitForTimeout(100);
    const text = JSON.parse(calls.slice(posts).filter(isFill).at(-1).body).input.prompt;
    assert.match(text, /區域 1.*花朵改為淺藍色/);
    assert.match(text, /區域 2.*把車改成紅色/);
    assert.match(text, /區域 3.*加一隻小鳥/);
    assert.deepEqual(errors, []);
    console.log("PASS draw a box -> popover, 5000 counter, 完成, then the job carries all three instructions");
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
