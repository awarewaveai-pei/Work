// Card P3 acceptance in the browser (isolated server, Edge headless): title template -> change title -> save ->
// reload -> keyframes/curve/mask/expression intact; render output; decoded output frames equal the page's preview
// of the same frames (PSNR >= 40 dB on RGB and on alpha); transparent pixels alpha 0, feathered mask edge partly
// transparent; an expression error shows its column and the render still completes; 逐字高亮 frame identical in
// preview and output; a missing font blocks output; no <select> in the workspace.
const assert = require("node:assert/strict"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
function decode(file, frame, width, height) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(r.stdout.length, width * height * 4, "decoded frame " + frame + " has the comp size");
  return r.stdout;
}
// PSNR over the RGB channels and, separately, over alpha (Infinity = identical).
function psnr(a, b) {
  let rgb = 0, alpha = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) rgb += (a[i + c] - b[i + c]) ** 2;
    alpha += (a[i + 3] - b[i + 3]) ** 2;
  }
  const db = (sum, n) => (sum === 0 ? Infinity : 10 * Math.log10((255 * 255) / (sum / n)));
  return { rgb: db(rgb, (a.length / 4) * 3), alpha: db(alpha, a.length / 4) };
}
async function setFrame(page, frame) {
  const input = page.locator('input[type="number"][aria-label="目前影格"]');
  await input.fill(String(frame));
  await input.press("Enter");
  await page.waitForFunction((f) => document.querySelector("[data-cp-canvas]")?.dataset.cpFrame === String(f) && !cp.dirty, frame);
}
async function preview(page, frame) {
  await setFrame(page, frame);
  const b64 = await page.evaluate(() => {
    const c = document.querySelector("[data-cp-canvas]"),
      d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let s = "";
    for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode(...d.subarray(i, i + 32768));
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}
async function tab(page, name) {
  await page.locator('[role="group"][aria-label="屬性分頁"]').getByRole("button", { name, exact: true }).click();
}
async function layer(page, name) {
  await page.locator(`[data-cp-action^="layer:"]`, { hasText: name }).first().click();
}
async function fillField(page, label, value) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press("Tab");
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const { base, dataDir } = await isolatedServer("vw-p3-ui-");
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#compose");
    await page.getByRole("button", { name: "新增片頭範本" }).first().click();
    await page.waitForSelector("[data-cp-canvas]");
    await layer(page, "標題");
    await tab(page, "文字");
    await fillField(page, "文字內容", "新的片頭");
    await page.getByRole("button", { name: /^儲存/ }).click();
    await page.waitForFunction(() => !cp.dirty && cp.doc.revision === 2);
    const before = await page.evaluate(() => structuredClone(cp.list.find((c) => c.id === cp.doc.id)));
    assert.equal(before.history.length, 1, "the template's first save is kept as the previous revision");

    await page.reload();
    await page.getByRole("button", { name: "片頭範本 · 第 2 版", exact: true }).click();
    await page.waitForSelector("[data-cp-canvas]");
    const after = await page.evaluate(() => structuredClone(cp.doc));
    const pick = (c) => {
      const L = (n) => c.layers.find((l) => l.name === n);
      return {
        text: L("標題").text,
        opacity: L("標題").props.opacity,
        scale: L("標題").props.scale,
        mask: L("標題").mask,
        expr: L("裝飾").props.rotation,
        blend: L("光暈").blend,
        effects: L("光暈").effects,
        order: c.layers.map((l) => l.name),
        revision: c.revision,
      };
    };
    assert.deepEqual(pick(after), pick(before));
    assert.equal(after.layers.find((l) => l.name === "標題").text, "新的片頭");
    assert.deepEqual(after.layers.find((l) => l.name === "標題").props.scale.keys[0].bezier, [0.2, 0.8, 0.2, 1]);
    assert.equal(after.layers.find((l) => l.name === "標題").props.opacity.keys[0].ease, "ease-in-out");
    assert.equal(after.layers.find((l) => l.name === "裝飾").props.rotation.expr, "wiggle(2, 6)");
    assert.equal(after.layers.find((l) => l.name === "光暈").blend, "screen");
    pass("片頭範本：改標題→儲存→重新整理→重開：關鍵影格、Bezier 曲線、遮罩、表達式、濾色混合、特效都在");

    // Curve editor is real SVG with two handles and the 線性對照 line.
    await layer(page, "標題");
    await tab(page, "屬性");
    await page.locator('.cp-prop', { hasText: "縮放" }).getByRole("button", { name: "動畫與表達式" }).click();
    await page.getByRole("button", { name: "選取" }).first().click();
    assert.equal(await page.locator("[data-cp-curve] circle[data-cp-handle]").count(), 2);
    assert.equal(await page.locator("[data-cp-curve] [data-cp-linear]").count(), 1);
    pass("動畫曲線：曲線編輯器有兩個控制點與線性對照線");

    // Expression error: shown with its column; the property falls back and rendering continues.
    await layer(page, "裝飾");
    await tab(page, "屬性");
    await page.locator(".cp-prop", { hasText: "位置 X" }).getByRole("button", { name: "動畫與表達式" }).click();
    await tab(page, "表達式");
    await fillField(page, "表達式", "frame + * 2");
    await page.waitForFunction(() => /第 9 字/.test(document.querySelector("[data-cp-expr-error]")?.textContent || ""));
    // Feathered mask on the background (edge at comp x = 160), and 逐字高亮 with estimated word times on the title.
    await layer(page, "背景");
    await tab(page, "遮罩");
    await page.getByRole("button", { name: "加矩形遮罩" }).click();
    await fillField(page, "羽化（px）", 30);
    await layer(page, "標題");
    await tab(page, "文字");
    await page.getByRole("button", { name: "逐字高亮", exact: true }).click();
    await page.getByRole("button", { name: "依字數平均分配（估計）", exact: true }).click();
    assert.match(await page.locator("[data-cp-timing]").textContent(), /估計/);
    await page.getByRole("button", { name: /^儲存/ }).click();
    await page.waitForFunction(() => !cp.dirty && cp.doc.revision === 3);
    const words = await page.evaluate(() => cp.doc.layers.find((l) => l.name === "標題").words);
    assert.deepEqual(words.map((w) => [w.text, w.startFrame, w.endFrame]), [["新", 0, 8], ["的", 8, 15], ["片", 15, 23], ["頭", 23, 30]]);

    const assetsBefore = await page.evaluate(async () => (await SeedStar.assets.list()).length);
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await page.waitForFunction(() => /已輸出|缺少|失敗|錯誤/.test(document.querySelector("[data-cp-status]")?.textContent || ""), null, { timeout: 240000 });
    assert.match(await page.locator("[data-cp-status]").textContent(), /已輸出/);
    const asset = await page.evaluate(async () => (await SeedStar.assets.list()).filter((a) => a.origin?.engine === "workbench-compositor").at(-1));
    assert.equal(asset.origin.kind, "render");
    assert.equal(asset.origin.compositionId, after.id);
    assert.equal(asset.origin.compositionRevision, 3);
    assert.equal(asset.verification.ok, true);
    assert.match(asset.url, /^\/media\/[a-f0-9]{64}\/original\.mov$/);
    assert.match(asset.previewUrl, /proxy\.webm$/, "alpha source gets a VP9+alpha preview proxy");
    const file = path.join(dataDir, asset.url.slice(1));
    pass("輸出：PNG MOV 入素材庫，origin render／workbench-compositor＋合成 id＋版本，驗證通過（時長、fps、尺寸、透明通道）");

    const W = 1920, H = 1080;
    for (const f of [0, 10, 45, 89]) {
      const out = decode(file, f, W, H), pre = await preview(page, f), score = psnr(out, pre);
      assert.ok(score.rgb >= 40 && score.alpha >= 40, `frame ${f}: PSNR rgb ${score.rgb} alpha ${score.alpha}`);
    }
    pass("預覽＝輸出：第 0、10（逐字高亮進行中）、45、89 格解碼後與頁面預覽比對，RGB 與透明度 PSNR ≥ 40 dB");

    const mid = decode(file, 45, W, H), at = (x, y) => mid[(y * W + x) * 4 + 3];
    assert.equal(at(5, 5), 0, "corner outside every layer is fully transparent");
    assert.equal(at(W - 5, H - 5), 0);
    const edge = Array.from({ length: 41 }, (_, i) => at(140 + i, 490));
    assert.ok(edge.some((a) => a > 0 && a < 200), "feathered mask edge has intermediate alpha: " + edge.join(","));
    assert.ok(edge[0] < edge[40], "edge ramps up into the masked area");
    pass("透明：畫面外圍 alpha 0；羽化遮罩邊緣有中間透明度");

    // 逐字高亮 at frame 10: the second character (的) is highlighted, others not, in the output itself.
    const f10 = decode(file, 10, W, H);
    const yellowish = (buf) => {
      let n = 0;
      for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] > 200 && buf[i] > 220 && buf[i + 1] > 180 && buf[i + 2] < 140) n++;
      return n;
    };
    assert.ok(yellowish(f10) > 200, "highlight colour present at frame 10");
    assert.ok(yellowish(decode(file, 45, W, H)) < yellowish(f10), "no word highlighted after the range");
    await layer(page, "裝飾");
    await tab(page, "屬性");
    await page.locator(".cp-prop", { hasText: "位置 X" }).getByRole("button", { name: "動畫與表達式" }).click();
    await tab(page, "表達式");
    assert.match(await page.locator("[data-cp-expr-error]").textContent(), /第 9 字/);
    pass("表達式錯誤顯示「第 9 字」，輸出照常完成；逐字高亮在輸出中出現於對應影格");

    // Missing font: output blocked with 「缺少字型」, nothing new in the library.
    await layer(page, "標題");
    await tab(page, "文字");
    await fillField(page, "其他字型名稱", "NoSuchFontP3");
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await page.waitForFunction(() => /缺少字型/.test(document.querySelector("[data-cp-status]")?.textContent || ""));
    assert.match(await page.locator("[data-cp-status]").textContent(), /缺少字型：NoSuchFontP3/);
    assert.equal(await page.evaluate(async () => (await SeedStar.assets.list()).length), assetsBefore + 1);
    pass("缺字型：輸出被擋並顯示「缺少字型：NoSuchFontP3」，不偷換字型");

    assert.equal(await page.locator('[data-tool-flow="compose"] select').count(), 0);
    for (const t of ["屬性", "動畫", "表達式", "遮罩", "合成遮罩", "特效", "文字"]) {
      await tab(page, t);
      assert.equal(await page.locator('[data-tool-flow="compose"] select').count(), 0, t);
    }
    pass("工作區沒有 <select>（所有分頁）");
    assert.deepEqual(errors.filter((e) => !/缺少字型/.test(e)), []);
  } finally {
    await browser.close();
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
