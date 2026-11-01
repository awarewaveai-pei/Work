const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  { spawnSync } = require("node:child_process");
const { createServer } = require("../server.cjs");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seedstar-backend-")),
    png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=",
      "base64",
    );
  let calls = [];
  let downloads = 0;
  const server = createServer({
    dataDir: dir,
    env: { OPENAI_API_KEY: "test-only" },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: options.body });
      if (url.endsWith("/responses"))
        return Response.json({
          output: [
            { content: [{ type: "output_text", text: "真實形狀的測試腳本" }] },
          ],
        });
      if (url.endsWith("/images/generations") || url.endsWith("/images/edits"))
        return Response.json({ data: [{ b64_json: png.toString("base64") }] });
      if (url.endsWith("/audio/speech"))
        return new Response(Buffer.from("test-audio"));
      if (url.endsWith("/audio/transcriptions"))
        return new Response("1\n00:00:00,000 --> 00:00:00,500\n你好\n");
      if (url.endsWith("/videos"))
        return Response.json({
          id: "video_fixture",
          status: "queued",
          progress: 0,
        });
      if (url.endsWith("/videos/video_fixture/content"))
        return ++downloads === 1
          ? Response.json({ error: { message: "temporary" } }, { status: 503 })
          : new Response(Buffer.from("test-video"));
      if (url.endsWith("/videos/video_fixture"))
        return Response.json({
          id: "video_fixture",
          status: "completed",
          progress: 100,
        });
      throw Error("未預期的網路請求：" + url);
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const post = async (route, data) => {
    const r = await fetch(base + "/api/seedstar" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const value = await r.json();
    assert(r.ok, JSON.stringify(value));
    return value;
  };
  const poll = async (job) => {
    for (let i = 0; i < 100; i++) {
      const r = await fetch(base + "/api/seedstar/generations/" + job.id);
      const v = await r.json();
      if (["succeeded", "failed", "cancelled"].includes(v.status)) return v;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("任務逾時");
  };
  try {
    const script = await post("/director/script", { prompt: "測試主題" });
    assert.equal(script.script, "真實形狀的測試腳本");
    let job = await poll(
      await post("/generations", { type: "image", prompt: "一顆球" }),
    );
    assert.equal(job.status, "succeeded");
    assert(fs.readFileSync(path.join(dir, job.result.url)).equals(png));
    console.log("PASS 腳本與圖片後端契約、成果實體保存");
    const audio = await poll(
      await post("/generations", { type: "audio", prompt: "你好" }),
    );
    assert.equal(audio.status, "succeeded");
    assert(calls.some((c) => c.url.endsWith("/audio/speech")));
    const video = await poll(
      await post("/generations", {
        type: "video",
        prompt: "海面日出",
        duration: 4,
      }),
    );
    assert.equal(video.status, "succeeded");
    assert(video.result?.url);
    assert.equal(downloads, 2);
    assert.equal((await fetch(base + video.result.url)).status, 200);
    console.log("PASS 配音與影片契約；下載503後可重試，外部資料目錄成果可下載");
    const queued = await post("/generations", {
      type: "video",
      prompt: "併發輪詢",
      duration: 4,
    });
    await new Promise((r) => setTimeout(r, 30));
    const beforeDownloads = downloads;
    const batch = await Promise.all(
      Array.from({ length: 12 }, () =>
        fetch(base + "/api/seedstar/generations/" + queued.id).then((r) =>
          r.json(),
        ),
      ),
    );
    assert(batch.every((j) => j.status === "succeeded"));
    assert.equal(downloads - beforeDownloads, 1);
    console.log("PASS 併發輪詢只下載一次影片");
    const masked = await poll(
      await post("/generations", {
        type: "image",
        operation: "region",
        prompt: "區域變紅",
        references: {
          images: [{ url: "data:image/png;base64," + png.toString("base64") }],
        },
        mask: "data:image/png;base64," + png.toString("base64"),
      }),
    );
    assert.equal(masked.status, "succeeded");
    assert.match(masked.input.mask, /^\/generated\//);
    assert(
      !fs.readFileSync(path.join(dir, "jobs.json"), "utf8").includes("base64"),
    );
    const edit = calls.find(
      (c) => c.body instanceof FormData && c.body.has("mask"),
    );
    assert(edit);
    console.log("PASS 遮罩送入圖片編輯，帳本不保存 base64");
    const fixture = path.join(dir, "source.mp4");
    const made = spawnSync(
      require("ffmpeg-static"),
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=64x64:d=0.6",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.6",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        fixture,
      ],
      { windowsHide: true },
    );
    assert.equal(made.status, 0, made.stderr?.toString().slice(-500));
    const source = await post("/uploads", {
      name: "source.mp4",
      data:
        "data:video/mp4;base64," + fs.readFileSync(fixture).toString("base64"),
    });
    const before = calls.length;
    const extracted = await poll(
      await post("/generations", {
        type: "video",
        operation: "separate",
        references: { src: source },
      }),
    );
    assert.equal(extracted.status, "succeeded", extracted.error);
    assert.equal(extracted.type, "audio");
    assert(fs.statSync(path.join(dir, extracted.result.url)).size > 1000);
    const trimmed = await poll(
      await post("/generations", {
        type: "video",
        operation: "edit",
        references: { src: source },
        settings: { trimStart: 0, trimEnd: 0.3 },
      }),
    );
    assert.equal(trimmed.status, "succeeded", trimmed.error);
    assert.equal(calls.length, before);
    console.log("PASS 真實影片音軌擷取與片段裁切，沒有呼叫 AI");
    const mark = await post("/uploads", {
      name: "mark.png",
      data: "data:image/png;base64," + png.toString("base64"),
    });
    for (const operation of ["watermark", "cta", "enhance", "upscale"]) {
      const done = await poll(
        await post("/generations", {
          type: "video",
          operation,
          references: { src: source, png: mark, ctaImage: mark },
          settings: { overlayWidth: 16 },
        }),
      );
      assert.equal(done.status, "succeeded", operation + ": " + done.error);
      assert((await fetch(base + done.result.url)).ok);
    }
    console.log("PASS 浮水印、CTA、音訊處理與解析度調整產生可下載新影片");
    const transcription = await post("/transcriptions", { source });
    assert.match(transcription.srt, /00:00:00,500/);
    console.log("PASS 語音辨識 multipart 契約");
    const malformed = await new Promise((resolve, reject) => {
      http
        .get(base, { path: "//[" }, (r) => {
          r.resume();
          r.on("end", () => resolve(r.statusCode));
        })
        .on("error", reject);
    });
    assert.equal(malformed, 400);
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal((await fetch(base + "/.data/jobs.json")).status, 404);
    console.log("PASS 無效網址不會中止服務；任務資料不公開");
    const foreign = await fetch(base + "/api/seedstar/uploads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.invalid",
      },
      body: "{}",
    });
    assert.equal(foreign.status, 403);
    const fileCount = fs.readdirSync(path.join(dir, "generated")).length;
    const invalid = await fetch(base + "/api/seedstar/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "video",
        prompt: "test",
        duration: 30,
        references: {
          images: [{ url: "data:image/png;base64," + png.toString("base64") }],
        },
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(fs.readdirSync(path.join(dir, "generated")).length, fileCount);
    console.log("PASS 跨來源拒絕及不支援參數拒絕");
  } finally {
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
