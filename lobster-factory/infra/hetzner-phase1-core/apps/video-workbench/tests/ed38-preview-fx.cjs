// Card ED.3.8 (docs/ed3-properties-spec-20261106.md §9 G1): the preview draws 形狀遮罩, 顆粒 and 背景模糊 from the
// export's fields. Real Edge, isolated data dir; pixels compared from stage screenshots (same opening as ed3-inspector).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed38-")),
    dataDir = path.join(dir, "data");
  fs.mkdirSync(path.join(dataDir, "generated"), { recursive: true });
  const clipUrl = "/generated/" + crypto.randomUUID() + ".mp4",
    made = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(dataDir, clipUrl)], { encoding: "utf8", windowsHide: true });
  assert.equal(made.status, 0, made.stderr);
  // A see-through PNG (alpha ≈ 0.5) for the blurred copy: repaints must not stack it up.
  const pngUrl = "/generated/" + crypto.randomUUID() + ".png",
    png = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=red@0.5:s=320x180,format=rgba", "-frames:v", "1", path.join(dataDir, pngUrl)], { encoding: "utf8", windowsHide: true });
  assert.equal(png.status, 0, png.stderr);
  const server = require("../server.cjs").createServer({ dataDir, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("ED38 預覽");
    await page.getByRole("radio", { name: /^9:16 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    await page.evaluate((url) => {
      const p = edProject();
      p.clips.push(edTime(p, { id: "v1clip", kind: "video", track: "V1", asset: { id: "a1", url, name: "測試片", duration: 4 }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25 }, { startFrame: 0, durationFrames: 90, sourceStartFrame: 0 }));
      edRender();
    }, clipUrl);
    const set = (patch) =>
        page.evaluate((patch) => {
          const p = edProject(),
            c = p.clips.find((x) => x.id === "v1clip");
          for (const [k, v] of Object.entries(patch)) {
            const [owner, key] = k.split(".");
            const row = owner === "p" ? p : c;
            if (v === null) delete row[key];
            else row[key] = v;
          }
          ed.time = 0.5;
          edPaint();
        }, patch),
      shot = async () => {
        await page.waitForFunction(() => {
          const v = document.querySelector('[data-ed-layer="v1clip"]');
          return v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - 0.5) < 0.05;
        });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        return (await page.locator("[data-ed-stage]").screenshot()).toString("base64");
      },
      // Pixel stats in the page: changed pixels between two shots, and mean / std of the top band (above the 16:9
      // picture in a 9:16 frame, where only the blurred background can show).
      stats = (a, b) =>
        page.evaluate(
          async ([a, b]) => {
            const read = async (s) => {
              const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob()),
                c = Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height }),
                x = c.getContext("2d");
              x.drawImage(bmp, 0, 0);
              return x.getImageData(0, 0, bmp.width, bmp.height);
            };
            const A = await read(a),
              B = b ? await read(b) : null;
            let changed = 0;
            if (B) for (let i = 0; i < A.data.length; i += 4) if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 8) changed++;
            const band = [];
            for (let y = Math.round(A.height * 0.1); y < Math.round(A.height * 0.25); y++)
              for (let x = Math.round(A.width * 0.2); x < Math.round(A.width * 0.8); x++) {
                const i = (y * A.width + x) * 4;
                band.push((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3);
              }
            const mean = band.reduce((s, v) => s + v, 0) / band.length;
            return { changed, total: A.width * A.height, mean, std: Math.sqrt(band.reduce((s, v) => s + (v - mean) ** 2, 0) / band.length) };
          },
          [a, b],
        );

    await set({});
    const off = await shot();
    assert.equal((await stats(off, await shot())).changed, 0, "同一畫面兩次截圖相同（比對可信）");
    const offStats = await stats(off);
    assert.ok(offStats.mean < 3, "黑邊：上方是黑的 " + offStats.mean);

    await set({ "c.mask": "圓形" });
    const masked = await stats(off, await shot());
    assert.ok(masked.changed > 500, "圓形遮罩改變畫面 " + masked.changed);
    assert.equal(await page.locator('[data-ed-layer="v1clip"]').evaluate((el) => el.style.clipPath), "ellipse(50% 50% at 50% 50%)");
    await set({ "c.mask": "三角形" });
    assert.ok((await stats(off, await shot())).changed > 500, "三角形遮罩改變畫面");
    await set({ "c.mask": "圓角矩形" });
    assert.match(await page.locator('[data-ed-layer="v1clip"]').evaluate((el) => el.style.clipPath), /^inset\(0(px)? round /);
    await set({ "c.mask": "無" });
    assert.equal((await stats(off, await shot())).changed, 0, "遮罩「無」回到原畫面");
    pass("遮罩：圓形／三角形／圓角矩形改變預覽像素；「無」與原畫面完全相同");

    await set({ "p.grain": 0.5 }); // project layer: grain resolves nearest-first like the export
    const grained = await stats(off, await shot());
    assert.ok(grained.changed > grained.total * 0.05, "顆粒改變畫面 " + grained.changed + "/" + grained.total);
    await set({ "p.grain": 0.5, "c.grain": 0 }); // a clip value of 0 overrides the project, as in the export
    assert.equal((await stats(off, await shot())).changed, 0, "片段 grain 0 覆蓋整片");
    await set({ "p.grain": null, "c.grain": null });
    assert.equal((await stats(off, await shot())).changed, 0, "關閉顆粒回到原畫面");
    pass("顆粒：整片 50% 改變預覽像素；片段 0 覆蓋整片（最近一層）；關閉與原畫面完全相同");

    await set({ "c.background": "模糊", "c.backgroundBlur": 2 });
    const light = await stats(await shot());
    await set({ "c.background": "模糊", "c.backgroundBlur": 40 });
    const heavy = await stats(await shot());
    assert.ok(light.mean > 20 && heavy.mean > 20, `模糊背景填滿上方黑邊 ${light.mean} / ${heavy.mean}`);
    assert.ok(heavy.std < light.std, `強度 40 比 2 更平滑 ${heavy.std} < ${light.std}`);
    await page.locator("[data-ed-stage]").screenshot({ path: path.join(dir, "ed38-blur40.png") });
    // Codex review: paused, a seek must redraw the copy from the new frame (no extra paint from the test), and a
    // see-through picture must not show the copy through it (the export fades the composed frame).
    const backPixels = () =>
      page.evaluate(() => {
        const b = document.querySelector('[data-ed-back="v1clip"]'),
          d = b.getContext("2d").getImageData(0, 0, b.width, b.height).data;
        return { sum: d.reduce((s, v) => s + v, 0), mid: d[(Math.floor(b.height / 2) * b.width + Math.floor(b.width / 2)) * 4 + 3], top: d[(Math.floor(b.height * 0.15) * b.width + Math.floor(b.width / 2)) * 4 + 3] };
      });
    const before = await backPixels();
    await page.evaluate(() => {
      ed.time = 2.5;
      edPaint();
    });
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-ed-layer="v1clip"]');
      return !v.seeking && Math.abs(v.currentTime - 2.5) < 0.05;
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.notEqual((await backPixels()).sum, before.sum, "暫停時跳時間，模糊底圖換成新影格");
    await set({ "c.opacity": 0.5 });
    await shot();
    const faded = await backPixels();
    assert.ok(faded.mid === 0 && faded.top > 0, "半透明時畫面下方不透出模糊底圖 " + JSON.stringify(faded));
    await set({ "c.opacity": 1 });
    await set({ "c.background": "黑邊", "c.backgroundBlur": null });
    assert.equal((await stats(off, await shot())).changed, 0, "背景回黑邊與原畫面相同");
    assert.equal(await page.locator('[data-ed-back="v1clip"]').count(), 0);
    pass("背景模糊：上方黑邊被模糊畫面填滿，強度 40 的標準差小於 2（同輸出端驗法）；暫停跳時間重畫；半透明不透出底圖；回黑邊與原畫面完全相同");

    // Codex review 2: a see-through PNG's blurred copy keeps its alpha over repeated paints (canvas cleared each time).
    const alphaAt = await page.evaluate(async (url) => {
      const p = edProject();
      p.clips.push(edTime(p, { id: "pngclip", kind: "image", track: "V1", asset: { id: "a2", url, name: "半透明", duration: 3 }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25, background: "模糊", backgroundBlur: 20 }, { startFrame: 120, durationFrames: 60, sourceStartFrame: 0 }));
      edRender();
      ed.time = 4.5;
      edPaint();
      const img = document.querySelector('[data-ed-layer="pngclip"]');
      await (img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true })));
      const read = () => {
        edPaint();
        const b = document.querySelector('[data-ed-back="pngclip"]');
        return b.getContext("2d").getImageData(Math.floor(b.width / 2), Math.floor(b.height * 0.1), 1, 1).data[3];
      };
      const first = read();
      for (let i = 0; i < 10; i++) read();
      return [first, read()];
    }, pngUrl);
    assert.ok(alphaAt[0] > 0 && Math.abs(alphaAt[1] - alphaAt[0]) <= 2, "重畫 10 次後模糊底圖透明度不變 " + alphaAt);
    pass("半透明 PNG 的模糊底圖重畫多次不會越疊越不透明");

    assert.deepEqual(errors, []);
    console.log("EVIDENCE " + dir);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
