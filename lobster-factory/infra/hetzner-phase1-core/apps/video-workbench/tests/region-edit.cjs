// 圖片局部編輯器 (scripts/tools-region.js, backend/image-edit.cjs), card 2026-11-13:
// 1. /capabilities imageEdit = the one model list, each row's sizes and its price per size (provider-cost.cjs imageEditUsd).
// 2. The button price follows model x resolution; a size the model lacks is not offered.
// 3. Missing-prompt guard: a box without an instruction and no 整體指令 shows the red line and sends nothing.
// 4. An old draft (selection.regions + values.regionQuality, no model) opens with its boxes and prompts.
// 5. A model without a mask (Gemini) changes only the boxes: the server pastes them back onto the original.
// Usage: node tests/region-edit.cjs [screenshot.png]
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const ffmpeg = require("ffmpeg-static"), { chromium } = require("playwright");
const { createServer } = require("../server.cjs"), costs = require("../backend/provider-cost.cjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-region-"));
const pngOf = (color, size) => {
  const file = path.join(dir, color + size + ".png");
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", `color=c=${color}:s=${size}`, "-frames:v", "1", file], { windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
  return fs.readFileSync(file);
};
// RGB of an image's left and right halves (scaled to 2x1).
const halves = (file) => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-vf", "scale=2:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { windowsHide: true, maxBuffer: 1 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  return [[...r.stdout.subarray(0, 3)], [...r.stdout.subarray(3, 6)]];
};
(async () => {
  const blue = pngOf("blue", "40x20"), red = pngOf("red", "64x36");
  // Mask = the region tool's: white keeps, transparent (left half) is the box.
  const maskFile = path.join(dir, "mask.png");
  assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=white@1:s=40x20,format=rgba", "-vf", "geq=r=255:g=255:b=255:a='if(lt(X,20),0,255)'", "-frames:v", "1", maskFile], { windowsHide: true }).status, 0);
  const calls = [];
  const usage = { total_input_tokens: 300, total_output_tokens: 1937, total_thought_tokens: 654, output_tokens_by_modality: [{ modality: "image", tokens: 1680 }] };
  const server = createServer({
    dataDir: dir,
    env: { OPENAI_API_KEY: "test-only", GEMINI_API_KEY: "test-only" },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: options.body });
      if (url.endsWith("/v1beta/interactions")) return Response.json({ steps: [{ content: [{ type: "image", mime_type: "image/png", data: red.toString("base64") }] }], usage });
      if (url.endsWith("/images/edits")) return Response.json({ data: [{ b64_json: red.toString("base64") }] });
      throw Error("unexpected call " + url);
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port, api = base + "/api/vw";
  const post = (route, body) => fetch(api + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const poll = async (job) => { for (let i = 0; i < 200 && !["succeeded", "failed"].includes(job.status); i++) { await new Promise((r) => setTimeout(r, 50)); job = await (await fetch(api + "/generations/" + job.id)).json(); } return job; };
  let browser;
  try {
    // 1. The model list and its prices.
    const caps = await (await fetch(api + "/capabilities")).json();
    const rows = caps.imageEdit.models;
    assert.deepEqual(rows.map((m) => m.id), ["gpt-image-2.5-flare", "gpt-image-2.6-sunburst", "gemini-nano-banana-2.1"]);
    assert.equal(caps.imageEdit.defaultModel, "gpt-image-2.5-flare", "the env default stays the default");
    for (const m of rows) {
      assert.deepEqual(Object.keys(m.prices), m.sizes, m.id + ": one price per offered size");
      for (const s of m.sizes) assert.equal(m.prices[s].usd, costs.imageEditUsd(m.id, s), m.id + " " + s + " = the charge's function");
    }
    assert.deepEqual(rows.find((m) => m.vendor === "OpenAI").sizes, ["1K"], "OpenAI per-size cost is unpublished: 1K only");
    assert.deepEqual(rows.find((m) => m.vendor === "Google").sizes, ["1K", "2K", "4K"]);
    console.log("PASS /capabilities imageEdit: 3 models, sizes, price per size from cost-model");

    // 2. Price follows model x resolution (shared/paid-price.js, the function every button uses).
    const window = { VideoWorkbenchMoney: (usd) => "NT$" + (usd * caps.twdRate).toFixed(2) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/paid-price.js"), "utf8"), { window });
    const price = (model, size) => window.VideoWorkbenchPrices.text("video.image", caps, model, size);
    const g = ["1K", "2K", "4K"].map((s) => price("gemini-nano-banana-2.1", s));
    assert.equal(new Set(g).size, 3, "each Gemini size has its own price: " + g);
    assert.notEqual(price("gpt-image-2.5-flare", "1K"), g[0]);
    assert.equal(price("gpt-image-2.5-flare", "4K"), price("gpt-image-2.5-flare", "1K"), "a size OpenAI lacks prices as the one it runs");
    console.log("PASS price follows model x resolution: " + g.join(" / "));

    // 5. Gemini: only the box changes; charged from the reply's usage; origin names the model.
    const image = { url: "data:image/png;base64," + blue.toString("base64") }, mask = "data:image/png;base64," + fs.readFileSync(maskFile).toString("base64");
    const settings = { imageLayout: "region-preserve", regionWidth: 40, regionHeight: 20, model: "gemini-nano-banana-2.1", quality: "1K" };
    const job = await poll(await (await post("/generations", { type: "image", operation: "region", prompt: "區域 1：改紅", settings, references: { images: [image] }, mask })).json());
    assert.equal(job.status, "succeeded", job.error);
    const sent = JSON.parse(calls.find((c) => c.url.endsWith("/interactions")).body);
    assert.equal(sent.model, "gemini-nano-banana-2.1");
    assert.deepEqual(sent.response_format, { type: "image", aspect_ratio: "16:9", image_size: "1K" });
    const [left, right] = halves(path.join(dir, job.result.url.slice(1)));
    assert(left[0] > 200 && left[2] < 60, "inside the box = the edit: " + left);
    assert(right[2] > 200 && right[0] < 60, "outside the box = the original: " + right);
    assert.deepEqual([job.result.width, job.result.height], [1024, 512]);
    assert.equal(job.result.origin.model, "gemini-nano-banana-2.1");
    assert.equal(job.result.origin.costUsd, costs.imageEditUsd("gemini-nano-banana-2.1", "1K", usage));
    console.log("PASS Gemini edit pasted back inside the box only; charged from usage");

    // 4 (server side). An old job's settings (no model, 2K) run the default model at the size it can make; a model
    // not in the list is refused before any call.
    const old = await poll(await (await post("/generations", { type: "image", operation: "region", prompt: "整張變亮", settings: { imageLayout: "region-preserve", regionWidth: 40, regionHeight: 20, quality: "2K" }, references: { images: [image] }, mask })).json());
    assert.equal(old.status, "succeeded", old.error);
    assert.equal(old.input.settings.model, "gpt-image-2.5-flare");
    assert.equal(old.input.settings.quality, "1K");
    assert.equal(old.result.origin.model, "gpt-image-2.5-flare");
    const before = calls.length, bad = await post("/generations", { type: "image", operation: "region", prompt: "x", settings: { ...settings, model: "seedream-4" }, references: { images: [image] }, mask });
    assert.equal(bad.status, 400);
    assert.equal(calls.length, before);
    console.log("PASS old job settings run the default at 1K; an unlisted model is refused");

    // 3 + 4 in the page: an old draft opens; the missing-prompt guard; model x resolution on the button; draw a box.
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
    assert.match(await p.locator("#regionMissing").textContent(), /還有 1 個區域沒有填寫指令/);
    assert.deepEqual(await p.locator('[aria-label="解析度"] button').allTextContents(), ["1K"], "default OpenAI: its 4K draft shows as 1K");
    // Every model button shows its NT$ price, computed here from the charge's own function (provider-cost.cjs
    // imageEditUsd) through the one money format (shared/models.js), and the buttons run cheapest first.
    const money = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/models.js"), "utf8"), { window: money, crypto: globalThis.crypto });
    const label = (m, s) => `${m.label} · 約 ${money.VideoWorkbenchMoney(costs.imageEditUsd(m.id, s), caps)}／張`;
    const order = (s) => [...rows].sort((a, b) => costs.imageEditUsd(a.id, a.sizes.includes(s) ? s : a.defaultSize) - costs.imageEditUsd(b.id, b.sizes.includes(s) ? s : b.defaultSize));
    assert.deepEqual(await p.locator('[aria-label="模型"] button').allTextContents(), order("1K").map((m) => label(m, "1K")), "NT$ from the charge's function, cheapest first");
    assert.equal(order("1K")[0].id, "gemini-nano-banana-2.1");
    const submit = p.locator("[data-act=submit]");
    await p.waitForFunction(() => document.querySelector("[data-act=submit] .paid-price"));
    const openaiPrice = await submit.textContent();
    console.log("PASS old draft opens: 2 numbered boxes, rows, 2/8, 1/1, red missing line");

    const posts = calls.length;
    await submit.click();
    await p.waitForTimeout(300);
    assert.equal(calls.length, posts, "nothing sent while a box has no instruction");
    await p.getByRole("button", { name: /Nano Banana 2\.1/ }).click();
    assert.deepEqual(await p.locator('[aria-label="解析度"] button').allTextContents(), ["1K", "2K", "4K"]);
    assert.equal(await p.locator('[aria-label="解析度"] .selected').textContent(), "4K", "the draft's 4K is kept for a model that has it");
    await p.waitForFunction((before) => document.querySelector("[data-act=submit]").textContent !== before, openaiPrice);
    // The generate button shows the 4K charge source in NT$.
    const nt4 = "約 " + money.VideoWorkbenchMoney(costs.imageEditUsd("gemini-nano-banana-2.1", "4K"), caps) + "／張";
    await p.waitForFunction((t) => document.querySelector("[data-act=submit]").textContent.includes(t), nt4);
    const g4 = await submit.textContent();
    assert.deepEqual(await p.locator('[aria-label="模型"] button').allTextContents(), order("4K").map((m) => label(m, m.sizes.includes("4K") ? "4K" : m.defaultSize)), "order follows the price at the chosen resolution");
    await p.locator('[aria-label="解析度"] button', { hasText: "1K" }).click();
    await p.waitForFunction((before) => document.querySelector("[data-act=submit]").textContent !== before, g4);
    console.log("PASS model buttons + resolution buttons change the price on the button");

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
    // The page's job reaches Gemini with the chosen size and all three instructions.
    for (let i = 0; i < 100 && calls.filter((c) => c.url.endsWith("/interactions")).length < 2; i++) await p.waitForTimeout(100);
    const last = JSON.parse(calls.filter((c) => c.url.endsWith("/interactions")).at(-1).body), text = last.input.find((x) => x.type === "text").text;
    assert.equal(last.response_format.image_size, "1K");
    assert.match(text, /區域 1.*花朵改為淺藍色/);
    assert.match(text, /區域 2.*把車改成紅色/);
    assert.match(text, /區域 3.*加一隻小鳥/);
    assert.deepEqual(errors, []);
    console.log("PASS draw a box -> popover, 5000 counter, 完成, then the job carries 3 boxes, model and size");
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
