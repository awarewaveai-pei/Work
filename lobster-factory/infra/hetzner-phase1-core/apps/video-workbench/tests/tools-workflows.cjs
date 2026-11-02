const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
const { chromium } = require("playwright"),
  ffmpeg = require("ffmpeg-static");
const evidence = fs.mkdtempSync(
  path.join(os.tmpdir(), "seedstar-tools-workflows-"),
);
(async () => {
  const dataDir = path.join(evidence, "data"),
    generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const name = crypto.randomUUID() + ".mp4",
    sourceFile = path.join(generated, name),
    audioFile = path.join(evidence, "test-voice.mp3");
  for (const args of [
    [
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=24:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=6",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-shortest",
      sourceFile,
    ],
    [
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=550:duration=2",
      "-c:a",
      "libmp3lame",
      audioFile,
    ],
  ]) {
    const run = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], {
      windowsHide: true,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
  }
  const provider = [],
    png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=",
      "base64",
    );
  const server = require("../server.cjs").createServer({
    dataDir,
    env: { OPENAI_API_KEY: "test-only" },
    fetchImpl: async (url, options) => {
      provider.push({ url, body: options.body });
      if (url.endsWith("/audio/speech"))
        return new Response(fs.readFileSync(audioFile));
      if (url.endsWith("/audio/transcriptions"))
        return new Response("1\n00:00:00,000 --> 00:00:02,000\n測試辨識\n");
      if (url.endsWith("/images/edits"))
        return Response.json({ data: [{ b64_json: png.toString("base64") }] });
      if (url.endsWith("/responses")) {
        const body = JSON.parse(options.body),
          input = require('./response-input.cjs')(body);
        if (body.instructions.includes("短影片剪輯師"))
          return Response.json({
            output_text: JSON.stringify({
              clips: [{ title: "測試選段", start: 1, end: 4 }],
            }),
          });
        return Response.json({
          output_text: input.cues
            ? JSON.stringify({
                cues: input.cues.map((c) => ({
                  id: c.id,
                  text: "Translated: " + c.text,
                })),
              })
            : "[Verse]\nOriginal fixture lyric\n[Chorus]\nA new day begins",
        });
      }
      throw Error("Unexpected provider request: " + url);
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    p.setDefaultTimeout(10000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(base + "/")
        ? r.continue()
        : r.abort(),
    );
    await p.goto(base + "/pages/tools.html");
    await p.waitForFunction(() => SeedStar.tools?.acceptAsset);
    const asset = {
      id: "test-video",
      name: "測試影片",
      url: "/generated/" + name,
      type: "video/mp4",
      kind: "video",
      duration: 6,
      width: 320,
      height: 180,
    };
    const open = (tool, settings, image) =>
      p.evaluate(
        ({ tool, settings, asset }) =>
          SeedStar.tools.acceptAsset({ tool, settings, asset }),
        { tool, settings, asset: image || asset },
      );
    const waitJob = async () => {
      await p.waitForFunction(
        () =>
          document
            .querySelector(".job-view")
            ?.textContent.includes("succeeded") ||
          document.querySelector(".job-view")?.textContent.includes("failed"),
        null,
        { timeout: 30000 },
      );
      const panel = p.locator(".job-view");
      assert(
        !(await panel.innerText()).includes("failed"),
        await panel.innerText(),
      );
      const url = await panel
        .locator("video,audio,img")
        .first()
        .getAttribute("src");
      assert((await fetch(base + url)).ok);
      await panel.locator("[data-job-close]").click();
      return url;
    };
    await open("short");
    assert.equal(await p.locator('[data-flow-choice="shortMode"]').count(), 2);
    await p
      .locator('[data-flow-choice="shortMode"][data-flow-value="一支精華"]')
      .click();
    assert(await p.getByLabel("精華長度").isVisible());
    await p
      .locator('[data-flow-choice="shortPick"][data-flow-value="依我的指令"]')
      .click();
    await p.locator('[data-flow-action="short-preset:產品亮點"]').click();
    assert.match(await p.getByLabel("剪輯指令").inputValue(), /產品/);
    await open("enhance");
    assert.equal(
      await p.locator('[data-flow-choice="enhanceOption"]').count(),
      5,
    );
    await p
      .locator('[data-flow-choice="enhanceType"][data-flow-value="畫面"]')
      .click();
    assert.equal(
      await p.locator('[data-flow-choice="enhanceOption"]').count(),
      4,
    );
    await p
      .locator(
        '[data-flow-choice="enhanceOption"][data-flow-value="AI 大模型增強"]',
      )
      .click();
    assert(await p.getByLabel("輸出解析度").isVisible());
    await open("depth");
    await p.locator('[data-key="depthEnd"]').fill("5");
    await p.locator('[data-act="home"]').click();
    await p.locator('[data-act="open:depth"]').click();
    assert.equal(await p.locator('[data-key="depthEnd"]').inputValue(), "5");
    console.log("PASS 素材後短影音分支、影音增強模式、深度片段設定與草稿");
    await open("follow", { followStart: 0, followEnd: 5, followCenter: 75, followMode: "固定位置" });
    await p.locator('[data-flow-action="follow-export"]').click();
    const cropped = await waitJob();
    const probe = spawnSync(
      ffmpeg,
      ["-i", path.join(dataDir, cropped.slice(1))],
      { encoding: "utf8", windowsHide: true },
    );
    assert.match(probe.stderr, /720x1280/);
    assert.match(probe.stderr, /Duration: 00:00:05/);
    console.log("PASS 手動 9:16 定位實際輸出 720×1280／5 秒，未呼叫 AI");
    await open("subtitle", {
      subtitleText:
        "1\n00:00:00,000 --> 00:00:02,000\n第一行\n\n2\n00:00:02,000 --> 00:00:04,000\n第二行",
    });
    await p.locator('[data-subtitle-text="0"]').fill("修正第一行");
    await p.locator('[data-subtitle-shift="1"][data-delta="0.1"]').click();
    assert.equal(
      await p.locator('[data-subtitle-start="1"]').inputValue(),
      "00:02.100",
    );
    await p
      .locator('[data-flow-choice="subtitleTab"][data-flow-value="翻譯"]')
      .click();
    await p.locator('[data-flow-action="subtitle-translate:English"]').click();
    await p.waitForFunction(() => !!values.subtitleTranslations?.English);
    assert.equal(
      await p.locator('[data-key="subtitleFirstLine"]').inputValue(),
      "English",
    );
    await p
      .locator('[data-flow-choice="subtitleTab"][data-flow-value="樣式"]')
      .click();
    await p
      .locator(
        '[data-flow-choice="subtitleStyle"][data-flow-value="半透明底框"]',
      )
      .click();
    await p.locator('[data-flow-action="subtitle-burn"]').click();
    const burned = await waitJob();
    const burnProbe = spawnSync(
      ffmpeg,
      ["-i", path.join(dataDir, burned.slice(1))],
      { encoding: "utf8", windowsHide: true },
    );
    assert.match(burnProbe.stderr, /320x180/);
    console.log(
      "PASS 字幕逐行文字／時間、真正翻譯 API、樣式與本機燒錄，保留影片尺寸",
    );
    await open("voice", {
      voiceMode: "純聲音",
      voiceScriptMode: "台詞",
      voiceText: "測試配音",
      voiceSpeed: 1.25,
      voicePitch: 2,
      voiceGain: -3,
    });
    await p.locator('[data-flow-action="voice-generate"]').click();
    const voiceUrl = await waitJob();
    assert.equal(
      JSON.parse(provider.find((c) => c.url.endsWith("/audio/speech")).body)
        .speed,
      undefined,
    );
    const voiceMeta =
      await require("../backend/media-inspect.cjs").inspectMedia(
        path.join(dataDir, voiceUrl.slice(1)),
      );
    assert(
      voiceMeta.duration > 1.45 && voiceMeta.duration < 1.85,
      "語速應將兩秒音訊縮短到約 1.6 秒",
    );
    await p
      .locator('[data-flow-choice="voiceScriptMode"][data-flow-value="音效"]')
      .click();
    assert(await p.locator('[data-flow-action="voice-generate"]').isDisabled());
    console.log(
      "PASS 配音語速／音調／音量實際後製，驗證時長；未接音效不冒充 TTS",
    );
    await open("music");
    await p
      .locator('[data-flow-choice="musicMode"][data-flow-value="自訂配置"]')
      .click();
    await p.locator('[data-flow-action="music-bpm:128"]').click();
    assert.match(
      await p.locator("[data-music-compiled]").innerText(),
      /128 BPM/,
    );
    await p.locator('[data-flow-action="music-lyrics-assist"]').click();
    await p.getByLabel("想寫什麼樣的歌？").fill("清晨出發的原創歌曲");
    await p.locator('[data-flow-action="music-lyrics-generate"]').click();
    await p.waitForFunction(() => values.musicLyrics?.includes("[Verse]"));
    assert(await p.locator('[data-flow-action="music-generate"]').isDisabled());
    console.log("PASS 音樂自訂配置編譯、原創歌詞 API；未接音樂模型明示停用");
    await open("short", {
      shortMode: "多支短影音",
      subtitleText: "1\n00:00:01,000 --> 00:00:04,000\nShort clip caption\n",
      shortCaption: true,
    });
    await p.locator('[data-flow-action="short-analyze"]').click();
    await p.waitForSelector('[data-short-field="start"]');
    assert.equal(
      await p.locator('[data-short-field="start"]').inputValue(),
      "1",
    );
    await p.locator('[data-flow-action="short-export"]').click();
    const short = await waitJob();
    const shortProbe = spawnSync(
      ffmpeg,
      ["-i", path.join(dataDir, short.slice(1))],
      { encoding: "utf8", windowsHide: true },
    );
    assert.match(shortProbe.stderr, /720x1280/);
    assert.match(shortProbe.stderr, /00:00:03/);
    console.log("PASS 短影音字幕分析、人工校對、真正 9:16 裁切與字幕匯出");
    await open("short", { shortMode: "多支短影音", shortCaption: false });
    await p.locator('[data-flow-action="short-analyze"]').click();
    await p.waitForSelector('[data-short-field="start"]');
    assert(provider.some((c) => c.url.endsWith("/audio/transcriptions")));
    await open("short", { shortMode: "多支短影音", shortCaption: false });
    await p.locator('[data-flow-action="short-add"]').click();
    await p.locator('[data-flow-action="short-export"]').click();
    await waitJob();
    console.log("PASS 無字幕時先辨識，以及不附字幕的手動選段匯出");
    await open("cta", { ctaText: "TEST CTA", 出現: 1, 消失: 4 });
    await p.waitForSelector("[data-overlay-mark] img[src]");
    for (const style of [
      "紅色膠囊",
      "橘色漸層",
      "白底黑字",
      "黃底黑字",
      "白色外框",
      "半透明",
      "青色方角",
    ])
      await p.locator('[data-flow-action="cta-style:' + style + '"]').click();
    await p.locator('[data-overlay-position="8"]').click();
    assert.equal(await p.evaluate(() => values["水平位置"]), 100);
    const mark = p.locator("[data-overlay-mark]");
    await mark.focus();
    await mark.press("ArrowLeft");
    assert.equal(await p.evaluate(() => values["水平位置"]), 99);
    const alpha = await p.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 5;
      canvas.height = 5;
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, 5, 5);
      context.fillStyle = "red";
      context.fillRect(1, 1, 3, 3);
      context.fillStyle = "white";
      context.fillRect(2, 2, 1, 1);
      toolRemoveWhite(canvas, 30, false);
      const a = context.getImageData(0, 0, 5, 5).data;
      return [a[3], a[(2 * 5 + 2) * 4 + 3], a[(1 * 5 + 1) * 4 + 3]];
    });
    assert.deepEqual(alpha, [0, 255, 255]);
    await p.locator('[data-flow-action="overlay-export"]').click();
    const cta = await waitJob();
    const ctaProbe = spawnSync(
      ffmpeg,
      ["-i", path.join(dataDir, cta.slice(1))],
      { encoding: "utf8", windowsHide: true },
    );
    assert.match(ctaProbe.stderr, /320x180/);
    console.log(
      "PASS CTA 七種預設、九宮格與鍵盤位置、免費去白底透明像素及本機合成",
    );
    await open(
      "region",
      {},
      { name: "圖片測試", url: "/assets/image-1.png", type: "image/png" },
    );
    await p.locator('[data-key="regionPrompt"]').fill("整體光線柔和一些");
    await p.locator('[data-act="submit"]').click();
    await waitJob();
    assert(provider.some((c) => c.url.endsWith("/images/edits")));
    console.log("PASS 零框選的整體圖片編輯，真實遮罩／圖片 API 契約");
    assert.deepEqual(errors, []);
    console.log("EVIDENCE " + evidence);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
