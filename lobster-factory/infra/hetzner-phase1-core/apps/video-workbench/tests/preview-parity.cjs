// Cards ED.7.3 / ED.5.3 / ED.10.4 (preview = output): the same project is drawn by the editor preview (stage screenshot
// in real Edge) and burnt by the real export; one frame of each at the same time is compared, both scaled to 640x360 RGB
// (the screenshot first goes through the export's 720p yuv420p, so thin coloured strokes lose the same chroma).
// Edge and libass draw glyphs differently, so text is compared by measures that do not depend on glyph shapes.
// Tolerances: transition progress 0.04 (a frame is 0.033); 文字動畫 ink amount / width / reach as a
// fraction of the clip's own settled frame, 0.1; 底色 and 字幕樣式 dominant colour 24/255 per channel; highlight position
// inside the line 0.12 of its width.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  ffmpeg = require("ffmpeg-static"),
  { media } = require("../backend/media.cjs");
const pass = (m) => console.log("PASS " + m);
const W = 640, H = 360, FPS = 30;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-preview-parity-")),
  dataDir = path.join(dir, "data");
fs.mkdirSync(path.join(dataDir, "generated"), { recursive: true });
function ff(args) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { windowsHide: true, encoding: null, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}
const solid = (color, seconds) => {
  const url = "/generated/" + crypto.randomUUID() + ".mp4";
  ff(["-f", "lavfi", "-i", `color=c=${color}:s=640x360:r=30:d=${seconds}`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(dataDir, url)]);
  return url;
};
const toRgb = (input, vf = "", matrix = "bt601") =>
  ({ data: ff([...input, "-vf", `${vf}scale=${W}:${H}:in_color_matrix=${matrix}`, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]) });
const outputFrame = (file, n) => toRgb(["-i", file], `select=eq(n\\,${n}),`, "bt709"); // the export writes BT.709
const px = (img, x, y) => [0, 1, 2].map((k) => img.data[(y * W + x) * 3 + k]);
const BG = "0x203060", BG_RGB = [0x20, 0x30, 0x60];
// Pixels that differ from the background (a 4 px frame edge skipped: the stage has a 1 px border): bounding columns, count, summed difference, the pixels themselves.
function ink(img) {
  const out = { x0: W, x1: -1, count: 0, sum: 0, pixels: [] };
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      const p = px(img, x, y),
        d = Math.abs(p[0] - BG_RGB[0]) + Math.abs(p[1] - BG_RGB[1]) + Math.abs(p[2] - BG_RGB[2]);
      if (d < 60) continue;
      out.count++;
      out.sum += d;
      out.x0 = Math.min(out.x0, x);
      out.x1 = Math.max(out.x1, x);
      out.pixels.push({ x, p });
    }
  return out;
}
// The most common colour (16 levels per channel) among the pixels passing `keep`, as its bin centre.
function dominant(m, keep = () => true) {
  const bins = new Map();
  for (const { p } of m.pixels) if (keep(p)) bins.set(p.map((v) => v >> 4).join(","), (bins.get(p.map((v) => v >> 4).join(",")) || 0) + 1);
  const best = [...bins].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0].split(",").map((v) => Number(v) * 16 + 8) : null;
}
const near = (a, b, tol, what) => assert.ok(a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol), `${what}：預覽 ${a} ／輸出 ${b}（容許 ${tol}）`);
const dark = (p) => p[0] < 40 && p[1] < 40 && p[2] < 40;
const yellow = (p) => p[0] > 170 && p[1] > 140 && p[2] < 110;
(async () => {
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
    await page.getByLabel("專案名稱").fill("預覽一致");
    await page.getByRole("radio", { name: /^16:9 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    // Lay out the page's project (rows: { video, seconds, patch } back to back on the main track, or { text: fields }),
    // return its export form.
    const build = (rows) =>
      page.evaluate((rows) => {
        const p = edProject(),
          main = edMain(p),
          textTrack = edTrackFor(p, "text");
        p.clips = [];
        let at = 0;
        for (const r of rows) {
          const id = "c" + p.clips.length;
          if (r.video) {
            const c = edTime(p, { id, kind: "video", track: main, asset: { id: "a" + id, url: r.video, name: "片", duration: r.seconds }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25 }, { startFrame: at * 30, durationFrames: r.seconds * 30, sourceStartFrame: 0 });
            p.clips.push(Object.assign(c, r.patch));
            at += r.seconds;
          } else p.clips.push(Object.assign(edText(r.text.text, r.text.start, r.text.duration, p, textTrack), r.text, { id }));
        }
        edRender();
        return edNative(p);
      }, rows);
    const exportOf = async (project) => {
      let out;
      await media({ operation: "editor-export", settings: { project, quality: "720p" } }, { file: (u) => path.join(dataDir, u), output: (ext) => (out = { file: path.join(dir, crypto.randomUUID() + "." + ext), url: "" }) });
      return out.file;
    };
    const shot = async (n) => {
      await page.evaluate((t) => {
        ed.time = t;
        edPaint();
      }, n / FPS);
      await page.waitForFunction(() => [...document.querySelectorAll("[data-ed-stage] video")].every((v) => v.readyState >= 2 && !v.seeking));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const file = path.join(dir, crypto.randomUUID() + ".png");
      await page.locator("[data-ed-stage]").screenshot({ path: file });
      return toRgb(["-i", file], "scale=1280:720,format=yuv420p,"); // the export's 720p 4:2:0 chroma, as the output frame has
    };

    // ---- ED.7.3 轉場曲線: cuts at 2 / 4 / 6 s alternate red and blue, 溶解 1 s each, one curve per cut ----------------
    const red = solid("red", 2), blue = solid("blue", 2), curves = ["線性", "平滑", "加速"];
    const tr = await exportOf(await build([{ video: red, seconds: 2 }, ...curves.map((curve, i) => ({ video: i % 2 ? red : blue, seconds: 2, patch: { transition: "溶解", transitionFrames: 30, transitionCurve: curve } }))]));
    // Edge and FFmpeg turn the same YUV red into slightly different RGB, so each side's mid-transition colour is placed
    // between its own outgoing and incoming colours (frames just before and after the window): the progress shown.
    const progress = (img, from, to) => {
      const c = (q) => px(q, W / 2, H / 2),
        [m, a, b] = [c(img), c(from), c(to)],
        d = b.map((v, k) => v - a[k]);
      return d.reduce((s, v, k) => s + v * (m[k] - a[k]), 0) / d.reduce((s, v) => s + v * v, 0);
    };
    const shown = [];
    for (const [i, curve] of curves.entries()) {
      const cut = (2 + 2 * i) * FPS,
        n = cut - 15 + 7, // 7 frames into the 30-frame window: linear progress 0.233
        p = progress(await shot(n), await shot(cut - 20), await shot(cut + 20)),
        o = progress(outputFrame(tr, n), outputFrame(tr, cut - 20), outputFrame(tr, cut + 20));
      assert.ok(Math.abs(p - o) <= 0.04, `轉場曲線「${curve}」第 ${n} 格進度：預覽 ${p} ／輸出 ${o}`);
      shown.push(o.toFixed(3) + "/" + p.toFixed(3));
    }
    pass(`轉場曲線 線性／平滑／加速 第 7 格（線性 0.233、平滑 0.140、加速 0.054）：輸出／預覽進度 ${shown.join("，")}（容許 0.04）`);

    // ---- ED.5.3 文字動畫＋底色, ED.10.4 字幕樣式: one 3 s text clip after another over a solid background ----------
    const anims = ["無", "淡入淡出", "彈出", "逐字顯示"],
      styles = ["白字暗底", "白底黑字", "品牌色", "白字黑邊", "黃字黑邊", "逐字高亮", "卡拉 OK", "色塊標題"],
      text = (i, fields) => ({ text: { text: "ABCDEFGHIJKLMNOP", font: "Arial", fontSize: 90, y: 50, start: 3 * i, duration: 3, ...fields } }),
      words = [["Hello", 0.3, 0.8], ["brave", 0.9, 1.4], ["new", 1.5, 2.0], ["world", 2.1, 2.6]].map(([t, start, end]) => ({ text: t, start, end })),
      subtitle = (i, style) => ({ text: { text: "Hello brave new world", font: "Arial", fontSize: 120, y: 50, start: 3 * i, duration: 3, subtitleStyle: style, color: "#e11d48", words } });
    const tx = await exportOf(
      await build([
        { video: solid(BG, 42), seconds: 42 },
        ...anims.map((animation, i) => text(i, { animation })),
        text(4, { backgroundColor: "#ff0000" }),
        ...styles.map((s, k) => subtitle(5 + k, s)),
        text(13, { align: "靠左", backgroundColor: "#ff0000", text: "ABCDEFGH" }),
      ]),
    );
    // [preview, output] ink of clip i, n frames into it.
    const both = async (i, n) => [ink(await shot(3 * i * FPS + n)), ink(outputFrame(tx, 3 * i * FPS + n))];
    const settled = (i) => both(i, 45);
    {
      const [p, o] = await settled(0),
        [wp, wo] = [(p.x1 - p.x0) / W, (o.x1 - o.x0) / W];
      assert.ok(Math.abs(wp - wo) <= 0.1 * wo, `文字「無」寬度：預覽 ${wp} ／輸出 ${wo}`);
      pass(`文字動畫「無」：字寬 預覽 ${wp.toFixed(3)} ／輸出 ${wo.toFixed(3)} 畫面寬`);
    }
    const ratio = async (i, n, what, f) => {
      const [[p, o], [ps, os]] = [await both(i, n), await settled(i)],
        [rp, ro] = [f(p, ps), f(o, os)];
      assert.ok(Math.abs(rp - ro) <= 0.1 && ro > 0.2 && ro < 0.9, `${what}：預覽 ${rp} ／輸出 ${ro}`);
      pass(`${what}：預覽 ${rp.toFixed(2)} ／輸出 ${ro.toFixed(2)}`);
    };
    await ratio(1, 3, "文字動畫「淡入淡出」0.1 秒（0.2 秒淡入）亮度比", (m, s) => m.sum / s.sum);
    await ratio(2, 3, "文字動畫「彈出」0.1 秒（0.18 秒從 50%）寬度比", (m, s) => (m.x1 - m.x0) / (s.x1 - s.x0));
    await ratio(3, 15, "文字動畫「逐字顯示」0.5 秒（16 字、每字 6 cs）顯示到的寬度比", (m, s) => (m.x1 - s.x0) / (s.x1 - s.x0));
    {
      const [p, o] = await settled(4),
        [dp, dout] = [dominant(p), dominant(o)];
      near(dp, dout, 24, "文字底色（主要顏色）");
      pass(`文字底色：主要顏色 預覽 ${dp} ／輸出 ${dout}（2/3 不透明紅疊在背景上）`);
    }
    for (const [k, style] of styles.entries()) {
      // 逐字高亮 at 1.0 s = "brave" lit; 卡拉 OK at 1.2 s = 60 % into "brave"; the others settled.
      const [p, o] = await both(5 + k, style === "逐字高亮" ? 30 : style === "卡拉 OK" ? 36 : 45),
        box = ["白字暗底", "白底黑字", "色塊標題"].includes(style);
      if (box) near(dominant(p), dominant(o), 24, `${style} 底框顏色`);
      else {
        // The line's own colour = mean of the brightest fifth of its non-outline pixels (stroke centres, least bled into
        // by H.264's chroma), and that it has an outline.
        const fill = (m) => {
            const lit = m.pixels.map(({ p: q }) => q).filter((q) => !dark(q)).sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2])),
              top = lit.slice(0, Math.max(1, Math.round(lit.length / 5)));
            return [0, 1, 2].map((c) => Math.round(top.reduce((s, q) => s + q[c], 0) / top.length));
          },
          outline = (m) => m.pixels.filter(({ p: q }) => dark(q)).length / m.count;
        near(fill(p), fill(o), 24, `${style} 字色`);
        assert.ok(outline(p) > 0.03 && outline(o) > 0.03, `${style} 黑邊：預覽 ${outline(p)} ／輸出 ${outline(o)}`);
      }
      if (style === "逐字高亮" || style === "卡拉 OK") {
        // Where the yellow sits inside the line: 逐字高亮 = its centre (the lit word), 卡拉 OK = its right end (sung so far).
        const at = (m) => {
          const xs = m.pixels.filter(({ p: q }) => yellow(q)).map(({ x }) => x);
          assert.ok(xs.length > 20, `${style} 有黃色`);
          return ((style === "逐字高亮" ? xs.reduce((s, x) => s + x, 0) / xs.length : Math.max(...xs)) - m.x0) / (m.x1 - m.x0);
        };
        const [ap, ao] = [at(p), at(o)];
        assert.ok(Math.abs(ap - ao) <= 0.12, `${style} 黃色位置：預覽 ${ap} ／輸出 ${ao}`);
        pass(`字幕「${style}」：黃色位置 預覽 ${ap.toFixed(2)} ／輸出 ${ao.toFixed(2)}（行寬比例）`);
      } else pass(`字幕「${style}」：${box ? "底框顏色" : "字色與黑邊"} 預覽＝輸出`);
    }
    {
      // Codex finding: 靠左 anchors the text's left edge at x = 50 % (ASS alignment 4), it is not centred there.
      const [p, o] = await settled(13),
        [lp, lo] = [p.x0 / W, o.x0 / W];
      assert.ok(Math.abs(lp - lo) <= 0.02 && lo > 0.45, `靠左 左緣：預覽 ${lp} ／輸出 ${lo}`);
      pass(`文字靠左：左緣 預覽 ${lp.toFixed(3)} ／輸出 ${lo.toFixed(3)} 畫面寬（容許 0.02）`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
