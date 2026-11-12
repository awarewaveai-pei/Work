// Card PJ.3 (docs/pj-project-spine-spec-20261106.md §2 PJ.3): an episode's shots and lines go onto its edit file.
// 1 three shots (picture, video, none) -> two main-track clips of shot.seconds, each with its slot;
// 2 a clip the user added survives a second 排成時間軸; 3 two lines -> two text clips timed as their shots;
// 4 edPlaceSpine twice places the settled voice-over once; 5 /director/shots passes the model's line through.
// The text model is a fake; no generation is sent (a POST /generations fails the test).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  { isolatedServer } = require("./isolated-server.cjs"),
  ProjectEnvelope = require("../shared/project-envelope.js");
const STORE = "awarewave-projects-screenshot-frontend-v1";

(async () => {
  const { base, dataDir } = await isolatedServer("vw-pj3-", {
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.match(JSON.parse(options.body).instructions, /line（繁體中文/);
      return Response.json({ output_text: JSON.stringify({ shots: [{ text: "清晨廚房", seconds: 6, line: "早上五分鐘，熱到下班。" }, { text: "捷運車廂", seconds: 4 }] }) });
    },
  });
  const res = await fetch(base + "/api/vw/director/shots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outline: "保溫杯", count: 2 }) });
  assert.equal(res.status, 200);
  const { shots: made } = await res.json();
  assert.deepEqual(made.map((s) => s.line), ["早上五分鐘，熱到下班。", ""]);
  console.log("PASS 5 /director/shots 假模型回 line → 鏡頭有 line（沒寫的是空字串）");

  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const file = (ext, args) => {
    const name = crypto.randomUUID() + "." + ext,
      r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, path.join(generated, name)], { encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    return "/generated/" + name;
  };
  const picture = file("png", ["-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1"]),
    video = file("mp4", ["-f", "lavfi", "-i", "color=c=blue:s=64x64:r=30:d=8", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]),
    voice = file("mp3", ["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame"]);

  const browser = await chromium.launch({ channel: "msedge", headless: true }),
    errors = [],
    paid = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => {
      if (r.request().method() === "POST" && /\/api\/vw\/generations$/.test(new URL(r.request().url()).pathname)) {
        paid.push(r.request().url());
        return r.abort();
      }
      return r.request().url().startsWith(base + "/") ? r.continue() : r.abort();
    });
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    await openMain();
    const episode = {
      id: "ep-pj3", name: "保溫杯 30 秒", outline: "",
      shots: [
        { id: "s1", text: "倒熱水", seconds: 4, line: "早上五分鐘，熱到下班。", image: picture },
        { id: "s2", text: "放進包包", seconds: 10, line: "側袋放得下，不怕漏。", video }, // the video is 8 s: shorter than its slot
        { id: "s3", text: "還沒生成", seconds: 3, line: "沒畫面的這句不上字幕。" },
        { id: "s4", text: "結尾", seconds: 2, image: picture },
      ],
      edit: { engine: "workbench-editor", projectId: "ed-pj3" },
      steps: [{ id: "j-v1", step: "sound", tool: "voice", jobId: "j-v1", from: [{ slot: "line:s1", key: "早上五分鐘，熱到下班。" }], sources: [], settings: {}, target: "line:s1", output: { url: voice, assetId: "job-j-v1", kind: "audio" }, at: "2026-11-10T02:10:00Z" }],
      outputs: [],
    };
    const row = ProjectEnvelope.wrap({ id: "ed-pj3", title: "保溫杯 30 秒", ratio: "9:16", clips: [], assets: [], markers: [], output: {} }, { revision: 0 });
    await p.evaluate(async ({ STORE, episode, row }) => {
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: "proj-pj3", episode: 0, projects: [{ id: "proj-pj3", title: "保溫杯", type: "single", ratio: "9:16", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] }, episodes: [episode] }] }));
      await VideoWorkbench.preferences.set("tools.editor.projects", [row]);
      await VideoWorkbench.flush();
    }, { STORE, episode, row });
    await openMain();
    // The projects page's step 6 opens the file and arranges it (intent "arrange"); step 7 stops at the paid button.
    await p.locator("#projectsNav").click();
    await p.frameLocator("#projectsFrame").locator('[data-step="6"] [data-action="openEdit"]').click();
    const tools = () => p.frames().find((x) => x.url().includes("tools.html"));
    const t = p.frameLocator("#toolsFrame");
    await t.locator('[data-ed-action="spine-arrange"]').waitFor();
    // The paid button carries its price (shared/paid-price.js, NT$ via VideoWorkbenchMoney): expected from the same function.
    await t.locator('[data-ed-action="spine-voice"] .paid-price').waitFor();
    const ttsPrice = await tools().evaluate(() => VideoWorkbenchPrices.text("video.tts"));
    assert.match(ttsPrice, /^(約 )?NT\$\d/, "配音按鈕的價格不是新台幣");
    // One snapshot: a re-render replaces the button and paid-price.js puts the price back on the next frame.
    const voiceLabel = await (await tools().waitForFunction(() => {
      const el = document.querySelector('[data-ed-action="spine-voice"]');
      return el?.querySelector(".paid-price") && el.innerText;
    })).jsonValue();
    assert.equal(voiceLabel, "配音（照旁白逐句）· 2 句 × 每句依 API 用量計費 · " + ttsPrice, "已配過音的第 1 句不該再算錢");
    const arranged = () =>
      tools().evaluate(() => {
        const p = edProject();
        return p.clips.filter((c) => c.track === edMain(p) && c.slot).sort((a, b) => a.startFrame - b.startFrame).map((c) => ({ slot: c.slot, start: c.start, duration: c.duration, kind: c.kind }));
      });
    await tools().waitForFunction(() => edProject()?.clips.some((c) => c.slot));
    assert.deepEqual(await arranged(), [
      { slot: "shot:s1", start: 0, duration: 4, kind: "image" },
      { slot: "shot:s2", start: 4, duration: 8, kind: "video" },
      { slot: "shot:s4", start: 12, duration: 2, kind: "image" },
    ]);
    await p.locator("#projectsNav").click();
    await p.frameLocator("#projectsFrame").locator('[data-step="7"] [data-action="openEdit"]').click();
    await tools().waitForFunction(() => document.activeElement?.dataset.edAction === "spine-voice");
    console.log("PASS 1 四個鏡頭（圖、影片、沒畫面、圖）→ 主軌三段、長度＝seconds（比 seconds 短的影片播自身長度，下一鏡接在後面）、帶 slot（專案頁第 6 步開檔即排；第 7 步只停在付費按鈕）");

    const mine = await tools().evaluate(async (url) => {
      const p = edProject();
      await edAdd({ id: "mine", name: "我自己加的", kind: "image", type: "image/png", url }, edMain(p));
      return ed.selected;
    }, picture);
    // Codex round 2: a copy of an arranged shot clip (edPlace, used by paste and Ctrl+D) is the user's clip too.
    const copy = await tools().evaluate(async () => {
      const p = edProject();
      edCheckpoint();
      edPlace(p, [{ clip: p.clips.find((c) => c.slot === "shot:s1"), offset: 0 }], 30 * 30);
      await edCommit(p);
      return ed.selected;
    });
    assert.equal(await tools().evaluate(() => edArrange(edProject(), edSpineHit(edProject()).episode)), 3);
    assert(await tools().evaluate((id) => edProject().clips.some((c) => c.id === id && !c.slot), copy), "重排刪掉了使用者複製的鏡頭片段");
    const after = await tools().evaluate((id) => edProject().clips.find((c) => c.id === id) && { start: edProject().clips.find((c) => c.id === id).start }, mine);
    assert.deepEqual(after, { start: 14 }, "重排後使用者自己加的片段不見或被移動");
    assert.equal((await arranged()).length, 3);
    console.log("PASS 2 手動加一段、複製一段鏡頭後重排 → 兩段都還在、手動那段位置不變");

    await tools().evaluate(() => edSpineSubtitles(edProject(), edSpineHit(edProject()).episode));
    const subs = await tools().evaluate(() => {
      const p = edProject(),
        shot = (id) => p.clips.find((c) => c.slot === "shot:" + id);
      return p.clips.filter((c) => c.kind === "text" && c.slot).map((c) => ({ slot: c.slot, text: c.text, aligned: c.startFrame === shot(c.slot.slice(5)).startFrame && c.durationFrames === shot(c.slot.slice(5)).durationFrames }));
    });
    assert.deepEqual(subs, [
      { slot: "line:s1", text: "早上五分鐘，熱到下班。", aligned: true },
      { slot: "line:s2", text: "側袋放得下，不怕漏。", aligned: true },
    ]);
    await tools().evaluate(() => edSpineSubtitles(edProject(), edSpineHit(edProject()).episode));
    assert.equal(await tools().evaluate(() => edProject().clips.filter((c) => c.kind === "text" && c.slot).length), 2, "重新產生字幕後舊的沒有移除");
    console.log("PASS 3 字幕：2 句旁白 → 2 個文字片段、起迄與鏡頭片段一致；重做不重複");

    await tools().evaluate(() => Promise.all([edPlaceSpine(), edPlaceSpine()]));
    await tools().evaluate(() => edPlaceSpine());
    const voices = await tools().evaluate(() => {
      const p = edProject();
      return p.clips.filter((c) => c.jobId === "j-v1").map((c) => ({ slot: c.slot, start: c.start, kind: c.kind, onShot: c.startFrame === p.clips.find((x) => x.slot === "shot:s1").startFrame }));
    });
    assert.deepEqual(voices, [{ slot: "line:s1", start: 0, kind: "audio", onShot: true }]);
    const left = await tools().evaluate(async () => {
      const p = edProject();
      p.clips = p.clips.filter((c) => c.jobId !== "j-v1");
      await edCommit(p);
      await edPlaceSpine();
      return p.clips.filter((c) => c.jobId === "j-v1").length;
    });
    assert.equal(left, 0, "使用者刪掉的配音又被放回來");
    // Codex F3: an undone placement stays undone (spinePlaced is not rewound by undo).
    const undone = await tools().evaluate(async () => {
      const p = edProject();
      p.spinePlaced = [];
      await edPlaceSpine();
      await edAction("undo");
      await edPlaceSpine();
      return edProject().clips.filter((c) => c.jobId === "j-v1").length;
    });
    assert.equal(undone, 0, "復原放上的配音後，配音又被放回來");
    // Codex round 3: a re-arrange that moves shot 1 takes its voice-over and subtitle along.
    const moved = await tools().evaluate(async (url) => {
      const p = edProject();
      p.spinePlaced = [];
      await edPlaceSpine();
      const main = edMain(p), shot = () => p.clips.find((c) => c.slot === "shot:s1");
      p.clips = p.clips.filter((c) => !(c.track === main && c.start < 3 && !c.slot));
      const mine = edTime(p, edSpineClip(p, { id: "first", kind: "image", type: "image/png", url, duration: 3 }, main, {}), { start: 0, duration: 3, sourceStart: 0 });
      p.clips.push(mine);
      await edArrange(p, edSpineHit(p).episode);
      const at = (pred) => p.clips.find(pred).startFrame;
      return { shot: shot().startFrame, voice: at((c) => c.jobId === "j-v1"), sub: at((c) => c.kind === "text" && c.slot === "line:s1") };
    }, picture);
    assert(moved.shot > 0, "鏡頭 1 沒有被擠開，測不到");
    assert.deepEqual(moved, { shot: moved.shot, voice: moved.shot, sub: moved.shot }, "重排後配音或字幕留在舊時間");
    console.log("PASS 4 edPlaceSpine 跑兩次（含同時）只放一段配音，起點＝該鏡頭片段起點；刪掉或復原後不再放回；重排後跟著鏡頭走");

    await p.waitForTimeout(300);
    assert.deepEqual(paid, [], "排列、字幕、放配音不該送出任何付費任務");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
