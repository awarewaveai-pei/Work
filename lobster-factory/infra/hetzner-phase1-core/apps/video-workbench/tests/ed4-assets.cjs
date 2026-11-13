// Card ED.4 (docs/editor-parity-spec-20261106.md §1.3 素材): three tabs, search, kind filter, 已使用／未使用 groups,
// card add (click / Enter) to the main track end, favourites as a user preference, 拆出音軌, track-＋ banner.
// Real browser, isolated data dir.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pass = (m) => console.log("PASS " + m);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed4-")),
    mp4 = path.join(dir, "clip.mp4"),
    png = path.join(dir, "still.png"),
    wav = path.join(dir, "tone.wav"),
    mute = path.join(dir, "mute.mp4"),
    alpha = path.join(dir, "alpha.mov");
  for (const args of [
    ["-f", "lavfi", "-i", "color=blue:s=320x180:r=24:d=2", "-f", "lavfi", "-i", "sine=d=2", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", mp4],
    ["-f", "lavfi", "-i", "color=red:s=64x36", "-frames:v", "1", png],
    ["-f", "lavfi", "-i", "sine=d=1", wav],
    ["-f", "lavfi", "-i", "color=green:s=320x180:r=24:d=1", "-c:v", "libx264", "-preset", "ultrafast", mute],
    // A see-through video with sound (PNG-in-MOV keeps alpha): the store plays it through proxy.webm.
    ["-f", "lavfi", "-i", "color=c=red@0.5:s=320x180:r=24:d=2,format=rgba", "-f", "lavfi", "-i", "sine=frequency=500:d=2", "-shortest", "-c:v", "png", "-pix_fmt", "rgba", "-c:a", "aac", alpha],
  ]) {
    const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], { windowsHide: true, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  const server = require("../server.cjs").createServer({ dataDir: path.join(dir, "data"), env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    const pane = page.locator(".editor-library");
    assert.equal(await pane.getByRole("tab").count(), 3);
    assert.match(await pane.innerText(), /無符合條件的素材/);
    assert.equal(await pane.locator("[data-rights-confirmed]").count(), 1);
    assert.match(await pane.getByRole("tab", { name: /本次上傳/ }).innerText(), /本次上傳 \(0\)/);

    // 上傳素材: files land in 本次上傳 (n) and are not added to the timeline.
    const chooser = page.waitForEvent("filechooser");
    await pane.getByRole("button", { name: "上傳素材", exact: true }).click();
    await (await chooser).setFiles([mp4, png, wav]);
    await page.waitForFunction(() => document.querySelectorAll("[data-ed-asset]").length === 3);
    assert.match(await pane.getByRole("tab", { name: /本次上傳/ }).innerText(), /本次上傳 \(3\)/);
    assert.equal(await page.evaluate(() => edProject().clips.length), 0);
    await pane.getByRole("tab", { name: "我的素材庫" }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 3);
    assert.match(await pane.innerText(), /未使用（3）/);
    assert.doesNotMatch(await pane.innerText(), /已使用/);
    pass("三分頁、上傳只進「本次上傳 (3)」不動時間軸、未使用（3）、權利確認勾選");

    // Card text: still 靜圖, video length, resolution, only the video has 拆出音軌.
    const card = (name) => page.locator("[data-ed-asset]", { has: page.locator(`[aria-label^="${name}，"]`) });
    assert.match(await card("still.png").innerText(), /靜圖/);
    await page.waitForFunction(() => /00:02/.test(document.querySelector(".editor-library").innerText) && /320×180/.test(document.querySelector(".editor-library").innerText));
    assert.equal(await card("clip.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).count(), 1);
    assert.equal(await card("still.png").getByRole("button", { name: /拆出/ }).count(), 0);
    assert.equal(await card("tone.wav").getByRole("button", { name: /拆出/ }).count(), 0);

    // Search keeps focus while typing; the kind buttons filter.
    const search = pane.getByLabel("搜尋素材名稱");
    await search.click();
    await page.keyboard.type("clip");
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    assert(await search.evaluate((el) => el === document.activeElement));
    await search.fill("");
    await pane.getByRole("button", { name: "影片", exact: true }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    await pane.getByRole("button", { name: "音訊", exact: true }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    await pane.getByRole("button", { name: "全部", exact: true }).click();
    pass("搜尋不掉焦點、全部／影片／音訊篩選");

    // A single click does nothing; double-click adds to the main track end and selects; Enter adds the next after it.
    const main = (name) => card(name).locator("[data-ed-asset-add]");
    await main("clip.mp4").click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => edProject().clips.length), 0);
    await main("clip.mp4").dblclick();
    await page.waitForFunction(() => edProject().clips.length === 1);
    let s = await page.evaluate(() => ({ track: edProject().clips[0].track, main: edMain(edProject()), sel: ed.selected, id: edProject().clips[0].id }));
    assert.equal(s.track, s.main);
    assert.equal(s.sel, s.id);
    await main("still.png").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => edProject().clips.length === 2);
    s = await page.evaluate(() => {
      const [a, b] = edProject().clips;
      return { aEnd: a.start + a.duration, bStart: b.start, sel: ed.selected === b.id };
    });
    assert(Math.abs(s.aEnd - s.bStart) < 0.05 && s.sel);
    assert.match(await pane.innerText(), /已使用（2）/);
    assert.match(await pane.innerText(), /未使用（1）/);
    assert.match(await card("clip.mp4").innerText(), /已用 × 1/);
    await card("still.png").getByRole("button", { name: /^加入 / }).click();
    await page.waitForFunction(() => edProject().clips.length === 3);
    assert.match(await card("still.png").innerText(), /已用 × 2/);
    // The group folds.
    await pane.locator('[data-ed-action="assets-fold:used"]').click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    await pane.locator('[data-ed-action="assets-fold:used"]').click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 3);
    pass("單擊不加；雙擊／Enter／＋ 加到主視訊末端並選取；已用 × n；已使用／未使用兩組可收合");

    // 收藏: a user preference that survives a reload; the asset record is untouched.
    const before = await page.evaluate(() => VideoWorkbench.assets.list().then((r) => JSON.stringify(r)));
    await card("tone.wav").getByRole("button", { name: "加入最愛" }).click();
    await pane.getByRole("tab", { name: "收藏" }).click();
    assert.equal(await page.locator("[data-ed-asset]").count(), 1);
    assert.deepEqual(await page.evaluate(() => VideoWorkbench.preferences.get("tools.editor.assetFavorites")), [await page.evaluate(() => edAssets.items.find((a) => a.name === "tone.wav").id)]);
    assert.equal(await page.evaluate(() => VideoWorkbench.assets.list().then((r) => JSON.stringify(r))), before);
    await page.reload();
    await page.waitForSelector("[data-ed-stage]").catch(() => {});
    if (!(await page.locator("[data-ed-stage]").count())) {
      await page.getByRole("button", { name: /未命名剪輯專案/ }).first().click();
      await page.waitForSelector("[data-ed-stage]");
    }
    await pane.getByRole("tab", { name: "收藏" }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-ed-asset]").length === 1);
    assert.match(await pane.getByRole("tab", { name: /本次上傳/ }).innerText(), /本次上傳 \(3\)/);
    await pane.getByRole("button", { name: "移除最愛" }).click();
    await page.waitForFunction(() => /無符合條件的素材/.test(document.querySelector(".editor-library").innerText));
    pass("收藏存在使用者偏好、重開仍在、素材資料不變；本次上傳重新整理後仍在");

    // 拆出音軌: a new audio asset in 本次上傳 (same file, same origin), nothing on the timeline; twice = still one.
    await pane.getByRole("tab", { name: "我的素材庫" }).click();
    const clipsBefore = await page.evaluate(() => edProject().clips.length);
    await card("clip.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    await page.waitForFunction(() => /本次上傳 \(4\)/.test(document.querySelector(".editor-library").innerText));
    await card("clip.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    const sound = await page.evaluate(async () => {
      const rows = await VideoWorkbench.assets.list(),
        v = rows.find((a) => a.name === "clip.mp4");
      return { n: rows.filter((a) => a.name === "clip.mp4（音軌）").length, a: rows.find((a) => a.name === "clip.mp4（音軌）"), v };
    });
    assert.equal(sound.n, 1);
    assert.equal(sound.a.kind, "audio");
    assert.equal(sound.a.url, sound.v.url);
    assert.deepEqual(sound.a.origin, sound.v.origin);
    assert.equal(await page.evaluate(() => edProject().clips.length), clipsBefore);
    await pane.getByRole("tab", { name: /本次上傳/ }).click();
    assert.equal(await card("clip.mp4（音軌）").count(), 1);
    await card("clip.mp4（音軌）").getByRole("button", { name: /^加入 / }).click();
    await page.waitForFunction(() => edProject().clips.some((c) => c.asset?.name === "clip.mp4（音軌）" && edTrack(edProject(), c.track).kind === "audio"));
    await pane.getByRole("tab", { name: "我的素材庫" }).click();
    pass("拆出音軌：另存音訊素材進「本次上傳」、不動時間軸、重按不重複；＋ 加到音訊軌");
    // Codex b0a0544c F2: a renamed extracted asset keeps its name on the next 拆出音軌.
    await page.evaluate(async () => {
      const x = (await VideoWorkbench.assets.list()).find((a) => a.name === "clip.mp4（音軌）");
      await VideoWorkbench.assets.save({ ...x, name: "旁白底" });
      await edAssetsLoad();
    });
    await card("clip.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(async () => (await VideoWorkbench.assets.list()).filter((a) => a.id.endsWith("#audio")).map((a) => a.name).join()), "旁白底");
    // F3: an asset deleted elsewhere leaves 本次上傳 and its count.
    await page.evaluate(async () => {
      await VideoWorkbench.assets.remove((await VideoWorkbench.assets.list()).find((a) => a.name === "旁白底").id);
      await edAssetsLoad();
    });
    await page.waitForFunction(() => /本次上傳 \(3\)/.test(document.querySelector(".editor-library").innerText));
    // Codex a6fadddd F1: a video without sound is not split (its audio clip would fail the export).
    await page.evaluate(async (b64) => {
      await VideoWorkbench.uploadAsset(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "mute.mp4", { type: "video/mp4" }));
      await edAssetsLoad();
    }, fs.readFileSync(mute).toString("base64"));
    await card("mute.mp4").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    await page.getByText("這支影片沒有聲音，無法拆出音軌").waitFor();
    assert.equal(await page.evaluate(async () => (await VideoWorkbench.assets.list()).some((a) => a.name === "mute.mp4（音軌）")), false);
    // Invariant (preview sound = original sound): a see-through video with sound plays proxy.webm (VP9 alpha + Opus), so it
    // splits, and the preview it plays decodes sound.
    const alphaAsset = await page.evaluate(async (b64) => {
      const a = await VideoWorkbench.uploadAsset(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "alpha.mov", { type: "video/quicktime" }));
      await edAssetsLoad();
      return a;
    }, fs.readFileSync(alpha).toString("base64"));
    assert.match(alphaAsset.previewUrl, /\/proxy\.webm$/);
    const proxyInfo = await require("../backend/media-inspect.cjs").inspectMedia(path.join(dir, "data", alphaAsset.previewUrl.slice(1)));
    assert.equal(proxyInfo.audio, true, "透明影片的 proxy.webm 有音軌");
    await card("alpha.mov").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    await page.waitForFunction((id) => VideoWorkbench.assets.list().then((rows) => rows.some((x) => x.id === id + "#audio")), alphaAsset.id);
    const decoded = await page.evaluate(async (url) => {
      const v = document.createElement("video");
      v.muted = true;
      v.src = url;
      await v.play();
      await new Promise((r) => setTimeout(r, 1200));
      v.pause();
      return v.webkitAudioDecodedByteCount;
    }, alphaAsset.previewUrl);
    assert(decoded > 0, "預覽檔播得出聲音（解出 " + decoded + " bytes 音訊）");
    // Codex 1b6ebf9a F1: an old silent alpha preview (made before its sound was kept, not yet backfilled) is not split.
    const oldDir = path.join(dir, "data", "media", "a".repeat(64));
    fs.mkdirSync(oldDir, { recursive: true });
    const cut = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", path.join(dir, "data", alphaAsset.previewUrl.slice(1)), "-map", "0:v:0", "-c:v", "copy", "-an", path.join(oldDir, "proxy.webm")], { windowsHide: true, encoding: "utf8" });
    assert.equal(cut.status, 0, cut.stderr);
    await page.evaluate(async (a) => {
      await VideoWorkbench.assets.save({ ...a, id: "alpha-old", name: "old-alpha.mov", previewUrl: "/media/" + "a".repeat(64) + "/proxy.webm" });
      await edAssetsLoad();
    }, alphaAsset);
    await card("old-alpha.mov").getByRole("button", { name: /拆出 .* 的音軌/ }).click();
    await page.getByText("透明影片的預覽檔還沒補上聲音，補齊後才能拆出音軌").waitFor();
    assert.equal(await page.evaluate(async () => (await VideoWorkbench.assets.list()).some((x) => x.id === "alpha-old#audio")), false);
    pass("拆出音軌不覆蓋改過名的音軌；已刪素材離開「本次上傳」與數量；無聲影片不拆；有聲透明影片的 proxy.webm 有音軌、可拆、播放時解得出聲音；舊的無聲透明預覽不拆");

    // From a track's ＋: banner on top, 取消 clears it, the pick goes to that track.
    await page.locator('[data-ed-track="A2"]').getByRole("button", { name: "加入素材到「配樂 A2」", exact: true }).click();
    assert.match(await pane.innerText(), /選一個素材加入「配樂 A2」/);
    await pane.getByRole("button", { name: "取消", exact: true }).click();
    assert.doesNotMatch(await pane.innerText(), /選一個素材加入/);
    await page.locator('[data-ed-track="A2"]').getByRole("button", { name: "加入素材到「配樂 A2」", exact: true }).click();
    await main("tone.wav").dblclick();
    await page.waitForFunction(() => edProject().clips.some((c) => c.track === "A2"));
    assert.doesNotMatch(await pane.innerText(), /選一個素材加入/);
    await page.locator('[data-ed-track="A2"]').getByRole("button", { name: "加入素材到「配樂 A2」", exact: true }).click();
    await card("still.png").getByRole("button", { name: /^加入 / }).click();
    assert.equal(await page.evaluate(() => edProject().clips.filter((c) => c.kind === "image").length), 2, "圖片不能放進音訊軌");
    // A second video track: its ＋ target gets the still, not the main track; an upload from the pane goes there too.
    await page.getByRole("button", { name: "新增影片軌", exact: true }).click();
    const v2 = await page.evaluate(() => edProject().tracks.filter((t) => t.kind === "video").at(-1).id);
    assert.notEqual(v2, await page.evaluate(() => edMain(edProject())));
    await page.locator(`[data-ed-track="${v2}"]`).getByRole("button", { name: /^加入素材到/ }).click();
    assert.match(await pane.innerText(), new RegExp("選一個素材加入「疊加 " + v2 + "」"));
    await card("still.png").getByRole("button", { name: /^加入 / }).click();
    await page.waitForFunction((id) => edProject().clips.some((c) => c.track === id), v2);
    // Codex: the target is dropped when another project opens.
    await page.locator(`[data-ed-track="${v2}"]`).getByRole("button", { name: /^加入素材到/ }).click();
    await page.evaluate(() => { edAssets.pickTrack.project = "other"; edRedraw(); });
    assert.doesNotMatch(await pane.innerText(), /選一個素材加入/);
    // F1: a track name is user text; the card label shows it as text, never as markup.
    await page.evaluate((id) => {
      edProject().tracks.find((t) => t.id === id).name = '"><img src=x data-ed4-xss>';
      edAssetsPickTrack(id);
    }, v2);
    await search.fill("clip");
    assert.equal(await page.locator("[data-ed4-xss]").count(), 0);
    assert.match(await card("clip.mp4").locator("[data-ed-asset-add]").getAttribute("aria-label"), /<img src=x data-ed4-xss>/);
    await search.fill("");
    pass("軌道＋：頂部「選一個素材加入『…』 取消」、取消、加到該軌、種類不符不加");
    // 音訊／貼圖 panes still reach library:/upload: with a kind (Codex finding 2).
    const imageChooser = page.waitForEvent("filechooser");
    await page.evaluate(() => edAction("upload:image"));
    assert.equal(await (await imageChooser).element().getAttribute("accept"), "image/*");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
