const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  { chromium } = require("playwright"),
  ffmpeg = require("ffmpeg-static");
const evidence = fs
  .readFileSync(path.join(os.tmpdir(), "seedstar-follow-latest.txt"), "utf8")
  .trim();
(async () => {
  const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "vw-follow-test-"),
    ),
    generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated);
  const name = crypto.randomUUID() + ".mp4";
  const make = spawnSync(
    ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-loop",
      "1",
      "-i",
      path.join(evidence, "person.jpg"),
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=1280x720:r=24:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=6",
      "-filter_complex",
      "[0:v]scale=600:400[p];[1:v][p]overlay=x='40+100*t':y=160[v]",
      "-map",
      "[v]",
      "-map",
      "2:a",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      path.join(generated, name),
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  assert.equal(make.status, 0, make.stderr);
  fs.copyFileSync(
    path.join(generated, name),
    path.join(evidence, "moving-person.mp4"),
  );
  const server = require("../server.cjs").createServer({
    dataDir,
    env: {},
    fetchImpl: () => {
      throw Error("No external provider calls permitted");
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const mediaUrl = base + "/generated/" + name,
      original = fs.readFileSync(path.join(generated, name));
    const range = await fetch(mediaUrl, { headers: { Range: "bytes=10-109" } });
    assert.equal(range.status, 206);
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      original.subarray(10, 110),
    );
    const suffix = await fetch(mediaUrl, { headers: { Range: "bytes=-64" } });
    assert.equal(suffix.status, 206);
    assert.deepEqual(
      Buffer.from(await suffix.arrayBuffer()),
      original.subarray(-64),
    );
    const invalid = await fetch(mediaUrl, {
      headers: { Range: "bytes=999999999-" },
    });
    assert.equal(invalid.status, 416);
    const head = await fetch(mediaUrl, { method: "HEAD" });
    assert.equal(Number(head.headers.get("content-length")), original.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    console.log(
      "PASS 影片 HTTP 分段讀取、尾端範圍、無效範圍、HEAD；播放器可跳到真實指定時間",
    );
    const p = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(base + "/")
        ? r.continue()
        : r.abort(),
    );
    await p.goto(base + "/pages/tools.html#follow");
    await p.waitForFunction(() => VideoWorkbench.tools?.acceptAsset);
    await p.evaluate(
      (asset) =>
        VideoWorkbench.tools.acceptAsset({
          tool: "follow",
          asset,
          settings: { followStart: 1, followEnd: 6 },
        }),
      {
        id: "moving-person",
        url: "/generated/" + name,
        name: "橫向移動人物測試",
        type: "video/mp4",
        duration: 6,
        width: 1280,
        height: 720,
      },
    );
    await p.locator('[data-flow-action="follow-detect"]').click();
    await p.waitForSelector("[data-follow-person]", { timeout: 90000 });
    console.log("PASS 真實 Google 模型在完全離線的頁面偵測到人物");
    await p.locator('[data-follow-person="0"]').click();
    await p.waitForFunction(() => !followRuntime.busy && followReady(), null, {
      timeout: 120000,
    });
    const track = await p.evaluate(() => values.followTrack);
    assert(track.length >= 40);
    assert(track.at(-1).x - track[0].x > 0.25, "必須真的跟隨人物向右移動");
    await p.locator('[data-flow-media="src"]').evaluate((m) => {
      m.currentTime = 3;
    });
    await p.waitForFunction(
      () =>
        Math.abs(
          document.querySelector('[data-flow-media="src"]').currentTime - 3,
        ) < 0.02,
    );
    await p.locator('[data-flow-action="follow-detect"]').click();
    await p.waitForSelector("[data-follow-person]", { timeout: 90000 });
    await p.locator('[data-follow-person="0"]').click();
    await p.waitForFunction(
      () =>
        !followRuntime.busy &&
        followReady() &&
        values.followAnchors.length === 2,
      null,
      { timeout: 120000 },
    );
    await p.locator('[data-flow-action="follow-render"]').click();
    await p.waitForFunction(
      () =>
        document
          .querySelector(".job-view")
          ?.textContent.match(/succeeded|failed/),
      null,
      { timeout: 90000 },
    );
    const panel = p.locator(".job-view");
    assert(
      !(await panel.innerText()).includes("failed"),
      await panel.innerText(),
    );
    const url = await panel.locator("video").getAttribute("src"),
      meta = await require("../backend/media-inspect.cjs").inspectMedia(
        path.join(dataDir, url.slice(1)),
      );
    assert.equal(meta.width, 720);
    assert.equal(meta.height, 1280);
    assert(meta.audio);
    assert(Math.abs(meta.duration - 5) < 0.15);
    const frames = [];
    for (const time of [0.2, 4.5]) {
      const frameName = crypto.randomUUID() + ".png";
      const decode = spawnSync(
        ffmpeg,
        [
          "-y",
          "-hide_banner",
          "-ss",
          String(time),
          "-i",
          path.join(dataDir, url.slice(1)),
          "-frames:v",
          "1",
          path.join(generated, frameName),
        ],
        { encoding: "utf8", windowsHide: true },
      );
      assert.equal(decode.status, 0, decode.stderr);
      frames.push("/generated/" + frameName);
    }
    const centers = await p.evaluate(async (frames) => {
      const result = [];
      for (const url of frames) {
        const image = new Image();
        image.src = url;
        await image.decode();
        const detected = await followWorkerCall(await createImageBitmap(image));
        result.push(detected.boxes.map((b) => b.cx));
      }
      return result;
    }, frames);
    assert(
      centers.every((boxes) => boxes.some((cx) => Math.abs(cx - 0.5) < 0.18)),
      JSON.stringify(centers),
    );
    await panel.locator("[data-job-close]").click();
    const selected = await p.evaluate(() => {
      const box = followRuntime.boxes[0];
      followRuntime.boxes = [];
      values.followAnchors = [];
      followDraw();
      return { x: box.cx, y: box.cy };
    });
    const pick = p.locator("[data-follow-pick]"),
      bounds = await pick.boundingBox();
    await pick.click({
      position: { x: bounds.width * selected.x, y: bounds.height * selected.y },
    });
    await p.waitForFunction(
      () =>
        !followRuntime.busy &&
        followReady() &&
        values.followAnchors[0]?.box.manual,
      null,
      { timeout: 120000 },
    );
    const manual = await p.evaluate(() => values.followTrack);
    assert(
      manual.at(-1).x - manual[0].x > 0.25,
      "未框出的人物也應以畫面特徵追蹤移動",
    );
    console.log(
      "PASS 直接點身體位置：真實畫面特徵追蹤，含從選取時刻向前／向後追蹤",
    );
    const drag = await pick.boundingBox();
    await p.mouse.move(drag.x + drag.width * 0.5, drag.y + drag.height * 0.5);
    await p.mouse.down();
    await p.mouse.move(drag.x + drag.width * 0.7, drag.y + drag.height * 0.5, {
      steps: 6,
    });
    await p.mouse.up();
    assert.equal(await p.evaluate(() => values.followMode), "固定位置");
    await p
      .locator('[data-flow-choice="followMode"][data-flow-value="跟拍人物"]')
      .click();
    assert(await p.evaluate(() => followReady()));
    console.log("PASS 拖曳預覽改用固定裁切，切回跟拍保留已完成的追蹤");
    await p.screenshot({
      path: path.join(evidence, "follow-tracking.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS 人物選取、動態追蹤、時間點修正、真實 720×1280／5 秒／AAC 輸出；前後影格人物保持置中",
    );
    console.log("EVIDENCE " + evidence);
    console.log("OUTPUT " + path.join(dataDir, url.slice(1)));
  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
